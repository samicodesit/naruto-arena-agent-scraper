#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.argv[2] ?? "data/fixtures/traffic";
const strict = process.argv.includes("--strict");
const rulesFile =
  process.env.OBSERVED_EFFECT_RULES_FILE ??
  "data/clone/observed-effect-rules-20260514-213439-rich.json";

if (!fs.existsSync(root)) {
  console.error(`ERROR: fixture root not found: ${root}`);
  process.exit(1);
}

function parseMetric(output, name) {
  const match = output.match(new RegExp(`${name}:\\s*(\\d+)`));
  return match ? Number(match[1]) : null;
}

function immediatePassFile(preFile) {
  const match = preFile.match(/^(\d+)_requestEndTurn\.json$/);
  if (!match) return null;

  const next = Number(match[1]) + 1;
  return `${String(next).padStart(match[1].length, "0")}_passTurn.json`;
}

function collectPairs() {
  const pairs = [];

  for (const session of fs.readdirSync(root).sort()) {
    const sessionDir = path.join(root, session);
    if (!fs.statSync(sessionDir).isDirectory()) continue;

    const files = fs.readdirSync(sessionDir).filter((file) => file.endsWith(".json")).sort();
    const fileSet = new Set(files);

    for (const pre of files) {
      const post = immediatePassFile(pre);
      if (!post || !fileSet.has(post)) continue;

      pairs.push({ session, sessionDir, pre, post });
    }
  }

  return pairs;
}

const pairs = collectPairs();

if (!pairs.length) {
  console.error(`ERROR: no immediate requestEndTurn/passTurn fixture pairs found under ${root}`);
  process.exit(1);
}

const results = [];

for (const pair of pairs) {
  const result = spawnSync("npm", ["run", "-s", "clone:state-diff"], {
    encoding: "utf8",
    env: {
      ...process.env,
      OBSERVED_EFFECT_RULES_FILE: rulesFile,
      SESSION_DIR: pair.sessionDir,
      PRE: pair.pre,
      POST: pair.post,
    },
  });

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const totalDiffs = parseMetric(output, "totalDiffs");
  const hpDiffs = parseMetric(output, "hpDiffs");
  const effectDiffs = parseMetric(output, "effectDiffs");
  const skillDiffs = parseMetric(output, "skillDiffs");
  const cooldownDiffs = parseMetric(output, "cooldownDiffs");
  const disabledDiffs = parseMetric(output, "disabledDiffs");
  const chakraDiffs = parseMetric(output, "chakraDiffs");

  const failedToRun = result.status !== 0 || totalDiffs == null;

  results.push({
    ...pair,
    status: failedToRun ? "ERROR" : totalDiffs === 0 ? "PASS" : "FAIL",
    exitCode: result.status,
    totalDiffs,
    hpDiffs,
    effectDiffs,
    skillDiffs,
    cooldownDiffs,
    disabledDiffs,
    chakraDiffs,
    output,
  });
}

console.log("\n=== REPLAY FIXTURE VALIDATION ===");
console.log(`root: ${root}`);
console.log(`rules: ${rulesFile}`);

for (const result of results) {
  const label = `${result.session}/${result.pre} -> ${result.post}`;
  if (result.status === "PASS") {
    console.log(`PASS  ${label}`);
  } else if (result.status === "FAIL") {
    console.log(
      `FAIL  ${label} total=${result.totalDiffs} hp=${result.hpDiffs} effect=${result.effectDiffs} skill=${result.skillDiffs} cd=${result.cooldownDiffs} disabled=${result.disabledDiffs} chakra=${result.chakraDiffs}`
    );
  } else {
    console.log(`ERROR ${label} exit=${result.exitCode}`);
  }
}

const pass = results.filter((result) => result.status === "PASS").length;
const fail = results.filter((result) => result.status === "FAIL").length;
const error = results.filter((result) => result.status === "ERROR").length;
const totalDiffs = results.reduce((sum, result) => sum + (result.totalDiffs ?? 0), 0);

console.log("\nSUMMARY:");
console.log(`fixtures: ${results.length}`);
console.log(`green: ${pass}`);
console.log(`red: ${fail}`);
console.log(`errors: ${error}`);
console.log(`totalDiffs: ${totalDiffs}`);

const worst = results
  .filter((result) => result.status !== "PASS")
  .sort((a, b) => (b.totalDiffs ?? 9999) - (a.totalDiffs ?? 9999))
  .slice(0, 10);

if (worst.length) {
  console.log("\nWORST:");
  for (const result of worst) {
    console.log(
      `- ${result.session}/${result.pre} -> ${result.post}: status=${result.status} total=${result.totalDiffs ?? "?"} hp=${result.hpDiffs ?? "?"} effect=${result.effectDiffs ?? "?"}`
    );
  }
}

console.log("\n=== END REPLAY FIXTURE VALIDATION ===");

if (strict && (fail > 0 || error > 0)) process.exit(1);
