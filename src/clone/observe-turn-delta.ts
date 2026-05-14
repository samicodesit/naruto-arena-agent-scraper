
import fs from "node:fs";
import path from "node:path";

const sessionDir = process.env.SESSION_DIR ?? "data/traffic/2026-05-14T09-12-13-865Z";
const preFile = process.env.PRE ?? "0029_requestEndTurn.json";
const postFile = process.env.POST ?? "0030_passTurn.json";

const preRecord = readJson(path.join(sessionDir, preFile));
const postRecord = readJson(path.join(sessionDir, postFile));

const preContent = getContent(preRecord);
const postContent = getContent(postRecord);
const queue = getPayload(postRecord).queue ?? [];

const prePlayers = preContent.players ?? [];
const postPlayers = postContent.players ?? [];
const turnPlayerId = String(preContent.turn ?? "-");

const observation = {
  sessionDir,
  preFile,
  postFile,
  turnPlayerId,
  queue: observeQueue(),
  hpDeltas: observeHpDeltas(),
  effectsAdded: observeEffectChanges().added,
  effectsRemoved: observeEffectChanges().removed,
  skillChanges: observeSkillChanges(),
  chakraChanges: observeChakraChanges(),
};

printObservation(observation);
writeObservation(observation);

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getContent(record: any): any {
  return record.response?.body?.content ?? record.response?.content ?? record.content ?? {};
}

function getPayload(record: any): any {
  return record.request?.payload ?? record.request?.body ?? record.request ?? {};
}

function getPlayer(players: any[], playerId: string): any | null {
  return players.find((p) => String(p.playerId) === playerId) ?? null;
}

function getChar(player: any, slot: number): any | null {
  return player?.team?.[`char${slot}`] ?? null;
}

function playerSide(players: any[], playerId: string): number {
  return players.findIndex((p) => String(p.playerId) === playerId);
}

function observeQueue() {
  const currentPlayer = getPlayer(prePlayers, turnPlayerId);
  const currentSide = playerSide(prePlayers, turnPlayerId);

  return queue.map((item: any, index: number) => {
    if (!item.assignedSkill) {
      return {
        index,
        name: item.name,
        kind: item.encryptItem ? "encrypted_continuation" : "unknown",
        rawTarget: item.usedOn ?? null,
      };
    }

    const casterSlot = Number(item.assignedSkill.char);
    const skillIndex = Number(item.assignedSkill.index);
    const caster = getChar(currentPlayer, casterSlot);
    const skill = caster?.skills?.[skillIndex] ?? null;

    const targetSide = typeof item.usedOn?.s === "number" ? Number(item.usedOn.s) : null;
    const targetSlot = typeof item.usedOn?.i === "number" ? Number(item.usedOn.i) : null;
    const targetPlayer = targetSide === null ? null : prePlayers[targetSide];
    const targetChar = targetPlayer && targetSlot !== null ? getChar(targetPlayer, targetSlot) : null;

    return {
      index,
      name: item.name,
      kind: "assigned_skill",
      casterPlayerId: turnPlayerId,
      casterSide: currentSide,
      casterSlot,
      casterName: caster?.name ?? null,
      skillIndex,
      resolvedSkillName: skill?.name ?? null,
      targetSide,
      targetPlayerId: targetPlayer?.playerId ?? null,
      targetSlot,
      targetName: targetChar?.name ?? null,
      classes: skill?.classes ?? [],
      energy: skill?.energy ?? [],
      description: skill?.description ?? null,
    };
  });
}

function observeHpDeltas() {
  const out: any[] = [];

  for (const prePlayer of prePlayers) {
    const postPlayer = getPlayer(postPlayers, String(prePlayer.playerId));
    if (!postPlayer) continue;

    for (const slot of [0, 1, 2]) {
      const preChar = getChar(prePlayer, slot);
      const postChar = getChar(postPlayer, slot);
      if (!preChar || !postChar) continue;

      const before = Number(preChar.health);
      const after = Number(postChar.health);
      const delta = after - before;

      if (delta !== 0) {
        out.push({
          playerId: prePlayer.playerId,
          slot,
          character: preChar.name,
          before,
          after,
          delta,
        });
      }
    }
  }

  return out;
}

function observeEffectChanges() {
  const added: any[] = [];
  const removed: any[] = [];

  for (const prePlayer of prePlayers) {
    const postPlayer = getPlayer(postPlayers, String(prePlayer.playerId));
    if (!postPlayer) continue;

    for (const slot of [0, 1, 2]) {
      const preChar = getChar(prePlayer, slot);
      const postChar = getChar(postPlayer, slot);
      if (!preChar || !postChar) continue;

      const before = effectNames(preChar);
      const after = effectNames(postChar);

      for (const name of diffNames(after, before)) {
        added.push({
          playerId: prePlayer.playerId,
          slot,
          character: preChar.name,
          effect: name,
          detail: findEffect(postChar, name),
        });
      }

      for (const name of diffNames(before, after)) {
        removed.push({
          playerId: prePlayer.playerId,
          slot,
          character: preChar.name,
          effect: name,
          detail: findEffect(preChar, name),
        });
      }
    }
  }

  return { added, removed };
}

function observeSkillChanges() {
  const out: any[] = [];

  for (const prePlayer of prePlayers) {
    const postPlayer = getPlayer(postPlayers, String(prePlayer.playerId));
    if (!postPlayer) continue;

    for (const slot of [0, 1, 2]) {
      const preChar = getChar(prePlayer, slot);
      const postChar = getChar(postPlayer, slot);
      if (!preChar || !postChar) continue;

      const max = Math.max(preChar.skills?.length ?? 0, postChar.skills?.length ?? 0);

      for (let i = 0; i < max; i++) {
        const a = preChar.skills?.[i];
        const b = postChar.skills?.[i];
        if (!a || !b) continue;

        const changes: any = {};

        if (a.name !== b.name) changes.name = { before: a.name, after: b.name };
        if (Number(a.cd_on ?? 0) !== Number(b.cd_on ?? 0)) changes.cooldown = { before: a.cd_on ?? 0, after: b.cd_on ?? 0 };
        if (Boolean(a.outtagame) !== Boolean(b.outtagame)) changes.disabled = { before: Boolean(a.outtagame), after: Boolean(b.outtagame) };
        if (JSON.stringify(a.energy ?? []) !== JSON.stringify(b.energy ?? [])) changes.energy = { before: a.energy ?? [], after: b.energy ?? [] };

        if (Object.keys(changes).length) {
          out.push({
            playerId: prePlayer.playerId,
            slot,
            character: preChar.name,
            skillIndex: i,
            skillBefore: a.name,
            skillAfter: b.name,
            changes,
          });
        }
      }
    }
  }

  return out;
}

function observeChakraChanges() {
  const out: any[] = [];

  for (const prePlayer of prePlayers) {
    const postPlayer = getPlayer(postPlayers, String(prePlayer.playerId));
    if (!postPlayer) continue;

    const before = prePlayer.chakra ?? [];
    const after = postPlayer.chakra ?? [];

    if (JSON.stringify(before) !== JSON.stringify(after)) {
      out.push({
        playerId: prePlayer.playerId,
        before,
        after,
      });
    }
  }

  return out;
}

function effectNames(char: any): string[] {
  return Array.isArray(char.icon) ? char.icon.map((e: any) => String(e.name)).sort() : [];
}

function diffNames(a: string[], b: string[]): string[] {
  const remaining = [...b];
  const out: string[] = [];

  for (const name of a) {
    const index = remaining.indexOf(name);
    if (index >= 0) {
      remaining.splice(index, 1);
    } else {
      out.push(name);
    }
  }

  return out;
}

function findEffect(char: any, name: string): any {
  const effect = (char.icon ?? []).find((e: any) => String(e.name) === name);
  if (!effect) return null;

  return {
    name: effect.name,
    sourcePlayerId: effect.id ?? null,
    sourceSlot: typeof effect.self === "number" ? effect.self : null,
    durationTexts: (effect.effects ?? []).map((entry: any) => ({
      text: String(entry.text),
      duration: String(entry.duration),
    })),
    stacks: effect.stacks ?? null,
  };
}

function printObservation(obs: any): void {
  console.log("\n=== OBSERVED TURN DELTA ===");
  console.log("session:", obs.sessionDir);
  console.log("pre:", obs.preFile);
  console.log("post:", obs.postFile);
  console.log("turnPlayer:", obs.turnPlayerId);

  console.log("\nQUEUE:");
  for (const item of obs.queue) {
    if (item.kind === "assigned_skill") {
      console.log(
        `- [${item.index}] ${item.casterName} slot${item.casterSlot} -> ${item.name} -> ${item.targetPlayerId ?? "-"} slot${item.targetSlot ?? "-"} ${item.targetName ?? "-"}`
      );
    } else {
      console.log(`- [${item.index}] ${item.name} (${item.kind})`);
    }
  }

  console.log("\nHP DELTAS:");
  printList(obs.hpDeltas, (d: any) => `- ${d.playerId} slot${d.slot} ${d.character}: ${d.before} -> ${d.after} (${d.delta})`);

  console.log("\nEFFECTS ADDED:");
  printList(obs.effectsAdded, (e: any) => `- ${e.playerId} slot${e.slot} ${e.character}: +${e.effect}`);

  console.log("\nEFFECTS REMOVED:");
  printList(obs.effectsRemoved, (e: any) => `- ${e.playerId} slot${e.slot} ${e.character}: -${e.effect}`);

  console.log("\nSKILL CHANGES:");
  printList(obs.skillChanges, (s: any) => `- ${s.playerId} slot${s.slot} ${s.character} skill[${s.skillIndex}]: ${JSON.stringify(s.changes)}`);

  console.log("\nCHAKRA CHANGES:");
  printList(obs.chakraChanges, (c: any) => `- ${c.playerId}: ${JSON.stringify(c.before)} -> ${JSON.stringify(c.after)}`);

  console.log("\n=== END OBSERVED TURN DELTA ===");
}

function printList(values: any[], format: (value: any) => string): void {
  if (!values.length) {
    console.log("none");
    return;
  }

  for (const value of values) console.log(format(value));
}

function writeObservation(obs: any): void {
  const outDir = path.join("data", "clone", "observations");
  fs.mkdirSync(outDir, { recursive: true });

  const file = path.join(outDir, `${preFile.replace(".json", "")}__${postFile.replace(".json", "")}.json`);
  fs.writeFileSync(file, JSON.stringify(obs, null, 2) + "\n");

  console.log("\nwrote:", file);
}
