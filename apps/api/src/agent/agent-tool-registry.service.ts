import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { ToolDefinition } from '../ai/llm.service.js';
import { McpClientService } from '../mcp-client/mcp-client.service.js';
import { RagService } from '../rag/rag.service.js';
import type { AgentPurpose } from './agent.types.js';

@Injectable()
export class AgentToolRegistryService {
  constructor(
    @Inject(RagService) private readonly ragService: RagService,
    @Inject(McpClientService) private readonly mcpClientService: McpClientService
  ) {}

  definitions(purpose?: AgentPurpose): ToolDefinition[] {
    const tools = [
      this.tool('vector_search_posts', '유사 게시글을 검색합니다.', {
        title: { type: 'string' },
        content: { type: 'string' },
        text: { type: 'string' },
        topK: { type: 'number' }
      }),
      this.tool('check_duplicate_post', '중복 게시글 후보를 확인합니다.', {
        title: { type: 'string' },
        content: { type: 'string' },
        text: { type: 'string' },
        topK: { type: 'number' }
      }),
      this.tool(
        'suggest_tags',
        '게시글 태그를 추천합니다.',
        {
          text: { type: 'string', description: '태그를 추천할 게시글 또는 사용자 요청 원문' }
        },
        ['text']
      ),
      this.tool(
        'call_mcp_tool',
        '날씨/공공시설/행사 같은 MCP 외부 도구를 호출합니다.',
        {
          toolName: {
            type: 'string',
            enum: ['get_weather_by_region', 'search_public_facility', 'get_local_event_info']
          },
          input: {
            type: 'object',
            additionalProperties: true,
            properties: {
              region: { type: 'string' },
              date: { type: 'string' },
              keyword: { type: 'string' }
            }
          }
        },
        ['toolName', 'input']
      ),
      this.tool('draft_local_post', '지역 생활 게시글 초안을 작성합니다.', {
        topic: { type: 'string' },
        text: { type: 'string' }
      }),
      this.tool('draft_complaint_post', '생활 민원 게시글 초안을 작성합니다.', {
        issue: { type: 'string' },
        text: { type: 'string' }
      }),
      this.tool('summarize_context', '수집된 맥락을 요약합니다.', {
        context: { type: 'string' },
        text: { type: 'string' }
      })
    ];
    const allowed = this.allowedToolNames(purpose);
    return allowed ? tools.filter((tool) => allowed.has(tool.function.name)) : tools;
  }

  private allowedToolNames(purpose?: AgentPurpose) {
    const names: Record<AgentPurpose, string[]> = {
      post_helper: [
        'vector_search_posts',
        'check_duplicate_post',
        'suggest_tags',
        'call_mcp_tool',
        'draft_local_post',
        'summarize_context'
      ],
      complaint_helper: ['suggest_tags', 'call_mcp_tool', 'draft_complaint_post', 'summarize_context'],
      tag_suggestion: ['suggest_tags'],
      duplicate_check: ['check_duplicate_post', 'vector_search_posts', 'summarize_context']
    };
    return purpose ? new Set(names[purpose]) : null;
  }

  async execute(name: string, input: Record<string, unknown>) {
    switch (name) {
      case 'vector_search_posts':
        return this.ragService.findSimilarPosts(this.postInput(input));
      case 'check_duplicate_post':
        return this.ragService.checkDuplicate(this.postInput(input));
      case 'suggest_tags':
        return this.suggestTags(String(input.text ?? input.content ?? ''));
      case 'call_mcp_tool':
        return this.callMcpTool(input);
      case 'draft_local_post':
        return this.draftLocalPost(input);
      case 'draft_complaint_post':
        return this.draftComplaintPost(input);
      case 'summarize_context':
        return { summary: String(input.context ?? input.text ?? '').slice(0, 500) };
      case 'answer_local_question':
        return this.ragService.ask({ question: String(input.question ?? input.text ?? '') });
      default:
        throw new BadRequestException(`Unknown agent tool: ${name}`);
    }
  }

  private tool(name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []): ToolDefinition {
    return {
      type: 'function',
      function: {
        name,
        description,
        parameters: {
          type: 'object',
          properties,
          required,
          additionalProperties: true
        }
      }
    };
  }

  private postInput(input: Record<string, unknown>) {
    return {
      title: String(input.title ?? input.text ?? '지역 생활 정보'),
      content: typeof input.content === 'string' ? input.content : undefined,
      regionId: typeof input.regionId === 'string' ? input.regionId : undefined,
      excludePostId: typeof input.excludePostId === 'string' ? input.excludePostId : undefined,
      topK: typeof input.topK === 'number' ? input.topK : undefined
    };
  }

  private async callMcpTool(input: Record<string, unknown>) {
    if (typeof input.toolName !== 'string') {
      throw new BadRequestException('toolName is required');
    }
    const toolInput =
      input.input && typeof input.input === 'object' && !Array.isArray(input.input)
        ? (input.input as Record<string, unknown>)
        : {};
    return this.mcpClientService.callTool(input.toolName, toolInput);
  }

  private suggestTags(text: string) {
    const rules: Array<[string, string[]]> = [
      ['야간약국', ['약국', '병원', '야간']],
      ['맛집', ['맛집', '식당', '카페', '음식']],
      ['분실물', ['분실', '잃어버', '찾습니다']],
      ['중고거래', ['중고', '판매', '나눔', '거래']],
      ['동네행사', ['행사', '축제', '플리마켓', '모임']],
      ['생활민원', ['민원', '주차', '소음', '불편']],
      ['생활정보', ['정보', '공유', '오산', '동네']]
    ];
    const tags = new Set<string>();
    for (const [tag, keywords] of rules) {
      if (keywords.some((keyword) => text.includes(keyword))) {
        tags.add(tag);
      }
    }
    if (text.includes('오산')) {
      tags.add('오산');
    }
    if (tags.size === 0) {
      tags.add('동네생활');
    }
    return { tags: [...tags].slice(0, 5) };
  }

  private draftLocalPost(input: Record<string, unknown>) {
    const topic = String(input.topic ?? input.text ?? '동네 생활 정보');
    return {
      title: topic.slice(0, 40),
      content: [`안녕하세요. 오산 주민분들과 공유하고 싶은 내용입니다.`, '', topic, '', '관련 정보가 있으면 댓글로 함께 알려주세요.'].join(
        '\n'
      )
    };
  }

  private draftComplaintPost(input: Record<string, unknown>) {
    const issue = String(input.issue ?? input.text ?? '생활 불편 사항');
    return {
      title: `[생활민원] ${issue.slice(0, 30)}`,
      content: [
        '오산 지역 생활 불편 사항을 공유합니다.',
        '',
        `내용: ${issue}`,
        '',
        '위치와 시간대를 확인해 주시면 해결에 도움이 될 것 같습니다.'
      ].join('\n')
    };
  }
}
