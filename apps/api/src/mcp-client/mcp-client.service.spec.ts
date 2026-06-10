import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpClientError, McpClientService } from './mcp-client.service.js';

describe('McpClientService', () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.MCP_SERVER_URL;

  beforeEach(() => {
    process.env.MCP_SERVER_URL = 'http://mcp.test/rpc';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.MCP_SERVER_URL = originalUrl;
    vi.clearAllMocks();
  });

  it('posts JSON-RPC tools/call with a request id', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        jsonrpc: '2.0',
        id: 'rpc-1',
        result: { source: 'mock' }
      })
    }) as never;
    const service = new McpClientService();

    const result = await service.callTool('get_weather_by_region', { region: '오산' });

    expect(result).toEqual({ source: 'mock' });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://mcp.test/rpc',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"method":"tools/call"')
      })
    );
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.params.name).toBe('get_weather_by_region');
    expect(body.id).toEqual(expect.any(String));
  });

  it('throws typed error when JSON-RPC returns error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        jsonrpc: '2.0',
        id: 'rpc-1',
        error: { code: -32602, message: 'Invalid params' }
      })
    }) as never;
    const service = new McpClientService();

    await expect(service.callTool('unknown_tool', {})).rejects.toBeInstanceOf(McpClientError);
  });
});
