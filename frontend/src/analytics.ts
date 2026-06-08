import type { AppPanel } from './boardNavigation'
import { resolveApiBase } from './apiBase.ts'

export type AnalyticsEventName =
  | 'app_open'
  | 'panel_view'
  | 'feed_filter_change'
  | 'archive_search_submit'
  | 'archive_search_load_more'
  | 'feed_card_open'
  | 'youtube_app_open'
  | 'saved_item_add'
  | 'post_open'
  | 'post_create'
  | 'comment_create'

export type AnalyticsMetadata = Record<string, string | number | boolean | null | undefined>

const SESSION_STORAGE_KEY = 'rescene_analytics_session_id'
const API_BASE = resolveApiBase(import.meta.env?.VITE_API_BASE_URL, Boolean(import.meta.env?.PROD))
const SAFE_METADATA_KEYS = new Set([
  'query',
  'item_type',
  'item_key',
  'title',
  'source_label',
  'panel',
  'source',
  'filter',
  'member',
  'keyword',
  'limit',
  'offset',
  'post_id',
  'video_id',
])

export function getAnalyticsSessionId(
  storage: Storage = window.localStorage,
  uuidFactory: () => string = () => crypto.randomUUID(),
): string {
  const current = storage.getItem(SESSION_STORAGE_KEY)
  if (current) return current
  const next = uuidFactory()
  storage.setItem(SESSION_STORAGE_KEY, next)
  return next
}

export function shouldTrackPanelView(panel: AppPanel): boolean {
  return panel !== 'admin'
}

function safeMetadata(metadata: AnalyticsMetadata = {}): Record<string, string | number | boolean> {
  const clean: Record<string, string | number | boolean> = {}
  Object.entries(metadata).forEach(([key, value]) => {
    if (!SAFE_METADATA_KEYS.has(key) || value === null || value === undefined) return
    if (typeof value === 'string') clean[key] = value.slice(0, key === 'query' ? 120 : 180)
    if (typeof value === 'number' || typeof value === 'boolean') clean[key] = value
  })
  return clean
}

export function analyticsPayload({
  eventName,
  anonymousSessionId,
  path,
  panel,
  metadata,
}: {
  eventName: AnalyticsEventName
  anonymousSessionId: string
  path: string
  panel?: string
  metadata?: AnalyticsMetadata
}) {
  return {
    event_name: eventName,
    anonymous_session_id: anonymousSessionId,
    path,
    panel: panel ?? '',
    source: 'frontend',
    metadata: safeMetadata(metadata),
  }
}

export function trackAnalyticsEvent({
  eventName,
  panel,
  metadata,
  token,
}: {
  eventName: AnalyticsEventName
  panel?: string
  metadata?: AnalyticsMetadata
  token?: string | null
}): void {
  try {
    const anonymousSessionId = getAnalyticsSessionId()
    const payload = analyticsPayload({
      eventName,
      anonymousSessionId,
      path: window.location.pathname || '/',
      panel,
      metadata,
    })
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    void fetch(`${API_BASE}/analytics/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    // Analytics must never block normal app usage.
  }
}
