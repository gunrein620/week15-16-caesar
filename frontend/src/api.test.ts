import test from 'node:test'
import assert from 'node:assert/strict'

import { api } from './api.ts'
import { getInitialAccessToken, storeAccessToken } from './authSession.ts'

test('api refreshes an expired access token and retries once', async () => {
  const calls: Array<{ url: string; authorization: string | null }> = []
  const originalFetch = globalThis.fetch
  storeAccessToken(null)
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    calls.push({
      url: String(input),
      authorization: headers.get('Authorization'),
    })
    if (calls.length === 1) {
      return new Response(JSON.stringify({ detail: 'Invalid token' }), { status: 401 })
    }
    if (calls.length === 2) {
      return new Response(JSON.stringify({ access_token: 'fresh-token' }), { status: 200 })
    }
    return new Response(JSON.stringify({ answer: 'ok' }), { status: 200 })
  }) as typeof fetch

  try {
    const result = await api<{ answer: string }>('/ai/qa', { method: 'POST' }, 'expired-token')

    assert.deepEqual(result, { answer: 'ok' })
    assert.equal(calls[0].authorization, 'Bearer expired-token')
    assert.equal(calls[1].url, 'http://localhost:8000/auth/refresh')
    assert.equal(calls[2].authorization, 'Bearer fresh-token')
    assert.equal(getInitialAccessToken(), 'fresh-token')
  } finally {
    globalThis.fetch = originalFetch
    storeAccessToken(null)
  }
})
