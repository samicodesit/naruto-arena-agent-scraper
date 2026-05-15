import fs from "node:fs/promises";
import path from "node:path";
import { sha256 } from "./utils/text.js";
import { ensureDir, writeJson, writeText } from "./utils/fs.js";

type EnergyCode = "Tai" | "Blood" | "Nin" | "Gen" | "Random" | string;

type IngameSkill = {
  name: string;
  themeName?: string;
  description: string;
  descriptionBR?: string;
  energy: EnergyCode[];
  classes: string[];
  cooldown: number;
  url?: string;
  themepic?: string;
};

type IngameCharacter = {
  name: string;
  url?: string;
  themepic?: string;
  description: string;
  descriptionBR?: string;
  skills: IngameSkill[];
};

type IngameStateFile = {
  action: string;
  content: {
    username?: string;
    characters: IngameCharacter[];
  };
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

type ParsedSkill = {
  name: string;
  themeName?: string;
  descriptionRaw: string;
  descriptionText: string;
  energy: EnergyCode[];
  energyReadable: string[];
  classes: string[];
  cooldown: number;
  imageUrl?: string;
  themePic?: string;
};

const INPUT_PATH = path.resolve(
  process.cwd(),
  "data",
  "ingame",
  "getState.json",
);
const OUT_JSON = path.resolve(
  process.cwd(),
  "data",
  "characters",
  "characters.parsed.json",
);
const OUT_MD = path.resolve(
  process.cwd(),
  "docs",
  "naruto_arena_characters.md",
);

const ENERGY_LABELS: Record<string, string> = {
  Tai: "Taijutsu",
  Blood: "Bloodline",
  Nin: "Ninjutsu",
  Gen: "Genjutsu",
  Random: "Random",
};

const raw = await fs.readFile(INPUT_PATH, "utf8");
const state = JSON.parse(raw) as IngameStateFile;

if (state.action !== "getState") {
  throw new Error(`Expected action=getState, got action=${state.action}`);
}

if (!state.content?.characters?.length) {
  throw new Error("No characters found at content.characters");
}

const parsed: ParsedCharacter[] = state.content.characters.map((char) => {
  const normalized = {
    name: char.name,
    description: stripMarkup(char.description),
    imageUrl: char.url,
    themePic: char.themepic,
    source: "ingame-getState" as const,
    contentHash: "",
    skills: char.skills.map((skill) => ({
      name: skill.name,
      themeName: skill.themeName,
      descriptionRaw: skill.description,
      descriptionText: stripMarkup(skill.description),
      energy: skill.energy,
      energyReadable: skill.energy.map((e) => ENERGY_LABELS[e] || e),
      classes: skill.classes,
      cooldown: skill.cooldown,
      imageUrl: skill.url,
      themePic: skill.themepic,
    })),
  };

  normalized.contentHash = sha256(JSON.stringify(normalized));
  return normalized;
});

parsed.sort((a, b) => a.name.localeCompare(b.name));

await ensureDir(path.dirname(OUT_JSON));
await ensureDir(path.dirname(OUT_MD));

await writeJson(OUT_JSON, {
  generatedAt: new Date().toISOString(),
  sourceFile: INPUT_PATH,
  username: state.content.username,
  characterCount: parsed.length,
  characters: parsed,
});

await writeText(OUT_MD, buildMarkdown(parsed, state.content.username));

console.log(`Imported ${parsed.length} characters from ${INPUT_PATH}`);
console.log(`Wrote ${OUT_JSON}`);
console.log(`Wrote ${OUT_MD}`);

function stripMarkup(input: string): string {
  return String(input || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function buildMarkdown(chars: ParsedCharacter[], username?: string): string {
  const lines: string[] = [];

  lines.push("# Naruto-Arena Classic — Characters Database");
  lines.push("");
  lines.push("> Generated from `/ingame` `getState` JSON.");
  lines.push("");
  lines.push(`- **Generated at:** ${new Date().toISOString()}`);
  if (username) lines.push(`- **Captured account:** ${username}`);
  lines.push(`- **Characters parsed:** ${chars.length}`);
  lines.push("- **Primary source:** `data/ingame/getState.json`");
  lines.push("");
  lines.push("## Energy Codes");
  lines.push("");
  lines.push("| Code | Meaning |");
  lines.push("|---|---|");
  lines.push("| `Tai` | Taijutsu / green |");
  lines.push("| `Blood` | Bloodline / red |");
  lines.push("| `Nin` | Ninjutsu / blue |");
  lines.push("| `Gen` | Genjutsu / white |");
  lines.push("| `Random` | Random / black filler |");
  lines.push("");
  lines.push("## Character Index");
  lines.push("");
  lines.push("| Character | Skills | Hash |");
  lines.push("|---|---:|---|");

  for (const char of chars) {
    lines.push(
      `| ${escapeMd(char.name)} | ${char.skills.length} | \`${char.contentHash.slice(0, 10)}\` |`,
    );
  }

  lines.push("");
  lines.push("## Characters");
  lines.push("");

  for (const char of chars) {
    lines.push(`## ${char.name}`);
    lines.push("");
    lines.push(`- **Image:** ${char.imageUrl || "n/a"}`);
    lines.push(`- **Theme pic:** ${char.themePic || "n/a"}`);
    lines.push(`- **Content hash:** \`${char.contentHash}\``);
    lines.push("");
    lines.push("### Description");
    lines.push("");
    lines.push(char.description || "n/a");
    lines.push("");
    lines.push("### Skills");
    lines.push("");

    for (const skill of char.skills) {
      lines.push(`#### ${skill.name}`);
      lines.push("");
      if (skill.themeName && skill.themeName !== skill.name) {
        lines.push(`- **Theme name:** ${skill.themeName}`);
      }
      lines.push(`- **Cooldown:** ${skill.cooldown}`);
      lines.push(
        `- **Energy:** ${skill.energy.length ? skill.energy.map((e) => `\`${e}\``).join(" + ") : "None"}`,
      );
      lines.push(
        `- **Energy readable:** ${skill.energyReadable.length ? skill.energyReadable.join(" + ") : "None"}`,
      );
      lines.push(
        `- **Classes:** ${skill.classes.length ? skill.classes.map((c) => `\`${c}\``).join(", ") : "None"}`,
      );
      lines.push(`- **Image:** ${skill.imageUrl || "n/a"}`);
      lines.push("");
      lines.push(skill.descriptionText || "n/a");
      lines.push("");
    }
  }

  return lines.join("\n");
}

function escapeMd(input: string): string {
  return input.replace(/\|/g, "\\|");
}
