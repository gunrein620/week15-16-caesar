import type { User } from './api.ts'

let memoryAccessToken: string | null = null

export function getInitialAccessToken(storage: Storage = window.localStorage): string | null {
  storage.removeItem('caesar_token')
  return memoryAccessToken
}

export function storeAccessToken(token: string | null, storage: Storage = window.localStorage): string | null {
  storage.removeItem('caesar_token')
  memoryAccessToken = token
  return memoryAccessToken
}

export function oauthStartUrl(provider: 'google' | 'kakao', apiBase: string): string {
  return `${apiBase.replace(/\/$/, '')}/auth/oauth/${provider}/start`
}

export function shouldShowVerificationPrompt(user?: User | null): boolean {
  return Boolean(user && user.role !== 'admin' && !user.email_verified_at)
}
