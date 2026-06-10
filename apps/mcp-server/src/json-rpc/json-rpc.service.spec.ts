import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JsonRpcService } from './json-rpc.service.js';

describe('JsonRpcService', () => {
  const toolsService = {
    call: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls get_weather_by_region through tools/call', async () => {
    toolsService.call.mockResolvedValue({
      summary: '오산의 예보 요약',
      raw: { temperature: 24, rainProbability: 70 },
      source: 'mock'
    });
    const service = new JsonRpcService(toolsService as never);

    const result = await service.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'get_weather_by_region',
        arguments: { region: '오산', date: '2026-06-13' }
      }
    });

    expect(toolsService.call).toHaveBeenCalledWith('get_weather_by_region', {
      region: '오산',
      date: '2026-06-13'
    });
    expect(result).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        summary: '오산의 예보 요약',
        raw: { temperature: 24, rainProbability: 70 },
        source: 'mock'
      }
    });
  });

  it('returns -32600 for invalid JSON-RPC version', async () => {
    const service = new JsonRpcService(toolsService as never);

    const result = await service.handle({ jsonrpc: '1.0', id: 'bad', method: 'tools/call' });

    expect(result).toEqual({
      jsonrpc: '2.0',
      id: 'bad',
      error: {
        code: -32600,
        message: 'Invalid Request'
      }
    });
  });

  it('returns -32601 for unknown method', async () => {
    const service = new JsonRpcService(toolsService as never);

    const result = await service.handle({ jsonrpc: '2.0', id: 2, method: 'unknown' });

    expect(result.error?.code).toBe(-32601);
    expect(result.id).toBe(2);
  });

  it('returns -32602 for invalid params', async () => {
    const service = new JsonRpcService(toolsService as never);

    const result = await service.handle({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { arguments: {} }
    });

    expect(result.error?.code).toBe(-32602);
  });

  it('returns -32000 for tool failures', async () => {
    toolsService.call.mockRejectedValue(new Error('weather down'));
    const service = new JsonRpcService(toolsService as never);

    const result = await service.handle({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'get_weather_by_region', arguments: { region: '오산' } }
    });

    expect(result.error).toEqual({
      code: -32000,
      message: 'Tool execution failed',
      data: 'weather down'
    });
  });
});
