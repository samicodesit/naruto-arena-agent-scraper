import fs from "node:fs/promises";
import { PATHS } from "./config.js";
import { openPersistentContext, requireLoggedIn } from "./browser.js";
import { readJson } from "./utils/fs.js";
import type { CharacterLink } from "./types.js";

console.log("Doctor check");

const context = await openPersistentContext();
const page = context.pages()[0] ?? await context.newPage();

try {
  await requireLoggedIn(page);
  console.log("✓ Logged-in browser profile works");
} catch (err) {
  console.error("✗ Login check failed");
  console.error(err);
}

const links = await readJson<CharacterLink[]>(PATHS.characterLinks);
console.log(links?.length ? `✓ Character links file exists: ${links.length} links` : "✗ Character links file missing/empty");

const rawFiles = await fs.readdir(PATHS.characterRawDir).catch(() => []);
console.log(rawFiles.length ? `✓ Raw character folder has ${rawFiles.filter((f) => f.endsWith(".json")).length} JSON files` : "✗ No raw character JSON files yet");

await context.close();
