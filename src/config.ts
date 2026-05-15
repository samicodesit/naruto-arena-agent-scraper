import path from "node:path";

export const BASE_URL = "https://www.naruto-arena.site";

export const PATHS = {
  userDataDir: path.resolve(process.cwd(), ".auth", "naruto-arena-profile"),
  dataDir: path.resolve(process.cwd(), "data"),
  docsDir: path.resolve(process.cwd(), "docs"),
  characterLinks: path.resolve(process.cwd(), "data", "characters", "character-links.json"),
  characterRawDir: path.resolve(process.cwd(), "data", "characters", "raw"),
  characterIndexSnapshot: path.resolve(process.cwd(), "data", "characters", "characters-and-skills.visible.txt"),
  patchesJson: path.resolve(process.cwd(), "data", "patches", "patches.json")
};

export const CRAWL = {
  navTimeoutMs: 45_000,
  pageDelayMs: 900,
  maxCharacters: Number(process.env.MAX_CHARS || 0), // 0 = no limit
  screenshots: process.env.SCREENSHOTS === "1",
  headless: process.env.HEADLESS === "1"
};
