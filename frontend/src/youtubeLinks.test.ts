import assert from 'node:assert/strict'
import test from 'node:test'

import { extractYoutubeVideoId, youtubeAppUrl } from './youtubeLinks.ts'

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
