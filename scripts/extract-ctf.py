"""Regenerate the question bank from the complete, instructor-supplied activity."""
import argparse
import json
import re
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--source", type=Path, default=Path("attached_assets/Operation_IRON_MERIDIAN_CTF_Activity_1791502506053.docx"))
parser.add_argument("--output", type=Path, default=Path("artifacts/api-server/src/data/questions.json"))
args = parser.parse_args()
source = args.source
ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
with ZipFile(source) as archive:
    root = ET.fromstring(archive.read("word/document.xml"))

titles = [
    "Workstation Preparation and Case Build",
    "ALPHA Triage: Pattern of Life and Network",
    "BRAVO Verification and Validation",
    "CHARLIE: The Foreign-Language Node",
    "DELTA: Database Exploitation",
    "ECHO and FOXTROT: Legacy Handsets and Hex-Level Recovery",
    "GOLF: The Unsupported Device",
    "Dissemination and the Commander's Brief",
]
ranges = [(1, 10), (11, 29), (30, 43), (44, 66), (67, 79), (80, 102), (103, 109), (110, 120)]
questions = []
for table in root.findall(".//w:tbl", ns):
    for row in table.findall("./w:tr", ns):
        cells = [
            " ".join("".join(t.text or "" for t in p.findall(".//w:t", ns)).strip() for p in cell.findall(".//w:p", ns)).strip()
            for cell in row.findall("./w:tc", ns)
        ]
        if len(cells) < 5 or not cells[0].isdigit():
            continue
        identifier = int(cells[0])
        if not 1 <= identifier <= 120:
            continue
        section = next(i + 1 for i, (low, high) in enumerate(ranges) if low <= identifier <= high)
        raw = cells[1]
        marker = re.search(r"\[(MC|MS|SA|NUM|LONG)\]", raw)
        kind = {"MC": "single", "MS": "multiple", "SA": "short", "NUM": "number", "LONG": "long"}[marker.group(1)] if marker else "short"
        before = raw[:marker.start()].strip() if marker else raw
        prompt, _, option_text = before.partition("Options:")
        options = [o.strip() for o in option_text.split("|")] if option_text else []
        answer = re.sub(r"\s+(AUTO|DATASET|RUBRIC)\s*$", "", cells[2]).strip()
        category = "dataset" if "DATASET" in cells[2] else "rubric" if "RUBRIC" in cells[2] else "auto"
        questions.append({
            "id": identifier,
            "section": section,
            "sectionTitle": titles[section - 1],
            "prompt": re.sub(r"^(?:FINAL )?FLAG \d+-\d+\.\s*", "", prompt.strip()),
            "kind": kind,
            "options": options,
            "points": int(cells[4]),
            "guideReference": cells[3],
            "category": category,
            "acceptedAnswers": (answer.split("; ") if kind == "multiple" else [answer]) if category == "auto" else [],
            "validationMethod": raw[marker.end():].replace("How to validate:", "").strip() if marker else "",
        })
if len(questions) != 120 or len({q["id"] for q in questions}) != 120:
    raise ValueError("The complete activity must contain every flag ID from 1 to 120 exactly once.")
output = args.output
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(questions, indent=2, ensure_ascii=False))
print(f"Imported {len(questions)} populated questions, {sum(q['points'] for q in questions)} available points.")
print("Missing IDs:", [i for i in range(1, 121) if i not in {q["id"] for q in questions}])
