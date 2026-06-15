import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
const globalCss = css.split('@media')[0]

test('feed and archive cards hide long body text by default', () => {
  assert.match(globalCss, /\.updateBody p\s*\{[^}]*display:\s*none;/s)
  assert.match(globalCss, /\.sourceBody p\s*\{[^}]*display:\s*none;/s)
})

test('admin recent event table has a fixed scroll area', () => {
  assert.match(css, /\.adminTable\s*\{[^}]*max-height:\s*260px;/s)
  assert.match(css, /\.adminTable\s*\{[^}]*overflow-y:\s*auto;/s)
})

test('rag source card actions do not reserve title width', () => {
  assert.doesNotMatch(
    css,
    /\.ragSourceGrid\s+\.sourceMainLink,\s*\.ragSourceGrid\s*>\s*\.sourceCard\s*\{[^}]*display:\s*grid;/s,
  )
})

test('rag source titles have room for three lines outside compact chat cards', () => {
  assert.match(css, /\.ragSourceGrid\s+\.sourceBody\s+strong\s*\{[^}]*-webkit-line-clamp:\s*3;/s)
  assert.match(css, /\.chatSourceGrid\.ragSourceGrid\s+\.sourceBody\s+strong\s*\{[^}]*-webkit-line-clamp:\s*2;/s)
})
