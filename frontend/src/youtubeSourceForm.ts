import type { YoutubeSourceType } from './api'

export type YoutubeSourceDraft = {
  sourceType: YoutubeSourceType
  sourceTitle: string
  sourceValue: string
}

export function buildYoutubeSourcePayload(draft: YoutubeSourceDraft) {
  const sourceValue = draft.sourceValue.trim()
  let title = draft.sourceTitle.trim()
  if (!title && draft.sourceType === 'keyword_search' && sourceValue) {
    title = `${sourceValue} 키워드 검색`
  }
  return {
    source_type: draft.sourceType,
    source_value: sourceValue,
    title,
  }
}
