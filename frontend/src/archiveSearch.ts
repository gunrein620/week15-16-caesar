export type ArchiveAnswerPreview = {
  text: string
  collapsed: boolean
}

export type ArchiveSourceDisplay = {
  title: string
  description: string | null
}

type ArchiveSourceKeyInput = {
  search_item_id?: number | null
  source_type?: string
  youtube_video_id?: string | null
  post_id?: number | null
  chunk_id?: number | null
  external_update_id?: number | null
  url?: string
  title?: string
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function archiveSourceKey(source: ArchiveSourceKeyInput): string {
  if (source.search_item_id) return `search:${source.search_item_id}`
  if (source.youtube_video_id) return `youtube:${source.youtube_video_id}`
  if (source.post_id) return `post:${source.post_id}`
  if (source.external_update_id) return `external:${source.external_update_id}`
  if (source.chunk_id) return `chunk:${source.chunk_id}`
  return `${source.source_type ?? 'source'}:${source.url || source.title || ''}`
}

export function archiveSearchHintForQuestion(question: string): string {
  const normalized = normalizeWhitespace(question).toLowerCase()
  if (/(오늘|금일|최근|이번\s*주|최신|업데이트|새\s*소식)/.test(normalized)) {
    return '오늘/최근 질문은 저장된 통합 업데이트 캐시에서 먼저 찾습니다. YouTube, 브리핑, Naver, 팬글 카드가 함께 표시됩니다.'
  }
  if (/(러브\s*어택|love\s*attack|데자\s*부|deja\s*vu|uh\s*uh|곡|앨범|활동|무대|직캠|영상)/.test(normalized)) {
    return '곡명/앨범/활동명은 관리자 키워드 사전의 alias를 우선 적용해 제목이 맞는 아카이브 결과를 먼저 보여줍니다.'
  }
  return '아카이브 검색은 저장된 게시글과 YouTube 자료를 찾습니다. Naver 뉴스/블로그는 통합 업데이트 캐시에 저장된 항목을 카드로 보여줍니다.'
}

export function buildArchiveAnswerPreview(answer: string, maxLength = 90): ArchiveAnswerPreview {
  const normalized = normalizeWhitespace(answer)
  if (normalized.length <= maxLength) {
    return { text: normalized, collapsed: false }
  }
  return { text: `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`, collapsed: true }
}

export function buildArchiveSourceDisplay(source: {
  title: string
  content: string
}): ArchiveSourceDisplay {
  return {
    title: normalizeWhitespace(source.title),
    description: null,
  }
}

export function mergeArchiveSourcePages<T extends ArchiveSourceKeyInput>(current: T[], next: T[]): T[] {
  const merged: T[] = []
  const seen = new Set<string>()
  for (const source of [...current, ...next]) {
    const key = archiveSourceKey(source)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(source)
  }
  return merged
}
