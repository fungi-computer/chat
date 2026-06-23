import { type ReactNode } from "react";

import { MarkdownRenderer } from "./MarkdownRenderer.js";

interface ChatMessageProps {
  children: ReactNode;
  pending?: boolean;
  speaker: "agent" | "user";
  thinking?: string;
}

export function ChatMessage({
  children,
  pending,
  speaker,
  thinking,
}: ChatMessageProps) {
  if (speaker === "user") {
    return (
      <div className="border-l-2 border-primary bg-base-100 px-3 py-2 text-sm leading-relaxed text-base-content">
        <div className="whitespace-pre-wrap">{children}</div>
        {pending && <span className="animate-pulse">▊</span>}
      </div>
    );
  }

  return (
    <div className="space-y-1.5 bg-base-100">
      {thinking && (
        <div className="text-xs text-base-content/70 italic px-3 py-1 bg-base-200/50 rounded">
          {thinking}
        </div>
      )}
      <div className="text-base-content px-3 py-2 text-sm leading-relaxed">
        <MarkdownRenderer>{String(children)}</MarkdownRenderer>
        {pending && <span className="animate-pulse">▊</span>}
      </div>
    </div>
  );
}
