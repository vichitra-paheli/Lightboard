'use client';

import { useRef, useEffect, useState } from 'react';

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
}

/**
 * Renders an agent-generated HTML visualization in a sandboxed iframe.
 * The iframe allows scripts but NOT same-origin access, preventing
 * the generated HTML from accessing the parent page's cookies/storage/DOM.
 */
export function HtmlViewRenderer({ view, isLoading }: HtmlViewRendererProps) {
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

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      {(view.title || view.description) && (
        <div className="shrink-0 border-b px-6 py-4" style={{ borderColor: 'var(--color-border)' }}>
          {view.title && (
            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-foreground)' }}>
              {view.title}
            </h2>
          )}
          {view.description && (
            <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
              {view.description}
            </p>
          )}
        </div>
      )}

      {/* Iframe container */}
      <div className="relative flex-1 overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
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
