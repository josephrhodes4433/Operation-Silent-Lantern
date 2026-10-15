"""Render actual-UI recordings into four revised guides and two new process guides."""
import json
import math
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "generated-artifacts/ctf-walkthroughs"
SPEECH = {x["id"]: x for x in json.loads((OUT / "updated-speech-assets.json").read_text())}


def run(args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-6000:])
    return result.stdout, result.stderr


def probe(file):
    return json.loads(run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(file)])[0])


def safe(text):
    return text.replace("\\", "\\\\").replace("=", "\\=").replace(";", "\\;").replace("#", "\\#").replace("\n", " ")


def process_scenes(student, instructor):
    first_choice = next(q for q in student["questions"] if not q["manualReview"])
    first_manual = next(q for q in student["questions"] if q["manualReview"])
    intro = next(s for s in student["scenes"] if s["id"] == "intro")
    finish = next(s for s in student["scenes"] if s["id"] == "finish")
    feedback = next(s for s in instructor["scenes"] if s["id"] == "accept-feedback")
    completion = next(s for s in instructor["scenes"] if s["id"] == "completion")
    brand = "lantern" if student["activity"] == "lantern" else "iron"
    specs = [
        ("intro", "Register and share one team submission", student, intro, f"process-{brand}-intro"),
        ("choices", "Validate choice answers", student, first_choice, "process-choices"),
        ("nonchoice", "Submit, revise, and receive acceptance", student, first_manual, "process-nonchoice"),
        ("instructor", "Instructor review and automatic points", instructor, feedback, "process-instructor"),
        ("submit", "Check Results and submit", student, {**finish, "end": finish["start"] + (finish["end"] - finish["start"]) * .58}, "process-submit"),
        ("completion", "Completion alerts and public progress", instructor, completion, "process-notifications"),
    ]
    return [{**SPEECH[audio], "id": id_, "title": title, "video": source["video"], "offset": source["offset"],
             "start": scene["start"], "end": scene["end"]} for id_, title, source, scene, audio in specs]


def render(prefix, role, capture):
    label = prefix.upper()
    role_label = {"student": "Student-Walkthrough-Updated", "instructor": "Instructor-Walkthrough-Updated", "process": "Completion-Process-Guide"}[role]
    output = OUT / f"{label}-{role_label}.mp4"
    work = OUT / f"updated-render-{prefix}-{role}"
    work.mkdir(exist_ok=True)
    chapters = []
    elapsed = 0
    for i, scene in enumerate(capture["scenes"]):
        audio = ROOT / scene["filePath"]
        audio_duration = float(probe(audio)["format"]["duration"])
        target = math.ceil(max(audio_duration + 2.5, scene.get("minDuration", 0)) * 24) / 24
        start = scene["start"] + scene.get("offset", capture.get("offset", 0))
        duration = max(.2, scene["end"] - scene["start"])
        # Rapid sorting introduces transient loading skeletons in the raw clip.
        # Hold the final fully loaded queue so instructors can read its entries.
        if role == "instructor" and scene["id"] == "queue":
            start = scene["end"] - .32 + scene.get("offset", capture.get("offset", 0))
            duration = .30
        factor = target / duration
        source = scene.get("video", capture.get("video"))
        silent = work / f"{i:02d}-picture.mp4"
        final = work / f"{i:02d}-chapter.mp4"
        print(f"{prefix} {role} {i+1}/{len(capture['scenes'])}: {scene['title']} ({target:.1f}s)", flush=True)
        if not (os.environ.get("CTF_VIDEO_REPAIR_QUEUE") and final.exists() and scene["id"] != "queue"):
            run(["ffmpeg", "-y", "-v", "error", "-ss", str(start), "-t", str(duration), "-i", source,
                 "-vf", f"setpts=(PTS-STARTPTS)*{factor},fps=24,scale=1280:800:force_original_aspect_ratio=decrease,pad=1280:800:(ow-iw)/2:(oh-ih)/2",
                 "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-threads", "2", "-pix_fmt", "yuv420p", str(silent)])
            # Do not atrim after apad: some supported FFmpeg builds emit silence with that sequence.
            run(["ffmpeg", "-y", "-v", "error", "-i", str(silent), "-i", str(audio),
                 "-filter_complex", "[1:a]loudnorm=I=-16:TP=-1.5:LRA=9,aformat=sample_rates=48000:channel_layouts=stereo,apad[a]",
                 "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-t", str(target), str(final)])
        chapters.append({"title": scene["title"], "start": elapsed, "end": elapsed + target, "text": scene["text"], "file": str(final)})
        elapsed += target
    concat = work / "concat.txt"
    concat.write_text("\n".join(f"file '{c['file']}'" for c in chapters))
    metadata = work / "chapters.ffmeta"
    metadata.write_text(";FFMETADATA1\n" + f"title={safe(label + ' ' + role_label.replace('-', ' '))}\ncomment=Actual website; isolated synthetic data; AI narration. No real emails sent.\n" +
                        "".join(f"[CHAPTER]\nTIMEBASE=1/1000\nSTART={round(c['start']*1000)}\nEND={round(c['end']*1000)}\ntitle={safe(c['title'])}\n" for c in chapters))
    run(["ffmpeg", "-y", "-v", "warning", "-f", "concat", "-safe", "0", "-i", str(concat), "-f", "ffmetadata", "-i", str(metadata),
         "-map_metadata", "1", "-map_chapters", "1", "-c", "copy", "-movflags", "+faststart", str(output)])
    info = probe(output)
    if not any(s["codec_type"] == "audio" for s in info["streams"]):
        raise RuntimeError(f"No audio in {output}")
    _, volume = run(["ffmpeg", "-hide_banner", "-i", str(output), "-vn", "-af", "volumedetect", "-f", "null", "-"])
    import re
    peak = float(re.search(r"max_volume: ([\-\d.]+) dB", volume).group(1))
    if not -40 < peak <= 0:
        raise RuntimeError(f"Silent or clipped narration: {peak}dB in {output}")
    for i, c in enumerate(chapters):
        run(["ffmpeg", "-y", "-v", "error", "-ss", str(c["start"] + (c["end"]-c["start"]) * .55), "-i", str(output),
             "-frames:v", "1", "-q:v", "4", str(work / f"frame-{i+1:02d}.jpg")])
    transcript = "\n\n".join(f"{int(c['start']//60):02}:{int(c['start']%60):02} — {c['title']}\n{c['text']}" for c in chapters)
    output.with_suffix(".txt").write_text(transcript)
    result = {"filePath": str(output.relative_to(ROOT)), "role": role, "activity": prefix, "duration": float(info["format"]["duration"]),
              "peakDb": peak, "bytes": output.stat().st_size, "chapters": [{k: v for k, v in c.items() if k != "file"} for c in chapters],
              "syntheticData": True, "aiNarration": True}
    output.with_suffix(".json").write_text(json.dumps(result, indent=2))
    print("FINISHED", result["filePath"], result["duration"], peak, flush=True)
    return result


results = []
for prefix in sys.argv[1:] or ["iron-meridian", "silent-lantern"]:
    student = json.loads((OUT / f"{prefix}-updated-student-capture.json").read_text())
    instructor = json.loads((OUT / f"{prefix}-updated-instructor-capture.json").read_text())
    if len(student["questions"]) != student["questionCount"]:
        raise RuntimeError("Not every student question was recorded")
    for role, capture in [("student", student), ("instructor", instructor),
                          ("process", {"scenes": process_scenes(student, instructor)})]:
        if role in os.environ.get("CTF_VIDEO_ROLES", "student,instructor,process").split(","):
            results.append(render(prefix, role, capture))
(OUT / "updated-video-deliverables.json").write_text(json.dumps(results, indent=2))
