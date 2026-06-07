export type VideoSort = 'latest' | 'views' | 'title'

type SortableVideo = {
  id: string
  title: string
  published_at: string | null
  view_count: number | string | null
}

function numericViewCount(value: SortableVideo['view_count']) {
  if (value === null || value === undefined) return -1
  if (typeof value === 'number') return Number.isFinite(value) ? value : -1
  const normalized = value.replace(/,/g, '').trim()
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : -1
}

function publishedTime(value: string | null) {
  const parsed = new Date(value ?? 0).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

export function sortYoutubeVideos<T extends SortableVideo>(videos: T[], sort: VideoSort): T[] {
  const uniqueVideos = Array.from(new Map(videos.map((video) => [video.id, video])).values())
  return uniqueVideos.sort((left, right) => {
    if (sort === 'views') {
      return (
        numericViewCount(right.view_count) - numericViewCount(left.view_count) ||
        publishedTime(right.published_at) - publishedTime(left.published_at) ||
        left.title.localeCompare(right.title)
      )
    }
    if (sort === 'title') return left.title.localeCompare(right.title)
    return (
      publishedTime(right.published_at) - publishedTime(left.published_at) ||
      numericViewCount(right.view_count) - numericViewCount(left.view_count) ||
      left.title.localeCompare(right.title)
    )
  })
}
