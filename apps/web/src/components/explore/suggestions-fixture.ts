import type { ViewSpec } from '@lightboard/viz-core';
import type { HtmlView } from '@/components/view-renderer';
import { __testing as thumbnailTesting } from './procedural-thumbnail';

/**
 * TODO(backend-suggestions): Delete this file once the backend emits a real
 * SSE `suggestions` event. See `documentation/backend-ui-polish-followups.md`
 * §2 for the event shape and the call-site in `explore-page-client.tsx` that
 * currently invokes this helper.
 *
 * Rationale for a hardcoded fixture: PR 7's scope is the UI surface for
 * follow-up suggestions. Real dimension/measure-aware suggestions require
 * reading into the view's SQL + result shape, which is the backend ticket's
 * responsibility. Shipping a fixture keyed off the chart kind lets the UI
 * ship its visual polish + click-through behaviour without blocking on the
 * backend.
 */

const FIXTURES = {
  bar: [
    'Flip to batters who exceeded model',
    'Break down by phase of innings',
    'Filter to 2020 onwards',
    'Switch to scatter vs xRuns',
  ],
  scatter: [
    'Switch to bubble sized by sample size',
    'Highlight top quartile',
    'Add regression line',
    'Filter to qualifiers only',
  ],
  line: [
    'Zoom to last 3 seasons',
    'Compare vs league average',
    'Break down by venue',
    'Switch to cumulative view',
  ],
  hist: [
    'Bucket at 5 instead of 10',
    'Split by role',
    'Overlay expected distribution',
    'Filter tails above 95th percentile',
  ],
} as const;

const DEFAULT_FIXTURE = [
  'Refine the filter',
  'Break down further',
  'Switch chart type',
  'Drill into a row',
];

/**
 * Build a hardcoded list of follow-up chip labels for a given view, keyed off
 * the detected chart kind. See the TODO at the top of this file for the
 * deletion trigger.
 *
 * Returns a defensive copy each call so callers that mutate the array (for
 * example to append an agent-provided extra) don't poison the shared
 * fixture constant.
 */
export function buildSuggestionsForView(view: HtmlView | ViewSpec): string[] {
  const kind = thumbnailTesting.detectKind(view);
  const fixture = FIXTURES[kind] ?? DEFAULT_FIXTURE;
  return [...fixture];
}

/**
 * Exposed for tests that want to assert on the raw fixture maps without
 * having to construct an `HtmlView`/`ViewSpec` first.
 */
export const __testing = {
  FIXTURES,
  DEFAULT_FIXTURE,
};
