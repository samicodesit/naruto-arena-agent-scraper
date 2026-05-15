import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, writeJson, writeText } from "./utils/fs.js";
import { sha256 } from "./utils/text.js";

type TrafficRecord = {
  index: number;
  capturedAt: string;
  pageUrl: string;
  request: {
    method: string;
    url: string;
    action: string;
    payload: any;
  };
  response: {
    status: number;
    ok: boolean;
    body: any;
  };
  hash: string;
};

type ActionSummary = {
  action: string;
  count: number;
  firstIndex: number;
  lastIndex: number;
  statuses: Record<string, number>;
  requestPayloadVariants: number;
  responseBodyVariants: number;
  requestPayloadSchema: any;
  responseBodySchema: any;
  sampleFile: string;
};

const trafficRoot = path.resolve(process.cwd(), "data", "traffic");
const protocolDir = path.resolve(process.cwd(), "data", "protocol");
const samplesDir = path.join(protocolDir, "samples");
const docsDir = path.resolve(process.cwd(), "docs");

await ensureDir(protocolDir);
await ensureDir(samplesDir);
await ensureDir(docsDir);

const sessionDir = await resolveSessionDir();
const records = await loadRecords(sessionDir);

if (!records.length) {
  throw new Error(`No traffic records found in ${sessionDir}`);
}

const summaries = await summarizeActions(records);
const sequence = compressSequence(records.map((r) => r.request.action));

const output = {
  generatedAt: new Date().toISOString(),
  sessionDir,
  totalRecords: records.length,
  startedAt: records[0]?.capturedAt,
  endedAt: records[records.length - 1]?.capturedAt,
  actionSequenceCompressed: sequence,
  actions: summaries
};

await writeJson(path.join(protocolDir, "actions.summary.json"), output);
await writeText(path.join(docsDir, "naruto_arena_protocol.md"), buildMarkdown(output, records));

console.log(`Analyzed ${records.length} records from ${sessionDir}`);
console.log(`Wrote data/protocol/actions.summary.json`);
console.log(`Wrote docs/naruto_arena_protocol.md`);

async function resolveSessionDir(): Promise<string> {
  const cliArg = process.argv[2];
  const envArg = process.env.TRAFFIC_SESSION;

  if (cliArg) return path.resolve(process.cwd(), cliArg);
  if (envArg) return path.resolve(process.cwd(), envArg);

  const entries = await fs.readdir(trafficRoot, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(trafficRoot, e.name))
    .sort();

  const latest = dirs.at(-1);

  if (!latest) {
    throw new Error(`No traffic session folders found in ${trafficRoot}`);
  }

  return latest;
}

async function loadRecords(dir: string): Promise<TrafficRecord[]> {
  const files = await fs.readdir(dir);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  const records: TrafficRecord[] = [];

  for (const file of jsonFiles) {
    const fullPath = path.join(dir, file);
    const raw = await fs.readFile(fullPath, "utf8");

    try {
      const parsed = JSON.parse(raw) as TrafficRecord;
      records.push(parsed);
    } catch (err) {
      console.warn(`Skipping invalid JSON: ${fullPath}`);
    }
  }

  records.sort((a, b) => {
    const ai = Number.isFinite(a.index) ? a.index : 999999;
    const bi = Number.isFinite(b.index) ? b.index : 999999;
    return ai - bi;
  });

  return records;
}

async function summarizeActions(records: TrafficRecord[]): Promise<ActionSummary[]> {
  const byAction = new Map<string, TrafficRecord[]>();

  for (const record of records) {
    const action = record.request?.action || "unknown";
    const arr = byAction.get(action) || [];
    arr.push(record);
    byAction.set(action, arr);
  }

  const summaries: ActionSummary[] = [];

  for (const [action, items] of Array.from(byAction.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    const first = items[0]!;
    const last = items[items.length - 1]!;

    const statuses: Record<string, number> = {};
    const payloadVariantHashes = new Set<string>();
    const responseVariantHashes = new Set<string>();

    for (const item of items) {
      const status = String(item.response?.status ?? "unknown");
      statuses[status] = (statuses[status] || 0) + 1;

      payloadVariantHashes.add(sha256(JSON.stringify(item.request?.payload ?? null)));
      responseVariantHashes.add(sha256(JSON.stringify(slimResponseForVariant(item.response?.body))));
    }

    const samplePath = path.join(samplesDir, `${safeFileName(action)}.sample.json`);
    await writeJson(samplePath, first);

    summaries.push({
      action,
      count: items.length,
      firstIndex: first.index,
      lastIndex: last.index,
      statuses,
      requestPayloadVariants: payloadVariantHashes.size,
      responseBodyVariants: responseVariantHashes.size,
      requestPayloadSchema: inferSchema(first.request?.payload),
      responseBodySchema: inferSchema(first.response?.body),
      sampleFile: path.relative(process.cwd(), samplePath)
    });
  }

  return summaries;
}

function slimResponseForVariant(value: any): any {
  if (!value || typeof value !== "object") return value;

  // Avoid treating huge character arrays as different only because text changed/order changed.
  if (value.action === "getState" && value.content?.characters) {
    return {
      action: value.action,
      contentKeys: Object.keys(value.content),
      characterCount: value.content.characters.length,
      username: value.content.username
    };
  }

  return value;
}

function inferSchema(value: any, depth = 0): any {
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  const t = typeof value;

  if (t === "string") return "string";
  if (t === "number") return "number";
  if (t === "boolean") return "boolean";

  if (Array.isArray(value)) {
    const firstNonNull = value.find((x) => x !== null && x !== undefined);
    return {
      type: "array",
      length: value.length,
      item: depth >= 5 ? "max_depth" : inferSchema(firstNonNull, depth + 1)
    };
  }

  if (t === "object") {
    if (depth >= 5) return "object_max_depth";

    const keys = Object.keys(value);
    const limitedKeys = keys.slice(0, 80);

    const shape: Record<string, any> = {};

    for (const key of limitedKeys) {
      shape[key] = inferSchema(value[key], depth + 1);
    }

    if (keys.length > limitedKeys.length) {
      shape.__truncatedKeys = `${keys.length - limitedKeys.length} more keys`;
    }

    return {
      type: "object",
      keys: shape
    };
  }

  return t;
}

function compressSequence(actions: string[]): Array<{ action: string; count: number }> {
  const result: Array<{ action: string; count: number }> = [];

  for (const action of actions) {
    const last = result.at(-1);

    if (last && last.action === action) {
      last.count++;
    } else {
      result.push({ action, count: 1 });
    }
  }

  return result;
}

function buildMarkdown(output: any, records: TrafficRecord[]): string {
  const lines: string[] = [];

  lines.push("# Naruto-Arena Classic — In-Game Protocol");
  lines.push("");
  lines.push("> Generated from locally recorded `/api/handleingame` traffic while manually playing.");
  lines.push("");
  lines.push(`- Generated at: ${output.generatedAt}`);
  lines.push(`- Session dir: \`${path.relative(process.cwd(), output.sessionDir)}\``);
  lines.push(`- Total records: ${output.totalRecords}`);
  lines.push(`- Started at: ${output.startedAt}`);
  lines.push(`- Ended at: ${output.endedAt}`);
  lines.push("");

  lines.push("## Action Counts");
  lines.push("");
  lines.push("| Action | Count | First | Last | Statuses | Payload variants | Response variants |");
  lines.push("|---|---:|---:|---:|---|---:|---:|");

  for (const action of output.actions as ActionSummary[]) {
    lines.push(
      `| \`${action.action}\` | ${action.count} | ${action.firstIndex} | ${action.lastIndex} | ${formatStatuses(action.statuses)} | ${action.requestPayloadVariants} | ${action.responseBodyVariants} |`
    );
  }

  lines.push("");
  lines.push("## Compressed Action Sequence");
  lines.push("");
  lines.push("```txt");

  for (const item of output.actionSequenceCompressed) {
    lines.push(`${item.action}${item.count > 1 ? ` × ${item.count}` : ""}`);
  }

  lines.push("```");
  lines.push("");

  lines.push("## Chronological Records");
  lines.push("");
  lines.push("| # | Time | Action | Status | Page |");
  lines.push("|---:|---|---|---:|---|");

  for (const r of records) {
    lines.push(
      `| ${r.index} | ${r.capturedAt} | \`${r.request.action}\` | ${r.response.status} | ${escapeMd(r.pageUrl)} |`
    );
  }

  lines.push("");
  lines.push("## Action Schemas");
  lines.push("");

  for (const action of output.actions as ActionSummary[]) {
    lines.push(`## \`${action.action}\``);
    lines.push("");
    lines.push(`- Count: ${action.count}`);
    lines.push(`- First record: ${action.firstIndex}`);
    lines.push(`- Last record: ${action.lastIndex}`);
    lines.push(`- Statuses: ${formatStatuses(action.statuses)}`);
    lines.push(`- Request payload variants: ${action.requestPayloadVariants}`);
    lines.push(`- Response body variants: ${action.responseBodyVariants}`);
    lines.push(`- Sample file: \`${action.sampleFile}\``);
    lines.push("");

    lines.push("### Request Payload Schema");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(action.requestPayloadSchema, null, 2));
    lines.push("```");
    lines.push("");

    lines.push("### Response Body Schema");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(action.responseBodySchema, null, 2));
    lines.push("```");
    lines.push("");
  }

  lines.push("## Current Interpretation");
  lines.push("");
  lines.push("- `connectSelection` appears to initialize or refresh the selection/character database state.");
  lines.push("- `searchGame` appears to start matchmaking.");
  lines.push("- `checkIfInBattle` appears to check whether matchmaking has produced a battle.");
  lines.push("- `connectBattle` appears to initialize battle state after a match is found.");
  lines.push("- `passTurn` appears during opponent/player turn progression.");
  lines.push("- `requestEndTurn` appears repeatedly and likely handles both selected actions and turn-state updates. Inspect payload variants to distinguish submit vs poll/update.");
  lines.push("");
  lines.push("## Next Analysis Needed");
  lines.push("");
  lines.push("1. Inspect `requestEndTurn` variants.");
  lines.push("2. Identify exact battle-state fields for HP, chakra, cooldowns, active effects, selected skills, and turn owner.");
  lines.push("3. Identify exact payload shape for skill selection, target selection, chakra spending, and final turn confirmation.");
  lines.push("4. Record one more match where you deliberately use: no-skill pass, one skill, multiple skills, random chakra spending, and surrender if possible.");

  return lines.join("\n");
}

function formatStatuses(statuses: Record<string, number>): string {
  return Object.entries(statuses)
    .map(([status, count]) => `${status}:${count}`)
    .join(", ");
}

function safeFileName(input: string): string {
  return input.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80) || "unknown";
}

function escapeMd(input: string): string {
  return String(input || "").replace(/\|/g, "\\|");
}
