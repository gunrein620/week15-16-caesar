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

  it('drafts a concrete parking complaint with location, issue, and requested action', async () => {
    const service = new AgentToolRegistryService(rag as never, mcpClient as never);

    const result = await service.execute('draft_complaint_post', {
      issue: '오산대 앞 카니발 주정차로 인한 교통 불편으로 문의할꺼'
    });
    const draft = result as { title: string; content: string };

    expect(draft).toEqual(
      expect.objectContaining({
        title: expect.stringContaining('오산대 앞 카니발 차량 주정차 단속 요청'),
        content: expect.stringContaining('발생 위치\n오산대 앞')
      })
    );
    expect(draft.content).toContain('카니발 차량');
    expect(draft.content).toContain('주정차로 인한 교통 불편');
    expect(draft.content).toContain('주정차 위반 여부 확인');
    expect(draft.content).toContain('현장 단속 또는 계도 조치');
  });
});
