import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { buildSync } = require('../artifacts/api-server/node_modules/esbuild');
const bundled = buildSync({
  entryPoints: ['artifacts/silent-lantern-ctf/src/lib/ctf.ts'],
  bundle: true, platform: 'node', format: 'cjs', write: false,
  define: { 'import.meta.env.BASE_URL': '"/"' },
}).outputFiles[0].text;
const values = new Map();
const storage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: key => values.delete(key),
};
const uuid = '20000000-0000-4000-8000-000000000001';
function reload() {
  const module = { exports: {} };
  vm.runInNewContext(bundled, { module, exports: module.exports, localStorage: storage, crypto: { randomUUID: () => uuid } });
  const checkInBundle = buildSync({
    entryPoints: ['artifacts/silent-lantern-ctf/src/lib/check-in.ts'],
    bundle: true, platform: 'node', format: 'cjs', write: false,
  }).outputFiles[0].text;
  const checkInModule = { exports: {} };
  vm.runInNewContext(checkInBundle, { module: checkInModule, exports: checkInModule.exports, localStorage: storage, crypto: { randomUUID: () => uuid } });
  return { ...module.exports, ...checkInModule.exports };
}
let api = reload();
assert.equal(api.loadLearnerProfile(), null);
assert.equal(api.loadCheckInDraft().name, '');
const draft = {
  sessionId: uuid, name: 'Test Learner', email: 'learner@example.test',
  instructorEmail: 'instructor@example.test', team: '12',
};
api.storeCheckInDraft(draft);
api = reload();
assert.equal(JSON.stringify(api.loadCheckInDraft()), JSON.stringify(draft), 'Refresh preserves unfinished check-in and retry UUID');
const session = { ...draft, teamNumber: 12 };
api.storeSession(session);
api.clearCheckInDraft();
api = reload();
assert.equal(api.loadSession().sessionId, uuid, 'Refresh automatically resumes the same session');
assert.equal(api.loadLearnerProfile().email, draft.email);
assert.equal(api.loadCheckInDraft().name, draft.name, 'Future check-ins reuse the name');
assert.equal(api.loadCheckInDraft().instructorEmail, draft.instructorEmail);
api.storeSession(null);
api = reload();
assert.equal(api.loadSession(), null);
assert.equal(api.loadCheckInDraft().email, draft.email, 'Session recovery does not discard learner details');
api.storeSession({ sessionId: uuid, name: '', email: '', instructorEmail: '' });
assert.equal(api.loadLearnerProfile().name, draft.name, 'Opening a resume link does not erase remembered details');
const partial = { ...api.loadCheckInDraft(), name: '', email: 'new' };
api.storeCheckInDraft(partial);
api = reload();
assert.equal(api.loadCheckInDraft().email, 'new', 'An edited unfinished check-in survives refresh');
values.set('silent-lantern-check-in', '{bad json');
assert.equal(api.loadCheckInDraft().name, draft.name, 'A corrupt draft falls back to verified learner details');
values.set('silent-lantern-learner-profile', '42');
assert.equal(api.loadLearnerProfile(), null);
const activity = readFileSync('artifacts/silent-lantern-ctf/src/pages/activity.tsx', 'utf8');
assert.ok(activity.includes('sessionId: f.sessionId'), 'Create retries use the retained UUID');
assert.ok(activity.includes('name: p.name, email: p.email'), 'Session identity comes from the saved server response');
console.log('Passed learner-detail persistence checks: refresh, resume, retry, recovery, edits and corrupt storage.');
