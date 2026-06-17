import assert from 'node:assert/strict'
import test from 'node:test'

import {
  archiveSearchHintForQuestion,
  buildArchiveAnswerPreview,
  buildArchiveSourceDisplay,
  mergeArchiveSourcePages,
} from './archiveSearch.ts'

test('buildArchiveAnswerPreview collapses long generated answers', () => {
  const answer =
    '러브어택 관련 무대 영상은 다음과 같습니다. 첫 번째 영상은 긴 설명과 링크를 포함합니다. https://www.youtube.com/watch?v=example 두 번째 영상도 이어집니다.'

  const preview = buildArchiveAnswerPreview(answer, 42)

  assert.equal(preview.collapsed, true)
  assert.ok(preview.text.length <= 43)
  assert.ok(preview.text.endsWith('...'))
})

test('buildArchiveSourceDisplay keeps archive cards title-first and omits raw chunk text', () => {
  const display = buildArchiveSourceDisplay({
    title: 'RESCENE LOVE ATTACK Dance Practice',
    content:
      'RESCENE LOVE ATTACK Dance Practice 긴 설명입니다. 타임스탬프와 설명이 계속 이어져 카드 높이를 늘릴 수 있습니다.',
  })

  assert.equal(display.title, 'RESCENE LOVE ATTACK Dance Practice')
  assert.equal(display.description, null)
})

test('archiveSearchHintForQuestion separates live updates from archive search', () => {
  assert.match(
    archiveSearchHintForQuestion('오늘 새 소식 찾아줘'),
    /통합 업데이트/,
  )
  assert.match(
    archiveSearchHintForQuestion('러브어택 무대 영상 모아줘'),
    /곡명/,
  )
  assert.match(
    archiveSearchHintForQuestion('러브어택 요약해줘'),
    /곡명/,
  )
})

test('mergeArchiveSourcePages appends new source cards without duplicates', () => {
  const current = [
    { source_type: 'youtube', youtube_video_id: 'video-1', post_id: null, chunk_id: 1, url: 'https://youtube.example/1' },
    { source_type: 'post', youtube_video_id: null, post_id: 2, chunk_id: 2, url: '/posts/2' },
  ]
  const next = [
    { source_type: 'youtube', youtube_video_id: 'video-1', post_id: null, chunk_id: 3, url: 'https://youtube.example/1' },
    { source_type: 'youtube', youtube_video_id: 'video-3', post_id: null, chunk_id: 4, url: 'https://youtube.example/3' },
  ]

  const merged = mergeArchiveSourcePages(current, next)

  assert.deepEqual(
    merged.map((source) => source.youtube_video_id ?? source.post_id),
    ['video-1', 2, 'video-3'],
  )
})

test('mergeArchiveSourcePages prefers search item id for stable source identity', () => {
  const current = [
    { search_item_id: 7, source_type: 'youtube', youtube_video_id: 'video-1', chunk_id: 11, url: 'https://youtube.example/1' },
  ]
  const next = [
    { search_item_id: 7, source_type: 'youtube', youtube_video_id: 'video-1', chunk_id: 12, url: 'https://youtube.example/1&t=30s' },
    { search_item_id: 8, source_type: 'youtube', youtube_video_id: 'video-2', chunk_id: 13, url: 'https://youtube.example/2' },
  ]

  const merged = mergeArchiveSourcePages(current, next)

  assert.deepEqual(
    merged.map((source) => source.search_item_id),
    [7, 8],
  )
})
