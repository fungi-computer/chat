import type { SessionSnapshot } from "@shiit/coding-agent/client";

import { atom } from "jotai";

import type { AgentStatus, TimelineItem } from "./types.js";

export const agentConnectedAtom = atom(false);
export const agentSessionIdAtom = atom<null | string>(null);
export const agentTimelineAtom = atom<TimelineItem[]>([]);
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
