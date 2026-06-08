import type { User } from './api.ts'

export type OAuthProvider = 'google' | 'kakao'
export type OAuthStatus = Record<OAuthProvider, boolean>

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

export function oauthStartUrl(provider: OAuthProvider, apiBase: string): string {
  return `${apiBase.replace(/\/$/, '')}/auth/oauth/${provider}/start`
}

export function configuredOauthProviders(status?: OAuthStatus | null): OAuthProvider[] {
  if (!status) return []
  return (['google', 'kakao'] as const).filter((provider) => status[provider])
}

export function shouldShowVerificationPrompt(user?: User | null): boolean {
  return Boolean(user && user.role !== 'admin' && !user.email_verified_at)
}
