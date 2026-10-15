"""Build a verified, source-only SILENT LANTERN project ZIP.

This never reads secrets or exports database records. All project adjustments
are made to temporary copies, not to either running classroom application.
"""
from pathlib import Path
import argparse
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
IGNORED = {
    "node_modules", "dist", ".git", ".replit-artifact", ".cache",
    ".vite", ".types", ".tsbuildinfo", "__pycache__",
}


def ignored(_directory, names):
    return [
        name for name in names
        if name in IGNORED or name.endswith(".tsbuildinfo")
        or name == ".env" or name.startswith(".env.")
    ]


def copy(stage, relative):
    source, target = ROOT / relative, stage / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if source.is_dir():
        shutil.copytree(source, target, ignore=ignored)
    else:
        shutil.copyfile(source, target)


def write(stage, relative, contents):
    path = stage / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(contents, encoding="utf-8")


def run(stage, *args):
    subprocess.run(args, cwd=stage, check=True)


def verify_server(stage):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    # Never inherit classroom database credentials, even for a health check.
    # The dummy connection is not opened: these checks need no database.
    server = subprocess.Popen(
        ["node", "artifacts/api-server/dist/index.mjs"], cwd=stage,
        env={"PATH": os.environ["PATH"], "PORT": str(port), "NODE_ENV": "production",
             "DATABASE_URL": "postgresql://fixture:fixture@127.0.0.1:1/unused",
             "CTF_INSTRUCTOR_CODE": "standalone-export-test-only"},
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    base = f"http://127.0.0.1:{port}"
    try:
        for _ in range(60):
            if server.poll() is not None:
                raise RuntimeError("The standalone server failed to start.")
            try:
                with urllib.request.urlopen(base + "/api/healthz", timeout=1) as response:
                    assert json.load(response)["status"] == "ok"
                break
            except urllib.error.URLError:
                time.sleep(0.1)
        else:
            raise RuntimeError("The standalone server did not become ready.")
        for route in ["/", "/activity", "/results", "/instructor"]:
            with urllib.request.urlopen(base + route) as response:
                html = response.read().decode()
                assert "SILENT LANTERN" in html
        for asset in re.findall(r'(?:src|href)="(/assets/[^"]+)"', html):
            with urllib.request.urlopen(base + asset) as response:
                assert response.status == 200
                assert response.read()
        try:
            urllib.request.urlopen(base + "/api/ctf/activity")
        except urllib.error.HTTPError as error:
            assert error.code == 404
        else:
            raise RuntimeError("The original application's API was included.")
        print("Standalone root routes, JS/CSS assets and API health verified.")
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()
        server.stdout.close()


def export(destination):
    with tempfile.TemporaryDirectory(prefix="silent-lantern-project-") as directory:
        stage = Path(directory)
        for relative in [
            "tsconfig.base.json", "tsconfig.json", "pnpm-workspace.yaml",
            "pnpm-lock.yaml", "artifacts/silent-lantern-ctf",
            "lib/db", "lib/api-client-react", "lib/api-zod", "lib/api-spec",
        ]:
            copy(stage, relative)

        api_files = [
            "build.mjs", "package.json", "tsconfig.json", "run-lantern-history-tests.mjs", "src/app.ts",
            "src/index.ts", "src/lib/logger.ts", "src/lib/instructor-access.ts",
            "src/lib/lantern-activity.ts", "src/lib/lantern-progress.ts", "src/lib/lantern-review.ts",
            "src/lib/lantern-history.ts",
            "src/lib/lantern-answer-guide.ts",
            "src/lib/lantern-choice-feedback.ts",
            "src/routes/health.ts", "src/routes/lantern.ts",
            "src/tests/lantern-history.test.ts",
        ]
        for relative in api_files:
            copy(stage, "artifacts/api-server/" + relative)
        api_package = json.loads((stage / "artifacts/api-server/package.json").read_text())
        # These shared-workspace test suites import the other activity and are
        # intentionally not shipped in the standalone application.
        for command in ["test:questions", "test:answer-guides", "test:multiple-choice"]:
            api_package["scripts"].pop(command, None)
        write(stage, "artifacts/api-server/package.json", json.dumps(api_package, indent=2) + "\n")

        write(stage, "artifacts/api-server/src/routes/index.ts", """\
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import lanternRouter from "./lantern";
const router: IRouter = Router();
router.use(healthRouter);
router.use(lanternRouter);
export default router;
""")
        write(stage, "lib/db/src/schema/index.ts", 'export * from "./lantern";\n')
        (stage / "lib/db/src/schema/ctf.ts").unlink(missing_ok=True)

        app = (stage / "artifacts/api-server/src/app.ts").read_text()
        marker = 'app.use("/api", router);'
        if app.count(marker) != 1:
            raise RuntimeError("The API entry point changed; inspect before exporting.")
        app = 'import path from "node:path";\n' + app.replace(
            marker, marker + """
// Standalone project: one server serves both the API and the root website.
const publicDir = path.resolve(process.cwd(), "artifacts/silent-lantern-ctf/dist/public");
app.use(express.static(publicDir));
app.get("/{*path}", (req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "API route not found." });
    return;
  }
  res.sendFile(path.join(publicDir, "index.html"));
});
""").replace("(?:ctf|lantern)", "lantern")
        write(stage, "artifacts/api-server/src/app.ts", app)

        index = (stage / "artifacts/api-server/src/index.ts").read_text()
        if "app.listen(port, (err)" not in index:
            raise RuntimeError("The API listener changed; inspect before exporting.")
        write(stage, "artifacts/api-server/src/index.ts",
              index.replace("app.listen(port, (err)", 'app.listen(port, "0.0.0.0", (err)'))

        # A single, self-contained contract: no IRON MERIDIAN API or models.
        contract = (ROOT / "lib/api-spec/lantern.yaml").read_text()
        # Carry the protected guide contract and its shared models into the
        # self-contained export without including the other activity's API.
        root_contract = (ROOT / "lib/api-spec/openapi.yaml").read_text()
        guide_path = re.search(r"^  /lantern/instructor/answer-guide:\n.*?(?=^  /|\Z)", root_contract, re.M | re.S)
        guide_schemas = re.findall(r"^    InstructorAnswerGuide(?:Entry)?:\n.*?(?=^    [A-Za-z]|\Z)", root_contract, re.M | re.S)
        if not guide_path or len(guide_schemas) != 2:
            raise RuntimeError("Instructor answer-guide contract changed; inspect before exporting.")
        contract = contract.replace("paths:\n", "paths:\n" + guide_path.group(), 1)
        contract = contract.replace("  schemas:\n", "  schemas:\n" + "".join(guide_schemas), 1)
        contract = contract.replace("paths:\n", """\
paths:
  /healthz:
    get:
      operationId: healthCheck
      responses:
        "200":
          description: Healthy
          content:
            application/json:
              schema: { $ref: "#/components/schemas/HealthStatus" }
""", 1).replace("  schemas:\n", """\
  schemas:
    HealthStatus:
      type: object
      required: [status]
      properties:
        status: { type: string }
""", 1)
        write(stage, "lib/api-spec/openapi.yaml", contract)
        (stage / "lib/api-spec/lantern.yaml").unlink()
        config = (stage / "lib/api-spec/orval.config.ts").read_text()
        config = config.replace(
            '      parserOptions: { externalRefs: { allow: ["./lantern.yaml"] } },\n', ""
        )
        write(stage, "lib/api-spec/orval.config.ts", config)

        root_package = json.loads((ROOT / "package.json").read_text())
        root_package["name"] = "silent-lantern-project"
        root_package["packageManager"] = "pnpm@" + subprocess.check_output(
            ["pnpm", "--version"], text=True
        ).strip()
        root_package.pop("dependencies", None)
        root_package["scripts"].update({
            "dev": "pnpm --filter @workspace/db run push && pnpm run db:migrate-history && pnpm run build && pnpm run start",
            "build": "pnpm run typecheck && pnpm --filter @workspace/api-server run build && BASE_PATH=/ PORT=5000 pnpm --filter @workspace/silent-lantern-ctf run build",
            "start": "PORT=${PORT:-5000} node --enable-source-maps artifacts/api-server/dist/index.mjs",
            "typecheck": "pnpm run typecheck:libs && pnpm --filter @workspace/api-server run typecheck && pnpm --filter @workspace/silent-lantern-ctf exec tsc --noEmit",
            "codegen": "pnpm --filter @workspace/api-spec run codegen",
            "db:push": "pnpm --filter @workspace/db run push",
            "db:migrate-history": "pnpm --filter @workspace/db run migrate:lantern-history",
        })
        write(stage, "package.json", json.dumps(root_package, indent=2) + "\n")
        write(stage, ".gitignore", """\
node_modules/
dist/
.types/
*.tsbuildinfo
.env
.env.*
!.env.example
""")
        write(stage, ".replit", """\
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
# Operation SILENT LANTERN — standalone project

This project contains only the SILENT LANTERN UFED-only classroom activity,
its backend, and its database schema. It does not depend on IRON MERIDIAN.
The website runs at `/`, with its own instructor console at `/instructor`.

## Create the separate Replit project

1. Go to https://replit.com/import and select **ZIP**.
2. Upload this archive and name the new project **SILENT LANTERN CTF**.
3. In the new project, use Replit's Database tool to provision/configure a
   **new PostgreSQL database**. Do not point it at the IRON MERIDIAN database.
   Replit supplies `DATABASE_URL`; no connection value is included here.
4. Add `CTF_INSTRUCTOR_CODE` in the new project's **Secrets** tool.
   No secret values have been copied from the original project.
5. Click **Run**. Dependencies install, development tables are created,
   and the website builds and starts on one port.
6. In **Instructor**, configure the iPhone Major match, courier alias, and final
   watchlist keyword. Enter only the keyword for the final TPL key. Review each
   learner's SIM IMSI individually. No preserved extraction or AUTH token is required.

Learner records, instructor dataset keys and existing resume sessions are
NOT included. The new project starts with a fresh database. The original
projects and their saved records have not been deleted or changed.

## Features

- Six UFED-only missions, 26 responses, 165 base points
- Names, team numbers, learner email and instructor email
- Saved responses and private resume links
- Self-validation, strict flag formats and server-enforced mission unlocks
- Three hint tokens, each deducting two points
- Knowledge-based Preserved/SafeGuard questions, iPhone Triage before targeted
  collection, individual SIM review, and UFED Classic ZTE Mission 5
- Read-only archived responses from the earlier curriculum; original records are retained
- Written-answer review, optional speed and tradecraft bonuses
- Instructor-only searchable answer guide with sample responses and print view
- Protected per-question history of written submissions and instructor decisions
- Downloadable results and provider-free email drafts

Email opens the learner's mail app. It does not send automatically.

## Commands

- `pnpm install --frozen-lockfile`
- `pnpm run dev` — initialize development schema, build and start
- `pnpm run build` — typecheck and build both parts
- `pnpm run start` — run the built website and API
- `pnpm run codegen` — regenerate clients and validators after API changes
- `pnpm run db:push` — apply the schema to the configured development database
- `pnpm run db:migrate-history` — additive history migration; retains existing
  latest responses as imported snapshots without inventing lost attempts or review times

Production runs the built application; it does not run database schema
changes at startup. Configure the new project's production database and
schema through Replit's publishing/database setup before using it live.

## Source of truth

Use the feedback workbook and feedback DOCX in `resources/` as the latest
curriculum changes; they supersede the older question order, preserved-device
requirement, SIM assumptions, and Mission 5 in the original packets.
The canonical structure remains six missions. Do not add PA/Streamline workflows
or the conflicting eight-phase narrative as additional graded missions.
"""
        write(stage, "README.md", readme)
        write(stage, "replit.md", readme)

        resources = {
            "CEDI_CTF_App_Recommendations-1_1792081365328.xlsx": "Latest_App_Recommendations.xlsx",
            "CTF_Feedback_2_1792081451038.docx": "Latest_CTF_Feedback.docx",
            "Operation_SILENT_LANTERN_Learner_Mission_Packet_UFED_Only_1791498910901.pdf": "Learner_Mission_Packet_UFED_Only.pdf",
            "Operation_SILENT_LANTERN_Microsoft_Forms_Blueprint_UFED_Only_1791498910902.md": "Microsoft_Forms_Blueprint_UFED_Only.md",
            "Operation_SILENT_LANTERN_Facilitator_Guide_UFED_Only_(2)_1791498910903.pdf": "Facilitator_Guide_UFED_Only.pdf",
        }
        (stage / "resources").mkdir()
        for source, target in resources.items():
            shutil.copyfile(ROOT / "attached_assets" / source, stage / "resources" / target)

        # Only the exported temporary workspace is installed or regenerated.
        # Preserve release-age protections and produce a standalone lockfile.
        run(stage, "pnpm", "install", "--lockfile-only")
        run(stage, "pnpm", "install", "--frozen-lockfile")
        run(stage, "pnpm", "run", "codegen")
        run(stage, "pnpm", "run", "build")
        verify_server(stage)

        paths = []
        for current, directories, files in os.walk(stage):
            directories[:] = [name for name in directories if name not in IGNORED]
            for name in files:
                if name in ignored(current, [name]):
                    continue
                paths.append(Path(current) / name)

        for path in paths:
            if path.suffix in {".ts", ".tsx", ".json", ".yaml"}:
                text = path.read_text()
                if "IRON MERIDIAN" in text or "/ctf/activity" in text:
                    raise RuntimeError(f"Unexpected original-project content: {path.relative_to(stage)}")
        if any("ctf.ts" == path.name for path in paths if "schema" in path.parts):
            raise RuntimeError("Original database schema was included.")

        destination.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(paths):
                archive.write(path, path.relative_to(stage))
        with zipfile.ZipFile(destination) as archive:
            assert archive.testzip() is None
            assert all("node_modules" not in name for name in archive.namelist())
        print(f"Verified standalone project: {destination.relative_to(ROOT)}")
        print(f"{len(paths)} source/resource files; {destination.stat().st_size:,} bytes.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="exports/silent-lantern-standalone.zip")
    options = parser.parse_args()
    export(ROOT / options.output)
