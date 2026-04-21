import { classifyTool, formatEnd, formatStart } from '../events/tool-event-formatter';
import type { Message, ToolCallResult } from '../provider/types';
import { buildInsightsPrompt } from '../prompt/insights-prompt';
import { insightsTools } from '../tools/insights-tools';
import type { AgentTask, SubAgent, SubAgentConfig, SubAgentResult } from './types';

/**
 * Insights specialist sub-agent.
 * Handles statistical analysis via DuckDB analytics on the session scratchpad.
 * Has access to the analyze_data tool only.
 * Receives data summary and user question in task context.
 */
export class InsightsAgent implements SubAgent {
  readonly role = 'insights' as const;
  readonly tools = insightsTools;
  private config: SubAgentConfig;

  constructor(config: SubAgentConfig) {
    this.config = config;
  }

  /** Execute an insights task and yield the result. */
  async *execute(task: AgentTask): AsyncIterable<SubAgentResult> {
    const result = await this.run(task);
    yield result;
  }

  /** Run an insights task and return the structured result. */
  async run(task: AgentTask): Promise<SubAgentResult> {
    const systemPrompt = buildInsightsPrompt(task.context);
    const messages: Message[] = [
      { role: 'user', content: task.instruction },
    ];

    const maxRounds = this.config.maxToolRounds ?? 5;
    let lastAnalysisResult: Record<string, unknown> | undefined;

    for (let round = 0; round < maxRounds; round++) {
      const toolCalls: ToolCallResult[] = [];
      const toolInputBuffers = new Map<string, string>();
      let textContent = '';
      let hasToolCalls = false;

      const stream = this.config.provider.chat(
        messages,
        this.tools,
        { system: systemPrompt, maxTokens: this.config.maxTokens },
      );

      for await (const event of stream) {
        switch (event.type) {
          case 'text_delta':
            textContent += event.text;
            break;
          case 'tool_call_start':
            hasToolCalls = true;
            toolInputBuffers.set(event.id, '');
            toolCalls.push({ id: event.id, name: event.name, input: {} });
            this.config.onEvent?.({
              type: 'tool_start',
              name: event.name,
              id: event.id,
              kind: classifyTool(event.name),
            });
            break;
          case 'tool_call_delta':
            toolInputBuffers.set(event.id, (toolInputBuffers.get(event.id) ?? '') + event.input);
            break;
          case 'tool_call_end': {
            const tc = toolCalls.find((t) => t.id === event.id);
            if (tc) tc.input = event.input;
            break;
          }
          case 'message_end':
            if (hasToolCalls) {
              for (const tc of toolCalls) {
                if (Object.keys(tc.input).length === 0) {
                  const raw = toolInputBuffers.get(tc.id);
                  if (raw) {
                    try { tc.input = JSON.parse(raw); } catch { /* ignore */ }
                  }
                }
              }
            }
            break;
        }
      }

      messages.push({
        role: 'assistant',
        content: textContent,
        toolCalls: hasToolCalls ? toolCalls : undefined,
      });

      if (!hasToolCalls) {
        // Agent finished with a text response containing its analysis
        return {
          role: 'insights',
          success: true,
          data: lastAnalysisResult ?? this.extractInsightsData(textContent),
          explanation: textContent,
        };
      }

      // Execute tool calls
      const toolResults = [];
      for (const tc of toolCalls) {
        if (tc.name === 'analyze_data') {
          const desc = (tc.input as Record<string, unknown>).description;
          this.config.onStatus?.(desc ? `Analyzing: ${String(desc)}` : 'Running statistical analysis…');
        }

        const { kind, label } = formatStart(tc.name, tc.input);
        const startMs = performance.now();
        const result = await this.config.toolRouter.execute(tc.name, tc.input);
        const durationMs = Math.max(0, Math.round(performance.now() - startMs));
        const { resultSummary } = formatEnd(tc.name, result.content, result.isError, durationMs);
        toolResults.push({
          toolCallId: tc.id,
          content: result.content,
          isError: result.isError,
        });

        this.config.onEvent?.({
          type: 'tool_end',
          name: tc.name,
          result: result.content,
          isError: result.isError,
          kind,
          label,
          durationMs,
          ...(resultSummary !== undefined ? { resultSummary } : {}),
        });

        // Capture analysis results
        if (!result.isError && tc.name === 'analyze_data') {
          try {
            lastAnalysisResult = JSON.parse(result.content) as Record<string, unknown>;
            const rowCount = (lastAnalysisResult.rowCount as number | undefined)
              ?? (Array.isArray(lastAnalysisResult.rows) ? (lastAnalysisResult.rows as unknown[]).length : undefined);
            if (typeof rowCount === 'number') {
              this.config.onStatus?.(`Analysis finished on ${rowCount.toLocaleString()} row${rowCount === 1 ? '' : 's'}`);
            }
          } catch {
            lastAnalysisResult = { rawResult: result.content };
          }
        }
      }

      messages.push({
        role: 'user',
        content: '',
        toolResults,
      });
    }

    return {
      role: 'insights',
      success: false,
      data: lastAnalysisResult ?? {},
      explanation: 'Exceeded maximum tool rounds',
      error: 'max_tool_rounds',
    };
  }

  /** Extract structured insights data from the agent's text response. */
  private extractInsightsData(text: string): Record<string, unknown> {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch?.[1]) {
      try {
        return JSON.parse(jsonMatch[1]) as Record<string, unknown>;
      } catch {
        // fall through
      }
    }
    return { analysis: text };
  }
}
