import fs from "node:fs/promises";
import path from "node:path";
import { CRAWL, PATHS } from "./config.js";
import { goto, openPersistentContext, requireLoggedIn } from "./browser.js";
import type { CharacterLink, CharacterRaw } from "./types.js";
import { ensureDir, pathExists, readJson, writeJson } from "./utils/fs.js";
import { cleanText, sha256 } from "./utils/text.js";
import { extractImages, extractLinks, extractSkillCandidates, extractVisibleText } from "./extract-page.js";

const links = await readJson<CharacterLink[]>(PATHS.characterLinks);
if (!links || links.length === 0) {
  throw new Error("No character links found. Run `npm run crawl:links` first.");
}

await ensureDir(PATHS.characterRawDir);

const context = await openPersistentContext();
const page = context.pages()[0] ?? await context.newPage();

await requireLoggedIn(page);

const targetLinks = CRAWL.maxCharacters > 0 ? links.slice(0, CRAWL.maxCharacters) : links;

let changed = 0;
let unchanged = 0;
let failed = 0;

for (let i = 0; i < targetLinks.length; i++) {
  const link = targetLinks[i]!;
  const outPath = path.join(PATHS.characterRawDir, `${safeFileName(link.slug)}.json`);
  const htmlPath = path.join(PATHS.characterRawDir, `${safeFileName(link.slug)}.html`);
  const screenshotPath = path.join(PATHS.characterRawDir, `${safeFileName(link.slug)}.png`);

  try {
    console.log(`[${i + 1}/${targetLinks.length}] ${link.name} — ${link.url}`);
    await goto(page, link.url);

    const visibleText = await extractVisibleText(page);
    const normalizedForHash = cleanText(visibleText);
    const contentHash = sha256(normalizedForHash);

    const previous = await readJson<CharacterRaw>(outPath);
    const previousHash = previous?.contentHash;
    const changedSincePrevious = previousHash ? previousHash !== contentHash : true;

    if (changedSincePrevious) changed++;
    else unchanged++;

    const title = await page.title();
    const linksOnPage = await extractLinks(page);
    const images = await extractImages(page);
    const skillCandidates = await extractSkillCandidates(page);

    const raw: CharacterRaw = {
      name: link.name,
      slug: link.slug,
      url: page.url(),
      title,
      fetchedAt: new Date().toISOString(),
      contentHash,
      changedSincePrevious,
      previousHash,
      visibleText,
      links: linksOnPage,
      images,
      skillCandidates
    };

    await writeJson(outPath, raw);

    // Save HTML separately for parser refinement, but ignore it in git.
    await fs.writeFile(htmlPath, await page.content(), "utf8");

    if (CRAWL.screenshots) {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }

    await page.waitForTimeout(CRAWL.pageDelayMs);
  } catch (err) {
    failed++;
    console.error(`Failed: ${link.url}`);
    console.error(err);
  }
}

await context.close();

console.log(`Done. Changed/new: ${changed}. Unchanged: ${unchanged}. Failed: ${failed}.`);

function safeFileName(input: string) {
  return input.replace(/[^a-z0-9()._-]+/gi, "_").slice(0, 120);
}
