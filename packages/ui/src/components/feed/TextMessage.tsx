import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
  streaming: boolean;
}

export function TextMessage({ content, streaming }: Props) {
  return (
    <div className="max-w-[640px] text-text-body leading-relaxed text-[13px] prose-feed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-text-default">{children}</strong>,
          em: ({ children }) => <em>{children}</em>,
          code: ({ children, className }) => {
            const isBlock = className?.startsWith('language-');
            if (isBlock) return <code className={className}>{children}</code>;
            return (
              <code className="font-mono text-[12px] bg-surface-sunken px-1 py-0.5 rounded text-text-default">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="font-mono text-[12px] bg-surface-sunken rounded p-3 overflow-x-auto my-2 text-text-default whitespace-pre">
              {children}
            </pre>
          ),
          ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-blue underline">
              {children}
            </a>
          ),
          h1: ({ children }) => <h1 className="text-[15px] font-semibold text-text-default mb-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-[14px] font-semibold text-text-default mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-[13px] font-semibold text-text-default mb-1">{children}</h3>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border-default pl-3 text-text-muted my-2">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      {streaming && (
        <span className="inline-block w-[6px] h-[14px] bg-text-muted ml-0.5 animate-pulse-opacity align-text-bottom" />
      )}
    </div>
  );
}
