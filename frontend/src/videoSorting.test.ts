import assert from "node:assert/strict"
import test from "node:test"

import { sortYoutubeVideos } from "./videoSorting.ts"

const videos = [
  {
    id: "love-attack",
    title: "RESCENE Love Attack",
    published_at: "2026-06-04T08:59:22Z",
    view_count: 541384,
  },
  {
    id: "parapara",
    title: "파라파라 춰야겠다",
    published_at: "2026-06-02T07:00:21Z",
    view_count: 1115900,
  },
  {
    id: "boompala",
    title: "BOOMPALA intro MINAMI",
    published_at: "2026-06-01T07:00:32Z",
    view_count: "1,108,539",
  },
  {
    id: "love-attack",
    title: "RESCENE Love Attack duplicate source",
    published_at: "2026-06-04T08:59:22Z",
    view_count: 541384,
  },
]

test("sortYoutubeVideos orders by numeric views and removes duplicate video ids", () => {
  const sorted = sortYoutubeVideos(videos, "views")

  assert.deepEqual(
    sorted.map((video) => video.id),
    ["parapara", "boompala", "love-attack"],
  )
})

test("sortYoutubeVideos keeps latest ordering separate from view ordering", () => {
  const sorted = sortYoutubeVideos(videos, "latest")

  assert.deepEqual(
    sorted.map((video) => video.id),
    ["love-attack", "parapara", "boompala"],
  )
})
