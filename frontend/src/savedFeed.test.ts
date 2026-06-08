import assert from 'node:assert/strict'
import test from 'node:test'

import type { SavedItem, UpdateFeedItem } from './api.ts'
import { findSavedFeedItem, savedFeedItemPayload } from './savedFeed.ts'

const feedItem: UpdateFeedItem = {
  id: 'youtube:abc123',
  item_type: 'youtube',
  title: 'RESCENE clip',
  description: '',
  url: 'https://www.youtube.com/watch?v=abc123',
  thumbnail_url: 'https://img.example.com/abc.jpg',
  source_label: 'YouTube',
  published_at: '2026-06-08T10:00:00Z',
  view_count: 123,
  comment_count: null,
  matched_keywords: [],
  member_names: [],
  tags: [],
}

const savedItem: SavedItem = {
  id: 7,
  item_type: 'youtube',
  item_key: 'youtube:abc123',
  title: 'RESCENE clip',
  url: 'https://www.youtube.com/watch?v=abc123',
  thumbnail_url: 'https://img.example.com/abc.jpg',
  source_label: 'YouTube',
  saved_at: '2026-06-08T10:01:00Z',
}

test('findSavedFeedItem matches a feed card by type and item key', () => {
  assert.equal(findSavedFeedItem([savedItem], feedItem)?.id, 7)
  assert.equal(findSavedFeedItem([{ ...savedItem, item_type: 'post' }], feedItem), null)
  assert.equal(findSavedFeedItem([{ ...savedItem, item_key: 'youtube:other' }], feedItem), null)
})

test('savedFeedItemPayload keeps the backend dedupe key stable', () => {
  assert.deepEqual(savedFeedItemPayload(feedItem), {
    item_type: 'youtube',
    item_id: 'youtube:abc123',
    url: 'https://www.youtube.com/watch?v=abc123',
    title: 'RESCENE clip',
    thumbnail_url: 'https://img.example.com/abc.jpg',
    source_label: 'YouTube',
  })
})
