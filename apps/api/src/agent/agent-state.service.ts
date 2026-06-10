import { Injectable } from '@nestjs/common';
import type { AgentPurpose, AgentState } from './agent.types.js';

@Injectable()
export class AgentStateService {
  create(input: {
    sessionId: string;
    userId?: string;
    purpose: AgentPurpose;
    text: string;
    regionCode?: string;
    regionName?: string;
  }): AgentState {
    const regionCode = input.regionCode ?? 'OSAN';
    const regionName = input.regionName ?? '오산';
    return {
      sessionId: input.sessionId,
      userId: input.userId,
      purpose: input.purpose,
      regionCode,
      regionName,
      input: input.text,
      messages: [
        {
          role: 'system',
          content: this.systemPrompt(input.purpose, regionName)
        },
        {
          role: 'user',
          content: input.text
        }
      ],
      toolCalls: [],
      iteration: 0,
      maxIterations: 4
    };
  }

  private systemPrompt(purpose: AgentPurpose, regionName: string) {
    const base = `너는 ${regionName} 지역 생활 커뮤니티 LocalMind Board의 AI Agent다. 필요한 도구만 선택하고, 같은 도구와 같은 입력을 반복하지 않는다.`;
    const detail: Record<AgentPurpose, string> = {
      post_helper: '지역 생활 글 작성을 돕고 중복 여부, 외부 데이터, 관련 맥락을 확인한다.',
      complaint_helper: '생활 민원 글을 정중하고 구체적인 형식으로 작성하도록 돕는다.',
      tag_suggestion: '게시글 내용에 어울리는 짧은 태그를 추천한다.',
      duplicate_check: '기존 게시글과 중복 가능성을 확인한다.'
    };
    return `${base} ${detail[purpose]}`;
  }
}
