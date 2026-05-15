import type { ProtocolQueueItem, Slot } from "./types.js";

type ServerTarget = {
  playerId: string;
  slot: Slot;
};

type ReplayEffectTargetOverride = {
  effectName: string;
  relation: "caster" | "casterAlly" | "target" | "targetAlly" | string;
  playerId: string;
  slot: Slot;
};

export function withReplayObservedTargets(
  preContent: any,
  postContent: any,
  queue: ProtocolQueueItem[]
): ProtocolQueueItem[] {
  return queue.map((item) => {
    const next: ProtocolQueueItem = { ...item };

    if (!item.assignedSkill) return next;

    const turnPlayerId = String(preContent.turn ?? "");
    const casterPlayer = findServerPlayerById(preContent, turnPlayerId);
    const casterSlot = Number(item.assignedSkill.char) as Slot;
    const caster = findServerChar(casterPlayer, casterSlot);
    const skill = caster?.skills?.[Number(item.assignedSkill.index)] ?? null;
    const description = String(skill?.description ?? "");

    if (!isRandomEnemySkill(description)) return next;

    const directDamageTarget = inferRandomDamageTargetFromPostState(preContent, postContent, item, description);

    if (directDamageTarget) {
      next.replayTargetOverride = directDamageTarget;
    }

    const effectTargets = inferAddedOrChangedEffectTargetsFromPostState(preContent, postContent, {
      effectName: String(item.name),
      sourcePlayerId: turnPlayerId,
      sourceSlot: casterSlot,
      casterPlayerId: turnPlayerId,
      casterSlot,
      usedOn: item.usedOn ?? null
    });

    if (effectTargets.length) {
      next.replayEffectTargetOverrides = effectTargets;
    }

    return next;
  });
}

function inferRandomDamageTargetFromPostState(
  preContent: any,
  postContent: any,
  item: ProtocolQueueItem,
  description: string
): ServerTarget | null {
  const randomDamage = extractRandomEnemyDamage(description);
  if (randomDamage === null) return null;

  const targetPlayer = typeof item.usedOn?.s === "number"
    ? preContent.players?.[Number(item.usedOn.s)]
    : null;

  if (!targetPlayer?.playerId) return null;

  const candidates = hpDeltasForPlayer(preContent, postContent, String(targetPlayer.playerId))
    .filter((delta) => delta.delta === -randomDamage);

  if (candidates.length !== 1) return null;

  return {
    playerId: candidates[0].playerId,
    slot: candidates[0].slot
  };
}

function inferAddedOrChangedEffectTargetsFromPostState(
  preContent: any,
  postContent: any,
  input: {
    effectName: string;
    sourcePlayerId: string;
    sourceSlot: Slot;
    casterPlayerId: string;
    casterSlot: Slot;
    usedOn: { s: number; i: number } | null;
  }
): ReplayEffectTargetOverride[] {
  const out: ReplayEffectTargetOverride[] = [];

  for (const postPlayer of postContent.players ?? []) {
    const playerId = String(postPlayer.playerId);
    const prePlayer = findServerPlayerById(preContent, playerId);

    if (!prePlayer) continue;

    for (const slot of [0, 1, 2] as Slot[]) {
      if (playerId === input.casterPlayerId && slot === input.casterSlot) continue;

      const preChar = findServerChar(prePlayer, slot);
      const postChar = findServerChar(postPlayer, slot);

      if (!preChar || !postChar) continue;

      if (!effectWasAddedOrChanged(preChar, postChar, input.effectName, input.sourcePlayerId, input.sourceSlot)) {
        continue;
      }

      out.push({
        effectName: input.effectName,
        relation: relationForObservedTarget(preContent, playerId, slot, input),
        playerId,
        slot
      });
    }
  }

  return out;
}

function relationForObservedTarget(
  preContent: any,
  playerId: string,
  slot: Slot,
  input: {
    casterPlayerId: string;
    casterSlot: Slot;
    usedOn: { s: number; i: number } | null;
  }
): "caster" | "casterAlly" | "target" | "targetAlly" | "unclassifiedOther" {
  const targetPlayerId = typeof input.usedOn?.s === "number"
    ? String((preContent.players ?? [])[input.usedOn.s]?.playerId ?? "")
    : "";

  const targetSlot = typeof input.usedOn?.i === "number" ? Number(input.usedOn.i) : null;

  if (playerId === input.casterPlayerId && slot === input.casterSlot) return "caster";
  if (playerId === input.casterPlayerId) return "casterAlly";
  if (playerId === targetPlayerId && slot === targetSlot) return "target";
  if (playerId === targetPlayerId) return "targetAlly";

  return "unclassifiedOther";
}

function isRandomEnemySkill(description: string): boolean {
  return stripReplayTags(description).toLowerCase().includes("random enemy");
}

function extractRandomEnemyDamage(description: string): number | null {
  const text = stripReplayTags(description);
  const match = text.match(/\bdealing +(\d+) +(piercing +|affliction +)?damage +to +a +random +enemy\b/i);

  if (!match) return null;

  return Number(match[1]);
}

function hpDeltasForPlayer(
  preContent: any,
  postContent: any,
  playerId: string
): Array<{ playerId: string; slot: Slot; delta: number }> {
  const prePlayer = findServerPlayerById(preContent, playerId);
  const postPlayer = findServerPlayerById(postContent, playerId);
  const out: Array<{ playerId: string; slot: Slot; delta: number }> = [];

  if (!prePlayer || !postPlayer) return out;

  for (const slot of [0, 1, 2] as Slot[]) {
    const preChar = findServerChar(prePlayer, slot);
    const postChar = findServerChar(postPlayer, slot);

    if (!preChar || !postChar) continue;

    const before = Number(preChar.health);
    const after = Number(postChar.health);
    const delta = after - before;

    if (delta !== 0) {
      out.push({ playerId, slot, delta });
    }
  }

  return out;
}


function effectWasAddedOrChanged(
  preChar: any,
  postChar: any,
  effectName: string,
  sourcePlayerId: string,
  sourceSlot: Slot
): boolean {
  const before = matchingServerEffects(preChar, effectName, sourcePlayerId, sourceSlot).map(serverEffectSignature);
  const after = matchingServerEffects(postChar, effectName, sourcePlayerId, sourceSlot).map(serverEffectSignature);

  if (after.length > before.length) return true;

  const beforeSet = new Set(before);
  return after.some((signature) => !beforeSet.has(signature));
}

function matchingServerEffects(char: any, effectName: string, sourcePlayerId: string, sourceSlot: Slot): any[] {
  return (char.icon ?? []).filter((effect: any) => {
    return (
      String(effect.name) === effectName &&
      String(effect.id ?? "") === sourcePlayerId &&
      Number(effect.self) === Number(sourceSlot)
    );
  });
}

function serverEffectSignature(effect: any): string {
  return JSON.stringify({
    name: String(effect.name ?? ""),
    id: String(effect.id ?? ""),
    self: Number(effect.self),
    stacks: Number(effect.stacks ?? 1),
    effects: (effect.effects ?? []).map((entry: any) => ({
      text: String(entry.text ?? ""),
      duration: String(entry.duration ?? ""),
      isNothing: Boolean(entry.isNothing)
    }))
  });
}

function countServerEffects(char: any, effectName: string, sourcePlayerId: string, sourceSlot: Slot): number {
  return (char.icon ?? []).filter((effect: any) => {
    return (
      String(effect.name) === effectName &&
      String(effect.id ?? "") === sourcePlayerId &&
      Number(effect.self) === Number(sourceSlot)
    );
  }).length;
}

function findServerPlayerById(content: any, playerId: string): any | null {
  return (content.players ?? []).find((player: any) => String(player.playerId) === playerId) ?? null;
}

function findServerChar(player: any, slot: Slot): any | null {
  return player?.team?.[`char${slot}`] ?? null;
}

function stripReplayTags(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}
