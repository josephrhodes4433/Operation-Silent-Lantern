"""Produce concise, question-by-question Word keys with illustrative written answers."""
import json
import sys
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import importlib.util

spec = importlib.util.spec_from_file_location(
    "answer_doc", Path(__file__).with_name("generate-instructor-answer-keys.py")
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
Document = module.Document

IRON_SAMPLES = {
    51: "Five messaging applications identified on CHARLIE are Kakao Talk, Kik, Skype, Viber and WhatsApp. I confirmed each in Installed Applications and checked the associated parsed records.",
    54: "The top five messaging parties are Alex Morgan, Sam Patel, Jordan Lee, Casey Reed and Taylor Brooks. I ranked the parties using CHARLIE's Top 5 messaging parties widget and confirmed the corresponding identifiers in the underlying message records.",
    61: "Image A shows green kitchen herbs rather than a controlled substance. The green leaves and packaging likely triggered the classifier; I excluded it because the image contains no corroborating drug indicator. Image B shows white baking flour in a kitchen. Its white powder appearance plausibly triggered classification, but the visible food label and cooking context support excluding it from the intelligence picture.",
    66: "AppGenie recovered chats from ExampleChat that were absent from CHARLIE's standard decoded output. I confirmed the application database path, conversation identifiers and timestamps before tagging the newly recovered chats.",
    79: "The SQLite Wizard results matched the raw Photos.sqlite records for original filename, relative path, file size and creation time. I validated the output by opening the same rows directly in Database View and comparing their record identifiers. One displayed time differed because the decoded view used local time; converting both values to UTC resolved the discrepancy. No unresolved discrepancy remained in the records compared.",
    90: 'Decoded body: “Meet at the north entrance at 18:00.” Decoded party: +12025550123. Decoded PDU timestamp: 2014-07-14 12:20:00, as represented by the recovered timezone field. I recovered this message from an unallocated ECHO hex range, confirmed the PDU structure and tagged that range Recovered SMS Body. The message was absent from the automated output.',
    100: "Unique addresses recovered: alpha@example.com; dispatch@example.org; courier@example.net. I removed duplicate occurrences and saved the expression to the library as Email Search.",
    102: "I assess the photographed location as probable. The source is GPS EXIF in a CHARLIE image, which provides precise coordinates, but the image alone does not prove the handset owner was present at capture time. I would compare the image time and coordinates with carrier call detail records and independently sourced operational reporting before raising confidence to confirmed.",
    108: "I saved the chain as MERIDIAN_GOLF_Test. It combines the classroom-approved Example File-System Parser and Example Message Decoder plug-ins in that order. GOLF is an unsupported binary dump, so the default chain did not expose the relevant records. The default run recovered 0 messages; the custom run recovered 12, an increase of 12. I recorded the plug-in order and settings and validated the recovered message bodies against the raw bytes.",
    109: 'Data type: SMS. Recovered value: “Delivery moved to the east gate at 19:00.” This record appeared only after the correct GOLF chain was applied; I confirmed its source offset and decoded fields against the dump and compared the result with the default-chain output.',
    117: "The Tags Only PDF contains 24 tagged items. I checked the count against Manage Tags and confirmed that the report contains the same selected findings.",
    118: "I generated MERIDIAN_Partner_Release.ufdr with the required default categories and applied password protection and UFDR AES protection for release. I confirmed that the exported report opens with the intended authorized access.",
    120: "The training evidence supports Alex Morgan as the individual directing component movements, using ExampleChat and SMS. On ALPHA, the ExampleChat conversation visible at Analyzed Data > Chats contains an instruction assigning the collection point; I verified its body and timestamp in the source database. On BRAVO, the native Messages thread visible at Analyzed Data > Instant Messages acknowledges the same instruction; I checked sms.db and independently converted its timestamp. On CHARLIE, the calendar record visible at Analyzed Data > Calendar describes the matching movement window; I checked the raw calendar database and independently converted the stored time. These three findings corroborate the directing role and communications means across devices. They support a lead for further verification, not a claim that every participant's identity or physical presence has been proved.",
}
SL_SAMPLES = {
    6: "Indicator 1: a Runner Phone chat at 17:40 UTC instructs courier FALCON to use the east gate; source: UFED extraction R1, chat thread 4, message 18. Indicator 2: a location record at 17:44 UTC places the handset near that gate; source: the same extraction's Locations output, record 12. The close timing and shared location support the rendezvous assessment.",
    7: "The classroom Triage profile uses a keyword criterion and a phone-number criterion. I checked the keyword against chat content and the watchlisted number against the extracted communications. I distinguished the configured Major match from lower-priority Minor results.",
    11: "The SIM contains contact Dispatch with number +12025550123; source: SIM extraction S1, contact record 7. That number also appears in the Runner Phone instruction thread and in the Mission 3 Major-match result. The shared number supports a pivot between the SIM contact and the earlier communications; it does not alone establish a person's identity.",
    17: "Courier alias FALCON is linked to a planned handoff through the Runner Phone instruction thread (UFED extraction R1, chat thread 4, message 18). The instruction describes delivery of a package to the east gate. Its timestamp is 17:40 UTC, with the next action stated as 18:00 UTC. A location record near the east gate at 17:44 UTC supports the Where assessment (R1, Locations record 12). SIM contact Dispatch shares the instruction thread's number and corroborates the communications link (SIM extraction S1, contact record 7). The authorized Coordinator planning artifact also names the gate and window, increasing confidence in the assessment without proving the package contents. The next step is to preserve these cited UFED outputs and ask the instructor to validate the location and movement window against independent information.",
    18: "Artifact 1: Runner Phone R1, chat thread 4, message 18, explicitly names the east gate and the 18:00 UTC rendezvous. Artifact 2: authorized Coordinator extraction C1, planning artifact East Gate Handoff, repeats that location and window. Their independent sources corroborate both Where and When; I recorded the original timestamps and source identifiers.",
}


def intro(doc, title, subtitle):
    doc.p("CELLEBRITE  |  DEFENSE & INTELLIGENCE", "Label")
    doc.p(title, "Title")
    doc.p("Instructor answer guide", "Heading2")
    doc.p(subtitle)
    doc.p("INSTRUCTOR ONLY", "Label")
    doc.p("Answers follow the baseline website in question order. Instructor-configured classroom keys may differ. Dataset references must be verified against the actual evidence.")
    doc.p("Sample responses are illustrative, not verified findings or automatic answer keys. Names, counts, times, record identifiers, paths and tool results in samples must be replaced with the learner's actual supported findings.")


def sample(doc, text):
    doc.p("Sample response — illustrative only:", "Label")
    doc.p(text)


def iron(qs, path):
    doc = Document()
    intro(doc, "OPERATION IRON MERIDIAN", "120 flags • Eight sections")
    section = None
    for q in qs:
        if q["section"] != section:
            section = q["section"]
            doc.p(f"Section {section} — {q['sectionTitle']}", "Heading1")
        doc.p(f"Flag {q['id']:03d}", "Heading2")
        doc.p(q["prompt"])
        if q["manual"]:
            doc.p("Answer guide: " + q["validationMethod"])
            if q.get("facilitatorNote"):
                doc.p("Source guidance: " + q["facilitatorNote"])
            sample(doc, IRON_SAMPLES[q["id"]])
        elif q["category"] == "dataset":
            refs = q.get("facilitatorAnswers", [])
            if q["id"] in (17, 18):
                doc.p("Answer: verify the classroom result. The stored reference is " + " OR ".join(refs) + ", but the source notes conflict with the question's PNG/Timeline wording; do not treat this value as verified.")
            elif refs:
                doc.p("Reference answer — verify on classroom data: " + " OR ".join(refs))
            else:
                doc.p("Answer: dataset-dependent. " + q["validationMethod"])
            if q.get("facilitatorNote"):
                doc.p("Note: " + q["facilitatorNote"])
            if q["id"] in IRON_SAMPLES:
                sample(doc, IRON_SAMPLES[q["id"]])
        else:
            answers = q["acceptedAnswers"]
            prefix = "Answer — select all: " if q["kind"] == "multiple" else "Answer: "
            doc.p(prefix + ("; ".join(answers) if q["kind"] == "multiple" else " OR ".join(answers)))
            if q.get("facilitatorNote"):
                doc.p("Note: " + q["facilitatorNote"])
    doc.save(path)


def lantern(qs, path):
    doc = Document()
    intro(doc, "OPERATION SILENT LANTERN", "18 responses • Six UFED-only missions")
    section = None
    for q in qs:
        if q["section"] != section:
            section = q["section"]
            doc.p(f"Mission {section} — {q['sectionTitle']}", "Heading1")
        doc.p(q["code"], "Heading2")
        doc.p(q["prompt"])
        mode = q["keyMode"]
        if mode == "manual":
            # Keep answer guidance, omit suggested scoring allocations.
            guide = module.SL_RUBRICS[q["id"]].split("Suggested")[0].strip()
            doc.p("Answer guide: " + guide)
            sample(doc, SL_SAMPLES[q["id"]])
        elif mode == "dataset":
            doc.p("Answer: dataset-dependent. " + module.SL_DATASET[q["id"]])
        elif mode == "format":
            doc.p("Answer: CASE:JTF-####-TEAM# using exactly four case digits and the learner's registered team number.")
            doc.p("Format example only: CASE:JTF-0427-TEAM3 (team 3).")
        elif q["kind"] == "multiple":
            doc.p("Answer — select all: " + "; ".join(q["acceptedAnswers"]) + ". Images and Videos are optional.")
        else:
            doc.p("Answer: " + " OR ".join(q["acceptedAnswers"]))
        if mode == "dataset" and q.get("format"):
            doc.p("Required format: " + q["format"])
    doc.save(path)


if __name__ == "__main__":
    data = json.loads(Path(sys.argv[1]).read_text())
    output = Path("generated-artifacts/instructor-answer-keys")
    output.mkdir(parents=True, exist_ok=True)
    iron(data["iron"], output / "IRON_MERIDIAN_Simple_Answer_Guide.docx")
    lantern(data["lantern"], output / "SILENT_LANTERN_Simple_Answer_Guide.docx")
    ns = {"w": module.W}
    for name, key, count, samples in [
        ("IRON_MERIDIAN", "iron", 120, 13),
        ("SILENT_LANTERN", "lantern", 18, 5),
    ]:
        path = output / (name + "_Simple_Answer_Guide.docx")
        with ZipFile(path) as z:
            assert z.testzip() is None
            for item in z.namelist():
                ET.fromstring(z.read(item))
            root = ET.fromstring(z.read("word/document.xml"))
        text = "\n".join(t.text or "" for t in root.findall(".//w:t", ns))
        assert len(data[key]) == count
        for q in data[key]:
            assert q["prompt"] in text, q["id"]
            label = f"Flag {q['id']:03d}" if key == "iron" else q["code"]
            assert label in text, label
            if key == "iron" and q.get("manual"):
                assert IRON_SAMPLES[q["id"]] in text
            if key == "iron" and q["category"] == "auto" and not q["manual"]:
                for answer in q["acceptedAnswers"]:
                    assert answer in text
        assert text.count("Sample response — illustrative only:") == samples
        assert "acceptance-test checklist" not in text
        print(f"Verified {path}: {count} questions, {samples} sample responses, {len(text.split())} words")
