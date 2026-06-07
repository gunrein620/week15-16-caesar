import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
const globalCss = css.split('@media')[0]

test('feed and archive cards hide long body text by default', () => {
  assert.match(globalCss, /\.updateBody p\s*\{[^}]*display:\s*none;/s)
  assert.match(globalCss, /\.sourceBody p\s*\{[^}]*display:\s*none;/s)
})
