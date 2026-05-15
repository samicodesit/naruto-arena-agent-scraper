import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, writeJson, writeText } from "./utils/fs.js";

type TrafficRecord = {
  index: number;
  capturedAt: string;
  request: {
    action: string;
    payload: any;
  };
  response: {
    status: number;
    body: any;
  };
};

const trafficRoot = path.resolve(process.cwd(), "data", "traffic");
const outDir = path.resolve(process.cwd(), "data", "protocol");
const docsDir = path.resolve(process.cwd(), "docs");

await ensureDir(outDir);
await ensureDir(docsDir);

const sessionDir = await resolveSessionDir();
const records = await loadRecords(sessionDir);

const battleRecords = records
  .map((r) => normalizeBattleRecord(r))
  .filter(Boolean) as any[];

await writeJson(path.join(outDir, "battle-states.json"), {
  generatedAt: new Date().toISOString(),
  sessionDir,
  count: battleRecords.length,
  records: battleRecords
});

await writeText(
  path.join(docsDir, "naruto_arena_battle_state.md"),
  buildMarkdown(sessionDir, battleRecords)
);

console.log(`Extracted ${battleRecords.length} battle state records`);
console.log("Wrote data/protocol/battle-states.json");
console.log("Wrote docs/naruto_arena_battle_state.md");

async function resolveSessionDir(): Promise<string> {
  const cliArg = process.argv[2];
  if (cliArg) return path.resolve(process.cwd(), cliArg);

  const entries = await fs.readdir(trafficRoot, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => path.join(trafficRoot, e.name))
    .sort();

  const latest = dirs.at(-1);
  if (!latest) throw new Error(`No traffic sessions found in ${trafficRoot}`);
  return latest;
}

async function loadRecords(dir: string): Promise<TrafficRecord[]> {
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const records: TrafficRecord[] = [];

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const parsed = JSON.parse(await fs.readFile(fullPath, "utf8"));
    records.push(parsed);
  }

  return records.sort((a, b) => a.index - b.index);
}

function normalizeBattleRecord(r: TrafficRecord) {
  const body = r.response?.body;
  const content = body?.content;

  if (!content) return null;

  if (body.action === "endGame") {
    return {
      index: r.index,
      capturedAt: r.capturedAt,
      requestAction: r.request.action,
      responseAction: body.action,
      turn: null,
      winner: content.endGame === "win" ? "player" : null,
      loser: content.endGame === "lose" ? "player" : null,
      result: content.endGame ?? null,
      gameType: content.var_type ?? null,
      isFinished: true,
      submittedQueue: [],
      removedChakra: [],
      players: [],
      rawContentKeys: Object.keys(content)
    };
  }

  if (!Array.isArray(content.players)) return null;

  return {
    index: r.index,
    capturedAt: r.capturedAt,
    requestAction: r.request.action,
    responseAction: body.action,
    turn: content.turn ?? null,
    turnKey: content.turnKey ?? null,
    winner: content.winner ?? null,
    loser: content.loser ?? null,
    result: null,
    gameType: null,
    isFinished: Boolean(content.winner || content.loser || body.action === "finishBattle"),
    submittedQueue: r.request.action === "passTurn" ? simplifyQueue(r.request.payload?.queue || []) : [],
    removedChakra: r.request.action === "passTurn" ? r.request.payload?.removedChakra || [] : [],
    players: content.players.map((p: any, playerIndex: number) => ({
      playerIndex,
      playerId: p.playerId,
      info: p.info ?? null,
      chakra: Array.isArray(p.chakra) ? p.chakra : [],
      team: normalizeTeam(p.team)
    })),
    rawContentKeys: Object.keys(content)
  };
}

function normalizeTeam(team: any) {
  const result: any[] = [];

  for (const key of ["char0", "char1", "char2"]) {
    const c = team?.[key];

    if (!c) {
      result.push({
        slot: key,
        exists: false
      });
      continue;
    }

    result.push({
      slot: key,
      exists: true,
      name: c.name,
      health: c.health,
      customFacepic: c.customFacepic ?? null,
      icons: Array.isArray(c.icon)
        ? c.icon.map((icon: any) => ({
            name: icon.name,
            stacks: icon.stacks ?? null,
            self: icon.self ?? null,
            id: icon.id ?? null,
            effects: Array.isArray(icon.effects)
              ? icon.effects.map((e: any) => ({
                  text: e.text,
                  duration: e.duration,
                  isNothing: e.isNothing ?? false
                }))
              : [],
            additionalEffects: icon.additionalEffects ?? [],
            stackEffects: icon.stackEffects ?? []
          }))
        : [],
      skills: Array.isArray(c.skills)
        ? c.skills.map((skill: any, skillIndex: number) => ({
            slot: skillIndex,
            name: skill.name,
            outtagame: skill.outtagame ?? null,
            cd_on: skill.cd_on ?? null,
            energy: skill.energy ?? [],
            classes: skill.classes ?? [],
            cooldown: skill.cooldown ?? null,
            target: skill.target ?? null,
            description: skill.description ?? null,
            descriptionBR: skill.descriptionBR ?? null,
            url: skill.url ?? null
          }))
        : []
    });
  }

  return result;
}

function simplifyQueue(queue: any[]) {
  return queue.map((q) => ({
    name: q.name,
    menu_local: q.menu_local ?? null,
    usedOn: q.usedOn ?? null,
    new: q.new ?? null,
    assignedSkill: q.assignedSkill ?? null,
    hasEncryptItem: Boolean(q.encryptItem)
  }));
}

function buildMarkdown(sessionDir: string, records: any[]) {
  const lines: string[] = [];

  lines.push("# Naruto-Arena Classic — Battle State Model");
  lines.push("");
  lines.push("> Generated from recorded `/api/handleingame` match traffic.");
  lines.push("");
  lines.push(`- Generated at: ${new Date().toISOString()}`);
  lines.push(`- Session dir: \`${path.relative(process.cwd(), sessionDir)}\``);
  lines.push(`- Battle state records: ${records.length}`);
  lines.push("");

  lines.push("## Observed Battle Lifecycle");
  lines.push("");
  lines.push("```txt");
  lines.push("connectSelection");
  lines.push("searchGame");
  lines.push("checkIfInBattle");
  lines.push("checkIfConfirmedBattle");
  lines.push("connectBattle");
  lines.push("passTurn -> submits player queue and random chakra spending");
  lines.push("requestEndTurn -> polls until updated battle state is returned");
  lines.push("repeat passTurn/requestEndTurn until match ends");
  lines.push("connectSelection -> return to selection after match");
  lines.push("```");
  lines.push("");

  lines.push("## Core Battle State Shape");
  lines.push("");
  lines.push("```ts");
  lines.push(`{
  action: "endTurn" | string,
  content: {
    players: [
      {
        playerId: string,
        team: {
          char0: CharacterBattleState,
          char1: CharacterBattleState,
          char2: CharacterBattleState
        },
        info: {
          win: number,
          lose: number,
          streak: number,
          xp: number,
          level: number,
          rank: string,
          clan: string,
          ladderrank: number
        }
      }
    ],
    turn: string
  }
}

type CharacterBattleState = {
  name: string,
  health: number,
  icon: ActiveEffect[],
  customFacepic: string | null
}

type ActiveEffect = {
  name: string,
  effects: Array<{ text: string, duration: string, isNothing?: boolean }>,
  stacks: number,
  self: number,
  id: string
}`);
  lines.push("```");
  lines.push("");

  lines.push("## Submitted Turn Shape");
  lines.push("");
  lines.push("```ts");
  lines.push(`{
  action: "passTurn",
  queue: Array<{
    name: string,
    menu_local?: [number, number, number],
    usedOn?: { s: 0 | 1, i: 0 | 1 | 2 },
    new?: true,
    assignedSkill?: { char: number, index: number },
    encryptItem?: string
  }>,
  exchangeInformation: unknown[],
  removedChakra: Array<"Tai" | "Blood" | "Nin" | "Gen">,
  languagePreference: "English",
  recyleKeys: boolean
}`);
  lines.push("```");
  lines.push("");

  lines.push("## Coordinate Interpretation");
  lines.push("");
  lines.push("- `usedOn.s = 0` appears to mean own/player side.");
  lines.push("- `usedOn.s = 1` appears to mean opponent/enemy side.");
  lines.push("- `usedOn.i = 0..2` is character slot.");
  lines.push("- `assignedSkill.char = 0..2` is your caster slot.");
  lines.push("- `assignedSkill.index = skill index` maps to the character skill array.");
  lines.push("- `menu_local = [0, casterSlot, skillIndex]` appears to duplicate/encode local UI position.");
  lines.push("- `removedChakra` contains specific chakra spent for random-cost requirements.");
  lines.push("- `encryptItem` appears for continuing/replacement/server-issued skill tokens and must be treated as opaque.");
  lines.push("");

  lines.push("## Timeline Summary");
  lines.push("");
  lines.push("| # | Request | Response | Turn | Submitted skills | Removed chakra |");
  lines.push("|---:|---|---|---|---|---|");

  for (const r of records) {
    lines.push(
      `| ${r.index} | \`${r.requestAction}\` | \`${r.responseAction}\` | ${r.turn || ""} | ${r.submittedQueue.map((q: any) => q.name).join(", ") || ""} | ${r.removedChakra.join(", ") || ""} |`
    );
  }

  lines.push("");
  lines.push("## State Snapshots");
  lines.push("");

  for (const r of records) {
    lines.push(`## Record ${r.index} — ${r.requestAction} → ${r.responseAction}`);
    lines.push("");
    lines.push(`- Turn: ${r.turn || "unknown"}`);
    lines.push(`- Winner: ${r.winner || "none"}`);
    lines.push(`- Loser: ${r.loser || "none"}`);
    lines.push("");

    if (r.submittedQueue.length) {
      lines.push("### Submitted Queue");
      lines.push("");
      for (const q of r.submittedQueue) {
        lines.push(`- ${q.name} | caster=${q.assignedSkill?.char ?? "?"} skill=${q.assignedSkill?.index ?? "?"} targetSide=${q.usedOn?.s ?? "?"} targetSlot=${q.usedOn?.i ?? "?"} encrypted=${q.hasEncryptItem}`);
      }
      lines.push("");
    }

    lines.push("### Players");
    lines.push("");

    for (const p of r.players) {
      lines.push(`#### ${p.playerId}`);
      lines.push("");
      for (const c of p.team) {
        if (!c.exists) {
          lines.push(`- ${c.slot}: empty`);
          continue;
        }

        lines.push(`- ${c.slot}: **${c.name}** — HP ${c.health}`);

        for (const icon of c.icons) {
          lines.push(`  - Effect: ${icon.name} | stacks=${icon.stacks ?? ""} | source=${icon.id ?? ""}`);
          for (const e of icon.effects) {
            lines.push(`    - ${e.text} (${e.duration})`);
          }
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
