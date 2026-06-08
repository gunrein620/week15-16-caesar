export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export type User = {
  id: number
  email: string
  display_name: string
  role: 'user' | 'admin'
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
  term_type: 'song' | 'album' | 'activity'
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
}

export type QaSource = {
  chunk_id: number | null
  post_id: number | null
  youtube_video_id: string | null
  source_type: 'post' | 'youtube' | 'briefing' | 'naver_news' | 'naver_blog'
  title: string
  url: string
  thumbnail_url: string
  channel_title: string
  source_label?: string
  published_at: string | null
  view_count: number | null
  comment_count?: number | null
  content: string
  description?: string
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

export async function api<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(typeof body.detail === 'string' ? body.detail : response.statusText)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
