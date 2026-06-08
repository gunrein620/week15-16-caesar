const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/
const YOUTUBE_HOVER_PREVIEW_QUERY = '(hover: hover) and (pointer: fine)'

type MatchMediaLike = (query: string) => { matches: boolean }

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

export function youtubeEmbedPreviewUrl(value: string): string | null {
  const videoId = extractYoutubeVideoId(value)
  if (!videoId) return null
  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    playsinline: '1',
    controls: '0',
    rel: '0',
    modestbranding: '1',
  })
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`
}

export function canUseYoutubeHoverPreview(matchMedia?: MatchMediaLike): boolean {
  const matcher =
    matchMedia ??
    (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia.bind(window) : null)
  return matcher ? matcher(YOUTUBE_HOVER_PREVIEW_QUERY).matches : false
}
