import type { LLMProvider, ToolDefinition } from '../provider/types';
import type { ToolRouter } from '../tools/router';

/** Roles that sub-agents can take in the multi-agent orchestration. */
export type SubAgentRole = 'query' | 'view' | 'insights';

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
   * Optional progress callback. Sub-agents invoke this with short, human-
   * readable status strings ("Running query: SELECT ...", "Got 1250 rows")
   * so the leader can surface task_progress events to the UI during long
   * tool calls. Safe to omit.
   */
  onStatus?: (message: string) => void;
}
