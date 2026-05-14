
import fs from "node:fs";
import path from "node:path";

const observationsDir = process.env.OBS_DIR ?? "data/clone/observations";
const outFile = process.env.OUT ?? "data/clone/observed-mechanics.json";

const files = fs
  .readdirSync(observationsDir)
  .filter((file) => file.endsWith(".json"))
  .sort();

const mechanics: Record<string, any> = {};

for (const file of files) {
  const observation = JSON.parse(fs.readFileSync(path.join(observationsDir, file), "utf8"));
  ingestObservation(file, observation);
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: observationsDir,
  files,
  skills: mechanics,
}, null, 2) + "\n");

printSummary();

function skillRecord(name: string): any {
  mechanics[name] ??= {
    skillName: name,
    occurrences: 0,
    files: [],
    observedQueueForms: [],
    effectAdds: [],
    effectRemovals: [],
    hpDeltasInTargetTurns: [],
    hpDeltasOnCaster: [],
    chakraChanges: [],
    notes: [],
  };

  return mechanics[name];
}

function ingestObservation(file: string, observation: any): void {
  const queue = observation.queue ?? [];

  for (const item of queue) {
    const rec = skillRecord(item.name);

    rec.occurrences += 1;
    if (!rec.files.includes(file)) rec.files.push(file);

    rec.observedQueueForms.push({
      file,
      kind: item.kind,
      casterPlayerId: item.casterPlayerId ?? null,
      casterSlot: item.casterSlot ?? null,
      casterName: item.casterName ?? null,
      targetPlayerId: item.targetPlayerId ?? null,
      targetSlot: item.targetSlot ?? null,
      targetName: item.targetName ?? null,
      classes: item.classes ?? [],
      energy: item.energy ?? [],
    });

    ingestEffectAddsForItem(rec, file, item, observation);
    ingestEffectRemovalsForItem(rec, file, item, observation);
    ingestHpForItem(rec, file, item, observation);
    ingestChakraForItem(rec, file, item, observation);
  }
}

function ingestEffectAddsForItem(rec: any, file: string, item: any, observation: any): void {
  for (const effect of observation.effectsAdded ?? []) {
    if (effect.effect !== item.name) continue;

    rec.effectAdds.push({
      file,
      relation: relationToItem(effect, item),
      playerId: effect.playerId,
      slot: effect.slot,
      character: effect.character,
      effect: effect.effect,
      detail: effect.detail,
    });
  }
}

function ingestEffectRemovalsForItem(rec: any, file: string, item: any, observation: any): void {
  for (const effect of observation.effectsRemoved ?? []) {
    if (effect.effect !== item.name) continue;

    rec.effectRemovals.push({
      file,
      relation: relationToItem(effect, item),
      playerId: effect.playerId,
      slot: effect.slot,
      character: effect.character,
      effect: effect.effect,
      detail: effect.detail,
    });
  }
}

function ingestHpForItem(rec: any, file: string, item: any, observation: any): void {
  if (item.kind !== "assigned_skill") return;

  const targetDelta = (observation.hpDeltas ?? []).find((delta: any) => {
    return delta.playerId === item.targetPlayerId && Number(delta.slot) === Number(item.targetSlot);
  });

  if (targetDelta) {
    const sameTargetQueueItems = (observation.queue ?? []).filter((candidate: any) => {
      return candidate.targetPlayerId === item.targetPlayerId && Number(candidate.targetSlot) === Number(item.targetSlot);
    });

    rec.hpDeltasInTargetTurns.push({
      file,
      targetPlayerId: item.targetPlayerId,
      targetSlot: item.targetSlot,
      targetName: item.targetName,
      observedTurnDelta: targetDelta.delta,
      before: targetDelta.before,
      after: targetDelta.after,
      attribution: sameTargetQueueItems.length === 1 ? "clean_single_skill_target" : "ambiguous_multi_skill_same_target",
      sameTargetSkills: sameTargetQueueItems.map((candidate: any) => candidate.name),
    });
  }

  const casterDelta = (observation.hpDeltas ?? []).find((delta: any) => {
    return delta.playerId === item.casterPlayerId && Number(delta.slot) === Number(item.casterSlot);
  });

  if (casterDelta) {
    rec.hpDeltasOnCaster.push({
      file,
      casterPlayerId: item.casterPlayerId,
      casterSlot: item.casterSlot,
      casterName: item.casterName,
      observedTurnDelta: casterDelta.delta,
      before: casterDelta.before,
      after: casterDelta.after,
    });
  }
}

function ingestChakraForItem(rec: any, file: string, item: any, observation: any): void {
  if (item.kind !== "assigned_skill") return;

  const chakra = (observation.chakraChanges ?? []).find((change: any) => change.playerId === item.casterPlayerId);

  if (chakra) {
    rec.chakraChanges.push({
      file,
      playerId: chakra.playerId,
      before: chakra.before,
      after: chakra.after,
    });
  }
}

function relationToItem(effect: any, item: any): string {
  if (item.kind === "encrypted_continuation") return "encrypted_continuation_related";

  if (effect.playerId === item.casterPlayerId && Number(effect.slot) === Number(item.casterSlot)) {
    return "caster";
  }

  if (effect.playerId === item.targetPlayerId && Number(effect.slot) === Number(item.targetSlot)) {
    return "target";
  }

  return "other";
}

function unique(values: any[]): any[] {
  return Array.from(new Set(values.map((value) => JSON.stringify(value)))).map((value) => JSON.parse(value));
}

function printSummary(): void {
  console.log("\n=== OBSERVED MECHANICS SUMMARY ===");
  console.log("files:", files.length);
  console.log("skills:", Object.keys(mechanics).length);
  console.log("wrote:", outFile);

  for (const skillName of Object.keys(mechanics).sort()) {
    const skill = mechanics[skillName];

    const addRelations = unique(skill.effectAdds.map((x: any) => x.relation));
    const removeRelations = unique(skill.effectRemovals.map((x: any) => x.relation));
    const cleanDamage = skill.hpDeltasInTargetTurns.filter((x: any) => x.attribution === "clean_single_skill_target");
    const ambiguousDamage = skill.hpDeltasInTargetTurns.filter((x: any) => x.attribution === "ambiguous_multi_skill_same_target");
    const casterDamage = skill.hpDeltasOnCaster;

    console.log(`\n${skillName}`);
    console.log(`  occurrences: ${skill.occurrences}`);
    console.log(`  effectAdds: ${addRelations.length ? addRelations.join(", ") : "none"}`);
    console.log(`  effectRemovals: ${removeRelations.length ? removeRelations.join(", ") : "none"}`);
    console.log(`  cleanTargetHpDeltas: ${cleanDamage.map((x: any) => x.observedTurnDelta).join(", ") || "none"}`);
    console.log(`  ambiguousTargetHpDeltas: ${ambiguousDamage.map((x: any) => x.observedTurnDelta).join(", ") || "none"}`);
    console.log(`  casterHpDeltas: ${casterDamage.map((x: any) => x.observedTurnDelta).join(", ") || "none"}`);
  }

  console.log("\n=== END OBSERVED MECHANICS SUMMARY ===");
}
