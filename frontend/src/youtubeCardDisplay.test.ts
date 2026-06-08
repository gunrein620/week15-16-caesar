import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')

test('youtube cards use compact member text instead of the full member list', () => {
  assert.match(appSource, /compactMemberNamesText\(members\)/)
  assert.doesNotMatch(appSource, /memberNamesText\(members\)\s*:\s*video\.channel_title/)
})
