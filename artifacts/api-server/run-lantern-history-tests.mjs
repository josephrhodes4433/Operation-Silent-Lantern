// Own the disposable PostgreSQL cluster and fail closed; never inherit secrets.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const directory = await mkdtemp(path.join(tmpdir(), "lantern-history-fixture-"));
const data = path.join(directory, "db");
const env = { PATH: process.env.PATH, HOME: directory, TMPDIR: directory };
function run(command, args, extra = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", env: { ...env, ...extra } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}
let started = false;
try {
  run("initdb", ["-D", data, "-U", "fixture", "-A", "trust", "--no-locale"]);
  run("pg_ctl", ["-D", data, "-l", path.join(directory, "postgres.log"), "-o", `-h '' -k ${directory} -F`, "-w", "start"]);
  started = true;
  run("esbuild", ["src/tests/lantern-history.test.ts", "--bundle", "--platform=node", "--format=esm", "--external:pg-native", "--banner:js=import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);", "--outfile=dist/lantern-history.test.mjs"]);
  run("node", ["dist/lantern-history.test.mjs"], {
    DATABASE_URL: `postgresql://fixture@localhost/postgres?host=${encodeURIComponent(directory)}`,
    CTF_INSTRUCTOR_CODE: "isolated-lantern-history-fixture",
    LANTERN_HISTORY_FIXTURE: directory,
  });
} finally {
  if (started) run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  await rm(directory, { recursive: true, force: true });
}
