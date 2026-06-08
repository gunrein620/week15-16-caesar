export function adminActivitySummaryPath(days: number): string {
  return `/admin/activity/summary?days=${days}`
}

export function adminActivityEventsPath(days: number, limit: number): string {
  return `/admin/activity/events?days=${days}&limit=${limit}`
}
