'use client';

import type { ViewSpec } from '@lightboard/viz-core';
import {
  HtmlViewRenderer,
  ViewRenderer,
  type HtmlView,
} from '@/components/view-renderer';

/**
 * Type guard: HTML views carry an `html` property. ViewSpecs don't.
 * Exported here so the Turn and the page client can share one source of
 * truth for the discrimination.
 */
export function isHtmlView(view: ViewSpec | HtmlView): view is HtmlView {
  return 'html' in view;
}

/**
 * Props for {@link InlineChartFrame}.
 */
interface InlineChartFrameProps {
  view: ViewSpec | HtmlView;
  /** Data rows for legacy ViewSpec renderers; unused for HtmlView. */
  data?: Record<string, unknown>[] | null;
  isLoading?: boolean;
}

/**
 * Editorial card frame for charts rendered inline inside a conversational
 * turn. Wraps either an {@link HtmlViewRenderer} (new agent HTML output)
 * or the legacy {@link ViewRenderer} (declarative ViewSpec) in a 920px max
 * card with the `--bg-5` fill and a soft border.
 *
 * The card sits inside the thread's scroll container and uses
 * `scroll-snap-align: center` + `scroll-snap-stop: always` so browsers
 * snap each chart to center as the user scrolls — matching the editorial
 * chart-per-view feel in the handoff.
 */
export function InlineChartFrame({
  view,
  data,
  isLoading,
}: InlineChartFrameProps) {
  return (
    <div
      className="mx-auto w-full overflow-hidden rounded-[14px]"
      style={{
        maxWidth: 920,
        background: 'var(--bg-5)',
        border: '1px solid var(--line-3)',
        padding: '28px 32px 24px',
        scrollSnapAlign: 'center',
        scrollSnapStop: 'always',
      }}
    >
      {isHtmlView(view) ? (
        <HtmlViewRenderer view={view} isLoading={isLoading} />
      ) : (
        <ViewRenderer
          spec={view}
          data={data ?? null}
          isLoading={isLoading}
          error={null}
          width={800}
          height={600}
        />
      )}
    </div>
  );
}
