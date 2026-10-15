"""Mix section narration into the isolated instructor screen recordings."""
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
MEDIA = ROOT / "generated-artifacts/ctf-walkthroughs"


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def probe(file):
    return json.loads(run("ffprobe", "-v", "error", "-show_format", "-show_streams",
                          "-show_chapters", "-of", "json", str(file)))


def render(prefix, label):
    manifest = json.loads((MEDIA / f"{prefix}-instructor-coverage.json").read_text())
    video = pathlib.Path(manifest["video"])
    chapters = manifest["chapters"]
    duration = 0
    segment_dir = MEDIA / f"{prefix}-instructor-segments"
    segment_dir.mkdir(exist_ok=True)
    segment_list = segment_dir / "concat.txt"
    segments = []
    inputs = ["-f", "concat", "-safe", "0", "-i", str(segment_list)]
    filters = []
    metadata = [";FFMETADATA1", f"title={label} | Instructor Walkthrough",
                "comment=AI narration. Isolated demonstration data; no real student records or email deliveries."]
    subtitles = []
    for i, chapter in enumerate(chapters, 1):
        clip = ROOT / chapter["filePath"]
        spoken = float(probe(clip)["format"]["duration"])
        source_start = manifest["offset"] + chapter["start"]
        source_end = manifest["offset"] + chapter["end"]
        length = max(spoken + 3, source_end - source_start)
        ratio = length / (source_end - source_start)
        start = duration
        end = start + length
        duration = end
        chapter.update(outputStart=start, outputEnd=end)
        # Encode one chapter at a time rather than buffering multiple high-
        # resolution trim branches while the recording browser is still open.
        segment = segment_dir / f"{i}.mp4"
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-ss", str(source_start), "-t", str(source_end - source_start), "-i", str(video),
            "-vf", f"setpts=(PTS-STARTPTS)*{ratio:.6f},fps=25,setsar=1,"
                   f"tpad=stop_mode=clone:stop_duration=1,trim=duration={length:.4f}",
            "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-pix_fmt", "yuv420p", "-threads", "2", str(segment)
        ], check=True)
        segments.append(segment)
        inputs += ["-i", str(clip)]
        filters.append(
            f"[{i}:a]aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=9,"
            "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
            f"afade=t=in:d=0.04,afade=t=out:st={spoken - 0.1:.3f}:d=0.1,"
            f"adelay={round(start * 1000)}:all=1[a{i}]"
        )
        metadata += ["[CHAPTER]", "TIMEBASE=1/1000", f"START={round(start * 1000)}",
                     f"END={round(end * 1000)}", f"title={chapter['title']}"]
        subtitles.append(f"{i}. {chapter['title']}\n\n{chapter['text']}\n")
    segment_list.write_text("".join(f"file '{file}'\n" for file in segments))
    filters.append("".join(f"[a{i}]" for i in range(1, len(chapters) + 1)) +
                   f"amix=inputs={len(chapters)}:duration=longest:dropout_transition=0:normalize=0,"
                   "apad,alimiter=limit=0.95:level=false[voice]")
    meta = MEDIA / f"{prefix}-instructor-chapters.ffmeta"
    meta.write_text("\n".join(metadata) + "\n")
    output = MEDIA / f"{label.replace(' ', '-')}-Narrated-Instructor-Walkthrough.mp4"
    temporary = output.with_suffix(".rendering.mp4")
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *inputs, "-i", str(meta),
        "-filter_complex_threads", "1", "-filter_complex", ";".join(filters),
        "-map", "0:v:0", "-map", "[voice]",
        "-map_metadata", str(len(chapters) + 1), "-map_chapters", str(len(chapters) + 1),
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "160k", "-t", str(duration), "-movflags", "+faststart",
        str(temporary),
    ], check=True)
    result = probe(temporary)
    assert abs(float(result["format"]["duration"]) - duration) < 0.3
    assert {s["codec_name"] for s in result["streams"]} >= {"h264", "aac"}
    assert len(result["chapters"]) == len(chapters)
    levels = subprocess.run([
        "ffmpeg", "-hide_banner", "-i", str(temporary), "-vn", "-af", "volumedetect",
        "-f", "null", "-"
    ], capture_output=True, text=True, check=True).stderr
    peak = float(re.search(r"max_volume: ([-\d.]+) dB", levels).group(1))
    assert -45 < peak < 0, f"Silent or clipped final narration: {peak}"
    temporary.replace(output)
    manifest.update(output=str(output.relative_to(ROOT)), duration=duration,
                    peakDb=peak, bytes=output.stat().st_size)
    (MEDIA / f"{prefix}-instructor-final-manifest.json").write_text(json.dumps(manifest, indent=2))
    (MEDIA / f"{prefix}-instructor-transcript.txt").write_text(
        f"{label} | INSTRUCTOR WALKTHROUGH\nAI-narrated isolated demonstration\n\n" +
        "\n".join(subtitles))
    # Inspectable frames from every instructor chapter, not just the access gate.
    for index, chapter in enumerate(chapters):
        seek = min(duration - 1, chapter["outputStart"] +
                   min(18, (chapter["outputEnd"] - chapter["outputStart"]) * 0.65))
        run("ffmpeg", "-v", "error", "-y", "-ss", str(seek), "-i", str(output),
            "-frames:v", "1", "-vf", "scale=864:-1",
            str(MEDIA / f"{prefix}-instructor-frame-{index}.jpg"))
    print(json.dumps({k: manifest[k] for k in ["output", "duration", "peakDb", "bytes"]}), flush=True)


if __name__ == "__main__":
    import sys
    selected = sys.argv[1:] or ["iron-meridian", "silent-lantern"]
    for prefix in selected:
        render(prefix, "IRON MERIDIAN" if prefix == "iron-meridian" else "SILENT LANTERN")
