"""Generate instructor-only DOCX guides from the compiled baseline question banks.

Input: JSON containing `iron` and `lantern` arrays (no learner records or secrets).
Uses only Python's standard library; documents are valid Office Open XML packages.
"""
import json
import sys
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile, ZIP_DEFLATED

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
ET.register_namespace("w", W)


def el(tag, attrs=None, text=None):
    node = ET.Element(f"{{{W}}}{tag}", {f"{{{W}}}{k}": str(v) for k, v in (attrs or {}).items()})
    node.text = text
    return node


class Document:
    def __init__(self):
        self.root = el("document")
        self.body = ET.SubElement(self.root, f"{{{W}}}body")

    def p(self, text, style=None):
        p = el("p")
        if style:
            props = el("pPr")
            props.append(el("pStyle", {"val": style}))
            p.append(props)
        run = el("r")
        t = el("t", text=str(text))
        t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        run.append(t)
        p.append(run)
        self.body.append(p)

    def table(self, rows):
        table = el("tbl")
        props = el("tblPr")
        props.append(el("tblW", {"w": 9360, "type": "dxa"}))
        borders = el("tblBorders")
        for side in ("top", "left", "bottom", "right", "insideH", "insideV"):
            borders.append(el(side, {"val": "single", "sz": 4, "color": "D5DFE8"}))
        props.append(borders)
        table.append(props)
        grid = el("tblGrid")
        grid.append(el("gridCol", {"w": 2500}))
        grid.append(el("gridCol", {"w": 6860}))
        table.append(grid)
        for i, row in enumerate(rows):
            tr = el("tr")
            trprops = el("trPr")
            trprops.append(el("cantSplit"))
            if i == 0:
                trprops.append(el("tblHeader"))
            tr.append(trprops)
            for j, text in enumerate(row):
                tc = el("tc")
                cp = el("tcPr")
                cp.append(el("tcW", {"w": 2500 if j == 0 else 6860, "type": "dxa"}))
                if i == 0:
                    cp.append(el("shd", {"fill": "E9F0F6"}))
                tc.append(cp)
                p = el("p")
                run = el("r")
                run.append(el("t", text=str(text)))
                p.append(run)
                tc.append(p)
                tr.append(tc)
            table.append(tr)
        self.body.append(table)
        self.p("")

    def save(self, path):
        sect = el("sectPr")
        footer_ref = el("footerReference", {"type": "default"})
        footer_ref.set("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id", "rId2")
        sect.append(footer_ref)
        sect.append(el("pgSz", {"w": 12240, "h": 15840}))
        sect.append(el("pgMar", {"top": 1000, "right": 1440, "bottom": 1000, "left": 1440, "header": 500, "footer": 500}))
        self.body.append(sect)
        types = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>"""
        rels = """<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>"""
        docrels = """<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>"""
        styles = f"""<w:styles xmlns:w="{W}">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="21"/><w:color w:val="243746"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="260" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:spacing w:before="300" w:after="180"/><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="46"/><w:color w:val="12324A"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:pageBreakBefore/><w:keepNext/><w:outlineLvl w:val="0"/><w:spacing w:before="180" w:after="140"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="12324A"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/><w:spacing w:before="200" w:after="90"/></w:pPr><w:rPr><w:b/><w:sz w:val="25"/><w:color w:val="0B6680"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Label"><w:name w:val="Label"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/><w:color w:val="B85C00"/></w:rPr></w:style>
</w:styles>"""
        footer = f"""<w:ftr xmlns:w="{W}"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="17"/><w:color w:val="64748B"/></w:rPr><w:t>INSTRUCTOR ONLY • Cellebrite D&amp;I training activity • Page </w:t></w:r><w:fldSimple w:instr="PAGE"/></w:p></w:ftr>"""
        with ZipFile(path, "w", ZIP_DEFLATED) as z:
            for name, content in {
                "[Content_Types].xml": types,
                "_rels/.rels": rels,
                "word/document.xml": ET.tostring(self.root, encoding="utf-8", xml_declaration=True),
                "word/styles.xml": styles,
                "word/_rels/document.xml.rels": docrels,
                "word/footer1.xml": footer,
            }.items():
                z.writestr(name, content)


def front(d, title, subtitle):
    d.p("CELLEBRITE  |  DEFENSE & INTELLIGENCE", "Label")
    d.p(title, "Title")
    d.p("Instructor answer key & verification guide", "Heading2")
    d.p(subtitle)
    d.p("INSTRUCTOR ONLY — Contains expected answers. Do not distribute to learners.", "Label")
    d.p("Scope: the bundled baseline activity and source-based facilitator references. This is not an export of live classroom answer keys or instructor question overrides. Compare your Instructor console before testing a customized class.")
    d.p("No learner records, console access code, credentials, or actual training authorization token are included.")
    d.p("Class / dataset: ____________________    Software version: ____________________")
    d.p("Verified by: _______________________    Verification date: ____________________")
    d.p("How to use this guide", "Heading2")
    for text in [
        "FIXED: expected baseline answer(s). For multiple-select questions, select the complete required set, not one alternative.",
        "DATASET REFERENCE — VERIFY: a recorded facilitator value, not a universal result. Reproduce it on the actual classroom image before configuring the key.",
        "DATASET — INSTRUCTOR MUST ESTABLISH: no trustworthy shared value is supplied. Follow the verification method and enter the observed value in the Instructor console.",
        "MANUAL REVIEW: evaluate evidence and reasoning using the rubric. No single shared text response is an answer key.",
        "Use a synthetic learner for acceptance testing. Do not overwrite shared classroom keys merely to run tests.",
    ]:
        d.p("• " + text)


def checklist(d, lantern=False):
    d.p("Instructor acceptance-test checklist", "Heading1")
    rows = [
        ("Test", "Expected outcome"),
        ("First-time Begin activity", "First name, last name, learner email and instructor email are required. Blank required fields prevent check-in."),
        ("Return / reload", "Saved learner identity and work remain available through the saved session or resume flow; no repeated identity entry."),
        ("Correct fixed answer", "Shows validation success and awards the question's points."),
        ("Incorrect answer / retry", "Shows incorrect feedback; a correct retry succeeds without a wrong-answer penalty."),
        ("Dataset key absent", "Response is saved as unkeyed/pending configuration, not automatically accepted."),
        ("Verified dataset key", "Use an isolated test class/key. A matching answer validates and a mismatching answer fails."),
        ("Save and reopen", "Enter a response, save, reload/resume, and verify the same text and progress are restored."),
        ("Instructor access", "Answer keys, learner review and history remain protected from unauthenticated visitors."),
        ("Final submission / email", "Confirm the submission appears for instructor review. Automatic email requires a configured mail provider; a mail-app draft is not delivery. Delivery is not currently enabled in this project."),
    ]
    if lantern:
        rows += [
            ("Team / rules", "Team number and rules acknowledgement are required; CASE flag must match the registered team."),
            ("Pending written response", "Submit a written response; it remains pending and blocks advancement. Saving text alone does not grant approval."),
            ("Deny / reattempt", "Instructor supplies denial feedback; learner sees it and remains blocked. Unchanged or whitespace-only resubmission is rejected."),
            ("Approve revised response", "Learner meaningfully revises and resubmits; instructor reviews the latest version. Explicit approval unlocks the next required step."),
            ("Stale review", "A review of an older response version is rejected rather than applied to the newer text."),
            ("History / comparison", "Submit, deny, revise and approve a test response. Verify chronological attempts/decisions and compare two revisions; old content should remain available after reload."),
            ("Preserved authorization", "AUTH flag and planning-artifact answer remain gated until instructor authorization. Never use the console login secret as the training token."),
            ("Mission / final gate", "Mission flag plus required written approvals unlock the next mission. Final submission requires all answers, six validated flags and written approvals."),
            ("Hints / score", "Three hint tokens; each costs 2 points. Base total is 125; instructor bonuses are separate."),
        ]
    else:
        rows += [
            ("Coverage / station tasking", "120 flag IDs, eight sections and 1,370 available points. DELTA: 67–79; GOLF: 103–109."),
            ("Multiple select", "Complete correct set validates; omitting a required choice or adding an incorrect choice fails."),
            ("Numeric key configuration", "Invalid numeric keys must be rejected. Verify zero, nonzero and comma-formatted numeric cases against the deployed build."),
            ("Written review", "Review saved text and evidence in the instructor console. Verify assigned points and feedback; do not assume SILENT LANTERN's approval gates apply to this separate activity."),
            ("Dataset-reference import", "Require classroom verification before importing references; previously configured nonempty keys must remain unchanged."),
        ]
    d.table(rows)
    d.p("Record each result: PASS / FAIL / NOT TESTED. Record session, expected result, actual result and remedial action. This checklist describes tests to perform; it is not a claim that these tests have been run against your classroom deployment.")


def iron_guide(qs, out):
    d = Document()
    front(d, "OPERATION IRON MERIDIAN", "Eight-section activity • 120 flags • 1,370 points")
    counts = {
        "Fixed automatic checks": sum(q["category"] == "auto" and not q["manual"] for q in qs),
        "Dataset-dependent checks": sum(q["category"] == "dataset" and not q["manual"] for q in qs),
        "Written / evidence-based reviews": sum(q["manual"] for q in qs),
    }
    d.table([("Answer class", "Count")] + [(k, str(v)) for k, v in counts.items()])
    d.p("Source precedence", "Heading2")
    d.p("Use the complete Operation IRON MERIDIAN CTF Activity and Forms Build Sheet for all 120 IDs. The Complete Facilitator Guide supplements answers by device and meaning; its five-section layout does not replace this eight-section activity.")
    d.p("Key cautions: BRAVO timestamps use nanoseconds since UTC 2001. Verify CHARLIE's actual handset model. Resolve conflicting image names/thumbnail names before accepting hashes or file sizes. ALPHA counts must not be reused for FOXTROT address-list questions.")
    current = None
    for q in qs:
        if q["section"] != current:
            current = q["section"]
            d.p(f"Section {current} — {q['sectionTitle']}", "Heading1")
        d.p(f"Flag {q['id']:03d}  |  {q['points']} points", "Heading2")
        d.p(q["prompt"])
        if q["manual"]:
            d.p("MANUAL REVIEW — Evidence-based answer", "Label")
            d.p("Award up to the listed points using the criteria below. Review the actual artifacts; do not auto-accept generic prose.")
        elif q["category"] == "dataset":
            refs = q.get("facilitatorAnswers", [])
            d.p("DATASET REFERENCE — VERIFY" if refs else "DATASET — INSTRUCTOR MUST ESTABLISH", "Label")
            if refs:
                for a in refs:
                    d.p("Recorded accepted reference: " + a)
                d.p("Confirm on the classroom build before activating. Different accepted reference lines are alternatives, not additional required entries.")
            else:
                d.p("No verified common answer is available. Classroom accepted answer(s): ______________________________")
        else:
            d.p("FIXED — Baseline answer", "Label")
            if q["kind"] == "multiple":
                d.p("Select ALL of the following (complete set):")
            elif len(q["acceptedAnswers"]) > 1:
                d.p("Accept any one of these alternatives:")
            for a in q["acceptedAnswers"]:
                d.p("• " + a)
        d.p(("Review rubric / verification method: " if q["manual"] else "Verification method: ") + q["validationMethod"])
        if q.get("facilitatorNote"):
            d.p("Facilitator caution: " + q["facilitatorNote"])
        d.p(f"Validation: {q['mode']}  |  Source: {q['guideReference']}")
    checklist(d)
    d.save(out)


SL_RUBRICS = {
    6: "Require two specific, relevant supporting indicators. Each should include a timestamp, location indicator and traceable UFED source. Check that the evidence supports the alias/rendezvous assessment rather than merely repeating the conclusion. Suggested 5-point allocation: two evidenced indicators, 2 points each; explicit relevance, 1 point.",
    7: "Require at least two distinct watchlist criterion types actually used in classroom Triage, such as a keyword and a phone number. Confirm against the supplied watchlist. Suggested allocation: two valid types, 2 points each; consistency with actual Triage configuration, 1 point.",
    11: "Require a concrete SIM contact or message, a traceable source, and an explanation linking it to an alias or Major-match finding from Missions 2–3. Suggested allocation: artifact and provenance, 2 points; valid cross-mission link, 2 points; clear explanation, 1 point.",
    17: "Require 6–8 sentences covering Who, What, Where, When, So-what and Next step; artifact citations and cross-source corroboration. No invented identity, location or time. Suggested 10-point allocation: accurate Who/What, 2; supported Where/When, 2; defensible significance/next step, 2; traceable citations, 2; corroboration and concise 6–8-sentence format, 2.",
    18: "Require two distinct artifacts that support the final Where and When assessments, with source identifiers and a clear explanation of what each corroborates. Suggested allocation: two traceable artifacts, 2 points each; explicit Where/When corroboration, 1 point.",
}
SL_DATASET = {
    5: "Inspect the shared Runner Phone dataset and identify the evidenced courier alias. Record ALIAS:<actual alias>; 3–20 letters, no spaces. Do not use a sample alias as a real key.",
    8: "Run the classroom watchlist and identify the first criterion producing a Major match. Record MAJOR:<datatype>:<value> exactly from the agreed baseline. Each component must be nonempty and contain no extra colon or newline.",
    10: "Read the IMSI from the shared training SIM. Record IMSI:<10–18 digits>. Preserve all digits, including any leading zeros.",
    14: "Create/release a classroom training authorization token only after checking preserved handling notes. Record AUTH:<training-code> (1–80 non-whitespace characters after the prefix). This is NOT the instructor console access code. The learner must also be authorized in the console.",
    15: "After authorized access, locate the planning artifact pointing to next action. Record its actual title and any deliberately accepted title variants; require provenance.",
    16: "Combine the verified courier alias, last four IMSI digits and instructor watchlist keyword: TPL:<alias>-<last4>-<keyword>. Alias: 3–20 letters; last4: exactly four digits; keyword: letters, digits, underscores or hyphens. Derive the actual key from this class's evidence, not from a fabricated example.",
}


def lantern_guide(qs, out):
    d = Document()
    front(d, "OPERATION SILENT LANTERN", "Six UFED-only missions • 18 responses • six flags • 125 base points")
    d.p("Scope and source rules", "Heading2")
    d.p("Use the UFED-only learner mission packet, Microsoft Forms blueprint and UFED-only facilitator guide. The broader eight-phase narrative and mapping workbook provide context only. Do not add PA or Streamline tasks. Blank mapping-sheet fields are not known dataset answers.")
    d.p("Six fixed questions, one format-only CASE flag, six dataset-keyed responses and five written reviews. Mission point totals: 20 / 20 / 20 / 20 / 20 / 25.")
    d.p("Automatic validation rules", "Heading2")
    d.p("Flag syntax is checked strictly before content: use the uppercase prefixes shown. Surrounding whitespace is trimmed. Dataset flag content is then compared case-insensitively to configured keys. A valid-looking format alone does not establish a dataset answer.")
    d.p("FLAG-01 is format-only and must use the registered team number (1–999). It does not prove that an actual case was created; inspect the UFED case for that.")
    d.p("Fixed ordinary text uses case/punctuation-insensitive normalization. Content Types requires Chats, Call logs, Locations, Contacts and Documents; Images and Videos may be added without losing credit.")
    d.p("Dataset verification worksheet", "Heading2")
    d.table([("Response", "Classroom key / evidence / verified by")] + [
        (q["code"], "Accepted value(s): ____________________  Evidence: ____________________  Verified: __________")
        for q in qs if q["keyMode"] == "dataset"
    ])
    current = None
    for q in qs:
        if q["section"] != current:
            current = q["section"]
            d.p(f"Mission {current} — {q['sectionTitle']}", "Heading1")
        d.p(f"{q['code']}  |  Question ID {q['id']}  |  {q['points']} points", "Heading2")
        d.p(q["prompt"])
        mode = q["keyMode"]
        if mode == "manual":
            d.p("MANUAL REVIEW — Explicit instructor decision required", "Label")
            d.p(SL_RUBRICS[q["id"]])
            d.p("Point allocations above are suggested instructor grading guidance, not additional automatic checks. Approve only an adequate current response. If denying, give actionable feedback and require a meaningful revision; unchanged or whitespace-only retries do not count.")
        elif mode == "dataset":
            d.p("DATASET — INSTRUCTOR MUST ESTABLISH", "Label")
            d.p(SL_DATASET[q["id"]])
            d.p("Classroom accepted answer(s): ______________________________")
        elif mode == "format":
            d.p("FORMAT-ONLY — Registered team must match", "Label")
            d.p("CASE:JTF-####-TEAM# — exactly four case-number digits and the learner's registered team number. Example for team 3 only: CASE:JTF-0427-TEAM3. Replace the example with the actual classroom case/team.")
        else:
            d.p("FIXED — Baseline answer", "Label")
            if q["kind"] == "multiple":
                d.p("Required selection set: " + "; ".join(q["acceptedAnswers"]) + ". Optional: Images; Videos.")
            else:
                for a in q["acceptedAnswers"]:
                    d.p("Accepted alternative: " + a)
        if q.get("format"):
            d.p("Required format: " + q["format"])
        d.p("Source: " + q["guideReference"])
    checklist(d, lantern=True)
    d.save(out)


if __name__ == "__main__":
    data = json.loads(Path(sys.argv[1]).read_text())
    output = Path("generated-artifacts/instructor-answer-keys")
    output.mkdir(parents=True, exist_ok=True)
    assert [q["id"] for q in data["iron"]] == list(range(1, 121))
    assert sum(q["points"] for q in data["iron"]) == 1370
    assert [q["id"] for q in data["lantern"]] == list(range(1, 19))
    assert sum(q["points"] for q in data["lantern"]) == 125
    iron_guide(data["iron"], output / "IRON_MERIDIAN_Instructor_Answer_Key.docx")
    lantern_guide(data["lantern"], output / "SILENT_LANTERN_Instructor_Answer_Key.docx")
    for file in sorted(output.glob("*.docx")):
        with ZipFile(file) as z:
            assert z.testzip() is None
            for name in z.namelist():
                ET.fromstring(z.read(name))
        print(f"Validated {file} ({file.stat().st_size:,} bytes)")
