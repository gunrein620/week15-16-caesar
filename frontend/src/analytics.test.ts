import test from 'node:test'
import assert from 'node:assert/strict'

import { analyticsPayload, getAnalyticsSessionId, shouldTrackPanelView } from './analytics.ts'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  length = 0

  clear(): void {
    this.values.clear()
    this.length = 0
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
    this.length = this.values.size
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
    this.length = this.values.size
  }
}

test('getAnalyticsSessionId reuses a generated anonymous id', () => {
  const storage = new MemoryStorage()
  const first = getAnalyticsSessionId(storage, () => 'uuid-1')
  const second = getAnalyticsSessionId(storage, () => 'uuid-2')

  assert.equal(first, 'uuid-1')
  assert.equal(second, 'uuid-1')
})

test('analyticsPayload keeps safe metadata and drops sensitive values', () => {
  const payload = analyticsPayload({
    eventName: 'archive_search_submit',
    anonymousSessionId: 'anon-1',
    path: '/',
    panel: 'rag',
    metadata: {
      query: '러브어택',
      title: 'Love Attack',
      email: 'private@example.com',
      token: 'secret',
    },
  })

  assert.deepEqual(payload, {
    event_name: 'archive_search_submit',
    anonymous_session_id: 'anon-1',
    path: '/',
    panel: 'rag',
    source: 'frontend',
    metadata: {
      query: '러브어택',
      title: 'Love Attack',
    },
  })
})

test('shouldTrackPanelView skips admin panel', () => {
  assert.equal(shouldTrackPanelView('home'), true)
  assert.equal(shouldTrackPanelView('admin'), false)
})
