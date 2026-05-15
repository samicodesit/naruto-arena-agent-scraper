import { BASE_URL, PATHS } from "./config.js";
import { goto, openPersistentContext, requireLoggedIn } from "./browser.js";
import type { CharacterLink } from "./types.js";
import { slugFromUrl, nameFromSlug, cleanText } from "./utils/text.js";
import { writeJson, writeText } from "./utils/fs.js";

const context = await openPersistentContext();
const page = context.pages()[0] ?? (await context.newPage());

await requireLoggedIn(page);

const indexUrl = `${BASE_URL}/characters-and-skills`;
console.log(`Opening ${indexUrl}`);
await goto(page, indexUrl);

const currentUrl = page.url();
if (!currentUrl.includes("/characters-and-skills")) {
  console.warn(
    `Warning: expected characters-and-skills, but browser is at ${currentUrl}`,
  );
}

const visibleText = cleanText(
  await page.locator("body").innerText({ timeout: 15_000 }),
);
await writeText(PATHS.characterIndexSnapshot, visibleText);

const discovered = await page.evaluate(`
  (() => {
    const clean = (s) => String(s || "").replace(/\\s+/g, " ").trim();

    return Array.from(document.querySelectorAll("a[href*='/chars/']"))
      .map((a) => ({
        text: clean(a.innerText),
        href: a.href
      }))
      .filter((a) => a.href.includes("/chars/"));
  })()
`);

const map = new Map<string, CharacterLink>();

for (const item of discovered as Array<{ text: string; href: string }>) {
  const slug = slugFromUrl(item.href);
  const name = item.text
    ? item.text.replace(/^More about\s+/i, "").trim()
    : nameFromSlug(slug);

  map.set(item.href, {
    name,
    slug,
    url: item.href,
    discoveredAt: new Date().toISOString(),
  });
}

const links = Array.from(map.values()).sort((a, b) =>
  a.name.localeCompare(b.name),
);
await writeJson(PATHS.characterLinks, links);

console.log(`Saved ${links.length} character links to ${PATHS.characterLinks}`);

if (links.length === 0) {
  console.warn(
    "No /chars/ links found. The page may require a different route or content may be hidden.",
  );
}

await context.close();
