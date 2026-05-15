
import { spawnSync } from "node:child_process";

const cases = [
  ["0021_requestEndTurn.json", "0022_passTurn.json"],
  ["0025_requestEndTurn.json", "0026_passTurn.json"],
  ["0029_requestEndTurn.json", "0030_passTurn.json"],
  ["0040_requestEndTurn.json", "0041_passTurn.json"],
  ["0047_requestEndTurn.json", "0048_passTurn.json"],
  ["0052_requestEndTurn.json", "0053_passTurn.json"],
  ["0056_requestEndTurn.json", "0057_passTurn.json"]
];

let failed = 0;

for (const [pre, post] of cases) {
  console.log(`\n=== REPLAY CASE ${pre} -> ${post} ===`);

  const result = spawnSync(
    "npm",
    ["run", "clone:replay"],
    {
      env: { ...process.env, PRE: pre, POST: post },
      encoding: "utf8"
    }
  );

  const output = `${result.stdout}\n${result.stderr}`;
  console.log(output);

  const ok =
    result.status === 0 &&
    output.includes("executeOk: true") &&
    output.includes("DIFF:\nno HP diffs");

  if (!ok) {
    failed++;
    console.log(`FAILED: ${pre} -> ${post}`);
  } else {
    console.log(`PASSED: ${pre} -> ${post}`);
  }
}

console.log(`\n=== REPLAY SUITE RESULT ===`);
console.log(`passed: ${cases.length - failed}`);
console.log(`failed: ${failed}`);

if (failed > 0) process.exit(1);
