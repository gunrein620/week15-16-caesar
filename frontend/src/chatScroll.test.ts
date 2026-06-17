import test from 'node:test'
import assert from 'node:assert/strict'

import { chatScrollOptionsForUpdate, shouldAutoScrollChat } from './chatScroll.ts'

test('shouldAutoScrollChat stays pinned when the thread is near the bottom', () => {
  assert.equal(
    shouldAutoScrollChat({
      scrollHeight: 1200,
      scrollTop: 640,
      clientHeight: 520,
    }),
    true,
  )
})

test('shouldAutoScrollChat lets the user read older messages away from the bottom', () => {
  assert.equal(
    shouldAutoScrollChat({
      scrollHeight: 1200,
      scrollTop: 520,
      clientHeight: 520,
    }),
    false,
  )
})

test('chatScrollOptionsForUpdate avoids smooth scrolling during streaming updates', () => {
  assert.deepEqual(chatScrollOptionsForUpdate(1600, true), {
    top: 1600,
    behavior: 'auto',
  })
})
