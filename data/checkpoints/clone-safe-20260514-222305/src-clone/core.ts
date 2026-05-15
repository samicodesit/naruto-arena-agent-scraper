import fs from "node:fs";
import path from "node:path";
import type {
  Chakra,
  ChakraSpendResult,
  CloneBattleState,
  CloneEffect,
  ClonePlayerState,
  ProtocolQueueItem,
  QueueValidationResult,
  RawCharacterDefinition,
  Slot,
  SpecificChakra
} from "./types.js";
import { isSpecificChakra } from "./types.js";

export function loadCharacters(
  file = path.resolve(process.cwd(), "data/characters/characters.parsed.json")
): Map<string, RawCharacterDefinition> {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const list =
    Array.isArray(raw) ? raw :
    Array.isArray(raw.characters) ? raw.characters :
    Array.isArray(raw.data) ? raw.data :
    Array.isArray(raw.content?.characters) ? raw.content.characters :
    null;

  if (!list) {
    throw new Error("Unsupported characters.parsed.json shape.");
  }

  const db = new Map<string, RawCharacterDefinition>();

  for (const c of list) {
    const name = String(c.name);
    db.set(name, {
      name,
      url: c.url ?? c.image ?? null,
      themepic: c.themepic ?? c.themePic ?? null,
      description: c.description ?? null,
      descriptionBR: c.descriptionBR ?? null,
      skills: (c.skills ?? []).map((s: any) => ({
        name: String(s.name),
        themeName: s.themeName ?? null,
        description: s.description ?? s.descriptionText ?? s.descriptionRaw ?? null,
        descriptionBR: s.descriptionBR ?? null,
        energy: Array.isArray(s.energy) ? s.energy : [],
        classes: Array.isArray(s.classes) ? s.classes : [],
        cooldown: Number(s.cooldown ?? 0),
        url: s.url ?? null,
        themepic: s.themepic ?? null,
        target: s.target ?? null
      }))
    });
  }

  return db;
}

export function requireTeam(
  db: Map<string, RawCharacterDefinition>,
  names: string[]
): RawCharacterDefinition[] {
  return names.map((name) => {
    const character = db.get(name);
    if (!character) {
      const close = [...db.keys()].filter((candidate) =>
        candidate.toLowerCase().includes(name.toLowerCase().replace(/\s+\(s\)$/i, ""))
      );
      throw new Error(`Character not found: ${name}. Close: ${close.slice(0, 10).join(", ")}`);
    }
    return character;
  });
}

export function createBattle(input: {}): CloneBattleState {
  const i = input as any;
  const makePlayer = (
    playerId: string,
    side: 0 | 1,
    team: RawCharacterDefinition[],
    chakra: SpecificChakra[]
  ): ClonePlayerState => ( {
    playerId,
    side,
    chakra: [...chakra],
    team: team.map((character, slot) => ({
      slot: slot as Slot,
      name: character.name,
      maxHealth: 100,
      health: 100,
      isDead: false,
      facepic: character.url ?? null,
      themePic: character.themepic ?? null,
      description: character.description ?? null,
      skills: character.skills.map((skill, index) => ({
        baseIndex: index,
        currentIndex: index,
        name: skill.name,
        baseName: skill.name,
        description: skill.description ?? null,
        energy: skill.energy ?? [],
        classes: skill.classes ?? [],
        baseCooldown: Number(skill.cooldown ?? 0),
        cooldownRemaining: 0,
        isPassive: (skill.classes ?? []).includes("Passive") || skill.name.startsWith("Passive:"),
        disabled: false,
        targetMap: skill.target ?? null
      })),
      effects: makePassiveEffects(playerId, slot as Slot, character)
    }))
  });

  return {
    engineVersion: "clone-0.1-scaffold",
    createdAt: new Date().toISOString(),
    phase: "in_turn",
    turnNumber: 1,
    turnPlayerId: i.playerAId,
    winner: null,
    loser: null,
    players: [
      makePlayer(i.playerAId, 0, i.playerATeam, i.chakraA),
      makePlayer(i.playerBId, 1, i.playerBTeam, i.chakraB ?? [])
    ],
    history: []
  };
}

function makePassiveEffects(
  playerId: string,
  slot: Slot,
  character: RawCharacterDefinition
): CloneEffect[] {
  return character.skills
    .filter((skill) => (skill.classes ?? []).includes("Passive") || skill.name.startsWith("Passive:"))
    .map((skill) => ( {
      id: `${playerId}:${slot}:${skill.name}`,
      name: skill.name,
      sourcePlayerId: playerId,
      sourceSlot: slot,
      durationTurns: null,
      durationLabel: "INFINITE",
      text: [stripTags(skill.description ?? "Passive active.")],
      stacks: 1,
      tags: ["Passive"]
    }));
}

export function validateQueue(
  state: CloneBattleState,
  playerId: string,
  queue: ProtocolQueueItem[]
): QueueValidationResult {
  const player = state.players.find((p) => p.playerId === playerId);
  const issues: string[] = [];

  if (!player) {
    return { ok: false, issues: ["player_not_found"] };
  }

  if (state.turnPlayerId !== playerId) {
    issues.push("not_player_turn");
  }

  const usedCharacters = new Set<number>();

  for (const [queueIndex, item] of queue.entries()) {
    const assigned = item.assignedSkill;

    if (!assigned) {
      if ((item as any).encryptItem) continue;
      issues.push(`item_${queueIndex}_missing_assignedSkill`);
      continue;
    }

    if (usedCharacters.has(assigned.char)) {
      issues.push(`character_used_more_than_once:${assigned.char}`);
    }
    usedCharacters.add(assigned.char);

    const character = player.team[assigned.char];
    const skill = character?.skills[assigned.index];

    if (!character || !skill) {
      issues.push(`item_${queueIndex}_invalid_character_or_skill`);
      continue;
    }

    if (character.isDead) {
      issues.push(`item_${queueIndex}_dead_character:${character.name}`);
    }

    if (skill.isPassive) {
      issues.push(`item_${queueIndex}_passive_not_castable:${skill.name}`);
    }

    if (skill.cooldownRemaining > 0) {
      issues.push(`item_${queueIndex}_cooldown:${skill.name}`);
    }

    if (skill.disabled) {
      issues.push(`item_${queueIndex}_disabled:${skill.name}`);
    }

    if (item.name !== skill.name) {
      issues.push(`item_${queueIndex}_name_mismatch:${item.name}!=${skill.name}`);
    }
  }

  const spend = spendChakra(state, playerId, queue);
  if (!spend.ok) {
    issues.push(`chakra:${spend.reason}`);
  }

  return {
    ok: issues.length === 0,
    issues
  };
}

export function spendChakra(
  state: CloneBattleState,
  playerId: string,
  queue: ProtocolQueueItem[]
): ChakraSpendResult {
  const player = state.players.find((p) => p.playerId === playerId);
  if (!player) {
    return {
      ok: false,
      reason: "player_not_found",
      totalCost: [],
      exactCost: [],
      randomCost: 0,
      removedChakra: [],
      remainingChakra: []
    };
  }

  const totalCost: Chakra[] = queue.flatMap((item) => {
    const assigned = item.assignedSkill;
    if (!assigned) return [];
    return player.team[assigned.char]?.skills[assigned.index]?.energy ?? [];
  });

  const remaining = [...player.chakra];
  const exactCost = totalCost.filter(isSpecificChakra);
  const randomCost = totalCost.filter((chakra) => chakra === "Random").length;

  for (const cost of exactCost) {
    const index = remaining.indexOf(cost);
    if (index === -1) {
      return {
        ok: false,
        reason: `missing_${cost}`,
        totalCost,
        exactCost,
        randomCost,
        removedChakra: [],
        remainingChakra: [...player.chakra]
      };
    }
    remaining.splice(index, 1);
  }

  if (remaining.length < randomCost) {
    return {
      ok: false,
      reason: "missing_random",
      totalCost,
      exactCost,
      randomCost,
      removedChakra: [],
      remainingChakra: [...player.chakra]
    };
  }

  return {
    ok: true,
    reason: null,
    totalCost,
    exactCost,
    randomCost,
    removedChakra: remaining.slice(0, randomCost),
    remainingChakra: remaining.slice(randomCost)
  };
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}
