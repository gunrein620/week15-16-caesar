import assert from 'node:assert/strict'
import test from 'node:test'

import { adminActivityEventsPath, adminActivitySummaryPath } from './adminAnalytics.ts'

test('admin analytics admin UI uses activity aliases that avoid blocker-prone event paths', () => {
  assert.equal(adminActivitySummaryPath(7), '/admin/activity/summary?days=7')
  assert.equal(adminActivityEventsPath(7, 30), '/admin/activity/events?days=7&limit=30')
  assert.ok(!adminActivityEventsPath(7, 30).includes('analytics/events'))
})
