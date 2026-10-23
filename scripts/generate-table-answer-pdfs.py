"""Create four-column instructor PDFs from the current server-only guides."""
import json
import re
import sys
from pathlib import Path

import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "generated-artifacts/instructor-answer-keys"
DATA = json.loads((OUT / "current-table-source.json").read_text())
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BODY_FONT = fitz.Font(fontfile=FONT)
SIZE, LEADING = 9.4, 12.3
MARGIN = 28
WIDTH, HEIGHT = 792, 612
COLS = [230, 236, 160, 110]
NAVY, BLUE = (0.06, 0.10, 0.17), (0.07, 0.30, 0.79)
INK, MUTED = (0.10, 0.14, 0.20), (0.32, 0.37, 0.44)

SL_RATIONALES = {
    101: "Network isolation limits remote interference, while keeping the device powered on preserves its current operational state.",
    102: "Triage identifies priority indicators early so subsequent collection can focus on relevant data rather than waiting for a broad extraction.",
    103: "The UFED Classic Mass Storage extraction tool is the specified workflow for external storage media such as USB drives and SD cards.",
    104: "UFDX is the evidence container used to group multiple extractions; it is not an individual parsed artifact or report format.",
    105: "SafeGuard addresses the iOS inactivity-timer concern. This activity assesses the concept, not a live SafeGuard operation.",
    106: "Preserved Extraction is the preservation workflow pending authorization. Preservation is distinct from permission to examine data; no live preserved extraction is required here.",
    108: "The CASE flag links the fixed exercise identifier JTF-0427 to the team name registered at check-in, without collecting learner identities.",
    112: "Report order and the configured profile determine the first Major item; it may be an IMEI, contact or message indicator. Priority alone does not prove criminal conduct. The Triage email supplies no definitive first Major row or indicator values, so compare with the actual saved demonstration.",
    113: "Content Types, Applications and Triage Scan are the supported manual collection choices for this activity's iPhone; Full File System and SIM are not the requested options.",
    114: "These four permitted Content Types support communication, location and identity leads. Chats is not a Content Types option; the question explicitly excludes Images and Videos.",
    115: "The alias must be supported by the courier-naming message on the same iPhone, not guessed from a different device or an illustrative example.",
    117: "SIMs are not standardized. Verify the submitted IMSI against the assigned SIM's extraction and explicitly approve it before using its last four digits in FLAG-06.",
    119: "Either a SIM adapter or a multiSIM adapter supports the specified SIM workflow. TurboLink is not required for UFED Classic SIM extraction.",
    120: "The training ZTE is supported by UFED Classic tools. This does not imply support for the separate Advanced Triage workflow used with the iPhone 8.",
    121: "These are the four required ZTE preparation settings in the activity; enable all four before the specified collection workflow.",
    122: "The activity requires all three extraction types so their outputs and Collection Summary Reports can be compared.",
    123: "MSM8909 is the training ZTE chipset specified by the activity key; confirm it in the Collection Summary Reports, not the iPhone Triage report.",
}
SL_VARIABLE_ANSWERS = {
    112: "Evidence-dependent: the reported data type and value of the FIRST actual Major item in the saved iPhone 8 Triage report.\nFormat: MAJOR:<reported datatype>:<reported value>.\nDo not assume the first Major item must be an IMEI.",
    115: "Evidence-dependent: the courier alias confirmed in the courier-naming message on the same iPhone used for Triage.\nFormat: ALIAS:<3–20 letters> (no spaces).",
    117: "The actual IMSI from the assigned SIM, individually checked and approved by the instructor. There is no shared IMSI answer.\nFormat: IMSI:<10–18 digits>.",
    124: "TPL:<verified alias>-<approved IMSI last four>-<classroom keyword>.\nUse the same approved alias and assigned-SIM response. The instructor must configure/verify the alias and watchlist keyword; no shared complete TPL code is supplied.",
}
IRON_RATIONALES = {
    1: "Ctrl+T opens the global Settings window used to configure application-wide workstation options.",
    5: "Setting the field to Required = Yes makes that report field mandatory rather than merely adding an optional field.",
    14: "Filtering Instant Messages by deleted status isolates the requested records; tagging the selected messages retains them as Leads for review.",
    16: "Sorting Audio records by Size in descending order identifies the largest item within the current evidence set.",
    18: "The Timeline total reports the event count for the loaded project and current scope; it must be checked against the assigned extraction.",
    25: "The Generate dictionary files tool creates the requested word-list output from the project data.",
    47: "Device Info provides the device metadata requested in the question; confirm the actual value in the assigned evidence.",
    54: "The Top 5 messaging parties widget ranks the most active parties; validate the displayed identities against the underlying message records.",
    55: "Sorting Data Files > Databases by record count identifies the database with the largest parsed record total.",
    70: "Inspecting sqlite_master reveals the actual schema, preventing a join from being built on assumed table or column names.",
    73: "Newly parsed entries become reviewable records that can be tagged and included in the report.",
    84: "0xFF bytes are padding rather than meaningful content here; excluding them avoids treating padding as recovered data.",
    86: "Applying the same decoding method to another party identifier tests whether the interpretation is consistent across records.",
    87: "The identifier is nibble-reversed; the trailing F is a filler nibble, not part of the recovered value.",
    89: "Numbers > SMS > SMSC Number is the decoded service-centre field, distinct from the message sender or recipient.",
    91: "A 7-bit string search uses the encoding specified for this recovered text, rather than assuming ordinary byte-aligned ASCII.",
    92: "Searching Instant Messages for Deputyjorge checks whether the text is already present in automated decoded output.",
    93: "Quick scan with Unallocated space targets the area specified for recovery, rather than scanning only allocated records.",
    98: "The hit count depends on the assigned ECHO image and the exact JFIF byte search; a count from another image is not a valid substitute.",
    100: "The regular expression identifies candidate email addresses; inspect the hits, remove duplicates and retain their source locations.",
    106: "A processing chain is an ordered series of plug-ins; changing that order can change what is parsed or recovered.",
    109: "Comparison with the default-chain output establishes that the cited artifact was newly recovered by the custom GOLF chain.",
    110: "The cited reporting limitation excludes password protection for HTML and XML; do not assume every export type supports it.",
    111: "The course specifies AES with CBC for UFDR encryption; distinguish encryption from simply selecting report contents.",
    120: "A defensible assessment requires cross-device corroboration, a device/artifact/location citation for each assertion, and independent validation of the three strongest findings. Unsupported claims about identity, intent or physical presence exceed what the evidence establishes.",
}
IRON_VARIABLE_ANSWERS = {
    11: "The observed extraction/model colour under Tools > Settings > Models. It depends on the workstation's configured colour scheme.",
    28: "The actual malware-detection count reported after scanning the assigned ALPHA file systems. No fixed classroom value is configured.",
    74: "The New records count from the specified Photos.sqlite query in SQLite Query Manager, using the assigned classroom image. No fixed count is configured.",
    98: "The actual number of hits returned by the specified JFIF byte search against the assigned ECHO MCU image. No fixed count is configured.",
}


def clean(text):
    return re.sub(r"[ \t]+", " ", text or "").strip()


def answer(q, brand):
    variable = SL_VARIABLE_ANSWERS if brand == "lantern" else IRON_VARIABLE_ANSWERS
    if q["id"] in variable:
        return variable[q["id"]]
    if q["sampleResponse"]:
        return "Illustrative sample — replace example findings with actual evidence:\n" + q["sampleResponse"]
    values = q["answers"] or q["referenceAnswers"]
    if values:
        if q["kind"] == "multiple":
            text = "Select all:\n" + "\n".join("• " + value for value in values)
        elif brand == "lantern" and q["id"] == 119:
            text = "SIM adapter or multiSIM adapter."
        else:
            # Normalisation aliases are alternatives, not additional selections.
            text = values[0]
        if q["source"] in ("reference", "manual") and brand == "iron":
            text = "Facilitator/reference answer — verify against assigned evidence:\n" + text
        return text
    raise ValueError(f"No defensible answer or sample for {brand} {q['id']}")


def rationale(q, brand):
    override = (SL_RATIONALES if brand == "lantern" else IRON_RATIONALES).get(q["id"])
    text = override or q["guidance"]
    notes = re.sub(r"(^|\n)Source:.*", "", q["notes"]).strip()
    if notes and notes not in text and brand == "iron" and q["id"] != 120:
        text += "\n" + notes
    assert text.strip(), f"Missing rationale: {q['id']}"
    return clean(text)


def reference(q, brand):
    if brand == "iron":
        return q["guideReference"]
    text = f"CEDI CTF App Recommendations workbook; CTF Feedback 2 — Mission {q['section']}, {q['code']}."
    if q["section"] == 2:
        text += "\nTriage profile email (October 2026)."
    return text


def wrap(text, width):
    result = []
    for para in text.split("\n"):
        words, line = para.split(), ""
        if not words:
            result.append("")
            continue
        for word in words:
            while BODY_FONT.text_length(word, fontsize=SIZE) > width:
                if line:
                    result.append(line)
                    line = ""
                n = 1
                while n < len(word) and BODY_FONT.text_length(word[:n + 1], fontsize=SIZE) <= width:
                    n += 1
                result.append(word[:n])
                word = word[n:]
            proposal = f"{line} {word}" if line else word
            if BODY_FONT.text_length(proposal, fontsize=SIZE) <= width:
                line = proposal
            else:
                result.append(line)
                line = word
        if line:
            result.append(line)
    return result


def create(brand, title, expected):
    entries = sorted(DATA[brand], key=lambda q: (q["section"], q["id"]))
    assert len(entries) == expected and len({q["id"] for q in entries}) == expected
    doc = fitz.open()
    current, y = None, 0
    row_audit = []

    def new_page():
        nonlocal current, y
        current = doc.new_page(width=WIDTH, height=HEIGHT)
        current.insert_font(fontname="Body", fontfile=FONT)
        current.draw_rect(fitz.Rect(0, 0, WIDTH, 5), color=None, fill=BLUE)
        current.insert_text((MARGIN, 24), "CELLEBRITE  |  DEFENSE & INTELLIGENCE", fontname="hebo", fontsize=8.5, color=MUTED)
        current.insert_text((MARGIN, 46), title + " - Instructor Answer Key", fontname="hebo", fontsize=16, color=NAVY)
        y, x = 62, MARGIN
        for label, width in zip(["Question", "Answer", "Rationale", "Course material reference"], COLS):
            current.draw_rect(fitz.Rect(x, y, x + width, y + 34), color=NAVY, fill=NAVY)
            labels = [label] if label != "Course material reference" else ["Course material", "reference"]
            for i, line in enumerate(labels):
                current.insert_text((x + 8, y + 14 + i * 11), line, fontname="hebo", fontsize=9.5, color=(1, 1, 1))
            x += width
        y += 34

    new_page()
    for index, q in enumerate(entries):
        label = q["code"] if brand == "lantern" else f"Flag {q['id']:03}"
        cells = [
            f"{label} | {'Mission' if brand == 'lantern' else 'Section'} {q['section']}\n{q['prompt']}",
            answer(q, brand), rationale(q, brand), reference(q, brand),
        ]
        assert all(cell.strip() for cell in cells)
        for ch in "".join(cells):
            assert ch.isspace() or BODY_FONT.has_glyph(ord(ch)), f"Unsupported glyph {ch!r}"
        lines = [wrap(cell, width - 16) for cell, width in zip(cells, COLS)]
        line_count = max(map(len, lines))
        height = line_count * LEADING + 16
        if y + height > HEIGHT - 35:
            new_page()
        # Keep each question intact. Reject overflow rather than silently clip.
        assert y + height <= HEIGHT - 35, f"Oversized row {label}: {height}"
        x = MARGIN
        for column, width in zip(lines, COLS):
            box = fitz.Rect(x, y, x + width, y + height)
            current.draw_rect(box, color=(0.78, 0.81, 0.86), fill=(0.96, 0.97, 0.99) if index % 2 == 0 else (1, 1, 1), width=0.45)
            for i, line in enumerate(column):
                current.insert_text((x + 8, y + 8 + SIZE + i * LEADING), line, fontname="Body", fontsize=SIZE, color=INK)
            x += width
        row_audit.append({"id": q["id"], "page": current.number + 1, "height": round(height, 1)})
        y += height

    for page in doc:
        page.insert_text((MARGIN, HEIGHT - 16), "INSTRUCTOR ONLY", fontname="hebo", fontsize=8, color=MUTED)
        footer = f"{page.number + 1} / {len(doc)}"
        page.insert_text((WIDTH - MARGIN - fitz.get_text_length(footer, fontsize=8), HEIGHT - 16), footer, fontsize=8, color=MUTED)
    doc.set_metadata({"title": f"{title} Instructor Answer Key", "author": "Cellebrite Defense & Intelligence", "subject": "Question | Answer | Rationale | Course material reference"})
    doc.subset_fonts()
    path = OUT / (title.replace(" ", "_") + "_Instructor_Table_Answer_Key.pdf")
    doc.save(path, garbage=4, deflate=True)
    doc.close()
    reopened = fitz.open(path)
    text = "\n".join(page.get_text() for page in reopened)
    for q in entries:
        label = q["code"] if brand == "lantern" else f"Flag {q['id']:03}"
        assert label in text, f"Missing row {label}"
    for page in reopened:
        assert all(h in page.get_text() for h in ["Question", "Answer", "Rationale", "Course material"])
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line["spans"]:
                    rect = fitz.Rect(span["bbox"])
                    assert rect.x0 >= 20 and rect.x1 <= WIDTH - 20 and rect.y1 < HEIGHT - 8, (page.number, span)
    for number in sorted({0, len(reopened) // 2, len(reopened) - 1}):
        reopened[number].get_pixmap(matrix=fitz.Matrix(1.3, 1.3)).save(str(OUT / f"{brand}-table-preview-{number + 1}.png"))
    (OUT / f"{brand}-table-validation.json").write_text(json.dumps({"questions": expected, "pages": len(reopened), "columns": ["Question", "Answer", "Rationale", "Course material reference"], "all_rows_present": True, "no_clipped_text": True, "rows": row_audit}, indent=2))
    print(f"VERIFIED {path.relative_to(ROOT)}: {expected} questions; {len(reopened)} pages")


if __name__ == "__main__":
    targets = {"iron": ("IRON MERIDIAN", 120), "lantern": ("SILENT LANTERN", 26)}
    for brand in sys.argv[1:] or targets:
        create(brand, *targets[brand])
