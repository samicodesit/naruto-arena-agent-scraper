
import fs from "node:fs";
import path from "node:path";
import type {
  Chakra,
  CloneBattleState,
  CloneCharacterState,
  CloneEffect,
  ClonePlayerState,
  CloneSkillState,
  Slot,
  SpecificChakra
} from "./types.js";
import { executeTurn } from "./turn-engine.js";

const sessionDir = process.env.SESSION_DIR ?? "data/traffic/2026-05-14T09-12-13-865Z";
const preFile = process.env.PRE ?? "0021_requestEndTurn.json";
const postFile = process.env.POST ?? "0022_passTurn.json";

const preRecord = readJson(path.join(sessionDir, preFile));
const postRecord = readJson(path.join(sessionDir, postFile));

const preContent = preRecord.response.body.content;
const postContent = postRecord.response.body.content;
const queue = postRecord.request.payload.queue ?? [];

const battle = battleFromServerContent(preContent);

const beforeHp = summarizeHp(battle.players);
const executed = executeTurn(battle, battle.turnPlayerId, queue);
const cloneAfterHp = summarizeHp(battle.players);
const serverAfterHp = summarizeServerHp(postContent.players ?? []);

console.log("\n=== RECORDED TURN REPLAY ===");
console.log("session:", sessionDir);
console.log("pre:", preFile);
console.log("post:", postFile);
console.log("turnPlayer:", preContent.turn);
console.log("queue:", queue.map((item: any) => item.name).join(" | "));
console.log("executeOk:", executed.ok);
if (!executed.ok) console.log("issues:", executed.issues.join(", "));
console.log("historyEvents:", battle.history.map((event) => event.event).join(",") || "none");

console.log("\nBEFORE HP:");
printHp(beforeHp);

console.log("\nSERVER AFTER HP:");
printHp(serverAfterHp);

console.log("\nCLONE AFTER HP:");
printHp(cloneAfterHp);

console.log("\nDIFF:");
const diffs = diffHp(serverAfterHp, cloneAfterHp);
if (!diffs.length) {
  console.log("no HP diffs");
} else {
  for (const diff of diffs) console.log(diff);
}

console.log("\n=== END RECORDED TURN REPLAY ===");

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function battleFromServerContent(content: any): CloneBattleState {
  const players = content.players ?? [];

  if (players.length !== 2) {
    throw new Error("Expected exactly 2 players in server battle content.");
  }

  const clonePlayers = players.map((player: any, index: number) => serverPlayerToClone(player, index as 0 | 1)) as [
    ClonePlayerState,
    ClonePlayerState
  ];

  return {
    engineVersion: "clone-replay-0.1",
    createdAt: new Date().toISOString(),
    phase: "in_turn",
    turnNumber: Number(content.turnKey ?? 1),
    turnPlayerId: String(content.turn),
    winner: null,
    loser: null,
    players: clonePlayers,
    history: []
  };
}

function serverPlayerToClone(player: any, side: 0 | 1): ClonePlayerState {
  return {
    playerId: String(player.playerId),
    side,
    chakra: normalizeChakra(player.chakra ?? []),
    team: [0, 1, 2].map((slot) => serverCharToClone(player.team?.[`char${slot}`], slot as Slot))
  };
}

function serverCharToClone(raw: any, slot: Slot): CloneCharacterState {
  const health = Number(raw?.health ?? 100);

  return {
    slot,
    name: String(raw?.name ?? `unknown-${slot}`),
    maxHealth: 100,
    health,
    isDead: health <= 0,
    facepic: raw?.customFacepic ?? null,
    themePic: null,
    description: null,
    skills: Array.isArray(raw?.skills) ? raw.skills.map((skill: any, index: number) => serverSkillToClone(skill, index)) : [],
    effects: Array.isArray(raw?.icon) ? raw.icon.map((effect: any, index: number) => serverEffectToClone(effect, index, slot)) : []
  };
}

function serverSkillToClone(skill: any, index: number): CloneSkillState {
  const classes = Array.isArray(skill.classes) ? skill.classes.map(String) : [];

  return {
    baseIndex: index,
    currentIndex: index,
    name: String(skill.name),
    baseName: String(skill.name),
    description: skill.description ?? skill.descriptionText ?? skill.descriptionRaw ?? null,
    energy: Array.isArray(skill.energy) ? skill.energy : [],
    classes,
    baseCooldown: Number(skill.cooldown ?? 0),
    cooldownRemaining: Number(skill.cd_on ?? 0),
    isPassive: classes.includes("Passive") || String(skill.name).startsWith("Passive:"),
    disabled: Boolean(skill.outtagame),
    targetMap: skill.target ?? null
  };
}

function serverEffectToClone(effect: any, index: number, slot: Slot): CloneEffect {
  return {
    id: String(effect.id ?? `effect-${slot}-${index}`),
    name: String(effect.name ?? "unknown-effect"),
    sourcePlayerId: effect.id ?? null,
    sourceSlot: typeof effect.self === "number" ? effect.self : null,
    durationTurns: null,
    durationLabel: effect.effects?.[0]?.duration ?? "unknown",
    text: Array.isArray(effect.effects) ? effect.effects.map((entry: any) => String(entry.text)) : [],
    textDurations: Array.isArray(effect.effects) ? effect.effects.map((entry: any) => String(entry.duration)) : [],
    stacks: Number(effect.stacks ?? 1),
    tags: []
  };
}

function normalizeChakra(values: unknown[]): SpecificChakra[] {
  return values.filter(isSpecificChakra);
}

function isSpecificChakra(value: unknown): value is SpecificChakra {
  return value === "Tai" || value === "Blood" || value === "Nin" || value === "Gen";
}

function summarizeHp(players: ClonePlayerState[]): Record<string, number> {
  const result: Record<string, number> = {};

  for (const player of players) {
    for (const character of player.team) {
      result[`${player.playerId}:${character.slot}:${character.name}`] = character.health;
    }
  }

  return result;
}

function summarizeServerHp(players: any[]): Record<string, number> {
  const result: Record<string, number> = {};

  for (const player of players) {
    for (const slot of [0, 1, 2]) {
      const character = player.team?.[`char${slot}`];
      if (!character) continue;
      result[`${player.playerId}:${slot}:${character.name}`] = Number(character.health);
    }
  }

  return result;
}

function printHp(hp: Record<string, number>): void {
  for (const [key, value] of Object.entries(hp)) {
    console.log(`${key} = ${value}`);
  }
}

function diffHp(server: Record<string, number>, clone: Record<string, number>): string[] {
  const keys = new Set([...Object.keys(server), ...Object.keys(clone)]);
  const diffs: string[] = [];

  for (const key of keys) {
    const serverHp = server[key];
    const cloneHp = clone[key];

    if (serverHp !== cloneHp) {
      diffs.push(`${key}: server=${serverHp} clone=${cloneHp}`);
    }
  }

  return diffs;
}
