export type ChatScrollMetrics = {
  scrollHeight: number
  scrollTop: number
  clientHeight: number
}

export const CHAT_AUTO_SCROLL_THRESHOLD_PX = 80

export function shouldAutoScrollChat(
  metrics: ChatScrollMetrics,
  threshold = CHAT_AUTO_SCROLL_THRESHOLD_PX,
): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold
}

export function chatScrollOptionsForUpdate(scrollHeight: number, isStreaming: boolean): ScrollToOptions {
  return {
    top: scrollHeight,
    behavior: isStreaming ? 'auto' : 'smooth',
  }
}
