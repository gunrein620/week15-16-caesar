import type { UpdateFeedItem } from './api'

const SEOUL_TIME_ZONE = 'Asia/Seoul'

function seoulDateKey(value: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SEOUL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value)
}

function publishedTime(value: string | null | undefined) {
  const parsed = new Date(value ?? 0).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function viewCount(value: number | null | undefined) {
  return Number.isFinite(value ?? NaN) ? Number(value) : -1
}

function mostViewedThenNewest(items: UpdateFeedItem[]) {
  return items.reduce((best, item) => {
    const viewDelta = viewCount(item.view_count) - viewCount(best.view_count)
    if (viewDelta > 0) return item
    if (viewDelta < 0) return best
    return publishedTime(item.published_at) > publishedTime(best.published_at) ? item : best
  }, items[0])
}

export function selectHomeHeroItem(
  items: UpdateFeedItem[],
  now: Date = new Date(),
): UpdateFeedItem | null {
  if (!items.length) return null
  const todayKey = seoulDateKey(now)
  const todaysItems = items.filter((item) => seoulDateKey(new Date(item.published_at)) === todayKey)
  return mostViewedThenNewest(todaysItems.length ? todaysItems : items)
}
