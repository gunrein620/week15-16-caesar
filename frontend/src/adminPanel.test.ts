import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

test('admin panel does not expose obsolete home keyword management', () => {
  assert.doesNotMatch(appSource, /Home keywords/)
  assert.doesNotMatch(appSource, /홈 필터/)
  assert.doesNotMatch(appSource, /keywordAdminForm/)
  assert.doesNotMatch(appSource, /\/artists\/1\/keywords/)
  assert.doesNotMatch(appSource, /\/artist-keywords\//)
  assert.doesNotMatch(styles, /\.keywordAdminForm\b/)
})
