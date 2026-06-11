import test from 'node:test'
import assert from 'node:assert/strict'

import { createSseBuffer } from './chatStream.ts'

test('createSseBuffer waits for partial chunks', () => {
  const buffer = createSseBuffer()

  assert.deepEqual(buffer.push('data: {"type":"delta"'), [])
  assert.deepEqual(buffer.push(',"text":"안녕"}\n\n'), [{ type: 'delta', text: '안녕' }])
})

test('createSseBuffer parses multiple events in one chunk', () => {
  const buffer = createSseBuffer()

  assert.deepEqual(
    buffer.push('data: {"type":"run","run_id":7}\n\ndata: {"type":"done"}\n\n'),
    [{ type: 'run', run_id: 7 }, { type: 'done' }],
  )
})

test('createSseBuffer ignores lines without data prefix', () => {
  const buffer = createSseBuffer()

  assert.deepEqual(buffer.push('event: delta\ndata: {"type":"delta","text":"ok"}\nretry: 100\n\n'), [
    { type: 'delta', text: 'ok' },
  ])
})

test('createSseBuffer parses error events', () => {
  const buffer = createSseBuffer()

  assert.deepEqual(buffer.push('data: {"type":"error","message":"failed"}\n\n'), [
    { type: 'error', message: 'failed' },
  ])
})
