import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentToolRegistryService } from './agent-tool-registry.service.js';

describe('AgentToolRegistryService', () => {
  const rag = {
    ask: vi.fn(),
    checkDuplicate: vi.fn(),
    findSimilarPosts: vi.fn()
  };
  const mcpClient = {
    callTool: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('suggests normalized tags from local text', async () => {
    const service = new AgentToolRegistryService(rag as never, mcpClient as never);

    const result = await service.execute('suggest_tags', {
      text: '오산역 근처 야간 약국 정보와 생활정보 공유'
    });

    expect(result).toEqual({
      tags: expect.arrayContaining(['오산', '야간약국', '생활정보'])
    });
  });

  it('routes call_mcp_tool to the MCP client', async () => {
    mcpClient.callTool.mockResolvedValue({ source: 'mock' });
    const service = new AgentToolRegistryService(rag as never, mcpClient as never);

    const result = await service.execute('call_mcp_tool', {
      toolName: 'get_weather_by_region',
      input: { region: '오산' }
    });

    expect(result).toEqual({ source: 'mock' });
    expect(mcpClient.callTool).toHaveBeenCalledWith('get_weather_by_region', { region: '오산' });
  });
});
