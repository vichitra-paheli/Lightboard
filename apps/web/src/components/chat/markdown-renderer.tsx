'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

/** Props for MarkdownRenderer. */
interface MarkdownRendererProps {
  /** The markdown string to render. */
  content: string;
}

/**
 * Renders markdown content with GFM support, syntax highlighting, and sanitization.
 * Uses the `.prose-container` CSS class for theme-aware typography.
 */
export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose-container">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, rehypeSanitize]}
        components={{
          pre: PreBlock,
          a: MarkdownLink,
          table: MarkdownTable,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/** Code block wrapper with a copy-to-clipboard button. */
function PreBlock({ children }: { children?: React.ReactNode }) {
  const t = useTranslations('chat');
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const handleCopy = useCallback(() => {
    const codeEl = preRef.current?.querySelector('code');
    if (codeEl?.textContent) {
      navigator.clipboard.writeText(codeEl.textContent).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, []);

  return (
    <div className="group relative">
      <pre ref={preRef} className="overflow-x-auto rounded-md bg-muted p-3 text-sm text-foreground">
        {children}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 rounded bg-secondary px-2 py-1 text-xs text-secondary-foreground opacity-0 transition-opacity group-hover:opacity-100"
      >
        {copied ? '\u2713' : t('copyCode')}
      </button>
    </div>
  );
}

/** Renders links that open in a new tab. */
function MarkdownLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline"
    >
      {children}
    </a>
  );
}

/** Theme-aware table wrapper with overflow scrolling. */
function MarkdownTable({ children }: { children?: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border border-border text-sm">
        {children}
      </table>
    </div>
  );
}
