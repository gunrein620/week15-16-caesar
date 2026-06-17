const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.defineLayout({ name: "W", width: 13.333, height: 7.5 });
pres.layout = "W";
pres.author = "Caesar";
pres.title = "RAG · MCP · Agent";

const F = "Pretendard";
const C = {
  WHITE: "FFFFFF", INK: "222746", BODY: "565C77", MUTED: "9AA0B4",
  PRIMARY: "5B7FE3", PRIMARY_DK: "3653B8", PRIMARY_LT: "9DB2EE", FOOTER: "5C79DD",
  BLUE_FILL: "EAF0FD", BLUE_TINT: "F4F8FF", BLUE_BORDER: "C4D3F6",
  GRAY_FILL: "EFF1F6", GRAY_TINT: "F8F9FC", GRAY_TEXT: "464C60", GRAY_DOT: "8C93A8",
  TEAL: "12936A", TEAL_FILL: "E7F5EF", TEAL_TEXT: "0E5C42", TEAL_BORDER: "B4DECC",
  RED: "CC4B47", RED_FILL: "FBECEC", RED_TEXT: "A6342F", RED_BORDER: "EEBDBB",
  CARD_LINE: "E9ECF4", DIV: "ECEEF5",
};
const S = pres.shapes;
const R = 0.13;
const soft = () => ({ type: "outer", color: "9AA3BE", blur: 11, offset: 3, angle: 90, opacity: 0.13 });

function logo(s) {
  s.addShape(S.RECTANGLE, { x: 0.6, y: 0.42, w: 0.13, h: 0.13, fill: { color: C.PRIMARY } });
  s.addShape(S.RECTANGLE, { x: 0.75, y: 0.42, w: 0.13, h: 0.13, fill: { color: C.PRIMARY_LT } });
  s.addShape(S.RECTANGLE, { x: 0.6, y: 0.57, w: 0.13, h: 0.13, fill: { color: C.PRIMARY_LT } });
  s.addShape(S.RECTANGLE, { x: 0.75, y: 0.57, w: 0.13, h: 0.13, fill: { color: C.PRIMARY } });
  s.addText("Caesar", { x: 0.96, y: 0.4, w: 2.2, h: 0.34, fontFace: F, fontSize: 15, bold: true, color: C.INK, valign: "middle", margin: 0 });
}

function footer(s, page) {
  s.addShape(S.RECTANGLE, { x: 0, y: 7.08, w: 13.333, h: 0.42, fill: { color: C.FOOTER } });
  s.addText("RAG · MCP · Agent", { x: 0.6, y: 7.08, w: 8, h: 0.42, fontFace: F, fontSize: 10, bold: true, color: C.WHITE, valign: "middle", margin: 0 });
  s.addText(page, { x: 11.0, y: 7.08, w: 1.733, h: 0.42, fontFace: F, fontSize: 10, color: "E5ECFB", align: "right", valign: "middle", margin: 0 });
}

function title(s, runs) {
  s.addText(runs.map((r) => ({ text: r.t, options: { color: r.c, bold: true } })),
    { x: 0.6, y: 0.86, w: 12.1, h: 0.6, fontFace: F, fontSize: 28, valign: "middle", margin: 0 });
}

function softCard(s, x, y, w, h, fill) {
  s.addShape(S.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: R, fill: { color: fill || C.WHITE }, line: { color: C.CARD_LINE, width: 1 }, shadow: soft() });
}

function tagPill(s, x, y, w, h, fill, textColor, txt) {
  s.addShape(S.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: h / 2, fill: { color: fill } });
  s.addText(txt, { x, y, w, h, fontFace: F, fontSize: 10.5, bold: true, color: textColor, align: "center", valign: "middle", margin: 0 });
}

function chip(s, x, y, w, h, txt, fill, textColor, fs) {
  s.addShape(S.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1, fill: { color: fill } });
  s.addText(txt, { x: x + 0.2, y, w: w - 0.36, h, fontFace: F, fontSize: fs, bold: true, color: textColor, valign: "middle", margin: 0 });
}

function divider(s, x, y, w) {
  s.addShape(S.LINE, { x, y, w, h: 0, line: { color: C.DIV, width: 1 } });
}

function markedList(s, x, y, w, h, items, marker, fs) {
  const runs = [];
  items.forEach((t) => {
    runs.push({ text: "•  ", options: { color: marker, bold: true, fontSize: fs } });
    runs.push({ text: t, options: { color: C.BODY, fontSize: fs, breakLine: true, paraSpaceAfter: 11 } });
  });
  s.addText(runs, { x, y, w, h, fontFace: F, valign: "top", margin: 0 });
}

function resultRow(s, x, y, w, h, fill, mark, markColor, txt, txtColor) {
  s.addShape(S.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1, fill: { color: fill } });
  s.addText([
    { text: mark + "  ", options: { bold: true, fontSize: 14, color: markColor } },
    { text: txt, options: { fontSize: 13.5, bold: true, color: txtColor } },
  ], { x: x + 0.22, y, w: w - 0.4, h, fontFace: F, valign: "middle", margin: 0 });
}

function band(s, x, y, w, h, runs) {
  s.addShape(S.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: R, fill: { color: C.BLUE_FILL } });
  s.addText(runs, { x: x + 0.3, y, w: w - 0.6, h, fontFace: F, align: "center", valign: "middle", margin: 0 });
}

function badge(s, cx, cy, n, color) {
  const d = 0.42;
  s.addShape(S.OVAL, { x: cx - d / 2, y: cy - d / 2, w: d, h: d, fill: { color }, line: { color: C.WHITE, width: 2 }, shadow: soft() });
  s.addText(String(n), { x: cx - d / 2, y: cy - d / 2, w: d, h: d, fontFace: F, fontSize: 13, bold: true, color: C.WHITE, align: "center", valign: "middle", margin: 0 });
}

function stepBox(s, x, y, w, h, fill, titleColor, t, sub) {
  s.addShape(S.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: R, fill: { color: fill }, line: { color: C.CARD_LINE, width: 1 }, shadow: soft() });
  s.addText([
    { text: t, options: { bold: true, fontSize: 14, color: titleColor, breakLine: true } },
    { text: sub, options: { fontSize: 10.5, color: C.BODY } },
  ], { x: x + 0.1, y: y + 0.12, w: w - 0.2, h: h - 0.12, fontFace: F, align: "center", valign: "middle", margin: 0 });
}

/* ---------- Slide 1: Cover ---------- */
function slideCover() {
  const s = pres.addSlide();
  s.background = { color: C.WHITE };
  s.addShape(S.OVAL, { x: 8.9, y: 0.5, w: 5.4, h: 5.4, fill: { color: "F1F5FE" } });
  logo(s);
  s.addText("RESCENE 팬 아카이브 · Week 15–16", { x: 0.8, y: 2.0, w: 7.5, h: 0.4, fontFace: F, fontSize: 14, bold: true, color: C.PRIMARY_DK, margin: 0 });
  s.addText("왜 DB가 아니라", { x: 0.8, y: 2.45, w: 8, h: 0.8, fontFace: F, fontSize: 34, bold: true, color: C.INK, margin: 0 });
  s.addText("RAG 인가?", { x: 0.78, y: 3.25, w: 8, h: 1.1, fontFace: F, fontSize: 58, bold: true, color: C.PRIMARY, margin: 0 });
  s.addText("키워드를 넘어 '의미'로 검색하는 팬 아카이브", { x: 0.82, y: 4.62, w: 7.6, h: 0.5, fontFace: F, fontSize: 16, color: C.BODY, margin: 0 });
  s.addShape(S.ROUNDED_RECTANGLE, { x: 0.82, y: 5.22, w: 1.0, h: 0.5, rectRadius: 0.25, fill: { color: C.PRIMARY }, shadow: soft() });
  s.addText("→", { x: 0.82, y: 5.19, w: 1.0, h: 0.5, fontFace: F, fontSize: 20, bold: true, color: C.WHITE, align: "center", valign: "middle", margin: 0 });

  const px = 9.6, py = 1.45, pw = 2.95, ph = 4.75;
  s.addShape(S.ROUNDED_RECTANGLE, { x: px, y: py, w: pw, h: ph, rectRadius: 0.3, fill: { color: C.WHITE }, line: { color: C.BLUE_BORDER, width: 1.5 }, shadow: soft() });
  s.addShape(S.ROUNDED_RECTANGLE, { x: px + 0.95, y: py + 0.22, w: 1.05, h: 0.12, rectRadius: 0.06, fill: { color: "E2E7F2" } });
  s.addText("RESCENE AI", { x: px, y: py + 0.45, w: pw, h: 0.3, fontFace: F, fontSize: 11.5, bold: true, color: C.PRIMARY_DK, align: "center", margin: 0 });
  s.addShape(S.ROUNDED_RECTANGLE, { x: px + 0.3, y: py + 1.0, w: 1.95, h: 0.7, rectRadius: 0.16, fill: { color: C.GRAY_FILL } });
  s.addText("데뷔 초 힘들었던\n얘기 영상?", { x: px + 0.42, y: py + 1.0, w: 1.75, h: 0.7, fontFace: F, fontSize: 9.5, color: C.GRAY_TEXT, valign: "middle", margin: 0 });
  s.addShape(S.ROUNDED_RECTANGLE, { x: px + 0.72, y: py + 1.88, w: 1.95, h: 0.76, rectRadius: 0.16, fill: { color: C.PRIMARY } });
  s.addText("EP.2 3:24 장면\n찾았어요 ✓", { x: px + 0.84, y: py + 1.88, w: 1.75, h: 0.76, fontFace: F, fontSize: 9.5, color: C.WHITE, valign: "middle", margin: 0 });
  s.addShape(S.ROUNDED_RECTANGLE, { x: px + 0.3, y: py + 2.86, w: 2.37, h: 0.92, rectRadius: 0.14, fill: { color: C.BLUE_TINT }, line: { color: C.BLUE_BORDER, width: 1 } });
  s.addText([{ text: "출처 [1] ", options: { bold: true, color: C.PRIMARY_DK } }, { text: "YouTube · 자막", options: { color: C.BODY } }], { x: px + 0.45, y: py + 2.96, w: 2.1, h: 0.3, fontFace: F, fontSize: 9, margin: 0 });
  s.addText("데뷔 비하인드 EP.2", { x: px + 0.45, y: py + 3.27, w: 2.1, h: 0.35, fontFace: F, fontSize: 10, bold: true, color: C.INK, margin: 0 });

  s.addShape(S.RECTANGLE, { x: 0, y: 6.6, w: 13.333, h: 0.9, fill: { color: C.FOOTER } });
  s.addText("Caesar", { x: 0.6, y: 6.6, w: 4, h: 0.9, fontFace: F, fontSize: 16, bold: true, color: C.WHITE, valign: "middle", margin: 0 });
  s.addText("RAG · MCP · Agent 서비스", { x: 8.0, y: 6.6, w: 4.733, h: 0.9, fontFace: F, fontSize: 13, color: "E5ECFB", align: "right", valign: "middle", margin: 0 });
}

/* ---------- Slide 2: Problem ---------- */
function slideProblem(opts = {}) {
  const s = pres.addSlide();
  s.background = { color: C.WHITE };
  if (opts.brand !== false) { logo(s); footer(s, opts.page); }
  title(s, [{ t: "팬은 키워드가 아니라 ", c: C.INK }, { t: "'말'", c: C.PRIMARY }, { t: "로 묻는다", c: C.INK }]);

  s.addShape(S.ROUNDED_RECTANGLE, { x: 0.6, y: 1.72, w: 12.13, h: 0.95, rectRadius: R, fill: { color: C.BLUE_TINT }, line: { color: C.BLUE_BORDER, width: 1 } });
  s.addText("팬이 검색창에 쓰는 말", { x: 0.95, y: 1.85, w: 11, h: 0.3, fontFace: F, fontSize: 11, bold: true, color: C.PRIMARY_DK, margin: 0 });
  s.addText("“데뷔 초에 힘들었던 얘기 나온 영상”", { x: 0.95, y: 2.18, w: 11.4, h: 0.45, fontFace: F, fontSize: 18, bold: true, color: C.INK, margin: 0 });

  const yt = 2.98, hh = 2.72;
  softCard(s, 0.6, yt, 5.4, hh, C.GRAY_TINT);
  s.addText("질문이 쓴 단어", { x: 0.88, y: yt + 0.22, w: 5, h: 0.4, fontFace: F, fontSize: 14.5, bold: true, color: C.INK, margin: 0 });
  chip(s, 0.88, yt + 0.82, 4.84, 0.62, "힘들었던", C.GRAY_FILL, C.GRAY_TEXT, 15);
  chip(s, 0.88, yt + 1.58, 4.84, 0.62, "데뷔 초", C.GRAY_FILL, C.GRAY_TEXT, 15);

  softCard(s, 7.33, yt, 5.4, hh, C.BLUE_TINT);
  s.addText("영상 자막의 실제 단어", { x: 7.61, y: yt + 0.22, w: 5, h: 0.4, fontFace: F, fontSize: 14.5, bold: true, color: C.PRIMARY_DK, margin: 0 });
  chip(s, 7.61, yt + 0.82, 4.84, 0.62, "연습생 때 매일 울었어요", C.WHITE, C.GRAY_TEXT, 14);
  chip(s, 7.61, yt + 1.58, 4.84, 0.62, "데뷔 준비 진짜 빡셌죠", C.WHITE, C.GRAY_TEXT, 14);

  const cx = 6.665, cy = yt + hh / 2;
  s.addShape(S.OVAL, { x: cx - 0.4, y: cy - 0.4, w: 0.8, h: 0.8, fill: { color: C.WHITE }, line: { color: C.RED_BORDER, width: 2 }, shadow: soft() });
  s.addText("≠", { x: cx - 0.4, y: cy - 0.44, w: 0.8, h: 0.8, fontFace: F, fontSize: 28, bold: true, color: C.RED, align: "center", valign: "middle", margin: 0 });

  band(s, 0.6, 6.02, 12.13, 0.78, [
    { text: "같은 의미인데 단어가 안 겹친다", options: { bold: true, fontSize: 16, color: C.PRIMARY_DK, breakLine: true } },
    { text: "키워드 검색은 여기서 멈춘다", options: { fontSize: 12.5, color: C.BODY } },
  ]);
}

/* ---------- Slide 3: DB vs RAG ---------- */
function slideDbVsRag(opts = {}) {
  const s = pres.addSlide();
  s.background = { color: C.WHITE };
  if (opts.brand !== false) { logo(s); footer(s, opts.page); }
  title(s, [{ t: "DB 검색", c: C.INK }, { t: "  vs  ", c: C.MUTED }, { t: "RAG 검색", c: C.PRIMARY }]);

  s.addShape(S.ROUNDED_RECTANGLE, { x: 0.6, y: 1.68, w: 12.13, h: 0.82, rectRadius: R, fill: { color: C.BLUE_TINT }, line: { color: C.BLUE_BORDER, width: 1 } });
  s.addText([
    { text: "같은 질문      ", options: { bold: true, fontSize: 11, color: C.PRIMARY_DK } },
    { text: "“데뷔 초에 힘들었던 얘기 나온 영상 찾아줘”", options: { bold: true, fontSize: 16, color: C.INK } },
  ], { x: 0.95, y: 1.68, w: 11.4, h: 0.82, fontFace: F, valign: "middle", margin: 0 });

  const lw = 5.95, rx = 6.78, cy = 2.72, ch = 3.32;
  softCard(s, 0.6, cy, lw, ch, C.GRAY_TINT);
  s.addText("DB 검색만", { x: 0.9, y: cy + 0.22, w: 3, h: 0.4, fontFace: F, fontSize: 17, bold: true, color: C.INK, margin: 0 });
  tagPill(s, 4.25, cy + 0.26, 2.0, 0.42, C.GRAY_FILL, C.GRAY_TEXT, "키워드 일치 · LIKE");
  divider(s, 0.9, cy + 0.86, 5.35);
  markedList(s, 0.9, cy + 1.04, 5.2, 1.5, ["그 단어가 그대로 있어야 매칭", "단어가 안 겹치면 검색 실패", "의미·맥락은 이해하지 못함"], C.GRAY_DOT, 13.5);
  resultRow(s, 0.9, cy + 2.62, 5.35, 0.56, C.RED_FILL, "✕", C.RED, "못 찾음 / 엉뚱한 결과", C.RED_TEXT);

  softCard(s, rx, cy, lw, ch, C.BLUE_TINT);
  s.addText("RAG 검색", { x: rx + 0.3, y: cy + 0.22, w: 3, h: 0.4, fontFace: F, fontSize: 17, bold: true, color: C.PRIMARY_DK, margin: 0 });
  tagPill(s, rx + 3.65, cy + 0.26, 2.0, 0.42, C.PRIMARY, C.WHITE, "의미 + 답변 생성");
  divider(s, rx + 0.3, cy + 0.86, 5.35);
  markedList(s, rx + 0.3, cy + 1.04, 5.2, 1.5, ["질문 의도 파싱 (영상·주제)", "의미(벡터) + 키워드 동시 검색", "재정렬 후 근거 달아 답변"], C.PRIMARY, 13.5);
  resultRow(s, rx + 0.3, cy + 2.62, 5.35, 0.56, C.TEAL_FILL, "✓", C.TEAL, "EP.2 3:24 + 출처 [1][2]", C.TEAL_TEXT);

  band(s, 0.6, 6.28, 12.13, 0.6, [
    { text: "하이브리드  ", options: { bold: true, fontSize: 15, color: C.PRIMARY_DK } },
    { text: "— 정확 필터는 SQL, 의미 검색은 벡터로 함께", options: { fontSize: 13, color: C.BODY } },
  ]);
}

/* ---------- Slide 4: Pipeline ---------- */
function slidePipeline(opts = {}) {
  const s = pres.addSlide();
  s.background = { color: C.WHITE };
  if (opts.brand !== false) { logo(s); footer(s, opts.page); }
  title(s, [{ t: "처리 흐름", c: C.INK }]);
  s.addText("질문 한 번에 의미 검색 · 정확 필터 · LLM 재정렬이 함께 동작", { x: 0.62, y: 1.46, w: 11.5, h: 0.36, fontFace: F, fontSize: 14, color: C.BODY, margin: 0 });

  /* main pipeline strip — 6 stages */
  const by = 2.12, bh = 0.95, bw = 1.838;
  const xs = [0.6, 2.658, 4.717, 6.775, 8.833, 10.892];
  const steps = [
    { fill: C.GRAY_TINT, tc: C.INK,        t: "자연어 질문",   sub: "팬이 쓴 말 그대로" },
    { fill: C.BLUE_TINT, tc: C.PRIMARY_DK, t: "의도 파싱",     sub: "날짜·멤버수·출처" },
    { fill: C.BLUE_TINT, tc: C.PRIMARY_DK, t: "하이브리드 검색", sub: "벡터 + 키워드" },
    { fill: C.BLUE_TINT, tc: C.PRIMARY_DK, t: "필터 · 부스트",  sub: "정확조건 + 가중치" },
    { fill: C.BLUE_TINT, tc: C.PRIMARY_DK, t: "LLM 재정렬",    sub: "gpt-5.5-mini" },
    { fill: C.TEAL_FILL, tc: C.TEAL_TEXT,  t: "근거 답변",     sub: "출처[1][2] · SSE" },
  ];
  const flowBox = (x, st) => {
    s.addShape(S.ROUNDED_RECTANGLE, { x, y: by, w: bw, h: bh, rectRadius: R, fill: { color: st.fill }, line: { color: C.CARD_LINE, width: 1 }, shadow: soft() });
    s.addText([
      { text: st.t, options: { bold: true, fontSize: 12.5, color: st.tc, breakLine: true } },
      { text: st.sub, options: { fontSize: 9, color: C.BODY } },
    ], { x: x + 0.06, y: by + 0.1, w: bw - 0.12, h: bh - 0.16, fontFace: F, align: "center", valign: "middle", margin: 0 });
  };
  const badgeColors = [C.GRAY_DOT, C.PRIMARY, C.PRIMARY, C.PRIMARY, C.PRIMARY, C.TEAL];
  steps.forEach((st, i) => { flowBox(xs[i], st); badge(s, xs[i] + bw / 2, by, i + 1, badgeColors[i]); });
  const ay = by + bh / 2;
  for (let i = 0; i < xs.length - 1; i++) {
    s.addShape(S.LINE, { x: xs[i] + bw, y: ay, w: xs[i + 1] - (xs[i] + bw), h: 0, line: { color: "C2CAE0", width: 1.75, endArrowType: "triangle" } });
  }

  /* down connectors into the two detail cards */
  const cy2 = 3.42, ch2 = 2.78;
  [4.10, 10.29].forEach((cxx) => {
    s.addShape(S.LINE, { x: cxx, y: by + bh + 0.06, w: 0, h: cy2 - (by + bh) - 0.12, line: { color: C.PRIMARY_LT, width: 1.75, endArrowType: "triangle" } });
  });

  /* left card — hybrid search internals */
  softCard(s, 0.6, cy2, 7.0, ch2);
  s.addText([
    { text: "③ ", options: { bold: true, color: C.PRIMARY } },
    { text: "하이브리드 검색", options: { bold: true, color: C.INK } },
  ], { x: 0.9, y: cy2 + 0.18, w: 4.2, h: 0.36, fontFace: F, fontSize: 15, valign: "middle", margin: 0 });
  tagPill(s, 5.45, cy2 + 0.2, 1.85, 0.4, C.BLUE_FILL, C.PRIMARY_DK, "벡터 + 키워드 동시");
  divider(s, 0.9, cy2 + 0.76, 6.4);
  s.addShape(S.OVAL, { x: 0.92, y: cy2 + 0.92, w: 0.2, h: 0.2, fill: { color: C.PRIMARY } });
  s.addText("벡터 검색 · 의미", { x: 1.22, y: cy2 + 0.86, w: 2.7, h: 0.32, fontFace: F, fontSize: 12, bold: true, color: C.PRIMARY_DK, valign: "middle", margin: 0 });
  markedList(s, 0.94, cy2 + 1.26, 3.05, 0.95, ["질의 보강 (질문 + 핵심 키워드)", "text-embedding-3-small 임베딩", "pgvector <=> 코사인 · 상위 120"], C.PRIMARY, 10.5);
  s.addShape(S.OVAL, { x: 4.22, y: cy2 + 0.92, w: 0.2, h: 0.2, fill: { color: C.GRAY_DOT } });
  s.addText("키워드 검색 · 정확", { x: 4.52, y: cy2 + 0.86, w: 2.7, h: 0.32, fontFace: F, fontSize: 12, bold: true, color: C.GRAY_TEXT, valign: "middle", margin: 0 });
  markedList(s, 4.24, cy2 + 1.26, 3.05, 0.95, ["ilike 부분 일치 검색", "공백 무시 매칭", "정확한 단어 그대로"], C.GRAY_DOT, 10.5);
  s.addShape(S.ROUNDED_RECTANGLE, { x: 0.9, y: cy2 + ch2 - 0.46, w: 6.4, h: 0.36, rectRadius: 0.1, fill: { color: C.BLUE_FILL } });
  s.addText([
    { text: "→ 합집합", options: { bold: true, color: C.PRIMARY_DK } },
    { text: "  후 소스 단위 중복 제거 → 상위 후보", options: { color: C.BODY } },
  ], { x: 1.12, y: cy2 + ch2 - 0.46, w: 6.0, h: 0.36, fontFace: F, fontSize: 11, valign: "middle", margin: 0 });

  /* right card — filter / boost / rerank */
  softCard(s, 7.85, cy2, 4.88, ch2);
  s.addText([
    { text: "④–⑤ ", options: { bold: true, color: C.PRIMARY } },
    { text: "필터 · 부스트 · 재정렬", options: { bold: true, color: C.INK } },
  ], { x: 8.15, y: cy2 + 0.18, w: 4.3, h: 0.36, fontFace: F, fontSize: 14, valign: "middle", margin: 0 });
  divider(s, 8.15, cy2 + 0.76, 4.3);
  markedList(s, 8.17, cy2 + 0.94, 4.4, 1.6, [
    "출처 · 미디어 · 멤버 수 필터",
    "포함 / 제외어 정확 매칭",
    "archive(곡·앨범) 가중 · 상한 0.35",
    "점수 = 코사인 + 부스트",
    "LLM 재정렬 gpt-5.5-mini · 1페이지",
  ], C.PRIMARY, 11);

  band(s, 0.6, 6.32, 12.13, 0.6, [
    { text: "데이터 소스   ", options: { bold: true, fontSize: 14, color: C.PRIMARY_DK } },
    { text: "YouTube 자막(타임스탬프 딥링크) · 게시글 · 브리핑 · Naver 뉴스/블로그", options: { fontSize: 12.5, color: C.BODY } },
  ]);
}

/* ---------- Slide 5: Tech stack ---------- */
function slideStack(opts = {}) {
  const s = pres.addSlide();
  s.background = { color: C.WHITE };
  if (opts.brand !== false) { logo(s); footer(s, opts.page); }
  title(s, [{ t: "기술 스택", c: C.INK }]);
  s.addText("Frontend · Backend · Database · External sync", { x: 0.62, y: 1.52, w: 10, h: 0.4, fontFace: F, fontSize: 14, color: C.BODY, margin: 0 });

  const cw = 3.83, cyy = 2.4, chh = 3.5;
  const xs = [0.6, 4.75, 8.9];
  const cols = [
    { dot: C.GRAY_DOT, pill: C.GRAY_FILL, pillT: C.GRAY_TEXT, t: "Frontend", sub: "Vercel", marker: C.GRAY_DOT, items: ["React 19 · TypeScript", "Vite 빌드", "React Query 상태관리", "SSE 실시간 스트리밍"] },
    { dot: C.PRIMARY, pill: C.BLUE_FILL, pillT: C.PRIMARY_DK, t: "Backend", sub: "Railway", marker: C.PRIMARY, items: ["FastAPI · Python 3.12", "SQLAlchemy · Alembic", "OpenAI 임베딩 + LLM", "LangGraph · MCP 에이전트"] },
    { dot: C.TEAL, pill: C.TEAL_FILL, pillT: C.TEAL_TEXT, t: "Database", sub: "Railway", marker: C.TEAL, items: ["PostgreSQL", "pgvector 벡터 검색", "psycopg 3 드라이버", "게시글·영상·임베딩 저장"] },
  ];
  cols.forEach((col, i) => {
    const x = xs[i];
    softCard(s, x, cyy, cw, chh);
    s.addShape(S.OVAL, { x: x + 0.32, y: cyy + 0.36, w: 0.26, h: 0.26, fill: { color: col.dot } });
    s.addText(col.t, { x: x + 0.72, y: cyy + 0.3, w: 1.9, h: 0.4, fontFace: F, fontSize: 16, bold: true, color: C.INK, valign: "middle", margin: 0 });
    tagPill(s, x + cw - 1.25, cyy + 0.34, 0.95, 0.38, col.pill, col.pillT, col.sub);
    divider(s, x + 0.32, cyy + 0.92, cw - 0.64);
    markedList(s, x + 0.34, cyy + 1.12, cw - 0.6, 2.2, col.items, col.marker, 13);
  });

  band(s, 0.6, 6.15, 12.13, 0.72, [
    { text: "외부 데이터 수집   ", options: { bold: true, fontSize: 15, color: C.PRIMARY_DK } },
    { text: "— YouTube 영상·자막 · Naver 뉴스/블로그 자동 동기화", options: { fontSize: 13, color: C.BODY } },
  ]);
}

const MODE = process.argv[2] || "full";
if (MODE === "team") {
  // 팀 PPT 삽입용 — 4·5페이지만, 로고·하단 바 등 브랜딩 제거
  slidePipeline({ brand: false });
  slideStack({ brand: false });
  pres.writeFile({ fileName: "Caesar_RAG_4-5.pptx" }).then((fn) => console.log("WROTE", fn));
} else {
  slideCover();
  slideProblem({ page: "02 / 05" });
  slideDbVsRag({ page: "03 / 05" });
  slidePipeline({ page: "04 / 05" });
  slideStack({ page: "05 / 05" });
  pres.writeFile({ fileName: "Caesar_RAG_발표.pptx" }).then((fn) => console.log("WROTE", fn));
}
