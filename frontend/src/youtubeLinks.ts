const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/

export function extractYoutubeVideoId(value: string): string | null {
  const trimmed = value.trim()
  if (YOUTUBE_ID_RE.test(trimmed)) return trimmed
  try {
    const url = new URL(trimmed)
    if (url.hostname === 'youtu.be') {
      const candidate = url.pathname.split('/').filter(Boolean)[0] ?? ''
      return YOUTUBE_ID_RE.test(candidate) ? candidate : null
    }
    if (url.hostname.endsWith('youtube.com')) {
      const candidate = url.searchParams.get('v') ?? url.pathname.split('/').filter(Boolean).pop() ?? ''
      return YOUTUBE_ID_RE.test(candidate) ? candidate : null
    }
  } catch {
    return null
  }
  return null
}

export function youtubeAppUrl(value: string): string | null {
  const videoId = extractYoutubeVideoId(value)
  return videoId ? `youtube://watch?v=${videoId}` : null
}
