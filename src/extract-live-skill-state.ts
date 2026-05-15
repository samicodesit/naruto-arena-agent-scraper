import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, writeJson, writeText } from "./utils/fs.js";

const INPUT = path.resolve(process.cwd(), "data", "protocol", "battle-states.json");
const OUT_JSON = path.resolve(process.cwd(), "data", "protocol", "live-skill-states.json");
const OUT_MD = path.resolve(process.cwd(), "docs", "naruto_arena_live_skill_state.md");

const data = JSON.parse(await fs.readFile(INPUT, "utf8"));

const liveRecords = [];

for (const record of data.records || []) {
  const players = [];

  for (const player of record.players || []) {
    const chars = [];

    for (const char of player.team || []) {
      if (!char.exists) continue;
      if (!Array.isArray(char.skills) || char.skills.length === 0) continue;

      chars.push({
        slot: char.slot,
        name: char.name,
        health: char.health,
        skills: char.skills.map((s: any) => ({
          slot: s.slot,
          name: s.name,
          outtagame: s.outtagame,
          cd_on: s.cd_on,
          energy: s.energy || [],
          classes: s.classes || [],
          cooldown: s.cooldown,
          targets: s.target ? Object.keys(s.target) : [],
          targetMap: s.target || null
        }))
      });
    }

    if (chars.length) {
      players.push({
        playerId: player.playerId,
        chars
      });
    }
  }

  if (players.length) {
    liveRecords.push({
      index: record.index,
      capturedAt: record.capturedAt,
      requestAction: record.requestAction,
      responseAction: record.responseAction,
      turn: record.turn,
      players
    });
  }
}

await ensureDir(path.dirname(OUT_JSON));
await ensureDir(path.dirname(OUT_MD));

await writeJson(OUT_JSON, {
  generatedAt: new Date().toISOString(),
  source: INPUT,
  recordCount: liveRecords.length,
  records: liveRecords
});

await writeText(OUT_MD, buildMarkdown(liveRecords));

console.log(`Extracted ${liveRecords.length} live skill-state records`);
console.log(`Wrote ${OUT_JSON}`);
console.log(`Wrote ${OUT_MD}`);

function buildMarkdown(records: any[]): string {
  const lines: string[] = [];

  lines.push("# Naruto-Arena Classic ??? Live Skill State");
  lines.push("");
  lines.push("> Generated from battle-state records where live `skills` arrays were present.");
  lines.push("");
  lines.push(`- Generated at: ${new Date().toISOString()}`);
  lines.push(`- Records with live skills: ${records.length}`);
  lines.push("");

  lines.push("## Meaning");
  lines.push("");
  lines.push("- `outtagame: false` likely means the skill is currently available in-game, subject to chakra/target constraints.");
  lines.push("- `outtagame: true` likely means unavailable/disabled/out of game state.");
  lines.push("- `cd_on` is current cooldown remaining.");
  lines.push("- `target` / `targets` show valid target coordinates exposed by the server.");
  lines.push("- Replaced/transformed skills appear directly in this live skills array.");
  lines.push("");

  for (const r of records) {
    lines.push(`## Record ${r.index} ??? ${r.requestAction} ??? ${r.responseAction}`);
    lines.push("");
    lines.push(`- Turn: ${r.turn || "unknown"}`);
    lines.push("");

    for (const p of r.players) {
      lines.push(`### Player: ${p.playerId}`);
      lines.push("");

      for (const c of p.chars) {
        lines.push(`#### ${c.slot} ??? ${c.name} ??? HP ${c.health}`);
        lines.push("");
        lines.push("| Slot | Skill | cd_on | outtagame | Energy | Classes | Targets |");
        lines.push("|---:|---|---:|---|---|---|---|");

        for (const s of c.skills) {
          lines.push(
            `| ${s.slot} | ${escapeMd(s.name)} | ${s.cd_on ?? ""} | ${s.outtagame} | ${(s.energy || []).join("+") || "None"} | ${(s.classes || []).join(", ")} | ${(s.targets || []).join(", ") || "none"} |`
          );
        }

        lines.push("");
      }
    }
  }

  return lines.join("\\n");
}

function escapeMd(input: string): string {
  return String(input || "").replace(/\\|/g, "\\\\|");
}
