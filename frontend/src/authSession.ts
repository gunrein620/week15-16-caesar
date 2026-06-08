import type { User } from './api.ts'

export type OAuthProvider = 'google' | 'kakao' | 'naver'
export type OAuthStatus = Record<OAuthProvider, boolean>

export const oauthProviderLabels: Record<OAuthProvider, string> = {
  google: 'Google 계정으로 로그인',
  kakao: '카카오 로그인',
  naver: '네이버 로그인',
}

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
  return (['google', 'kakao', 'naver'] as const).filter((provider) => status[provider])
}

export function shouldShowVerificationPrompt(user?: User | null, emailVerificationEnabled = true): boolean {
  return Boolean(emailVerificationEnabled && user && user.role !== 'admin' && !user.email_verified_at)
}
