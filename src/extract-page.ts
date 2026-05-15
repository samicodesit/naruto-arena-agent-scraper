import type { Page } from "@playwright/test";
import type { ImageInfo, LinkInfo, SkillCandidate } from "./types.js";
import { cleanText } from "./utils/text.js";

export async function extractVisibleText(page: Page): Promise<string> {
  return cleanText(await page.locator("body").innerText({ timeout: 15_000 }));
}

export async function extractLinks(page: Page): Promise<LinkInfo[]> {
  return await page.evaluate(`
    (() => {
      const clean = (s) => String(s || "").replace(/\\s+/g, " ").trim();

      return Array.from(document.querySelectorAll("a"))
        .map((a) => ({
          text: clean(a.innerText),
          href: a.href
        }))
        .filter((a) => a.href);
    })()
  `);
}

export async function extractImages(page: Page): Promise<ImageInfo[]> {
  return await page.evaluate(`
    (() => {
      const clean = (s) => String(s || "").replace(/\\s+/g, " ").trim();

      return Array.from(document.querySelectorAll("img"))
        .map((img) => ({
          alt: clean(img.alt),
          src: img.src
        }))
        .filter((img) => img.src);
    })()
  `);
}

export async function extractSkillCandidates(
  page: Page,
): Promise<SkillCandidate[]> {
  const raw = await page.evaluate(`
    (() => {
      const clean = (s) => String(s || "").replace(/\\s+/g, " ").trim();

      const selectors = [
        "[class*='skill' i]",
        "[id*='skill' i]",
        ".pagedescription",
        ".chardescr",
        ".content",
        "#content",
        "table"
      ];

      const seen = new Set();
      const candidates = [];

      for (const selector of selectors) {
        for (const el of Array.from(document.querySelectorAll(selector))) {
          if (seen.has(el)) continue;
          seen.add(el);

          const text = clean(el.innerText || "");

          if (
            text.length >= 30 &&
            /cooldown|chakra|class|classes|damage|stun|invulnerable|affliction|physical|mental|ranged|melee/i.test(text)
          ) {
            candidates.push(text);
          }
        }
      }

      return candidates.slice(0, 50);
    })()
  `);

  return (raw as string[]).map((text): SkillCandidate => {
    const cooldown = text.match(/cooldown\\s*:?\\s*([0-9]+)/i)?.[1];
    const chakraMatch = text.match(
      /chakra\\s*(?:cost)?\\s*:?\\s*([^.;\\n]{1,80})/i,
    )?.[1];

    const classesMatch = text.match(
      /classes?\\s*:?\\s*([^.;\\n]{1,160})/i,
    )?.[1];
    const classes = classesMatch
      ? classesMatch
          .split(/[,/]/)
          .map((x) => x.trim())
          .filter(Boolean)
      : undefined;

    const name =
      text
        .split(/chakra|cooldown|classes?|does|will/i)[0]
        ?.trim()
        .slice(0, 80) || "needs_verification";

    return {
      name,
      chakraCost: chakraMatch?.trim(),
      cooldown,
      classes,
      description: text.slice(0, 700),
      confidence: cooldown || chakraMatch || classes ? "medium" : "low",
      rawText: text,
    };
  });
}
