import path from "node:path";
import { BASE_URL } from "./config.js";
import { goto, openPersistentContext, requireLoggedIn } from "./browser.js";
import { ensureDir, writeJson } from "./utils/fs.js";

const OUT_PATH = path.resolve(process.cwd(), "data", "ingame", "getState.json");

const context = await openPersistentContext();
const page = context.pages()[0] ?? (await context.newPage());

await requireLoggedIn(page);

console.log("Opening /ingame...");
await goto(page, `${BASE_URL}/ingame`);

console.log("Calling /api/handleingame with browser session cookies...");

const result = await page.evaluate(`
  (async () => {
    const res = await fetch("/api/handleingame", {
      method: "POST",
      headers: {
        "accept": "application/json, text/plain, */*",
        "content-type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        action: "connectSelection",
        languagePreference: "English"
      })
    });

    const text = await res.text();

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("Non-JSON response from /api/handleingame: " + text.slice(0, 500));
    }

    return {
      status: res.status,
      ok: res.ok,
      json
    };
  })()
`);

const response = result as {
  status: number;
  ok: boolean;
  json: any;
};

if (!response.ok) {
  console.error(JSON.stringify(response, null, 2));
  throw new Error(`handleingame request failed with status ${response.status}`);
}

const data = response.json;

if (data?.action !== "getState") {
  console.warn("Unexpected response action:", data?.action);
}

if (!data?.content?.characters?.length) {
  console.error(JSON.stringify(data, null, 2).slice(0, 2000));
  throw new Error("No characters found in getState response");
}

await ensureDir(path.dirname(OUT_PATH));
await writeJson(OUT_PATH, data);

console.log(`Saved fresh getState to ${OUT_PATH}`);
console.log(`Characters: ${data.content.characters.length}`);
console.log(`Username: ${data.content.username ?? "unknown"}`);

await context.close();
