import { GetLanternActivityResponse } from "@workspace/api-zod";

type Question = ReturnType<typeof GetLanternActivityResponse.parse>["questions"][number] & { acceptedAnswers: string[] };
type Mode = Question["keyMode"];
type Kind = Question["kind"];
const missions = [
  ["Establish the Collection Plan", "00:20–01:10", "Create your case identifier and document your initial collection strategy. Initialize authorized UFED workflows and confirm where extractions will be saved. Submit FLAG-01."],
  ["Runner Phone Rapid Indicators (Content Types)", "01:10–02:05", "Perform a targeted Android Content Types collection to find the courier alias and near-term rendezvous indicators. Submit FLAG-02 and two supporting indicators."],
  ["Watchlist Confirmation (Triage)", "02:05–03:00", "Run a UFED Triage scan using the supplied watchlist. Identify the first criterion that produces a Major match and submit FLAG-03."],
  ["SIM Pivot", "03:10–04:00", "Conduct a SIM extraction and identify subscriber-level identifiers. Find a contact or message supporting a pivot from Missions 2–3. Submit FLAG-04."],
  ["Restricted Evidence (Preserved Workflow)", "04:00–04:50", "Use the preserved iOS workflow pending authorization. Document preserved handling and why it is required. After instructor authorization, locate the planning artifact pointing to the next action and submit FLAG-05."],
  ["Fuse & Brief (UFED-only)", "04:50–05:40", "Corroborate key indicators across UFED outputs and notes — do not rely on PA. Assemble FLAG-06 and write a concise evidence-backed intelligence summary. Reserve 05:40–06:00 for the hotwash."],
];
export const hintTexts = [
  "Review Extraction Wizard ‘Saving the extraction’ output type. Check the exact CASE identifier format and your team number.",
  "Look for the most recent instruction thread and associated location references.",
  "In the Triage Profiles view, note which criteria returns Major versus Minor.",
  "Re-check SIM extraction prerequisites and the SIM adapter connection steps.",
  "Authorization is released only after you demonstrate preserved handling notes to the instructor.",
  "Assemble the target package from the confirmed courier alias, the last four IMSI digits and the instructor's watchlist keyword. Corroborate Where and When with artifact citations.",
];
function q(id: number, code: string, section: number, prompt: string, keyMode: Mode, points = 5, acceptedAnswers: string[] = [], format = "", kind: Kind = "short", options: string[] = []): Question {
  return {
    id, code, section, sectionTitle: missions[section - 1][0], prompt, keyMode, points, acceptedAnswers, format, kind, options,
    guideReference: `SILENT LANTERN UFED-only blueprint · ${code}`,
    isFlag: code.includes("FLAG"), isFinalSummary: code === "M6-Q1",
    correctAnswerAvailable: keyMode === "fixed" || keyMode === "format", manualReview: keyMode === "manual",
  };
}
export const lanternQuestions: Question[] = [
  q(1, "M1-Q1", 1, "Which approach best supports speed-to-first-intel while preserving integrity?", "fixed", 5, ["Triage Scan first, then targeted extractions", "B. Triage Scan first, then targeted extractions", "Triage first then targeted extraction"]),
  q(2, "M1-FLAG01", 1, "Enter FLAG-01 using your case identifier and your registered team number.", "format", 10, [], "CASE:JTF-####-TEAM# (example: CASE:JTF-0427-TEAM3)"),
  q(3, "M1-Q2", 1, "What evidence container file is generated at the end of extraction?", "fixed", 5, ["UFDX", ".ufdx"]),
  q(4, "M2-Q1", 2, "Select all Content Types most useful for rendezvous instructions and courier identification. Images and Videos are optional.", "fixed", 5, ["Chats", "Call logs", "Locations", "Contacts", "Documents"], "", "multiple", ["Chats", "Call logs", "Locations", "Contacts", "Documents", "Images", "Videos"]),
  q(5, "M2-FLAG02", 2, "Enter FLAG-02: the courier alias from the shared dataset.", "dataset", 10, [], "ALIAS:<3–20 letters> (no spaces)"),
  q(6, "M2-Q2", 2, "Provide two supporting indicators (timestamp + location indicator/source).", "manual", 5, [], "", "long"),
  q(7, "M3-Q1", 3, "List at least two watchlist criteria types used in Triage (e.g., keyword + phone number).", "manual", 5, [], "", "long"),
  q(8, "M3-FLAG03", 3, "Enter FLAG-03: the first Major match from the shared dataset.", "dataset", 10, [], "MAJOR:<datatype>:<value>"),
  q(9, "M3-Q2", 3, "Which Triage outcome indicates the highest priority match?", "fixed", 5, ["Major"]),
  q(10, "M4-FLAG04", 4, "Enter FLAG-04: the IMSI from the shared SIM.", "dataset", 10, [], "IMSI:<10–18 digits>"),
  q(11, "M4-Q1", 4, "Provide one SIM contact/message that supports a pivot to Missions 2–3.", "manual", 5, [], "", "long"),
  q(12, "M4-Q2", 4, "During SIM extraction, which hardware must be connected?", "fixed", 5, ["TurboLink and SIM adapter", "TurboLink SIM adapter", "SIM adapter and TurboLink"]),
  q(13, "M5-Q1", 5, "Which workflow is used to preserve iOS data pending authorization?", "fixed", 5, ["Preserved Extraction", "Preserved Extraction workflow"]),
  q(14, "M5-FLAG05", 5, "Enter FLAG-05 using the training authorization token released by your instructor after reviewing preserved handling notes.", "dataset", 10, [], "AUTH:<training-code-from-instructor>"),
  q(15, "M5-Q2", 5, "After authorization, identify the planning artifact title that points to next action.", "dataset"),
  q(16, "M6-FLAG06", 6, "Enter FLAG-06: assemble the final target package code from your prior missions.", "dataset", 10, [], "TPL:<alias>-<IMSI last 4 digits>-<keyword>"),
  q(17, "M6-Q1", 6, "Final Intelligence Summary (6–8 sentences): Who / What / Where / When / So-what / Next step. Cite your artifact sources and explain corroboration.", "manual", 10, [], "", "long"),
  q(18, "M6-Q2", 6, "List two artifacts you used to corroborate your final ‘Where’ and ‘When’ assessments.", "manual", 5, [], "", "long"),
];
export const missionFlagIds = [2, 5, 8, 10, 14, 16];
export function publicLanternActivity(keys: Map<number, string[]>) {
  return GetLanternActivityResponse.parse({
    title: "OPERATION SILENT LANTERN", course: "Cellebrite Defense & Intelligence · Inseyets.UFED v10.9-aligned", duration: "6 hours",
    totalFlags: 18, totalPoints: 125,
    scenario: "You are a Joint Task Force Mobile Exploitation Cell supporting a coalition partner in a contested information environment. A hostile network is coordinating logistics disruption and influence operations using disposable devices, encrypted chats and staged media drops. A partner unit executed a lawful, authorized site exploitation and recovered a small evidence set for rapid triage. Extract prioritized intelligence, identify the operational hub and next movement window, and produce a concise, defensible lead package.",
    rules: [
      "Work only on provided training devices/datasets. Do not connect personal devices.",
      "UFED-only: do not use Physical Analyzer (PA) or Streamline.",
      "Follow classroom SOPs: document case identifiers, handling notes and artifact provenance.",
      "Do not circumvent security beyond the lab’s authorized workflows and instructor guidance.",
      "All teams use the same dataset and progress independently. Capture each flag to unlock the next mission.",
      "Three hint tokens per team; each hint costs 2 points. Wrong submissions have no penalty.",
      "Accuracy and defensible reasoning matter more than speed. A 10-minute optional break/intel inject follows Mission 3.",
    ],
    evidence: ["Android ‘Runner Phone’ training dataset", "iOS ‘Coordinator Device’ — preserved handling required", "Training SIM card, TurboLink and SIM adapter", "Instructor watchlist brief: keywords, phone numbers and location focus areas"],
    sections: missions.map(([title, time, inject], i) => ({ id: i + 1, title, time, inject, flags: `FLAG-0${i + 1}`, points: i === 5 ? 25 : 20 })),
    questions: lanternQuestions.map(({ acceptedAnswers: _private, ...question }) => ({ ...question, correctAnswerAvailable: question.keyMode === "fixed" || question.keyMode === "format" || keys.has(question.id) })),
  });
}
export const hasLanternResponse = (value: string | string[]) => Array.isArray(value) ? value.length > 0 : !!value.trim();
const normalise = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
export function flagFormatValid(id: number, value: string, teamNumber?: number) {
  if (id === 2) {
    const match = /^CASE:JTF-\d{4}-TEAM([1-9]\d{0,2})$/.exec(value);
    return !!match && (teamNumber === undefined || Number(match[1]) === teamNumber);
  }
  if (id === 5) return /^ALIAS:[A-Za-z]{3,20}$/.test(value);
  if (id === 8) return /^MAJOR:[^:\r\n]+:[^:\r\n]+$/.test(value);
  if (id === 10) return /^IMSI:\d{10,18}$/.test(value);
  if (id === 14) return /^AUTH:\S{1,80}$/.test(value);
  if (id === 16) return /^TPL:[A-Za-z]{3,20}-\d{4}-[A-Za-z0-9_-]+$/.test(value);
  return true;
}
export function evaluateLantern(question: Question, value: string | string[], keys: Map<number, string[]>, teamNumber: number, authorized: boolean) {
  const result = (status: "correct" | "incorrect" | "manual" | "unkeyed", feedback: string) => ({ status, feedback, correct: status === "correct" ? true : status === "incorrect" ? false : null, earnedPoints: status === "correct" ? question.points : 0 });
  if (!hasLanternResponse(value)) return result("unkeyed", "Response cleared.");
  if (question.keyMode === "manual") return result("manual", "Written response saved for instructor review.");
  if (question.isFlag && (typeof value !== "string" || !flagFormatValid(question.id, value.trim(), teamNumber))) return result("incorrect", `Check the strict format: ${question.format}. Retries have no penalty.`);
  if ((question.id === 14 || question.id === 15) && !authorized) return result("unkeyed", "Your instructor must approve your preserved handling notes before releasing the training authorization token.");
  if (question.keyMode === "format") return result("correct", "Case format and registered team number confirmed. Mission 2 unlocked.");
  const expected = question.keyMode === "fixed" ? question.acceptedAnswers : keys.get(question.id);
  if (!expected?.length) return result("unkeyed", "Saved pending instructor configuration of the shared-dataset answer key. A matching format alone does not verify the dataset value.");
  let correct: boolean;
  if (Array.isArray(value)) {
    const selected = new Set(value.map(normalise));
    const required = expected.map(normalise);
    const allowed = new Set([...required, "images", "videos"]);
    correct = required.every(item => selected.has(item)) && [...selected].every(item => allowed.has(item));
  } else if (question.isFlag) {
    correct = expected.some(answer => answer.toLowerCase() === value.trim().toLowerCase());
  } else correct = expected.some(answer => normalise(answer) === normalise(value));
  return correct ? result("correct", `Validated. ${question.points} points earned.${question.isFlag ? " Mission flag captured." : ""}`) : result("incorrect", "Not yet correct. Re-check your UFED output and retry without penalty. A hint token is optional and costs 2 points.");
}
