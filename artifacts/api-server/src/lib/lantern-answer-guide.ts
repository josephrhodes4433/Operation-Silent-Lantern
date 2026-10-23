import type { InstructorAnswerGuide, InstructorAnswerGuideEntry } from "@workspace/api-zod";
import { lanternQuestions } from "./lantern-activity";

const examples: Record<number, string> = {
  107: "A powered-on, supported iPhone requires preservation while additional lawful authorization is obtained. Within the authorized scope, I would use the approved Preserved Extraction workflow to retain data and SafeGuard to address the inactivity timer. I would document authority, device state, actions, and custody. These are knowledge topics here: no compatible classroom phone or preserved extraction is required.",
  110: "One criterion is an offline match to the actual IMEI of the instructor-kit iPhone 8; this is the simplest beta setup and can be used on its own. A second possible criterion is a known indicator in a planted contact or message. I would verify the indicator exists on the same iPhone, inspect the profile's configured Major/Minor priorities, and compare the saved demonstration report with those settings. I would not assume identical content exists on every kit or that two criteria are mandatory. In the beta I can use the instructor's shared report without having my own phone.",
  116: "Illustrative example: Indicator 1 is the courier-naming message identifying alias FALCON in the Coordinator iPhone 8 targeted extraction, thread 4, message 18, 17:40 UTC. Indicator 2 is a configured indicator actually recorded in that same phone's saved Triage report at 17:35 UTC. I cite the reported artifact type, value, priority, and report/device identifiers rather than assuming the match was an IMEI. The shared device identifiers connect the outputs; the targeted message refines the alias assessment. Replace all example details and times with the actual supporting sources.",
  117: "IMSI:123456789012345",
  118: "No contacts or messages were present in my assigned SIM extraction. I verified both categories in the SIM output and recorded the extraction identifier and report location. The IMSI remains reportable; I did not invent a contact or infer a link to another mission from absent data.",
  125: "Courier alias FALCON appears in the targeted extraction of the same iPhone 8 used for Triage. A chat instruction describes a package handoff at the east gate. Its message timestamp is 17:40 UTC, and the stated handoff window is 18:00 UTC. I recorded the extraction, thread, and message identifiers. The saved Triage report's device identifiers and actual reported indicators connect that output to the same phone; I do not assume the first Major item must be an IMEI. My assigned SIM provides an independently reviewed IMSI, but no contact content was present to establish a further communications link. Together, these illustrative findings support a time-sensitive lead, not proof of the package's contents or every participant's identity. Replace the example findings with actual assigned evidence.",
  126: "Preserve the cited UFED reports and collection summaries, then request lawful validation of the gate and movement window against independent reporting. Corroborate the alias before identifying a person and compare the IMEI and approved IMSI with authorized records. Record remaining uncertainties and avoid treating a matching keyword as proof of intent.",
};
const guidance: Record<number, string> = {
  107: "Look for a plausible lawful use case, supported-device limitations, preservation versus examination, the role of SafeGuard, and documented authority/custody. No live preservation or AUTH token.",
  109: "Use the supported TurboLink connection order shown in the key. For the beta, the instructor demonstrates it with the iPhone 8; do not require each learner to have a device.",
  110: "Accept two supported criteria with a verification explanation, including the actual kit IMEI and a known contact/message indicator. Other supported criteria remain acceptable when justified from the assigned profile. The minimal beta can use an IMEI-only offline profile; naming two possible criteria is not a requirement to configure both. Pre-test any planted contact/message content and Major/Minor priorities on the iPhone 8. Calendar/browser content was suggested as a possible expansion, not guaranteed kit evidence. Do not require the unsupported kit ZTE or identical content across classroom devices.",
  111: "Major is higher priority than Minor. The demonstrated iPhone 8 can produce both when its profile and known contact/message data are configured accordingly. Neither label proves criminality, and artifact type alone does not set severity.",
  112: "Compare MAJOR:<datatype>:<value> with the FIRST actual Major row in the saved iPhone 8 report, including its source/report identity. For an IMEI-only profile, use this instructor kit's actual IMEI, never a universal sample number. If a planted contact/message indicator appears first as Major, accept that reported type and value instead. Minor is not a substitute for a requested Major. If there is no Major, correct/re-test the profile rather than inventing a flag. Instructor acceptance is required; retained reference keys are not automatic proof.",
  116: "Require two specific supporting indicators with timestamps and source identifiers from the same iPhone. Explain the relationship between the Triage result and targeted alias evidence.",
  117: "Approve only the IMSI actually shown in this learner's assigned SIM extraction. Require IMSI: followed by 10–18 digits. There is no shared classroom IMSI. The sample is a format example, not the learner's answer.",
  118: "Accept an evidence-backed contact/message finding OR an evidence-backed finding that neither is present. Do not require a common contact, standardized SIM contents, or an unsupported cross-mission link.",
  125: "Require 6–8 sentences addressing Who, What, Where, When, and So-what; specific sources, corroboration, and appropriate confidence/limitations. Next steps are assessed separately in M6-Q2.",
  126: "Look for actionable investigative next steps tied to cited evidence or uncertainty, lawful scope, corroboration, and appropriate preservation.",
};

export function lanternAnswerGuide(keys: Map<number, string[]>): InstructorAnswerGuide {
  return {
    title: "SILENT LANTERN — Instructor answer guide",
    notice: "Instructor only. This guide follows the revised six-mission, 26-response activity. For beta Triage, demonstrate on the instructor-kit iPhone 8 and share the saved report: learners have no kits for this step. Start with an offline profile matching the kit's actual IMEI; optionally pre-test planted contact/message indicators and their Major/Minor priorities. The kit ZTE does not expose Triage through the required Advanced workflow; keep its separate UFED Classic mission. Examples are illustrative, not verified findings. Use the assigned actual evidence and explicitly accept non-choice responses. Retained dataset reference keys must be checked against the current demonstration; this guide never changes keys or approvals.",
    entries: lanternQuestions.map((q): InstructorAnswerGuideEntry => {
      const active = keys.get(q.id) ?? [];
      let answers = q.keyMode === "fixed" ? q.acceptedAnswers : q.keyMode === "dataset" ? active : [];
      let notes = "";
      if (q.id === 112) {
        notes = "The email confirms an iPhone 8 contact and message produced Major/Minor indicators with a configured profile; it supplies no report, actual IMEI, planted values, or definitive first Major row. Verify the saved demonstration before teaching or accepting FLAG-02. Existing configured values are retained as references, not overwritten or assumed valid for every profile.";
      }
      if (q.id === 108) {
        answers = ["CASE:JTF-0427-<registered team name>"];
        notes = "For Night Watch: CASE:JTF-0427-Night Watch. Match the team name saved at check-in. Earlier numbered teams and their accepted CASE flags remain valid historical work; do not revoke an approval solely for using the earlier format.";
      }
      if (q.id === 124) {
        answers = active.map(keyword => `TPL:<verified alias>-<approved IMSI last four>-${keyword}`);
        notes = `Build TPL:<verified alias>-<last four of this learner's approved IMSI>-<watchlist keyword>. The alias must match the configured alias key and the learner's M3-FLAG03 response. Never use another learner's IMSI. ${active.length ? `Active keyword alternatives: ${active.join(" OR ")}.` : "The instructor has not configured the watchlist keyword yet."} Enter only the keyword in the grading-key editor, not a complete TPL code.`;
      }
      return {
        id: q.id, code: q.code, section: q.section, sectionTitle: q.sectionTitle,
        prompt: q.prompt, points: q.points, kind: q.kind,
        source: q.manualReview ? "manual" : q.keyMode === "dataset" ? active.length ? "classroom" : "unconfigured" : q.keyMode,
        answers, referenceAnswers: [], format: q.format,
        guidance: guidance[q.id] ?? (q.kind === "multiple" ? "Select every listed correct option, with no extra selections." : q.id === 124 ? "Validate the components against the active alias/keyword keys and the learner's individually approved SIM response." : ""),
        sampleResponse: examples[q.id] ?? "", notes,
      };
    }),
  };
}
