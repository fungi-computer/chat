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
  /**
   * Granular timeline patch. The reducer function takes the current
   * `TimelineItem[]` (for findIndex and similar O(n) lookups during
   * the reducer's logic) and returns a `TimelineDelta` describing
   * what to change in the family + order atoms. The consumer
   * (chat-store) applies the delta to the underlying atoms, so a
   * streaming `message_update` is O(1) on the family write and
   * does NOT change the order atom, which means Virtuoso's `data`
   * prop is stable across streaming tokens and `TimelineItemRenderer`
   * for unchanged ids does NOT re-render.
   *
   * If `undefined`, the event does not touch the timeline (e.g.
   * `agent_start`, `auto_retry_start` without a timeline change).
   */
  timeline?: (prev: TimelineItem[]) => TimelineDelta | null;
}

/**
 * Result of a timeline reducer. Apply with `chatStore.set`:
 *
 *   - `setItems`: upsert items by id. The consumer writes to the
 *     `timelineItemAtomFamily(id)` atom for each entry. O(1) per
 *     id; only subscribers of those specific ids re-render.
 *   - `removeItems`: remove items from the family. The consumer
 *     also drops them from the order if present.
 *   - `order`: the new full order array. Only set on insert/remove.
 *     O(n) write, but `n` is the timeline length (small) and the
 *     write is amortized over many streaming tokens that don't
 *     touch this field.
 *
 * If both `setItems`/`removeItems` and `order` are present, the
 * consumer applies them atomically (order last, so any re-render
 * triggered by setItems sees a consistent order).
 */
export interface TimelineDelta {
  order?: string[];
  removeItems?: string[];
  setItems?: Array<{ id: string; item: TimelineItem }>;
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
              if (exists) return null;
              // `lastMsg.errorMessage` is typed as optional, but the
              // outer `if (lastMsg?.role === "assistant" && lastMsg?.errorMessage)`
              // guard above ensures it's present here. The non-null
              // assertion is a TS-level affordance for that.
              const errorText = lastMsg.errorMessage as string;
              const newItem: AssistantMessageItem = {
                id: `error-${Date.now()}`,
                kind: "assistant_message",
                pending: false,
                text: errorText,
              };
              return {
                order: [...prev.map((i) => i.id!), newItem.id],
                setItems: [{ id: newItem.id, item: newItem }],
              };
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
          const retryIds = prev
            .filter((i) => i.kind === "retry")
            .map((i) => i.id);
          const newItem: TimelineItem = {
            id: `retry-${Date.now()}`,
            kind: "retry",
            text: `Retry ${ev.attempt}/${ev.maxAttempts} — ${ev.errorMessage} (${ev.delayMs}ms)`,
          };
          return {
            removeItems: retryIds,
            order: [
              ...prev.filter((i) => i.kind !== "retry").map((i) => i.id),
              newItem.id,
            ],
            setItems: [{ id: newItem.id, item: newItem }],
          };
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
          timeline: (prev) => {
            const retryIds = prev
              .filter((i) => i.kind === "retry")
              .map((i) => i.id);
            return {
              removeItems: retryIds,
              order: prev.filter((i) => i.kind !== "retry").map((i) => i.id),
            };
          },
        };
      }
      return {
        status: "idle",
        timeline: (prev) => {
          const filtered = prev.filter((i) => i.kind !== "retry");
          const retryIds = prev
            .filter((i) => i.kind === "retry")
            .map((i) => i.id);
          if (ev.finalError) {
            const newItem: TimelineItem = {
              id: `error-${Date.now()}`,
              kind: "assistant_message",
              pending: false,
              text: ev.finalError,
            };
            return {
              removeItems: retryIds,
              order: [...filtered.map((i) => i.id), newItem.id],
              setItems: [{ id: newItem.id, item: newItem }],
            };
          }
          return {
            removeItems: retryIds,
            order: filtered.map((i) => i.id),
          };
        },
      };
    }

    case "compaction_end": {
      return {
        status: "idle",
        timeline: (prev) => {
          // Add a synthetic compaction divider when compaction succeeded
          if (!event.aborted && (event as any).result) {
            const newItem: TimelineItem = {
              id: `compaction-${Date.now()}`,
              kind: "compaction" as const,
              label: "Context compacted",
            } as TimelineItem; // cast because 'compaction' is not in the base type yet
            return {
              order: [...prev.map((i) => i.id!), newItem.id],
              setItems: [{ id: newItem.id, item: newItem }],
            };
          }
          return null;
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
          if (idx === -1) {
            // Message arrived before snapshot — materialise the final form
            if (!finalText && !finalThinking && !hasToolCalls) return null;
            const newItem: TimelineItem = {
              id: event.id as string,
              kind: "assistant_message",
              pending: false,
              text: finalText,
              thinking: finalThinking,
            };
            return {
              order: [...prev.map((i) => i.id!), newItem.id],
              setItems: [{ id: newItem.id, item: newItem }],
            };
          }
          // Don't remove assistant messages that contain tool calls — the
          // thinking/text belongs alongside the tool cards. If it's truly
          // empty (no text, no thinking, no tool calls), then drop it.
          if (!finalText && !finalThinking && !hasToolCalls) {
            return {
              removeItems: [event.id as string],
              order: prev.filter((_, i) => i !== idx).map((i) => i.id),
            };
          }
          const updated: AssistantMessageItem = {
            ...(prev[idx] as AssistantMessageItem),
            pending: false,
            text: finalText,
            thinking: finalThinking,
          };
          return {
            setItems: [{ id: event.id as string, item: updated }],
          };
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
              // Replace the optimistic entry. The bug here was: we
              // nulled the optimistic id's family entry (removeItems)
              // and added the server's id (setItems), but we did
              // NOT update the order to swap the ids. The order
              // still referenced the now-null optimistic id, and the
              // TimelineItemRenderer returned null on its next
              // render — the user message disappeared from the
              // chat list.
              //
              // Fix: include a new order array that swaps the
              // optimistic id for the server's id. We do this
              // explicitly (instead of `removeItems: [opt]` +
              // `order: [...].push(server)`) so the order
              // replacement is atomic — both ids swap in one
              // setTimelineOrder call.
              const newOrder = prev.map((i) =>
                i.id === prev[optimisticIdx]!.id ? newItem.id : i.id,
              );
              return {
                order: newOrder,
                setItems: [{ id: newItem.id, item: newItem }],
                removeItems: [prev[optimisticIdx]!.id],
              };
            }
            return {
              order: [...prev.map((i) => i.id!), newItem.id],
              setItems: [{ id: newItem.id, item: newItem }],
            };
          },
        };
      }
      if (msg.role !== "toolResult") {
        return {
          status: "streaming",
          timeline: (prev) => {
            const newItem: TimelineItem = {
              id: event.id as string,
              kind: "assistant_message",
              pending: true,
              text: "",
            };
            return {
              order: [...prev.map((i) => i.id!), newItem.id],
              setItems: [{ id: newItem.id, item: newItem }],
            };
          },
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

          // Build the setItems array. Streaming text into an existing
          // message is the hot path — O(1) on the family atom, no
          // change to the order atom (so Virtuoso's data prop is
          // stable across streaming tokens), and only the
          // TimelineItemRenderer for this specific id re-renders.
          const setItems: Array<{ id: string; item: TimelineItem }> = [];
          let order: string[] | undefined;

          if (idx === -1) {
            // Message arrived before snapshot — materialise it now
            const msg = event.message as any;
            if (msg.role !== "assistant") return null;
            const newItem: TimelineItem = {
              id: event.id as string,
              kind: "assistant_message",
              pending: true,
              text: (event.delta || "").trimStart(),
              thinking: event.thinkingDelta
                ? event.thinkingDelta.trimStart()
                : undefined,
            } as TimelineItem;
            setItems.push({ id: newItem.id, item: newItem });
            order = [...prev.map((i) => i.id!), newItem.id];
          } else {
            const nextItem: AssistantMessageItem = {
              ...(prev[idx] as AssistantMessageItem),
              text:
                ((prev[idx] as AssistantMessageItem).text || "") +
                (isFirstDelta
                  ? (event.delta || "").trimStart()
                  : event.delta || ""),
              thinking: event.thinkingDelta
                ? ((prev[idx] as AssistantMessageItem).thinking || "") +
                  (isFirstThinking
                    ? event.thinkingDelta.trimStart()
                    : event.thinkingDelta)
                : (prev[idx] as AssistantMessageItem).thinking,
            };
            setItems.push({ id: event.id as string, item: nextItem });
          }

          // Extract tool calls from the partial assistant message and
          // materialise them as pending ToolItems so the user can watch
          // the agent construct the tool call in real time.
          const msg = event.message as any;
          const content: any[] | undefined = msg.content;
          if (content) {
            const toolCalls = content.filter((c) => c.type === "toolCall");
            for (const tc of toolCalls) {
              const existingIdx = prev.findIndex(
                (i) => i.kind === "tool" && i.id === tc.id,
              );
              if (existingIdx === -1) {
                const newTool: TimelineItem = {
                  args: safeParseArgs(tc.arguments),
                  id: tc.id,
                  isError: false,
                  kind: "tool",
                  name: tc.name,
                  status: "pending",
                };
                setItems.push({ id: newTool.id, item: newTool });
                if (!order) order = [...prev.map((i) => i.id!), newTool.id];
              } else {
                const updated: ToolItem = {
                  ...(prev[existingIdx] as ToolItem),
                  args: safeParseArgs(tc.arguments),
                };
                setItems.push({ id: tc.id, item: updated });
              }
            }
          }

          return { order, setItems };
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
          if (idx === -1) return null;
          const updated: ToolItem = {
            ...(prev[idx] as ToolItem),
            isError: event.isError,
            result: event.result,
            status: event.isError ? "error" : "completed",
          };
          return { setItems: [{ id: event.toolCallId, item: updated }] };
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
            const updated: ToolItem = {
              ...(prev[existingIdx] as ToolItem),
              args: event.args,
              status: "running",
            };
            return { setItems: [{ id: event.toolCallId, item: updated }] };
          }
          const newTool: TimelineItem = {
            args: event.args,
            id: event.toolCallId,
            isError: false,
            kind: "tool",
            name: event.toolName,
            status: "running",
          };
          return {
            order: [...prev.map((i) => i.id!), event.toolCallId],
            setItems: [{ id: event.toolCallId, item: newTool }],
          };
        },
      };
    }

    case "tool_execution_update": {
      return {
        timeline: (prev) => {
          const idx = prev.findIndex(
            (i) => i.kind === "tool" && i.id === event.toolCallId,
          );
          if (idx === -1) return null;
          const updated: ToolItem = {
            ...(prev[idx] as ToolItem),
            result: event.partialResult,
          };
          return { setItems: [{ id: event.toolCallId, item: updated }] };
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
