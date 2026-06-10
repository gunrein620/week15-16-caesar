import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type ChatMessage =
  | {
      role: 'system' | 'user';
      content: string;
    }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    }
  | {
      role: 'tool';
      content: string;
      tool_call_id: string;
    };

export type ChatOptions = {
  model?: string;
  temperature?: number;
};

export type WebSearchCitation = {
  url: string;
  title?: string;
};

export type WebSearchResult = {
  text: string;
  citations: WebSearchCitation[];
};

export type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolCallResult =
  | { type: 'message'; content: string }
  | {
      type: 'tool_call';
      toolCallId: string;
      toolName: string;
      arguments: Record<string, unknown>;
      rawArguments: string;
    };

@Injectable()
export class LlmService {
  async createEmbedding(input: string): Promise<number[]> {
    const apiKey = this.getApiKey();
    const response = await fetch(`${this.getBaseUrl()}/embeddings`, {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify({
        model: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
        input
      })
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(`Embedding API failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const embedding = payload.data?.[0]?.embedding;
    if (!embedding) {
      throw new ServiceUnavailableException('Embedding API returned no embedding');
    }
    return embedding;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const apiKey = this.getApiKey();
    const response = await fetch(`${this.getBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify({
        model: options.model ?? process.env.LLM_MODEL ?? 'gpt-4.1-mini',
        temperature: options.temperature ?? 0.2,
        messages
      })
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(`Chat API failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return payload.choices?.[0]?.message?.content?.trim() ?? '';
  }

  async chatWithTools(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options: ChatOptions = {}
  ): Promise<ToolCallResult> {
    const apiKey = this.getApiKey();
    const response = await fetch(`${this.getBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify({
        model: options.model ?? process.env.LLM_MODEL ?? 'gpt-4.1-mini',
        temperature: options.temperature ?? 0.2,
        messages,
        tools,
        tool_choice: 'auto'
      })
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(`Tool chat API failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{
            id?: string;
            type?: 'function';
            function?: {
              name?: string;
              arguments?: string;
            };
          }>;
        };
      }>;
    };
    const message = payload.choices?.[0]?.message;
    const toolCall = message?.tool_calls?.[0];
    const functionCall = toolCall?.function;
    if (functionCall?.name) {
      const rawArguments = functionCall.arguments ?? '{}';
      return {
        type: 'tool_call',
        toolCallId: toolCall?.id ?? `tool-${Date.now()}`,
        toolName: functionCall.name,
        arguments: this.parseToolArguments(rawArguments),
        rawArguments
      };
    }
    return {
      type: 'message',
      content: message?.content?.trim() ?? ''
    };
  }

  async searchWeb(input: string, options: { model?: string } = {}): Promise<WebSearchResult> {
    const apiKey = this.getApiKey();
    const response = await fetch(`${this.getBaseUrl()}/responses`, {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify({
        model: options.model ?? process.env.OPENAI_WEB_SEARCH_MODEL ?? 'gpt-5.5',
        tools: [{ type: 'web_search' }],
        input
      })
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(`Web search API failed with ${response.status}`);
    }

    const payload = (await response.json()) as ResponsesApiPayload;
    const content = this.firstOutputText(payload);
    return {
      text: content?.text?.trim() ?? '',
      citations: (content?.annotations ?? []).flatMap((annotation) => {
        const citation = this.toWebSearchCitation(annotation);
        return citation ? [citation] : [];
      })
    };
  }

  private getApiKey() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException('OPENAI_API_KEY is required for AI features.');
    }
    return apiKey;
  }

  private getBaseUrl() {
    return (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  }

  private headers(apiKey: string) {
    return {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    };
  }

  private parseToolArguments(raw: string | undefined): Record<string, unknown> {
    if (!raw) {
      return {};
    }
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private firstOutputText(payload: ResponsesApiPayload) {
    if (typeof payload.output_text === 'string') {
      return { text: payload.output_text, annotations: [] };
    }

    for (const item of payload.output ?? []) {
      if (item?.type !== 'message' || !Array.isArray(item.content)) {
        continue;
      }
      const textContent = item.content.find((content) => content?.type === 'output_text' && typeof content.text === 'string');
      if (textContent) {
        return textContent;
      }
    }
    return null;
  }

  private toWebSearchCitation(annotation: unknown): WebSearchCitation | null {
    if (!annotation || typeof annotation !== 'object') {
      return null;
    }
    const candidate = annotation as {
      type?: unknown;
      url?: unknown;
      title?: unknown;
      url_citation?: {
        url?: unknown;
        title?: unknown;
      };
    };
    if (candidate.type !== 'url_citation') {
      return null;
    }
    const nested = candidate.url_citation;
    const url = typeof candidate.url === 'string' ? candidate.url : typeof nested?.url === 'string' ? nested.url : undefined;
    if (!url) {
      return null;
    }
    const title = typeof candidate.title === 'string' ? candidate.title : typeof nested?.title === 'string' ? nested.title : undefined;
    return { url, title };
  }
}

type ResponsesApiPayload = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: unknown[];
    }>;
  }>;
};
