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

export type Post = {
  id: number
  title: string
  content: string
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

export type YoutubeSource = {
  id: number
  artist_id: number
  source_type: string
  source_value: string
  title: string
  enabled: boolean
}

export type YoutubeVideo = {
  id: string
  title: string
  description: string
  channel_title: string
  thumbnail_url: string
  url: string
}

export type AuthResponse = {
  access_token: string
  token_type: string
  user: User
}

export type BriefingPreview = {
  run_id: number
  preview_markdown: string
  briefing_date: string
  briefing_type: string
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
