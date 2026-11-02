# AGENTS.md — CTF workspace (Base44 sandbox notes)

pnpm monorepo: two Vite/React CTF sites (`artifacts/iron-meridian-ctf`, `artifacts/silent-lantern-ctf`)
and one Express API (`artifacts/api-server`). Originally a Replit project; `.replit` and the
per-artifact `.replit-artifact/artifact.toml` files still describe how Replit builds and runs it.

## Running it here

- `docker compose -f docker-compose.base44.yml up -d --build` — Postgres, one-shot `pnpm install`,
  one-shot schema push, API on 8080, both Vite dev servers, and an nginx proxy on **host port 3000**.
- Entry points on port 3000: `/iron-meridian/`, `/silent-lantern/`, `/api/*`. `/` redirects to
  `/iron-meridian/` (the vite dev server serves that legacy redirect).
- Logs: `docker compose -f docker-compose.base44.yml logs -f api web-iron web-silent proxy`.

## Things that bite

- **pnpm must be 10.x.** `package.json` pins `packageManager: pnpm@10.18.3`; corepack's newest
  default (pnpm 12) fails this workspace with `ERR_PNPM_IGNORED_BUILDS` because it no longer reads
  `onlyBuiltDependencies` from `pnpm-workspace.yaml`. `.base44/dev-node.Dockerfile` bakes the same
  version into the dev image — keep the two in step.
- **One origin is required.** The frontends call relative `/api/...` URLs and both sites live under
  separate base paths, so `nginx.base44.conf` proxies all three upstreams. Do not point the sites at
  the API host directly.
- **nginx caches upstream IPs.** Any recreated container gets a new IP; without the `resolver` +
  variable `proxy_pass` in `nginx.base44.conf` the preview 502s until the proxy restarts.
- **Two separate SPAs.** `/iron-meridian/` and `/silent-lantern/` are different documents with
  different `<title>`s. Client-side (history) navigation between them shows a blank page — always
  full-load the path.
- **The API has no file watcher.** `pnpm --filter @workspace/api-server run dev` is build-then-start;
  after backend edits run `docker compose -f docker-compose.base44.yml restart api` and reload the
  preview. Do not wrap that bundle in `node --watch`: the pino/thread-stream worker crashes on restart.
- **Schema is not migrated by the app.** The `migrate` service runs
  `pnpm --filter @workspace/db run push-force` from the Drizzle schema; questions/activities
  themselves are code (`src/lib/*-activity.ts`), so a fresh database still renders both sites.
- **Root `pnpm run build` needs per-artifact env.** Each vite config requires `PORT` (and `BASE_PATH`),
  including the `mockup-sandbox` design artifact, which has no route in this stack. Build the
  deployable artifacts individually, as Replit does:
  `PORT=25140 BASE_PATH=/iron-meridian/ pnpm --filter @workspace/iron-meridian-ctf run build`,
  `PORT=18303 BASE_PATH=/silent-lantern/ pnpm --filter @workspace/silent-lantern-ctf run build`,
  `pnpm --filter @workspace/api-server run build`. The vite builds print one harmless
  `tooltip.tsx (2:0): Error when using sourcemap` line from the `'use client'` directive.
- **Production start** is `node artifacts/<site>/server.mjs` (see each `artifact.toml`): it validates
  `dist/public/index.html`, the base path and the title, and answers `/<base>/__site_health`.
  Both servers and the esbuild API bundle were verified to start.

## Secrets

- `CTF_INSTRUCTOR_CODE` — optional; instructor endpoints return 503 without it. Delivered by the
  platform through `/run/base44/app.env` (`env_file:` on the `api` service). Never put it under
  compose `environment:`.
