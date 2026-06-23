export type AgentStatus =
  | "idle"
  | "sending"
  | "thinking"
  | "retrying"
  | "streaming"
  | "compacting";

export interface AssistantMessageItem {
  id: string;
  kind: "assistant_message";
  pending: boolean;
  text: string;
  thinking?: string;
}

export interface CompactionItem {
  id: string;
  kind: "compaction";
  label: string;
}

export interface RetryItem {
  id: string;
  kind: "retry";
  text: string;
}

export type TimelineItem =
  | AssistantMessageItem
  | CompactionItem
  | RetryItem
  | ToolItem
  | UserMessageItem;

export interface ToolItem {
  args: unknown;
  id: string;
  isError: boolean;
  kind: "tool";
  name: string;
  result?: unknown;
  status: "completed" | "error" | "pending" | "running";
}

export interface UserMessageItem {
  id: string;
  kind: "user_message";
  text: string;
}
