# Base44 dev environment notes

- Run: `docker compose -f docker-compose.base44.yml up -d`. Port 3000 is an nginx path router (`.base44/nginx.conf`) mirroring Replit artifact routing: `/api/*` → api-server :8080, `/silent-lantern/*` → silent-lantern vite :18303, `/` → iron-meridian vite :25140. Vite configs require `PORT` and `BASE_PATH`.
- Use pnpm 10 (installed in containers via npm); pnpm 11 via corepack fails with ERR_PNPM_IGNORED_BUILDS.
- `setup` one-shot service installs deps (shared `node_modules` volume) and runs `drizzle-kit push --force` against the local Postgres.
- api-server has no watch mode (esbuild bundle): after backend edits run `docker compose -f docker-compose.base44.yml restart api`.
- `CTF_INSTRUCTOR_CODE` (optional secret) gates instructor routes; without it they return 503.
- Health: `curl localhost:3000/api/healthz`.
