export type ChatSource = Record<string, unknown>

export type ChatEvent =
  | { type: 'run'; run_id: number }
  | { type: 'tool_call'; name: string; arguments: Record<string, unknown> }
  | { type: 'tool_result'; name: string; count: number }
  | {
      type: 'sources'
      sources: ChatSource[]
      has_more?: boolean
      next_offset?: number | null
      search_intent?: Record<string, unknown> | null
      source_question?: string
    }
  | { type: 'delta'; text: string }
  | { type: 'suggestions'; items: string[] }
  | { type: 'done' }
  | { type: 'error'; message: string }

export function createSseBuffer() {
  let buffer = ''

  return {
    push(chunk: string): ChatEvent[] {
      buffer += chunk.replace(/\r\n/g, '\n')
      const events: ChatEvent[] = []
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const dataLines = block
          .split('\n')
          .filter((line) => line.startsWith('data: '))
          .map((line) => line.slice(6))
        if (dataLines.length) {
          try {
            events.push(JSON.parse(dataLines.join('\n')) as ChatEvent)
          } catch {
            // Ignore malformed SSE payloads and keep parsing later events.
          }
        }
        boundary = buffer.indexOf('\n\n')
      }
      return events
    },
  }
}
