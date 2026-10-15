import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export function mediaDuration(file) {
  const p = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  if (p.status !== 0) throw new Error(p.stderr);
  return Number(p.stdout.trim());
}
export function narration(outputDir, id) {
  const assets = JSON.parse(readFileSync(path.join(outputDir, "updated-speech-assets.json"), "utf8"));
  const clip = assets.find(a => a.id === id);
  if (!clip) throw new Error(`Missing narration ${id}`);
  return clip;
}
export async function api(base, activity, code, route, method = "GET", body) {
  const r = await fetch(`${base}/api/${activity}${route}`, {
    method, headers: { "content-type": "application/json", "x-instructor-code": code },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await r.json();
  if (!r.ok) throw new Error(`${activity} ${route}: ${r.status} ${JSON.stringify(json)}`);
  return json;
}
export async function overlay(page) {
  await page.evaluate(() => {
    if (document.querySelector("#updated-demo")) return;
    const tag = document.createElement("div");
    tag.id = "updated-demo";
    tag.style.cssText = "position:fixed;z-index:99999;right:12px;bottom:10px;padding:9px 12px;background:#101a2ff2;color:white;border:1px solid #f9a943;font:600 12px system-ui;pointer-events:none";
    tag.textContent = "DEMONSTRATION • SYNTHETIC EVIDENCE • AI NARRATION";
    document.body.append(tag);
  });
}
export async function recorder({ createContext, outputDir, prefix, role, home }) {
  const context = await createContext(`${prefix}-updated-${role}`);
  const page = context.pages()[0] ?? await context.newPage();
  const video = page.video();
  await page.goto(home + (role === "student" ? "activity" : "instructor"));
  const started = Date.now();
  const scenes = [];
  const now = () => (Date.now() - started) / 1000;
  const scene = async (id, title, audio, action, minDuration = 0) => {
    const start = now();
    await overlay(page);
    console.log(`${prefix} ${role}: ${title}`);
    await action();
    await pause(450);
    const end = now();
    const audioDuration = mediaDuration(audio.filePath);
    scenes.push({ ...audio, id, title, start, end, minDuration: Math.max(minDuration, audioDuration + 3) });
  };
  const close = async extra => {
    const total = now();
    await context.close();
    const output = path.join(outputDir, `${prefix}-updated-${role}-raw.webm`);
    copyFileSync(await video.path(), output);
    const manifest = { prefix, role, video: output, offset: Math.max(0, mediaDuration(output) - total), scenes, ...extra };
    writeFileSync(path.join(outputDir, `${prefix}-updated-${role}-capture.json`), JSON.stringify(manifest, null, 2));
    return manifest;
  };
  return { context, page, now, scene, close };
}
export async function selectAnswer(card, q, value) {
  if (q.kind === "single" || q.kind === "multiple") {
    const wanted = Array.isArray(value) ? value : [value];
    for (let i = 0; i < q.options.length; i++) {
      const input = card.getByTestId(`option-${q.id}-${i}`);
      if (q.kind === "multiple") await input.setChecked(wanted.includes(q.options[i]));
      else if (wanted.includes(q.options[i])) await input.check();
    }
  } else await card.getByTestId(`input-answer-${q.id}`).fill(String(value));
}
export function exampleAnswer(q, entry, activity, team = 3) {
  const special = { 108: `CASE:JTF-0427-TEAM${team}`, 112: "MAJOR:IMEI:490154203237518", 115: "ALIAS:FALCON", 117: "IMSI:123456789012345", 124: "TPL:FALCON-2345-VESPER" };
  if (activity === "lantern" && special[q.id]) return special[q.id];
  if (q.manualReview) return entry.sampleResponse || entry.referenceAnswers?.[0] || entry.answers?.[0] || `DEMONSTRATION evidence response for question ${q.id}. Verify the actual source and document the scope and limitations.`;
  const answers = entry.answers?.length ? entry.answers : entry.referenceAnswers;
  if (!answers?.length) throw new Error(`Choice ${q.id} has no fixture key`);
  return q.kind === "multiple" ? answers : q.options.find(v => answers.includes(v)) ?? answers[0];
}
