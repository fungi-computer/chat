import type { SessionSnapshot } from "@shiit/coding-agent/client";

import { atom } from "jotai";
import { atomFamily } from "jotai/utils";

import type { AgentStatus, TimelineItem } from "./types.js";

export const agentConnectedAtom = atom(false);
export const agentSessionIdAtom = atom<null | string>(null);

/**
 * Per-item timeline storage. `timelineItemAtomFamily(id)` is the
 * source of truth for each TimelineItem; updating one item is an
 * O(1) atom write that re-renders only the subscribers of that
 * specific id (typically a single TimelineItemRenderer). The old
 * `agentTimelineAtom: TimelineItem[]` forced every subscriber of
 * the timeline to re-render on every streaming `message_update`
 * because the whole 4.8MB array was being replaced.
 */
export const timelineItemAtomFamily = atomFamily((_id: string) =>
  atom<null | TimelineItem>(null),
);

/**
 * Timeline order. Only changes on insert/remove (message_start,
 * tool_result insert, compaction start/end, message cancel). The
 * streaming `message_update` path does NOT touch this atom, so
 * Virtuoso's data prop is stable across streaming tokens.
 */
export const timelineOrderAtom = atom<string[]>([]);

// TimelineItem is the canonical array shape for the chat timeline.
// It is NOT exposed as a single derived atom here because doing so
// would create an O(n²) cost on every per-item family write (the
// derived atom re-runs for each of N family writes, each iterating
// the whole order). Consumers that need the array shape should
// compute it via useMemo from `timelineOrderAtom` +
// `timelineItemAtomFamily` — see Dashboard.tsx and
// FileOpInvalidator.tsx for the pattern. The chat list
// (ChatPanel) uses the order atom directly and resolves items
// inside TimelineItemRenderer, so the chat list is O(1) per
// streaming token.
//
// If you need a fresh array, do:
//
//   const order = useAtomValue(timelineOrderAtom, { store: chatStore });
//   const items = useMemo(
//     () => order.flatMap((id) => {
//       const item = chatStore.get(timelineItemAtomFamily(id));
//       return item ? [item] : [];
//     }),
//     [order, /* but you can't subscribe to all family atoms easily */],
//   );
//
// ...but note this only re-computes when `order` changes, NOT on
// per-item family writes. If you need both, accept the O(n) cost
// and use useMemo([order, all-items-trigger]).
//
// (Kept this comment block because the absence of a derived atom
// is the whole point of the atomFamily refactor — see the
// commit message of ee16ab4f / 7ec2a3cd.)

export const agentStatusAtom = atom<AgentStatus>("idle");
export const agentSnapshotAtom = atom<null | SessionSnapshot>(null);
export const agentErrorAtom = atom<null | string>(null);

// Context usage from snapshot (tokens, contextWindow, percent)
export const agentContextUsageAtom = atom<{
  contextWindow: number;
  percent: null | number;
  tokens: null | number;
} | null>(null);

// Accumulated cost from all assistant messages
export const agentCostAtom = atom<null | number>(null);

// Active model info (name, provider, etc.)
export const agentModelAtom = atom<null | { name: string; provider: string }>(
  null,
);

// Re-export TimelineDelta for consumers (chat-store) that need to
// type-check the result of `TimelinePatch.timeline(prev)`.
export type { TimelineDelta } from "./timeline-interpreter.js";

// TimelinePatch is defined in timeline-interpreter.ts and re-exported
// from there. We don't re-define it here to avoid a duplicate-export
// collision. TimelineDelta (the shape returned by the reducer) is
// also re-exported from timeline-interpreter.ts.
