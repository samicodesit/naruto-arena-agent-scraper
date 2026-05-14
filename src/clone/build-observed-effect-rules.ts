
import fs from "node:fs";
import path from "node:path";

const mechanicsFile = process.env.MECHANICS ?? "data/clone/observed-mechanics.json";
const outFile = process.env.OUT ?? "data/clone/observed-effect-rules.json";

const mechanics = JSON.parse(fs.readFileSync(mechanicsFile, "utf8"));
const skills = mechanics.skills ?? {};

const rules: Record<string, any> = {};

for (const [skillName, skill] of Object.entries<any>(skills)) {
  const effectAdds = skill.effectAdds ?? [];
  const effectRemovals = skill.effectRemovals ?? [];

  const addRules = buildAddRules(effectAdds);
  const removalRules = buildRemovalRules(effectRemovals);

  if (!addRules.length && !removalRules.length) continue;

  rules[skillName] = {
    skillName,
    observedOccurrences: skill.occurrences ?? 0,
    files: skill.files ?? [],
    addEffects: addRules,
    removeEffects: removalRules,
  };
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({
  generatedAt: new Date().toISOString(),
  sourceMechanicsFile: mechanicsFile,
  skillCount: Object.keys(rules).length,
  skills: rules,
}, null, 2) + "\n");

printSummary();

function buildAddRules(effectAdds: any[]): any[] {
  const byRelation = new Map<string, any[]>();

  for (const add of effectAdds) {
    if (!add.detail) continue;
    const relation = String(add.relation ?? "unknown");
    if (!byRelation.has(relation)) byRelation.set(relation, []);
    byRelation.get(relation)!.push(add);
  }

  const out: any[] = [];

  for (const [relation, adds] of byRelation.entries()) {
    const representative = chooseRepresentative(adds);

    out.push({
      relation,
      effectName: representative.effect,
      sourcePlayerIdFromServer: representative.detail.sourcePlayerId ?? null,
      sourceSlotFromServer: representative.detail.sourceSlot ?? null,
      durationTexts: representative.detail.durationTexts ?? [],
      stacks: representative.detail.stacks ?? null,
      observedInFiles: unique(adds.map((x) => x.file)),
      observedOn: unique(adds.map((x) => ({
        playerId: x.playerId,
        slot: x.slot,
        character: x.character,
      }))),
    });
  }

  return out.sort((a, b) => a.relation.localeCompare(b.relation));
}

function buildRemovalRules(effectRemovals: any[]): any[] {
  const byRelation = new Map<string, any[]>();

  for (const removal of effectRemovals) {
    const relation = String(removal.relation ?? "unknown");
    if (!byRelation.has(relation)) byRelation.set(relation, []);
    byRelation.get(relation)!.push(removal);
  }

  const out: any[] = [];

  for (const [relation, removals] of byRelation.entries()) {
    const representative = removals[0];

    out.push({
      relation,
      effectName: representative.effect,
      observedInFiles: unique(removals.map((x) => x.file)),
      observedOn: unique(removals.map((x) => ({
        playerId: x.playerId,
        slot: x.slot,
        character: x.character,
      }))),
    });
  }

  return out.sort((a, b) => a.relation.localeCompare(b.relation));
}

function chooseRepresentative(items: any[]): any {
  // Prefer the item with the most detailed server effect text.
  return [...items].sort((a, b) => {
    const aLen = JSON.stringify(a.detail?.durationTexts ?? []).length;
    const bLen = JSON.stringify(b.detail?.durationTexts ?? []).length;
    return bLen - aLen;
  })[0];
}

function unique(values: any[]): any[] {
  return Array.from(new Set(values.map((value) => JSON.stringify(value)))).map((value) => JSON.parse(value));
}

function printSummary(): void {
  console.log("\n=== OBSERVED EFFECT RULES SUMMARY ===");
  console.log("source:", mechanicsFile);
  console.log("wrote:", outFile);
  console.log("skillRules:", Object.keys(rules).length);

  for (const skillName of Object.keys(rules).sort()) {
    const rule = rules[skillName];

    console.log(`\n${skillName}`);
    console.log(`  addEffects: ${rule.addEffects.map((x: any) => `${x.relation}:${x.effectName}`).join(", ") || "none"}`);
    console.log(`  removeEffects: ${rule.removeEffects.map((x: any) => `${x.relation}:${x.effectName}`).join(", ") || "none"}`);

    for (const add of rule.addEffects) {
      const text = (add.durationTexts ?? []).map((x: any) => `${x.text} (${x.duration})`).join(" | ");
      console.log(`    + ${add.relation}: ${text || "no detail"}`);
    }
  }

  console.log("\n=== END OBSERVED EFFECT RULES SUMMARY ===");
}
