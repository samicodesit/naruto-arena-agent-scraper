import path from "node:path";
import { writeJson, ensureDir } from "./utils/fs.js";
import { BASE_URL } from "./config.js";
import { goto, openPersistentContext, requireLoggedIn } from "./browser.js";
import { sha256 } from "./utils/text.js";

const outDir = path.resolve(process.cwd(), "data", "traffic", new Date().toISOString().replace(/[:.]/g, "-"));
await ensureDir(outDir);

const context = await openPersistentContext();
const page = context.pages()[0] ?? await context.newPage();

let counter = 0;

page.on("response", async (response) => {
  try {
    const url = response.url();

    if (!url.includes("/api/handleingame")) return;

    const request = response.request();
    const postData = request.postData();

    let requestPayload: unknown = null;
    try {
      requestPayload = postData ? JSON.parse(postData) : null;
    } catch {
      requestPayload = postData;
    }

    const responseText = await response.text().catch((err) => {
      return `__FAILED_TO_READ_RESPONSE_TEXT__ ${String(err)}`;
    });

    let responseBody: unknown = responseText;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      // keep raw text
    }

    const action =
      typeof requestPayload === "object" &&
      requestPayload !== null &&
      "action" in requestPayload
        ? String((requestPayload as any).action)
        : "unknown";

    const record = {
      index: ++counter,
      capturedAt: new Date().toISOString(),
      pageUrl: page.url(),
      request: {
        method: request.method(),
        url,
        action,
        payload: requestPayload
      },
      response: {
        status: response.status(),
        ok: response.ok(),
        body: responseBody
      },
      hash: sha256(JSON.stringify({ requestPayload, responseBody }))
    };

    const filename = `${String(counter).padStart(4, "0")}_${safeName(action)}.json`;
    const filePath = path.join(outDir, filename);

    await writeJson(filePath, record);

    console.log(`[${counter}] ${action} -> ${response.status()} saved ${filename}`);
  } catch (err) {
    console.error("Recorder error:", err);
  }
});

await requireLoggedIn(page);

console.log("Opening /ingame...");
await goto(page, `${BASE_URL}/ingame`);

console.log("");
console.log("Recorder running.");
console.log("Now manually use the game in this browser.");
console.log(`Traffic will be saved to: ${outDir}`);
console.log("Press Ctrl+C in terminal when done.");
console.log("");

process.on("SIGINT", async () => {
  console.log("\nStopping recorder...");
  await context.close();
  process.exit(0);
});

// Keep process alive.
while (true) {
  await page.waitForTimeout(1000);
}

function safeName(input: string): string {
  return input.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80) || "unknown";
}
