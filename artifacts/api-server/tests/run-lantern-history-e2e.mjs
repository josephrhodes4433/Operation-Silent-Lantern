import { spawn, spawnSync, fork } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import net from 'node:net';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const apiDir = path.join(root, 'artifacts/api-server');
const webDir = path.join(root, 'artifacts/silent-lantern-ctf');
const work = mkdtempSync(path.join(tmpdir(), 'lantern-browser-fixture-'));
const data = path.join(work, 'data');
// No classroom DB, instructor secret, session secret, NODE_OPTIONS or external
// target URL enters any subprocess. A Chromium executable is the only override.
const env = { PATH: process.env.PATH, HOME: work, TMPDIR: work,
  // Browser binaries are read-only test dependencies, not classroom state.
  PLAYWRIGHT_BROWSERS_PATH: path.join(homedir(), '.cache', 'ms-playwright'),
  ...(process.env.LANTERN_E2E_CHROMIUM_PATH
    ? { LANTERN_E2E_CHROMIUM_PATH: process.env.LANTERN_E2E_CHROMIUM_PATH } : {}) };
let postgresStarted = false;
let server;
let active;
let cleaning = false;

function run(command, args, cwd = root, extra = {}) {
  return new Promise((resolve, reject) => {
    const child = active = spawn(command, args, { cwd, env: { ...env, ...extra }, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => {
      if (active === child) active = undefined;
      code === 0 ? resolve() : reject(new Error(`${command} failed (${code})`));
    });
  });
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 5_000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}
async function cleanup() {
  if (cleaning) return;
  cleaning = true;
  await stop(active);
  await stop(server);
  if (postgresStarted) {
    const stopped = spawnSync('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'], { env, stdio: 'inherit' });
    if (stopped.status !== 0) throw new Error(`Could not stop disposable PostgreSQL; retained ${work}`);
  }
  rmSync(work, { recursive: true, force: true });
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });
}
try {
  await run('initdb', ['-D', data, '-U', 'fixture', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  await run('pg_ctl', ['-D', data, '-l', path.join(work, 'postgres.log'),
    '-o', `-F -k ${work} -p ${port} -c listen_addresses=''`, '-w', 'start']);
  postgresStarted = true;
  await run('pnpm', ['exec', 'vite', 'build', '--outDir', path.join(work, 'public')], webDir,
    { NODE_ENV: 'production', PORT: '1', BASE_PATH: '/silent-lantern/' });
  const entry = path.join(work, 'server.cjs');
  await run('pnpm', ['exec', 'esbuild', 'tests/lantern-history-e2e-server.ts', '--bundle',
    '--platform=node', '--format=cjs', '--external:pg-native', `--outfile=${entry}`], apiDir);
  const runId = randomUUID();
  server = fork(entry, [], { cwd: apiDir, env: {
    ...env, NODE_ENV: 'test', LANTERN_E2E_ISOLATED: '1', LANTERN_E2E_RUN_ID: runId,
    LANTERN_E2E_WORK: work,
    DATABASE_URL: `postgres://fixture@127.0.0.1:${port}/postgres?host=${encodeURIComponent(work)}`,
    CTF_INSTRUCTOR_CODE: 'lantern-browser-regression-only',
  }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Isolated API startup timed out')), 30_000);
    server.once('message', message => { clearTimeout(timer); resolve(message.url); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Isolated API exited (${code})`)); });
    server.once('error', error => { clearTimeout(timer); reject(error); });
  });
  // Fixed config and spec; never accept CLI arguments that can select a live target.
  await run('pnpm', ['exec', 'playwright', 'test', '--config', 'playwright.history.config.ts'],
    webDir, { LANTERN_E2E_ISOLATED: '1', LANTERN_E2E_RUN_ID: runId, LANTERN_E2E_URL: url });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await cleanup();
}
