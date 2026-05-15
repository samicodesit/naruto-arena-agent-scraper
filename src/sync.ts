import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const steps: Array<[string, string[]]> = [
  ["Fetch fresh /ingame state", ["run", "fetch:ingame"]],
  ["Import /ingame character database", ["run", "import:ingame"]],
  ["Crawl character links", ["run", "crawl:links"]],
  ["Crawl patch/news pages", ["run", "crawl:patches"]],
  ["Build markdown docs", ["run", "build:md"]],
];

for (const [label, args] of steps) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(npm, args, {
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    console.error(`\nFailed step: ${label}`);
    process.exit(result.status || 1);
  }
}

console.log("\nSync complete.");
