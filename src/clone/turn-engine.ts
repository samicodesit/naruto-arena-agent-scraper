import type {
  CloneBattleState,
  ClonePlayerState,
  ProtocolQueueItem,
  Slot
} from "./types.js";

import { spendChakra, validateQueue } from "./core.js";
import { resolveQueueSkills } from "./skill-resolver.js";

export type ExecuteTurnResult = {
  ok: boolean;
  issues: string[];
  battle: CloneBattleState;
};

export function executeTurn(
  battle: CloneBattleState,
  playerId: string,
  queue: ProtocolQueueItem[]
): ExecuteTurnResult {
  const validation = validateQueue(battle, playerId, queue);

  if (!validation.ok) {
    return {
      ok: false,
      issues: validation.issues,
      battle
    };
  }

  const player = getPlayer(battle, playerId);
  const opponent = getOpponent(battle, playerId);

  const spend = spendChakra(battle, playerId, queue);

  if (!spend.ok) {
    return {
      ok: false,
      issues: [`chakra:${spend.reason}`],
      battle
    };
  }

  player.chakra = spend.remainingChakra;

  const preExistingEndThisTurnEffectKeys = collectEndThisTurnEffectKeys(battle);

  resolveQueueSkills(battle, playerId, queue);
  expireEndThisTurnEffects(battle, playerId, preExistingEndThisTurnEffectKeys);

  for (const item of queue) {
    const assigned = item.assignedSkill;
    if (!assigned) continue;

    const caster = player.team[assigned.char];
    const skill = caster?.skills[assigned.index];

    if (!caster || !skill) continue;

    skill.cooldownRemaining = skill.baseCooldown;

    battle.history.push({
      turnNumber: battle.turnNumber,
      playerId,
      event: "skillQueued",
      payload: {
        casterSlot: assigned.char,
        casterName: caster.name,
        skillIndex: assigned.index,
        skillName: skill.name,
        target: item.usedOn ?? null,
        cost: skill.energy,
        removedChakraForRandom: spend.removedChakra
      }
    });
  }

  updateDeaths(player);
  updateDeaths(opponent);
  updateWinner(battle);

  if (!battle.winner) {
    battle.turnPlayerId = opponent.playerId;
    battle.turnNumber += 1;
  } else {
    battle.phase = "ended";
  }

  battle.history.push({
    turnNumber: battle.turnNumber,
    playerId,
    event: "turnExecuted",
    payload: {
      queueLength: queue.length,
      remainingChakra: player.chakra,
      nextTurn: battle.turnPlayerId,
      winner: battle.winner
    }
  });

  return {
    ok: true,
    issues: [],
    battle
  };
}


function collectEndThisTurnEffectKeys(battle: CloneBattleState): Set<string> {
  const keys = new Set<string>();

  for (const player of battle.players) {
    for (const character of player.team) {
      for (const effect of character.effects) {
        if (isEndThisTurnEffect(effect)) {
          keys.add(effectKey(player.playerId, character.slot, effect));
        }
      }
    }
  }

  return keys;
}

function expireEndThisTurnEffects(
  battle: CloneBattleState,
  playerId: string,
  preExistingKeys: Set<string>
): void {
  for (const player of battle.players) {
    for (const character of player.team) {
      const beforeNames = character.effects.map((effect) => effect.name).join("|");

      character.effects = character.effects.filter((effect) => {
        if (!isEndThisTurnEffect(effect)) return true;

        const key = effectKey(player.playerId, character.slot, effect);
        if (!preExistingKeys.has(key)) return true;

        const durations = effect.textDurations ?? [];

        if (!durations.length || durations.length !== effect.text.length) {
          return false;
        }

        const keptText: string[] = [];
        const keptDurations: string[] = [];

        for (let i = 0; i < effect.text.length; i++) {
          if (isEndThisTurnText(durations[i])) continue;

          keptText.push(effect.text[i]);
          keptDurations.push(durations[i]);
        }

        if (!keptText.length) return false;

        effect.text = keptText;
        effect.textDurations = keptDurations;
        effect.durationLabel = keptDurations[0] ?? effect.durationLabel;

        return true;
      });

      const afterNames = character.effects.map((effect) => effect.name).join("|");

      if (beforeNames !== afterNames) {
        battle.history.push({
          turnNumber: battle.turnNumber,
          playerId,
          event: "endThisTurnEffectsExpired",
          payload: {
            affectedPlayerId: player.playerId,
            affectedSlot: character.slot,
            affectedName: character.name
          }
        });
      }
    }
  }
}

function isEndThisTurnEffect(effect: { durationLabel: string; text: string[]; textDurations?: string[] }): boolean {
  if ((effect.textDurations ?? []).some(isEndThisTurnText)) return true;

  const label = String(effect.durationLabel ?? "").toUpperCase();
  const text = effect.text.join(" ").toUpperCase();

  return (
    isEndThisTurnText(label) ||
    text.includes("END THIS TURN") ||
    text.includes("ENDS THIS TURN")
  );
}

function isEndThisTurnText(value: string): boolean {
  const upper = String(value ?? "").toUpperCase();

  return upper.includes("END THIS TURN") || upper.includes("ENDS THIS TURN");
}

function effectKey(playerId: string, slot: Slot, effect: { id: string; name: string; sourcePlayerId: string | null; sourceSlot: Slot | null }): string {
  return [
    playerId,
    slot,
    effect.id,
    effect.name,
    effect.sourcePlayerId ?? "-",
    effect.sourceSlot ?? "-"
  ].join(":");
}
export function getPlayer(battle: CloneBattleState, playerId: string): ClonePlayerState {
  const player = battle.players.find((p) => p.playerId === playerId);
  if (!player) throw new Error(`Player not found: ${playerId}`);
  return player;
}

export function getOpponent(battle: CloneBattleState, playerId: string): ClonePlayerState {
  const opponent = battle.players.find((p) => p.playerId !== playerId);
  if (!opponent) throw new Error(`Opponent not found for: ${playerId}`);
  return opponent;
}

export function updateDeaths(player: ClonePlayerState): void {
  for (const character of player.team) {
    if (character.health <= 0) {
      character.health = 0;
      character.isDead = true;
      character.effects = [];
    }
  }
}

export function updateWinner(battle: CloneBattleState): void {
  const [a, b] = battle.players;

  const aDead = a.team.every((character) => character.isDead || character.health <= 0);
  const bDead = b.team.every((character) => character.isDead || character.health <= 0);

  if (aDead && bDead) {
    battle.winner = "draw";
    battle.loser = "draw";
    return;
  }

  if (aDead) {
    battle.winner = b.playerId;
    battle.loser = a.playerId;
    return;
  }

  if (bDead) {
    battle.winner = a.playerId;
    battle.loser = b.playerId;
  }
}


export function damageCharacter(
  battle: CloneBattleState,
  targetPlayerId: string,
  targetSlot: Slot,
  amount: number,
  source: string
): void {
  const player = getPlayer(battle, targetPlayerId);
  const target = player.team[targetSlot];
  if (!target || target.isDead) return;

  const originalAmount = amount;
  const preventedByDefense = consumeDestructibleDefense(target, amount);
  amount = Math.max(0, amount - preventedByDefense);

  if (amount > 0) {
    target.health = Math.max(0, target.health - amount);
  }

  battle.history.push({
    turnNumber: battle.turnNumber,
    playerId: targetPlayerId,
    event: "damage",
    payload: {
      targetSlot,
      targetName: target.name,
      amount,
      originalAmount,
      preventedByDefense,
      source,
      remainingHealth: target.health
    }
  });

  updateDeaths(player);
  updateWinner(battle);
}

export function grantDestructibleDefense(
  character: CloneCharacterState,
  amount: number,
  source: string
): void {
  if (amount <= 0 || character.isDead) return;
  const current = getDestructibleDefense(character);
  setDestructibleDefense(character, current + amount);

  character.effects.push({
    id: `observed-defense:${source}:${character.slot}:${Date.now()}:${Math.random()}`,
    name: "__Observed Destructible Defense",
    sourcePlayerId: null,
    sourceSlot: null,
    durationTurns: null,
    durationLabel: "INFINITE",
    text: [`THIS CHARACTER HAS ${amount} POINTS OF DESTRUCTIBLE DEFENSE.`],
    textDurations: ["INFINITE"],
    stacks: 1,
    tags: ["ObservedInternal", "DestructibleDefense"]
  });
}

function consumeDestructibleDefense(character: CloneCharacterState, amount: number): number {
  if (amount <= 0) return 0;

  const current = getDestructibleDefense(character);
  const prevented = Math.min(current, amount);

  if (prevented > 0) {
    setDestructibleDefense(character, current - prevented);
  }

  return prevented;
}

function getDestructibleDefense(character: CloneCharacterState): number {
  const existing = (character as any).__destructibleDefense;
  if (typeof existing === "number") return existing;

  const parsed = character.effects.reduce((sum, effect) => {
    return sum + effect.text.reduce((inner, line) => {
      const match = String(line).match(/\bHAS +(\d+) +POINTS? +OF +DESTRUCTIBLE +DEFENSE\b/i);
      return inner + (match ? Number(match[1]) : 0);
    }, 0);
  }, 0);

  setDestructibleDefense(character, parsed);
  return parsed;
}

function setDestructibleDefense(character: CloneCharacterState, amount: number): void {
  (character as any).__destructibleDefense = Math.max(0, amount);
}
