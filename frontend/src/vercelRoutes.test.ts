import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
  rewrites: Array<{ source: string; destination: string }>
}

function routeIndex(source: string) {
  return config.rewrites.findIndex((rewrite) => rewrite.source === source)
}

test('Vercel proxies exact board saved and workflow API paths before SPA fallback', () => {
  const postsIndex = routeIndex('/posts')
  const savedIndex = routeIndex('/saved-items')
  const subscriptionsIndex = routeIndex('/subscriptions')
  const notificationsIndex = routeIndex('/notifications')
  const collectionsIndex = routeIndex('/collections')
  const fallbackIndex = routeIndex('/(.*)')

  assert.ok(postsIndex >= 0)
  assert.ok(savedIndex >= 0)
  assert.ok(subscriptionsIndex >= 0)
  assert.ok(notificationsIndex >= 0)
  assert.ok(collectionsIndex >= 0)
  assert.ok(postsIndex < fallbackIndex)
  assert.ok(savedIndex < fallbackIndex)
  assert.ok(subscriptionsIndex < fallbackIndex)
  assert.ok(notificationsIndex < fallbackIndex)
  assert.ok(collectionsIndex < fallbackIndex)
  assert.match(config.rewrites[postsIndex].destination, /^https:\/\/backend-production-97eb4\.up\.railway\.app\/posts$/)
  assert.match(
    config.rewrites[savedIndex].destination,
    /^https:\/\/backend-production-97eb4\.up\.railway\.app\/saved-items$/,
  )
  assert.match(
    config.rewrites[subscriptionsIndex].destination,
    /^https:\/\/backend-production-97eb4\.up\.railway\.app\/subscriptions$/,
  )
  assert.match(
    config.rewrites[notificationsIndex].destination,
    /^https:\/\/backend-production-97eb4\.up\.railway\.app\/notifications$/,
  )
  assert.match(
    config.rewrites[collectionsIndex].destination,
    /^https:\/\/backend-production-97eb4\.up\.railway\.app\/collections$/,
  )
})
