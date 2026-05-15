import { BASE_URL, PATHS } from "./config.js";
import { goto, openPersistentContext, requireLoggedIn } from "./browser.js";
import type { PatchPage } from "./types.js";
import { extractLinks, extractVisibleText } from "./extract-page.js";
import { cleanText, sha256 } from "./utils/text.js";
import { writeJson } from "./utils/fs.js";

const context = await openPersistentContext();
const page = context.pages()[0] ?? await context.newPage();

await requireLoggedIn(page);

const seedUrls = [
  `${BASE_URL}/`,
  `${BASE_URL}/news-archive`
];

const newsUrls = new Set<string>();

for (const url of seedUrls) {
  console.log(`Scanning ${url}`);
  await goto(page, url);
  const links = await extractLinks(page);
  for (const link of links) {
    if (/\/news\/|\/balance-changes\//i.test(new URL(link.href).pathname)) {
      newsUrls.add(link.href);
    }
  }
}

// Keep it bounded: most recent/archive linked pages.
const urls = Array.from(newsUrls)
  .filter((u) => /balance-update|major-update|\/news\//i.test(u))
  .slice(0, 80);

const patches: PatchPage[] = [];

for (let i = 0; i < urls.length; i++) {
  const url = urls[i]!;
  console.log(`[${i + 1}/${urls.length}] ${url}`);
  await goto(page, url);

  const visibleText = await extractVisibleText(page);
  const links = await extractLinks(page);
  const characterLinks = links.filter((l) => {
    try {
      return new URL(l.href).pathname.startsWith("/chars/");
    } catch {
      return false;
    }
  });

  patches.push({
    title: await page.title(),
    url: page.url(),
    fetchedAt: new Date().toISOString(),
    contentHash: sha256(cleanText(visibleText)),
    visibleText,
    characterLinks
  });

  await page.waitForTimeout(500);
}

await writeJson(PATHS.patchesJson, patches);
console.log(`Saved ${patches.length} patch/news pages to ${PATHS.patchesJson}`);

await context.close();
