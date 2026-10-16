# Instructor history browser regression

Run from the workspace root:

```sh
pnpm --filter @workspace/silent-lantern-ctf test:e2e:history
```

Requires PostgreSQL tools (`initdb`, `pg_ctl`) and Playwright Chromium. Install
Chromium with `pnpm --filter @workspace/silent-lantern-ctf exec playwright install chromium`,
or set `LANTERN_E2E_CHROMIUM_PATH` to an existing compatible Chromium executable.
The latter is useful on NixOS. The runner gives subprocesses a temporary HOME
while explicitly retaining access to the default Playwright browser-binary cache.

The runner builds the actual frontend with `/silent-lantern/` routing, bundles
the real Lantern API router into a test-only server, and owns a disposable
PostgreSQL cluster (Unix socket only). The server checks its database path and
synthetic instructor code before seeding two synthetic learners. The browser
checks a per-run isolation marker before making any changes and blocks
cross-origin requests. No live target URL is accepted, and classroom secrets,
database URLs and session secrets are not inherited by build/server/test
subprocesses. No managed classroom workflows are repointed.

Coverage: access gate, lazy per-question expansion/collapse, empty history,
chronological versions, newly saved approval and feedback without reload or
polling, learner switching with a delayed response, a failed history request
with a visible error and explicit Retry (polling paused), learner/question
isolation during the held retry and after recovery, locking with a delayed
response, stopped polling, unauthorized history requests, reload, and fresh
unlock. Existing API history tests remain responsible for persistence,
migrations, rollback, stale approvals and concurrent reviews.

Failures exit nonzero and keep screenshots/traces in `test-results/`; the
runner stops its server and removes the disposable database on success,
failure or interruption. Tests intentionally run serially as one classroom
review journey. The test-only server and config are not used in production.
