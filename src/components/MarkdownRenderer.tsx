import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  children: string;
}

export function MarkdownRenderer({ children }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      components={{
        a: ({ children, href }) => (
          <a
            className="text-primary underline"
            href={href}
            rel="noopener noreferrer"
            target="_blank"
          >
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-primary/40 pl-3 italic text-base-content/60 my-2">
            {children}
          </blockquote>
        ),
        br: () => <br />,
        code: ({ children, className }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="bg-base-200 px-1 py-0.5 rounded text-xs font-mono">
                {children}
              </code>
            );
          }
          const match = /language-(\w+)/.exec(className || "");
          const language = match ? match[1] : "";
          return (
            <div className="my-2 rounded overflow-hidden">
              {language && (
                <div className="bg-base-200 px-3 py-1 text-[10px] font-mono text-base-content/50 uppercase tracking-wider">
                  {language}
                </div>
              )}
              <pre
                className="bg-base-200 px-4 py-3 text-xs font-mono overflow-x-auto"
                style={{ borderRadius: language ? "0 0 4px 4px" : "4px" }}
              >
                <code>{String(children).replace(/\n$/, "")}</code>
              </pre>
            </div>
          );
        },
        em: ({ children }) => <em className="italic">{children}</em>,
        h1: ({ children }) => <h1 className="text-lg font-bold">{children}</h1>,
        h2: ({ children }) => (
          <h2 className="text-base font-semibold">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-medium">{children}</h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-sm font-medium">{children}</h4>
        ),
        hr: () => <hr className="border-primary/20" />,
        img: ({ alt, src }) => {
          // Workspace paths are not public URLs; render as a link
          if (src?.startsWith("/")) {
            return (
              <div
                className="my-2 px-3 py-2 text-[10px] font-mono"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                }}
              >
                <span style={{ color: "var(--text-dim)" }}>
                  {alt || "Generated image"}
                </span>
                <span className="mx-2 opacity-30">·</span>
                <span style={{ color: "var(--accent)" }}>{src}</span>
                <span className="mx-2 opacity-30">·</span>
                <span style={{ color: "var(--text-dim)" }}>
                  Open in file browser
                </span>
              </div>
            );
          }
          return (
            <img
              alt={alt || "Image"}
              className="max-w-full my-2"
              src={src}
              style={{ maxHeight: 400 }}
            />
          );
        },
        li: ({ children }) => <li>{children}</li>,
        ol: ({ children }) => <ol className="list-decimal pl-4">{children}</ol>,
        p: ({ children }) => <p>{children}</p>,
        pre: ({ children }) => <>{children}</>,
        strong: ({ children }) => (
          <strong className="font-semibold text-primary">{children}</strong>
        ),
        table: ({ children }) => (
          <table className="border-collapse w-full text-xs">{children}</table>
        ),
        td: ({ children }) => (
          <td className="border border-primary/20 px-3 py-2">{children}</td>
        ),
        th: ({ children }) => (
          <th className="border border-primary/20 px-3 py-2 text-left font-semibold">
            {children}
          </th>
        ),
        thead: ({ children }) => (
          <thead className="bg-base-200">{children}</thead>
        ),
        ul: ({ children }) => <ul className="list-disc pl-4">{children}</ul>,
      }}
      remarkPlugins={[remarkGfm]}
    >
      {children}
    </ReactMarkdown>
  );
}
