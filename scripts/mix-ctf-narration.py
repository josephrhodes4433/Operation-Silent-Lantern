"""Add section-synchronized narration to the existing CTF screen recordings.

All media and metadata are generated outputs; this script never contacts the
classroom app, reads its credentials, or changes learner data.
"""
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
MEDIA = ROOT / "generated-artifacts/ctf-walkthroughs"
PLAN = json.loads((MEDIA / "narration-plan.json").read_text())
GUIDES = json.loads((ROOT / "generated-artifacts/test-fixtures/answer-guides.json").read_text())


def probe(path):
    return json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_format", "-show_streams", "-show_chapters",
        "-of", "json", str(path),
    ]))


def escape_metadata(value):
    for char in "\\=;#":
        value = value.replace(char, "\\" + char)
    return value.replace("\n", "\\\n")


def render(app, label, guide_key, ids):
    coverage = json.loads((MEDIA / f"{app}-coverage.json").read_text())
    assert [c["questionId"] for c in coverage["chapters"]] == ids
    assert coverage["answeredCount"] == len(ids) and coverage["submittedAt"]
    assert all(c["answer"] and c["status"] in ("correct", "approved", "manual")
               for c in coverage["chapters"])
    source = MEDIA / coverage["videoFile"]
    duration = float(probe(source)["format"]["duration"])
    output = MEDIA / f"{label.replace(' ', '-')}-Narrated-Student-Walkthrough.mp4"
    reuse_video = output.exists()
    video_input = output if reuse_video else source
    segments = [s for s in PLAN["segments"] if s["app"] == app]
    assert segments[0]["id"] == "intro"
    assert all(a["end"] <= b["start"] for a, b in zip(segments, segments[1:]))
    assert segments[-1]["end"] <= duration
    section_names = {e["section"]: e["sectionTitle"] for e in GUIDES[guide_key]["entries"]}
    metadata = MEDIA / f"{app}-narrated-chapters.ffmeta"
    with metadata.open("w") as f:
        f.write(f";FFMETADATA1\ntitle={label} - Narrated Student Walkthrough\n")
        f.write("comment=AI-narrated real website recording using isolated demonstration data. "
                "Evidence values and written examples are illustrative, not verified classroom findings.\n")
        for i, segment in enumerate(segments):
            start = 0 if i == 0 else segment["start"]
            end = segments[i + 1]["start"] if i + 1 < len(segments) else duration
            title = ("Introduction and student check-in" if i == 0
                     else f"{i}. {section_names[i]}")
            f.write(f"[CHAPTER]\nTIMEBASE=1/1000\nSTART={round(start * 1000)}\n")
            f.write(f"END={round(end * 1000)}\ntitle={escape_metadata(title)}\n")

    inputs = ["-i", str(video_input)]
    filters = []
    rendered_segments = []
    for i, segment in enumerate(segments, 1):
        clip = MEDIA / "narration" / segment.get("audioFile", f"{app}-{segment['id']}.mp3")
        seconds = float(probe(clip)["format"]["duration"])
        slot = segment["end"] - segment["start"] - 0.15
        tempo = max(1.0, seconds / slot)
        if tempo > 1.18:
            raise ValueError(f"{clip.name} needs shorter narration: {seconds:.2f}s in {slot:.2f}s")
        spoken_duration = seconds / tempo
        inputs += ["-i", str(clip)]
        filters.append(
            f"[{i}:a]atempo={tempo:.6f},aresample=48000,"
            f"loudnorm=I=-16:TP=-1.5:LRA=9,aresample=48000,"
            f"aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"afade=t=in:d=0.04,afade=t=out:st={max(0, spoken_duration - 0.1):.3f}:d=0.1,"
            f"adelay={round(segment['start'] * 1000)}:all=1[a{i}]"
        )
        rendered_segments.append({
            **segment, "audioFile": str(clip.relative_to(ROOT)),
            "sourceAudioSeconds": round(seconds, 3), "tempo": round(tempo, 6),
            "spokenEnd": round(segment["start"] + spoken_duration, 3),
        })
    filters.append(
        "".join(f"[a{i}]" for i in range(1, len(segments) + 1)) +
        f"amix=inputs={len(segments)}:duration=longest:dropout_transition=0:normalize=0,"
        f"apad,alimiter=limit=0.95:level=false[voice]"
    )
    temporary_output = output.with_name(output.stem + ".rendering.mp4")
    metadata_index = len(segments) + 1
    print(f"Rendering {label}: {len(ids)} questions, {len(segments) - 1} sections, "
          f"{duration:.2f}s", flush=True)
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        *inputs, "-i", str(metadata),
        "-filter_complex", ";".join(filters),
        "-map", "0:v:0", "-map", "[voice]",
        "-map_metadata", str(metadata_index), "-map_chapters", str(metadata_index),
        *(["-c:v", "copy"] if reuse_video else [
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"]),
        "-c:a", "aac", "-b:a", "160k", "-t", f"{duration:.3f}",
        "-movflags", "+faststart", str(temporary_output),
    ], check=True)
    result = probe(temporary_output)
    assert abs(float(result["format"]["duration"]) - duration) < 0.25
    assert any(s["codec_name"] == "h264" for s in result["streams"])
    assert any(s["codec_name"] == "aac" for s in result["streams"])
    assert len(result["chapters"]) == len(segments)
    levels = subprocess.run([
        "ffmpeg", "-hide_banner", "-i", str(temporary_output),
        "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-",
    ], capture_output=True, text=True, check=True).stderr
    peak = float(re.search(r"max_volume:\s*([-\d.]+) dB", levels).group(1))
    assert -45 < peak < 0, f"Final narration must be audible without clipping: peak {peak} dB"
    temporary_output.replace(output)
    manifest = {
        "title": label, "file": str(output.relative_to(ROOT)), "questionCount": len(ids),
        "sectionCount": len(segments) - 1, "durationSeconds": duration,
        "bytes": output.stat().st_size, "narrator": PLAN["voiceDescription"], "peakDb": peak,
        "illustrativeData": True, "segments": rendered_segments,
    }
    (MEDIA / f"{app}-narrated-manifest.json").write_text(json.dumps(manifest, indent=2))
    print(json.dumps({k: v for k, v in manifest.items() if k != "segments"}), flush=True)


if __name__ == "__main__":
    render("iron-meridian", "IRON MERIDIAN", "iron", list(range(1, 121)))
    render("silent-lantern", "SILENT LANTERN", "lantern", list(range(101, 127)))
