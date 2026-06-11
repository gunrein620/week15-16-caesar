import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentService } from './agent.service.js';

describe('AgentService', () => {
  const prisma = {
    agentSession: {
      create: vi.fn(),
      update: vi.fn()
    },
    agentToolLog: {
      create: vi.fn()
    },
    mcpToolLog: {
      create: vi.fn()
    }
  };
  const llm = {
    chatWithTools: vi.fn()
  };
  const toolRegistry = {
    definitions: vi.fn(),
    execute: vi.fn()
  };

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.agentSession.create.mockResolvedValue({ id: 'session-1' });
    prisma.agentSession.update.mockResolvedValue({});
  });

  it('stops at maxIterations and marks the session failed', async () => {
    let step = 0;
    llm.chatWithTools.mockImplementation(async () => {
      step += 1;
      return {
        type: 'tool_call',
        toolName: 'summarize_context',
        arguments: { step }
      };
    });
    toolRegistry.execute.mockResolvedValue({ ok: true });
    const service = new AgentService(prisma as never, llm as never, toolRegistry as never);

    const result = await service.run({
      userId: 'user-1',
      purpose: 'post_helper',
      input: '이번 주말 플리마켓 글 써줘'
    });

    expect(result.status).toBe('FAILED');
    expect(result.answer).toContain('최대 반복 횟수');
    expect(prisma.agentToolLog.create).toHaveBeenCalledTimes(4);
    expect(prisma.agentSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'session-1' },
        data: expect.objectContaining({ status: 'FAILED' })
      })
    );
  });

  it('rejects repeated same tool input before executing it again', async () => {
    llm.chatWithTools
      .mockResolvedValueOnce({
        type: 'tool_call',
        toolName: 'call_mcp_tool',
        arguments: { toolName: 'get_weather_by_region', input: { region: '오산' } }
      })
      .mockResolvedValueOnce({
        type: 'tool_call',
        toolName: 'call_mcp_tool',
        arguments: { toolName: 'get_weather_by_region', input: { region: '오산' } }
      });
    toolRegistry.execute.mockResolvedValue({ source: 'mock' });
    const service = new AgentService(prisma as never, llm as never, toolRegistry as never);

    const result = await service.run({
      purpose: 'post_helper',
      input: '이번 주말 플리마켓 열어도 될까?'
    });

    expect(result.status).toBe('FAILED');
    expect(result.answer).toContain('반복 도구 호출');
    expect(toolRegistry.execute).toHaveBeenCalledTimes(1);
    expect(prisma.agentToolLog.create).toHaveBeenCalledTimes(2);
  });

  it('logs tool calls and completes when the LLM returns a final message', async () => {
    llm.chatWithTools
      .mockResolvedValueOnce({
        type: 'tool_call',
        toolCallId: 'call-1',
        toolName: 'check_duplicate_post',
        arguments: { title: '야간 약국', content: '오산역 근처' }
      })
      .mockResolvedValueOnce({
        type: 'message',
        content: '중복 글은 낮고, 야간 약국 정보를 공유하는 글로 작성하면 됩니다.'
      });
    toolRegistry.execute.mockResolvedValue({ isDuplicate: false });
    const service = new AgentService(prisma as never, llm as never, toolRegistry as never);

    const result = await service.run({
      purpose: 'post_helper',
      input: '오산 야간 약국 글 도와줘'
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.answer).toContain('야간 약국');
    const secondMessages = llm.chatWithTools.mock.calls[1][0];
    expect(secondMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: {
                name: 'check_duplicate_post',
                arguments: JSON.stringify({ title: '야간 약국', content: '오산역 근처' })
              }
            }
          ]
        }),
        expect.objectContaining({
          role: 'tool',
          tool_call_id: 'call-1'
        })
      ])
    );
    expect(prisma.agentToolLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId: 'session-1',
          toolName: 'check_duplicate_post',
          output: { isDuplicate: false }
        })
      })
    );
  });

  it('MCP failure returns fallback answer instead of crashing', async () => {
    llm.chatWithTools.mockResolvedValueOnce({
      type: 'tool_call',
      toolName: 'call_mcp_tool',
      arguments: { toolName: 'get_weather_by_region', input: { region: '오산' } }
    });
    toolRegistry.execute.mockRejectedValue(new Error('MCP unavailable'));
    const service = new AgentService(prisma as never, llm as never, toolRegistry as never);

    const result = await service.run({
      purpose: 'post_helper',
      input: '이번 주말 플리마켓 열어도 될까?'
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.answer).toContain('외부 데이터');
    expect(prisma.agentToolLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          error: 'MCP unavailable'
        })
      })
    );
  });

  it('routes non-complaint complaint-helper input to local Q&A', async () => {
    toolRegistry.execute.mockResolvedValue({
      answer: '세교동 플리마켓 게시글을 확인해 보세요.',
      sources: [{ sourceId: 'post-1', content: '이번 주말 세교동 플리마켓 열리나요?' }]
    });
    const service = new AgentService(prisma as never, llm as never, toolRegistry as never);

    const result = await service.run({
      purpose: 'complaint_helper',
      input: '이번 주말 세교동 플리마켓 열려?'
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.answer).toContain('플리마켓');
    expect(result.sources).toEqual([{ sourceId: 'post-1', content: '이번 주말 세교동 플리마켓 열리나요?' }]);
    expect(llm.chatWithTools).not.toHaveBeenCalled();
    expect(toolRegistry.execute).toHaveBeenCalledWith('answer_local_question', {
      question: '이번 주말 세교동 플리마켓 열려?'
    });
    expect(prisma.agentToolLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId: 'session-1',
          toolName: 'answer_local_question'
        })
      })
    );
  });

  it('uses RAG context before drafting actual complaint requests', async () => {
    const ragCandidates = [
      {
        sourceType: 'POST',
        sourceId: 'post-1',
        content: '[게시글]\n제목: 오산역 뒤쪽 불법 주차 생활 민원\n내용: 사진과 시간대를 모아서 민원 접수했습니다.',
        url: '/posts/post-1'
      }
    ];
    toolRegistry.execute.mockImplementation(async (name: string) => {
      if (name === 'vector_search_posts') {
        return { candidates: ragCandidates };
      }
      if (name === 'draft_complaint_post') {
        return {
          title: '[생활민원] 오산역 뒤쪽 해당 차량 주정차 단속 요청',
          content:
            '민원 제목\n오산역 뒤쪽 해당 차량 주정차 단속 요청\n\n처리 요청 사항\n1. 해당 차량의 주정차 위반 여부 확인\n\n민원 접수처\n1. 안전신문고\n- 링크: https://www.safetyreport.go.kr/'
        };
      }
      return {};
    });
    const service = new AgentService(prisma as never, llm as never, toolRegistry as never);

    const result = await service.run({
      purpose: 'complaint_helper',
      input: '오산역 뒤쪽 불법 주차 민원글 작성 도와줘'
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.answer).toContain('상황 판단');
    expect(result.answer).toContain('게시판 근거');
    expect(result.answer).toContain('오산역 뒤쪽 불법 주차 생활 민원');
    expect(result.answer).toContain('추천 행동');
    expect(result.answer).toContain('사용한 도구');
    expect(result.answer).toContain('RAG');
    expect(result.answer).toContain('Agent');
    expect(result.answer).toContain('주정차 위반 여부 확인');
    expect(result.sources).toEqual(ragCandidates);
    expect((result as { toolTrace?: Array<{ name: string }> }).toolTrace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'vector_search_posts' }),
        expect.objectContaining({ name: 'draft_complaint_post' })
      ])
    );
    expect(llm.chatWithTools).not.toHaveBeenCalled();
    expect(toolRegistry.execute).toHaveBeenNthCalledWith(1, 'vector_search_posts', {
      title: expect.stringContaining('불법 주차'),
      content: '오산역 뒤쪽 불법 주차 민원글 작성 도와줘',
      topK: 3
    });
    expect(toolRegistry.execute).toHaveBeenNthCalledWith(2, 'draft_complaint_post', {
      issue: '오산역 뒤쪽 불법 주차 민원글 작성 도와줘',
      text: '오산역 뒤쪽 불법 주차 민원글 작성 도와줘'
    });
    expect(toolRegistry.execute).not.toHaveBeenCalledWith('answer_local_question', expect.any(Object));
  });

  it('returns a concrete complaint draft without letting the LLM answer vaguely', async () => {
    toolRegistry.execute.mockImplementation(async (name: string) => {
      if (name === 'vector_search_posts') {
        return { candidates: [] };
      }
      if (name === 'draft_complaint_post') {
        return {
          title: '[생활민원] 오산대 앞 카니발 차량 주정차 단속 요청',
          content: [
            '민원 제목',
            '오산대 앞 카니발 차량 주정차 단속 요청',
            '',
            '발생 위치',
            '오산대 앞',
            '',
            '처리 요청 사항',
            '1. 카니발 차량의 주정차 위반 여부 확인',
            '2. 위반 시 현장 단속 또는 계도 조치'
          ].join('\n')
        };
      }
      return {};
    });
    const service = new AgentService(prisma as never, llm as never, toolRegistry as never);

    const result = await service.run({
      purpose: 'complaint_helper',
      input: '오산대 앞 카니발 주정차로 인한 교통 불편으로 문의할꺼'
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.answer).toContain('민원 제목');
    expect(result.answer).toContain('발생 위치');
    expect(result.answer).toContain('오산대 앞');
    expect(result.answer).toContain('카니발 차량');
    expect(result.answer).toContain('처리 요청 사항');
    expect(result.answer).toContain('주정차 위반 여부 확인');
    expect(result.routedMode).toBe('agent');
    expect(llm.chatWithTools).not.toHaveBeenCalled();
    expect(toolRegistry.execute).toHaveBeenCalledWith('vector_search_posts', {
      title: expect.stringContaining('주정차 교통 불편'),
      content: '오산대 앞 카니발 주정차로 인한 교통 불편으로 문의할꺼',
      topK: 3
    });
    expect(toolRegistry.execute).toHaveBeenCalledWith('draft_complaint_post', {
      issue: '오산대 앞 카니발 주정차로 인한 교통 불편으로 문의할꺼',
      text: '오산대 앞 카니발 주정차로 인한 교통 불편으로 문의할꺼'
    });
  });

  it('tag-suggestion returns tags directly from the suggest_tags tool', async () => {
    llm.chatWithTools.mockResolvedValueOnce({
      type: 'tool_call',
      toolName: 'suggest_tags',
      arguments: { text: '오산역 근처 야간 약국 정보' }
    });
    toolRegistry.execute.mockResolvedValue({ tags: ['오산', '야간약국', '생활정보'] });
    const service = new AgentService(prisma as never, llm as never, toolRegistry as never);

    const result = await service.run({
      purpose: 'tag_suggestion',
      input: '오산역 근처 야간 약국 정보'
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.tags).toEqual(['오산', '야간약국', '생활정보']);
  });

  it('fills missing suggest_tags text from the user input', async () => {
    llm.chatWithTools.mockResolvedValueOnce({
      type: 'tool_call',
      toolName: 'suggest_tags',
      arguments: {}
    });
    toolRegistry.execute.mockResolvedValue({ tags: ['야간약국', '생활정보'] });
    const service = new AgentService(prisma as never, llm as never, toolRegistry as never);

    const result = await service.run({
      purpose: 'tag_suggestion',
      input: '오산역 근처 야간 약국 정보'
    });

    expect(result.status).toBe('COMPLETED');
    expect(toolRegistry.execute).toHaveBeenCalledWith('suggest_tags', {
      text: '오산역 근처 야간 약국 정보'
    });
  });

  it('normalizes loose MCP weather tool arguments from the LLM', async () => {
    llm.chatWithTools
      .mockResolvedValueOnce({
        type: 'tool_call',
        toolName: 'call_mcp_tool',
        arguments: { type: 'weather', location: '오산 세교동', date: '이번 주말' }
      })
      .mockResolvedValueOnce({
        type: 'message',
        content: '이번 주말 날씨를 확인한 글 초안입니다.'
      });
    toolRegistry.execute.mockResolvedValue({ summary: '오산 날씨 맑음' });
    const service = new AgentService(prisma as never, llm as never, toolRegistry as never);

    const result = await service.run({
      purpose: 'post_helper',
      input: '이번 주말 오산 세교동 플리마켓 열어도 될까? 날씨도 확인해서 글 초안 써줘'
    });

    expect(result.status).toBe('COMPLETED');
    expect(toolRegistry.execute).toHaveBeenCalledWith('call_mcp_tool', {
      toolName: 'get_weather_by_region',
      input: {
        region: '오산 세교동',
        date: '이번 주말'
      }
    });
  });
});
