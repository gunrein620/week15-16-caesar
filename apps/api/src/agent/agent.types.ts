import type { ChatMessage } from '../ai/llm.service.js';

export type AgentPurpose = 'post_helper' | 'complaint_helper' | 'tag_suggestion' | 'duplicate_check';

export type AgentStatus = 'COMPLETED' | 'FAILED';

export type AgentToolCall = {
  name: string;
  input: unknown;
  output?: unknown;
  error?: string;
};

export type AgentState = {
  sessionId: string;
  userId?: string;
  purpose: AgentPurpose;
  regionCode: string;
  regionName: string;
  input: string;
  messages: ChatMessage[];
  toolCalls: AgentToolCall[];
  iteration: number;
  maxIterations: number;
};

export type RunAgentInput = {
  userId?: string;
  purpose: AgentPurpose;
  input: string;
  regionCode?: string;
  regionName?: string;
};

export type RunAgentResult = {
  sessionId: string;
  status: AgentStatus;
  answer: string;
  tags?: string[];
  state: AgentState;
};
