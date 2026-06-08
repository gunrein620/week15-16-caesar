import assert from 'node:assert/strict'
import test from 'node:test'

import { selectHomeHeroItem } from './homeHero.ts'

const baseItem = {
  item_type: 'youtube' as const,
  title: '',
  description: '',
  url: '',
  thumbnail_url: '',
  source_label: 'YouTube',
  comment_count: null,
  matched_keywords: [],
  member_names: [],
  tags: [],
}

test('selectHomeHeroItem prefers the highest-view item published today in Korea', () => {
  const item = selectHomeHeroItem(
    [
      {
        ...baseItem,
        id: 'older-popular',
        title: 'older popular',
        published_at: '2026-06-07T12:00:00Z',
        view_count: 900_000,
      },
      {
        ...baseItem,
        id: 'today-low',
        title: 'today low',
        published_at: '2026-06-08T01:00:00Z',
        view_count: 1_000,
      },
      {
        ...baseItem,
        id: 'today-high',
        title: 'today high',
        published_at: '2026-06-08T02:00:00Z',
        view_count: 30_000,
      },
    ],
    new Date('2026-06-08T10:00:00+09:00'),
  )

  assert.equal(item?.id, 'today-high')
})

test('selectHomeHeroItem falls back to recent popularity when there is no Korean-today item', () => {
  const item = selectHomeHeroItem(
    [
      {
        ...baseItem,
        id: 'older-low',
        title: 'older low',
        published_at: '2026-06-07T10:00:00Z',
        view_count: 5_000,
      },
      {
        ...baseItem,
        id: 'older-high',
        title: 'older high',
        published_at: '2026-06-07T11:00:00Z',
        view_count: 20_000,
      },
    ],
    new Date('2026-06-08T10:00:00+09:00'),
  )

  assert.equal(item?.id, 'older-high')
})
