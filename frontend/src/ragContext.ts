import type { QaSource, SavedItem } from './api'

export const WRITING_ASSIST_MIN_QUERY_LENGTH = 8

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function buildWritingAssistQuery(category: string, title: string, content: string) {
  return normalizeWhitespace([category, title, content].join(' '))
}

export function shouldRequestWritingAssist(query: string) {
  return normalizeWhitespace(query).length >= WRITING_ASSIST_MIN_QUERY_LENGTH
}

export function appendReferenceText(content: string, source: Pick<QaSource, 'title' | 'url'>) {
  const reference = `참고자료: ${source.title}\n${source.url}`
  return `${content.trimEnd()}\n\n${reference}`
}

export function canSummarizeSavedItems(items: SavedItem[] | undefined) {
  return Boolean(items?.length)
}
