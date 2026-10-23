import { writeFileSync, mkdirSync } from "node:fs";
import { questions } from "../artifacts/api-server/src/lib/ctf-activity";
import { lanternQuestions } from "../artifacts/api-server/src/lib/lantern-activity";
import { ironAnswerGuide } from "../artifacts/api-server/src/lib/iron-answer-guide";
import { lanternAnswerGuide } from "../artifacts/api-server/src/lib/lantern-answer-guide";

// A read-only development query confirmed no configured keys or authored
// overrides. Export current server-only guides, never learner submissions.
const keys = new Map<number, string[]>();
const attach = (entries: ReturnType<typeof ironAnswerGuide>["entries"], bank: typeof questions | typeof lanternQuestions) =>
  entries.map(entry => {
    const question = bank.find(q => q.id === entry.id)!;
    return { ...entry, guideReference: question.guideReference };
  });
mkdirSync("generated-artifacts/instructor-answer-keys", { recursive: true });
writeFileSync("generated-artifacts/instructor-answer-keys/current-table-source.json", JSON.stringify({
  iron: attach(ironAnswerGuide(questions, keys).entries, questions),
  lantern: attach(lanternAnswerGuide(keys).entries, lanternQuestions),
}, null, 2));
