# Classroom browser regressions

Run against the **development** routed preview with both the web and API managed
workflows running. Never run against a published classroom app: these checks
create new, uniquely named learner sessions in the development database.
They do not modify existing learner records or shared answer keys, and never
click the mailto link or send email.

## Run

```sh
pnpm --filter @workspace/iron-meridian-ctf exec playwright install chromium
pnpm --filter @workspace/iron-meridian-ctf run typecheck:e2e
CTF_E2E_BASE_URL="https://<development-domain>" \
  pnpm --filter @workspace/iron-meridian-ctf run test:e2e -- --grep-invert "instructor access"
```

For the **full suite**, temporarily restart the development API workflow with
`CTF_INSTRUCTOR_CODE=iron-meridian-browser-regression-only`, using the workflow's
test environment override. This is a public test value, not a credential. Do not
read, print, or replace the saved classroom secret. Run:

```sh
CTF_E2E_TEST_INSTRUCTOR=1 CTF_E2E_BASE_URL="https://<development-domain>" \
  pnpm --filter @workspace/iron-meridian-ctf run test:e2e
```

Restart the managed API workflow normally immediately afterward to restore its
configured environment, even if the suite fails. Do not set the temporary
override in production. Instructor scoring refuses to run without the explicit
test flag; it never loads the real secret.

`CTF_E2E_BASE_URL` is optional on Replit, where the development domain is used by
default. Outside Replit it defaults to the routed proxy at `http://localhost:80`.
There are no auto-started duplicate web servers. Run tests serially (the default)
because they share the development database and instructor attempt limiter.
On Replit, the config automatically uses the managed Chromium executable when
available, avoiding missing system libraries in a downloaded browser binary.
Elsewhere, it uses Playwright's installed Chromium. Set `CTF_E2E_CHROMIUM_PATH`
to use a different installed browser executable if required.

## Coverage and boundaries

### Isolated instructor key management

```sh
pnpm run typecheck:libs
pnpm --filter @workspace/api-server run typecheck:e2e
pnpm --filter @workspace/iron-meridian-ctf run typecheck:e2e
pnpm --filter @workspace/iron-meridian-ctf run test:e2e:keys
```

This separate suite requires `initdb`, `pg_ctl`, and `psql` on `PATH`, plus
Chromium (the managed Replit executable is detected automatically). It creates a
fresh local PostgreSQL cluster in a temporary directory, with a Unix-socket-only
database, builds the real web UI, and runs the real CTF router against that
database on a loopback-only fixture server. No managed workflows are stopped or
reconfigured. All fixture data and processes are removed on success, failure,
or a normal interrupt; Playwright reports remain available.

The runner does **not** accept a database URL or target app URL. It passes only
an allowlisted environment to subprocesses, excluding saved classroom secrets,
and supplies its own public instructor test code. The regular browser config
excludes `key-management.spec.ts`; its separate config fails closed without the
runner, and the test checks a per-run isolation marker before any mutation.
Do not manually point these tests at a classroom server.

Coverage uses existing dataset flag 13; it does not author or restore missing
question content. It verifies:

- Wrong-code UI rejection, unauthenticated/wrong-code key read/write denial,
  blank-key rejection and refusal to key a fixed-answer flag.
- Instructor UI key creation/replacement with whitespace-trimmed multiline
  accepted answers.
- Real server numeric normalization (commas, whitespace, decimals, leading
  zeros), and incorrect/nonfinite values.
- Regrading two already-saved learners in opposite directions on learner,
  instructor list and instructor detail endpoints, without resubmitting answers.
- Unchanged fixed answers, manual points/notes, answer timestamps, saved time,
  answered counts and review-ready markers.
- Learner browser reload/private-link resume and instructor reload/reunlock
  retain the current grades and stored key.

The fixture uses minimal PostgreSQL tables matching the CTF schema; this is
real SQL/persistence coverage, not an in-memory adapter or schema-migration test.
Application requests use the fixture's same origin; the local fixture is not a
second preview server or a Vite proxy.

### Regular development-preview suite

- Empty onboarding fields cannot start a session; valid onboarding persists it.
- Incorrect/correct fixed answers, exact multi-select sets, clearing answers.
- 900ms autosave, delayed saves followed by a newer edit and navigation.
- Refresh before debounce, offline failure/retry, newer draft recovery over an
  older server response, private-link resume in a clean browser, invalid links.
- Dataset pending/keyed/incorrect/correct states and numeric normalization.
  This test intercepts activity/progress for **one dataset flag only**, using
  controlled pending/incorrect/correct API responses. Learner answers still
  persist through the real API. This checks the browser contract, not shared-key
  management or the backend evaluator. No shared dataset key is changed.
- 300-word boundary in the browser and API; 301 words remain a local draft.
- Instructor gate, unauthenticated API denial, valid manual scoring, bounds,
  notes and totals after resume, lock/reload.
- Results text download content, normal email draft and large encoded body
  fallback, review-ready marker. Email delivery is intentionally not tested.

Reports: `playwright-report/`; failure traces/screenshots: `test-results/`.
These are ignored by Git. Open the report with `playwright show-report` from
this artifact directory. New development test sessions are retained for
inspection; identify them by the `Browser regression` name prefix. No broad
database cleanup is performed.
