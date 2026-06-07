import assert from 'node:assert/strict'
import test from 'node:test'

import { buildYoutubeSourcePayload } from './youtubeSourceForm.ts'

test('buildYoutubeSourcePayload auto-generates keyword search title', () => {
  const payload = buildYoutubeSourcePayload({
    sourceType: 'keyword_search',
    sourceTitle: '',
    sourceValue: ' 리센느 직캠 ',
  })

  assert.deepEqual(payload, {
    source_type: 'keyword_search',
    source_value: '리센느 직캠',
    title: '리센느 직캠 키워드 검색',
  })
})

test('buildYoutubeSourcePayload preserves explicit source title', () => {
  const payload = buildYoutubeSourcePayload({
    sourceType: 'keyword_search',
    sourceTitle: '직캠 검색',
    sourceValue: '리센느 직캠',
  })

  assert.equal(payload.title, '직캠 검색')
})
