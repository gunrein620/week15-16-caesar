import type { SavedItem, UpdateFeedItem } from './api'

export function savedFeedItemPayload(item: UpdateFeedItem) {
  return {
    item_type: item.item_type,
    item_id: item.id,
    url: item.url,
    title: item.title,
    thumbnail_url: item.thumbnail_url,
    source_label: item.source_label,
  }
}

export function findSavedFeedItem(savedItems: SavedItem[] | undefined, item: UpdateFeedItem): SavedItem | null {
  return (
    savedItems?.find((savedItem) => savedItem.item_type === item.item_type && savedItem.item_key === item.id) ?? null
  )
}
