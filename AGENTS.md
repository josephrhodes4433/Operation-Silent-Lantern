# AGENTS.md — CTF Workspace

## What this is

A pnpm monorepo with two CTF (capture-the-flag) classroom web apps and a shared Express API server. Originally built on Replit.

## Architecture

- **API server** (`artifacts/api-server`): Express 5, built with esbuild to `dist/index.mjs`. Listens on `PORT`. Routes under `/api`. Requires `DATABASE_URL` (Postgres + Drizzle). Health check at `GET /api/healthz`.
- **SILENT LANTERN CTF** (`artifacts/silent-lantern-ctf`): Vite 7 + React 19 frontend. The primary preview app (port 3000). Uses `wouter` for routing, `@tanstack/react-query` for data. Requires `PORT` and `BASE_PATH` env vars.
- **IRON MERIDIAN CTF** (`artifacts/iron-meridian-ctf`): Second CTF frontend, same stack. Not run in the Base44 preview.
- **Shared libs**: `lib/db` (Drizzle schema + `pg`), `lib/api-zod` (Zod schemas), `lib/api-client-react` (Orval-generated React Query hooks + custom fetch).

## How the frontend talks to the API

The frontend makes relative `/api/...` requests (no `setBaseUrl` call). In Replit, a path-based router proxies `/api` to the API server. In the Base44 sandbox, the Vite dev server proxies `/api` to the API service via `API_PROXY_TARGET` env var (conditional in `vite.config.ts`).

## Setup quirks

- **pnpm version must be 9.x.** Corepack defaults to pnpm 12, which fails with `ERR_PNPM_IGNORED_BUILDS`. The `packageManager` field in `package.json` pins `pnpm@9.15.4`.
- **Lockfile config mismatch.** `pnpm install --frozen-lockfile` fails with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` (overrides in `pnpm-workspace.yaml` don't match the lockfile). Use `--no-frozen-lockfile`.
- **DB schema push required.** Run `pnpm --filter @workspace/db run push` after install to create tables via Drizzle Kit.
- **`CTF_INSTRUCTOR_CODE`** is an optional secret (instructor endpoints return 503 without it). Already set in the Base44 secrets store.

## Base44 dev environment

- `docker compose -f docker-compose.base44.yml up -d` — starts Postgres, deps (install + schema push), API server (port 8080 internal), and Vite dev server (port 3000).
- The `deps` service is one-shot: installs deps and pushes schema, then exits. `api` and `web` depend on it completing.
- Web entry: http://localhost:3000/ (BASE_PATH=/)
