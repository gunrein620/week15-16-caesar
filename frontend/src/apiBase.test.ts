import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveApiBase } from './apiBase.ts'

test('resolveApiBase uses same-origin when production env is blank', () => {
  assert.equal(resolveApiBase(undefined, true), '')
  assert.equal(resolveApiBase('', true), '')
  assert.equal(resolveApiBase('   ', true), '')
})

test('resolveApiBase keeps localhost default for local development', () => {
  assert.equal(resolveApiBase(undefined, false), 'http://localhost:8000')
  assert.equal(resolveApiBase('', false), 'http://localhost:8000')
})

test('resolveApiBase preserves an explicit API base without trailing slash', () => {
  assert.equal(resolveApiBase('https://api.example.com/', true), 'https://api.example.com')
  assert.equal(resolveApiBase(' https://api.example.com ', false), 'https://api.example.com')
})
