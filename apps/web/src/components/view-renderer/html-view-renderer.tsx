'use client';

import { useRef, useEffect, useMemo, useState } from 'react';
import { LightboardLoader } from '../brand';

/** An HTML view produced by the agent — rendered in a sandboxed iframe. */
export interface HtmlView {
  title?: string;
  description?: string;
  sql: string;
  html: string;
}

/** Props for the HtmlViewRenderer component. */
interface HtmlViewRendererProps {
  view: HtmlView;
  isLoading?: boolean;
  /**
   * When `true`, suppress the outer title + description header. Round-2 views
   * carry their own `FIGURE 01 · <CATEGORY>` eyebrow, Space Grotesk title,
   * and Inter subtitle *inside* the iframe, so repeating them outside would
   * double-print the chart heading.
   *
   * When `false` (or `'auto'` and no inner `FIGURE` marker is detected), the
   * outer header renders as it did pre-round-2 so legacy HTML views still
   * get a heading.
   *
   * Defaults to `'auto'` — inspects the HTML for a `FIGURE` marker and picks.
   */
  chromeless?: boolean | 'auto';
}

/**
 * Heuristic: does the generated HTML embed the design-system FIGURE anatomy
 * (eyebrow + title + subtitle + footer) itself? If so, the outer wrapper
 * should be chromeless to avoid doubling.
 */
function hasInternalChrome(html: string): boolean {
  // The round-2 template emits `FIGURE 01 · ...` in the eyebrow. Looking for
  // the prefix handles the common case without matching false positives in
  // prose titles or descriptions.
  return /FIGURE\s+\d{1,2}\s+·/.test(html);
}

/**
 * Renders an agent-generated HTML visualization in a sandboxed iframe.
 * The iframe allows scripts but NOT same-origin access, preventing
 * the generated HTML from accessing the parent page's cookies/storage/DOM.
 */
export function HtmlViewRenderer({ view, isLoading, chromeless = 'auto' }: HtmlViewRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(600);

  // Auto-resize iframe based on content height
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      try {
        // With sandbox="allow-scripts" (no allow-same-origin), we cannot access
        // contentDocument. Fall back to a reasonable default height.
        setIframeHeight(600);
      } catch {
        setIframeHeight(600);
      }
    };

    iframe.addEventListener('load', handleLoad);
    return () => iframe.removeEventListener('load', handleLoad);
  }, [view.html]);

  const showHeader = useMemo(() => {
    if (chromeless === true) return false;
    if (chromeless === false) return true;
    // 'auto' — hide the outer header only when the HTML already carries its own.
    return !hasInternalChrome(view.html);
  }, [chromeless, view.html]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      {showHeader && (view.title || view.description) && (
        <div className="shrink-0 border-b border-border px-6 py-4">
          {view.title && (
            <h2 className="text-lg font-semibold text-foreground">
              {view.title}
            </h2>
          )}
          {view.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {view.description}
            </p>
          )}
        </div>
      )}

      {/* Iframe container */}
      <div className="relative flex-1 overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
            <LightboardLoader size={48} />
          </div>
        )}
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts"
          srcDoc={view.html}
          title={view.title ?? 'Visualization'}
          className="h-full w-full border-0"
          style={{ minHeight: `${iframeHeight}px` }}
        />
      </div>
    </div>
  );
}
