import assert from 'node:assert/strict'
import test from 'node:test'

import { buildFeedMetaParts } from './feedMeta.ts'

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
