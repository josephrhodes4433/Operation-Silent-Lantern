"""Render the four anonymous-session screen recordings with verified narration."""
import json
import math
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "generated-artifacts/ctf-walkthroughs"


def run(args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-5000:])
    return result.stdout, result.stderr


def probe(file):
    return json.loads(run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(file)])[0])


def levels(file):
    text = run(["ffmpeg", "-hide_banner", "-i", str(file), "-vn", "-af", "volumedetect", "-f", "null", "-"])[1]
    mean = re.search(r"mean_volume: (-?[\d.]+) dB", text)
    peak = re.search(r"max_volume: (-?[\d.]+) dB", text)
    if not mean or not peak or float(mean[1]) < -40 or float(peak[1]) < -20:
        raise RuntimeError(f"Missing or inaudible narration: {file}")
    return {"meanDb": float(mean[1]), "peakDb": float(peak[1])}


def escape(text):
    return text.replace("\\", "\\\\").replace("=", "\\=").replace(";", "\\;").replace("#", "\\#").replace("\n", " ")


def render(prefix, role):
    capture = json.loads((OUT / f"{prefix}-anonymous-{role}-capture.json").read_text())
    if len(capture["scenes"]) != 4 or capture["workflow"] != "anonymous-shared-24-hour-sessions":
        raise RuntimeError("Incomplete or obsolete workflow capture")
    work = OUT / f"workflow-render-{prefix}-{role}"
    work.mkdir(exist_ok=True)
    filename = f"{prefix.upper()}-{role.title()}-Overview-Anonymous-Sessions"
    output = OUT / f"{filename}.mp4"
    chapters = []
    elapsed = 0
    for i, scene in enumerate(capture["scenes"]):
        audio = ROOT / scene["filePath"]
        audio_duration = float(probe(audio)["format"]["duration"])
        target = math.ceil((audio_duration + 3) * 24) / 24
        duration = scene["end"] - scene["start"]
        if duration <= 0:
            raise RuntimeError("Invalid captured scene timing")
        start = capture["offset"] + scene["start"]
        picture = work / f"{i:02d}-picture.mp4"
        chapter = work / f"{i:02d}-chapter.mp4"
        print(f"{prefix} {role}: {scene['title']} ({target:.1f}s)", flush=True)
        run(["ffmpeg", "-y", "-v", "error", "-ss", str(start), "-t", str(duration), "-i", capture["video"],
             "-vf", f"setpts=(PTS-STARTPTS)*{target/duration},fps=24,scale=1280:800:force_original_aspect_ratio=decrease,pad=1280:800:(ow-iw)/2:(oh-ih)/2",
             "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-threads", "2", "-pix_fmt", "yuv420p", str(picture)])
        # Applying atrim after apad has produced silent AAC on this environment.
        # Pad audio, then bound the entire output with -t instead.
        run(["ffmpeg", "-y", "-v", "error", "-i", str(picture), "-i", str(audio),
             "-filter_complex", "[1:a]loudnorm=I=-16:TP=-1.5:LRA=9,aformat=sample_rates=48000:channel_layouts=stereo,apad[a]",
             "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-t", str(target), str(chapter)])
        measured = levels(chapter)
        chapters.append({"title": scene["title"], "start": elapsed, "end": elapsed + target, "text": scene["text"], "file": str(chapter), **measured})
        elapsed += target
    concat = work / "concat.txt"
    concat.write_text("\n".join(f"file '{c['file']}'" for c in chapters))
    meta = work / "chapters.ffmeta"
    meta.write_text(";FFMETADATA1\n" + f"title={escape(filename.replace('-', ' '))}\nlanguage=eng\ncomment=Actual updated CTF website. Isolated synthetic training evidence and AI narration. Simulated expiry. No real emails sent.\n" +
                    "".join(f"[CHAPTER]\nTIMEBASE=1/1000\nSTART={round(c['start']*1000)}\nEND={round(c['end']*1000)}\ntitle={escape(c['title'])}\n" for c in chapters))
    run(["ffmpeg", "-y", "-v", "warning", "-f", "concat", "-safe", "0", "-i", str(concat), "-f", "ffmetadata", "-i", str(meta),
         "-map_metadata", "1", "-map_chapters", "1", "-c", "copy", "-movflags", "+faststart", str(output)])
    info = probe(output)
    if not any(s["codec_type"] == "audio" and s["codec_name"] == "aac" for s in info["streams"]):
        raise RuntimeError("Final video has no AAC narration")
    if abs(float(info["format"]["duration"]) - elapsed) > .5:
        raise RuntimeError("Narration and final video durations differ")
    volume = levels(output)
    frames = []
    for i, c in enumerate(chapters):
        frame = work / f"chapter-{i+1}.jpg"
        run(["ffmpeg", "-y", "-v", "error", "-ss", str(c["start"] + (c["end"]-c["start"]) * .5), "-i", str(output),
             "-frames:v", "1", "-q:v", "3", str(frame)])
        frames.append(str(frame))
    sheet = OUT / f"{prefix}-{role}-workflow-contact-sheet.jpg"
    args = ["ffmpeg", "-y", "-v", "error"]
    for frame in frames:
        args += ["-i", frame]
    args += ["-filter_complex", "[0:v]scale=640:400[a];[1:v]scale=640:400[b];[2:v]scale=640:400[c];[3:v]scale=640:400[d];[a][b][c][d]xstack=inputs=4:layout=0_0|640_0|0_400|640_400",
             "-frames:v", "1", "-q:v", "3", str(sheet)]
    run(args)
    output.with_suffix(".txt").write_text(filename.replace("-", " ") + "\nAI narration; synthetic demonstration; no real customer data.\n\n" +
        "\n\n".join(f"{int(c['start']//60):02}:{int(c['start']%60):02} — {c['title']}\n{c['text']}" for c in chapters))
    report = {"filePath": str(output.relative_to(ROOT)), "durationSeconds": float(info["format"]["duration"]),
              "bytes": output.stat().st_size, "role": role, "activity": prefix, **volume,
              "chapters": [{k: v for k, v in c.items() if k != "file"} for c in chapters],
              "contactSheet": str(sheet.relative_to(ROOT)), "syntheticData": True, "aiNarration": True}
    output.with_suffix(".json").write_text(json.dumps(report, indent=2))
    print("VERIFIED", report["filePath"], round(report["durationSeconds"], 1), volume, flush=True)
    return report


if __name__ == "__main__":
    if len(sys.argv) == 3:
        render(sys.argv[1], sys.argv[2])
    else:
        for prefix in ["iron-meridian", "silent-lantern"]:
            for role in ["student", "instructor"]:
                render(prefix, role)
