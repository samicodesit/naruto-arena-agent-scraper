# Naruto-Arena Classic ??? Clone Requirements

## Known Enough for Clone Skeleton

- Static character database from `/ingame getState`
- Character names, images, descriptions
- Skill names, descriptions, energy costs, classes, cooldowns
- Live battle state shape
- HP, active effects, current turn, current chakra
- Live skill state on player turns
- `cd_on` current cooldown
- `outtagame` availability flag
- Server-resolved replacement skills
- Target maps
- Submitted turn queue shape
- Empty/no-skill pass shape
- Surrender action shape
- Quick win/lose endGame payloads

## Confirmed Protocol Lifecycle

```txt
connectSelection
searchGame
checkIfInBattle
checkIfConfirmedBattle
connectBattle
passTurn
requestEndTurn polling
repeat passTurn/requestEndTurn
requestEndTurn -> endGame
connectSelection
```

## Confirmed Turn Submission

Normal skill turn:

```ts
{
  action: "passTurn",
  queue: [
    {
      name: string,
      menu_local: [0, casterSlot, skillIndex],
      usedOn: { s: 0 | 1, i: 0 | 1 | 2 },
      new: true,
      assignedSkill: { char: number, index: number }
    }
  ],
  exchangeInformation: [],
  removedChakra: Array<"Tai" | "Blood" | "Nin" | "Gen">,
  languagePreference: "English",
  recyleKeys: true
}
```

No-skill pass:

```json
{
  "action": "passTurn",
  "queue": [],
  "exchangeInformation": [],
  "removedChakra": [],
  "languagePreference": "English",
  "recyleKeys": true
}
```

Surrender:

```json
{
  "action": "surrender"
}
```

Surrender result:

```json
{
  "action": "endGame",
  "content": {
    "var_type": "Quick",
    "endGame": "lose"
  }
}
```

Quick win result:

```json
{
  "action": "endGame",
  "content": {
    "var_type": "Quick",
    "endGame": "win"
  }
}
```

## Confirmed Live State Fields

```ts
player.chakra: Array<"Tai" | "Blood" | "Nin" | "Gen">
turnKey: number

skill: {
  outtagame: boolean,
  cd_on: number,
  name: string,
  energy: string[],
  classes: string[],
  cooldown: number,
  target: Record<string, [number, number]>
}
```

## Target Coordinate Model

```txt
00 = own char0
01 = own char1
02 = own char2
10 = enemy char0
11 = enemy char1
12 = enemy char2
```

Working target value interpretation:

```ts
[clickableOrValid, affectedOrHighlighted]
```

## Still Missing for Faithful Engine

- counter success
- reflect success
- invulnerability interaction
- stun preventing skill usage
- chakra steal/remove/gain resolution
- destructible defense damage resolution
- passive trigger cases beyond observed Naruto transform
- exchangeInformation usage
- mission progress update
- ladder vs quick differences

## Next Engineering Task

Build a compact battle snapshot generator that reads `data/protocol/battle-states.json` and prints the latest usable player-turn state for AI analysis.
