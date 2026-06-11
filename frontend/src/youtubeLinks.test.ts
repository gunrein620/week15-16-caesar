import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canUseYoutubeHoverPreview,
  extractYoutubeVideoId,
  youtubeAppUrl,
  youtubeEmbedPreviewUrl,
  youtubeWebUrl,
} from './youtubeLinks.ts'

test('extractYoutubeVideoId handles common YouTube URLs', () => {
  assert.equal(extractYoutubeVideoId('https://www.youtube.com/watch?v=I_C6jACrTSI'), 'I_C6jACrTSI')
  assert.equal(extractYoutubeVideoId('https://youtu.be/I_C6jACrTSI?si=abc'), 'I_C6jACrTSI')
  assert.equal(extractYoutubeVideoId('I_C6jACrTSI'), 'I_C6jACrTSI')
})

test('youtubeAppUrl builds a YouTube app scheme URL', () => {
  assert.equal(
    youtubeAppUrl('https://www.youtube.com/watch?v=I_C6jACrTSI'),
    'youtube://watch?v=I_C6jACrTSI',
  )
  assert.equal(youtubeAppUrl('/posts/1'), null)
})

test('youtubeWebUrl builds a browser fallback URL', () => {
  assert.equal(
    youtubeWebUrl('https://youtu.be/I_C6jACrTSI?si=abc'),
    'https://www.youtube.com/watch?v=I_C6jACrTSI',
  )
  assert.equal(youtubeWebUrl('/posts/1'), null)
})

test('youtubeEmbedPreviewUrl builds a muted nocookie autoplay embed URL', () => {
  assert.equal(
    youtubeEmbedPreviewUrl('https://www.youtube.com/watch?v=I_C6jACrTSI'),
    'https://www.youtube-nocookie.com/embed/I_C6jACrTSI?autoplay=1&mute=1&playsinline=1&controls=0&rel=0&modestbranding=1',
  )
  assert.equal(youtubeEmbedPreviewUrl('/posts/1'), null)
})

test('canUseYoutubeHoverPreview only accepts hover capable fine pointers', () => {
  assert.equal(canUseYoutubeHoverPreview(() => ({ matches: true })), true)
  assert.equal(canUseYoutubeHoverPreview(() => ({ matches: false })), false)
})
