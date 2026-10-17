"""Package the two current CTFs independently without changing running apps/data."""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import os
import re
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("lantern_export", ROOT / "scripts/export-silent-lantern.py")
lantern = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lantern)

SEPARATION = """\
# Separate-project setup and preservation checklist

This archive contains ONE independently runnable app, its API, its schema,
and its generated API client. It does not call the other CTF's server.
The site's existing appearance, questions, grading and learner/instructor
workflows are preserved. The standalone site is mounted at `/` rather than
sharing a subpath with the other activity.

## What has and has not been transferred

The archive contains source code, not a live Replit project. Import it into a
new project using Replit's ZIP import. The current combined project remains
unchanged and is the authoritative source for all existing saved work.

No database records, credentials or instructor access-code values are in this
ZIP. Do not retire the original project or tell learners their old work has
moved until the following data checks are complete.

## Preserve saved work before changing links

1. Create each destination project with its OWN PostgreSQL database. Never
   connect either standalone app to a fresh shared database or the other app's
   destination database.
2. Create the destination development schema using `pnpm run db:push`.
   For Replit-managed production databases, use the normal Publish schema
   process; do not add schema changes to production startup/build commands.
3. Copy the appropriate SOURCE database records into the matching destination
   database through an authorized database export/import workflow. Development
   records and published production records are separate: transferring one does
   not transfer the other. See `separation-manifest.json` for the exact tables
   and activity filter. Do not export unrelated tables or the other activity's
   rows from the shared tables.
4. Retain every primary key, session ID, window ID, calendar date, timestamp,
   answer JSON, configured key, custom question, review decision, feedback,
   completion-notification state and written-history record. Copy referenced
   progress rows before written history. Preserve the serial sequence positions
   so subsequent inserts do not collide with imported IDs.
5. Add the original project's required secret settings through the destination
   project's Secrets tool. Set the requested instructor code there; never put it
   in source files, this checklist, or the ZIP. Do not remove source secrets.
6. Before switching users, compare per-table/per-activity row counts and check
   that representative old sessions, responses, points, feedback, archives and
   activity-window timestamps match. Check learner resume, instructor review,
   accept/accept-with-feedback/deny, leaderboard, results download and optional
   email draft in EACH destination.
7. Publish each app separately, preserving the intended deployment access
   restrictions. Obtain each actual published URL from its Publishing pane.
   An existing resume link keeps its original session ID, but must use the NEW
   app's origin and `/activity?resume=...`; it cannot move domains automatically.
8. Stop new submissions briefly for the final data copy, reconcile anything
   saved during setup, verify both destinations, then distribute the two new
   URLs. Keep the source intact until both are confirmed.

The ZIP import alone does not complete the data transfer, secret setup,
publishing, or cutover. These require access to the destination projects.
No current sessions have been reset, reopened, modified, or deleted.
"""


def preservation_manifest(slug, activity):
    owned = ["ctf_progress", "ctf_keys", "ctf_questions"] if activity == "ctf" else [
        "lantern_progress", "lantern_keys", "lantern_written_history"]
    shared = ["classroom_windows", "classroom_teams", "classroom_notifications"]
    hashes = {}
    for source in sorted((ROOT / "artifacts" / slug / "src").rglob("*")):
        if source.is_file():
            hashes[str(source.relative_to(ROOT))] = hashlib.sha256(source.read_bytes()).hexdigest()
    return {
        "app": slug, "activity": activity, "websiteBasePath": "/",
        "databaseRowsIncluded": False, "secretsIncluded": False,
        "tables": [{"name": name, "filter": None} for name in owned] +
                  [{"name": name, "filter": {"activity": activity}} for name in shared],
        "preserve": ["all existing column values", "primary keys", "sequence positions",
                     "session IDs", "activity window IDs", "timestamps", "calendar dates"],
        "unchangedFrontendSourceSHA256": hashes,
    }


def package(stage, destination, slug, activity):
    lantern.write(stage, "SEPARATION.md", SEPARATION)
    manifest = preservation_manifest(slug, activity)
    lantern.write(stage, "separation-manifest.json", json.dumps(manifest, indent=2) + "\n")
    for relative, digest in manifest["unchangedFrontendSourceSHA256"].items():
        assert hashlib.sha256((stage / relative).read_bytes()).hexdigest() == digest, relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
        for current, directories, files in os.walk(stage):
            directories[:] = [name for name in directories if name not in lantern.IGNORED]
            for name in files:
                if name in lantern.ignored(current, [name]):
                    continue
                source = Path(current) / name
                archive.write(source, source.relative_to(stage))
    with zipfile.ZipFile(destination) as archive:
        assert archive.testzip() is None
        names = archive.namelist()
        assert not any(".env" in Path(name).name or "node_modules" in Path(name).parts for name in names)
        other = "silent-lantern-ctf" if activity == "ctf" else "iron-meridian-ctf"
        assert not any(name.startswith(f"artifacts/{other}/") for name in names)
    print(f"Verified package: {destination.relative_to(ROOT)} ({destination.stat().st_size:,} bytes)")


def verify_iron_server(stage):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    process = subprocess.Popen(["node", "artifacts/api-server/dist/index.mjs"], cwd=stage,
        env={"PATH": os.environ["PATH"], "PORT": str(port), "NODE_ENV": "production",
             "DATABASE_URL": "postgresql://fixture:fixture@127.0.0.1:1/unused",
             "CTF_INSTRUCTOR_CODE": "standalone-export-test-only"},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}"
    try:
        for _ in range(80):
            if process.poll() is not None:
                raise RuntimeError("Standalone IRON MERIDIAN server stopped before becoming ready.")
            try:
                with urllib.request.urlopen(base + "/api/healthz", timeout=1) as response:
                    assert json.load(response)["status"] == "ok"
                break
            except urllib.error.URLError:
                time.sleep(0.1)
        else:
            raise RuntimeError("Standalone IRON MERIDIAN server did not become ready.")
        for route in ["/", "/activity", "/results", "/instructor", "/leaderboard"]:
            with urllib.request.urlopen(base + route) as response:
                html = response.read().decode()
                assert "<title>IRON MERIDIAN CTF</title>" in html
                assert "SILENT LANTERN" not in html
        for asset in re.findall(r'(?:src|href)="(/assets/[^"]+)"', html):
            with urllib.request.urlopen(base + asset) as response:
                assert response.status == 200 and response.read()
        for route in ["/api/lantern/activity", "/api/lantern/window", "/api/lantern/instructor/review-queue"]:
            try:
                urllib.request.urlopen(base + route)
            except urllib.error.HTTPError as error:
                assert error.code == 404
            else:
                raise RuntimeError("Other activity's API is still reachable.")
        print("Verified IRON root pages, assets, API health and exclusion of SILENT LANTERN endpoints.")
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def export_iron(destination):
    with tempfile.TemporaryDirectory(prefix="iron-meridian-project-") as directory:
        stage = Path(directory)
        slug = "iron-meridian-ctf"
        for relative in ["tsconfig.base.json", "tsconfig.json", "pnpm-workspace.yaml",
                         "pnpm-lock.yaml", f"artifacts/{slug}", "lib/db",
                         "lib/api-client-react", "lib/api-zod", "lib/api-spec"]:
            lantern.copy(stage, relative)
        for relative in ["build.mjs", "package.json", "tsconfig.json", "src/app.ts", "src/index.ts",
                         "src/routes/health.ts", "src/routes/ctf.ts", "src/routes/classroom.ts",
                         "src/lib/logger.ts", "src/lib/instructor-access.ts", "src/lib/classroom-teams.ts",
                         "src/lib/classroom-window.ts", "src/lib/iron-progress.ts",
                         "src/lib/ctf-question-authoring.ts", "src/lib/ctf-activity.ts",
                         "src/lib/ctf-facilitator-key.ts", "src/lib/iron-choice-questions.ts",
                         "src/lib/iron-answer-guide.ts", "src/data/questions.json"]:
            lantern.copy(stage, "artifacts/api-server/" + relative)
        api_package = json.loads((stage / "artifacts/api-server/package.json").read_text())
        api_package["scripts"] = {key: value for key, value in api_package["scripts"].items()
                                  if not key.startswith("test:")}
        lantern.write(stage, "artifacts/api-server/package.json", json.dumps(api_package, indent=2) + "\n")
        classroom_path = stage / "artifacts/api-server/src/routes/classroom.ts"
        classroom = classroom_path.read_text()
        classroom = "\n".join(line for line in classroom.split("\n")
                              if not any(f'from "../lib/{module}"' in line
                                         for module in ["lantern-progress", "lantern-activity"]))
        first = classroom.index('  if (activity === "ctf") {')
        branch_end = classroom.index('  const [rows, keys] = await Promise.all([pool.query<LanternRow>', first)
        function_end = classroom.index('\n}\nfor (const activity', branch_end)
        iron_branch = classroom[first + len('  if (activity === "ctf") {\n'):branch_end]
        assert iron_branch.endswith("  }\n")
        classroom = classroom[:first] + iron_branch[:-4] + classroom[function_end:]
        classroom = classroom.replace('["ctf", "lantern"] as const', '["ctf"] as const')
        classroom_path.write_text(classroom)
        lantern.write(stage, "artifacts/api-server/src/routes/index.ts", """\
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ctfRouter from "./ctf";
import classroomRouter from "./classroom";
const router: IRouter = Router();
router.use(healthRouter);
router.use(classroomRouter);
router.use(ctfRouter);
export default router;
""")
        lantern.write(stage, "lib/db/src/schema/index.ts",
                      'export * from "./ctf";\nexport * from "./ctf-questions";\n'
                      'export * from "./classroom-teams";\nexport * from "./classroom-windows";\n')
        (stage / "lib/db/src/schema/lantern.ts").unlink()
        db_package = json.loads((stage / "lib/db/package.json").read_text())
        db_package["scripts"] = {key: value for key, value in db_package["scripts"].items()
                                 if "lantern" not in key}
        lantern.write(stage, "lib/db/package.json", json.dumps(db_package, indent=2) + "\n")
        for source in (stage / "lib/db/src").glob("*lantern*"):
            source.unlink()
        app = (stage / "artifacts/api-server/src/app.ts").read_text()
        marker = 'app.use("/api", router);'
        assert app.count(marker) == 1
        app = 'import path from "node:path";\n' + app.replace(marker, marker + """
// Standalone app: API and root website share this project's single server.
const publicDir = path.resolve(process.cwd(), "artifacts/iron-meridian-ctf/dist/public");
app.use(express.static(publicDir));
app.get("/{*path}", (req, res) => {
  if (req.path === "/api" || req.path.startsWith("/api/")) {
    res.status(404).json({ error: "API route not found." });
    return;
  }
  res.set("Cache-Control", "no-store").sendFile(path.join(publicDir, "index.html"));
});
""")
        lantern.write(stage, "artifacts/api-server/src/app.ts", app)
        index = (stage / "artifacts/api-server/src/index.ts").read_text()
        assert "app.listen(port, (err)" in index
        lantern.write(stage, "artifacts/api-server/src/index.ts",
                      index.replace("app.listen(port, (err)", 'app.listen(port, "0.0.0.0", (err)'))
        contract = (stage / "lib/api-spec/openapi.yaml").read_text()
        contract, removed = re.subn(r"^  /lantern[^\n]*:\n.*?(?=^  /|^components:|\Z)",
                                   "", contract, flags=re.M | re.S)
        assert removed > 10 and "lantern.yaml" not in contract
        lantern.write(stage, "lib/api-spec/openapi.yaml", contract)
        (stage / "lib/api-spec/lantern.yaml").unlink()
        config = (stage / "lib/api-spec/orval.config.ts").read_text().replace(
            '      parserOptions: { externalRefs: { allow: ["./lantern.yaml"] } },\n', "")
        lantern.write(stage, "lib/api-spec/orval.config.ts", config)
        root_package = json.loads((ROOT / "package.json").read_text())
        root_package["name"] = "iron-meridian-project"
        root_package["packageManager"] = "pnpm@" + subprocess.check_output(["pnpm", "--version"], text=True).strip()
        root_package.pop("dependencies", None)
        root_package["scripts"].update({
            "dev": "pnpm run build && pnpm run start",
            "build": "pnpm run typecheck && pnpm --filter @workspace/api-server run build && BASE_PATH=/ PORT=5000 pnpm --filter @workspace/iron-meridian-ctf run build",
            "start": "PORT=${PORT:-5000} node --enable-source-maps artifacts/api-server/dist/index.mjs",
            "typecheck": "pnpm run typecheck:libs && pnpm --filter @workspace/api-server run typecheck && pnpm --filter @workspace/iron-meridian-ctf exec tsc --noEmit",
            "codegen": "pnpm --filter @workspace/api-spec run codegen",
            "db:push": "pnpm --filter @workspace/db run push",
        })
        lantern.write(stage, "package.json", json.dumps(root_package, indent=2) + "\n")
        lantern.write(stage, ".gitignore", "node_modules/\ndist/\n.types/\n*.tsbuildinfo\n.env\n.env.*\n")
        lantern.write(stage, ".replit", """\
modules = ["nodejs-24"]
run = "sh -c 'pnpm install --frozen-lockfile && pnpm run dev'"
[[ports]]
localPort = 5000
externalPort = 80
[deployment]
deploymentTarget = "autoscale"
build = ["sh", "-c", "pnpm install --frozen-lockfile && pnpm run build"]
run = ["sh", "-c", "pnpm run start"]
""")
        readme = """\
# IRON MERIDIAN CTF — independent app

Import this ZIP into its own Replit project. The complete existing IRON
MERIDIAN website and instructor console run at `/`, backed by this project's
own API and database. SILENT LANTERN is not included.

**Read SEPARATION.md before moving saved work or changing live links.**

Set `CTF_INSTRUCTOR_CODE` through the new project's Secrets tool.
Replit supplies the new project's own PostgreSQL `DATABASE_URL`.
After installing dependencies, explicitly initialize the DEVELOPMENT schema:
`pnpm run db:push`. Run `pnpm run dev` to typecheck, build and start the app.
Use the normal Publish schema process for managed production databases.
No database schema changes run during production build or startup.

Commands: `pnpm install --frozen-lockfile`, `pnpm run dev`, `pnpm run build`,
`pnpm run start`, `pnpm run codegen`, `pnpm run db:push`.

Existing features remain: eight sections and 120 baseline flags; anonymous
team/instructor check-in; saved shared-team work; automatic multiple-choice
validation; written-response accept/accept-with-feedback/deny and point updates;
instructor question and key configuration; pending-review sorting; completion
notifications; dated archives; leaderboard; 24-hour activity window and password
reopening; instructor-only answer guide; downloadable results; optional transient
email drafts. The learner's mail app still sends the email, not this server.

This source archive does NOT contain existing records or secret values.
The source project and its existing saved work have not been changed.
"""
        lantern.write(stage, "README.md", readme)
        lantern.write(stage, "replit.md", readme)
        for args in [("pnpm", "install", "--lockfile-only"),
                     ("pnpm", "install", "--frozen-lockfile"),
                     ("pnpm", "run", "codegen"), ("pnpm", "run", "build")]:
            lantern.run(stage, *args)
        verify_iron_server(stage)
        package(stage, destination, slug, "ctf")


def export_lantern(destination):
    with tempfile.TemporaryDirectory(prefix="lantern-archive-") as directory:
        intermediate = Path(directory) / "source.zip"
        lantern.export(intermediate)
        stage = Path(directory) / "project"
        with zipfile.ZipFile(intermediate) as archive:
            archive.extractall(stage)
        # The shared deployment's auxiliary server is unnecessary at standalone /.
        for filename in ["server.mjs", "server.test.mjs"]:
            (stage / "artifacts/silent-lantern-ctf" / filename).unlink(missing_ok=True)
        package(stage, destination, "silent-lantern-ctf", "lantern")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--activity", choices=["both", "iron", "lantern"], default="both")
    parser.add_argument("--output-dir", default="generated-artifacts/separate-ctf-apps")
    options = parser.parse_args()
    directory = ROOT / options.output_dir
    if options.activity in ["both", "iron"]:
        export_iron(directory / "IRON-MERIDIAN-Independent-App.zip")
    if options.activity in ["both", "lantern"]:
        export_lantern(directory / "SILENT-LANTERN-Independent-App.zip")
