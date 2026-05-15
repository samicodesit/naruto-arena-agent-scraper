import type {
  CloneBattleState,
  CloneCharacterState,
  CloneEffect,
  ClonePlayerState,
  CloneSkillState,
  ProtocolQueueItem,
  Slot
} from "./types.js";
import { damageCharacter, getOpponent, getPlayer, grantDestructibleDefense } from "./turn-engine.js";
import { applyObservedEffectRules } from "./observed-effect-applier.js";

export type ResolveSkillResult = {
  ok: boolean;
  skillName: string;
  notes: string[];
};

export function resolveQueueSkills(
  battle: CloneBattleState,
  playerId: string,
  queue: ProtocolQueueItem[]): ResolveSkillResult[] {
  const results: ResolveSkillResult[] = [];

  for (const item of queue) {
    results.push(resolveQueueSkill(battle, playerId, item));
  }

  return results;
}

export function resolveQueueSkill(
  battle: CloneBattleState,
  playerId: string,
  item: ProtocolQueueItem
): ResolveSkillResult {
  const notes: string[] = [];
  const player = getPlayer(battle, playerId);
  const assigned = item.assignedSkill;

  if (!assigned) {
    if ((item as any).encryptItem) {
      return resolveEncryptedContinuationEffect(battle, playerId, item);
    }

    return { ok: false, skillName: item.name, notes: ["opaque_or_encrypted_skill"] };
  }

  const caster = player.team[assigned.char];
  const skill = caster?.skills[assigned.index];

  if (!caster || !skill) {
    return { ok: false, skillName: item.name, notes: ["invalid_caster_or_skill"] };
  }

  if (item.new) { applyReactiveNewSkillEffects(battle, playerId, caster, assigned.char as Slot, skill); } const description = skill.description ?? "";
  const delayedDamage = extractDelayedDamage(description);

  if (delayedDamage !== null) {
    const target = resolveTarget(battle, playerId, item);

    if (!target) {
      return { ok: false, skillName: skill.name, notes: ["delayed_target_not_resolved"] };
    }

    target.character.effects.push({
      id: `${playerId}:${assigned.char}:${skill.name}:${battle.turnNumber}`,
      name: skill.name,
      sourcePlayerId: playerId,
      sourceSlot: assigned.char as Slot,
      durationTurns: 1,
      durationLabel: "1 TURN LEFT",
      text: [`DELAYED_DAMAGE:${delayedDamage.amount}:${delayedDamage.type}`],
      stacks: 1,
      tags: ["DelayedDamage"]
    });

      if (createsDelayedSelfProtection(description)) {
        caster.effects.push({
          id: `${playerId}:${assigned.char}:${skill.name}:self-protection:${battle.turnNumber}`,
          name: skill.name,
          sourcePlayerId: playerId,
          sourceSlot: assigned.char as Slot,
          durationTurns: 1,
          durationLabel: "END THIS TURN",
          text: ["THIS CHARACTER WILL IGNORE ALL HARMFUL EFFECTS."],
          stacks: 1,
          tags: ["DelayedSelfProtection"]
        });

        battle.history.push({
          turnNumber: battle.turnNumber,
          playerId,
          event: "delayedSelfProtectionCreated",
          payload: {
            casterSlot: assigned.char,
            casterName: caster.name,
            skillIndex: assigned.index,
            skillName: skill.name
          }
        });
      }

    battle.history.push({
      turnNumber: battle.turnNumber,
      playerId,
      event: "effectCreated",
      payload: {
        casterSlot: assigned.char,
        casterName: caster.name,
        skillIndex: assigned.index,
        skillName: skill.name,
        targetPlayerId: target.player.playerId,
        targetSlot: target.slot,
        targetName: target.character.name,
        delayedDamage: delayedDamage.amount,
        damageType: delayedDamage.type
      }
    });

    return { ok: true, skillName: skill.name, notes: [`created_delayed_${delayedDamage.amount}_damage_effect`] };
  }

  const damage = extractFixedDamage(description);
  const selfHealthLoss = extractSelfHealthLoss(description);

  if (damage === null && selfHealthLoss !== null) {
    if (characterIgnoresHarmfulEffects(caster)) {
      battle.history.push({
        turnNumber: battle.turnNumber,
        playerId,
        event: "selfDamageIgnored",
        payload: {
          casterSlot: assigned.char,
          casterName: caster.name,
          skillIndex: assigned.index,
          skillName: skill.name,
          ignoredDamage: selfHealthLoss.amount,
          reason: "ignore_harmful_effects"
        }
      });

      return { ok: true, skillName: skill.name, notes: [`ignored_${selfHealthLoss.amount}_self_damage`] };
    }

    damageCharacter(battle, player.playerId, assigned.char as Slot, selfHealthLoss.amount, skill.name);

    battle.history.push({
      turnNumber: battle.turnNumber,
      playerId,
      event: "skillResolved",
      payload: {
        casterSlot: assigned.char,
        casterName: caster.name,
        skillIndex: assigned.index,
        skillName: skill.name,
        targetPlayerId: player.playerId,
        targetSlot: assigned.char,
        targetName: caster.name,
        damage: selfHealthLoss.amount,
        damageType: "self_health_loss"
      }
    });


      applyObservedEffectRules({
        battle,
        playerId,
        caster,
        casterSlot: assigned.char as Slot,
        skill,
        target: null,
        effectTargetOverrides: item.replayEffectTargetOverrides ?? []
      });
      // OBSERVED_EFFECTS_SELF_HEALTH_LOSS_ONLY

    return { ok: true, skillName: skill.name, notes: [`applied_${selfHealthLoss.amount}_self_health_loss`] };
  }

  if (damage === null) {
      const noDamageTarget = resolveTarget(battle, playerId, item);

      applyObservedEffectRules({
        battle,
        playerId,
        caster,
        casterSlot: assigned.char as Slot,
        skill,
        target: noDamageTarget,
        effectTargetOverrides: item.replayEffectTargetOverrides ?? []
      });
      // OBSERVED_EFFECTS_NO_DAMAGE

    battle.history.push({
      turnNumber: battle.turnNumber,
      playerId,
      event: "skillNotResolved",
      payload: {
        casterSlot: assigned.char,
        casterName: caster.name,
        skillIndex: assigned.index,
        skillName: skill.name,
        reason: "no_fixed_damage_detected"
      }
    });

    return { ok: true, skillName: skill.name, notes: ["no_fixed_damage_detected"] };
  }

  const target = resolveTarget(battle, playerId, item);

  if (!target) {
    return { ok: false, skillName: skill.name, notes: ["target_not_resolved"] };
  }

  const damageTargets = resolveDamageTargets(battle, playerId, item, skill.name, target);

  for (const damageTarget of damageTargets) {
    damageCharacter(battle, damageTarget.player.playerId, damageTarget.slot, damage.amount, skill.name);
  }

    applyObservedEffectRules({
      battle,
      playerId,
      caster,
      casterSlot: assigned.char as Slot,
      skill,
      target,
      effectTargetOverrides: item.replayEffectTargetOverrides ?? []
    });
    // OBSERVED_EFFECTS_DIRECT_DAMAGE

    if (skill.name === "Oodama Rasengan" && hasKyuubiRageStacks(caster, 3)) {
      const beforeEffects = caster.effects.length;
      caster.effects = caster.effects.filter((effect) => effect.name !== "Kyuubi Boost");

      if (caster.effects.length !== beforeEffects) {
        battle.history.push({
          turnNumber: battle.turnNumber,
          playerId,
          event: "effectRemoved",
          payload: {
            reason: "oodama_consumes_kyuubi_boost_at_3_rage_stacks",
            casterSlot: assigned.char,
            casterName: caster.name,
            effectName: "Kyuubi Boost"
          }
        });
      }
    }
    // OBSERVED_OODAMA_REMOVES_KYUUBI_BOOST_AT_3_RAGE_STACKS



    applyKnownPostSkillEffects(battle, playerId, caster, assigned.char as Slot, skill, target);

  if (selfHealthLoss !== null) {
    if (characterIgnoresHarmfulEffects(caster)) {
      battle.history.push({
        turnNumber: battle.turnNumber,
        playerId,
        event: "selfDamageIgnored",
        payload: {
          casterSlot: assigned.char,
          casterName: caster.name,
          skillIndex: assigned.index,
          skillName: skill.name,
          ignoredDamage: selfHealthLoss.amount,
          reason: "ignore_harmful_effects"
        }
      });
    } else {
      damageCharacter(battle, player.playerId, assigned.char as Slot, selfHealthLoss.amount, skill.name);
    }
  }

  battle.history.push({
    turnNumber: battle.turnNumber,
    playerId,
    event: "skillResolved",
    payload: {
      casterSlot: assigned.char,
      casterName: caster.name,
      skillIndex: assigned.index,
      skillName: skill.name,
      targetPlayerId: target.player.playerId,
      targetSlot: target.slot,
      targetName: target.character.name,
      damage: damage.amount,
      damageType: damage.type
    }
  });

  return { ok: true, skillName: skill.name, notes: [`applied_${damage.amount}_damage`] };
}


function applyReactiveNewSkillEffects(
  battle: CloneBattleState,
  playerId: string,
  caster: CloneCharacterState,
  casterSlot: Slot,
  skill: CloneSkillState
): void {
  grantHashiramaTeamDefenseIfObserved(battle, playerId, caster);
  applyObservedSelfDamageOnNewSkill(battle, playerId, caster, casterSlot, skill);
}

function grantHashiramaTeamDefenseIfObserved(
  battle: CloneBattleState,
  playerId: string,
  caster: CloneCharacterState
): void {
  const amount = extractHashiramaTeamDefenseAmount(caster);
  if (amount === null) return;

  const player = getPlayer(battle, playerId);
  for (const ally of player.team) {
    grantDestructibleDefense(ally, amount, "Birth of the Trees");
  }
}

function extractHashiramaTeamDefenseAmount(caster: CloneCharacterState): number | null {
  for (const effect of caster.effects) {
    for (const line of effect.text) {
      const match = String(line).match(/\bIF +HASHIRAMA +USES +A +NEW +SKILL,? +HIS +TEAM +WILL +GAIN +(\d+) +POINTS? +OF +DESTRUCTIBLE +DEFENSE\b/i);
      if (match) return Number(match[1]);
    }
  }
  return null;
}

function applyObservedSelfDamageOnNewSkill(
  battle: CloneBattleState,
  playerId: string,
  caster: CloneCharacterState,
  casterSlot: Slot,
  skill: CloneSkillState
): void {
  for (const effect of caster.effects) {
    for (const line of effect.text) {
      const match = String(line).match(/\bIF +THIS +CHARACTER +USES +A +NEW +SKILL +THEY +WILL +TAKE +(\d+) +(PIERCING +|AFFLICTION +)?DAMAGE\b/i);
      if (!match) continue;

      damageCharacter(battle, playerId, casterSlot, Number(match[1]), effect.name);
      return;
    }
  }
}

function resolveEncryptedContinuationEffect(
  battle: CloneBattleState,
  playerId: string,
  item: ProtocolQueueItem
): ResolveSkillResult {
  for (const player of battle.players) {
    for (const character of player.team) {
      for (const effect of [...character.effects]) {
        if (effect.name !== item.name) continue;
        if (effect.sourcePlayerId !== playerId) continue;

        const text = effect.text.join(" ");
        const damage = extractEffectDamage(text);

        if (!damage) continue;

        damageCharacter(battle, player.playerId, character.slot, damage.amount, item.name);

        character.effects = character.effects.filter((candidate) => candidate !== effect);

        battle.history.push({
          turnNumber: battle.turnNumber,
          playerId,
          event: "continuationEffectResolved",
          payload: {
            skillName: item.name,
            targetPlayerId: player.playerId,
            targetSlot: character.slot,
            targetName: character.name,
            damage: damage.amount,
            damageType: damage.type
          }
        });

        return {
          ok: true,
          skillName: item.name,
          notes: [`resolved_encrypted_continuation_${damage.amount}_${damage.type}_damage`]
        };
      }
    }
  }

  battle.history.push({
    turnNumber: battle.turnNumber,
    playerId,
    event: "continuationEffectNotFound",
    payload: {
      skillName: item.name
    }
  });

  return { ok: true, skillName: item.name, notes: ["encrypted_continuation_effect_not_found"] };
}


function expireSourceContinuationEffect(
  battle: CloneBattleState,
  sourcePlayerId: string,
  skillName: string
): void {
  for (const player of battle.players) {
    for (const character of player.team) {
      const before = character.effects.length;

      character.effects = character.effects.filter((effect) => {
        return !(effect.name === skillName && effect.sourcePlayerId === sourcePlayerId);
      });

      if (character.effects.length !== before) {
        battle.history.push({
          turnNumber: battle.turnNumber,
          playerId: sourcePlayerId,
          event: "sourceContinuationEffectExpired",
          payload: {
            skillName,
            affectedPlayerId: player.playerId,
            affectedSlot: character.slot,
            affectedName: character.name
          }
        });
      }
    }
  }
}

function applyKnownPostSkillEffects(
  battle: CloneBattleState,
  playerId: string,
  caster: CloneCharacterState,
  casterSlot: Slot,
  skill: CloneSkillState,
  target: { player: ClonePlayerState; character: CloneCharacterState; slot: Slot }
): void {
  if (skill.name !== "Detachment of Primitive World") return;

  addOrReplaceEffect(target.character, {
    id: `${playerId}:${casterSlot}:${skill.name}:target:${target.player.playerId}:${target.slot}:${battle.turnNumber}`,
    name: skill.name,
    sourcePlayerId: playerId,
    sourceSlot: casterSlot,
    durationTurns: 1,
    durationLabel: "1 TURN LEFT",
    text: [
      "THIS CHARACTER'S HARMFUL SKILLS ARE STUNNED.",
      "THIS CHARACTER IS INVULNERABLE TO HELPFUL SKILLS."
    ],
    stacks: 1,
    tags: ["KnownSkillEffect", "TargetDebuff"]
  });

  addOrReplaceEffect(caster, {
    id: `${playerId}:${casterSlot}:${skill.name}:self:${battle.turnNumber}`,
    name: skill.name,
    sourcePlayerId: playerId,
    sourceSlot: casterSlot,
    durationTurns: 1,
    durationLabel: "1 TURN LEFT",
    text: ["THIS SKILL WILL BE REPLACED BY 'DUST IMPLODE'."],
    stacks: 1,
    tags: ["KnownSkillEffect", "SkillReplacement"]
  });

  battle.history.push({
    turnNumber: battle.turnNumber,
    playerId,
    event: "knownEffectsCreated",
    payload: {
      skillName: skill.name,
      casterSlot,
      casterName: caster.name,
      targetPlayerId: target.player.playerId,
      targetSlot: target.slot,
      targetName: target.character.name,
      effects: ["target_harmful_stun", "caster_skill_replacement"]
    }
  });
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


function extractEffectDamage(text: string): { amount: number; type: "normal" | "piercing" | "affliction" } | null {
  const match = text.match(/\bTAKE +(\d+) +(PIERCING|AFFLICTION)? *DAMAGE\b/i);

  if (!match) return null;

  const amount = Number(match[1]);
  const typeText = (match[2] ?? "").toLowerCase();

  const type = typeText.includes("piercing")
    ? "piercing"
    : typeText.includes("affliction")
      ? "affliction"
      : "normal";

  return { amount, type };
}

function resolveDamageTargets(
  battle: CloneBattleState,
  playerId: string,
  item: ProtocolQueueItem,
  skillName: string,
  resolvedTarget: { player: ClonePlayerState; character: CloneCharacterState; slot: Slot }
): Array<{ player: ClonePlayerState; character: CloneCharacterState; slot: Slot }> {
  if (!isObservedAllEnemiesDamageSkill(skillName)) {
    return [resolvedTarget];
  }

  const opponent = getOpponent(battle, playerId);

  return opponent.team.map((character) => ({
    player: opponent,
    character,
    slot: character.slot
  }));
}

function isObservedAllEnemiesDamageSkill(skillName: string): boolean {
  // Verified from server output in 2026-05-14T21-34-39-137Z:
  // 0016_requestEndTurn.json -> 0017_passTurn.json
  // Branch Manipulation dealt 10 affliction damage to all 3 enemies.
  return skillName === "Branch Manipulation";
}

function resolveTarget(
  battle: CloneBattleState,
  playerId: string,
  item: ProtocolQueueItem
): { player: ClonePlayerState; character: CloneCharacterState; slot: Slot } | null {
  const replayTargetOverride = item.replayTargetOverride;

  if (replayTargetOverride) {
    const overridePlayer = battle.players.find((player) => player.playerId === replayTargetOverride.playerId);
    const overrideSlot = replayTargetOverride.slot;
    const overrideCharacter = overridePlayer?.team[overrideSlot];

    if (overridePlayer && overrideCharacter) {
      return {
        player: overridePlayer,
        character: overrideCharacter,
        slot: overrideSlot
      };
    }
  }

  if (!item.usedOn) return null;

  const casterPlayer = getPlayer(battle, playerId);
  const opponent = getOpponent(battle, playerId);
  const targetPlayer = item.usedOn.s === casterPlayer.side ? casterPlayer : opponent;

  const slot = item.usedOn.i as Slot;
  const character = targetPlayer.team[slot];

  if (!character) return null;

  return { player: targetPlayer, character, slot };
}


function createsDelayedSelfProtection(description: string): boolean {
  const text = stripTags(description).toUpperCase();

  return (
    text.includes("DURING THIS TIME") &&
    text.includes("IGNORE") &&
    text.includes("HARMFUL EFFECTS")
  );
}

function characterIgnoresHarmfulEffects(character: CloneCharacterState): boolean {
  return character.effects.some((effect) =>
    effect.text.some((line) => line.toUpperCase().includes("IGNORE ALL HARMFUL EFFECTS"))
  );
}

function extractDelayedDamage(description: string): { amount: number; type: "normal" | "piercing" | "affliction" } | null {
  const text = stripTags(description);

  const match = text.match(/\bthe following turn[^.]*?\b(?:deals?|deal|dealing) +(\d+) +(piercing +|affliction +)?damage\b/i);

  if (!match) return null;

  const amount = Number(match[1]);
  const typeText = (match[2] ?? "").toLowerCase();

  const type = typeText.includes("piercing")
    ? "piercing"
    : typeText.includes("affliction")
      ? "affliction"
      : "normal";

  return { amount, type };
}

function extractFixedDamage(description: string): { amount: number; type: "normal" | "piercing" | "affliction" } | null {
  const text = stripTags(description);

  const match =
    text.match(/\b(?:deals?|dealing) +(\d+) +(piercing +|affliction +)?damage\b/i) ??
    text.match(/\b(?:the enemy|enemy|one enemy|target|that enemy|this enemy) +takes? +(\d+) +(piercing +|affliction +)?damage\b/i);

  if (!match) return null;

  const amount = Number(match[1]);
  const typeText = (match[2] ?? "").toLowerCase();

  const type = typeText.includes("piercing")
    ? "piercing"
    : typeText.includes("affliction")
      ? "affliction"
      : "normal";

  return { amount, type };
}

function extractSelfHealthLoss(description: string): { amount: number } | null {
  const text = stripTags(description);

  const losesHealth = text.match(/\bloses? +(\d+) +health\b/i);
  if (losesHealth) return { amount: Number(losesHealth[1]) };

  const afterwardsSelfDamage = text.match(/\bafterwards,? +[^.]*?\btakes? +(\d+) +(piercing|affliction) +damage\b/i);
  if (afterwardsSelfDamage) return { amount: Number(afterwardsSelfDamage[1]) };

  return null;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}


function hasKyuubiRageStacks(character: CloneCharacterState, stacks: number): boolean {
  const needle = `NARUTO HAS ${stacks} KYUUBI RAGE STACK`;

  return character.effects.some((effect) => {
    return (
      effect.name === "Passive: Three Tails Release" &&
      effect.text.some((line) => line.toUpperCase().includes(needle))
    );
  });
}
