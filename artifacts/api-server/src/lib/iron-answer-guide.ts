import type { InstructorAnswerGuide, InstructorAnswerGuideEntry } from "@workspace/api-zod";
import { questions, validationMode, type Question } from "./ctf-activity";
import { withClassroomChoices } from "./iron-choice-questions";

// Server-only: examples must never be included in the public activity payload.
const examples: Record<number, string> = {
  51: "Five messaging applications identified on CHARLIE are Kakao Talk, Kik, Skype, Viber, and WhatsApp. I confirmed each in Installed Applications and checked the associated parsed records.",
  54: "The top five messaging parties are Alex Morgan, Sam Patel, Jordan Lee, Casey Reed, and Taylor Brooks. I ranked them using CHARLIE's Top 5 messaging parties widget and confirmed the corresponding identifiers in the underlying message records.",
  61: "Image A shows kitchen herbs rather than a controlled substance. The green leaves likely triggered classification; the visible food packaging supports excluding it. Image B shows baking flour in a kitchen. Its powder appearance plausibly triggered classification, but the food label and cooking context support excluding it. I retained the source identifiers and documented both decisions.",
  66: "AppGenie recovered chats from ExampleChat absent from CHARLIE's standard decoded output. I confirmed the application database path, conversation identifiers, and timestamps against the source database before tagging the newly recovered chats.",
  79: "SQLite Wizard results matched the raw Photos.sqlite rows for original filename, relative path, file size, and creation time. I compared record identifiers in Database View. One displayed time initially differed because it used local time; converting both to UTC resolved the discrepancy. I documented the conversion and any missing primary keys.",
  90: "Decoded body: 'Meet at the north entrance at 18:00.' Decoded party: +12025550123. PDU timestamp: 2014-07-14 12:20:00, interpreted using its timezone field. I recovered the message from an unallocated ECHO hex range, recorded its actual offset, confirmed its PDU structure, and tagged the range Recovered SMS Body. It was absent from automated output.",
  100: "Unique addresses recovered: alpha@example.com; dispatch@example.org; courier@example.net. I removed duplicate occurrences, recorded the source offsets, and saved the expression to the library as Email Search.",
  102: "I assess the photographed location as probable. GPS EXIF in a CHARLIE image provides precise coordinates, but does not prove its owner was present. I would compare the capture time and coordinates with carrier records and independent operational reporting before calling the assessment confirmed.",
  108: "I saved the chain as MERIDIAN_GOLF_Test, recording the classroom-approved parser and message-decoder plug-ins in order with their settings. The default chain recovered 0 messages; my custom run recovered 12, an increase of 12. I validated recovered bodies against raw bytes. Replace these illustrative counts and plug-in descriptions with the actual chain and results.",
  109: "Data type: SMS. Recovered value: 'Delivery moved to the east gate at 19:00.' It appeared only after the correct GOLF chain was applied. I recorded its source offset, confirmed the decoded fields against the dump, and compared with the default-chain output.",
  117: "The Tags Only PDF contains 24 tagged items. I checked the count against Manage Tags and confirmed the report contains the same selected findings.",
  118: "I generated MERIDIAN_Partner_Release.ufdr using the required default categories and applied password protection and UFDR AES protection for release. I confirmed the exported product opens with the intended authorized access. I did not include the password in my written response.",
  120: "The training evidence supports Alex Morgan as the person directing component movements through ExampleChat and SMS. An ALPHA chat assigns a collection point; I verified its body and timestamp in the source database. A BRAVO native Messages thread acknowledges that instruction; I checked sms.db and independently converted its timestamp. A CHARLIE calendar record describes the matching movement window; I checked the raw calendar database and converted the stored time independently. I recorded the actual paths, record identifiers, and times for all three. These cross-device findings support the directing-role assessment, but do not prove every participant's identity or physical presence.",
};

export function ironAnswerGuide(current: Question[], keys: Map<number, string[]>): InstructorAnswerGuide {
  return {
    title: "IRON MERIDIAN — Instructor answer guide",
    notice: "Instructor only. Active classroom keys take precedence over facilitator references. Reference values require verification against your evidence. Sample responses are illustrative, not verified findings; replace names, times, counts, identifiers, and tool results with actual evidence. This read-only guide does not change grading keys.",
    entries: current.map(original => withClassroomChoices(original, keys.get(original.id))).map((q): InstructorAnswerGuideEntry => {
      const mode = validationMode(q);
      const active = keys.get(q.id) ?? [];
      const reference = q.facilitatorAnswers ?? [];
      const manual = mode === "manual";
      const source = manual ? "manual" : mode === "dataset" ? active.length ? "classroom" : reference.length ? "reference" : "unconfigured" : "fixed";
      const original = questions.find(original => original.id === q.id);
      const unchanged = original?.prompt === q.prompt && original.kind === q.kind;
      return {
        id: q.id, code: `Flag ${String(q.id).padStart(3, "0")}`, section: q.section, sectionTitle: q.sectionTitle,
        prompt: q.prompt, points: q.points, kind: q.kind, source,
        answers: manual ? [] : mode === "dataset" ? active : q.acceptedAnswers,
        referenceAnswers: reference,
        guidance: q.validationMethod || (manual ? "Review the response against the learner's cited evidence." : ""),
        sampleResponse: manual && unchanged ? examples[q.id] ?? "" : "",
        notes: [q.facilitatorNote, manual && !unchanged ? "Instructor-authored question: no baseline sample is assumed. Use the current question and review criteria." : "", q.guideReference ? `Source: ${q.guideReference}` : ""].filter(Boolean).join("\n"),
        format: "",
      };
    }),
  };
}
