'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize from 'rehype-sanitize';

/** Props for MarkdownRenderer. */
interface MarkdownRendererProps {
  content: string;
}

/** Renders markdown content with GFM support, syntax highlighting, and XSS sanitization. */
export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize, rehypeHighlight]}
        components={{
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-md p-3 text-xs" style={{
              backgroundColor: 'var(--color-muted)',
              color: 'var(--color-muted-foreground)',
            }}>
              {children}
            </pre>
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="rounded px-1 py-0.5 text-xs" style={{
                  backgroundColor: 'var(--color-muted)',
                  color: 'var(--color-muted-foreground)',
                }}>
                  {children}
                </code>
              );
            }
            return <code className={className}>{children}</code>;
          },
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs" style={{
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: 'var(--color-border)',
              }}>
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="px-2 py-1 text-left text-xs font-semibold" style={{
              borderBottomWidth: '1px',
              borderStyle: 'solid',
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-muted)',
            }}>
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-2 py-1 text-xs" style={{
              borderBottomWidth: '1px',
              borderStyle: 'solid',
              borderColor: 'var(--color-border)',
            }}>
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
