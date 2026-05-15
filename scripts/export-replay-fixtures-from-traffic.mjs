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
