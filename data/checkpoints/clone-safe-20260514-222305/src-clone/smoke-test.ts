import {
  createBattle,
  loadCharacters,
  requireTeam,
  spendChakra,
  validateQueue
} from "./core.js";

import { executeTurn } from "./turn-engine.js";
import type { ProtocolQueueItem } from "./types.js";

const db = loadCharacters();

const playerTeam = requireTeam(db, [
  "Uzumaki Naruto (S)",
  "Tsuchikage (S)",
  "Kisame Body Double (S)"
]);

const enemyTeam = requireTeam(db, [
  "Kimimaro",
  "Yakushi Kabuto",
  "Naraka Path Pein (S)"
]);

const battle = createBattle({
  playerAId: "mestsxxx",
  playerBId: "local-opponent",
  playerATeam: playerTeam,
  playerBTeam: enemyTeam,
  chakraA: ["Blood", "Tai", "Gen", "Blood"]
});

const queue: ProtocolQueueItem[] = [
  {
    name: "Kyuubi Boost",
    menu_local: [0, 0, 2],
    usedOn: { s: 0, i: 0 },
    new: true,
    assignedSkill: { char: 0, index: 2 }
  },
  {
    name: "Detachment of Primitive World",
    menu_local: [0, 1, 0],
    usedOn: { s: 1, i: 0 },
    new: true,
    assignedSkill: { char: 1, index: 0 }
  },
  {
    name: "Explosive Water Shock Wave",
    menu_local: [0, 2, 0],
    usedOn: { s: 1, i: 0 },
    new: true,
    assignedSkill: { char: 2, index: 0 }
  }
];

const validation = validateQueue(battle, "mestsxxx", queue);
const spend = spendChakra(battle, "mestsxxx", queue);
const executed = executeTurn(battle, "mestsxxx", queue);

console.log("\n=== CLONE SMOKE TEST ===");
console.log("charactersLoaded:", db.size);
console.log("battleEngine:", battle.engineVersion);
console.log("turn:", battle.turnPlayerId);
console.log("playerChakra:", battle.players[0].chakra.join(","));
console.log("queueItems:", queue.map((item) => item.name).join(" | "));
console.log("validation:", validation.ok ? "ok" : "failed");
if (!validation.ok) console.log("issues:", validation.issues);
console.log("spendOk:", spend.ok);
console.log("totalCost:", spend.totalCost.join("+") || "None");
console.log("removedChakraForRandom:", spend.removedChakra.join(",") || "none");
console.log("remainingChakra:", spend.remainingChakra.join(",") || "none");
console.log("executeOk:", executed.ok);
console.log("nextTurn:", executed.battle.turnPlayerId);
console.log("turnNumber:", executed.battle.turnNumber);
console.log("historyEvents:", executed.battle.history.map((event) => event.event).join(",") || "none");

console.log("\nPLAYER TEAM:");
for (const character of battle.players[0].team) {
  console.log(
    `- ${character.slot} ${character.name} HP=${character.health} skills=${character.skills.length} effects=${character.effects.map((effect) => effect.name).join(",") || "none"}`
  );
}

console.log("\nENEMY TEAM:");
for (const character of battle.players[1].team) {
  console.log(
    `- ${character.slot} ${character.name} HP=${character.health} skills=${character.skills.length} effects=${character.effects.map((effect) => effect.name).join(",") || "none"}`
  );
}

console.log("=== END CLONE SMOKE TEST ===");
