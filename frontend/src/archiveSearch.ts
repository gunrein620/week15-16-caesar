export type ArchiveAnswerPreview = {
  text: string
  collapsed: boolean
}

export type ArchiveSourceDisplay = {
  title: string
  description: string | null
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
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
