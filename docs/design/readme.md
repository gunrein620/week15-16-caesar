# Jungle Market — Design System

A dark-glass marketplace design language for **Jungle Market**, a neighborhood
second-hand trading service (the 당근-style "sell to people near you" concept) wrapped
in a **board metaphor**: category grids, live feeds, and town maps presented as glass
panels floating on near-black, with a single mint accent.

> Scope: this is a **visual style reference**. Example copy ("거누땅", "역삼동", prices)
> is placeholder content for specimens — not facts about any real user or place.

**Source of this system:** extracted from the wireframe exploration in this project
(`중고거래 와이어프레임.html` + `screens/*.jsx` + `lib.jsx`). The wireframes are the
living reference for how these tokens and components compose into full screens.

---

## CONTENT FUNDAMENTALS (voice & copy)

- **Language:** Korean UI throughout. English is used **only** for structural micro-labels
  (eyebrows like `MARKET BOARD`, `LIVE FEED`, `NEW LISTING`) and mono data captions
  (`MY TOWN`). Never write body copy or buttons in English.
- **Tone:** warm, short, plain. Friendly 해요체 ("바로 거래하는", "봬요", "올릴 수 있어요").
  Never formal 합니다체, never marketing hype.
- **Person:** speak *to* the user softly; avoid "저희/당사". Verbs are action-first and brief
  ("판매하기", "채팅하기", "거래 완료").
- **Placeholders are concrete & helpful:** "예) 아이폰 13 미니 128GB 미드나이트",
  "상품 상태, 사용 기간, 거래 방법을 적어 주세요."
- **Numbers are minimal & meaningful:** 관심 14 · 채팅 3 · 매너온도 42.5℃. No vanity stats.
- **No emoji** in UI chrome. (A single ":)" may appear inside a fake chat message as content,
  never in labels.)
- **Status words are 2–4 chars:** 예약중 / 나눔 / 거래완료 / 신고됨.

## VISUAL FOUNDATIONS

- **Mood:** near-black green canvas (`--jm-bg #090b0c`) with a soft mint glow in the top-right.
  Everything sits on **glass panels** — translucent dark gradient with a faint mint-tinted hairline
  border and a deep, soft drop shadow (`--shadow-panel`).
- **One accent, used sparingly:** mint (`--jm-mint #76f8b7`) is reserved for the primary CTA,
  the selected filter pill, the "live" dot, 예약중 chips, and key icons. It is **never** a
  background wash or decoration. On mint, text is the deep green-black `--jm-ink-0 #06140d`.
- **Color vibe of imagery:** cool, dark, low-key. Photo placeholders are striped wells
  (`--jm-photo`) with a mono caption; real imagery should read calm/neutral, not saturated.
- **Type:** Space Grotesk for uppercase tracked eyebrows + mono data; Noto Sans KR for titles
  (700) and body (400) and product-card titles (500). Large titles use slight negative tracking.
- **Corner radii:** soft and generous — pills 999px, glass panels 28px, inner panels 24px,
  inputs/cards 16px, thumbnails 12px, chips 8px.
- **Borders:** 1px mint-tinted hairlines (`--jm-line` 16%, `--jm-line-strong` 32%); plain
  white 5% for inset wells. No heavy or dark borders.
- **Shadows:** deep & soft, never harsh. Colored glow appears **only** on the mint CTA
  (`--glow-accent`). Inner wells use a darker fill, not an inset shadow.
- **Transparency & blur:** glass panels are translucent over the dark bg; modal scrims use
  `rgba(4,7,6,0.66)` + a light backdrop blur. Don't over-blur content panels.
- **Layout:** desktop board. A top utility bar (brand + nav pills + 검색/알림 + mint CTA),
  then content in CSS-grid panels (2–3 columns). Panels pad 20–34px and use `gap`, never
  margin chains. Min tap target 44px.
- **State / completed items:** dim the whole card to ~0.55 opacity and add a `muted` chip
  (거래완료) rather than graying individual elements.
- **Animation:** restrained. Fades and short eases on hover/selection; the live dot may pulse.
  No bounce, no infinite decorative motion.
- **Hover:** mint surfaces → `--jm-mint-strong`; ghost pills → faint surface fill.
  **Press:** subtle, no large shrink.

## ICONOGRAPHY

- **Approach:** thin **line icons**, 1.6–1.7px stroke, rounded caps/joins, on an 18×18 grid,
  drawn `currentColor` so they inherit text or mint color. They are intentionally simple
  (search, plus, chat, heart, pin, bell, arrow, send, camera, grid, check, clock, won).
- The wireframes ship an inline `Icon` component (see `lib.jsx` → `window.Icon`) — this is the
  canonical set. For production, substitute **Lucide** (matching stroke/round style) via CDN;
  flagged as a substitution since there is no proprietary icon font.
- The "spark" glyph (4-point star) is the brand mark used in eyebrows and the logo lockup.
- **No emoji, no unicode glyph icons** in chrome. Status is communicated with chips, not icons.

---

## INDEX / MANIFEST

Root:
- `styles.css` — global entry (link this one file). `@import`s everything below.
- `tokens/colors.css` · `tokens/typography.css` · `tokens/spacing.css` — design tokens.
- `fonts.css` — Space Grotesk + Noto Sans KR (Google Fonts CDN).
- `components.css` — canonical `.jm-*` component classes (consumed by the React wrappers).
- `readme.md` (this file) · `SKILL.md`.

Components (`components/core/`) — React wrappers over the `.jm-*` classes:
`Button`, `Pill`, `Chip`, `Card`, `Avatar`, `Field`.

Specimen cards (`ds-cards/`) — Colors, Type, Spacing, Components (render in the Design System tab).

Full-screen reference (this project root):
- `중고거래 와이어프레임.html` — 5 screens × 4 layout variants on a design canvas
  (홈/게시판 피드 · 상품 상세 · 상품 등록 · 채팅/거래 · 로그인/회원가입).
  `screens/*.jsx` hold each screen's variants; `lib.jsx` holds shared primitives.

## Sharing
To share this with your org, open the **Share** menu and set the file/project **type to
Design System** so others can view and consume it.
