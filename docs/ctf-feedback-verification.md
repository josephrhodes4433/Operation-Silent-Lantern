# CTF feedback implementation and verification

## Sources and precedence

- `CEDI_CTF_App_Recommendations-1_1792081365328.xlsx`, Sheet1: all requested changes and additional questions.
- `CTF_Feedback_2_1792081451038.docx`: revised workflow, hardware limitations, and copy corrections.
- Earlier packets supply context, but do not override this feedback. SILENT LANTERN remains six UFED-only missions. IRON MERIDIAN remains eight sections, 120 questions, and 1,370 points.

## SILENT LANTERN traceability

Question labels below refer to the original workbook. Current labels changed because additional questions were inserted and the two iPhone missions were reordered.

| Feedback item | Implemented behavior |
| --- | --- |
| M1 Q1: replace text field with choices | Current M1-Q2 (102) is single-choice: Triage first, then targeted extraction. |
| M1 Q2: multiple-extraction container wording | M1-Q4 (104) asks what evidence container is generated at the end of multiple extractions; UFDX self-validates. |
| Initial-handling optional question | M1-Q1 (101): isolate networks and keep the device powered on. |
| Storage-device optional question | M1-Q3 (103): UFED Classic Mass Storage. |
| Preserved extraction unavailable on classroom phones | Mission 1 includes knowledge-based SafeGuard and Preserved Extraction questions (105–107); no supplied preserved image or compatible live device is required. |
| SafeGuard optional question | M1-Q5 (105) asks about the iOS inactivity timer. |
| Former M5 FLAG05 | M1-Q7 (107) asks for a defensible Preserved Extraction / SafeGuard use case, instructor-reviewed. No AUTH flag or live authorization request. |
| Switch Missions 2 and 3 | Mission 2 is iPhone Triage; Mission 3 is targeted collection on the **same iPhone**. Mission instructions identify the matching IMEI and progressively refined alias. |
| TurboLink connection-order question | M2-Q1 (109): power/computer, turn on, wait for connection indicator, then device. |
| Former M3 Q1 | M2-Q2 (110): criteria that may be used in a Triage Scan, not invented required criteria. Instructor-reviewed. |
| Former M3 Q2 before Major flag | M2-Q3 (111): Major, immediately before M2-FLAG02 (112). |
| Former M3 FLAG03 | M2-FLAG02 (112): save/open report; enter data type and first Major-severity match details. Class-specific instructor key. |
| Optional manual extraction options | M3-Q1 (113): Content Types, Applications, and Triage Scan; multiple-choice. |
| Former M2 Q1: Chats / optional media | M3-Q2 (114): Chats is not offered; Images and Videos are removed rather than optional scoring. Call logs, Locations, Contacts, and Documents are required selections. |
| Former M2 FLAG02 | M3-FLAG03 (115): alias named in the message, from the same iPhone. Class-specific instructor key. |
| Former M2 Q2 | M3-Q3 (116): two supporting indicators, timestamp/source, comparing Triage with targeted collection. Instructor-reviewed. |
| M4 FLAG04: SIMs differ | M4-FLAG04 (117): 10–18 digit IMSI format check plus **individual instructor approval**, not one shared IMSI key. |
| M4 Q1: SIM contents not standardized | M4-Q1 (118): report the learner's actual contacts/messages, or an evidence-supported finding that neither is present. No fabricated common contact or cross-mission pivot is required. |
| M4 Q2: adapter | M4-Q2 (119): SIM adapter or multiSIM adapter; TurboLink not required. |
| Replace Mission 5 with optional Classic questions | ZTE device support, all four preparation steps, all three extraction types, and MSM8909 chipset (120–123). Instructions require performing Advanced Logical, File System, and Physical extraction. |
| Former M5 Q2 planning artifact | Removed from the current graded curriculum. |
| M6 Q1: remove next step from summary | M6-Q1 (125): 6–8 sentences, Who / What / Where / When / So-what, with corroboration. No next-step instruction in that prompt. |
| M6 Q2: replace with next steps | M6-Q2 (126): separate next investigative steps; instructor-reviewed. |
| Individual SIM in final package | M6-FLAG06 (124): alias plus the learner's own approved IMSI last four digits plus class watchlist keyword. Instructors enter **only the keyword** in the shared key field. |
| No PA requirement | No extra PA/Streamline mission or PA courier-phone bonus was added. The feedback mentioned that bonus as optional, while the chosen scope remains UFED-only. |
| American spelling and Oxford commas | Updated scenario, evidence brief, and fictitious disclaimer. |

There are 26 responses, six flags, and 165 base points. All recommended additional questions were included. Real device findings remain subject to classroom verification; synthetic test artifacts are not installed as classroom keys.

## IRON MERIDIAN copy corrections

- Scenario: air-gapped workstation, Inseyets Physical Analyzer, and the course software folder.
- Scenario ending: hashed, independently validated, and traceable.
- PIR 3: comma after “backup hosts.”
- Activity 01: “standardized” and “documented, and repeatable.”
- Activity 04: “collection opportunities, and locations.”
- Activity 05: “file sizes, and creation dates.”
- Disclaimer: “All people, organizations, locations, and events are fictitious.”
- No renumbering, station removal, classroom key overwrite, or learner-record deletion.

## Saved-work compatibility

The new SILENT LANTERN bank uses a separate ID range. Earlier responses, notes,
and review decisions remain read-only and exportable, with protected historical
review access for instructors. Earlier approvals, hint penalties, and final
submission state do not satisfy the revised curriculum. Existing names, emails,
resume links, and database records are retained. No new table or destructive
migration is required; the existing additive history backfill also recognizes
the revised written-question IDs.

## Self-validation

- Generated API clients/validators and workspace TypeScript checks.
- Eleven resource/format/review/HTTP regression tests: all IRON source answers, revised SILENT curriculum, individually approved IMSI dependency, archived-work isolation, and rejection of unsafe grading bypasses.
- Three IRON question-authoring tests, updated from obsolete partial-bank totals to the complete 120-question bank.
- Real disposable PostgreSQL: 186 endpoint checks, including two complete 26-response learners with different SIM IMSIs, 165-point final scores, final submission and resume, individual approval history, invalid SIM/key rejection, retired authorization endpoint, denied response revision, stale review rejection, transactional rollback, concurrent reviews, and repeatable migration.
- Learner-detail persistence checks: refresh, resume, retries, recovery, edits, corrupt local storage.
- Browser: live read-only desktop/mobile overview checks for both activities. Synthetic, fail-closed intercepted UI checks for onboarding once, revised controls, draft/submit behavior, denial/revision/approval, reload/resume, history, pending filter, individual SIM review, keyword-only keys, archives, responsive layout, and keyboard navigation.

Browser contract checks do not replace database persistence tests. No shared
classroom dataset key or real instructor secret was used for test writes.
Hardware UFED extractions and actual instructor email delivery cannot be
verified by this software-only test pass.
