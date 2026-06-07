import assert from 'node:assert/strict'
import test from 'node:test'

import { buildArchiveAnswerPreview, buildArchiveSourceDisplay } from './archiveSearch.ts'

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
