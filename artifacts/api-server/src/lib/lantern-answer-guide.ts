import type { InstructorAnswerGuide, InstructorAnswerGuideEntry } from "@workspace/api-zod";
import { lanternQuestions } from "./lantern-activity";

const examples: Record<number, string> = {
  107: "A powered-on, supported iPhone requires preservation while additional lawful authorization is obtained. Within the authorized scope, I would use the approved Preserved Extraction workflow to retain data and SafeGuard to address the inactivity timer. I would document authority, device state, actions, and custody. These are knowledge topics here: no compatible classroom phone or preserved extraction is required.",
  110: "A Triage Scan may use the supplied watchlist keyword and a watchlisted phone number as criteria. I would check the configured criteria and priority in the profile, run the scan on the Coordinator iPhone, and save the report. I would cite the first Major match's data type, value, and source rather than assume these criteria are mandatory in every profile.",
  116: "Indicator 1: the courier-naming message identifies alias FALCON; source: the same iPhone's targeted extraction, chat thread 4, message 18, 17:40 UTC. Indicator 2: the saved Triage report records the watchlisted IMEI on that iPhone at 17:35 UTC. The common device identifier ties the initial triage result to the targeted message, which refines the alias assessment. Replace these example identifiers and times with the two actual supporting sources.",
  117: "IMSI:123456789012345",
  118: "No contacts or messages were present in my assigned SIM extraction. I verified both categories in the SIM output and recorded the extraction identifier and report location. The IMSI remains reportable; I did not invent a contact or infer a link to another mission from absent data.",
  125: "Courier alias FALCON appears in the targeted extraction of the same iPhone used for Triage. A chat instruction describes a package handoff at the east gate. Its message timestamp is 17:40 UTC, and the stated handoff window is 18:00 UTC. I recorded the actual extraction, thread, and message identifiers. The earlier Triage report's matching IMEI ties that result to this device. My assigned SIM provides an independently reviewed IMSI, but no contact content was present to establish a further communications link. Together, these findings support a time-sensitive lead about the handoff, not proof of the package's contents or every participant's identity.",
  126: "Preserve the cited UFED reports and collection summaries, then request lawful validation of the gate and movement window against independent reporting. Corroborate the alias before identifying a person and compare the IMEI and approved IMSI with authorized records. Record remaining uncertainties and avoid treating a matching keyword as proof of intent.",
};
const guidance: Record<number, string> = {
  107: "Look for a plausible lawful use case, supported-device limitations, preservation versus examination, the role of SafeGuard, and documented authority/custody. No live preservation or AUTH token.",
  110: "Accept supported examples of criteria that may be configured. Require a sensible explanation and report/profile source, not a fabricated mandatory pair.",
  116: "Require two specific supporting indicators with timestamps and source identifiers from the same iPhone. Explain the relationship between the Triage result and targeted alias evidence.",
  117: "Approve only the IMSI actually shown in this learner's assigned SIM extraction. Require IMSI: followed by 10–18 digits. There is no shared classroom IMSI. The sample is a format example, not the learner's answer.",
  118: "Accept an evidence-backed contact/message finding OR an evidence-backed finding that neither is present. Do not require a common contact, standardized SIM contents, or an unsupported cross-mission link.",
  125: "Require 6–8 sentences addressing Who, What, Where, When, and So-what; specific sources, corroboration, and appropriate confidence/limitations. Next steps are assessed separately in M6-Q2.",
  126: "Look for actionable investigative next steps tied to cited evidence or uncertainty, lawful scope, corroboration, and appropriate preservation.",
};

export function lanternAnswerGuide(keys: Map<number, string[]>): InstructorAnswerGuide {
  return {
    title: "SILENT LANTERN — Instructor answer guide",
    notice: "Instructor only. This guide follows the revised six-mission, 26-response activity. Examples are illustrative, not verified findings. Use each learner's actual evidence; approve written responses explicitly. Dataset keys shown here are the active instructor values. This read-only guide never changes keys or approvals.",
    entries: lanternQuestions.map((q): InstructorAnswerGuideEntry => {
      const active = keys.get(q.id) ?? [];
      let answers = q.keyMode === "fixed" ? q.acceptedAnswers : q.keyMode === "dataset" ? active : [];
      let notes = "";
      if (q.id === 108) {
        answers = ["CASE:JTF-0427-TEAM<registered team number>"];
        notes = "For registered Team 3: CASE:JTF-0427-TEAM3. The team number must match the learner's saved check-in.";
      }
      if (q.id === 124) {
        answers = active.map(keyword => `TPL:<verified alias>-<approved IMSI last four>-${keyword}`);
        notes = `Build TPL:<verified alias>-<last four of this learner's approved IMSI>-<watchlist keyword>. The alias must match the configured alias key and the learner's M3-FLAG03 response. Never use another learner's IMSI. ${active.length ? `Active keyword alternatives: ${active.join(" OR ")}.` : "The instructor has not configured the watchlist keyword yet."} Enter only the keyword in the grading-key editor, not a complete TPL code.`;
      }
      return {
        id: q.id, code: q.code, section: q.section, sectionTitle: q.sectionTitle,
        prompt: q.prompt, points: q.points, kind: q.kind,
        source: q.keyMode === "dataset" ? active.length ? "classroom" : "unconfigured" : q.keyMode,
        answers, referenceAnswers: [], format: q.format,
        guidance: guidance[q.id] ?? (q.kind === "multiple" ? "Select every listed correct option, with no extra selections." : q.id === 124 ? "Validate the components against the active alias/keyword keys and the learner's individually approved SIM response." : ""),
        sampleResponse: examples[q.id] ?? "", notes,
      };
    }),
  };
}
