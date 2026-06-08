import assert from 'node:assert/strict'
import test from 'node:test'

import type { PostEmbed } from './api.ts'
import { findBriefingEmbedForLink } from './briefingEmbeds.ts'

const embeds: PostEmbed[] = [
  {
    type: 'source_card',
    item_type: 'youtube',
    title: '인터넷 달군 리센느 거제 야호',
    description: '영상 설명',
    url: 'https://www.youtube.com/watch?v=abc123',
    thumbnail_url: 'https://img.example.com/abc.jpg',
    source_label: 'YouTube',
    published_at: '2026-06-08T08:14:00Z',
  },
  {
    type: 'source_card',
    item_type: 'post',
    title: '팬 후기 모음',
    description: '팬 게시글',
    url: '/posts/12',
    thumbnail_url: '',
    source_label: 'Fan post',
    published_at: '2026-06-08T07:00:00Z',
  },
]

test('findBriefingEmbedForLink upgrades markdown links to thumbnail source cards', () => {
  const match = findBriefingEmbedForLink(embeds, {
    type: 'link',
    title: '인터넷 달군 리센느 거제 야호',
    url: 'https://www.youtube.com/watch?v=abc123',
  })

  assert.equal(match?.thumbnail_url, 'https://img.example.com/abc.jpg')
})

test('findBriefingEmbedForLink supports internal fan post links', () => {
  const match = findBriefingEmbedForLink(embeds, {
    type: 'link',
    title: '팬 후기 모음',
    url: '/posts/12',
  })

  assert.equal(match?.item_type, 'post')
})
