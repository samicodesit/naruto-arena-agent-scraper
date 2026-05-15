import fs from "node:fs";
import path from "node:path";

const inputPath = path.resolve(process.cwd(), "data", "protocol", "current-decision-state.json");
const outputPath = path.resolve(process.cwd(), "data", "protocol", "current-queue-candidates.json");

const state = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const maxCandidates = Number(process.env.MAX_QUEUE_CANDIDATES || 5000);

const actionCandidates = state.actionCandidates || [];
const chakraPool = state.currentPlayer?.chakra || [];

const legalQueues = buildLegalQueues(actionCandidates, chakraPool, maxCandidates);

const output = {
  generatedAt: new Date().toISOString(),
  source: path.relative(process.cwd(), inputPath),
  record: state.record,
  chakra: chakraPool,
  assumptions: [
    "One skill maximum per character per turn.",
    "Combined chakra affordability is checked across the whole queue.",
    "Exact chakra costs are reserved before allocating Random chakra.",
    "removedChakra contains the concrete chakra types spent for Random costs only.",
    "Queue order is deterministic by caster slot for now; tactical queue-order optimization is not implemented yet."
  ],
  queueCandidates: legalQueues
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");

printSummary(output, outputPath, actionCandidates);

function buildLegalQueues(actions, chakra, max) {
  const pass = {
    id: "pass",
    actionCount: 0,
    label: "Pass / no skills",
    queue: [],
    removedChakra: [],
    remainingChakra: [...chakra],
    actions: []
  };

  const byChar = new Map();

  for (const action of actions) {
    const charIndex = action?.caster?.char;
    if (typeof charIndex !== "number") continue;

    if (!byChar.has(charIndex)) byChar.set(charIndex, []);
    byChar.get(charIndex).push(action);
  }

  const charSlots = [...byChar.keys()].sort((a, b) => a - b);
  const candidates = [pass];

  const combos = [];
  buildCombosRecursive(charSlots, byChar, 0, [], combos);

  for (const combo of combos) {
    if (combo.length === 0) continue;

    const allocation = allocateCombinedEnergy(combo, chakra);
    if (!allocation.ok) continue;

    const sortedCombo = [...combo].sort((a, b) => {
      const aChar = a.caster?.char ?? 999;
      const bChar = b.caster?.char ?? 999;
      if (aChar !== bChar) return aChar - bChar;
      return (a.skill?.index ?? 999) - (b.skill?.index ?? 999);
    });

    const actions = sortedCombo.map((a) => ({
      label: a.label,
      caster: a.caster,
      skill: a.skill,
      target: a.target
    }));

    const label = actions.map((a) => a.label).join(" + ");

    candidates.push({
      id: "queue_" + candidates.length,
      actionCount: actions.length,
      label,
      queue: sortedCombo.map((a) => a.queueItem),
      removedChakra: allocation.removedChakra,
      remainingChakra: allocation.remainingChakra,
      actions
    });

    if (candidates.length >= max) break;
  }

  return candidates.sort((a, b) => {
    if (b.actionCount !== a.actionCount) return b.actionCount - a.actionCount;
    return a.label.localeCompare(b.label);
  });
}

function buildCombosRecursive(charSlots, byChar, index, current, out) {
  if (index >= charSlots.length) {
    out.push([...current]);
    return;
  }

  const charSlot = charSlots[index];
  const options = byChar.get(charSlot) || [];

  // Option 1: this character does nothing.
  buildCombosRecursive(charSlots, byChar, index + 1, current, out);

  // Option 2: this character uses exactly one candidate action.
  for (const action of options) {
    current.push(action);
    buildCombosRecursive(charSlots, byChar, index + 1, current, out);
    current.pop();
  }
}

function allocateCombinedEnergy(actions, pool) {
  const remaining = [...pool];
  let randomNeeded = 0;

  for (const action of actions) {
    const energy = action?.skill?.energy || [];

    for (const cost of energy) {
      if (cost === "Random") {
        randomNeeded++;
        continue;
      }

      const idx = remaining.indexOf(cost);
      if (idx === -1) {
        return {
          ok: false,
          reason: "missing_specific_" + cost,
          removedChakra: [],
          remainingChakra: pool
        };
      }

      remaining.splice(idx, 1);
    }
  }

  if (remaining.length < randomNeeded) {
    return {
      ok: false,
      reason: "missing_random",
      removedChakra: [],
      remainingChakra: pool
    };
  }

  const removedChakra = remaining.slice(0, randomNeeded);
  const remainingChakra = remaining.slice(randomNeeded);

  return {
    ok: true,
    removedChakra,
    remainingChakra
  };
}

function printSummary(output, outputPath, actionCandidates) {
  const queues = output.queueCandidates || [];
  const nonPass = queues.filter((q) => q.actionCount > 0);
  const maxActionCount = nonPass.reduce((max, q) => Math.max(max, q.actionCount), 0);

  console.log("");
  console.log("=== QUEUE CANDIDATES SUMMARY FOR CHATGPT===");
  console.log("wrote:", path.relative(process.cwd(), outputPath));
  console.log("record:", output.record?.index ?? "-");
  console.log("turn:", output.record?.turn ?? "-");
  console.log("turnKey:", output.record?.turnKey ?? "-");
  console.log("hakra:", output.chakra.join(", ") || "none");
  console.log("inputActionCandidates:", actionCandidates.length);
  console.log("legalQueueCandidates:", queues.length);
  console.log("maxActionCount:", maxActionCount);

  console.log("");
  console.log("TOP LEGAL QUEUES:");
  for (const q of queues.slice(0, 20)) {
    console.log("- " + q.id + " | actions=" + q.actionCount + " | removedChakra=" + (q.removedChakra.join(",") || "none") + " | remaining=" + (q.remainingChakra.join(",") || "none"));
    console.log("  " + q.label);
  }

  console.log("=== END QUEUE CANDIDATES SUMMARY ===");
}
