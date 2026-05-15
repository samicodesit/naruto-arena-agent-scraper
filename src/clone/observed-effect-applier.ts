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
  relation: "caster" | "casterAlly" | "target" | "targetAlly" | string;
  effectName: string;
  durationTexts: Array<{ text: string; duration: string }>;
  stacks: number | null;
};

type ObservedSkillRule = {
  skillName: string;
  addEffects?: ObservedEffectRule[];
  removeEffects?: unknown[];
};

type ObservedRulesFile = {
  skills: Record<string, ObservedSkillRule>;
};

type Destination = {
  player: ClonePlayerState | null;
  character: CloneCharacterState;
};

type ReplayEffectTargetOverride = {
  effectName: string;
  relation: "caster" | "casterAlly" | "target" | "targetAlly" | string;
  playerId: string;
  slot: Slot;
};

let cachedRules: ObservedRulesFile | null = null;
let cachedRulesFile: string | null = null;

export function applyObservedEffectRules(input: {
  battle: CloneBattleState;
  playerId: string;
  caster: CloneCharacterState;
  casterSlot: Slot;
  skill: CloneSkillState;
  target: TargetRef | null;
  effectTargetOverrides?: ReplayEffectTargetOverride[];
}): string[] {
  const rules = loadObservedRules();
  const skillRule = rules.skills[input.skill.name];

  if (!skillRule?.addEffects?.length) return [];

  const applied: string[] = [];

  for (const addRule of skillRule.addEffects) {
    const destinations = resolveDestinations(addRule, input, skillRule);

    for (const destination of destinations) {
      if (shouldSkipObservedEffect(input, addRule, destination)) continue;

      const effect = makeEffect({
        rule: addRule,
        playerId: input.playerId,
        casterSlot: input.casterSlot,
        skillName: input.skill.name,
        battleTurnNumber: input.battle.turnNumber,
        relation: addRule.relation
      });

      addOrReplaceEffect(destination.character, effect);
      applied.push(`${addRule.relation}:${addRule.effectName}:${destination.character.slot}`);

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
  }

  return applied;
}

function loadObservedRules(): ObservedRulesFile {
  const file = path.resolve(
    process.cwd(),
    process.env.OBSERVED_EFFECT_RULES_FILE ?? "data/clone/observed-effect-rules.json"
  );

  if (cachedRules && cachedRulesFile === file) return cachedRules;

  cachedRules = JSON.parse(fs.readFileSync(file, "utf8"));
  cachedRulesFile = file;

  return cachedRules!;
}

function resolveDestinations(
  rule: ObservedEffectRule,
  input: {
    battle: CloneBattleState;
    playerId: string;
    caster: CloneCharacterState;
    casterSlot: Slot;
    skill: CloneSkillState;
    target: TargetRef | null;
    effectTargetOverrides?: ReplayEffectTargetOverride[];
  },
  skillRule: ObservedSkillRule
): Destination[] {
  const overrideDestinations = resolveReplayEffectTargetOverrides(rule, input);
  if (overrideDestinations.length) return overrideDestinations;

  const casterPlayer = input.battle.players.find((player) => player.playerId === input.playerId) ?? null;

  if (rule.relation === "caster") {
    return [{ player: casterPlayer, character: input.caster }];
  }

  if (rule.relation === "target") {
    if (!input.target) return [];
    return [{ player: input.target.player, character: input.target.character }];
  }

  if (rule.relation === "casterAlly") {
    if (!casterPlayer) return [];

    if (!hasCompanionRule(skillRule, rule, "caster")) {
      return [];
    }

    return casterPlayer.team
      .filter((character) => character.slot !== input.casterSlot)
      .map((character) => ({ player: casterPlayer, character }));
  }

  if (rule.relation === "targetAlly") {
    if (!input.target) return [];

    if (!hasCompanionRule(skillRule, rule, "target")) {
      return [];
    }

    return input.target.player.team
      .filter((character) => character.slot !== input.target!.slot)
      .map((character) => ({ player: input.target!.player, character }));
  }

  return [];
}

function resolveReplayEffectTargetOverrides(
  rule: ObservedEffectRule,
  input: {
    battle: CloneBattleState;
    effectTargetOverrides?: ReplayEffectTargetOverride[];
  }
): Destination[] {
  const overrides = input.effectTargetOverrides ?? [];

  return overrides
    .filter((override) => {
      return override.effectName === rule.effectName && override.relation === rule.relation;
    })
    .map((override) => {
      const player = input.battle.players.find((candidate) => candidate.playerId === override.playerId) ?? null;
      const character = player?.team[override.slot] ?? null;

      if (!player || !character) return null;

      return { player, character };
    })
    .filter((destination): destination is Destination => destination !== null);
}

function hasCompanionRule(
  skillRule: ObservedSkillRule,
  rule: ObservedEffectRule,
  companionRelation: string
): boolean {
  return (skillRule.addEffects ?? []).some((candidate) => {
    return (
      candidate !== rule &&
      candidate.relation === companionRelation &&
      candidate.effectName === rule.effectName
    );
  });
}

function shouldSkipObservedEffect(
  input: {
    skill: CloneSkillState;
    caster: CloneCharacterState;
  },
  addRule: ObservedEffectRule,
  destination: Destination
): boolean {
  if (destination.character.health <= 0) {
    // OBSERVED_TARGET_GUARD_NO_DEAD_TARGET_EFFECTS
    return true;
  }

  if (
    input.skill.name === "Oodama Rasengan" &&
    addRule.relation === "target" &&
    !input.caster.effects.some((effect) => effect.name === "Kyuubi Boost")
  ) {
    // OBSERVED_TARGET_GUARD_OODAMA_REQUIRES_KYUUBI
    return true;
  }

  return false;
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
