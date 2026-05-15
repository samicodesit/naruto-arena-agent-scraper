# Naruto-Arena Classic — Battle State Model

> Generated from recorded `/api/handleingame` match traffic.

- Generated at: 2026-05-14T09:59:07.793Z
- Session dir: `data/traffic/2026-05-14T09-57-27-164Z`
- Battle state records: 4

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
```

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

| # | Request | Response | Turn | Submitted skills | Removed chakra |
|---:|---|---|---|---|---|
| 6 | `passTurn` | `endTurn` | ghokame-kak |  |  |
| 19 | `requestEndTurn` | `endTurn` | mestsxxx |  |  |
| 20 | `passTurn` | `endTurn` | ghokame-kak | Kyuubi Boost | Blood |
| 22 | `surrender` | `endGame` |  |  |  |

## State Snapshots

## Record 6 — passTurn → endTurn

- Turn: ghokame-kak
- Winner: none
- Loser: none

### Players

#### mestsxxx

- char0: **Uzumaki Naruto (S)** — HP 100
  - Effect: Passive: Three Tails Release | stacks=1 | source=mestsxxx
    - NARUTO HAS 0 KYUUBI RAGE STACK. (INFINITE)
    - EACH TIME NARUTO USES 'OODAMA RASENGAN' OR 'KYUUBI EMPOWERED RASENGAN', HE WILL GAIN 1 KYUUBI RAGE STACK. (INFINITE)
- char1: **Tsuchikage (S)** — HP 100
- char2: **Kisame Body Double (S)** — HP 100

#### ghokame-kak

- char0: **Chiyo (S)** — HP 100
- char1: **Killer Bee (S)** — HP 100
- char2: **Hoshigaki Kisame (S)** — HP 100

## Record 19 — requestEndTurn → endTurn

- Turn: mestsxxx
- Winner: none
- Loser: none

### Players

#### mestsxxx

- char0: **Uzumaki Naruto (S)** — HP 95
  - Effect: Passive: Three Tails Release | stacks=1 | source=mestsxxx
    - NARUTO HAS 0 KYUUBI RAGE STACK. (INFINITE)
    - EACH TIME NARUTO USES 'OODAMA RASENGAN' OR 'KYUUBI EMPOWERED RASENGAN', HE WILL GAIN 1 KYUUBI RAGE STACK. (INFINITE)
  - Effect: Hungry Sharks | stacks=1 | source=ghokame-kak
    - THIS CHARACTER WILL TAKE 5 PIERCING DAMAGE. (INFINITE)
- char1: **Tsuchikage (S)** — HP 95
  - Effect: Hungry Sharks | stacks=1 | source=ghokame-kak
    - THIS CHARACTER WILL TAKE 5 PIERCING DAMAGE. (INFINITE)
- char2: **Kisame Body Double (S)** — HP 95
  - Effect: Hungry Sharks | stacks=1 | source=ghokame-kak
    - THIS CHARACTER WILL TAKE 5 PIERCING DAMAGE. (INFINITE)

#### ghokame-kak

- char0: **Chiyo (S)** — HP 100
  - Effect: Ally Puppetry | stacks=1 | source=ghokame-kak
    - THIS SKILL WILL BE REPLACED BY 'ONE'S OWN LIFE REINCARNATION'. (2 TURN LEFTS)
- char1: **Killer Bee (S)** — HP 100
  - Effect: Kenjutsu | stacks=1 | source=ghokame-kak
    - IF AN ENEMY USES A NEW HARMFUL NON-MENTAL DAMAGING SKILL BEE, THEY WILL TAKE 10 PIERCING DAMAGE. (4 TURN LEFTS)
    - 'BUZZ SAW' WILL DEAL 10 ADDITIONAL DAMAGE. (4 TURN LEFTS)
    - 'KENJUTSU' WILL BE REPLACED BY 'FINAL KENJUTSU'. (4 TURN LEFTS)
  - Effect: Ally Puppetry | stacks=1 | source=ghokame-kak
    - EACH TURN, THAT ALLY WILL NULLIFY THE FIRST HARMFUL PHYSICAL OR CHAKRA NON-AFFLICTION SKILL USED ON THEM. (2 TURN LEFTS)
    - THIS CHARACTER'S MELEE SKILLS ARE IMPROVED AND WILL DEAL 25% MORE DAMAGE. (2 TURN LEFTS)
- char2: **Hoshigaki Kisame (S)** — HP 100
  - Effect: Hungry Sharks | stacks=1 | source=ghokame-kak
    - HUNGRY SHARKS ARE HUNTING THEIR PREY. (INFINITE)

## Record 20 — passTurn → endTurn

- Turn: ghokame-kak
- Winner: none
- Loser: none

### Submitted Queue

- Kyuubi Boost | caster=0 skill=2 targetSide=0 targetSlot=0 encrypted=false

### Players

#### mestsxxx

- char0: **Uzumaki Naruto (S)** — HP 85
  - Effect: Passive: Three Tails Release | stacks=1 | source=mestsxxx
    - NARUTO HAS 0 KYUUBI RAGE STACK. (INFINITE)
    - EACH TIME NARUTO USES 'OODAMA RASENGAN' OR 'KYUUBI EMPOWERED RASENGAN', HE WILL GAIN 1 KYUUBI RAGE STACK. (INFINITE)
  - Effect: Hungry Sharks | stacks=1 | source=ghokame-kak
    - THIS CHARACTER WILL TAKE 5 PIERCING DAMAGE. (INFINITE)
  - Effect: Kyuubi Boost | stacks=1 | source=mestsxxx
    - THIS CHARACTER HAS 10 POINTS OF DAMAGE REDUCTION. (3 TURN LEFTS)
    - THIS CHARACTER WILL IGNORE ALL STUN EFFECTS. (3 TURN LEFTS)
    - 'OODAMA RASENGAN' IS IMPROVED AND WILL STUN AN ENEMY'S NON-MENTAL SKILLS FOR 1 TURN. (3 TURN LEFTS)
    - THIS SKILL WILL BE REPLACED BY 'KYUUBI EMPOWERED RASENGAN'. (3 TURN LEFTS)
- char1: **Tsuchikage (S)** — HP 95
  - Effect: Hungry Sharks | stacks=1 | source=ghokame-kak
    - THIS CHARACTER WILL TAKE 5 PIERCING DAMAGE. (INFINITE)
- char2: **Kisame Body Double (S)** — HP 95
  - Effect: Hungry Sharks | stacks=1 | source=ghokame-kak
    - THIS CHARACTER WILL TAKE 5 PIERCING DAMAGE. (INFINITE)

#### ghokame-kak

- char0: **Chiyo (S)** — HP 100
  - Effect: Ally Puppetry | stacks=1 | source=ghokame-kak
    - THIS SKILL WILL BE REPLACED BY 'ONE'S OWN LIFE REINCARNATION'. (2 TURN LEFTS (-))
- char1: **Killer Bee (S)** — HP 100
  - Effect: Kenjutsu | stacks=1 | source=ghokame-kak
    - IF AN ENEMY USES A NEW HARMFUL NON-MENTAL DAMAGING SKILL BEE, THEY WILL TAKE 10 PIERCING DAMAGE. (4 TURN LEFTS (-))
    - 'BUZZ SAW' WILL DEAL 10 ADDITIONAL DAMAGE. (4 TURN LEFTS (-))
    - 'KENJUTSU' WILL BE REPLACED BY 'FINAL KENJUTSU'. (4 TURN LEFTS (-))
  - Effect: Ally Puppetry | stacks=1 | source=ghokame-kak
    - EACH TURN, THAT ALLY WILL NULLIFY THE FIRST HARMFUL PHYSICAL OR CHAKRA NON-AFFLICTION SKILL USED ON THEM. (2 TURN LEFTS (-))
    - THIS CHARACTER'S MELEE SKILLS ARE IMPROVED AND WILL DEAL 25% MORE DAMAGE. (2 TURN LEFTS (-))
- char2: **Hoshigaki Kisame (S)** — HP 100
  - Effect: Hungry Sharks | stacks=1 | source=ghokame-kak
    - HUNGRY SHARKS ARE HUNTING THEIR PREY. (INFINITE)

## Record 22 — surrender → endGame

- Turn: unknown
- Winner: none
- Loser: player

### Players
