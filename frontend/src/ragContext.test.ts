import assert from 'node:assert/strict'
import test from 'node:test'

import type { QaSource, SavedItem } from './api.ts'
import {
  appendReferenceText,
  buildWritingAssistQuery,
  canSummarizeSavedItems,
  shouldRequestWritingAssist,
} from './ragContext.ts'

const source: QaSource = {
  chunk_id: 1,
  post_id: null,
  youtube_video_id: 'abc123',
  source_type: 'youtube',
  title: 'RESCENE 원이 직캠',
  url: 'https://youtube.example.com/abc123',
  thumbnail_url: '',
  channel_title: 'RESCENE',
  source_label: 'YouTube',
  published_at: null,
  view_count: null,
  content: '원이 영상',
}

const savedItem: SavedItem = {
  id: 1,
  item_type: 'youtube',
  item_key: 'youtube:abc123',
  title: '원이 저장 영상',
  url: 'https://youtube.example.com/abc123',
  thumbnail_url: '',
  source_label: 'YouTube',
  saved_at: '2026-06-09T00:00:00Z',
}

test('writing assist query combines category title and content', () => {
  assert.equal(
    buildWritingAssistQuery('영상', '원이 직캠', '오늘 같이 볼 자료'),
    '영상 원이 직캠 오늘 같이 볼 자료',
  )
})

test('writing assist waits until draft has enough text', () => {
  assert.equal(shouldRequestWritingAssist('원이'), false)
  assert.equal(shouldRequestWritingAssist('원이 직캠 이야기'), true)
})

test('appendReferenceText appends the fixed reference format', () => {
  assert.equal(
    appendReferenceText('본문', source),
    '본문\n\n참고자료: RESCENE 원이 직캠\nhttps://youtube.example.com/abc123',
  )
})

test('saved summary requires at least one saved item', () => {
  assert.equal(canSummarizeSavedItems([]), false)
  assert.equal(canSummarizeSavedItems([savedItem]), true)
})
