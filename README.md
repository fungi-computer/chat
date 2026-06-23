# @fungi.computer/chat

React + Jotai client for `@shiit/coding-agent`. Renders the agent timeline (messages, tool calls, file ops) and exposes a transport-agnostic store you can wire to any `AgentSessionServer`.

## Install

```bash
npm install @fungi.computer/chat
```

`react`, `react-dom`, and `@shiit/coding-agent` are peer or runtime deps — install them too.

## Usage

```tsx
import {
  ChatInput,
  ChatMessage,
  MarkdownRenderer,
  chatStore,
  connectToSession,
  sendAbort,
} from "@fungi.computer/chat";
import {
  AgentSessionClient,
  WebSocketClientTransport,
} from "@shiit/coding-agent/client";

const client = new AgentSessionClient(
  new WebSocketClientTransport({ url: "wss://api.example.com/agent" }),
);

await connectToSession(client, { sessionId: "abc123" });

// Render the timeline
function Timeline() {
  const messages = useAtomValue(chatStore.timeline);
  return messages.map((m) => <ChatMessage key={m.id} message={m} />);
}
```

## Exports

### Components

| Export             | Purpose                                                |
| ------------------ | ------------------------------------------------------ |
| `ChatInput`        | Message input + send. Handles IME, paste, attachments. |
| `ChatMessage`      | Renders a single message (user / assistant / tool).    |
| `MarkdownRenderer` | GFM markdown with syntax highlighting.                 |

### Themes

| Export             | Purpose                      |
| ------------------ | ---------------------------- |
| `vanillaMilkshake` | Prism theme for code blocks. |

### Store

Re-exported from `./store`:

| Export               | Purpose                                         |
| -------------------- | ----------------------------------------------- |
| `chatStore`          | Jotai atoms for the timeline, status, input.    |
| `connectToSession`   | Wire a client to the store, start streaming.    |
| `disconnectSession`  | Tear down the connection.                       |
| `sendAbort`          | Cancel the current run.                         |
| `sendCompact`        | Request a context-compaction pass.              |
| `agentConnectedAtom` | Read-only: is the client connected?             |
| `agentSessionIdAtom` | Read-only: current session id.                  |
| `agentStatusAtom`    | Read-only: `idle` \| `running` \| `compacting`. |
| `agentTimelineAtom`  | Read-only: full timeline array.                 |

## Related

- [`@shiit/coding-agent`](https://github.com/fungi-computer/coding-agent) — the agent runtime this client talks to. Client transports (`WebSocketClientTransport`, `InMemoryClientTransport`) live in the `@shiit/coding-agent/client` subpath export.
- [`fungi.computer`](https://fungi.computer) — the multi-tenant product that uses this client.

## License

MIT
