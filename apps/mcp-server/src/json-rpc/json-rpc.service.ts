import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ToolsService } from '../tools/tools.service.js';
import type { JsonRpcId, JsonRpcRequest, JsonRpcResponse, ToolCallParams } from './json-rpc.types.js';

@Injectable()
export class JsonRpcService {
  constructor(@Inject(ToolsService) private readonly toolsService: ToolsService) {}

  async handle(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const id = this.getId(request);
    if (!request || request.jsonrpc !== '2.0') {
      return this.error(id, -32600, 'Invalid Request');
    }
    if (request.method !== 'tools/call') {
      return this.error(id, -32601, 'Method not found');
    }

    const params = this.parseToolCallParams(request.params);
    if (!params) {
      return this.error(id, -32602, 'Invalid params');
    }

    try {
      const result = await this.toolsService.call(params.name, params.arguments);
      return {
        jsonrpc: '2.0',
        id,
        result
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        return this.error(id, -32602, 'Invalid params', this.errorMessage(error));
      }
      return this.error(id, -32000, 'Tool execution failed', this.errorMessage(error));
    }
  }

  private parseToolCallParams(params: unknown): ToolCallParams | null {
    if (!params || typeof params !== 'object') {
      return null;
    }
    const record = params as Record<string, unknown>;
    const args = record.arguments;
    if (
      typeof record.name !== 'string' ||
      !record.name ||
      !args ||
      typeof args !== 'object' ||
      Array.isArray(args)
    ) {
      return null;
    }
    return {
      name: record.name,
      arguments: args as Record<string, unknown>
    };
  }

  private getId(request: JsonRpcRequest | null | undefined): JsonRpcId {
    const id = request?.id;
    return typeof id === 'string' || typeof id === 'number' || id === null ? id : null;
  }

  private error(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        ...(data === undefined ? {} : { data })
      }
    };
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
