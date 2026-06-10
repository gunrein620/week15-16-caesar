---
name: jungle-market-design
description: Use this skill to generate well-branded interfaces and assets for Jungle Market (a dark-glass, mint-accent neighborhood second-hand marketplace), for production or throwaway prototypes/mocks. Contains design guidelines, color & type tokens, fonts, the line-icon approach, and reusable UI components.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files
(`styles.css`, `tokens/`, `components/core/`, `ds-cards/`, and the wireframe reference
`중고거래 와이어프레임.html` + `screens/`).

Core rules to honor:
- Dark near-black green canvas; everything on **glass panels**. Mint (`--jm-mint`) is the
  ONLY accent and is reserved for the primary CTA, selected pills, live dots, and 예약중 — never
  decoration. Text on mint is `--jm-ink-0`.
- Korean UI copy, warm and short (해요체). English only for uppercase tracked eyebrows and mono
  data captions. No emoji in chrome.
- Thin line icons (Lucide-style, ~1.7px stroke, currentColor). No emoji/unicode icons.
- Link `styles.css` for tokens; compose with the `.jm-*` classes or the `components/core` React
  wrappers. Use the wireframes as the reference for full-screen layout.

If creating visual artifacts (slides, mocks, throwaway prototypes), copy assets out and create
static HTML files for the user to view. If working on production code, copy assets and read the
rules here to design as an expert in this brand.

If invoked without other guidance, ask the user what they want to build, ask a few focused
questions, then act as an expert designer outputting HTML artifacts or production code.
