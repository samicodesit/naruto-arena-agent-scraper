import fs from "node:fs";
import path from "node:path";
import type {
  CloneBattleState,
  CloneCharacterState,
  CloneEffect,
  ClonePlayerState,
  CloneSkillState,
  Slot
} from "./types.js";

type TargetRef = {
  player: ClonePlayerState;
  character: CloneCharacterState;
  slot: Slot;
};

type ObservedEffectRule = {
  relation: "caster" | "target" | string;
  effectName: string;
  durationTexts: Array<{ text: string; duration: string }>;
  stacks: number | null;
};

type ObservedRulesFile = {
  skills: Record<
    string,
    {
      skillName: string;
      addEffects?: ObservedEffectRule[];
      removeEffects?: unknown[];
    }
  >;
};

let cachedRules: ObservedRulesFile | null = null;

export function applyObservedEffectRules(input: {
  battle: CloneBattleState;
  playerId: string;
  caster: CloneCharacterState;
  casterSlot: Slot;
  skill: CloneSkillState;
  target: TargetRef | null;
}): string[] {
  const rules = loadObservedRules();
  const skillRule = rules.skills[input.skill.name];

  if (!skillRule?.addEffects?.length) return [];

  const applied: string[] = [];

  for (const addRule of skillRule.addEffects) {
    const destination = resolveDestination(addRule, input.caster, input.target);
    if (!destination) continue;

    const effect = makeEffect({
      rule: addRule,
      playerId: input.playerId,
      casterSlot: input.casterSlot,
      skillName: input.skill.name,
      battleTurnNumber: input.battle.turnNumber,
      relation: addRule.relation
    });

    addOrReplaceEffect(destination.character, effect);
    applied.push(`${addRule.relation}:${addRule.effectName}`);

    input.battle.history.push({
      turnNumber: input.battle.turnNumber,
      playerId: input.playerId,
      event: "observedEffectApplied",
      payload: {
        skillName: input.skill.name,
        relation: addRule.relation,
        effectName: addRule.effectName,
        affectedPlayerId: destination.player?.playerId ?? null,
        affectedSlot: destination.character.slot,
        affectedName: destination.character.name
      }
    });
  }

  return applied;
}

function loadObservedRules(): ObservedRulesFile {
  if (cachedRules) return cachedRules;

  const file = path.resolve(process.cwd(), "data/clone/observed-effect-rules.json");
  cachedRules = JSON.parse(fs.readFileSync(file, "utf8"));

  return cachedRules!;
}

function resolveDestination(
  rule: ObservedEffectRule,
  caster: CloneCharacterState,
  target: TargetRef | null
): { player: ClonePlayerState | null; character: CloneCharacterState } | null {
  if (rule.relation === "caster") {
    return { player: null, character: caster };
  }

  if (rule.relation === "target") {
    if (!target) return null;
    return { player: target.player, character: target.character };
  }

  return null;
}

function makeEffect(input: {
  rule: ObservedEffectRule;
  playerId: string;
  casterSlot: Slot;
  skillName: string;
  battleTurnNumber: number;
  relation: string;
}): CloneEffect {
  const durationTexts = input.rule.durationTexts ?? [];
  const firstDuration = durationTexts[0]?.duration ?? "unknown";

  return {
    id: `${input.playerId}:${input.casterSlot}:${input.skillName}:${input.relation}:${input.battleTurnNumber}`,
    name: input.rule.effectName,
    sourcePlayerId: input.playerId,
    sourceSlot: input.casterSlot,
    durationTurns: null,
    durationLabel: firstDuration,
    text: durationTexts.map((entry) => entry.text),
    textDurations: durationTexts.map((entry) => entry.duration),
    stacks: input.rule.stacks ?? 1,
    tags: ["ObservedEffectRule", input.relation]
  };
}

function addOrReplaceEffect(character: CloneCharacterState, effect: CloneEffect): void {
  character.effects = character.effects.filter((candidate) => {
    return !(
      candidate.name === effect.name &&
      candidate.sourcePlayerId === effect.sourcePlayerId &&
      candidate.sourceSlot === effect.sourceSlot
    );
  });

  character.effects.push(effect);
}
