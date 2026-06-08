import type { PostEmbed } from './api'
import type { BriefingContentItem } from './briefingContent'

function normalizeTitle(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

export function findBriefingEmbedForLink(
  embeds: PostEmbed[] | undefined,
  item: Extract<BriefingContentItem, { type: 'link' }>,
): PostEmbed | null {
  if (!embeds?.length) return null
  return (
    embeds.find((embed) => embed.url === item.url) ??
    embeds.find((embed) => normalizeTitle(embed.title) === normalizeTitle(item.title)) ??
    null
  )
}
