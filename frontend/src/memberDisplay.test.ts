import assert from 'node:assert/strict'
import test from 'node:test'

import { compactMemberNamesText, memberLabel, memberNamesText } from './memberDisplay.ts'

test('memberLabel returns Korean display names for known members', () => {
  assert.equal(memberLabel('Woni'), '원이')
  assert.equal(memberLabel('Zena'), '제나')
})

test('memberNamesText keeps the full member list for roomy layouts', () => {
  assert.equal(memberNamesText(['Woni', 'Liv', 'Minami']), '원이, 리브, 미나미')
})

test('compactMemberNamesText keeps YouTube card member rows short', () => {
  assert.equal(compactMemberNamesText(['Woni', 'Liv', 'Minami', 'May', 'Zena']), '원이, 리브 외 3명')
  assert.equal(compactMemberNamesText(['Woni', 'Liv']), '원이, 리브')
  assert.equal(compactMemberNamesText([]), 'RESCENE')
})
