import type { SavedItem, UpdateFeedItem } from './api'

export type SavedItemTarget = Pick<SavedItem, 'id'> | Pick<SavedItem, 'item_type' | 'item_key'>

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

export function optimisticSavedItemFromFeedItem(
  item: UpdateFeedItem,
  id = -Date.now(),
  savedAt = new Date().toISOString(),
): SavedItem {
  return {
    id,
    item_type: item.item_type,
    item_key: item.id,
    title: item.title,
    url: item.url,
    thumbnail_url: item.thumbnail_url,
    source_label: item.source_label,
    saved_at: savedAt,
  }
}

function sameSavedTarget(item: SavedItem, target: SavedItemTarget): boolean {
  if ('id' in target && item.id === target.id) return true
  if ('item_type' in target && 'item_key' in target) {
    return item.item_type === target.item_type && item.item_key === target.item_key
  }
  return false
}

export function mergeSavedItem(savedItems: SavedItem[] | undefined, nextItem: SavedItem): SavedItem[] {
  const current = savedItems ?? []
  return [
    nextItem,
    ...current.filter(
      (item) =>
        item.id !== nextItem.id || item.item_type !== nextItem.item_type || item.item_key !== nextItem.item_key,
    ),
  ].filter(
    (item, index, items) =>
      items.findIndex((candidate) => candidate.item_type === item.item_type && candidate.item_key === item.item_key) ===
      index,
  )
}

export function removeSavedItemFromList(
  savedItems: SavedItem[] | undefined,
  target: SavedItemTarget,
): SavedItem[] {
  return (savedItems ?? []).filter((item) => !sameSavedTarget(item, target))
}
