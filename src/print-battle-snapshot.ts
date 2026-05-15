import fs from "node:fs";
import path from "node:path";

const inputPath = path.resolve(process.cwd(), "data", "protocol", "battle-states.json");
const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const records = data.records || [];
const requestedIndex = process.argv[2];

const record = requestedIndex
  ? records.find((r) => String(r.index) === String(requestedIndex))
  : [...records].reverse().find((r) =>
      (r.players || []).some((p) =>
        (p.team || []).some((c) => Array.isArray(c.skills) && c.skills.length > 0)
      )
    );

if (!record) {
  console.log("No battle record with live skills found.");
  process.exit(1);
}

printSnapshot(record);

function printSnapshot(r) {
  console.log("");
  console.log("=== NARUTO-ARENA BATTLE SNAPSHOT ===");
  console.log("record: " + r.index);
  console.log("capturedAt: " + r.capturedAt);
  console.log("response: " + r.responseAction);
  console.log("turn: " + (r.turn || "-"));
  console.log("turnKey: " + (r.turnKey ?? "-"));

  if (r.responseAction === "endGame") {
    console.log("result: " + (r.gameType || "-") + " " + (r.result || "-"));
    console.log("=== END SNAPSHOT ===");
    return;
  }

  const players = r.players || [];
  const current = players.find((p) => p.playerId === r.turn) || players[0];
  const enemy = players.find((p) => p.playerId !== (current && current.playerId));

  if (current) {
    console.log("");
    console.log("CURRENT PLAYER: " + current.playerId);
    console.log("chakra: " + (((current.chakra || []).join(", ")) || "none"));
    printTeam(current, true, current.chakra || []);
  }

  if (enemy) {
    console.log("");
    console.log("OPPONENT: " + enemy.playerId);
    console.log("chakra: " + (((enemy.chakra || []).join(", ")) || "hidden/none"));
    printTeam(enemy, false, []);
  }

  console.log("");
  console.log("TARGET COORDINATES:");
  console.log("00 own char0 | 01 own char1 | 02 own char2 | 10 enemy char0 | 11 enemy char1 | 12 enemy char2");
  console.log("target value: [clickableOrValid, affectedOrHighlighted] - current working interpretation");
  console.log("");
  console.log("=== END SNAPSHOT ===");
}

function printTeam(player, includeSkills, chakraPool) {
  for (const c of player.team || []) {
    if (!c.exists) continue;

    console.log("");
    console.log((c.slot || "?") + ": " + c.name + " | HP=" + c.health);

    const icons = c.icons || [];
    if (icons.length) {
      console.log("  effects:");
      for (const icon of icons) {
        const effectText = (icon.effects || [])
          .map((e) => e.text + " (" + e.duration + ")")
          .join(" | ");
        console.log(" - " + icon.name + (effectText ? ": " + effectText : ""));
      }
    }

    if (!includeSkills || !(c.skills || []).length) continue;

    const serverAvailable = (c.skills || []).filter((s) => !s.outtagame && (s.cd_on ?? 0) === 0);
    const castable = serverAvailable.filter((s) => canPay(s.energy || [], chakraPool));
    const notAffordable = serverAvailable.filter((s) => !canPay(s.energy || [], chakraPool));
    const unavailable = (c.skills || []).filter((s) => s.outtagame || (s.cd_on ?? 0) > 0);

    if (castable.length) {
      console.log("  castable now:");
      for (const s of castable) {
        console.log("  [" + s.slot + "] " + s.name + " | energy=" + fmtEnergy(s.energy) + " | targets=" + fmtTargets(s.target));
      }
    }

    if (notAffordable.length) {
      console.log("  not affordable now:");
      for (const s of notAffordable) {
        console.log("  [" + s.slot + "] " + s.name + " | energy=" + fmtEnergy(s.energy) + " | missing=" + (missingEnergy(s.energy || [], chakraPool).join("+") || "?"));
      }
    }

    if (unavailable.length) {
      console.log("  unavailable skills:");
      for (const s of unavailable) {
        console.log("  [" + s.slot + "] " + s.name + " | cd_on=" + s.cd_on + " | outtagame=" + s.outtagame + " | energy=" + fmtEnergy(s.energy));
      }
    }
  }
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

function fmtEnergy(energy) {
  return energy && energy.length ? energy.join("+") : "None";
}

function fmtTargets(target) {
  if (!target) return "none";

  const parts = Object.entries(target)
    .filter(([, value]) => Array.isArray(value) && (value[0] || value[1]))
    .map(([key, value]) => key + ":" + JSON.stringify(value));

  return parts.length ? parts.join(" ") : "none";
}
