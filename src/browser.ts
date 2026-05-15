import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { BASE_URL, CRAWL, PATHS } from "./config.js";

export async function openPersistentContext(): Promise<BrowserContext> {
  return chromium.launchPersistentContext(PATHS.userDataDir, {
    headless: CRAWL.headless,
    viewport: { width: 1366, height: 900 },
    locale: "en-US"
  });
}

export async function goto(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: CRAWL.navTimeoutMs });
  // Old-style sites may never fully settle. This is intentionally modest.
  await page.waitForTimeout(500);
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  await goto(page, BASE_URL);
  const body = await page.locator("body").innerText({ timeout: 10_000 }).catch(() => "");
  return /Welcome,\s*\S+/i.test(body) || /Logout/i.test(body);
}

export async function requireLoggedIn(page: Page) {
  const ok = await isLoggedIn(page);
  if (!ok) {
    throw new Error(
      "Not logged in. Run `npm run auth`, log in manually in the opened browser, then press Enter in the terminal."
    );
  }
}
