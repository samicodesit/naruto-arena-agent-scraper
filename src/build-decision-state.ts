import fs from "node:fs";
import path from "node:path";

const inputPath = path.resolve(process.cwd(), "data", "protocol", "battle-states.json");
const outputPath = path.resolve(process.cwd(), "data", "protocol", "current-decision-state.json");

const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const records = data.records || [];
const requestedIndex = process.argv[2];

const record = requestedIndex
  ? records.find((r) => String(r.index) === String(requestedIndex))
  : [...records].reverse().find(hasLiveSkills);

if (!record) {
  console.error("No battle record with live skills found.");
  process.exit(1);
}

const players = record.players || [];
const currentPlayer = players.find((p) => p.playerId === record.turn) || players[0] || null;
const opponent = players.find((p) => currentPlayer && p.playerId !== currentPlayer.playerId) || null;

if (!currentPlayer) {
  console.error("Selected record has no current player.");
  process.exit(1);
}

const decisionState = {
  generatedAt: new Date().toISOString(),
  source: path.relative(process.cwd(), inputPath),
  record: {
    index: record.index,
    capturedAt: record.capturedAt,
    requestAction: record.requestAction,
    responseAction: record.responseAction,
    turn: record.turn,
    turnKey: record.turnKey ?? null,
    result: record.result ?? null,
    gameType: record.gameType ?? null
  },
  targetLegend: {
    "00": "own char0",
    "01": "own char1",
    "02": "own char2",
    "10": "enemy char0",
    "11": "enemy char1",
    "12": "enemy char2",
    value: "[clickableOrValid, affectedOrHighlighted] — current working interpretation"
  },
  currentPlayer: buildPlayer(currentPlayer, currentPlayer.chakra || [], true),
  opponent: opponent ? buildPlayer(opponent, [], false) : null
};

decisionState.actionCandidates = buildActionCandidates(decisionState.currentPlayer);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(decisionState, null, 2) + "\n");

printSummary(decisionState, outputPath);

function hasLiveSkills(r) {
  return (r.players || []).some((p) =>
    (p.team || []).some((c) => Array.isArray(c.skills) && c.skills.length > 0)
  );
}

function buildPlayer(player, chakraPool, includeSkills) {
  return {
    playerId: player.playerId,
    chakra: player.chakra || [],
    info: player.info || null,
    team: (player.team || [])
      .filter((c) => c.exists)
      .map((c) => buildCharacter(c, chakraPool, includeSkills))
  };
}

function buildCharacter(c, chakraPool, includeSkills) {
  const character = {
    slot: c.slot,
    slotIndex: slotIndex(c.slot),
    name: c.name,
    health: c.health,
    isDead: Number(c.health || 0) <= 0,
    customFacepic: c.customFacepic || null,
    effects: (c.icons || []).map((icon) => ({
      name: icon.name,
      stacks: icon.stacks ?? null,
      sourcePlayerId: icon.id ?? null,
      self: icon.self ?? null,
      effects: (icon.effects || []).map((e) => ({
        text: e.text,
        duration: e.duration,
        isNothing: Boolean(e.isNothing)
      }))
    }))
  };

  if (includeSkills && Array.isArray(c.skills)) {
    const skills = c.skills.map((s) => buildSkill(s, c, chakraPool));

    character.skills = {
      castableNow: skills.filter((s) => s.state === "castable"),
      notAffordableNow: skills.filter((s) => s.state === "not_affordable"),
      unavailable: skills.filter((s) => s.state === "unavailable"),
      all: skills
    };
  }

  return character;
}

function buildSkill(s, character, chakraPool) {
  const energy = s.energy || [];
  const serverAvailable = !s.outtagame && (s.cd_on ?? 0) === 0;
  const affordable = canPay(energy, chakraPool);
  const state = !serverAvailable ? "unavailable" : affordable ? "castable" : "not_affordable";
  const targetMap = s.target || {};
  const selectableTargets = Object.entries(targetMap)
    .filter(([, value]) => Array.isArray(value) && value[0] === 1)
    .map(([key, value]) => ({
      key,
      side: key[0] === "0" ? "own" : "enemy",
      slot: Number(key[1]),
      value
    }));

  const affectedOrHighlightedTargets = Object.entries(targetMap)
    .filter(([, value]) => Array.isArray(value) && value[1] === 1)
    .map(([key, value]) => ({
      key,
      side: key[0] === "0" ? "own" : "enemy",
      slot: Number(key[1]),
      value
    }));

  return {
    characterSlot: character.slot,
    characterSlotIndex: slotIndex(character.slot),
    skillSlot: s.slot,
    name: s.name,
    state,
    serverAvailable,
    affordable,
    outtagame: s.outtagame ?? null,
    cd_on: s.cd_on ?? null,
    energy,
    missingEnergy: missingEnergy(energy, chakraPool),
    classes: s.classes || [],
    cooldown: s.cooldown ?? null,
    targetMap,
    selectableTargets,
    affectedOrHighlightedTargets,
    description: s.description || null
  };
}

function buildActionCandidates(playerState) {
  const candidates = [];

  for (const character of playerState.team || []) {
    for (const skill of character.skills?.castableNow || []) {
      for (const target of skill.selectableTargets || []) {
        candidates.push({
          label: `${character.name} -> ${skill.name} -> ${target.key}`,
          caster: {
            characterName: character.name,
            char: character.slotIndex
          },
          skill: {
            name: skill.name,
            index: skill.skillSlot,
            energy: skill.energy,
            classes: skill.classes
          },
          target: {
            key: target.key,
            usedOn: {
              s: target.side === "own" ? 0 : 1,
              i: target.slot
            }
          },
          queueItem: {
            name: skill.name,
            menu_local: [0, character.slotIndex, skill.skillSlot],
            usedOn: {
              s: target.side === "own" ? 0 : 1,
              i: target.slot
            },
            new: true,
            assignedSkill: {
              char: character.slotIndex,
              index: skill.skillSlot
            }
          }
        });
      }
    }
  }

  return candidates;
}

function canPay(cost, pool) {
  const available = [...pool];

  for (const c of cost || []) {
    if (c === "Random") continue;
    const idx = available.indexOf(c);
    if (idx === -1) return false;
    available.splice(idx, 1);
  }

  const randomCount = (cost || []).filter((c) => c === "Random").length;
  return available.length >= randomCount;
}

function missingEnergy(cost, pool) {
  const available = [...pool];
  const missing = [];

  for (const c of cost || []) {
    if (c === "Random") continue;
    const idx = available.indexOf(c);
    if (idx === -1) missing.push(c);
    else available.splice(idx, 1);
  }

  const randomCount = (cost || []).filter((c) => c === "Random").length;
  if (available.length < randomCount) {
    for (let i = 0; i < randomCount - available.length; i++) missing.push("Random");
  }

  return missing;
}

function slotIndex(slot) {
  const match = String(slot || "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

function printSummary(state, outputPath) {
  const current = state.currentPlayer;
  const opponent = state.opponent;
  const castableCount = current.team.reduce((sum, c) => sum + (c.skills?.castableNow?.length || 0), 0);
  const candidateCount = state.actionCandidates.length;

  console.log("");
  console.log("=== DECISION STATE SUMMARY FOR CHATGPT ===");
  console.log("wrote:", path.relative(process.cwd(), outputPath));
  console.log("record:", state.record.index);
  console.log("turn:", state.record.turn);
  console.log("turnKey:", state.record.turnKey ?? "-");
  console.log("currentPlayer:", current.playerId);
  console.log("chakra:", current.chakra.join(", ") || "none");
  console.log("opponent:", opponent ? opponent.playerId : "-");
  console.log("castableSkills:", castableCount);
  console.log("actionCandidates:", candidateCount);

  console.log("");
  console.log("CASTABLE SKILLS:");
  for (const c of current.team) {
    for (const s of c.skills?.castableNow || []) {
      const targets = (s.selectableTargets || []).map((t) => t.key).join(",");
      console.log(`- ${c.slot} ${c.name} [${s.skillSlot}] ${s.name} energy=${s.energy.join("+") || "None"} targets=${targets || "none"}`);
    }
  }

  console.log("");
  console.log("NOT AFFORDABLE:");
  for (const c of current.team) {
    for (const s of c.skills?.notAffordableNow || []) {
      console.log(`- ${c.slot} ${c.name} [${s.skillSlot}] ${s.name} energy=${s.energy.join("+") || "None"} missing=${s.missingEnergy.join("+") || "?"}`);
    }
  }

  console.log("=== END DECISION STATE SUMMARY ===");
}
