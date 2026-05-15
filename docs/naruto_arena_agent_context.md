# Naruto-Arena Classic — AI Agent Context

Purpose: main context file for an AI helper that understands Naruto-Arena Classic mechanics, characters, skills, chakra economy, and team-building constraints.

## Source of Truth

| Area | File | Notes |
|---|---|---|
| Raw game state | `data/ingame/getState.json` | Fresh response from `/api/handleingame`. |
| Parsed character DB | `data/characters/characters.parsed.json` | Machine-readable character/skill database. |
| Character markdown | `docs/naruto_arena_characters.md` | AI-readable generated character database. |
| Sync report | `docs/naruto_arena_sync_report.md` | Summary of latest sync. |

## Current Dataset

- Captured account: Mestsxxx
- Characters parsed: 200
- Character DB generated at: 2026-05-14T09:08:17.799Z

## Agent Rules

1. Do not invent character skills, chakra costs, cooldowns, classes, mission requirements, or meta teams.
2. Use `docs/naruto_arena_characters.md` for character and skill facts.
3. Use `data/characters/characters.parsed.json` when structured precision is needed.
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

- `Tai` = Taijutsu / green
- `Blood` = Bloodline / red
- `Nin` = Ninjutsu / blue
- `Gen` = Genjutsu / white
- `Random` = any chakra type / black filler

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

```md
Team: <char 1> / <char 2> / <char 3>

Win condition:
Chakra curve:
Main combo:
Defensive plan:
Control/stun plan:
Weaknesses:
Best mode:
Confidence:
```

## Live Turn Recommendation Format

```md
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
```
