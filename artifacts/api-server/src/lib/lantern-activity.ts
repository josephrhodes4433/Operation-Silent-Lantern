import { GetLanternActivityResponse } from "@workspace/api-zod";

type Question = ReturnType<typeof GetLanternActivityResponse.parse>["questions"][number] & { acceptedAnswers: string[] };
type Mode = Question["keyMode"];
type Kind = Question["kind"];
const missions = [
  ["Collection Plan & Preservation Knowledge", "00:20–01:10", "Isolate the device, plan collection, and review Preserved Extraction and SafeGuard as knowledge topics only. No preserved extraction or supported live device is required. Create your case identifier and submit FLAG-01."],
  ["iPhone Triage & Major Match", "01:10–02:05", "Use the Coordinator iPhone and the supplied watchlist first. Connect TurboLink in the correct order, run Triage, and inspect the matching IMEI in the saved Triage report. Submit FLAG-02."],
  ["iPhone Targeted Collection & Courier Alias", "02:05–03:00", "Use the same iPhone as Mission 2. Compare Content Types and Applications extraction with Triage, then refine the alias from the message naming the courier. Use the Triage report timestamp and UFED outputs as sources. Submit FLAG-03."],
  ["Individual SIM Examination", "03:10–04:00", "Extract your assigned SIM with a SIM or multiSIM adapter. SIMs are not standardized: record your own IMSI and actual results, including an honest no-content finding where applicable. Instructor validation is individual. Submit FLAG-04."],
  ["UFED Classic Tools: ZTE", "04:00–04:50", "Use UFED Classic tools with the training ZTE. Configure the required settings, perform Advanced Logical, File System, and Physical extractions, and review the Collection Summary Reports for the chipset. Submit FLAG-05."],
  ["Fuse & Brief (UFED-only)", "04:50–05:40", "Combine the confirmed iPhone alias, your own instructor-approved SIM IMSI, and the classroom watchlist keyword. Submit FLAG-06, write a 6–8 sentence intelligence summary, and identify next steps separately. Reserve 05:40–06:00 for the hotwash."],
];
export const hintTexts = [
  "Keep the device powered on and isolate it from networks. Preserved/SafeGuard questions are knowledge-based; UFDX is the container for multiple extractions.",
  "Triage comes first on the iPhone. Save and open the report; check Major severity and the matching IMEI. Use datatype and value exactly.",
  "Use the same iPhone. Chats is not a Content Types option; look for the courier-naming message and cite its timestamp/source.",
  "Your SIM may contain no contacts or messages. Record the actual IMSI, report what is present or absent, and submit it for individual instructor approval.",
  "Use UFED Classic tools. Check Developer Options, Stay Awake, USB Debugging, and MTP; compare all three Collection Summary Reports.",
  "Use the alias from Mission 3, the last four digits of your approved SIM IMSI, and the classroom keyword. Keep next steps separate from the 6–8 sentence summary.",
];
function q(id: number, code: string, section: number, prompt: string, keyMode: Mode, points = 5, acceptedAnswers: string[] = [], format = "", kind: Kind = "short", options: string[] = []): Question {
  return {
    id, code, section, sectionTitle: missions[section - 1][0], prompt, keyMode, points, acceptedAnswers, format, kind, options,
    guideReference: `CEDI feedback workbook + CTF Feedback 2 · ${code}`,
    isFlag: code.includes("FLAG"), isFinalSummary: code === "M6-Q1",
    correctAnswerAvailable: keyMode === "fixed" || keyMode === "format", manualReview: keyMode === "manual",
  };
}
// New identities prevent earlier answers, approvals and classroom keys from
// silently acquiring different meanings. Original IDs 1–18 remain archived.
export const lanternQuestions: Question[] = [
  q(101, "M1-Q1", 1, "When you first obtain the device, what should you do in most instances?", "fixed", 5, ["Isolate it from the network, but keep it powered on"], "", "single", ["Immediately start looking through it", "Isolate it from the network, but keep it powered on", "Power it off"]),
  q(102, "M1-Q2", 1, "Which approach best supports speed-to-first-intel while preserving integrity?", "fixed", 5, ["Triage Scan first, then targeted extractions"], "", "single", ["Full extraction first, then decide what is relevant", "Triage Scan first, then targeted extractions", "Browse the device manually before documenting it"]),
  q(103, "M1-Q3", 1, "If additional storage media (USB drives or SD cards) are found, what tool can you use to extract the data?", "fixed", 5, ["UFED Classic Mass Storage extraction tool"], "", "single", ["Inseyets Advanced extraction tools", "UFED Classic Mass Storage extraction tool", "Plug it into a computer and browse the drive"]),
  q(104, "M1-Q4", 1, "What evidence container file type is generated at the end of multiple extractions?", "fixed", 5, ["UFDX", ".ufdx"]),
  q(105, "M1-Q5", 1, "Which feature tackles an iOS inactivity timer, rendering it irrelevant?", "fixed", 5, ["SafeGuard", "Safeguard Mode"], "", "single", ["SafeGuard", "Airplane mode", "Mass Storage"]),
  q(106, "M1-Q6", 1, "Which workflow is used to preserve iOS data pending authorization? This is a knowledge question; do not perform a preserved extraction.", "fixed", 5, ["Preserved Extraction", "Preserved Extraction workflow"], "", "single", ["Preserved Extraction", "Mass Storage extraction", "Unrestricted manual browsing"]),
  q(107, "M1-Q7", 1, "Briefly describe a situation in which you would use Preserved Extraction or SafeGuard Mode. Explain the preservation or inactivity-timer concern. This is knowledge-based; no live preserved extraction is required.", "manual", 5, [], "", "long"),
  q(108, "M1-FLAG01", 1, "Enter FLAG-01 using your case identifier and your registered team number.", "format", 10, [], "CASE:JTF-####-TEAM# (example for team 3: CASE:JTF-0427-TEAM3)"),
  q(109, "M2-Q1", 2, "What is the proper order to connect a device via TurboLink?", "fixed", 5, ["Connect TurboLink to power and computer → Turn on TurboLink → Wait for the connect-device indicator → Connect device"], "", "single", ["Connect device → Turn on TurboLink → Connect power and computer", "Connect TurboLink to power and computer → Turn on TurboLink → Wait for the connect-device indicator → Connect device", "Turn on the device → Connect device → Connect TurboLink to power"]),
  q(110, "M2-Q2", 2, "List at least two criteria that may be used in a Triage Scan (e.g., keyword + phone number).", "manual", 5, [], "", "long"),
  q(111, "M2-Q3", 2, "Which Triage match type indicates the highest priority match?", "fixed", 5, ["Major"], "", "single", ["Minor", "Major", "No match"]),
  q(112, "M2-FLAG02", 2, "Save and open the Triage report. Enter the data type and details for the first item that matched as Major Severity. Use the supplied iPhone watchlist; the intended classroom match is its IMEI.", "dataset", 10, [], "MAJOR:<datatype>:<value>"),
  q(113, "M3-Q1", 3, "What manual extraction options are available for this iPhone? Select the supported manual collection options, not Full File System or SIM.", "fixed", 5, ["Content Types", "Applications", "Triage Scan"], "", "multiple", ["Full File System", "SIM", "Content Types", "Applications", "Triage Scan"]),
  q(114, "M3-Q2", 3, "Select the Content Types most useful for rendezvous instructions and courier identification. Use the same iPhone as Triage. Chats is not a Content Types option; Images and Videos are excluded from this question.", "fixed", 5, ["Call logs", "Locations", "Contacts", "Documents"], "", "multiple", ["Call logs", "Locations", "Contacts", "Documents"]),
  q(115, "M3-FLAG03", 3, "Enter FLAG-03: the courier alias named in the message on the same iPhone used for Triage.", "dataset", 10, [], "ALIAS:<3–20 letters> (no spaces)"),
  q(116, "M3-Q3", 3, "Provide two supporting indicators (timestamp/source) of the alias name. Use the courier-naming message, saved Triage report, or UFED extraction output; compare what Triage and targeted collection reveal.", "manual", 5, [], "", "long"),
  q(117, "M4-FLAG04", 4, "Enter FLAG-04: the IMSI from your own assigned SIM. Your instructor will verify it individually; SIM datasets differ between learners.", "manual", 10, [], "IMSI:<10–18 digits>"),
  q(118, "M4-Q1", 4, "Report what your own SIM extraction contains. Give one actual contact/message with its source if present; if neither is present, explicitly report that result and cite the SIM extraction summary. Do not invent content or a cross-mission link.", "manual", 5, [], "", "long"),
  q(119, "M4-Q2", 4, "During SIM extraction, which adapter can be used? TurboLink is not required for UFED Classic SIM extraction.", "fixed", 5, ["SIM adapter", "multiSIM adapter", "SIM adapter or multiSIM adapter"], "", "single", ["SIM adapter or multiSIM adapter", "TurboLink is always required", "No adapter is required"]),
  q(120, "M5-Q1", 5, "Is the training ZTE device supported by UFED Classic tools?", "fixed", 5, ["Yes"], "", "single", ["Yes", "No"]),
  q(121, "M5-Q2", 5, "What steps does UFED require for a File System extraction on the training ZTE phone? Select all that apply.", "fixed", 5, ["Enable Developer Options", "Enable Stay Awake", "Enable USB Debugging", "Enable MTP"], "", "multiple", ["Enable Developer Options", "Enable Stay Awake", "Enable USB Debugging", "Enable MTP"]),
  q(122, "M5-Q3", 5, "What types of extraction can you perform on the training ZTE phone? Select all three, then perform them using UFED Classic tools.", "fixed", 5, ["Advanced Logical", "File System", "Physical"], "", "multiple", ["Advanced Logical", "File System", "Physical"]),
  q(123, "M5-FLAG05", 5, "Review the Collection Summary Reports from the ZTE extractions. What was the device chipset?", "fixed", 10, ["MSM8909"]),
  q(124, "M6-FLAG06", 6, "Enter FLAG-06 using your verified iPhone alias, the last four digits of your own approved SIM IMSI, and the instructor's watchlist keyword.", "dataset", 10, [], "TPL:<alias>-<IMSI last 4 digits>-<keyword>"),
  q(125, "M6-Q1", 6, "Final Intelligence Summary (6–8 sentences): Who / What / Where / When / So-what. Cite your artifact sources and explain corroboration.", "manual", 10, [], "", "long"),
  q(126, "M6-Q2", 6, "What are the next steps you would take? Explain the proposed actions and the evidence or uncertainty each would address.", "manual", 5, [], "", "long"),
];
export const missionFlagIds = [108, 112, 115, 117, 123, 124];
export const legacyQuestionCodes = ["M1-Q1", "M1-FLAG01", "M1-Q2", "M2-Q1", "M2-FLAG02", "M2-Q2", "M3-Q1", "M3-FLAG03", "M3-Q2", "M4-FLAG04", "M4-Q1", "M4-Q2", "M5-Q1", "M5-FLAG05", "M5-Q2", "M6-FLAG06", "M6-Q1", "M6-Q2"];
export function publicLanternActivity(keys: Map<number, string[]>) {
  return GetLanternActivityResponse.parse({
    title: "OPERATION SILENT LANTERN", course: "Cellebrite UFED | Defense & Intelligence", duration: "6 hours",
    totalFlags: lanternQuestions.length, totalPoints: lanternQuestions.reduce((n, item) => n + item.points, 0),
    scenario: "You are a Joint Task Force Mobile Exploitation Cell supporting a coalition partner in a contested information environment. A hostile network is coordinating logistics disruption and influence operations using disposable devices, encrypted chats, and staged media drops. A partner unit executed a lawful, authorized site exploitation and recovered training evidence for rapid triage. Triage the Coordinator iPhone first, then use targeted collection on that same iPhone to refine the courier alias and details. Examine your own assigned SIM and the UFED Classic ZTE training phone, and produce a concise, defensible lead package.",
    rules: [
      "Work only on provided training devices/datasets. Do not connect personal devices.",
      "UFED-only: use UFED outputs and saved reports; no PA or Streamline knowledge is required.",
      "Follow classroom SOPs: document case identifiers, handling notes, and artifact provenance.",
      "Preserved Extraction and SafeGuard are knowledge-based only; classroom phones do not support the preserved workflow and no preserved extraction is supplied.",
      "Triage and targeted collection use the same iPhone. SIMs differ: each IMSI and SIM finding requires individual instructor review.",
      "Capture each flag and obtain instructor approval of written responses to advance. Denied responses require a meaningful revision and another review.",
      "Three hint tokens per team; each hint costs 2 points. Wrong submissions have no penalty.",
      "Accuracy and defensible reasoning matter more than speed. A 10-minute optional break/intel inject follows Mission 3.",
    ],
    evidence: ["Coordinator iPhone training device/dataset — Triage and targeted collection", "Training ZTE phone — UFED Classic tools", "Individually assigned training SIM card and SIM/multiSIM adapter", "TurboLink for supported iPhone collection; not mandatory for UFED Classic SIM extraction", "Instructor watchlist brief: keywords, phone numbers, and location focus areas"],
    sections: missions.map(([title, time, inject], i) => ({ id: i + 1, title, time, inject, flags: `FLAG-0${i + 1}`, points: lanternQuestions.filter(item => item.section === i + 1).reduce((n, item) => n + item.points, 0) })),
    questions: lanternQuestions.map(({ acceptedAnswers: _private, ...question }) => ({ ...question, correctAnswerAvailable: question.keyMode === "fixed" || question.keyMode === "format" || (question.keyMode === "dataset" && keys.has(question.id)) })),
  });
}
export const hasLanternResponse = (value: string | string[]) => Array.isArray(value) ? value.length > 0 : !!value.trim();
const normalise = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
export function flagFormatValid(id: number, value: string, teamNumber?: number) {
  if (id === 108) {
    const match = /^CASE:JTF-\d{4}-TEAM([1-9]\d{0,2})$/.exec(value);
    return !!match && (teamNumber === undefined || Number(match[1]) === teamNumber);
  }
  if (id === 115) return /^ALIAS:[A-Za-z]{3,20}$/.test(value);
  if (id === 112) return /^MAJOR:[^:\r\n]+:[^:\r\n]+$/.test(value);
  if (id === 117) return /^IMSI:\d{10,18}$/.test(value);
  if (id === 124) return /^TPL:[A-Za-z]{3,20}-\d{4}-[A-Za-z0-9_-]+$/.test(value);
  return true;
}
export function evaluateLantern(question: Question, value: string | string[], keys: Map<number, string[]>, teamNumber: number, _authorized: boolean, responses?: Record<string, { value: string | string[]; reviewStatus?: string }>) {
  const result = (status: "correct" | "incorrect" | "manual" | "unkeyed", feedback: string) => ({ status, feedback, correct: status === "correct" ? true : status === "incorrect" ? false : null, earnedPoints: status === "correct" ? question.points : 0 });
  if (!hasLanternResponse(value)) return result("unkeyed", "Response cleared.");
  if (question.isFlag && (typeof value !== "string" || !flagFormatValid(question.id, value.trim(), teamNumber))) return result("incorrect", `Check the strict format: ${question.format}. Retries have no penalty.`);
  if (question.keyMode === "manual") return result("manual", "Response saved for individual instructor review.");
  if (question.keyMode === "format") return result("correct", "Case format and registered team number confirmed.");
  const expected = question.keyMode === "fixed" ? question.acceptedAnswers : keys.get(question.id);
  if (!expected?.length) return result("unkeyed", "Saved pending instructor configuration of the classroom answer key. Format alone does not verify a value.");
  let correct: boolean;
  if (Array.isArray(value)) {
    const selected = new Set(value.map(normalise));
    const required = new Set(expected.map(normalise));
    correct = selected.size === required.size && [...selected].every(item => required.has(item));
  } else if (question.id === 124) {
    // Configure only the keyword, not a shared full TPL containing one SIM's IMSI.
    const parts = /^TPL:([A-Za-z]{3,20})-(\d{4})-(.+)$/.exec(value.trim())!;
    const alias = String(responses?.["115"]?.value ?? "").split(":")[1];
    const imsi = String(responses?.["117"]?.value ?? "").split(":")[1];
    if (!alias || !imsi || responses?.["117"]?.reviewStatus !== "approved") return result("unkeyed", "Your courier alias and individually approved SIM IMSI are required first.");
    const aliasVerified = keys.get(115)?.some(answer => answer.toLowerCase() === `alias:${alias}`.toLowerCase());
    correct = !!aliasVerified && parts[1].toLowerCase() === alias.toLowerCase() && parts[2] === imsi.slice(-4) && expected.some(answer => answer.toLowerCase() === parts[3].toLowerCase());
  } else if (question.isFlag) {
    correct = expected.some(answer => answer.toLowerCase() === value.trim().toLowerCase());
  } else correct = expected.some(answer => normalise(answer) === normalise(value));
  return correct ? result("correct", `Validated. ${question.points} points earned.`) : result("incorrect", "Not yet correct. Re-check your UFED output and retry without penalty.");
}
