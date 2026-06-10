import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

type JsonRpcResponse =
  | {
      jsonrpc: '2.0';
      id: string;
      result: unknown;
    }
  | {
      jsonrpc: '2.0';
      id: string;
      error: {
        code: number;
        message: string;
        data?: unknown;
      };
    };

export class McpClientError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly data?: unknown
  ) {
    super(message);
    this.name = 'McpClientError';
  }
}

@Injectable()
export class McpClientService {
  async callTool(toolName: string, input: Record<string, unknown>) {
    const id = randomUUID();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(process.env.MCP_SERVER_URL ?? 'http://localhost:3010/rpc', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        signal: controller.signal,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: input
          }
        })
      });

      if (!response.ok) {
        throw new McpClientError(`MCP server HTTP ${response.status}`);
      }

      const payload = (await response.json()) as JsonRpcResponse;
      if ('error' in payload) {
        throw new McpClientError(payload.error.message, payload.error.code, payload.error.data);
      }
      return payload.result;
    } catch (error) {
      if (error instanceof McpClientError) {
        throw error;
      }
      throw new McpClientError(error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timeout);
    }
  }
}
