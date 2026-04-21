import type { AgentEvent } from '../agent';
import type { LLMProvider, ToolDefinition } from '../provider/types';
import type { ToolRouter } from '../tools/router';

/** Roles that sub-agents can take in the multi-agent orchestration. */
export type SubAgentRole = 'query' | 'view' | 'insights';

/**
 * Typed event callback fed to sub-agents so their tool calls can bubble up
 * to the leader's outer stream. The leader passes one in that re-yields
 * the event after stamping `parentAgent` onto it — letting the editorial
 * trace render nested `SCHEMA introspect_schema(...)` and
 * `QUERY sql(...)` rows under a `dispatch_query` parent.
 *
 * Kept narrow (tool_start/tool_end only today) because the sub-agents do
 * not drive text or delegate further themselves — if that ever changes we
 * can widen this without rewriting callers.
 */
export type SubAgentEventCallback = (
  event: Extract<AgentEvent, { type: 'tool_start' } | { type: 'tool_end' }>,
) => void;

/**
 * A task assigned by the leader to a sub-agent.
 * Contains the instruction and role-specific context payload.
 */
export interface AgentTask {
  /** Unique task identifier. */
  id: string;
  /** Natural language instruction from the leader. */
  instruction: string;
  /** Role-specific context (e.g., schema for query agent, data summary for view agent). */
  context: Record<string, unknown>;
}

/**
 * Structured result returned by a sub-agent to the leader.
 * Contains the role-specific output data and human-readable explanation.
 */
export interface SubAgentResult {
  /** The role of the agent that produced this result. */
  role: SubAgentRole;
  /** Whether the task succeeded. */
  success: boolean;
  /** The structured output (ViewSpec, query result, analysis). */
  data: Record<string, unknown>;
  /** Human-readable explanation of what was done. */
  explanation: string;
  /** Error message if success is false. */
  error?: string;
}

/**
 * Contract that all sub-agents implement.
 * Sub-agents are headless specialists that receive tasks from the leader
 * and return structured results. They do NOT stream to the user.
 */
export interface SubAgent {
  /** The role this agent specializes in. */
  readonly role: SubAgentRole;
  /** Tool definitions this agent has access to. */
  readonly tools: ToolDefinition[];
  /** Execute a task and yield structured results. */
  execute(task: AgentTask): AsyncIterable<SubAgentResult>;
}

/**
 * Configuration for creating a sub-agent.
 * Shared across all specialist agent types.
 */
export interface SubAgentConfig {
  /** LLM provider for the sub-agent's own conversation. */
  provider: LLMProvider;
  /** Tool router for executing tool calls (scoped to allowed tools). */
  toolRouter: ToolRouter;
  /** Maximum tool call rounds before giving up (default varies by agent). */
  maxToolRounds?: number;
  /**
   * Output-token ceiling for this agent's LLM calls. When set, the agent
   * passes it explicitly in `ChatOptions.maxTokens` on every turn. When unset,
   * the provider's stored default is used. Prefer setting explicitly so the
   * per-role routing in `agent_role_assignments` actually takes effect.
   */
  maxTokens?: number;
  /**
   * Optional progress callback. Sub-agents invoke this with short, human-
   * readable status strings ("Running query: SELECT ...", "Got 1250 rows")
   * so the leader can surface task_progress events to the UI during long
   * tool calls. Safe to omit.
   */
  onStatus?: (message: string) => void;
  /**
   * Optional typed event callback for bubbling structured tool events
   * (tool_start / tool_end) up to the leader's outer stream. The leader
   * re-yields these with `parentAgent: 'query' | 'view' | 'insights'`
   * stamped on so the trace UI can render nested rows.
   */
  onEvent?: SubAgentEventCallback;
}
