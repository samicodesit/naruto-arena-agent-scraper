import fs from "node:fs";
import path from "node:path";
import type {
  CloneBattleState,
  CloneCharacterState,
  CloneEffect,
  ClonePlayerState,
  CloneSkillState,
  Slot,
  SpecificChakra
} from "./types.js";
import { executeTurn } from "./turn-engine.js";

type CharacterComparable = {
  key: string;
  hp: number;
  effects: string[];
  skills: string[] | null;
  cooldowns: string[] | null;
  disabled: string[] | null;
};

type Snapshot = {
  hp: Record<string, number>;
  effects: Record<string, string[]>;
  skills: Record<string, string[] | null>;
  cooldowns: Record<string, string[] | null>;
  disabled: Record<string, string[] | null>;
  chakra: Record<string, string[] | null>;
};

const sessionDir = process.env.SESSION_DIR ?? "data/traffic/2026-05-14T09-12-13-865Z";
const preFile = process.env.PRE ?? "0040_requestEndTurn.json";
const postFile = process.env.POST ?? "0041_passTurn.json";

const preRecord = readJson(path.join(sessionDir, preFile));
const postRecord = readJson(path.join(sessionDir, postFile));

const preContent = preRecord.response.body.content;
const postContent = postRecord.response.body.content;
const queue = postRecord.request.payload.queue ?? [];

const battle = battleFromServerContent(preContent);
const executed = executeTurn(battle, battle.turnPlayerId, queue);

const server = snapshotFromServer(postContent.players ?? []);
const clone = snapshotFromClone(battle.players);

console.log("\n=== CLONE STATE DIFF ===");
console.log("session:", sessionDir);
console.log("pre:", preFile);
console.log("post:", postFile);
console.log("turnPlayer:", preContent.turn);
console.log("queue:", queue.map((item: any) => item.name).join(" | "));
console.log("executeOk:", executed.ok);
if (!executed.ok) console.log("issues:", executed.issues.join(", "));
console.log("historyEvents:", battle.history.map((event) => event.event).join(",") || "none");

const hpDiffs = diffNumberMap(server.hp, clone.hp);
const effectDiffs = diffArrayMap(server.effects, clone.effects);
const skillDiffs = diffNullableArrayMap(server.skills, clone.skills);
const cooldownDiffs = diffNullableArrayMap(server.cooldowns, clone.cooldowns);
const disabledDiffs = diffNullableArrayMap(server.disabled, clone.disabled);
const chakraDiffs = diffNullableArrayMap(server.chakra, clone.chakra);

printSection("HP DIFFS", hpDiffs);
printSection("EFFECT NAME DIFFS", effectDiffs);
printSection("SKILL NAME DIFFS", skillDiffs);
printSection("COOLDOWN DIFFS", cooldownDiffs);
printSection("DISABLED / OUTTAGAME DIFFS", disabledDiffs);
printSection("CHAKRA DIFFS", chakraDiffs);

const total =
  hpDiffs.length +
  effectDiffs.length +
  skillDiffs.length +
  cooldownDiffs.length +
  disabledDiffs.length +
  chakraDiffs.length;

console.log("\nSUMMARY:");
console.log("totalDiffs:", total);
console.log("hpDiffs:", hpDiffs.length);
console.log("effectDiffs:", effectDiffs.length);
console.log("skillDiffs:", skillDiffs.length);
console.log("cooldownDiffs:", cooldownDiffs.length);
console.log("disabledDiffs:", disabledDiffs.length);
console.log("chakraDiffs:", chakraDiffs.length);
console.log("note: skill/cooldown/disabled/chakra comparisons are skipped where the server response does not include that data.");
console.log("\n=== END CLONE STATE DIFF ===");

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
    engineVersion: "clone-state-diff-0.1",
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

function snapshotFromServer(players: any[]): Snapshot {
  const snapshot: Snapshot = emptySnapshot();

  for (const player of players) {
    const playerId = String(player.playerId);
    snapshot.chakra[playerId] = Array.isArray(player.chakra) ? player.chakra.map(String) : null;

    for (const slot of [0, 1, 2] as Slot[]) {
      const character = player.team?.[`char${slot}`];
      if (!character) continue;

      const key = `${playerId}:${slot}:${String(character.name)}`;
      const comparable = serverCharacterComparable(key, character);

      snapshot.hp[key] = comparable.hp;
      snapshot.effects[key] = comparable.effects;
      snapshot.skills[key] = comparable.skills;
      snapshot.cooldowns[key] = comparable.cooldowns;
      snapshot.disabled[key] = comparable.disabled;
    }
  }

  return snapshot;
}

function snapshotFromClone(players: ClonePlayerState[]): Snapshot {
  const snapshot: Snapshot = emptySnapshot();

  for (const player of players) {
    snapshot.chakra[player.playerId] = [...player.chakra];

    for (const character of player.team) {
      const key = `${player.playerId}:${character.slot}:${character.name}`;

      snapshot.hp[key] = character.health;
      snapshot.effects[key] = sortStrings(character.effects.map((effect) => effect.name));
      snapshot.skills[key] = character.skills.map((skill) => `${skill.currentIndex}:${skill.name}`);
      snapshot.cooldowns[key] = character.skills.map((skill) => `${skill.currentIndex}:${skill.name}:${skill.cooldownRemaining}`);
      snapshot.disabled[key] = character.skills.map((skill) => `${skill.currentIndex}:${skill.name}:${skill.disabled}`);
    }
  }

  return snapshot;
}

function emptySnapshot(): Snapshot {
  return {
    hp: {},
    effects: {},
    skills: {},
    cooldowns: {},
    disabled: {},
    chakra: {}
  };
}

function serverCharacterComparable(key: string, character: any): CharacterComparable {
  const effects = sortStrings((character.icon ?? []).map((effect: any) => String(effect.name)));

  const hasSkills = Array.isArray(character.skills);
  const skills = hasSkills
    ? character.skills.map((skill: any, index: number) => `${index}:${String(skill.name)}`)
    : null;

  const cooldowns = hasSkills
    ? character.skills.map((skill: any, index: number) => `${index}:${String(skill.name)}:${Number(skill.cd_on ?? 0)}`)
    : null;

  const disabled = hasSkills
    ? character.skills.map((skill: any, index: number) => `${index}:${String(skill.name)}:${Boolean(skill.outtagame)}`)
    : null;

  return {
    key,
    hp: Number(character.health),
    effects,
    skills,
    cooldowns,
    disabled
  };
}

function diffNumberMap(server: Record<string, number>, clone: Record<string, number>): string[] {
  const keys = new Set([...Object.keys(server), ...Object.keys(clone)]);
  const diffs: string[] = [];

  for (const key of keys) {
    if (server[key] !== clone[key]) {
      diffs.push(`${key}: server=${server[key]} clone=${clone[key]}`);
    }
  }

  return diffs;
}

function diffNullableArrayMap(
  server: Record<string, string[] | null>,
  clone: Record<string, string[] | null>
): string[] {
  const keys = new Set([...Object.keys(server), ...Object.keys(clone)]);
  const diffs: string[] = [];

  for (const key of keys) {
    const serverValue = server[key];

    if (serverValue === null) continue;

    const cloneValue = clone[key] ?? null;

    if (JSON.stringify(sortStrings(serverValue)) !== JSON.stringify(sortStrings(cloneValue ?? []))) {
      diffs.push(`${key}: server=${JSON.stringify(sortStrings(serverValue))} clone=${JSON.stringify(sortStrings(cloneValue ?? []))}`);
    }
  }

  return diffs;
}

function diffArrayMap(
  server: Record<string, string[]>,
  clone: Record<string, string[]>
): string[] {
  const keys = new Set([...Object.keys(server), ...Object.keys(clone)]);
  const diffs: string[] = [];

  for (const key of keys) {
    const serverValue = server[key] ?? [];
    const cloneValue = clone[key] ?? [];

    if (JSON.stringify(sortStrings(serverValue)) !== JSON.stringify(sortStrings(cloneValue))) {
      diffs.push(`${key}: server=${JSON.stringify(sortStrings(serverValue))} clone=${JSON.stringify(sortStrings(cloneValue))}`);
    }
  }

  return diffs;
}

function sortStrings(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function printSection(title: string, lines: string[]): void {
  console.log(`\n${title}:`);

  if (!lines.length) {
    console.log("none");
    return;
  }

  for (const line of lines) console.log(line);
}
