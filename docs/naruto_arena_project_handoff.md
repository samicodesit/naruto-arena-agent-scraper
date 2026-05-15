# Naruto-Arena Project Handoff

Project path: /home/mests/projects/naruto-arena-agent-scraper

Goal: build an AI-assisted understanding of Naruto-Arena Classic, enough for a helper, simulator, and eventually a mechanics clone.

Current confirmed sources:

- /ingame getState gives 200 characters, skills, energy, classes, cooldowns, descriptions, images.
- recorded /api/handleingame traffic gives the real battle protocol.

Confirmed lifecycle:
connectSelection -> searchGame -> checkIfInBattle -> checkIfConfirmedBattle -> connectBattle -> passTurn -> requestEndTurn polling -> endGame -> connectSelection

Confirmed endGame payload:
{ "action": "endGame", "content": { "var_type": "Quick", "endGame": "win" } }

Important commands:

- npm run sync
- npm run record:traffic
- npm run analyze:traffic
- npm run extract:battle

Important files:

- docs/naruto_arena_agent_context.md
- docs/naruto_arena_characters.md
- docs/naruto_arena_protocol.md
- docs/naruto_arena_battle_state.md
- docs/naruto_arena_sync_report.md

---

# Agent Context

# Naruto-Arena Classic — AI Agent Context

Purpose: main context file for an AI helper that understands Naruto-Arena Classic mechanics, characters, skills, chakra economy, and team-building constraints.

## Source of Truth

| Area                | File                                     | Notes                                      |
| ------------------- | ---------------------------------------- | ------------------------------------------ |
| Raw game state      | `data/ingame/getState.json`              | Fresh response from `/api/handleingame`.   |
| Parsed character DB | `data/characters/characters.parsed.json` | Machine-readable character/skill database. |
| Character markdown  | `docs/naruto_arena_characters.md`        | AI-readable generated character database.  |
| Sync report         | `docs/naruto_arena_sync_report.md`       | Summary of latest sync.                    |

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

---

# Protocol

# Naruto-Arena Classic — In-Game Protocol

> Generated from locally recorded `/api/handleingame` traffic while manually playing.

- Generated at: 2026-05-14T09:21:29.944Z
- Session dir: `data/traffic/2026-05-14T09-12-13-865Z`
- Total records: 61
- Started at: 2026-05-14T09:12:17.922Z
- Ended at: 2026-05-14T09:18:39.696Z

## Action Counts

| Action                   | Count | First | Last | Statuses | Payload variants | Response variants |
| ------------------------ | ----: | ----: | ---: | -------- | ---------------: | ----------------: |
| `checkIfConfirmedBattle` |     1 |     4 |    4 | 200:1    |                1 |                 1 |
| `checkIfInBattle`        |     1 |     3 |    3 | 200:1    |                1 |                 1 |
| `connectBattle`          |     1 |     5 |    5 | 200:1    |                1 |                 1 |
| `connectSelection`       |     2 |     1 |   61 | 200:2    |                1 |                 1 |
| `passTurn`               |     9 |     6 |   57 | 200:9    |                9 |                 9 |
| `requestEndTurn`         |    46 |     7 |   60 | 200:46   |                1 |                10 |
| `searchGame`             |     1 |     2 |    2 | 200:1    |                1 |                 1 |

## Compressed Action Sequence

```txt
connectSelection
searchGame
checkIfInBattle
checkIfConfirmedBattle
connectBattle
passTurn
requestEndTurn × 6
passTurn
requestEndTurn × 8
passTurn
requestEndTurn × 3
passTurn
requestEndTurn × 3
passTurn
requestEndTurn × 10
passTurn
requestEndTurn × 6
passTurn
requestEndTurn × 4
passTurn
requestEndTurn × 3
passTurn
requestEndTurn × 3
connectSelection
```

## Chronological Records

|   # | Time                     | Action                   | Status | Page                                 |
| --: | ------------------------ | ------------------------ | -----: | ------------------------------------ |
|   1 | 2026-05-14T09:12:17.922Z | `connectSelection`       |    200 | https://www.naruto-arena.site/ingame |
|   2 | 2026-05-14T09:12:31.698Z | `searchGame`             |    200 | https://www.naruto-arena.site/ingame |
|   3 | 2026-05-14T09:12:36.839Z | `checkIfInBattle`        |    200 | https://www.naruto-arena.site/ingame |
|   4 | 2026-05-14T09:12:43.490Z | `checkIfConfirmedBattle` |    200 | https://www.naruto-arena.site/ingame |
|   5 | 2026-05-14T09:12:43.793Z | `connectBattle`          |    200 | https://www.naruto-arena.site/ingame |
|   6 | 2026-05-14T09:13:09.635Z | `passTurn`               |    200 | https://www.naruto-arena.site/ingame |
|   7 | 2026-05-14T09:13:13.262Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|   8 | 2026-05-14T09:13:16.896Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|   9 | 2026-05-14T09:13:20.541Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  10 | 2026-05-14T09:13:24.191Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  11 | 2026-05-14T09:13:27.840Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  12 | 2026-05-14T09:13:31.540Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  13 | 2026-05-14T09:13:47.968Z | `passTurn`               |    200 | https://www.naruto-arena.site/ingame |
|  14 | 2026-05-14T09:13:51.596Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  15 | 2026-05-14T09:13:55.253Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  16 | 2026-05-14T09:13:58.897Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  17 | 2026-05-14T09:14:02.541Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  18 | 2026-05-14T09:14:06.232Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  19 | 2026-05-14T09:14:09.891Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  20 | 2026-05-14T09:14:13.661Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  21 | 2026-05-14T09:14:17.519Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  22 | 2026-05-14T09:14:40.546Z | `passTurn`               |    200 | https://www.naruto-arena.site/ingame |
|  23 | 2026-05-14T09:14:44.248Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  24 | 2026-05-14T09:14:47.879Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  25 | 2026-05-14T09:14:51.673Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  26 | 2026-05-14T09:15:01.927Z | `passTurn`               |    200 | https://www.naruto-arena.site/ingame |
|  27 | 2026-05-14T09:15:05.564Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  28 | 2026-05-14T09:15:09.205Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  29 | 2026-05-14T09:15:12.970Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  30 | 2026-05-14T09:15:35.210Z | `passTurn`               |    200 | https://www.naruto-arena.site/ingame |
|  31 | 2026-05-14T09:15:38.987Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  32 | 2026-05-14T09:15:42.623Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  33 | 2026-05-14T09:15:46.264Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  34 | 2026-05-14T09:15:49.911Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  35 | 2026-05-14T09:15:53.549Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  36 | 2026-05-14T09:15:57.182Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  37 | 2026-05-14T09:16:00.848Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  38 | 2026-05-14T09:16:04.479Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  39 | 2026-05-14T09:16:08.110Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  40 | 2026-05-14T09:16:11.778Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  41 | 2026-05-14T09:16:43.246Z | `passTurn`               |    200 | https://www.naruto-arena.site/ingame |
|  42 | 2026-05-14T09:16:46.942Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  43 | 2026-05-14T09:16:50.568Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  44 | 2026-05-14T09:16:54.262Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  45 | 2026-05-14T09:16:57.958Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  46 | 2026-05-14T09:17:01.600Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  47 | 2026-05-14T09:17:05.395Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  48 | 2026-05-14T09:17:33.318Z | `passTurn`               |    200 | https://www.naruto-arena.site/ingame |
|  49 | 2026-05-14T09:17:36.949Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  50 | 2026-05-14T09:17:40.581Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  51 | 2026-05-14T09:17:44.313Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  52 | 2026-05-14T09:17:48.114Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  53 | 2026-05-14T09:18:02.574Z | `passTurn`               |    200 | https://www.naruto-arena.site/ingame |
|  54 | 2026-05-14T09:18:06.242Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  55 | 2026-05-14T09:18:09.871Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  56 | 2026-05-14T09:18:13.641Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  57 | 2026-05-14T09:18:26.585Z | `passTurn`               |    200 | https://www.naruto-arena.site/ingame |
|  58 | 2026-05-14T09:18:30.212Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  59 | 2026-05-14T09:18:33.848Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  60 | 2026-05-14T09:18:37.495Z | `requestEndTurn`         |    200 | https://www.naruto-arena.site/ingame |
|  61 | 2026-05-14T09:18:39.696Z | `connectSelection`       |    200 | https://www.naruto-arena.site/ingame |

## Action Schemas

## `checkIfConfirmedBattle`

- Count: 1
- First record: 4
- Last record: 4
- Statuses: 200:1
- Request payload variants: 1
- Response body variants: 1
- Sample file: `data/protocol/samples/checkIfConfirmedBattle.sample.json`

### Request Payload Schema

```json
{
  "type": "object",
  "keys": {
    "action": "string"
  }
}
```

### Response Body Schema

```json
{
  "type": "object",
  "keys": {
    "action": "string"
  }
}
```

## `checkIfInBattle`

- Count: 1
- First record: 3
- Last record: 3
- Statuses: 200:1
- Request payload variants: 1
- Response body variants: 1
- Sample file: `data/protocol/samples/checkIfInBattle.sample.json`

### Request Payload Schema

```json
{
  "type": "object",
  "keys": {
    "action": "string",
    "languagePreference": "string"
  }
}
```

### Response Body Schema

```json
{
  "type": "object",
  "keys": {
    "action": "string"
  }
}
```

## `connectBattle`

- Count: 1
- First record: 5
- Last record: 5
- Statuses: 200:1
- Request payload variants: 1
- Response body variants: 1
- Sample file: `data/protocol/samples/connectBattle.sample.json`

### Request Payload Schema

```json
{
  "type": "object",
  "keys": {
    "action": "string",
    "languagePreference": "string"
  }
}
```

### Response Body Schema

````json
{
  "type": "object",
  "keys": {
    "action": "string",
    "content": {
      "type": "object",
      "keys": {
        "username": "boolean",
        "battleState": {
          "type": "object",
          "keys": {
            "players": {
              "type": "array",
              "length": 2,
              "item": {
                "type": "object",
                "keys": {
                  "playerId": "string",
                  "team": "object_max_depth",
                  "chakra": {
                    "type": "array",
                    "length": 1,
                    "item": "max_depth"
                  },
                  "queue": {
                    "type": "array",
                    "length": 0,
                    "item": "max_depth"
                  },
                  "avatar_temp": "string",
                  "border_temp": "string",
                  "info": "object_max_depth"
                }
              }
            },
            "turn": "string",
            "characters": {
              "type": "array",
              "length": 6,
              "item": {
                "type": "object",
                "keys": {
                  "name": "string",
                  "description": "string",
                  "descriptionBR": "string",
                  "url": "string",
                  "themepic": "string",
                  "skills": {
                    "type": "array",
                    "length": 4,
                    "item": "max_depth"

---

# Battle State
# Naruto-Arena Classic — Battle State Model

> Generated from recorded `/api/handleingame` match traffic.

- Generated at: 2026-05-14T09:37:07.695Z
- Session dir: `data/traffic/2026-05-14T09-12-13-865Z`
- Battle state records: 18

## Observed Battle Lifecycle

```txt
connectSelection
searchGame
checkIfInBattle
checkIfConfirmedBattle
connectBattle
passTurn -> submits player queue and random chakra spending
requestEndTurn -> polls until updated battle state is returned
repeat passTurn/requestEndTurn until match ends
connectSelection -> return to selection after match
````

## Core Battle State Shape

```ts
{
  action: "endTurn" | string,
  content: {
    players: [
      {
        playerId: string,
        team: {
          char0: CharacterBattleState,
          char1: CharacterBattleState,
          char2: CharacterBattleState
        },
        info: {
          win: number,
          lose: number,
          streak: number,
          xp: number,
          level: number,
          rank: string,
          clan: string,
          ladderrank: number
        }
      }
    ],
    turn: string
  }
}

type CharacterBattleState = {
  name: string,
  health: number,
  icon: ActiveEffect[],
  customFacepic: string | null
}

type ActiveEffect = {
  name: string,
  effects: Array<{ text: string, duration: string, isNothing?: boolean }>,
  stacks: number,
  self: number,
  id: string
}
```

## Submitted Turn Shape

```ts
{
  action: "passTurn",
  queue: Array<{
    name: string,
    menu_local?: [number, number, number],
    usedOn?: { s: 0 | 1, i: 0 | 1 | 2 },
    new?: true,
    assignedSkill?: { char: number, index: number },
    encryptItem?: string
  }>,
  exchangeInformation: unknown[],
  removedChakra: Array<"Tai" | "Blood" | "Nin" | "Gen">,
  languagePreference: "English",
  recyleKeys: boolean
}
```

## Coordinate Interpretation

- `usedOn.s = 0` appears to mean own/player side.
- `usedOn.s = 1` appears to mean opponent/enemy side.
- `usedOn.i = 0..2` is character slot.
- `assignedSkill.char = 0..2` is your caster slot.
- `assignedSkill.index = skill index` maps to the character skill array.
- `menu_local = [0, casterSlot, skillIndex]` appears to duplicate/encode local UI position.
- `removedChakra` contains specific chakra spent for random-cost requirements.
- `encryptItem` appears for continuing/replacement/server-issued skill tokens and must be treated as opaque.

## Timeline Summary

|   # | Request          | Response  | Turn       | Submitted skills                                                                                | Removed chakra  |
| --: | ---------------- | --------- | ---------- | ----------------------------------------------------------------------------------------------- | --------------- |
|   6 | `passTurn`       | `endTurn` | luzidtraum | Super-Weighted Boulder Technique, Shadow Clones: Rasengan                                       | Nin             |
|  12 | `requestEndTurn` | `endTurn` | mestsxxx   |                                                                                                 |                 |
|  13 | `passTurn`       | `endTurn` | luzidtraum | Shadow Clones: Rasengan, Explosive Water Shock Wave, Kyuubi Boost                               | Blood           |
|  21 | `requestEndTurn` | `endTurn` | mestsxxx   |                                                                                                 |                 |
|  22 | `passTurn`       | `endTurn` | luzidtraum | Water Prison Technique, Oodama Rasengan                                                         | Blood           |
|  25 | `requestEndTurn` | `endTurn` | mestsxxx   |                                                                                                 |                 |
|  26 | `passTurn`       | `endTurn` | luzidtraum | Detachment of Primitive World, Kyuubi Empowered Rasengan, Five Man-Eating Sharks                |                 |
|  29 | `requestEndTurn` | `endTurn` | mestsxxx   |                                                                                                 |                 |
|  30 | `passTurn`       | `endTurn` | luzidtraum | Water Prison Technique, Effortless Flight, Shadow Clones: Rasengan                              | Gen, Nin        |
|  40 | `requestEndTurn` | `endTurn` | mestsxxx   |                                                                                                 |                 |
|  41 | `passTurn`       | `endTurn` | luzidtraum | Shadow Clones: Rasengan, Five Man-Eating Sharks, Detachment of Primitive World, Oodama Rasengan | Blood           |
|  47 | `requestEndTurn` | `endTurn` | mestsxxx   |                                                                                                 |                 |
|  48 | `passTurn`       | `endTurn` | luzidtraum | Rock Fist, Kyuubi Boost                                                                         | Tai, Gen        |
|  52 | `requestEndTurn` | `endTurn` | mestsxxx   |                                                                                                 |                 |
|  53 | `passTurn`       | `endTurn` | luzidtraum | Oodama Rasengan, Detachment of Primitive World                                                  |                 |
|  56 | `requestEndTurn` | `endTurn` | mestsxxx   |                                                                                                 |                 |
|  57 | `passTurn`       | `endTurn` | luzidtraum | Three-Tail: Claw Smash, Five Man-Eating Sharks                                                  | Tai, Blood, Gen |
|  60 | `requestEndTurn` | `endGame` |            |                                                                                                 |                 |

## State Snapshots

## Record 6 — passTurn → endTurn

- Turn: luzidtraum
- Winner: none
- Loser: none

### Submitted Queue

- Super-Weighted Boulder Technique | caster=1 skill=1 targetSide=1 targetSlot=2 encrypted=false
- Shadow Clones: Rasengan | caster=0 skill=1 targetSide=1 targetSlot=0 encrypted=false

### Players

#### mestsxxx

- char0: **Uzumaki Naruto (S)** — HP 100
  - Effect: Passive: Three Tails Release | stacks=1 | source=mestsxxx
    - NARUTO HAS 0 KYUUBI RAGE STACK. (INFINITE)
    - EACH TIME NARUTO USES 'OODAMA RASENGAN' OR 'KYUUBI EMPOWERED RASENGAN', HE WILL GAIN 1 KYUUBI RAGE STACK. (INFINITE)
  - Effect: Shadow Clones: Rasengan | stacks=1 | source=mestsxxx
    - THIS CHARACTER WILL IGNORE ALL HARMFUL EFFECTS. (1 TURN LEFT)
- char1: **Tsuchikage (S)** — HP 100
- char2: **Kisame Body Double (S)** — HP 100

#### luzidtraum

- char0: **Kimimaro** — HP 100
  - Effect: Shadow Clones: Rasengan | stacks=1 | source=mestsxxx
    - THIS CHARACTER WILL TAKE 20 PIERCING DAMAGE THE FOLLOWING TURN. (1 TURN LEFT)
    - THIS SKILL CAN BE INTERRUPTED. (1 TURN LEFT)
- char1: **Yakushi Kabuto** — HP 100
- char2: **Naraka Path Pein (S)** — HP 100
  - Effect: Super-Weighted Boulder Technique | stacks=1 | source=mestsxxx
    - THIS CHARACTER'S HARMFUL SKILLS WILL COST 1 ADDITIONAL RANDOM CHAKRA (2 TURN LEFTS (-))
    - IF THIS CHARACTER USES ANY HARMFUL SKILL, THIS SKILL WILL END. (2 TURN LEFTS (-))

## Record 12 — requestEndTurn → endTurn

- Turn: mestsxxx
- Winner: none
- Loser: none

### Players

#### mestsxxx

- char0: **Uzumaki Naruto (S)** — HP 100
  - Effect: Passive: Three Tails Release | stacks=1 | source=mestsxxx
    - NARUTO HAS 0 KYUUBI RAGE STACK. (INFINITE)
    - EACH TIME NARUTO USES 'OODAMA RASENGAN' OR 'KYUUBI EMPOWERED RASENGAN', HE WILL GAIN 1 KYUUBI RAGE STACK. (INFINITE)
  - Effect: Shadow Clones: Rasengan | stacks=1 | source=mestsxxx
    - THIS CHARACTER WILL IGNORE ALL HARMFUL EFFECTS. (END THIS TURN)
  - Effect: Outer Path | stacks=1 | source=luzidtraum
    - THIS CHARACTER WILL TAKE 10 AFFLICTION DAMAGE. (2 TURN LEFTS)
    - 'JUDGEMENT' MAY BE USED ON THIS CHARACTER. (3 TURN LEFTS)
- char1: **Tsuchikage (S)** — HP 90
  - Effect: Outer Path | stacks=1 | source=luzidtraum
    - THIS CHARACTER WILL TAKE 10 AFFLICTION DAMAGE. (2 TURN LEFTS)
    - 'JUDGEMENT' MAY BE USED ON THIS CHARACTER. (3 TURN LEFTS)
- char2: **Kisame Body Double (S)** — HP 90
  - Effect: Outer Path | stacks=1 | source=luzidtraum
    - THIS CHARACTER WILL TAKE 10 AFFLICTION DAMAGE. (2 TURN LEFTS)
    - 'JUDGEMENT' MAY BE USED ON THIS CHARACTER. (3 TURN LEFTS)

#### luzidtraum

- char0: **Kimimaro** — HP 100
  - Effect: Shadow Clones: Rasengan | stacks=1 | source=mestsxxx
    - THIS CHARACTER WILL TAKE 20 PIERCING DAMAGE THE FOLLOWING TURN. (END THIS TURN)
    - THIS SKILL CAN BE INTERRUPTED. (END THIS TURN)
- char1: **Yakushi Kabuto** — HP 100
- char2: **Naraka Path Pein (S)** — HP 100

## Record 13 — passTurn → endTurn

- Turn: luzidtraum
- Winner: none
- Loser: none

### Submitted Queue

- Shadow Clones: Rasengan | caster=? skill=? targetSide=? targetSlot=? encrypted=true
- Explosive Water Shock Wave | caster=2 skill=0 targetSide=1 targetSlot=2 encrypted=false
- Kyuubi Boost | caster=0 skill=2 targetSide=0 targetSlot=0 encrypted=false

### Players

#### mestsxxx

- char0: **Uzumaki Naruto (S)** — HP 90
  - Effect: Passive: Three Tails Release | stacks=1 | source=mestsxxx
    - NARUTO HAS 0 KYUUBI RAGE STACK. (INFINITE)
    - EACH TIME NARUTO USES 'OODAMA RASENGAN' OR 'KYUUBI EMPOWERED RASENGAN', HE WILL GAIN 1 KYUUBI RAGE STACK. (INFINITE)
  - Effect: Outer Path | stacks=1 | source=luzidtraum
    - THIS CHARACTER WILL TAKE 10 AFFLICTION DAMAGE. (2 TURN LEFTS (-))
    - 'JUDGEMENT' MAY BE USED ON THIS CHARACTER. (3 TURN LEFTS (-))
  - Effect: Explosive Water Shock Wave | stacks=1 | source=mestsxxx
    - THIS CHARACTER WILL LOSE ONE LESS CHAKRA IF A CHAKRA REMOVAL OR STEALING SKILL IS USED ON THEM. (3 TURN LEFTS (-))
  - Effect: Kyuubi Boost | stacks=1 | source=mestsxxx
    - THIS CHARACTER HAS 10 POINTS OF DAMAGE REDUCTION. (3 TURN LEFTS)
    - THIS CHARACTER WILL IGNORE ALL STUN EFFECTS. (3 TURN LEFTS)
    - 'OODAMA RASENGAN' IS IMPROVED AND WILL STUN AN ENEMY'S NON-MENTAL SKILLS FOR 1 TURN. (3 TURN LEFTS)
    - THIS SKILL WILL BE REPLACED BY 'KYUUBI EMPOWERED RASENGAN'. (3 TURN LEFTS)
- char1: **Tsuchikage (S)** — HP 90
  - Effect: Outer Path | stacks=1 | source=luzidtraum
    - THIS CHARACTER WILL TAKE 10 AFFLICTION DAMAGE. (2 TURN LEFTS (-))
    - 'JUDGEMENT' MAY BE USED ON THIS CHARACTER. (3 TURN LEFTS (-))
  - Effect: Explosive Water Shock Wave | stacks=1 | source=mestsxxx
    - THIS CHARACTER WILL LOSE ONE LESS CHAKRA IF A CHAKRA REMOVAL OR STEALING SKILL IS USED ON THEM. (3 TURN LEFTS (-))
- char2: **Kisame Body Double (S)** — HP 90
  - Effect: Outer Path | stacks=1 | source=luzidtraum
    - THIS CHARACTER WILL TAKE 10 AFFLICTION DAMAGE. (2 TURN LEFTS (-))
    - 'JUDGEMENT' MAY BE USED ON THIS CHARACTER. (3 TURN LEFTS (-))
  - Effect: Explosive Water Shock Wave | stacks=1 | source=mestsxxx
    - 'WATER PRISON TECHNIQUE' NOW WILL COST 1 RANDOM CHAKRA. (2 TURN LEFTS)
    - 'FIVE MAN-EATING SHARKS' NOW WILL COST 1 NINJUTSU CHAKRA. (2 TURN LEFTS)
    - THIS CHARACTER WILL LOSE ONE LESS CHAKRA IF A CHAKRA REMOVAL OR STEALING SKILL IS USED ON THEM. (3 TURN LEFTS (-))

#### luzidtraum

- char0: **Kimimaro** — HP 80
  - Effect: Explosive Water Shock Wave | stacks=1 | source=mestsxxx
    - IF THIS ENEMY USES A NEW SKILL THE COOLDOWN OF THAT SKILL IS INCREASED BY 1 TURNS. (3 TURN LEFTS (-))
- char1: **Yakushi Kabuto** — HP 100
  - Effect: Explosive Water Shock Wave | stacks=1 | source=mestsxxx
    - IF THIS ENEMY USES A NEW SKILL THE COOLDOWN OF THAT SKILL IS INCREASED BY 1 TURNS. (3 TURN LEFTS (-))
- char2: **Naraka Path Pein (S)** — HP 100
  - Effect: Explosive Water Shock Wave | stacks=1 | source=mestsxxx
    - IF THIS ENEMY USES A NEW SKILL THE COOLDOWN OF THAT SKILL IS INCREASED BY 1 TURNS. (3 TURN LEFTS (-))

## Record 21 — requestEndTurn → endTurn

- Turn: mestsxxx
- Winner: none
- Loser: none

---

# Sync Report

# Naruto-Arena Classic — Sync Report

- Generated at: 2026-05-14T09:08:18.134Z
- Captured account: Mestsxxx
- Character DB generated at: 2026-05-14T09:08:17.799Z
- Characters: 200
- Skills: 897
- Passive skills: 8
- No-cost skills: 71

## Energy Usage Count

- Random: 592
- Blood: 161
- Nin: 143
- Tai: 115
- Gen: 111

## Recommended Maintenance

- Run `npm run sync` manually after visible game updates.
- Add a daily cron if you want silent refresh.
- Run `npm run crawl:links` occasionally to detect added/removed character pages.
- Do not rely on balance patch pages for core character data; `getState` is the current source of truth.

# Final Conversation Notes Before New Chat

## Current Assessment

The project now has enough data for:

- static character database
- skill encyclopedia
- team-builder logic
- AI strategy helper
- protocol lifecycle documentation
- battle-state viewer
- local clone skeleton

It does **not** yet have enough data for a fully faithful mechanics engine, because edge-case interactions still need targeted recordings.

## Confirmed Important Points

- `/ingame getState` is the primary source of truth for character/skill data.
- HTML scraping is fallback only.
- Balance patch crawling is not needed for core correctness because `getState` already reflects current skills.
- Daily cron sync is installed and tested manually.
- Current cron runs `npm run sync` daily at 07:15.
- Full Quick Game traffic was recorded and analyzed.
- The match ended with:

```json
{
  "action": "endGame",
  "content": {
    "var_type": "Quick",
    "endGame": "win"
  }
}
```


## Latest Milestone

- Built `src/print-battle-snapshot.ts`.
- Added `npm run snapshot:battle`.
- Snapshot now prints current turn, chakra, team HP/effects, opponent HP/effects, castable skills, not-affordable skills, unavailable skills, and target maps.
- Affordability is currently per-skill, not full multi-skill queue optimization.


## Clone-First Pivot Checkpoint

The project is pivoting from helper-first to clone-first.

Helper pipeline completed enough for now:
- sync current character database
- record traffic
- analyze protocol
- extract battle states
- extract live skill states
- extract chakra and target maps
- generate battle snapshots
- build decision state
- build legal queue candidates

Clone-first priority now:
1. Build local engine scaffold.
2. Support a small known subset of characters.
3. Replay recorded battles and diff local results against server snapshots.
4. Add mechanics category-by-category.

Do not continue expanding helper/ranking yet.

Clone MVP scope:
- local 3v3 battle state
- team selection from characters.parsed.json
- queue validation
- chakra spending
- cooldown ticking
- HP/death/win checks
- generic effect container
- minimal skill resolver
- recorded-battle replay/diff harness

Initial supported team:
- Uzumaki Naruto (S)
- Tsuchikage (S)
- Kisame Body Double (S)

Initial observed enemy set:
- Kimimaro
- Yakushi Kabuto
- Naraka Path Pein (S)
- Chiyo (S)
- Killer Bee (S)
- Hoshigaki Kisame (S)

Important clone principle:
The current data is enough for engine scaffolding, not enough for a complete faithful engine. Full fidelity requires replay/diff validation and targeted mechanic recordings.
