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
      complaint_helper: ['vector_search_posts', 'suggest_tags', 'call_mcp_tool', 'draft_complaint_post', 'summarize_context'],
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
    const location = this.extractComplaintLocation(issue);
    const subject = this.extractComplaintSubject(issue);
    const problem = this.inferComplaintProblem(issue);
    const request = this.inferComplaintRequest(issue);
    const actions = this.inferComplaintActions(issue, subject);
    const impact = this.inferComplaintImpact(issue);
    const title = `[생활민원] ${location} ${subject} ${request}`;
    return {
      title,
      content: [
        '민원 제목',
        title.replace('[생활민원] ', ''),
        '',
        '발생 위치',
        location,
        '',
        '민원 내용',
        `${location}에서 ${subject}의 ${this.withSubjectParticle(problem)} 발생하고 있습니다. ${impact}`,
        '',
        '처리 요청 사항',
        ...actions.map((action, index) => `${index + 1}. ${action}`),
        '',
        '추가로 첨부하면 좋은 정보',
        this.inferComplaintAttachmentHint(issue),
        '',
        '민원 접수처',
        ...this.inferComplaintFilingSites(issue)
      ].join('\n')
    };
  }

  private extractComplaintLocation(text: string) {
    const compact = text.replace(/\s+/g, ' ').trim();
    const beforeSubject = compact.match(
      /^(.+?)\s+(?:카니발|차량|자동차|오토바이|이륜차|보도블록|보도|인도|도로|가로등|신호등|하수구|배수로|불법|주정차|주차|정차|소음|쓰레기|악취|파손|고장|위험|방치)/
    );
    if (beforeSubject?.[1] && beforeSubject[1].length <= 30) {
      return beforeSubject[1].trim();
    }
    const place = compact.match(/([가-힣A-Za-z0-9]+(?:대|역|동|로|길|초|중|고|아파트|공원|병원|마트|시장)\s*(?:앞|근처|주변|입구|정문|후문|사거리|도로|골목)?)/);
    return place?.[1]?.trim() || '해당 위치';
  }

  private extractComplaintSubject(text: string) {
    if (/카니발/i.test(text)) {
      return '카니발 차량';
    }
    if (/(차량|자동차)/.test(text)) {
      return '해당 차량';
    }
    if (/(오토바이|이륜차)/.test(text)) {
      return '해당 이륜차';
    }
    if (/보도블록/.test(text)) {
      return '보도블록';
    }
    if (/(인도|보도)/.test(text)) {
      return '보도';
    }
    if (/도로/.test(text)) {
      return '도로';
    }
    if (/가로등/.test(text)) {
      return '가로등';
    }
    if (/신호등/.test(text)) {
      return '신호등';
    }
    if (/(하수구|배수로)/.test(text)) {
      return '배수 시설';
    }
    return '해당 대상';
  }

  private inferComplaintProblem(text: string) {
    if (/(주정차|주차|정차)/.test(text)) {
      return '주정차로 인한 교통 불편';
    }
    if (/소음/.test(text)) {
      return '소음 불편';
    }
    if (/(쓰레기|악취)/.test(text)) {
      return '환경 불편';
    }
    if (/(파손|고장|위험)/.test(text)) {
      return '시설 안전 문제';
    }
    return '생활 불편';
  }

  private inferComplaintRequest(text: string) {
    if (/(주정차|주차|정차)/.test(text)) {
      return '주정차 단속 요청';
    }
    if (/소음/.test(text)) {
      return '소음 민원 처리 요청';
    }
    if (/(쓰레기|악취)/.test(text)) {
      return '환경 민원 처리 요청';
    }
    if (/(파손|고장|위험)/.test(text)) {
      return '시설 점검 및 정비 요청';
    }
    return '민원 처리 요청';
  }

  private inferComplaintActions(text: string, subject: string) {
    if (/(주정차|주차|정차)/.test(text)) {
      return [
        `${subject}의 주정차 위반 여부 확인`,
        '위반 사항이 확인될 경우 현장 단속 또는 계도 조치',
        '반복 발생 구간이면 주정차 금지 안내와 단속 강화 검토'
      ];
    }
    if (/소음/.test(text)) {
      return ['소음 발생 원인과 시간대 확인', '현장 점검 후 계도 또는 행정지도', '반복 민원 발생 시 추가 단속 검토'];
    }
    if (/(쓰레기|악취)/.test(text)) {
      return ['현장 쓰레기 또는 악취 발생 여부 확인', '수거 및 청소 조치', '상습 투기 구간이면 안내문 부착과 점검 강화'];
    }
    if (/(파손|고장|위험)/.test(text)) {
      return [`${subject} 파손 또는 위험 여부 현장 점검`, '보수 또는 안전 조치', '정비 전까지 보행자 주의 안내 또는 임시 안전 조치'];
    }
    return ['현장 확인', '불편 사항 처리', '반복 발생 방지를 위한 후속 조치 검토'];
  }

  private withSubjectParticle(text: string) {
    return text.endsWith('문제') ? `${text}가` : `${text}이`;
  }

  private inferComplaintImpact(text: string) {
    if (/(주정차|주차|정차)/.test(text)) {
      return '이로 인해 차량 통행이 지체되고 보행자 안전에도 불편과 위험이 우려됩니다.';
    }
    if (/소음/.test(text)) {
      return '이로 인해 인근 주민의 생활 불편이 커지고 반복 발생 시 휴식권 침해가 우려됩니다.';
    }
    if (/(쓰레기|악취)/.test(text)) {
      return '이로 인해 보행 환경이 나빠지고 위생 문제와 악취 민원이 반복될 우려가 있습니다.';
    }
    if (/(파손|고장|위험)/.test(text)) {
      return '이로 인해 보행자가 넘어지거나 다칠 위험이 있어 현장 확인과 정비가 필요합니다.';
    }
    return '이로 인해 주민 생활 불편이 발생하고 있어 현장 확인과 조치가 필요합니다.';
  }

  private inferComplaintAttachmentHint(text: string) {
    if (/(주정차|주차|정차)/.test(text)) {
      return '- 차량번호 뒷자리, 사진, 정확한 발생 시간대, 진행 방향';
    }
    if (/(파손|고장|위험)/.test(text)) {
      return '- 파손 부위 사진, 정확한 위치, 발견 시간대, 주변 위험 상황';
    }
    return '- 현장 사진, 정확한 위치, 발생 시간대, 반복 여부';
  }

  private inferComplaintFilingSites(text: string) {
    if (/(주정차|주차|정차)/.test(text)) {
      return [
        '1. 안전신문고',
        '- 링크: https://www.safetyreport.go.kr/',
        '- 용도: 불법 주정차, 교통 안전 위험, 현장 사진 기반 신고 접수',
        '2. 오산시 불법주정차 주민신고제 안내',
        '- 링크: https://www.osan.go.kr/portal/contents.do?mId=0110060000',
        '- 용도: 오산시 주정차 주민신고 기준과 처리 절차 확인'
      ];
    }
    if (/(파손|고장|위험|보도블록|보도|인도|도로|가로등|신호등|하수구|배수로)/.test(text)) {
      return [
        '1. 안전신문고',
        '- 링크: https://www.safetyreport.go.kr/',
        '- 용도: 도로, 보도, 공공시설 파손처럼 안전 위험이 있는 생활 불편 신고 접수'
      ];
    }
    return [
      '1. 오산시에 바랍니다(국민신문고)',
      '- 링크: https://www.osan.go.kr/portal/contents.do?mId=0101060000',
      '- 용도: 오산시 담당 부서 확인이 필요한 일반 생활 민원 접수',
      '2. 국민신문고',
      '- 링크: https://www.epeople.go.kr/index.jsp',
      '- 용도: 기관을 지정하거나 이송이 필요한 일반 민원 신청'
    ];
  }
}
