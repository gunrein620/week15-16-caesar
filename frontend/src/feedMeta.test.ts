import assert from 'node:assert/strict'
import test from 'node:test'

import { buildFeedFooterParts, buildFeedMetaParts } from './feedMeta.ts'

test('buildFeedMetaParts keeps source and published date time visible', () => {
  const meta = buildFeedMetaParts({
    source_label: '안녕하세요원이입니다잘부탁드립니다',
    published_at: '2026-06-07T06:12:00Z',
  })

  assert.equal(meta.source, '안녕하세요원이입니다잘부탁드립니다')
  assert.match(meta.timestamp, /06/)
  assert.match(meta.timestamp, /07/)
  assert.match(meta.timestamp, /15/)
  assert.match(meta.timestamp, /12/)
})

test('buildFeedFooterParts always exposes the published timestamp', () => {
  const footer = buildFeedFooterParts({
    published_at: '2026-06-07T06:12:00Z',
    view_count: 3398,
    comment_count: null,
  })

  assert.match(footer.timestamp, /06/)
  assert.match(footer.timestamp, /07/)
  assert.match(footer.timestamp, /15/)
  assert.match(footer.timestamp, /12/)
  assert.deepEqual(footer.stats, [{ type: 'views', value: 3398 }])
})
