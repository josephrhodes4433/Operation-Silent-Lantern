import { spawn, spawnSync, fork } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import net from 'node:net';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const apiDir = path.join(root, 'artifacts/api-server');
const webDir = path.join(root, 'artifacts/iron-meridian-ctf');
// Deliberate allowlist: neither the real DB URL nor instructor/session secrets
// enter the fixture server, build, or browser-test subprocesses.
const env = Object.fromEntries(['PATH', 'HOME', 'USER', 'LANG', 'TMPDIR',
  'CTF_E2E_CHROMIUM_PATH'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
const work = mkdtempSync(path.join(tmpdir(), 'ctf-key-e2e-'));
const data = path.join(work, 'data');
let postgresStarted = false;
let server;
let active;
let cleaning = false;

function run(command, args, cwd = root, extra = {}) {
  return new Promise((resolve, reject) => {
    active = spawn(command, args, { cwd, env: { ...env, ...extra }, stdio: 'inherit' });
    active.once('error', reject);
    active.once('exit', code => {
      active = undefined;
      code === 0 ? resolve() : reject(new Error(`${command} failed (${code})`));
    });
  });
}

async function cleanup() {
  if (cleaning) return;
  cleaning = true;
  active?.kill('SIGTERM');
  if (server && server.exitCode === null) {
    await new Promise(resolve => {
      const timer = setTimeout(() => server.kill('SIGKILL'), 5_000);
      server.once('exit', () => { clearTimeout(timer); resolve(); });
      server.kill('SIGTERM');
    });
  }
  if (postgresStarted) {
    const stopped = spawnSync('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'], { env, stdio: 'inherit' });
    if (stopped.status !== 0) {
      throw new Error(`Could not stop disposable PostgreSQL; retained ${work} for inspection.`);
    }
  }
  rmSync(work, { recursive: true, force: true });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });
}

try {
  // No externally supplied URL is accepted, including CTF_E2E_BASE_URL.
  await run('initdb', ['-D', data, '-U', 'ctf_e2e', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  // Unix socket only: the database has no network listener.
  await run('pg_ctl', ['-D', data, '-l', path.join(work, 'postgres.log'),
    '-o', `-F -k ${work} -p ${port} -c listen_addresses=''`, '-w', 'start']);
  postgresStarted = true;
  await run('psql', ['-h', work, '-p', String(port), '-U', 'ctf_e2e', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE DATABASE ctf_e2e']);
  const publicDir = path.join(work, 'public');
  await run('pnpm', ['exec', 'vite', 'build', '--outDir', publicDir], webDir,
    { NODE_ENV: 'production', PORT: '1', BASE_PATH: '/' });
  const entry = path.join(work, 'server.cjs');
  await run('pnpm', ['exec', 'esbuild', 'tests/dataset-e2e-server.ts', '--bundle',
    '--platform=node', '--format=cjs', '--external:pg-native', `--outfile=${entry}`], apiDir);
  const runId = randomUUID();
  const fixtureEnv = {
    ...env, NODE_ENV: 'test', CTF_E2E_ISOLATED: '1', CTF_E2E_RUN_ID: runId,
    DATABASE_URL: `postgres://ctf_e2e@127.0.0.1:${port}/ctf_e2e?host=${encodeURIComponent(work)}`,
    CTF_E2E_DB_SOCKET: work, CTF_E2E_PUBLIC_DIR: publicDir,
    CTF_INSTRUCTOR_CODE: 'iron-meridian-browser-regression-only',
  };
  server = fork(entry, [], { env: fixtureEnv, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Isolated API startup timed out')), 30_000);
    server.once('message', message => { clearTimeout(timer); resolve(message.url); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Isolated API exited (${code})`)); });
    server.once('error', reject);
  });
  await run('pnpm', ['exec', 'playwright', 'test', '--config', 'playwright.keys.config.ts', ...process.argv.slice(2)],
    webDir, { CTF_E2E_ISOLATED: '1', CTF_E2E_RUN_ID: runId, CTF_E2E_ISOLATED_URL: url });
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
