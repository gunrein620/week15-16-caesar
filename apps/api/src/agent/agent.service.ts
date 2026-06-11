import { Inject, Injectable } from '@nestjs/common';
import type { ChatMessage } from '../ai/llm.service.js';
import { LlmService } from '../ai/llm.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AgentStateService } from './agent-state.service.js';
import { AgentToolRegistryService } from './agent-tool-registry.service.js';
import type { AgentPurpose, AgentState, AgentToolCall, AgentToolTrace, RunAgentInput, RunAgentResult } from './agent.types.js';

@Injectable()
export class AgentService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LlmService) private readonly llmService: LlmService,
    @Inject(AgentToolRegistryService) private readonly toolRegistry: AgentToolRegistryService,
    @Inject(AgentStateService) private readonly stateService: AgentStateService = new AgentStateService()
  ) {}

  async run(input: RunAgentInput): Promise<RunAgentResult> {
    const session = await this.prisma.agentSession.create({
      data: {
        userId: input.userId,
        purpose: input.purpose,
        input: input.input,
        state: {},
        status: 'RUNNING'
      }
    });
    const state = this.stateService.create({
      sessionId: session.id,
      userId: input.userId,
      purpose: input.purpose,
      text: input.input,
      regionCode: input.regionCode,
      regionName: input.regionName
    });

    try {
      if (state.purpose === 'complaint_helper') {
        if (!this.hasComplaintIntent(state.input)) {
          const result = await this.answerLocalQuestionFromComplaintTab(state);
          await this.finishSession(state, result.status, result);
          return result;
        }
        const result = await this.draftComplaintFromComplaintTab(state);
        await this.finishSession(state, result.status, result);
        return result;
      }
      const result = await this.runLoop(state);
      await this.finishSession(state, result.status, result);
      return result;
    } catch (error) {
      const fallback = this.failedResult(state, this.errorMessage(error));
      await this.finishSession(state, 'FAILED', fallback);
      return fallback;
    }
  }

  private async answerLocalQuestionFromComplaintTab(state: AgentState): Promise<RunAgentResult> {
    const input = { question: state.input };
    const output = await this.toolRegistry.execute('answer_local_question', input);
    await this.logTool(state, 'answer_local_question', input, output);
    return {
      ...this.completedResult(state, this.answerFromToolOutput(output)),
      sources: this.arrayValue(output, 'sources'),
      externalSources: this.arrayValue(output, 'externalSources'),
      routedMode: 'rag'
    };
  }

  private async draftComplaintFromComplaintTab(state: AgentState): Promise<RunAgentResult> {
    const searchInput = { title: this.complaintSearchText(state.input), content: state.input, topK: 3 };
    let sources: unknown[] = [];
    let searchError: string | undefined;

    try {
      const searchOutput = await this.toolRegistry.execute('vector_search_posts', searchInput);
      await this.logTool(state, 'vector_search_posts', searchInput, searchOutput);
      sources = this.candidateSources(searchOutput);
    } catch (error) {
      searchError = this.errorMessage(error);
      await this.logTool(state, 'vector_search_posts', searchInput, undefined, searchError);
    }

    const draftInput = { issue: state.input, text: state.input };
    const output = await this.toolRegistry.execute('draft_complaint_post', draftInput);
    await this.logTool(state, 'draft_complaint_post', draftInput, output);
    return {
      ...this.completedResult(state, this.complaintDecisionAnswer(state, output, sources, searchError)),
      sources,
      routedMode: 'agent'
    };
  }

  private hasComplaintIntent(text: string) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    return (
      /(민원|신고|불편|불법|단속|악취|소음|쓰레기|파손|고장|위험|방치|막혀|개선\s*요청|처리\s*요청|정비\s*요청)/i.test(
        normalized
      ) ||
      /(불법\s*주차|통행.*(어렵|불편|방해)|가로등.*(고장|꺼짐)|신호등.*(고장|위험)|도로.*(파손|위험)|보도.*(파손|위험)|인도.*(파손|위험)|하수구.*(막힘|냄새)|배수로.*(막힘|냄새))/i.test(
        normalized
      )
    );
  }

  private async runLoop(state: AgentState): Promise<RunAgentResult> {
    const seen = new Set<string>();

    while (state.iteration < state.maxIterations) {
      const decision = await this.llmService.chatWithTools(state.messages, this.toolRegistry.definitions(state.purpose), {
        temperature: 0.2
      });

      if (decision.type === 'message') {
        return this.completedResult(state, decision.content);
      }

      const normalizedArguments = this.normalizeToolArguments(state, decision.toolName, decision.arguments);
      const signature = this.toolSignature(decision.toolName, normalizedArguments);
      if (seen.has(signature)) {
        const error = '반복 도구 호출이 감지되어 Agent 실행을 중단했습니다.';
        await this.logTool(state, decision.toolName, normalizedArguments, undefined, error);
        state.messages.push({ role: 'assistant', content: error });
        return this.failedResult(state, error);
      }
      seen.add(signature);

      state.iteration += 1;
      const toolCall = {
        ...decision,
        toolCallId: decision.toolCallId ?? `tool-${state.iteration}`,
        arguments: normalizedArguments,
        rawArguments: JSON.stringify(normalizedArguments)
      };
      state.messages.push(this.assistantToolCallMessage(toolCall));
      try {
        const output = await this.toolRegistry.execute(toolCall.toolName, toolCall.arguments);
        await this.logTool(state, toolCall.toolName, toolCall.arguments, output);
        state.messages.push(this.toolMessage(toolCall.toolCallId, toolCall.toolName, output));

        if (state.purpose === 'tag_suggestion' && this.hasTags(output)) {
          return {
            ...this.completedResult(state, `추천 태그: ${output.tags.join(', ')}`),
            tags: output.tags
          };
        }
      } catch (error) {
        const message = this.errorMessage(error);
        await this.logTool(state, toolCall.toolName, toolCall.arguments, undefined, message);
        state.messages.push(this.toolMessage(toolCall.toolCallId, toolCall.toolName, { error: message }));
        if (toolCall.toolName === 'call_mcp_tool') {
          return this.completedResult(
            state,
            '외부 데이터 조회에 실패했습니다. 게시판에 이미 있는 정보와 사용자가 입력한 내용을 기준으로 답변합니다.'
          );
        }
      }
    }

    return this.failedResult(state, '최대 반복 횟수에 도달해 Agent 실행을 중단했습니다.');
  }

  private async logTool(state: AgentState, name: string, input: unknown, output?: unknown, error?: string) {
    const call = { name, input, output, error };
    state.toolCalls.push(call);
    await this.prisma.agentToolLog.create({
      data: {
        sessionId: state.sessionId,
        toolName: name,
        input: input as object,
        output: output as object | undefined,
        error
      }
    });

    if (name === 'call_mcp_tool') {
      await this.prisma.mcpToolLog?.create?.({
        data: {
          method: this.mcpMethodName(input),
          input: input as object,
          output: output as object | undefined,
          error
        }
      });
    }
  }

  private async finishSession(state: AgentState, status: 'COMPLETED' | 'FAILED', result: RunAgentResult) {
    await this.prisma.agentSession.update({
      where: { id: state.sessionId },
      data: {
        state: this.toJson(state),
        status,
        result: this.toJson(result)
      }
    });
  }

  private completedResult(state: AgentState, answer: string): RunAgentResult {
    return {
      sessionId: state.sessionId,
      status: 'COMPLETED',
      answer,
      toolTrace: this.toolTrace(state),
      state
    };
  }

  private failedResult(state: AgentState, answer: string): RunAgentResult {
    return {
      sessionId: state.sessionId,
      status: 'FAILED',
      answer,
      toolTrace: this.toolTrace(state),
      state
    };
  }

  private assistantToolCallMessage(decision: {
    toolCallId: string;
    toolName: string;
    rawArguments?: string;
    arguments: Record<string, unknown>;
  }): ChatMessage {
    return {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: decision.toolCallId,
          type: 'function',
          function: {
            name: decision.toolName,
            arguments: decision.rawArguments ?? JSON.stringify(decision.arguments)
          }
        }
      ]
    };
  }

  private toolMessage(toolCallId: string, name: string, output: unknown): ChatMessage {
    return {
      role: 'tool',
      content: `[${name}] ${JSON.stringify(output)}`,
      tool_call_id: toolCallId
    };
  }

  private toolSignature(name: string, input: unknown) {
    return `${name}:${this.stableStringify(input)}`;
  }

  private normalizeToolArguments(state: AgentState, name: string, input: Record<string, unknown>) {
    switch (name) {
      case 'suggest_tags':
        return this.withDefaultText(input, 'text', state.input);
      case 'vector_search_posts':
      case 'check_duplicate_post':
        return this.withPostText(input, state.input);
      case 'draft_local_post':
        return this.withDefaultText(input, 'topic', state.input);
      case 'draft_complaint_post':
        return this.withDefaultText(input, 'issue', state.input);
      case 'call_mcp_tool':
        return this.normalizeMcpToolArguments(state, input);
      default:
        return input;
    }
  }

  private withDefaultText(input: Record<string, unknown>, key: string, text: string) {
    if (typeof input[key] === 'string' || typeof input.text === 'string' || typeof input.content === 'string') {
      return input;
    }
    return { ...input, [key]: text };
  }

  private withPostText(input: Record<string, unknown>, text: string) {
    if (typeof input.title === 'string' || typeof input.text === 'string' || typeof input.content === 'string') {
      return input;
    }
    return {
      ...input,
      title: text,
      content: text
    };
  }

  private normalizeMcpToolArguments(state: AgentState, input: Record<string, unknown>) {
    const existingInput =
      input.input && typeof input.input === 'object' && !Array.isArray(input.input)
        ? { ...(input.input as Record<string, unknown>) }
        : {};
    const text = [state.input, JSON.stringify(input)].join(' ');
    const toolName = typeof input.toolName === 'string' ? input.toolName : this.inferMcpToolName(text);
    const region = this.firstString(existingInput.region, input.region, input.location) ?? state.regionName;
    const normalizedInput: Record<string, unknown> = {
      ...existingInput,
      region
    };

    const date = this.firstString(existingInput.date, input.date);
    if (date) {
      normalizedInput.date = date;
    }

    if (toolName === 'search_public_facility' && typeof normalizedInput.keyword !== 'string') {
      normalizedInput.keyword = this.inferFacilityKeyword(text);
    }

    return {
      toolName,
      input: normalizedInput
    };
  }

  private inferMcpToolName(text: string) {
    if (/(날씨|비|기온|weather)/i.test(text)) {
      return 'get_weather_by_region';
    }
    if (/(약국|병원|주차장|시설|장소|카페|식당|지도|pharmacy|hospital|parking|place)/i.test(text)) {
      return 'search_public_facility';
    }
    if (/(행사|축제|플리마켓|공연|이벤트|event|market)/i.test(text)) {
      return 'get_local_event_info';
    }
    return 'search_public_facility';
  }

  private inferFacilityKeyword(text: string) {
    const keywords = ['야간 약국', '약국', '병원', '주차장', '도서관', '카페', '식당'];
    return keywords.find((keyword) => text.includes(keyword)) ?? '공공시설';
  }

  private firstString(...values: unknown[]) {
    return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();
  }

  private stableStringify(input: unknown): string {
    if (!input || typeof input !== 'object') {
      return JSON.stringify(input);
    }
    if (Array.isArray(input)) {
      return `[${input.map((item) => this.stableStringify(item)).join(',')}]`;
    }
    return `{${Object.entries(input as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${JSON.stringify(key)}:${this.stableStringify(value)}`)
      .join(',')}}`;
  }

  private hasTags(output: unknown): output is { tags: string[] } {
    return Boolean(
      output &&
        typeof output === 'object' &&
        'tags' in output &&
        Array.isArray((output as { tags: unknown }).tags)
    );
  }

  private mcpMethodName(input: unknown) {
    if (input && typeof input === 'object' && 'toolName' in input) {
      const toolName = (input as { toolName?: unknown }).toolName;
      return typeof toolName === 'string' ? toolName : 'unknown';
    }
    return 'unknown';
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  private answerFromToolOutput(output: unknown) {
    if (output && typeof output === 'object' && typeof (output as { answer?: unknown }).answer === 'string') {
      return (output as { answer: string }).answer;
    }
    return '일반 생활 질문으로 판단해 Q&A 답변을 생성했습니다.';
  }

  private complaintDraftAnswer(output: unknown) {
    if (output && typeof output === 'object') {
      const content = (output as { content?: unknown }).content;
      if (typeof content === 'string' && content.trim()) {
        return content;
      }
      const title = (output as { title?: unknown }).title;
      if (typeof title === 'string' && title.trim()) {
        return ['민원 제목', title].join('\n');
      }
    }
    return '민원 초안을 생성하지 못했습니다. 위치, 불편 내용, 요청 사항을 다시 입력해 주세요.';
  }

  private complaintDecisionAnswer(
    state: AgentState,
    draftOutput: unknown,
    sources: unknown[],
    searchError?: string
  ) {
    return [
      '상황 판단',
      this.complaintSituation(state.input),
      '',
      '게시판 근거',
      ...this.complaintSourceLines(sources, searchError),
      '',
      '추천 행동',
      ...this.complaintActionLines(state.input),
      '',
      '민원 초안',
      this.complaintDraftAnswer(draftOutput),
      '',
      '사용한 도구',
      ...this.toolTrace(state).map((trace) => `- ${trace.label}: ${trace.summary}`)
    ].join('\n');
  }

  private complaintSituation(text: string) {
    if (/(주정차|주차|정차)/.test(text)) {
      return '불법 주정차 또는 통행 방해로 인한 생활 민원으로 판단했습니다. 사진, 시간대, 정확한 위치가 처리 가능성을 높입니다.';
    }
    if (/(파손|고장|위험|보도블록|보도|인도|도로|가로등|신호등|하수구|배수로)/.test(text)) {
      return '공공시설 파손 또는 안전 위험 민원으로 판단했습니다. 현장 사진과 위험 지점을 함께 남기는 것이 좋습니다.';
    }
    if (/소음/.test(text)) {
      return '반복 소음으로 인한 생활 불편 민원으로 판단했습니다. 발생 시간대와 반복 여부가 중요합니다.';
    }
    if (/(쓰레기|악취)/.test(text)) {
      return '환경 불편 민원으로 판단했습니다. 위치, 사진, 반복 발생 여부를 함께 기록하는 것이 좋습니다.';
    }
    return '오산시 담당 부서 확인이 필요한 일반 생활 민원으로 판단했습니다.';
  }

  private complaintSearchText(text: string) {
    if (/(주정차|주차|정차)/.test(text)) {
      return ['불법 주차 주정차 교통 불편 통행 방해 생활민원 단속', text].join('\n');
    }
    if (/(파손|고장|위험|보도블록|보도|인도|도로|가로등|신호등|하수구|배수로)/.test(text)) {
      return ['공공시설 파손 고장 위험 보도 도로 안전 생활민원 정비', text].join('\n');
    }
    if (/소음/.test(text)) {
      return ['소음 생활 불편 반복 민원 행정지도', text].join('\n');
    }
    if (/(쓰레기|악취)/.test(text)) {
      return ['쓰레기 악취 환경 불편 생활민원 청소 수거', text].join('\n');
    }
    return ['생활 민원 오산시 처리 요청 담당 부서 확인', text].join('\n');
  }

  private complaintSourceLines(sources: unknown[], searchError?: string) {
    if (searchError) {
      return [`- RAG 검색 실패: ${searchError}`, '- 입력한 민원 내용을 기준으로 초안을 먼저 생성했습니다.'];
    }
    if (sources.length === 0) {
      return ['- 게시판에서 바로 참고할 만한 유사 민원은 찾지 못했습니다.', '- 입력한 민원 내용을 기준으로 초안을 생성했습니다.'];
    }
    return sources.slice(0, 3).map((source, index) => `${index + 1}. ${this.sourceSummary(source)}`);
  }

  private complaintActionLines(text: string) {
    if (/(주정차|주차|정차)/.test(text)) {
      return [
        '현장 사진과 발생 시간대를 확보합니다.',
        '차량 위치와 통행 방해 상황을 구체적으로 적습니다.',
        '안전신문고 또는 오산시 불법주정차 주민신고제 안내 링크에서 접수합니다.'
      ];
    }
    if (/(파손|고장|위험|보도블록|보도|인도|도로|가로등|신호등|하수구|배수로)/.test(text)) {
      return [
        '파손 부위 사진과 정확한 위치를 기록합니다.',
        '보행자나 차량 안전에 어떤 위험이 있는지 적습니다.',
        '안전신문고로 신고하고, 필요하면 오산시 일반 민원으로도 보완 접수합니다.'
      ];
    }
    return [
      '발생 위치, 시간대, 반복 여부를 정리합니다.',
      '처리 요청 사항을 한 문장으로 명확히 적습니다.',
      '오산시에 바랍니다 또는 국민신문고 링크에서 접수합니다.'
    ];
  }

  private candidateSources(output: unknown) {
    if (!output || typeof output !== 'object') {
      return [];
    }
    const candidates = (output as { candidates?: unknown }).candidates;
    return Array.isArray(candidates) ? candidates : [];
  }

  private sourceSummary(source: unknown) {
    if (!source || typeof source !== 'object') {
      return '게시판 근거 형식을 확인하지 못했습니다.';
    }
    const content = (source as { content?: unknown }).content;
    if (typeof content !== 'string') {
      return '게시판 근거 내용을 확인하지 못했습니다.';
    }
    const title = content
      .split('\n')
      .find((line) => line.startsWith('제목:'))
      ?.replace('제목:', '')
      .trim();
    return title || content.replace(/\s+/g, ' ').slice(0, 90);
  }

  private toolTrace(state: AgentState): AgentToolTrace[] {
    return state.toolCalls.map((call) => ({
      name: call.name,
      label: this.toolLabel(call.name),
      kind: this.toolKind(call.name),
      status: call.error ? 'failed' : 'success',
      summary: this.toolSummary(call)
    }));
  }

  private toolLabel(name: string) {
    const labels: Record<string, string> = {
      vector_search_posts: 'RAG 게시글 검색',
      check_duplicate_post: 'RAG 중복 확인',
      answer_local_question: 'RAG Q&A',
      call_mcp_tool: 'MCP 외부 도구',
      draft_complaint_post: 'Agent 민원 초안',
      draft_local_post: 'Agent 글 초안',
      suggest_tags: 'Agent 태그 추천',
      summarize_context: 'Agent 맥락 요약'
    };
    return labels[name] ?? name;
  }

  private toolKind(name: string): AgentToolTrace['kind'] {
    if (name === 'call_mcp_tool') {
      return 'mcp';
    }
    if (name.includes('vector') || name.includes('duplicate') || name === 'answer_local_question') {
      return 'rag';
    }
    return 'agent';
  }

  private toolSummary(call: AgentToolCall) {
    if (call.error) {
      return `실패 - ${call.error}`;
    }
    if (call.name === 'vector_search_posts') {
      const count = this.candidateSources(call.output).length;
      return count > 0 ? `유사 게시글 ${count}건을 판단 근거로 사용` : '유사 게시글 없음';
    }
    if (call.name === 'draft_complaint_post') {
      return '민원 유형, 처리 요청, 접수처를 포함한 초안 생성';
    }
    if (call.name === 'call_mcp_tool') {
      return `외부 데이터 조회${this.mcpMethodName(call.input) !== 'unknown' ? `: ${this.mcpMethodName(call.input)}` : ''}`;
    }
    if (call.name === 'answer_local_question') {
      return '게시판 지식 기반 답변 생성';
    }
    return '요청 처리를 위한 내부 도구 실행';
  }

  private arrayValue(output: unknown, key: 'sources' | 'externalSources') {
    if (!output || typeof output !== 'object') {
      return undefined;
    }
    const value = (output as Record<string, unknown>)[key];
    return Array.isArray(value) ? value : undefined;
  }

  private toJson(value: unknown) {
    return JSON.parse(JSON.stringify(value)) as object;
  }
}
