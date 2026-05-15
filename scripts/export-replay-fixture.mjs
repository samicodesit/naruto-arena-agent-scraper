import fs from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`File not found: ${filePath}`);
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Could not parse JSON: ${filePath}\n${error.message}`);
  }
}

function pick(object, keys) {
  let current = object;
  for (const key of keys) {
    if (current == null || typeof current !== "object" || !(key in current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

const [sessionDir, preFile, postFile] = process.argv.slice(2);

if (!sessionDir || !preFile || !postFile) {
  console.error([
    "Usage:",
    "  node scripts/export-replay-fixture.mjs <session-dir> <pre-json> <post-json>",
    "",
    "Example:",
    " node scripts/export-replay-fixture.mjs data/traffic/2026-05-14T21-34-39-137Z 0016_requestEndTurn.json 0017_passTurn.json",
  ].join("\n"));
  process.exit(1);
}

const prePath = path.join(sessionDir, preFile);
const postPath = path.join(sessionDir, postFile);

const preRecord = readJson(prePath);
const postRecord = readJson(postPath);

const preContent = pick(preRecord, ["response", "body", "content"]);
const postContent = pick(postRecord, ["response", "body", "content"]);

if (!preContent) {
  fail(`Missing response.body.content in ${prePath}`);
}

if (!postContent) {
  fail(`Missing response.body.content in ${postPath}`);
}

const queue =
  pick(preRecord, ["request", "payload", "queue"]) ??
  pick(postRecord, ["request", "payload", "queue"]) ??
  [];

if (!Array.isArray(queue)) {
  fail("Expected request.payload.queue to be an array.");
}

const sessionName = path.basename(path.resolve(sessionDir));
const outDir = path.join("data", "fixtures", "traffic", sessionName);
fs.mkdirSync(outDir, { recursive: true });

const sanitizedPre = {
  response: {
    body: {
      content: preContent,
    },
  },
};

const sanitizedPost = {
  request: {
    payload: {
      queue,
    },
  },
  response: {
    body: {
      content: postContent,
    },
  },
};

const outPrePath = path.join(outDir, preFile);
const outPostPath = path.join(outDir, postFile);

fs.writeFileSync(outPrePath, `${JSON.stringify(sanitizedPre, null, 2)}\n`);
fs.writeFileSync(outPostPath, `${JSON.stringify(sanitizedPost, null, 2)}\n`);

console.log("Exported sanitized replay fixture:");
console.log(`  ${outPrePath}`);
console.log(`  ${outPostPath}`);
console.log(`  queueItems: ${queue.length}`);
