import type { AgentSessionSyncEvent } from "@shiit/coding-agent/client";

import type {
  AgentStatus,
  AssistantMessageItem,
  TimelineItem,
  ToolItem,
} from "./types.js";

import { extractText, extractThinking } from "./content-parser.js";

export interface TimelinePatch {
  contextUsage?: {
    contextWindow: number;
    percent: null | number;
    tokens: null | number;
  };
  cost?: number;
  model?: { name: string; provider: string } | null;
  status?: AgentStatus;
  timeline?: (prev: TimelineItem[]) => TimelineItem[];
}

export function interpretEvent(
  event: AgentSessionSyncEvent,
): null | TimelinePatch {
  switch (event.type) {
    case "agent_end": {
      const messages = (event as { messages?: unknown[] }).messages;
      if (messages?.length) {
        const lastMsg = messages[messages.length - 1] as {
          errorMessage?: string;
          role?: string;
        };
        if (lastMsg?.role === "assistant" && lastMsg?.errorMessage) {
          return {
            status: "idle",
            timeline: (prev) => {
              const exists = prev.some(
                (i) =>
                  i.kind === "assistant_message" &&
                  i.text === lastMsg.errorMessage,
              );
              if (exists) return prev;
              return [
                ...prev,
                {
                  id: `error-${Date.now()}`,
                  kind: "assistant_message",
                  pending: false,
                  text: lastMsg.errorMessage,
                } as TimelineItem,
              ];
            },
          };
        }
      }
      return { status: "idle" };
    }

    case "agent_start":
      return { status: "thinking" };

    case "auto_retry_start": {
      const ev = event as {
        attempt: number;
        delayMs: number;
        errorMessage: string;
        maxAttempts: number;
      };
      return {
        status: "retrying",
        timeline: (prev) => {
          const filtered = prev.filter((i) => i.kind !== "retry");
          return [
            ...filtered,
            {
              id: `retry-${Date.now()}`,
              kind: "retry",
              text: `Retry ${ev.attempt}/${ev.maxAttempts} — ${ev.errorMessage} (${ev.delayMs}ms)`,
            },
          ];
        },
      };
    }

    case "auto_retry_end": {
      const ev = event as {
        attempt?: number;
        finalError?: string;
        success: boolean;
      };
      if (ev.success) {
        return {
          timeline: (prev) => prev.filter((i) => i.kind !== "retry"),
        };
      }
      return {
        status: "idle",
        timeline: (prev) => {
          const filtered = prev.filter((i) => i.kind !== "retry");
          if (ev.finalError) {
            return [
              ...filtered,
              {
                id: `error-${Date.now()}`,
                kind: "assistant_message",
                pending: false,
                text: ev.finalError,
              },
            ];
          }
          return filtered;
        },
      };
    }

    case "compaction_end": {
      return {
        status: "idle",
        timeline: (prev) => {
          // Add a synthetic compaction divider when compaction succeeded
          if (!event.aborted && (event as any).result) {
            return [
              ...prev,
              {
                id: `compaction-${Date.now()}`,
                kind: "compaction" as const,
                label: "Context compacted",
              } as TimelineItem, // cast because 'compaction' is not in the base type yet
            ];
          }
          return prev;
        },
      };
    }

    case "compaction_start":
      return { status: "compacting" };

    case "context_usage_changed": {
      return {
        contextUsage: event.usage ?? undefined,
        cost: event.cost ?? undefined,
      };
    }

    case "message_end": {
      const msg = event.message as any;
      if (msg.role === "toolResult" || msg.role === "user") return null;

      const finalText = extractText(msg.content);
      const finalThinking = extractThinking(msg.content);
      const hasToolCalls = (msg.content as any[] | undefined)?.some(
        (c: any) => c.type === "toolCall",
      );

      return {
        status: hasToolCalls ? "thinking" : "idle",
        timeline: (prev) => {
          const idx = prev.findIndex(
            (i) => i.kind === "assistant_message" && i.id === event.id,
          );
          const updated = [...prev];
          if (idx === -1) {
            // Message arrived before snapshot — materialise the final form
            if (!finalText && !finalThinking && !hasToolCalls) return prev;
            updated.push({
              id: event.id as string,
              kind: "assistant_message",
              pending: false,
              text: finalText,
              thinking: finalThinking,
            });
            return updated;
          }
          // Don't remove assistant messages that contain tool calls — the
          // thinking/text belongs alongside the tool cards. If it's truly
          // empty (no text, no thinking, no tool calls), then drop it.
          if (!finalText && !finalThinking && !hasToolCalls) {
            return prev.filter((_, i) => i !== idx);
          }
          updated[idx] = {
            ...(updated[idx] as AssistantMessageItem),
            pending: false,
            text: finalText,
            thinking: finalThinking,
          };
          return updated;
        },
      };
    }

    case "message_start": {
      const msg = event.message as any;
      if (msg.role === "user") {
        return {
          timeline: (prev) => {
            // Replace optimistic user message if one exists
            const optimisticIdx = prev.findIndex(
              (i) =>
                i.kind === "user_message" && i.id.startsWith("optimistic-"),
            );
            const newItem: TimelineItem = {
              id: event.id as string,
              kind: "user_message",
              text: extractText(msg.content),
            };
            if (optimisticIdx !== -1) {
              const updated = [...prev];
              updated[optimisticIdx] = newItem;
              return updated;
            }
            return [...prev, newItem];
          },
        };
      }
      if (msg.role !== "toolResult") {
        return {
          status: "streaming",
          timeline: (prev) => [
            ...prev,
            {
              id: event.id as string,
              kind: "assistant_message",
              pending: true,
              text: "",
            },
          ],
        };
      }
      return null;
    }

    case "message_update": {
      return {
        timeline: (prev) => {
          const idx = prev.findIndex(
            (i) => i.kind === "assistant_message" && i.id === event.id,
          );
          const existing =
            idx !== -1 ? (prev[idx] as AssistantMessageItem) : null;
          const isFirstDelta = !existing || existing.text === "";
          const isFirstThinking = !existing || !existing.thinking;
          const updated = [...prev];
          if (idx === -1) {
            // Message arrived before snapshot — materialise it now
            const msg = event.message as any;
            if (msg.role !== "assistant") return prev;
            updated.push({
              id: event.id as string,
              kind: "assistant_message",
              pending: true,
              text: (event.delta || "").trimStart(),
              thinking: event.thinkingDelta
                ? event.thinkingDelta.trimStart()
                : undefined,
            });
          } else {
            const current = prev[idx] as AssistantMessageItem;
            updated[idx] = {
              ...current,
              text:
                current.text +
                (isFirstDelta
                  ? (event.delta || "").trimStart()
                  : event.delta || ""),
              thinking: event.thinkingDelta
                ? (current.thinking || "") +
                  (isFirstThinking
                    ? event.thinkingDelta.trimStart()
                    : event.thinkingDelta)
                : current.thinking,
            };
          }

          // Extract tool calls from the partial assistant message and
          // materialise them as pending ToolItems so the user can watch
          // the agent construct the tool call in real time.
          const msg = event.message as any;
          const content: any[] | undefined = msg.content;
          if (content) {
            const toolCalls = content.filter((c) => c.type === "toolCall");
            for (const tc of toolCalls) {
              const existingIdx = updated.findIndex(
                (i) => i.kind === "tool" && i.id === tc.id,
              );
              if (existingIdx === -1) {
                updated.push({
                  args: safeParseArgs(tc.arguments),
                  id: tc.id,
                  isError: false,
                  kind: "tool",
                  name: tc.name,
                  status: "pending",
                });
              } else {
                updated[existingIdx] = {
                  ...(updated[existingIdx] as ToolItem),
                  args: safeParseArgs(tc.arguments),
                };
              }
            }
          }

          return updated;
        },
      };
    }

    case "model_changed": {
      const model = (event as any).model;
      return {
        model: model ? { name: model.name, provider: model.provider } : null,
      };
    }

    case "tool_execution_end": {
      return {
        timeline: (prev) => {
          const idx = prev.findIndex(
            (i) => i.kind === "tool" && i.id === event.toolCallId,
          );
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = {
            ...(updated[idx] as ToolItem),
            isError: event.isError,
            result: event.result,
            status: event.isError ? "error" : "completed",
          };
          return updated;
        },
      };
    }

    case "tool_execution_start": {
      return {
        status: "thinking",
        timeline: (prev) => {
          const existingIdx = prev.findIndex(
            (i) => i.kind === "tool" && i.id === event.toolCallId,
          );
          if (existingIdx !== -1) {
            const updated = [...prev];
            updated[existingIdx] = {
              ...(updated[existingIdx] as ToolItem),
              args: event.args,
              status: "running",
            };
            return updated;
          }
          return [
            ...prev,
            {
              args: event.args,
              id: event.toolCallId,
              isError: false,
              kind: "tool",
              name: event.toolName,
              status: "running",
            },
          ];
        },
      };
    }

    case "tool_execution_update": {
      return {
        timeline: (prev) => {
          const idx = prev.findIndex(
            (i) => i.kind === "tool" && i.id === event.toolCallId,
          );
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = {
            ...(updated[idx] as ToolItem),
            result: event.partialResult,
          };
          return updated;
        },
      };
    }

    default:
      return null;
  }
}

/**
 * Safely parse tool arguments that may be a partial JSON string, a complete
 * object, or undefined while the LLM is still streaming the tool call.
 */
function safeParseArgs(raw: unknown): unknown {
  if (raw == null) return {};
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw; // partial JSON string — display as-is
    }
  }
  return raw;
}
