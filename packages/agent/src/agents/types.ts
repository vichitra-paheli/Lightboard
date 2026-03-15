import type { AgentEvent } from '../agent';

/**
 * Roles a sub-agent can fulfill in the multi-agent orchestration.
 * Each role has a focused context window and tool set.
 */
export type SubAgentRole = 'query' | 'view' | 'insights';

/**
 * Contract that every sub-agent must implement.
 * Sub-agents are headless — they run their own LLM conversation internally
 * and return structured results. Only the leader streams text to the user.
 */
export interface SubAgent {
  /** Unique identifier for this agent instance. */
  readonly id: string;
  /** The specialist role this agent fulfills. */
  readonly role: SubAgentRole;
  /**
   * Execute a task and yield AgentEvents as the sub-agent works.
   * The leader collects tool_start/tool_end events for transparency
   * but does NOT forward text events to the user.
   */
  chat(task: AgentTask): AsyncGenerator<AgentEvent>;
}

/**
 * Task handed from the leader agent to a sub-agent.
 * Contains the instruction and role-specific context payload.
 */
export interface AgentTask {
  /** Natural language instruction describing what the sub-agent should do. */
  instruction: string;
  /** Role-specific context payload (e.g., schema for query agent, data summary for view agent). */
  context: Record<string, unknown>;
  /** Conversation ID for tracing and scratchpad association. */
  conversationId: string;
  /** Parent span ID for distributed tracing. */
  parentSpanId?: string;
}

/**
 * Record of a single tool call made by a sub-agent.
 * Used for transparency logging in the leader's response.
 */
export interface ToolCallRecord {
  /** Tool name that was called. */
  name: string;
  /** Input passed to the tool. */
  input: Record<string, unknown>;
  /** Result returned by the tool. */
  result: string;
  /** Whether the tool call errored. */
  isError: boolean;
  /** Duration of the tool call in milliseconds. */
  durationMs: number;
}

/**
 * Structured result returned by a sub-agent to the leader.
 * Contains the role-specific output data, tool call log, and token usage.
 */
export interface SubAgentResult {
  /** ID of the sub-agent that produced this result. */
  agentId: string;
  /** Role of the sub-agent. */
  role: SubAgentRole;
  /** Whether the sub-agent completed its task successfully. */
  success: boolean;
  /** Role-specific output data (e.g., query results, ViewSpec, insights). */
  data: Record<string, unknown>;
  /** Log of all tool calls made during execution. */
  toolCalls: ToolCallRecord[];
  /** Token usage for the sub-agent's LLM calls. */
  tokenUsage: { input: number; output: number };
  /** Error message if the sub-agent failed. */
  error?: string;
}
