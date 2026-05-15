# Naruto-Arena Agent Scraper

Local Playwright scraper for building an AI-agent knowledge base for Naruto-Arena Classic.

## Safety model

- No password in code.
- No cookies exported.
- You log in manually in the Playwright browser once.
- The scraper reuses a local browser profile in `.auth/naruto-arena-profile`.
- It reads pages and writes local JSON/Markdown.
- It does not play games, submit battle actions, or automate matches.

## Install

```bash
npm install
npx playwright install chromium
```

## First-time auth

```bash
npm run auth
```

A browser opens. Log in to Naruto-Arena manually. Then return to the terminal and press Enter.

## Crawl everything

```bash
npm run sync
```

Outputs:

```txt
data/characters/character-links.json
data/characters/raw/*.json
data/patches/patches.json
docs/naruto_arena_characters.md
docs/naruto_arena_patches_meta.md
docs/naruto_arena_agent_context_addendum.md
```

## Normal refresh

After a patch/update:

```bash
npm run crawl:patches
npm run crawl:chars
npm run build:md
```

## Debug

```bash
npm run doctor
```
