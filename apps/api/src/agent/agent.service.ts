import { Inject, Injectable } from '@nestjs/common';
import type { ChatMessage } from '../ai/llm.service.js';
import { LlmService } from '../ai/llm.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AgentStateService } from './agent-state.service.js';
import { AgentToolRegistryService } from './agent-tool-registry.service.js';
import type { AgentPurpose, AgentState, RunAgentInput, RunAgentResult } from './agent.types.js';

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
      const result = await this.runLoop(state);
      await this.finishSession(state, result.status, result);
      return result;
    } catch (error) {
      const fallback = this.failedResult(state, this.errorMessage(error));
      await this.finishSession(state, 'FAILED', fallback);
      return fallback;
    }
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
      state
    };
  }

  private failedResult(state: AgentState, answer: string): RunAgentResult {
    return {
      sessionId: state.sessionId,
      status: 'FAILED',
      answer,
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

  private toJson(value: unknown) {
    return JSON.parse(JSON.stringify(value)) as object;
  }
}
