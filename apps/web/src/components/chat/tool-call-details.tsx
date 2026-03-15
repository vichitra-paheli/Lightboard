'use client';

import { useState } from 'react';
import { ChevronRight, Check, X, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Data describing a single tool invocation with optional input/output details. */
export interface ToolCallData {
  name: string;
  status: 'running' | 'done' | 'error';
  input?: Record<string, unknown>;
  result?: string;
  durationMs?: number;
}

/** Props for ToolCallDetails. */
interface ToolCallDetailsProps {
  toolCall: ToolCallData;
}

/**
 * Expandable tool call indicator.
 * Collapsed: shows tool name + status icon.
 * Expanded: shows input JSON, output, and duration.
 */
export function ToolCallDetails({ toolCall }: ToolCallDetailsProps) {
  const [expanded, setExpanded] = useState(false);
  const t = useTranslations('chat');
  const hasDetails = toolCall.input || toolCall.result || toolCall.durationMs;

  return (
    <div
      className="rounded text-xs"
      style={{
        backgroundColor: 'var(--color-muted)',
        color: 'var(--color-muted-foreground)',
      }}
    >
      {/* Collapsed header row */}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2 py-1"
        onClick={() => hasDetails && setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={expanded ? t('toolCollapse') : t('toolExpand')}
        disabled={!hasDetails}
      >
        {hasDetails && (
          <ChevronRight
            className={`h-3 w-3 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          />
        )}
        <ToolStatusIcon status={toolCall.status} />
        <span className="truncate">{toolCall.name}</span>
        {toolCall.durationMs !== undefined && toolCall.status !== 'running' && (
          <span className="ml-auto shrink-0 tabular-nums opacity-60">
            {formatDuration(toolCall.durationMs)}
          </span>
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div
          className="space-y-2 px-3 pb-2 pt-1 text-xs"
          style={{ borderTopWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)' }}
        >
          {toolCall.input && Object.keys(toolCall.input).length > 0 && (
            <ToolSection label={t('toolInput')}>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded p-2"
                style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-foreground)' }}
              >
                {JSON.stringify(toolCall.input, null, 2)}
              </pre>
            </ToolSection>
          )}

          {toolCall.result && (
            <ToolSection label={t('toolOutput')}>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded p-2"
                style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-foreground)' }}
              >
                {formatResult(toolCall.result)}
              </pre>
            </ToolSection>
          )}

          {toolCall.durationMs !== undefined && (
            <div className="flex items-center gap-1 opacity-60">
              <span>{t('toolDuration')}:</span>
              <span className="tabular-nums">{formatDuration(toolCall.durationMs)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Props for ToolSection. */
interface ToolSectionProps {
  label: string;
  children: React.ReactNode;
}

/** Labeled section within the expanded tool call details. */
function ToolSection({ label, children }: ToolSectionProps) {
  return (
    <div>
      <div className="mb-1 font-medium opacity-70">{label}</div>
      {children}
    </div>
  );
}

/** Props for ToolStatusIcon. */
interface ToolStatusIconProps {
  status: 'running' | 'done' | 'error';
}

/** Status icon for a tool call: spinner, checkmark, or error. */
function ToolStatusIcon({ status }: ToolStatusIconProps) {
  switch (status) {
    case 'running':
      return <Loader2 className="h-3 w-3 shrink-0 animate-spin" />;
    case 'done':
      return <Check className="h-3 w-3 shrink-0 text-green-500" />;
    case 'error':
      return <X className="h-3 w-3 shrink-0 text-red-500" />;
  }
}

/**
 * Formats a duration in milliseconds to a human-readable string.
 * Under 1s shows ms, otherwise shows seconds with one decimal.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Attempts to pretty-print a result string as JSON.
 * Falls back to the raw string if parsing fails.
 */
function formatResult(result: string): string {
  try {
    const parsed = JSON.parse(result);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return result;
  }
}
