import { spawn, spawnSync, fork } from "node:child_process";
import { mkdtempSync, mkdirSync, renameSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const root = fileURLToPath(new URL("../", import.meta.url));
const apiDir = path.join(root, "artifacts/api-server");
const outputDir = path.join(root, "generated-artifacts/ctf-walkthroughs");
const resumeWork = process.env.CTF_RECORDING_RESUME_WORK;
const resumeMode = !!resumeWork;
if (resumeMode && !resumeWork.startsWith(path.join(tmpdir(), "ctf-recordings-"))) throw new Error("Resume work directory is not an owned disposable recording fixture.");
const work = resumeWork || mkdtempSync(path.join(tmpdir(), "ctf-recordings-"));
const data = path.join(work, "data");
const rawDir = path.join(work, resumeMode ? "raw-video-resume" : "raw-video");
const partialVideo = process.env.CTF_RECORDING_PARTIAL_VIDEO;
const runId = resumeMode ? process.env.CTF_RECORDING_RUN_ID : randomUUID();
if (resumeMode && (!runId || !partialVideo || !partialVideo.startsWith(path.join(work, "raw-video") + path.sep))) throw new Error("Resume requires the exact fixture run ID and its interrupted local raw segment.");
const testCode = "ctf-recording-fixture-only";
const mode = process.env.CTF_RECORDING_APP ?? "both";
if (!["both", "iron", "lantern"].includes(mode)) throw new Error("CTF_RECORDING_APP must be iron, lantern, or both.");
const baseEnv = Object.fromEntries(["PATH", "HOME", "USER", "LANG"].filter(k => process.env[k]).map(k => [k, process.env[k]]));
const childEnv = { ...baseEnv, HOME: work, TMPDIR: work, PLAYWRIGHT_BROWSERS_PATH: "/tmp/ctf-video-tools" };
let pgStarted = false, fixture, active, closing = false, runSucceeded = false;
const require = createRequire(import.meta.url);
const { chromium } = require("../artifacts/iron-meridian-ctf/node_modules/@playwright/test");

function run(command, args, cwd = root, extra = {}) {
  return new Promise((resolve, reject) => {
    const child = active = spawn(command, args, { cwd, env: { ...childEnv, ...extra }, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", code => { if (active === child) active = undefined; code === 0 ? resolve() : reject(new Error(`${command} failed (${code})`)); });
  });
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    child.kill("SIGTERM");
  });
}
async function cleanup() {
  if (closing) return; closing = true;
  await stop(active); await stop(fixture);
  if (pgStarted) {
    const result = spawnSync("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"], { env: childEnv, stdio: "inherit" });
    if (result.status !== 0) throw new Error(`Could not stop disposable PostgreSQL; retained ${work}`);
  }
  if (!resumeMode || runSucceeded) rmSync(work, { recursive: true, force: true });
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function mustJson(response, label) {
  if (!response.ok()) throw new Error(`${label} returned ${response.status()}: ${await response.text()}`);
  return response.json();
}
async function fetchJson(url, code, method = "GET", body) {
  const response = await fetch(url, { method, headers: { "content-type": "application/json", "x-instructor-code": code }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(`Fixture API ${method} ${new URL(url).pathname} failed ${response.status}: ${await response.text()}`);
  return response.json();
}
async function addDemoOverlay(page, title) {
  await page.evaluate(({ title }) => {
    const style = document.createElement("style");
    style.textContent = `
      #demo-badge{position:fixed;z-index:999999;right:18px;top:12px;background:#111827eF;color:#fff;
        border:1px solid #fbbf24;padding:8px 12px;font:600 13px/1.2 system-ui;letter-spacing:.04em;box-shadow:0 2px 12px #0004}
      #demo-card{position:fixed;z-index:1000000;inset:0;display:grid;place-items:center;background:#07111fee;color:white;font:500 22px/1.5 system-ui;text-align:center;padding:10vh 12vw}
      #demo-card section{max-width:900px;border:1px solid #fbbf24;padding:40px;background:#111827}
      #demo-card h2{font-size:36px;margin:0 0 18px;color:#fbbf24}
      #demo-card p{margin:12px 0}
    `;
    document.head.append(style);
    const badge = document.createElement("div"); badge.id = "demo-badge"; badge.textContent = "DEMONSTRATION — ILLUSTRATIVE EVIDENCE";
    document.body.append(badge);
    const card = document.createElement("div"); card.id = "demo-card";
    card.innerHTML = `<section><h2>${title}</h2><p>Actual student website screen capture using an isolated demo account and disposable PostgreSQL.</p><p>Illustrative demo data only — NOT a UFED hardware extraction and NOT verified classroom findings.</p></section>`;
    document.body.append(card);
  }, { title });
  await delay(4500);
  await page.evaluate(() => document.querySelector("#demo-card")?.remove());
}
async function outro(page, line) {
  await page.evaluate(({ line }) => {
    const card = document.createElement("div"); card.id = "demo-card";
    card.innerHTML = `<section><h2>DEMONSTRATION COMPLETE</h2><p>${line}</p><p>Illustrative demo data only. Not verified classroom findings or a UFED hardware extraction.</p></section>`;
    document.body.append(card);
  }, { line });
  await delay(4500);
}
async function createContext(filePrefix) {
  mkdirSync(rawDir, { recursive: true });
  const context = await chromium.launchPersistentContext(path.join(work, `profile-${filePrefix}`), {
    headless: true, viewport: { width: 1440, height: 1000 }, recordVideo: { dir: rawDir, size: { width: 1440, height: 1000 } },
    acceptDownloads: true,
    executablePath: "/nix/store/71577rskzyhch3axhdqx7faygc2xyn4v-playwright-browsers-1.55.0-with-cjk/chromium-1187/chrome-linux/chrome",
    env: { PATH: childEnv.PATH, HOME: work, TMPDIR: work, LANG: childEnv.LANG ?? "C", USER: childEnv.USER ?? "runner", PLAYWRIGHT_BROWSERS_PATH: "/tmp/ctf-video-tools" },
  });
  return context;
}
async function waitForSaved(card, id, expected) {
  const status = card.getByTestId(`status-save-${id}`);
  await status.waitFor({ state: "visible" });
  await status.waitFor({ state: "visible" });
  await card.getByTestId("banner-result").waitFor({ state: "visible", timeout: 12000 });
  if (expected === "incorrect") await card.getByTestId("banner-result").getByText(/Not correct/i).waitFor({ state: "visible" });
  if (expected === "correct") await card.getByTestId("banner-result").getByText(/Correct|Instructor approved/i).waitFor({ state: "visible" });
  if (expected === "manual") await card.getByTestId("banner-result").getByText(/Awaiting|Waiting for instructor/i).waitFor({ state: "visible" });
  await delay(qManualHold(expected) ? 2000 : 600);
}
function qManualHold(expected) { return expected === "manual"; }
function answerText(value) { return Array.isArray(value) ? value.join(" + ") : String(value); }
function probeDuration(file) {
  const result = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { env: childEnv, encoding: "utf8" });
  const duration = Number.parseFloat(result.stdout.trim());
  if (result.status !== 0 || !Number.isFinite(duration)) throw new Error(`Could not read recording duration: ${file}`);
  return duration;
}
async function selectAnswer(card, question, value) {
  const id = question.id;
  if (question.kind === "single" || question.kind === "multiple") {
    const wanted = Array.isArray(value) ? value : [value];
    for (let i = 0; i < question.options.length; i++) {
      const input = card.getByTestId(`option-${id}-${i}`);
      if (question.kind === "multiple") await input.setChecked(wanted.includes(question.options[i]));
      else if (wanted.includes(question.options[i])) await input.check();
    }
  } else {
    const field = card.getByTestId(`input-answer-${id}`);
    await field.fill(String(value));
    await field.evaluate(el => { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; });
  }
}
async function saveCurrent(page, card, q, isLantern, expected = q.manualReview ? "manual" : "correct") {
  const submit = card.getByTestId(`button-validate-${q.id}`);
  if (await submit.count() && await submit.isDisabled()) {
    const input = card.getByTestId(`input-answer-${q.id}`);
    console.log("disabled save diagnosis", q.id, "value=", await input.inputValue().catch(() => "<no text input>"),
      "question=", (await card.innerText()).slice(0, 700));
  }
  if (await submit.count()) await submit.click();
  if (!(await card.getByTestId(`status-save-${q.id}`).isVisible())) throw new Error(`Question ${q.id}: save status not visible`);
  await waitForSaved(card, q.id, expected);
  if (isLantern && q.manualReview) {
    const sessionId = await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        try { const value = JSON.parse(localStorage.getItem(key)); if (value?.sessionId) return value.sessionId; } catch {}
      }
      return null;
    });
    const progress = await fetchJson(`${page.url().split("/").slice(0, 3).join("/")}/api/lantern/progress/${sessionId}`, testCode);
    const current = progress.answers[String(q.id)];
    if (!current || current.reviewStatus !== "pending") throw new Error(`Question ${q.id}: instructor review was not pending before review`);
    const result = await fetchJson(`${page.url().split("/").slice(0, 3).join("/")}/api/lantern/instructor/submissions/${sessionId}/review/${q.id}`,
      testCode, "PUT", { decision: "approved", points: q.points, note: "Approved in the isolated recording fixture; illustrative demo response.", responseUpdatedAt: current.updatedAt });
    if (result.answers?.[String(q.id)]?.reviewStatus !== "approved") throw new Error(`Question ${q.id}: isolated instructor review did not approve`);
    await page.getByTestId("button-refresh").click();
    await page.waitForFunction(id => {
      const t = document.querySelector(`[data-testid="text-review-gate"]`);
      return !t || !t.textContent?.includes("waiting");
    }, q.id, { timeout: 12000 }).catch(() => {});
    await delay(1200);
  }
}
async function captureApp({ base, title, lanternMode }) {
  const prefix = lanternMode ? "silent-lantern" : "iron-meridian";
  const context = await createContext(prefix + (resumeMode ? "-resume" : ""));
  const page = context.pages()[0] ?? await context.newPage();
  const started = Date.now();
  const chapters = [];
  try {
    await page.goto(`${base}${lanternMode ? "/silent-lantern/" : "/"}`, { waitUntil: "domcontentloaded" });
    const marker = await page.request.get(`${base}/__ctf_recording_fixture`);
    const markerBody = await mustJson(marker, "fixture marker");
    if (markerBody.marker !== "ctf-recording-fixture-only" || markerBody.runId !== runId) throw new Error("Refusing to record: target did not prove it is this disposable fixture.");
    await addDemoOverlay(page, resumeMode ? `${title} | CONTINUED FROM SAVED DEMO SESSION` : title);
    await page.getByTestId("text-title").waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
    const begin = page.getByTestId("link-start");
    if (await begin.count()) await begin.click();
    else await page.getByRole("link", { name: /begin|start/i }).first().click();
    const baseUrl = new URL(page.url()).origin;
    const activityPath = lanternMode ? "/api/lantern/activity" : "/api/ctf/activity";
    const guidePath = lanternMode ? "/api/lantern/instructor/answer-guide" : "/api/ctf/instructor/answer-guide";
    const activity = await fetchJson(`${baseUrl}${activityPath}`, testCode);
    const guide = await fetchJson(`${baseUrl}${guidePath}`, testCode);
    const entries = new Map(guide.entries.map(e => [e.id, e]));
    const questions = [...activity.questions].sort((a, b) => a.id - b.id);
    if (questions.length !== (lanternMode ? 26 : 120)) throw new Error(`Expected ${lanternMode ? 26 : 120} questions, received ${questions.length}`);
    let existing = null, sid = null;
    if (resumeMode) {
      if (lanternMode) throw new Error("Interrupted-session continuation is supported only for the IRON MERIDIAN segment.");
      const submissions = await fetchJson(`${baseUrl}/api/ctf/instructor/submissions`, testCode);
      const demo = submissions.find(x => x.name === "Student Demo" && x.email === "student@example.test");
      if (!demo) throw new Error("Could not find the isolated Student Demo submission to resume.");
      sid = demo.sessionId;
      existing = await fetchJson(`${baseUrl}/api/ctf/progress/${sid}`, testCode);
      const missing = questions.find(q => !existing.answers[String(q.id)]);
      if (!missing || existing.answeredCount !== 88) throw new Error(`Resume expected exactly 88 earlier saved responses; got ${existing.answeredCount}.`);
      await page.getByTestId("input-resume").fill(sid);
      await page.getByTestId("button-resume").click();
      await page.getByTestId(`card-question-${missing.id}`).waitFor({ state: "visible", timeout: 20000 });
      const firstUpdated = Math.min(...Object.values(existing.answers).map(a => new Date(a.updatedAt).getTime()));
      let markedWrong = false;
      for (const q of questions) {
        const a = existing.answers[String(q.id)];
        if (!a) continue;
        const kind = activity.questions.find(x => x.id === q.id);
        const wrongDemo = !markedWrong && !kind.manualReview && ["single", "multiple"].includes(kind.kind);
        if (wrongDemo) markedWrong = true;
        chapters.push({ questionId: q.id, code: q.code ?? `Flag ${q.id}`, answer: answerText(a.value),
          status: a.status, points: a.instructorPoints ?? a.earnedPoints,
          timestampSeconds: Number((17.46 + (new Date(a.updatedAt).getTime() - firstUpdated) / 1000).toFixed(2)),
          wrongChoiceDemonstrated: wrongDemo });
      }
    } else {
      if (lanternMode) {
        await page.getByTestId("input-firstName").fill("Student");
        await page.getByTestId("input-lastName").fill("Demo");
        await page.getByTestId("input-email").fill("student@example.test");
        await page.getByTestId("input-instructorEmail").fill("instructor@example.test");
        await page.getByTestId("input-teamNumber").fill("3");
        await page.getByTestId("checkbox-roe").check();
      } else {
        await page.getByTestId("input-firstName").fill("Student");
        await page.getByTestId("input-lastName").fill("Demo");
        await page.getByTestId("input-email").fill("student@example.test");
        await page.getByTestId("input-instructorEmail").fill("instructor@example.test");
      }
      await page.getByTestId("button-start").click();
      const firstId = lanternMode ? 101 : 1;
      await page.getByTestId(`card-question-${firstId}`).waitFor({ state: "visible", timeout: 20000 });
    }
    const manualApprovals = [];
    const pendingQuestions = resumeMode ? questions.filter(q => !existing.answers[String(q.id)]) : questions;
    for (let i = 0; i < pendingQuestions.length; i++) {
      const q = pendingQuestions[i], entry = entries.get(q.id);
      console.log(`${prefix} question ${q.id}/${questions.length}`);
      let value;
      if (lanternMode) {
        if (q.id === 108) value = "CASE:JTF-0427-TEAM3";
        else if (q.id === 112) value = "MAJOR:IMEI:490154203237518";
        else if (q.id === 115) value = "ALIAS:FALCON";
        else if (q.id === 117) value = "IMSI:123456789012345";
        else if (q.id === 124) value = "TPL:FALCON-2345-VESPER";
        else if (q.manualReview) value = entry?.sampleResponse || `DEMONSTRATION response for question ${q.id}; illustrative only, not a finding.`;
        else value = entry?.answers?.length ? (q.kind === "multiple" ? entry.answers : q.kind === "single"
          ? (q.options.find(option => entry.answers.includes(option)) ?? entry.answers[0]) : entry.answers[0]) : `DEMO-ILLUSTRATIVE-ANSWER-${q.id}`;
      } else if (q.manualReview) value = entry?.sampleResponse || `DEMONSTRATION response for flag ${q.id}; illustrative only, not a finding.`;
      else {
        const answers = entry?.answers?.length ? entry.answers : (entry?.referenceAnswers ?? []);
        value = answers.length ? (q.kind === "multiple" ? answers : q.kind === "single"
          ? (q.options.find(option => answers.includes(option)) ?? answers[0]) : answers[0]) :
          (q.kind === "single" || q.kind === "multiple" ? q.options.slice(0, q.kind === "multiple" ? 1 : 1) : `DEMO-ILLUSTRATIVE-FLAG-${q.id}`);
      }
      if ((q.kind === "single" || q.kind === "multiple") && q.kind === "multiple" && !Array.isArray(value)) value = [value];
      const card = page.getByTestId(`card-question-${q.id}`);
      await card.waitFor({ state: "visible", timeout: 15000 });
      await card.scrollIntoViewIfNeeded();
    await delay(1400); // reading hold; slight 1.5x final slowdown keeps this at ~2 seconds
      const beginningTime = Date.now() - started;
      let wrongAttempt = false;
      if (!q.manualReview && (q.kind === "single" || q.kind === "multiple") && !chapters.some(c => c.wrongChoiceDemonstrated)) {
        const expected = Array.isArray(value) ? value : [value];
        const wrongIndex = q.options.findIndex(option => !expected.includes(option));
        if (wrongIndex >= 0) {
          await selectAnswer(card, q, q.kind === "single" ? q.options[wrongIndex] : [q.options[wrongIndex]]);
          await saveCurrent(page, card, q, lanternMode, "incorrect");
          await card.getByTestId("banner-result").getByText(/Not correct/i).waitFor({ state: "visible" });
          await delay(2000); // helpful incorrect-choice feedback is held visibly before retry
          wrongAttempt = true;
        }
      }
      await selectAnswer(card, q, value);
      await saveCurrent(page, card, q, lanternMode);
      const statusText = (await card.getByTestId("banner-result").innerText()).replace(/\s+/g, " ").trim();
      if (lanternMode && q.manualReview) manualApprovals.push(q.id);
      const verifyProgress = await fetchJson(`${baseUrl}${lanternMode ? "/api/lantern/progress/" : "/api/ctf/progress/"}${await page.evaluate(() => {
        const keys = Object.keys(localStorage);
        for (const key of keys) if (/session/i.test(key)) {
          try { const value = JSON.parse(localStorage.getItem(key)); if (value?.sessionId) return value.sessionId; } catch {}
        }
        return "";
      })}`, testCode);
      const saved = verifyProgress.answers[String(q.id)];
      if (!saved || (Array.isArray(saved.value) ? !saved.value.length : !String(saved.value).trim())) throw new Error(`Question ${q.id}: API does not show a saved learner answer`);
      if (lanternMode && q.manualReview && saved.reviewStatus !== "approved") throw new Error(`Question ${q.id}: review status is not approved`);
      chapters.push({ questionId: q.id, code: q.code ?? `Flag ${q.id}`, answer: answerText(value), status: saved.reviewStatus ?? saved.status,
        points: saved.instructorPoints ?? saved.earnedPoints, timestampSeconds: Number(((Date.now() - started) / 1000).toFixed(2)), wrongChoiceDemonstrated: wrongAttempt });
      if (i < pendingQuestions.length - 1) {
        await page.getByTestId("button-next").click();
        await page.getByTestId(`card-question-${pendingQuestions[i + 1].id}`).waitFor({ state: "visible", timeout: 15000 });
      }
    }
    const expectedAnswered = lanternMode ? 26 : 120;
    sid ??= await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) { try { const v = JSON.parse(localStorage.getItem(key)); if (v?.sessionId) return v.sessionId; } catch {} }
      return null;
    });
    const finalProgress = await fetchJson(`${baseUrl}${lanternMode ? "/api/lantern/progress/" : "/api/ctf/progress/"}${sid}`, testCode);
    if (finalProgress.answeredCount !== expectedAnswered) throw new Error(`Expected ${expectedAnswered}/${expectedAnswered} answers, got ${finalProgress.answeredCount}`);
    if (lanternMode && (finalProgress.reviewGateQuestionId !== null || manualApprovals.length !== 7)) throw new Error("Silent Lantern written-answer approvals or review gate incomplete.");
    await page.getByTestId("button-finish").click();
    await page.getByTestId("button-submit").waitFor({ state: "visible", timeout: 15000 });
    await page.getByTestId("button-submit").click();
    await page.getByText(/Marked ready for review/i).waitFor({ state: "visible", timeout: 15000 });
    const submitted = await fetchJson(`${baseUrl}${lanternMode ? "/api/lantern/progress/" : "/api/ctf/progress/"}${sid}`, testCode);
    if (!submitted.submittedAt) throw new Error(`${title}: final submit was not persisted`);
    await page.getByText(new RegExp(`${expectedAnswered} of ${expectedAnswered} answered`)).waitFor({ state: "visible" });
    await delay(2500);
    await outro(page, `${title}: ${expectedAnswered}/${expectedAnswered} responses saved and submitted. ${lanternMode ? "All seven written responses approved through the isolated instructor review API." : "Written responses are retained for instructor review."}`);
    const video = page.video();
    let recordedSeconds = Number(((Date.now() - started) / 1000).toFixed(2));
    await context.close(); // flush the actual Chromium recording before moving it
    const source = await video.path();
    const dest = path.join(outputDir, `${prefix}-student-walkthrough.webm`);
    const raw = path.join(rawDir, `${prefix}-raw.webm`);
    renameSync(source, raw);
    let finalInput = raw;
    if (resumeMode) {
      if (!existsSync(partialVideo) || !existsSync(path.join(work, "data", "PG_VERSION"))) throw new Error("Missing the interrupted demo recording segment or its disposable DB.");
      const fixed = path.join(work, "iron-partial-flushed.webm");
      await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-fflags", "+genpts", "-i", partialVideo, "-map", "0:v:0", "-c:v", "copy", "-an", fixed]);
      const partialSeconds = probeDuration(fixed);
      for (const chapter of chapters) if (chapter.questionId >= 90) chapter.timestampSeconds += partialSeconds;
      const concatList = path.join(work, "iron-concat.txt");
      const joined = path.join(work, "iron-combined-source.webm");
      writeFileSync(concatList, `file '${fixed.replaceAll("'", "'\\''")}'\nfile '${raw.replaceAll("'", "'\\''")}'\n`);
      await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", concatList, "-c", "copy", joined]);
      finalInput = joined;
      recordedSeconds = probeDuration(joined);
    } else recordedSeconds = probeDuration(raw);
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", finalInput, "-filter:v", "setpts=1.5*PTS", "-an", "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "5", "-crf", "34", "-b:v", "0", dest]);
    rmSync(raw, { force: true });
    for (const chapter of chapters) chapter.timestampSeconds = Number((chapter.timestampSeconds * 1.5).toFixed(2));
    writeFileSync(path.join(outputDir, `${prefix}-coverage.json`), JSON.stringify({
      title, sourceUrl: lanternMode ? "/silent-lantern/" : "/", fixtureMarker: "ctf-recording-fixture-only",
      demoIdentity: { name: "Student Demo", email: "student@example.test", instructorEmail: "instructor@example.test", ...(lanternMode ? { teamNumber: 3 } : {}) },
      questionCount: questions.length, answeredCount: submitted.answeredCount, submittedAt: submitted.submittedAt,
      manualApprovals, durationSeconds: Number(probeDuration(dest).toFixed(2)), chapters,
      videoFile: path.basename(dest),
    }, null, 2));
    runSucceeded = true;
    return { video: dest, count: submitted.answeredCount, seconds: Number(probeDuration(dest).toFixed(2)), chapters: chapters.length };
  } catch (error) {
    await context.close().catch(() => {});
    throw error;
  }
}

try {
  mkdirSync(outputDir, { recursive: true });
  const probe = spawnSync("bash", ["-lc", "command -v initdb >/dev/null && command -v pg_ctl >/dev/null"], { env: childEnv });
  if (probe.status !== 0) throw new Error("PostgreSQL utilities initdb/pg_ctl unavailable.");
  if (resumeMode) {
    if (!existsSync(path.join(data, "PG_VERSION")) || !existsSync(partialVideo)) throw new Error("Resume fixture is missing its disposable PostgreSQL cluster or partial raw video.");
  } else await run("initdb", ["-D", data, "-U", "fixture", "-A", "trust", "--no-locale", "--encoding=UTF8"]);
  const { createServer } = await import("node:net");
  const netProbe = createServer();
  await new Promise(resolve => netProbe.listen(0, "127.0.0.1", resolve));
  const port = netProbe.address().port;
  await new Promise(resolve => netProbe.close(resolve));
  await run("pg_ctl", ["-D", data, "-l", path.join(work, resumeMode ? "postgres-resume.log" : "postgres.log"), "-o", `-F -k ${work} -p ${port} -c listen_addresses=''`, "-w", "start"]);
  pgStarted = true;
  const entry = path.join(work, "fixture-server.cjs");
  await run("pnpm", ["exec", "esbuild", "tests/ctf-recording-fixture-server.ts", "--bundle", "--platform=node", "--format=cjs", "--external:pg-native", `--outfile=${entry}`], apiDir);
  const ironPublic = path.join(root, "artifacts/iron-meridian-ctf/dist/public");
  const lanternPublic = path.join(root, "artifacts/silent-lantern-ctf/dist/public");
  if (!existsSync(path.join(ironPublic, "index.html")) || !existsSync(path.join(lanternPublic, "index.html"))) throw new Error("Expected existing compiled production frontends are missing.");
  fixture = fork(entry, [], { cwd: apiDir, env: {
    ...childEnv, NODE_ENV: "test", CTF_RECORDING_FIXTURE: "ctf-recording-fixture-only",
    CTF_RECORDING_RUN_ID: runId, CTF_RECORDING_WORK: work,
    DATABASE_URL: `postgres://fixture@127.0.0.1:${port}/postgres?host=${encodeURIComponent(work)}`,
    CTF_INSTRUCTOR_CODE: testCode, CTF_RECORDING_IRON_PUBLIC: ironPublic, CTF_RECORDING_LANTERN_PUBLIC: lanternPublic,
  }, stdio: ["ignore", "inherit", "inherit", "ipc"] });
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Disposable fixture API startup timed out")), 30000);
    fixture.once("message", message => { clearTimeout(timer); resolve(message.url); });
    fixture.once("exit", code => { clearTimeout(timer); reject(new Error(`Fixture API exited (${code})`)); });
    fixture.once("error", reject);
  });
  const proof = await fetch(`${base}/__ctf_recording_fixture`).then(r => r.json());
  if (proof.marker !== "ctf-recording-fixture-only" || proof.runId !== runId) throw new Error("Fixture marker/run ID mismatch; refusing to record.");
  console.log("Verified isolated fixture", proof);
  const recordings = [];
  if (mode !== "lantern") {
    const iron = await captureApp({ base, title: "IRON MERIDIAN | STUDENT WALKTHROUGH", lanternMode: false });
    console.log("IRON MERIDIAN recorded", iron); recordings.push(iron);
  }
  if (mode !== "iron") {
    const lantern = await captureApp({ base, title: "SILENT LANTERN | STUDENT WALKTHROUGH", lanternMode: true });
    console.log("SILENT LANTERN recorded", lantern); recordings.push(lantern);
  }
  const manifestPath = path.join(outputDir, "walkthrough-manifest.json");
  let prior = [];
  if (mode !== "both" && existsSync(manifestPath)) {
    try { prior = JSON.parse(readFileSync(manifestPath, "utf8")).recordings ?? []; } catch {}
  }
  const merged = [...prior.filter(x => !recordings.some(r => r.video === x.video)), ...recordings];
  writeFileSync(manifestPath, JSON.stringify({ generatedAt: new Date().toISOString(), fixtureMarker: "ctf-recording-fixture-only", recordings: merged }, null, 2));
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
} finally {
  await cleanup();
}
