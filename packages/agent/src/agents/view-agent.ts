import { classifyTool, formatEnd, formatStart } from '../events/tool-event-formatter';
import type { Message, ToolCallResult } from '../provider/types';
import { buildViewPrompt } from '../prompt/view-prompt';
import { viewTools } from '../tools/view-tools';
import type { AgentTask, SubAgent, SubAgentConfig, SubAgentResult } from './types';

/**
 * View specialist sub-agent.
 * Handles chart type selection and ViewSpec generation.
 * Has access to create_view and modify_view tools only.
 * Receives data summary (columns, types, row count, sample rows) in task context.
 */
export class ViewAgent implements SubAgent {
  readonly role = 'view' as const;
  readonly tools = viewTools;
  private config: SubAgentConfig;

  constructor(config: SubAgentConfig) {
    this.config = config;
  }

  /** Execute a view task and yield the result. */
  async *execute(task: AgentTask): AsyncIterable<SubAgentResult> {
    const result = await this.run(task);
    yield result;
  }

  /** Run a view task and return the structured result. */
  async run(task: AgentTask): Promise<SubAgentResult> {
    const systemPrompt = buildViewPrompt(task.context);
    const messages: Message[] = [
      { role: 'user', content: task.instruction },
    ];

    const maxRounds = this.config.maxToolRounds ?? 3;
    let viewResult: Record<string, unknown> | undefined;

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
        return {
          role: 'view',
          success: true,
          data: viewResult ?? this.extractViewData(textContent),
          explanation: textContent,
        };
      }

      // Execute tool calls and collect results
      const toolResults = [];

      for (const tc of toolCalls) {
        if (tc.name === 'create_view' || tc.name === 'modify_view') {
          const title = (tc.input as Record<string, unknown>).title;
          this.config.onStatus?.(
            tc.name === 'create_view'
              ? `Rendering visualization${title ? `: ${String(title)}` : '…'}`
              : 'Updating visualization…',
          );
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

        // Capture the view data from create_view or modify_view results
        if (!result.isError && (tc.name === 'create_view' || tc.name === 'modify_view')) {
          try {
            viewResult = JSON.parse(result.content) as Record<string, unknown>;
            const html = (viewResult.viewSpec as Record<string, unknown> | undefined)?.html as string | undefined;
            if (html) {
              const kb = Math.round((html.length / 1024) * 10) / 10;
              this.config.onStatus?.(`Visualization ready (${kb} KB)`);
            }
          } catch {
            // ignore parse failures
          }
        }
      }

      messages.push({
        role: 'user',
        content: '',
        toolResults,
      });

      // If this is the last round and we have a view result, return it
      if (round === maxRounds - 1 && viewResult) {
        return {
          role: 'view',
          success: true,
          data: viewResult,
          explanation: textContent || 'View created successfully',
        };
      }
    }

    return {
      role: 'view',
      success: false,
      data: {},
      explanation: 'Exceeded maximum tool rounds without producing a view',
      error: 'max_tool_rounds',
    };
  }

  /** Extract structured view data from the agent's text response. */
  private extractViewData(text: string): Record<string, unknown> {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch?.[1]) {
      try {
        return JSON.parse(jsonMatch[1]) as Record<string, unknown>;
      } catch {
        // fall through
      }
    }
    return { rawText: text };
  }
}
