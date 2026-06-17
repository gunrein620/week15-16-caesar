/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const outDir = path.join(process.cwd(), "docs");
const svgPath = path.join(outDir, "jungle-snack-court-tech-stack-transparent.svg");
const pngPath = path.join(outDir, "jungle-snack-court-tech-stack-transparent.png");

const width = 2400;
const height = 1350;

const colors = {
  ink: "#111827",
  muted: "#5f6b7a",
  line: "#1f2937",
  green: "#00C987",
  deepGreen: "#036B46",
  teal: "#0EA5A4",
  blue: "#2563EB",
  violet: "#7C3AED",
  orange: "#F59E0B",
  pink: "#DB2777",
  card: "#FFFFFF",
  chip: "#F7FAF9",
  border: "#D8E6E1",
};

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function text(x, y, value, size, weight = 700, fill = colors.ink, anchor = "start") {
  return `<text x="${x}" y="${y}" font-family="Malgun Gothic, Inter, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(value)}</text>`;
}

function multiline(x, y, lines, size = 28, fill = colors.ink, gap = 38, weight = 600) {
  return lines
    .map((line, index) => text(x, y + index * gap, line, size, weight, fill))
    .join("\n");
}

function roundedRect(x, y, w, h, stroke, fill = colors.card, strokeWidth = 4, radius = 28) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" fill-opacity="0.96" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

function box({ x, y, w, h, color, eyebrow, title, lines, chips = [] }) {
  const chipSvg = chips
    .map((chip, index) => {
      const chipX = x + 40 + (index % 2) * 205;
      const chipY = y + h - 112 + Math.floor(index / 2) * 58;
      return [
        `<rect x="${chipX}" y="${chipY}" width="180" height="42" rx="14" fill="${colors.chip}" stroke="${color}" stroke-opacity="0.45" stroke-width="2"/>`,
        text(chipX + 90, chipY + 28, chip, 19, 800, color, "middle"),
      ].join("\n");
    })
    .join("\n");

  return `
    ${roundedRect(x, y, w, h, color)}
    <circle cx="${x + 44}" cy="${y + 48}" r="20" fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-width="3"/>
    <circle cx="${x + 44}" cy="${y + 48}" r="8" fill="${color}"/>
    ${text(x + 80, y + 42, eyebrow, 20, 900, color)}
    ${text(x + 80, y + 82, title, 36, 900, colors.ink)}
    ${multiline(x + 42, y + 142, lines, 25, colors.muted, 38, 700)}
    ${chipSvg}
  `;
}

function arrow(x1, y1, x2, y2, label, color = colors.line, labelOffsetY = -18) {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  return `
    <path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="${color}" stroke-width="5" fill="none" marker-end="url(#arrow)"/>
    <rect x="${midX - 110}" y="${midY + labelOffsetY - 30}" width="220" height="42" rx="18" fill="#FFFFFF" fill-opacity="0.9"/>
    ${text(midX, midY + labelOffsetY, label, 22, 900, color, "middle")}
  `;
}

function stackChip(x, y, label, color) {
  const w = Math.max(128, label.length * 15 + 40);
  return `
    <rect x="${x}" y="${y}" width="${w}" height="46" rx="23" fill="#FFFFFF" fill-opacity="0.95" stroke="${color}" stroke-width="3"/>
    ${text(x + w / 2, y + 31, label, 21, 900, color, "middle")}
  `;
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="14" flood-color="#0F172A" flood-opacity="0.12"/>
    </filter>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
      <path d="M 1.5 1.5 L 8.5 5 L 1.5 8.5 z" fill="${colors.line}"/>
    </marker>
    <style>
      .shadow { filter: url(#softShadow); }
    </style>
  </defs>

  <g>
    ${text(115, 105, "정글 간식재판소", 72, 900, colors.ink)}
    ${text(118, 154, "기술 스택 구조 · AI 판결 게시판", 31, 800, colors.deepGreen)}
    ${text(118, 205, "Next.js App Router 기반 SNS 피드 + Prisma/PostgreSQL + Auth.js + OpenAI RAG", 27, 700, colors.muted)}

    ${stackChip(118, 252, "React 19", colors.blue)}
    ${stackChip(270, 252, "Next.js 16", colors.ink)}
    ${stackChip(450, 252, "TypeScript", colors.blue)}
    ${stackChip(650, 252, "Tailwind CSS", colors.teal)}
    ${stackChip(875, 252, "Prisma", colors.deepGreen)}
    ${stackChip(1022, 252, "PostgreSQL", colors.deepGreen)}
    ${stackChip(1216, 252, "Auth.js", colors.violet)}
    ${stackChip(1368, 252, "OpenAI", colors.orange)}
    ${stackChip(1528, 252, "RAG", colors.pink)}
  </g>

  <g class="shadow">
    ${box({
      x: 115,
      y: 330,
      w: 535,
      h: 480,
      color: colors.blue,
      eyebrow: "CLIENT",
      title: "Frontend / 게시판 UI",
      lines: [
        "Next.js App Router",
        "React 19 + TypeScript",
        "Tailwind CSS v4 + lucide-react",
        "메인 / 판례 날짜 탭",
        "검색, 이미지 슬라이더, 댓글 UI",
      ],
      chips: ["피드", "작성 페이지", "투표", "알림 버튼"],
    })}

    ${box({
      x: 930,
      y: 330,
      w: 575,
      h: 480,
      color: colors.violet,
      eyebrow: "SERVER",
      title: "Backend / API Layer",
      lines: [
        "Next.js Route Handlers",
        "Node.js runtime",
        "Auth.js / NextAuth social login",
        "Google · Kakao · Naver providers",
        "Posts · Comments · Votes · Meals · AI APIs",
      ],
      chips: ["REST API", "Prisma Adapter", "Server-only AI", "Validation"],
    })}

    ${box({
      x: 1760,
      y: 330,
      w: 520,
      h: 480,
      color: colors.deepGreen,
      eyebrow: "DATA",
      title: "Database",
      lines: [
        "PostgreSQL",
        "Prisma ORM + @prisma/adapter-pg",
        "User · Account · Session",
        "Post · Image · Tag · Comment · Vote",
        "Meal · AiJudgement · RagDocument",
      ],
      chips: ["Schema", "Migration", "Seed", "Mock data"],
    })}

    ${box({
      x: 215,
      y: 875,
      w: 565,
      h: 420,
      color: colors.orange,
      eyebrow: "SOURCE",
      title: "Data / Storage",
      lines: [
        "Kakao channel meal fetch/cache",
        "MealPost · MealMenu",
        "Local uploads: public/uploads/posts",
        "seed / mock / external RAG scripts",
      ],
      chips: ["식단 캐시", "이미지 저장", "목업 포스트", "RAG 문서"],
    })}

    ${box({
      x: 1015,
      y: 875,
      w: 555,
      h: 420,
      color: colors.pink,
      eyebrow: "AI",
      title: "AI / RAG",
      lines: [
        "OpenAI SDK, server-side only",
        "AI 판결 JSON output",
        "내부 판례 우선 검색",
        "외부 스낵/운동 문서 fallback",
      ],
      chips: ["Prompt v2", "Precedents", "RagDocument", "pgvector 예정"],
    })}

    ${box({
      x: 1760,
      y: 875,
      w: 520,
      h: 420,
      color: colors.teal,
      eyebrow: "BROWSER",
      title: "Browser Capability",
      lines: [
        "Notifications API",
        "탭이 열려 있을 때만 알림",
        "Service Worker / Web Push 미구현",
        "VAPID / subscription 저장 없음",
      ],
      chips: ["권한 상태", "테스트 알림", "작성 완료", "AI 완료"],
    })}
  </g>

  <g>
    ${arrow(650, 560, 930, 560, "HTTP / fetch", colors.line)}
    ${arrow(1505, 560, 1760, 560, "Prisma + SQL", colors.line)}
    ${arrow(1760, 660, 1505, 660, "JSON 응답", colors.line)}
    ${arrow(1215, 810, 1215, 875, "AI 판결 요청", colors.pink, -4)}
    ${arrow(780, 1070, 1015, 1070, "캐시 / 문서", colors.orange)}
    ${arrow(1505, 735, 1760, 970, "브라우저 알림", colors.teal, -6)}
  </g>
</svg>`;

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(svgPath, svg, "utf8");
  await sharp(Buffer.from(svg)).png().toFile(pngPath);

  console.log(`Wrote ${svgPath}`);
  console.log(`Wrote ${pngPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
