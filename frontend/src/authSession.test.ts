import test from 'node:test'
import assert from 'node:assert/strict'

import {
  configuredOauthProviders,
  getInitialAccessToken,
  oauthStartUrl,
  shouldShowVerificationPrompt,
  storeAccessToken,
} from './authSession.ts'
import type { User } from './api.ts'

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

test('access token is kept in memory and not localStorage', () => {
  const storage = new MemoryStorage()
  storage.setItem('caesar_token', 'old-token')

  storeAccessToken('new-token', storage)

  assert.equal(getInitialAccessToken(storage), 'new-token')
  assert.equal(storage.getItem('caesar_token'), null)
})

test('oauthStartUrl targets backend provider start endpoints', () => {
  assert.equal(oauthStartUrl('google', 'https://api.example.com'), 'https://api.example.com/auth/oauth/google/start')
  assert.equal(oauthStartUrl('kakao', 'https://api.example.com'), 'https://api.example.com/auth/oauth/kakao/start')
})

test('oauthStartUrl supports same-origin provider start endpoints', () => {
  assert.equal(oauthStartUrl('google', ''), '/auth/oauth/google/start')
  assert.equal(oauthStartUrl('kakao', ''), '/auth/oauth/kakao/start')
})

test('configuredOauthProviders only returns configured providers', () => {
  assert.deepEqual(configuredOauthProviders({ google: false, kakao: false }), [])
  assert.deepEqual(configuredOauthProviders({ google: true, kakao: false }), ['google'])
  assert.deepEqual(configuredOauthProviders({ google: true, kakao: true }), ['google', 'kakao'])
})

test('unverified non-admin users should see verification prompt when verification is enabled', () => {
  const user: User = {
    id: 1,
    email: 'user@example.com',
    display_name: 'User',
    role: 'user',
    email_verified_at: null,
  }
  const admin: User = { ...user, role: 'admin' }

  assert.equal(shouldShowVerificationPrompt(user, true), true)
  assert.equal(shouldShowVerificationPrompt({ ...user, email_verified_at: '2026-06-08T00:00:00Z' }, true), false)
  assert.equal(shouldShowVerificationPrompt(admin, true), false)
})

test('unverified non-admin users should not see verification prompt when verification is disabled', () => {
  const user: User = {
    id: 1,
    email: 'user@example.com',
    display_name: 'User',
    role: 'user',
    email_verified_at: null,
  }

  assert.equal(shouldShowVerificationPrompt(user, false), false)
})
