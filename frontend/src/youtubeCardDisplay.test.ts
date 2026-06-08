import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
const cssSource = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

test('youtube cards use compact member text instead of the full member list', () => {
  assert.match(appSource, /compactMemberNamesText\(members\)/)
  assert.doesNotMatch(appSource, /memberNamesText\(members\)\s*:\s*video\.channel_title/)
})

test('mobile youtube cards shrink overlay badges and app buttons', () => {
  assert.match(cssSource, /\.videoPoster \.videoThumb \.typeBadge\s*\{[^}]*font-size:\s*12px;/s)
  assert.match(cssSource, /\.videoPoster \.youtubeAppButton\s*\{[^}]*min-height:\s*28px;/s)
  assert.match(cssSource, /\.videoPoster \.youtubeAppButton svg\s*\{[^}]*height:\s*14px;/s)
})
