import { resolveApiBase } from './apiBase.ts'
import { ACCESS_TOKEN_EVENT, storeAccessToken } from './authSession.ts'
import { createSseBuffer, type ChatEvent } from './chatStream.ts'

export const API_BASE = resolveApiBase(import.meta.env?.VITE_API_BASE_URL, Boolean(import.meta.env?.PROD))

type AuthRefreshResponse = {
  access_token: string
}

function publishAccessToken(token: string | null) {
  storeAccessToken(token)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<string | null>(ACCESS_TOKEN_EVENT, { detail: token }))
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const response = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
  if (!response.ok) {
    publishAccessToken(null)
    return null
  }
  const body = (await response.json()) as AuthRefreshResponse
  publishAccessToken(body.access_token)
  return body.access_token
}

export type User = {
  id: number
  email: string
  display_name: string
  role: 'user' | 'admin'
  email_verified_at: string | null
  active_session_count?: number | null
}

export type EmailVerificationSendResponse = {
  status: 'sent' | 'already_verified' | 'email_disabled'
}

export type Artist = {
  id: number
  slug: string
  name: string
  description: string
}

export type PostEmbed = {
  type: 'image' | 'youtube' | 'link' | 'source_card'
  item_type?: UpdateFeedItem['item_type']
  url: string
  title: string
  description: string
  thumbnail_url: string
  provider?: string
  source_label?: string
  published_at?: string
  video_id?: string
}

export type Post = {
  id: number
  category: string
  title: string
  content: string
  thumbnail_url: string
  embeds: PostEmbed[]
  author: User
  artist: Artist
  tags: string[]
  comment_count: number
  created_at: string
  updated_at: string
}

export type PostList = {
  items: Post[]
  total: number
  page: number
  page_size: number
}

export type Comment = {
  id: number
  content: string
  author: User
  created_at: string
}

export type Tag = {
  id: number
  name: string
}

export type Member = {
  id: number
  artist_id: number
  name: string
  position: string
}

export type ArtistKeyword = {
  id: number
  artist_id: number
  keyword: string
}

export type ArtistArchiveTerm = {
  id: number
  artist_id: number
  term_type: 'song' | 'album' | 'activity' | 'member'
  title: string
  aliases: string[]
}

export type YoutubeSourceType =
  | 'official_channel'
  | 'member_channel'
  | 'fan_channel'
  | 'curated_video'
  | 'keyword_search'

export type YoutubeSource = {
  id: number
  artist_id: number
  source_type: YoutubeSourceType
  source_value: string
  title: string
  enabled: boolean
  backfill_cursor: string | null
  backfill_status: string
  backfill_started_at: string | null
  backfill_completed_at: string | null
  backfill_error: string
}

export type YoutubeBackfillResult = {
  created: number
  updated: number
  linked: number
  pages_fetched: number
  sources_processed: number
  sources_completed: number
  has_more: boolean
}

export type YoutubeVideo = {
  id: string
  title: string
  description: string
  channel_title: string
  published_at: string | null
  thumbnail_url: string
  url: string
  view_count: number | null
  like_count: number | null
  comment_count: number | null
  thumbnail_analysis_status?: string
  thumbnail_detected_members?: string[]
  thumbnail_person_count?: number | null
  thumbnail_analysis_confidence?: number | null
}

export type QaSource = {
  chunk_id: number | null
  search_item_id?: number | null
  post_id: number | null
  youtube_video_id: string | null
  external_update_id?: number | null
  source_type: 'post' | 'youtube' | 'briefing' | 'naver_news' | 'naver_blog'
  title: string
  url: string
  thumbnail_url: string
  channel_title: string
  source_label?: string
  source_types?: string[]
  primary_source_type?: string | null
  source_title?: string | null
  is_official?: boolean
  member_names?: string[]
  archive_terms?: { id: number; title: string }[]
  has_transcript?: boolean
  published_at: string | null
  view_count: number | null
  like_count?: number | null
  comment_count?: number | null
  content: string
  description?: string
  thumbnail_analysis_status?: string
  thumbnail_detected_members?: string[]
  thumbnail_person_count?: number | null
  thumbnail_analysis_confidence?: number | null
}

export type QaResponse = {
  answer: string
  sources: QaSource[]
  has_more: boolean
  next_offset: number | null
  search_intent: Record<string, unknown> | null
}

export type ChatMessagePayload = {
  role: 'user' | 'assistant'
  content: string
}

export type RagContextResponse = {
  summary: string
  sources: QaSource[]
  insert_text: string
  suggested_members: string[]
  suggested_archive_terms: { id: number; title: string; term_type: string }[]
  suggested_collection_targets: { id: number | null; title: string; reason: string }[]
}

export type WritingAssistRequest = {
  title: string
  content: string
  category: string
  artist_id: number
  limit?: number
}

export type SavedSummaryRequest = {
  artist_id: number
  limit?: number
}

export type UpdateFeedItem = {
  id: string
  item_type: 'youtube' | 'post' | 'briefing' | 'naver_news' | 'naver_blog'
  title: string
  description: string
  url: string
  thumbnail_url: string
  source_label: string
  published_at: string
  view_count: number | null
  comment_count: number | null
  matched_keywords: string[]
  member_names: string[]
  thumbnail_analysis_status?: string
  thumbnail_detected_members?: string[]
  thumbnail_person_count?: number | null
  thumbnail_analysis_confidence?: number | null
  tags: string[]
}

export type UpdateFeedResponse = {
  artist_id: number
  items: UpdateFeedItem[]
  naver_available: boolean
  next_cursor: string | null
  has_more: boolean
}

export type AuthResponse = {
  access_token: string
  token_type: string
  user: User
}

export type SignupSettings = {
  public_signup_enabled: boolean
  email_verification_enabled: boolean
}

export type InfraCostSettings = {
  hard_stop_enabled: boolean
  manual_hard_stop: boolean
  hard_stopped: boolean
  monthly_budget_usd: number
  estimated_monthly_usd: number
  elapsed_estimated_usd: number
  budget_ratio: number
  railway_subscription_monthly_usd: number
  railway_backend_estimated_monthly_usd: number
  railway_db_estimated_monthly_usd: number
  vercel_estimated_monthly_usd: number
  period_start: string
  next_reset: string
}

export type SyncSettings = {
  enabled: boolean
  official_interval_minutes: number
  member_interval_minutes: number
  fan_interval_minutes: number
  curated_interval_minutes: number
  naver_interval_minutes: number
  keyword_interval_minutes: number
  last_official_sync_at: string | null
  last_member_sync_at: string | null
  last_fan_sync_at: string | null
  last_curated_sync_at: string | null
  last_naver_sync_at: string | null
  last_keyword_sync_at: string | null
}

export type RagCoverage = {
  artist_id: number
  youtube_videos: number
  youtube_embedded_videos: number
  youtube_missing_videos: number
  youtube_stale_videos: number
  post_chunks: number
  youtube_chunks: number
  estimated_tokens: number
  estimated_standard_cost_usd: number
  estimated_batch_cost_usd: number
  recent_90d_youtube_videos: number
  recent_90d_missing_videos: number
}

export type RagCleanupResult = {
  orphan_deleted: number
  stale_deleted: number
  duplicate_deleted: number
}

export type RagEmbedYoutubeResult = {
  processed: number
  embedded: number
  skipped: number
  failed: number
  created_chunks: number
  remaining_missing: number
  estimated_tokens: number
}

export type RagThumbnailAnalysisResult = {
  processed: number
  analyzed: number
  unavailable: number
  failed: number
  remaining: number
}

export type RagEmbeddingJob = {
  id: number
  artist_id: number
  user_id: number | null
  scope: 'recent_90d' | 'all'
  source_type: YoutubeSourceType | null
  batch_size: number
  force: boolean
  status: 'running' | 'completed' | 'failed'
  total_videos: number
  total_candidates: number
  processed: number
  embedded: number
  failed: number
  created_chunks: number
  estimated_tokens: number
  remaining_missing: number
  last_error: string
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type BriefingPreview = {
  run_id: number
  preview_markdown: string
  briefing_date: string
  briefing_type: string
  source_cards: PostEmbed[]
}

export type SavedItem = {
  id: number
  item_type: UpdateFeedItem['item_type'] | 'post'
  item_key: string
  title: string
  url: string
  thumbnail_url: string
  source_label: string
  saved_at: string
}

export type UserSubscription = {
  id: number
  user_id: number
  artist_id: number
  name: string
  content_types: string[]
  source_types: string[]
  member_names: string[]
  archive_term_ids: number[]
  enabled: boolean
  last_checked_at: string | null
  created_at: string
  updated_at: string
}

export type UserNotification = {
  id: number
  user_id: number
  artist_id: number
  subscription_id: number | null
  search_item_id: number
  notification_type: string
  title: string
  body: string
  url: string
  thumbnail_url: string
  read_at: string | null
  created_at: string
}

export type CollectionItem = {
  id: number
  collection_id: number
  search_item_id: number
  title: string
  url: string
  thumbnail_url: string
  source_type: string
  position: number
  note: string
  created_at: string
}

export type UserCollection = {
  id: number
  user_id: number
  artist_id: number
  title: string
  description: string
  visibility: 'private'
  ai_summary: string
  created_at: string
  updated_at: string
  items?: CollectionItem[]
}

export type DataQualityTask = {
  id: number
  artist_id: number
  search_item_id: number
  task_type: string
  status: string
  priority: number
  error_message: string
  resolved_at: string | null
  title: string
  source_type: string
  created_at: string
  updated_at: string
}

export type DataQualityBuildResult = {
  created: number
  pending: number
}

export type AgentRun = {
  id: number
  artist_id: number
  user_id: number
  status: string
  briefing_type: string
  briefing_date: string
  preview_markdown: string
  created_post_id: number | null
  tool_calls: Record<string, unknown>[]
}

export type AutoBriefingDraftResponse = {
  created: boolean
  run: AgentRun
}

export type AnalyticsMetricRow = {
  label: string
  count: number
}

export type AnalyticsQueryRow = {
  query: string
  count: number
}

export type AnalyticsCardRow = {
  title: string
  item_type: string
  item_key: string
  count: number
}

export type AnalyticsSummary = {
  days: number
  visitors: number
  today_visitors: number
  logged_in_users: number
  events: number
  searches: number
  saves: number
  posts: number
  comments: number
  ai_questions: number
  popular_panels: AnalyticsMetricRow[]
  popular_paths: AnalyticsMetricRow[]
  popular_queries: AnalyticsQueryRow[]
  popular_cards: AnalyticsCardRow[]
}

export type AnalyticsEvent = {
  id: number
  event_name: string
  anonymous_session_id: string
  user_id: number | null
  path: string
  panel: string
  source: string
  metadata: Record<string, string | number | boolean>
  created_at: string
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' })
  if (response.status === 401 && token && path !== '/auth/refresh') {
    const refreshedToken = await refreshAccessToken()
    if (refreshedToken) {
      headers.set('Authorization', `Bearer ${refreshedToken}`)
      const retry = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' })
      if (!retry.ok) {
        const body = await retry.json().catch(() => ({ detail: retry.statusText }))
        throw new Error(typeof body.detail === 'string' ? body.detail : retry.statusText)
      }
      if (retry.status === 204) return undefined as T
      return retry.json() as Promise<T>
    }
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(typeof body.detail === 'string' ? body.detail : response.statusText)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

async function streamChatRequest({
  messages,
  artistId,
  token,
  onEvent,
  signal,
  retryOnUnauthorized = true,
}: {
  messages: ChatMessagePayload[]
  artistId: number
  token?: string | null
  onEvent: (event: ChatEvent) => void
  signal?: AbortSignal
  retryOnUnauthorized?: boolean
}) {
  const headers = new Headers()
  headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_BASE}/ai/chat`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ messages, artist_id: artistId }),
    signal,
  })
  if (response.status === 401 && token && retryOnUnauthorized) {
    const refreshedToken = await refreshAccessToken()
    if (refreshedToken) {
      await streamChatRequest({
        messages,
        artistId,
        token: refreshedToken,
        onEvent,
        signal,
        retryOnUnauthorized: false,
      })
      return
    }
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(typeof body.detail === 'string' ? body.detail : response.statusText)
  }
  if (!response.body) throw new Error('스트리밍 응답을 읽을 수 없습니다.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const sse = createSseBuffer()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    for (const event of sse.push(decoder.decode(value, { stream: true }))) {
      onEvent(event)
    }
  }
  const tail = decoder.decode()
  if (tail) {
    for (const event of sse.push(tail)) onEvent(event)
  }
}

export async function streamChat({
  messages,
  artistId = 1,
  token,
  onEvent,
  signal,
}: {
  messages: ChatMessagePayload[]
  artistId?: number
  token?: string | null
  onEvent: (event: ChatEvent) => void
  signal?: AbortSignal
}) {
  await streamChatRequest({ messages, artistId, token, onEvent, signal })
}
