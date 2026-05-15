#!/usr/bin/env node
import { execSync } from "node:child_process";

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

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

const help = hasFlag("--help") || hasFlag("-h");
if (help) {
  console.log(`
Usage:
  node scripts/ai-handoff.mjs [commit message] [--validate-active]

Examples:
  node scripts/ai-handoff.mjs "debug replay validation" --validate-active
  node scripts/ai-handoff.mjs --validate-active
  node scripts/ai-handoff.mjs

What it does:
  1. Refuses to continue if obvious junk/secrets are staged or unstaged.
  2. If files changed: git add -A, commit, push.
  3. If clean: skips commit/push.
  4. Prints the exact repo/branch/commit/status block to paste into ChatGPT.
  5. Optionally runs the active 0016 -> 0017 replay validation.
`.trim());
  process.exit(0);
}

const validateActive = hasFlag("--validate-active");
const explicitMessage = getArgValue("--message");
const positionalMessage = process.argv
  .slice(2)
  .filter((arg) => !arg.startsWith("--"))
  .join(" ")
  .trim();

const commitMessage =
  explicitMessage ||
  positionalMessage ||
  "debug replay validation";

const repoRoot = sh("git rev-parse --show-toplevel");
process.chdir(repoRoot);

const initialStatus = sh("git status --short");
const suspiciousPatterns = [
  /\.env(?:\.|$)/,
  /\.tar\.gz$/,
  /\.patch$/,
  /:Zone\.Identifier$/,
  /(^|\/).*\.bak.*/,
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
  console.error("\nFix .gitignore/remove those files, then run this again.");
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
  validationCommand = [
    "OBSERVED_EFFECT_RULES_FILE=data/clone/observed-effect-rules-20260514-213439-rich.json",
    "SESSION_DIR=data/traffic/2026-05-14T21-34-39-137Z",
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
