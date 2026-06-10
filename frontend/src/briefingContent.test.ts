import assert from "node:assert/strict"
import test from "node:test"

import { parseBriefingContent, shouldUseBriefingContent } from "./briefingContent.ts"

const sampleBriefing = `RESCENE 오늘의 요약
기준일: 2026-06-07

핵심 요약
- 최근 영상 2개를 확인했습니다.
- 자세히 볼 만한 링크를 아래에 모았습니다.

최근 영상
1. RESCENE Love Attack
   링크: https://www.youtube.com/watch?v=abc123
2. RESCENE stage clip
   링크: https://youtu.be/def456

팬 반응
- 원이 무대 반응이 좋습니다.

Naver 소식
1. 리센느 인터뷰 공개
   링크: https://news.example.com/rescene

팬 게시글
1. 원이 후기
   링크: /posts/12

과거 맥락
1. 원이 무대 아카이브
   링크: /posts/30
`

test("parseBriefingContent groups known sections and link cards", () => {
  const parsed = parseBriefingContent(sampleBriefing)

  assert.ok(parsed)
  assert.equal(parsed.title, "RESCENE 오늘의 요약")
  assert.equal(parsed.dateLine, "기준일: 2026-06-07")
  assert.deepEqual(
    parsed.sections.map((section) => section.heading),
    ["핵심 요약", "최근 영상", "팬 반응", "Naver 소식", "팬 게시글", "과거 맥락"],
  )
  assert.deepEqual(parsed.sections[0].items, [
    { type: "bullet", text: "최근 영상 2개를 확인했습니다." },
    { type: "bullet", text: "자세히 볼 만한 링크를 아래에 모았습니다." },
  ])
  assert.deepEqual(parsed.sections[1].items, [
    { type: "link", title: "RESCENE Love Attack", url: "https://www.youtube.com/watch?v=abc123" },
    { type: "link", title: "RESCENE stage clip", url: "https://youtu.be/def456" },
  ])
  assert.deepEqual(parsed.sections[3].items, [
    { type: "link", title: "리센느 인터뷰 공개", url: "https://news.example.com/rescene" },
  ])
  assert.deepEqual(parsed.sections[4].items, [
    { type: "link", title: "원이 후기", url: "/posts/12" },
  ])
  assert.deepEqual(parsed.sections[5].items, [
    { type: "link", title: "원이 무대 아카이브", url: "/posts/30" },
  ])
})

test("parseBriefingContent supports internal board links for fan post sections", () => {
  const parsed = parseBriefingContent(`RESCENE 오늘의 요약

팬 게시글
1. 원이 후기
   링크: /posts/12
`)

  assert.ok(parsed)
  assert.deepEqual(parsed.sections[0].items, [{ type: "link", title: "원이 후기", url: "/posts/12" }])
})

test("parseBriefingContent returns null without known sections", () => {
  assert.equal(parseBriefingContent("RESCENE 오늘의 요약\nplain text only"), null)
})

test("shouldUseBriefingContent accepts briefing category or generated heading", () => {
  assert.equal(shouldUseBriefingContent("브리핑", "anything"), true)
  assert.equal(shouldUseBriefingContent("자유", sampleBriefing), true)
  assert.equal(shouldUseBriefingContent("자유", "일반 게시글"), false)
})
