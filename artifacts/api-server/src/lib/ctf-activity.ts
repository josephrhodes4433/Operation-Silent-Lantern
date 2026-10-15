import sourceQuestions from "../data/questions.json";
import { applyFacilitatorKey } from "./ctf-facilitator-key";
import { withClassroomChoices, withObjectiveChoices } from "./iron-choice-questions";

export interface Question {
  id: number;
  section: number;
  sectionTitle: string;
  prompt: string;
  kind: "single" | "multiple" | "short" | "number" | "long";
  options: string[];
  points: number;
  guideReference: string;
  category: string;
  acceptedAnswers: string[];
  validationMethod: string;
  validationMode?: "normalised" | "exact" | "numeric" | "manual" | "dataset";
  facilitatorAnswers?: string[];
  facilitatorNote?: string;
  incorrectFeedback?: string;
}

export const questions = (sourceQuestions as Question[]).map(applyFacilitatorKey).map(withObjectiveChoices);
export const isManual = (q: Question) => q.validationMode ? q.validationMode === "manual" : q.kind === "long" || [117, 118].includes(q.id);
export const requiresReview = (q: Question, keys: Map<number, string[]>) =>
  !["single", "multiple"].includes(withClassroomChoices(q, keys.get(q.id)).kind);
export const validationMode = (q: Question): NonNullable<Question["validationMode"]> =>
  q.validationMode ?? (isManual(q) ? "manual" : q.category === "dataset" ? "dataset" : q.kind === "number" ? "numeric" : q.id === 99 ? "exact" : "normalised");

const sectionDetails = [
  ["Workstation Preparation and Case Build", "0810–0840", "1–10", "The J2 requires all exploitation to be performed under standardized configuration, documented, and repeatable. Build the workstation, build the ALPHA case, verify the image, and prove the build is repeatable before examining messages."],
  ["ALPHA Triage: Pattern of Life and Network", "0840–0940", "11–29", "ALPHA belongs to the yard leaseholder, assessed as a facilitator. Establish who he contacts, what he calls things, and his activity between 1 February and 1 April 2022. Run the partner agency's MERIDIAN image hash set and check for malware."],
  ["BRAVO Verification and Validation", "0940–1040", "30–43", "BRAVO is the courier's phone. Every finding must be independently validated before it leaves the building: the tool's answer, then the raw database or a second tool saying the same thing. Investigate the native message thread and validate the photographs."],
  ["CHARLIE: The Foreign-Language Node", "1040–1210", "44–66", "Work the password-protected iTunes backup of a handset that remains at large. Establish its device profile, communications, collection opportunities, and locations. Carefully review automated classifications and validate newly parsed artifacts."],
  ["DELTA: Database Exploitation", "1250–1400", "67–79", "The targeting cell needs original filenames, file paths, file sizes, and creation dates—not just pictures. Work in Photos.sqlite, join the required tables in SQLite Wizard, map the results back into Analyzed Data, and validate the output against the raw database. Document missing primary keys and any discrepancy."],
  ["ECHO and FOXTROT: Legacy Handsets and Hex-Level Recovery", "1400–1520", "80–102", "Work the legacy handset memory images: benchmark the hex data, decode 7-bit SMS and PDU timestamps, recover messages and images, and use regular expressions to locate email addresses. Tag recovered evidence and validate the confidence of location findings."],
  ["GOLF: The Unsupported Device", "1520–1600", "103–109", "GOLF is an unsupported binary dump, not an empty device. Review the plug-in chains, apply the correct chain, compare it with the default output, and document the chain composition and recovered intelligence so the next analyst can reproduce your work."],
  ["Dissemination and the Commander's Brief", "1600–1800", "110–120", "Two audiences, two products, one set of findings. The field team needs device attributes and account identifiers. The analytical cell and partner agency need the comprehensive protected product. Then brief the PIRs with evidence and validation methodology."],
];

export function sectionForFlag(id: number) {
  const limits = [10, 29, 43, 66, 79, 102, 109, 120];
  const section = limits.findIndex(limit => id <= limit) + 1;
  return { section, sectionTitle: sectionDetails[section - 1][0] };
}

export function mergeQuestions(overrides: Question[]) {
  const merged = new Map(questions.map(q => [q.id, q]));
  for (const q of overrides) merged.set(q.id, { ...q, ...sectionForFlag(q.id) });
  return [...merged.values()].sort((a, b) => a.id - b.id);
}

export function publicActivity(keys: Map<number, string[]>, activityQuestions = questions) {
  activityQuestions = activityQuestions.map(q => withClassroomChoices(q, keys.get(q.id)));
  return {
    title: "OPERATION IRON MERIDIAN",
    course: "Cellebrite Analysis for Defense and Intelligence",
    duration: "6 hours",
    totalFlags: activityQuestions.length,
    totalPoints: activityQuestions.reduce((total, q) => total + q.points, 0),
    sections: sectionDetails.map(([title, time, flags, inject], index) => ({
      id: index + 1, title, time, flags,
      inject: index >= 4 && index <= 6 && activityQuestions.some(q => q.section === index + 1 && !questions.some(original => original.id === q.id))
        ? "Your instructor has supplied revised station questions below. Any remaining blank flag rows are still unavailable; ask your instructor for tasking."
        : inject,
      points: activityQuestions.filter(q => q.section === index + 1).reduce((sum, q) => sum + q.points, 0),
    })),
    questions: activityQuestions.map(q => ({
      id: q.id, section: q.section, sectionTitle: q.sectionTitle, prompt: q.prompt,
      kind: q.kind, options: q.options, points: q.points, guideReference: q.guideReference,
      correctAnswerAvailable: !isManual(q) && (q.category === "auto" ? q.acceptedAnswers.length > 0 : !!keys.get(q.id)?.length),
      manualReview: requiresReview(q, keys),
    })),
  };
}

function normalise(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/authorized/g, "authorised").replace(/[^a-z0-9]/g, "");
}

export function evaluate(q: Question, value: string | string[], datasetKeys: Map<number, string[]>) {
  const empty = Array.isArray(value) ? value.length === 0 : !value.trim();
  if (empty) return { correct: null, earnedPoints: 0, status: "unkeyed" as const, feedback: "Draft cleared. Enter a response to continue." };
  if (requiresReview(q, datasetKeys)) return { correct: null, earnedPoints: 0, status: "manual" as const, feedback: "Response saved for instructor acceptance. Points are added when accepted." };
  let accepted = q.category === "auto" ? q.acceptedAnswers : datasetKeys.get(q.id);
  if (!accepted?.length) return { correct: null, earnedPoints: 0, status: "unkeyed" as const, feedback: "Response saved. The instructor has not configured this dataset-dependent answer yet; no automatic score has been awarded." };
  if (!q.validationMode && q.id === 5) accepted = [...accepted, "Required yes", "Required = Yes", "Yes", "Make the field required"];
  if (!q.validationMode && q.id === 64) accepted = [...accepted, "KML", ".KML", "KML locations"];
  const values = Array.isArray(value) ? value : [value];
  let correct: boolean;
  if (q.kind === "multiple") {
    const compare = validationMode(q) === "exact" ? (s: string) => s.trim() : normalise;
    const selected = [...new Set(values.map(compare))].sort();
    const expected = [...new Set(accepted.map(compare))].sort();
    correct = selected.length === expected.length && selected.every((item, i) => item === expected[i]);
  } else if (validationMode(q) === "numeric" || q.kind === "number") {
    const numberValue = Number(values[0].trim().replace(/,/g, ""));
    correct = Number.isFinite(numberValue) && accepted.some(a => numberValue === Number(a.replace(/,/g, "")));
  } else if (validationMode(q) === "exact") {
    correct = accepted.some(a => values[0].trim() === a.trim());
  } else {
    correct = accepted.some(a => normalise(values[0]) === normalise(a));
  }
  return {
    correct, earnedPoints: correct ? q.points : 0,
    status: correct ? "correct" as const : "incorrect" as const,
    feedback: correct ? `Flag captured. ${q.points} points earned.` : `Not yet correct. ${q.incorrectFeedback ?? "Revisit the requested task and compare your response with the cited source evidence."} Retry without penalty.`,
  };
}
