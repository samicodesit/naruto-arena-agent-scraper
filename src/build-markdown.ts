import path from "node:path";
import { PATHS } from "./config.js";
import { readJson, writeText, ensureDir } from "./utils/fs.js";

type ParsedSkill = {
  name: string;
  themeName?: string;
  descriptionRaw: string;
  descriptionText: string;
  energy: string[];
  energyReadable: string[];
  classes: string[];
  cooldown: number;
  imageUrl?: string;
  themePic?: string;
};

type ParsedCharacter = {
  name: string;
  description: string;
  imageUrl?: string;
  themePic?: string;
  source: "ingame-getState";
  contentHash: string;
  skills: ParsedSkill[];
};

type CharactersParsedDb = {
  generatedAt: string;
  sourceFile: string;
  username?: string;
  characterCount: number;
  characters: ParsedCharacter[];
};

const dbPath = path.resolve(
  process.cwd(),
  "data",
  "characters",
  "characters.parsed.json",
);
const db = await readJson<CharactersParsedDb>(dbPath);

if (!db?.characters?.length) {
  throw new Error("Missing parsed character DB. Run `npm run sync` first.");
}

await ensureDir(PATHS.docsDir);

await writeText(
  path.join(PATHS.docsDir, "naruto_arena_agent_context.md"),
  buildAgentContext(db),
);

await writeText(
  path.join(PATHS.docsDir, "naruto_arena_characters.md"),
  buildCharactersMarkdown(db),
);

await writeText(
  path.join(PATHS.docsDir, "naruto_arena_sync_report.md"),
  buildSyncReport(db),
);

console.log("Generated:");
console.log("- docs/naruto_arena_agent_context.md");
console.log("- docs/naruto_arena_characters.md");
console.log("- docs/naruto_arena_sync_report.md");

function buildAgentContext(db: CharactersParsedDb): string {
  return `# Naruto-Arena Classic — AI Agent Context

Purpose: main context file for an AI helper that understands Naruto-Arena Classic mechanics, characters, skills, chakra economy, and team-building constraints.

## Source of Truth

| Area | File | Notes |
|---|---|---|
| Raw game state | \`data/ingame/getState.json\` | Fresh response from \`/api/handleingame\`. |
| Parsed character DB | \`data/characters/characters.parsed.json\` | Machine-readable character/skill database. |
| Character markdown | \`docs/naruto_arena_characters.md\` | AI-readable generated character database. |
| Sync report | \`docs/naruto_arena_sync_report.md\` | Summary of latest sync. |

## Current Dataset

- Captured account: ${db.username || "unknown"}
- Characters parsed: ${db.characterCount}
- Character DB generated at: ${db.generatedAt}

## Agent Rules

1. Do not invent character skills, chakra costs, cooldowns, classes, mission requirements, or meta teams.
2. Use \`docs/naruto_arena_characters.md\` for character and skill facts.
3. Use \`data/characters/characters.parsed.json\` when structured precision is needed.
4. If data is missing, state exactly what is missing.
5. Do not store passwords, cookies, JWTs, or copied browser headers.
6. Treat this DB as current only as of the last sync time.
7. For team building, consider chakra overlap, cooldown curve, defensive coverage, stun/control, AoE pressure, and setup dependencies.
8. For live battle advice, require current battle state: teams, HP, chakra, cooldowns, active effects, targetability, whose turn it is, and usable skills.

## Game Loop

Naruto-Arena Classic is a turn-based 3v3 strategy game. Each player selects three ninjas. The goal is to reduce the opposing team to 0 health.

Each turn, each living character can use one skill if:
- the skill is available,
- the character can act,
- the player has enough chakra,
- the target is valid.

Selected skills are placed into a queue. Queue order matters because skills resolve from left to right.

## Chakra Codes

- \`Tai\` = Taijutsu / green
- \`Blood\` = Bloodline / red
- \`Nin\` = Ninjutsu / blue
- \`Gen\` = Genjutsu / white
- \`Random\` = any chakra type / black filler

## Important Terms

- Piercing damage ignores damage reduction.
- Affliction damage ignores damage reduction and destructible defense.
- Stun prevents affected skills from being used.
- Invulnerable characters are not valid targets for enemy skills.
- Reflect returns effects back to the user who targeted the reflecting character.
- Counter negates an incoming skill.
- Destructible defense must be depleted before health damage is taken.
- Cooldown is the number of turns a skill cannot be used after activation.

## Team Recommendation Format

\`\`\`md
Team: <char 1> / <char 2> / <char 3>

Win condition:
Chakra curve:
Main combo:
Defensive plan:
Control/stun plan:
Weaknesses:
Best mode:
Confidence:
\`\`\`

## Live Turn Recommendation Format

\`\`\`md
Actions:
1. <caster> uses <skill> on <target>
2. <caster> uses <skill> on <target>

Queue order:
1. <skill>
2. <skill>

Random chakra payment:
- Spend:
- Preserve:

Reasoning:

Risks:
\`\`\`
`;
}

function buildCharactersMarkdown(db: CharactersParsedDb): string {
  const lines: string[] = [];

  lines.push("# Naruto-Arena Classic — Characters Database");
  lines.push("");
  lines.push(
    "> Generated from `/ingame getState`. This is the primary character/skill source.",
  );
  lines.push("");
  lines.push(`- Generated at: ${new Date().toISOString()}`);
  lines.push(`- Source DB generated at: ${db.generatedAt}`);
  lines.push(`- Captured account: ${db.username || "unknown"}`);
  lines.push(`- Characters parsed: ${db.characterCount}`);
  lines.push("");

  lines.push("## Character Index");
  lines.push("");
  lines.push("| Character | Skills | Chakra Profile | Tags | Hash |");
  lines.push("|---|---:|---|---|---|");

  for (const c of db.characters) {
    lines.push(
      `| ${escapeMd(c.name)} | ${c.skills.length} | ${escapeMd(chakraProfile(c))} | ${escapeMd(roleTags(c).join(", "))} | \`${c.contentHash.slice(0, 10)}\` |`,
    );
  }

  lines.push("");
  lines.push("## Characters");
  lines.push("");

  for (const c of db.characters) {
    lines.push(`## ${c.name}`);
    lines.push("");
    lines.push(`- Image: ${c.imageUrl || "n/a"}`);
    lines.push(`- Theme pic: ${c.themePic || "n/a"}`);
    lines.push(`- Content hash: \`${c.contentHash}\``);
    lines.push(`- Skill count: ${c.skills.length}`);
    lines.push(`- Chakra profile: ${chakraProfile(c)}`);
    lines.push(`- Role tags: ${roleTags(c).join(", ") || "none detected"}`);
    lines.push("");
    lines.push("### Description");
    lines.push("");
    lines.push(c.description || "n/a");
    lines.push("");
    lines.push("### Skills");
    lines.push("");

    for (const s of c.skills) {
      lines.push(`#### ${s.name}`);
      lines.push("");
      if (s.themeName && s.themeName !== s.name) {
        lines.push(`- Theme name: ${s.themeName}`);
      }
      lines.push(`- Cooldown: ${s.cooldown}`);
      lines.push(
        `- Energy: ${s.energy.length ? s.energy.map((e) => `\`${e}\``).join(" + ") : "None"}`,
      );
      lines.push(
        `- Energy readable: ${s.energyReadable.length ? s.energyReadable.join(" + ") : "None"}`,
      );
      lines.push(
        `- Classes: ${s.classes.length ? s.classes.map((x) => `\`${x}\``).join(", ") : "None"}`,
      );
      lines.push(`- Image: ${s.imageUrl || "n/a"}`);
      lines.push("");
      lines.push(s.descriptionText || "n/a");
      lines.push("");
    }
  }

  return lines.join("\n");
}

function buildSyncReport(db: CharactersParsedDb): string {
  const skills = db.characters.flatMap((c) => c.skills);
  const passiveSkills = skills.filter(
    (s) =>
      s.name.toLowerCase().startsWith("passive:") ||
      s.classes.includes("Passive"),
  );
  const noCostSkills = skills.filter((s) => s.energy.length === 0);

  const energyCounts = new Map<string, number>();
  for (const s of skills) {
    for (const e of s.energy) {
      energyCounts.set(e, (energyCounts.get(e) || 0) + 1);
    }
  }

  const energyLines = Array.from(energyCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([energy, count]) => `- ${energy}: ${count}`)
    .join("\n");

  return `# Naruto-Arena Classic — Sync Report

- Generated at: ${new Date().toISOString()}
- Captured account: ${db.username || "unknown"}
- Character DB generated at: ${db.generatedAt}
- Characters: ${db.characterCount}
- Skills: ${skills.length}
- Passive skills: ${passiveSkills.length}
- No-cost skills: ${noCostSkills.length}

## Energy Usage Count

${energyLines || "No energy data."}

## Recommended Maintenance

- Run \`npm run sync\` manually after visible game updates.
- Add a daily cron if you want silent refresh.
- Run \`npm run crawl:links\` occasionally to detect added/removed character pages.
- Do not rely on balance patch pages for core character data; \`getState\` is the current source of truth.
`;
}

function chakraProfile(c: ParsedCharacter): string {
  const counts = new Map<string, number>();

  for (const s of c.skills) {
    for (const e of s.energy) {
      counts.set(e, (counts.get(e) || 0) + 1);
    }
  }

  if (!counts.size) return "No-cost";

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
}

function roleTags(c: ParsedCharacter): string[] {
  const text = c.skills
    .map((s) => `${s.name} ${s.descriptionText} ${s.classes.join(" ")}`)
    .join(" ")
    .toLowerCase();

  const tags: string[] = [];

  if (/damage|piercing|affliction/.test(text)) tags.push("damage");
  if (/stun|stunning|stunned/.test(text)) tags.push("stun");
  if (
    /invulnerable|damage reduction|destructible defense|countered|counter/.test(
      text,
    )
  )
    tags.push("defense");
  if (/heal|healing/.test(text)) tags.push("heal");
  if (/remove .*chakra|steal.*chakra|gain.*chakra|random chakra/.test(text))
    tags.push("chakra-control");
  if (/counter/.test(text)) tags.push("counter");
  if (/reflect/.test(text)) tags.push("reflect");
  if (/all enemies|enemy team/.test(text)) tags.push("aoe");
  if (/invisible/.test(text)) tags.push("invisible");
  if (/cannot be countered|ignores invulnerability|ignore/.test(text))
    tags.push("bypass");

  return [...new Set(tags)];
}

function escapeMd(input: string): string {
  return String(input || "").replace(/\|/g, "\\|");
}
