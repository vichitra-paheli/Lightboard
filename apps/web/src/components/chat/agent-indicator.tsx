'use client';

import { Database, BarChart, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Data describing a sub-agent delegation within a conversation turn. */
export interface AgentIndicatorData {
  agent: string;
  task?: string;
  status: 'running' | 'done';
  summary?: string;
}

/** Props for AgentIndicator. */
interface AgentIndicatorProps {
  delegation: AgentIndicatorData;
}

/** Agent type to icon/label mapping key. */
type AgentType = 'query' | 'view' | 'insights';

/** Icon components for each agent type. */
const AGENT_ICONS: Record<AgentType, React.ComponentType<{ className?: string }>> = {
  query: Database,
  view: BarChart,
  insights: TrendingUp,
};

/** i18n keys for each agent type's active label. */
const AGENT_LABEL_KEYS: Record<AgentType, string> = {
  query: 'agentQuery',
  view: 'agentView',
  insights: 'agentInsights',
};

/**
 * Displays a sub-agent delegation indicator.
 * Shows an animated pulse while running and a summary when complete.
 */
export function AgentIndicator({ delegation }: AgentIndicatorProps) {
  const t = useTranslations('chat');
  const agentType = delegation.agent as AgentType;
  const Icon = AGENT_ICONS[agentType] ?? Database;
  const labelKey = AGENT_LABEL_KEYS[agentType] ?? 'agentQuery';
  const isRunning = delegation.status === 'running';

  return (
    <div
      className="flex items-center gap-2 rounded px-2 py-1.5 text-xs"
      style={{
        backgroundColor: 'var(--color-muted)',
        color: 'var(--color-muted-foreground)',
      }}
    >
      <div className="relative flex shrink-0 items-center justify-center">
        <Icon className="h-3.5 w-3.5" />
        {isRunning && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-blue-500" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <span className={isRunning ? 'animate-pulse' : ''}>
          {isRunning ? t(labelKey) : t('agentDone')}
        </span>
        {delegation.summary && !isRunning && (
          <span className="ml-1 opacity-60">
            &mdash; {delegation.summary}
          </span>
        )}
      </div>
    </div>
  );
}
