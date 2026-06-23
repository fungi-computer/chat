import { type RefObject } from "react";

interface ChatInputProps {
  canvasRef?: RefObject<HTMLCanvasElement>;
  disabled?: boolean;
  id?: string;
  info?: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  status?: string;
  statusColor?: string;
  value: string;
}

export function ChatInput({
  canvasRef,
  disabled = false,
  id,
  info,
  onChange,
  onSend,
  placeholder = "Ask Shiitake...",
  status,
  statusColor = "text-base-content/40",
  value,
}: ChatInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="border-t-2 border-primary shrink-0">
      {info && (
        <div className="border-b border-primary/20 px-3 py-1.5 flex items-center gap-2">
          <svg
            className="text-primary/40"
            fill="none"
            height="12"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="12"
          >
            <rect height="20" rx="2" width="20" x="2" y="2" />
            <path d="M6 6h4M6 10h4M6 14h4" />
          </svg>
          <span className="font-mono text-[10px] text-primary/50 tracking-wide">
            {info}
          </span>
        </div>
      )}

      <div className="py-2 px-3 flex items-center gap-3">
        {canvasRef && (
          <div className="flex items-center gap-2 shrink-0">
            <canvas
              className="w-8 h-8"
              height={80}
              ref={canvasRef}
              width={80}
            />
            {status && (
              <span
                className={`font-character text-[10px] capitalize ${statusColor}`}
              >
                {status}
              </span>
            )}
          </div>
        )}

        <input
          className="flex-1 bg-base-100 border border-primary text-base-content px-3 py-2 text-sm focus:outline-none focus:border-primary placeholder:text-base-content/30 min-w-0 disabled:opacity-30"
          disabled={disabled}
          id={id}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          type="text"
          value={value}
        />

        <button
          aria-label="Send"
          className="bg-primary text-primary-content px-3 py-2 text-sm hover:bg-primary/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
          disabled={disabled || !value.trim()}
          onClick={onSend}
        >
          <svg
            className="block"
            fill="none"
            height="16"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="16"
          >
            <path d="M22 2L11 13" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
