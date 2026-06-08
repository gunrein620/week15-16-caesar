export const BRIEFING_INTRO = "RESCENE 오늘의 요약"

export type BriefingSectionHeading = "핵심 요약" | "최근 영상" | "팬 반응" | "팬 게시글" | "Naver 소식"

export type BriefingContentItem =
  | { type: "bullet"; text: string }
  | { type: "text"; text: string }
  | { type: "link"; title: string; url: string }

export type BriefingContentSection = {
  heading: BriefingSectionHeading
  items: BriefingContentItem[]
}

export type ParsedBriefingContent = {
  title?: string
  dateLine?: string
  sections: BriefingContentSection[]
}

const SECTION_HEADINGS: BriefingSectionHeading[] = ["핵심 요약", "최근 영상", "팬 반응", "팬 게시글", "Naver 소식"]
const SECTION_SET = new Set<string>(SECTION_HEADINGS)
const BULLET_RE = /^[-*]\s+(.+)$/
const NUMBERED_RE = /^\d+\.\s*(.+)$/
const LINK_RE = /^링크:\s*((?:https?:\/\/|\/posts\/)\S+)/i

function cleanUrl(url: string) {
  return url.trim().replace(/[.,!?;:]$/, "")
}

export function shouldUseBriefingContent(category: string, content: string) {
  return category === "브리핑" || content.trimStart().startsWith(BRIEFING_INTRO)
}

export function parseBriefingContent(content: string): ParsedBriefingContent | null {
  const lines = content.replace(/\r\n/g, "\n").split("\n")
  const sections: BriefingContentSection[] = []
  let title: string | undefined
  let dateLine: string | undefined
  let currentSection: BriefingContentSection | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line) continue

    if (!title && line.endsWith("오늘의 요약")) {
      title = line
      continue
    }
    if (!dateLine && line.startsWith("기준일:")) {
      dateLine = line
      continue
    }
    if (SECTION_SET.has(line)) {
      currentSection = { heading: line as BriefingSectionHeading, items: [] }
      sections.push(currentSection)
      continue
    }
    if (!currentSection) continue

    const bullet = line.match(BULLET_RE)
    if (bullet) {
      currentSection.items.push({ type: "bullet", text: bullet[1].trim() })
      continue
    }

    const numbered = line.match(NUMBERED_RE)
    if (numbered) {
      const itemTitle = numbered[1].trim()
      const nextLine = lines[index + 1]?.trim() ?? ""
      const link = nextLine.match(LINK_RE)
      if (link) {
        currentSection.items.push({ type: "link", title: itemTitle, url: cleanUrl(link[1]) })
        index += 1
      } else {
        currentSection.items.push({ type: "text", text: itemTitle })
      }
      continue
    }

    const link = line.match(LINK_RE)
    if (link) {
      const url = cleanUrl(link[1])
      currentSection.items.push({ type: "link", title: url, url })
      continue
    }

    currentSection.items.push({ type: "text", text: line })
  }

  if (sections.length === 0) return null
  return { title, dateLine, sections }
}
