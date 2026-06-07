import type { UpdateFeedItem } from './api'

function formatFeedDateTime(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

export function buildFeedMetaParts(
  item: Pick<UpdateFeedItem, 'source_label' | 'published_at'>,
) {
  return {
    source: item.source_label,
    timestamp: formatFeedDateTime(item.published_at),
  }
}
