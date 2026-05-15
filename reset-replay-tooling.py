
from pathlib import Path
import os
import subprocess
import textwrap

def write(path: str, content: str) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(textwrap.dedent(content).lstrip(), encoding="utf-8")
    os.chmod(p, 0o755)

write("scripts/export-replay-fixture.mjs", r"""
    #!/usr/bin/env node
    import fs from "node:fs";
    import path from "node:path";

    function fail(message) {
      console.error(`ERROR: ${message}`);
      process.exit(1);
    }

    function readJson(filePath) {
      if (!fs.existsSync(filePath)) fail(`File not found: ${filePath}`);
      try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
      } catch (error) {
        fail(`Could not parse JSON: ${filePath}\n${error.message}`);
      }
    }

    function pick(object, keys) {
      let current = object;
      for (const key of keys) {
        if (current == null || typeof current !== "object" || !(key in current)) return undefined;
        current = current[key];
      }
      return current;
    }

    const [sessionDir, preFile, postFile] = process.argv.slice(2);

    if (!sessionDir || !preFile || !postFile) {
      console.error([
        "Usage:",
        "  node scripts/export-replay-fixture.mjs <session-dir> <pre-json> <post-json>",
        "",
        "Example:",
        "  node scripts/export-replay-fixture.mjs data/traffic/2026-05-14T21-34-39-137Z 0016_requestEndTurn.json 0017_passTurn.json",
      ].join("\n"));
      process.exit(1);
    }

    const prePath = path.join(sessionDir, preFile);
    const postPath = path.join(sessionDir, postFile);

    const preRecord = readJson(prePath);
    const postRecord = readJson(postPath);

    const preContent = pick(preRecord, ["response", "body", "content"]);
    const postContent = pick(postRecord, ["response", "body", "content"]);

    if (!preContent) fail(`Missing response.body.content in ${prePath}`);
    if (!postContent) fail(`Missing response.body.content in ${postPath}`);

    const queue =
      pick(preRecord, ["request", "payload", "queue"]) ??
      pick(postRecord, ["request", "payload", "queue"]) ??
      [];

    if (!Array.isArray(queue)) fail("Expected request.payload.queue to be an array when present.");

    const sessionName = path.basename(path.resolve(sessionDir));
    const outDir = path.join("data", "fixtures", "traffic", sessionName);
    fs.mkdirSync(outDir, { recursive: true });

    const sanitizedPre = {
      response: {
        body: {
          content: preContent,
        },
      },
    };

    const sanitizedPost = {
      request: {
        payload: {
          queue,
        },
      },
      response: {
        body: {
          content: postContent,
        },
      },
    };

    const outPrePath = path.join(outDir, preFile);
    const outPostPath = path.join(outDir, postFile);

    fs.writeFileSync(outPrePath, `${JSON.stringify(sanitizedPre, null, 2)}\n`);
    fs.writeFileSync(outPostPath, `${JSON.stringify(sanitizedPost, null, 2)}\n`);

    console.log(`exported ${sessionName}: ${preFile} -> ${postFile} queue=${queue.length}`);
""")

write("scripts/export-replay-fixtures-from-traffic.mjs", r"""
    #!/usr/bin/env node
    import fs from "node:fs";
    import path from "node:path";
    import { spawnSync } from "node:child_process";

    const root = process.argv[2] ?? "data/traffic";

    if (!fs.existsSync(root)) {
      console.error(`ERROR: traffic root not found: ${root}`);
      process.exit(1);
    }

    let exported = 0;
    let skipped = 0;
    let failed = 0;

    for (const session of fs.readdirSync(root).sort()) {
      const dir = path.join(root, session);
      if (!fs.statSync(dir).isDirectory()) continue;

      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
      const fileSet = new Set(files);

      for (const pre of files) {
        const match = pre.match(/^(\d+)_requestEndTurn\.json$/);
        if (!match) continue;

        const index = Number(match[1]);
        const width = match[1].length;
        const post = `${String(index + 1).padStart(width, "0")}_passTurn.json`;

        if (!fileSet.has(post)) {
          skipped++;
          continue;
        }

        const result = spawnSync(
          process.execPath,
          ["scripts/export-replay-fixture.mjs", dir, pre, post],
          { encoding: "utf8" }
        );

        if (result.status === 0) {
          process.stdout.write(result.stdout);
          exported++;
        } else {
          failed++;
          console.error(`FAILED ${dir}: ${pre} -> ${post}`);
          if (result.stdout) console.error(result.stdout.trim());
          if (result.stderr) console.error(result.stderr.trim());
        }
      }
    }

    console.log(`summary: exported=${exported} skipped=${skipped} failed=${failed}`);

    if (exported === 0 || failed > 0) process.exit(1);
""")

write("scripts/ai-handoff.mjs", r"""
    #!/usr/bin/env node
    import { execSync } from "node:child_process";
    import fs from "node:fs";

    function sh(command, options = {}) {
      const output = execSync(command, {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: options.stdio ?? "pipe",
        env: process.env,
      });
      return output == null ? "" : output.toString().trim();
    }

    function printBlock(label, value) {
      console.log(`\n${label}:`);
      console.log(value || "(empty)");
    }

    function hasFlag(flag) {
      return process.argv.includes(flag);
    }

    function shellQuote(value) {
      return `'${String(value).replaceAll("'", `'\\''`)}'`;
    }

    const validateActive = hasFlag("--validate-active");
    const positionalMessage = process.argv
      .slice(2)
      .filter((arg) => !arg.startsWith("--"))
      .join(" ")
      .trim();

    const commitMessage = positionalMessage || "debug replay validation";
    const repoRoot = sh("git rev-parse --show-toplevel");
    process.chdir(repoRoot);

    const initialStatus = sh("git status --short");

    const suspiciousPatterns = [
      /\.env(?:\.|$)/,
      /\.tar\.gz$/,
      /\.patch$/,
      /:Zone\.Identifier$/,
      /node_modules\//,
    ];

    const suspicious = initialStatus
      .split("\n")
      .filter(Boolean)
      .filter((line) => {
        const pathPart = line.slice(3).trim();
        return suspiciousPatterns.some((pattern) => pattern.test(pathPart));
      });

    if (suspicious.length) {
      console.error("\nRefusing to auto-commit suspicious files:");
      for (const line of suspicious) console.error(line);
      process.exit(1);
    }

    if (initialStatus) {
      console.log("Local changes detected. Committing and pushing...");
      sh("git add -A", { stdio: "inherit" });
      sh(`git commit -m ${shellQuote(commitMessage)}`, { stdio: "inherit" });
      const branch = sh("git branch --show-current");
      try {
        sh("git push", { stdio: "inherit" });
      } catch {
        sh(`git push -u origin ${shellQuote(branch)}`, { stdio: "inherit" });
      }
    } else {
      console.log("Working tree is clean. No commit needed.");
    }

    const finalStatus = sh("git status --short");
    const branch = sh("git branch --show-current");
    const commit = sh("git rev-parse HEAD");
    const repo = sh("git remote get-url origin");

    let validationOutput = "";
    let validationCommand = "";

    if (validateActive) {
      const fixtureDir = "data/fixtures/traffic/2026-05-14T21-34-39-137Z";
      const rawDir = "data/traffic/2026-05-14T21-34-39-137Z";
      const sessionDir = fs.existsSync(fixtureDir) ? fixtureDir : rawDir;

      validationCommand = [
        "OBSERVED_EFFECT_RULES_FILE=data/clone/observed-effect-rules-20260514-213439-rich.json",
        `SESSION_DIR=${sessionDir}`,
        "PRE=0016_requestEndTurn.json",
        "POST=0017_passTurn.json",
        "npm run -s clone:state-diff",
      ].join(" \\\n");

      console.log("\nRunning active replay validation...");
      try {
        validationOutput = sh(validationCommand);
      } catch (error) {
        validationOutput =
          (error.stdout?.toString() ?? "") +
          (error.stderr?.toString() ?? "") +
          `\nCommand failed with exit code ${error.status ?? "unknown"}`;
      }
    }

    console.log("\n=== PASTE THIS TO CHATGPT ===");
    printBlock("Status", finalStatus);
    printBlock("Branch", branch);
    printBlock("Commit", commit);
    printBlock("Repo", repo);
    if (validateActive) {
      printBlock("Command", validationCommand);
      printBlock("Output", validationOutput);
    }
    console.log("\n=== END ===");
""")

for script in [
    "scripts/export-replay-fixture.mjs",
    "scripts/export-replay-fixtures-from-traffic.mjs",
    "scripts/ai-handoff.mjs",
]:
    subprocess.run(["node", "--check", script], check=True)

print("Replay tooling reset complete.")
print("Next commands:")
print("  node scripts/export-replay-fixtures-from-traffic.mjs")
print("  node scripts/ai-handoff.mjs \"reset replay tooling and export fixtures\" --validate-active")
