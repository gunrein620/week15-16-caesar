import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
  rewrites: Array<{ source: string; destination: string }>
}

function routeIndex(source: string) {
  return config.rewrites.findIndex((rewrite) => rewrite.source === source)
}

test('Vercel proxies exact board and saved API paths before SPA fallback', () => {
  const postsIndex = routeIndex('/posts')
  const savedIndex = routeIndex('/saved-items')
  const fallbackIndex = routeIndex('/(.*)')

  assert.ok(postsIndex >= 0)
  assert.ok(savedIndex >= 0)
  assert.ok(postsIndex < fallbackIndex)
  assert.ok(savedIndex < fallbackIndex)
  assert.match(config.rewrites[postsIndex].destination, /^https:\/\/backend-production-97eb4\.up\.railway\.app\/posts$/)
  assert.match(
    config.rewrites[savedIndex].destination,
    /^https:\/\/backend-production-97eb4\.up\.railway\.app\/saved-items$/,
  )
})
