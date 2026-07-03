import type {
  AgentSessionSyncEvent,
  SessionSnapshot,
} from "@shiit/coding-agent/client";

import {
  AgentSessionClient,
  WebSocketClientTransport,
} from "@shiit/coding-agent/client";

export interface AgentConnectionOptions {
  buildWsUrl: (sessionId: string) => string;
  onBrowserCommand?: (
    command: string,
    args: string[],
  ) => Promise<{ error: null | string; ok: boolean; output: string }>;
}

export type ConnectionEvent =
  | { event: AgentSessionSyncEvent; type: "agentEvent" }
  | { patch: Partial<ConnectionState>; type: "state" };

export type ConnectionListener = (event: ConnectionEvent) => void;

export interface ConnectionState {
  connected: boolean;
  error: null | string;
  /**
   * The server's last-broadcast team version. PLAN-016 PR 3: the
   * server pushes `{ type: "version", version: N }` whenever a
   * team-scoped write happens (workspace attach/detach, project
   * create/delete). The chat compares this to its `lastSeenVersion`
   * to detect a stale view; if the server is ahead, the dashboard
   * re-fetches the assembled view via the agent DO's `getView`
   * action.
   */
  lastSeenVersion: number;
  sessionId: null | string;
  snapshot: null | SessionSnapshot;
}

export class AgentConnection {
  private browserWs: null | WebSocket = null;
  private client: AgentSessionClient | null = null;
  private disposed = false;
  private isConnecting = false;
  private reconnectTimer: null | ReturnType<typeof setTimeout> = null;
  private rejectSnapshot: ((err: Error) => void) | null = null;
  private state: ConnectionState = {
    connected: false,
    error: null,
    lastSeenVersion: 0,
    sessionId: null,
    snapshot: null,
  };
  private transport: null | WebSocketClientTransport = null;
  private unsubscribes: (() => void)[] = [];

  constructor(
    private readonly options: AgentConnectionOptions,
    private readonly listener: ConnectionListener,
  ) {}

  abort(): void {
    if (!this.client || !this.state.sessionId || !this.state.connected) {
      console.error("[AgentConnection] Cannot abort: not connected");
      return;
    }
    this.client.command(this.state.sessionId, { type: "abort" });
  }

  async connect(delay = 1000, maxDelay = 30000): Promise<void> {
    if (this.disposed || this.isConnecting || this.client) return;
    this.isConnecting = true;
    this.emitState({ error: null });

    try {
      await this.doConnect(delay, maxDelay);
    } finally {
      this.isConnecting = false;
    }
  }

  connectBrowser(sessionId: string): void {
    if (this.browserWs) return;

    const browserUrl = this.options
      .buildWsUrl(sessionId)
      .replace(/\/ws\//, "/ws-browser/");

    this.browserWs = new WebSocket(browserUrl);

    this.browserWs.onopen = () => {
      console.log("[BrowserWS] Connected");
    };

    this.browserWs.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "browser_command" && this.options.onBrowserCommand) {
          const result = await this.options.onBrowserCommand(
            msg.command,
            msg.args,
          );
          this.browserWs?.send(
            JSON.stringify({
              requestId: msg.requestId,
              result,
              type: "browser_result",
            }),
          );
        }
      } catch (err) {
        console.error("[BrowserWS] Failed to handle message", err);
      }
    };

    this.browserWs.onclose = () => {
      console.log("[BrowserWS] Disconnected");
      this.browserWs = null;
      // If we're already disposed (e.g. the parent called
      // disconnect()), don't try to reconnect — the new AgentConnection
      // has its own browserWs. Without this guard, the old connection's
      // reconnect would race with the new one and the server would
      // see two browser-side clients for the same agent.
      if (this.disposed) return;
      setTimeout(() => this.connectBrowser(sessionId), 3000);
    };

    this.browserWs.onerror = (err) => {
      console.error("[BrowserWS] Error", err);
    };
  }

  disconnect(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    // Close the browser WS if we ever opened one. Without this the
    // WebSocket stays open until the server times it out, and the
    // onclose handler then tries to reconnect with the stale sessionId
    // (see onclose below for the disposed check). Disposed gates that
    // reconnect, but closing here is the right place to actually
    // release the resource.
    this.browserWs?.close();
    this.browserWs = null;
    this.transport?.disconnect();
    this.cleanup();
    this.emitState({ connected: false, error: null, sessionId: null });
  }

  getClient(): AgentSessionClient | null {
    return this.client;
  }

  getSessionId(): null | string {
    return this.state.sessionId;
  }

  getState(): ConnectionState {
    return { ...this.state };
  }

  send(text: string): void {
    if (!this.client || !this.state.sessionId || !this.state.connected) {
      console.error("[AgentConnection] Cannot send prompt: not connected");
      return;
    }
    this.client.command(this.state.sessionId, { text, type: "prompt" });
  }

  compact(): void {
    if (!this.client || !this.state.sessionId || !this.state.connected) {
      console.error("[AgentConnection] Cannot compact: not connected");
      return;
    }
    this.client.command(this.state.sessionId, { type: "compact" });
  }

  setModel(modelId: string, provider?: string): void {
    if (!this.client || !this.state.sessionId || !this.state.connected) {
      console.error("[AgentConnection] Cannot set model: not connected");
      return;
    }
    this.client.command(this.state.sessionId, {
      modelId,
      provider,
      type: "set_model",
    });
  }

  private cleanup(): void {
    for (const unsub of this.unsubscribes) unsub();
    this.unsubscribes = [];
    this.client = null;
    this.transport = null;
    this.state.sessionId = null;
    this.state.snapshot = null;
    this.rejectSnapshot = null;
  }

  private async doConnect(delay: number, maxDelay: number): Promise<void> {
    try {
      // Generate a temporary session ID for WS URL construction.
      // The actual agent session ID comes from the server's welcome message.
      const tempSessionId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      const wsUrl = this.options.buildWsUrl(tempSessionId);

      this.transport = new WebSocketClientTransport({ url: wsUrl });
      this.client = new AgentSessionClient(this.transport);

      // Register close handler BEFORE connecting so we catch drops during
      // the handshake or snapshot wait.
      this.transport.onClose(() => {
        if (this.rejectSnapshot) {
          this.rejectSnapshot(new Error("Connection closed"));
          this.rejectSnapshot = null;
        }
        this.emitState({ connected: false, sessionId: null });
        this.cleanup();
        this.scheduleReconnect(delay, maxDelay);
      });

      // Session DO auto-creates an agent session on WebSocket connect and
      // sends welcome + snapshot unprompted. Wait for both.
      let resolveSnapshot: (snapshot: SessionSnapshot) => void;
      let rejectSnapshot: (err: Error) => void;
      const snapshotPromise = new Promise<SessionSnapshot>(
        (resolve, reject) => {
          resolveSnapshot = resolve;
          rejectSnapshot = reject;
          this.rejectSnapshot = reject;
        },
      );
      const timeout = setTimeout(() => {
        rejectSnapshot(new Error("Timeout waiting for session snapshot"));
      }, 10000);

      this.transport.onMessage((data: any) => {
        if (data.type === "welcome" && data.sessionId) {
          this.state.sessionId = data.sessionId;
          this.emitState({ sessionId: data.sessionId });
        }
        if (data.type === "snapshot" && data.sessionId) {
          clearTimeout(timeout);
          this.rejectSnapshot = null;
          const msgCount = data.data?.messages?.length ?? 0;
          console.log(
            `[AgentConnection] Received snapshot for ${data.sessionId}: ${msgCount} messages`,
          );
          resolveSnapshot(data.data);
        }
        if (data.type === "limit_reached") {
          // Page-specific handling — listener can react to this
        }
        if (data.type === "version" && typeof data.version === "number") {
          // PLAN-016 PR 3: server pushed a version-bump event. The
          // dashboard's `lastSeenVersion` advances; if the server is
          // ahead, the dashboard re-fetches the assembled view via
          // the agent DO's `getView` action (HTTP, not via this
          // WebSocket — the assembled view is large and only the
          // projection re-runs are cheap).
          if (data.version > this.state.lastSeenVersion) {
            this.state.lastSeenVersion = data.version;
            this.emitState({ lastSeenVersion: data.version });
          }
        }
      });

      await this.client.connect();
      this.emitState({ connected: true });

      const snapshot = await snapshotPromise;
      this.state.snapshot = snapshot;
      this.emitState({ snapshot });

      // Subscribe to events for the server-created session
      const unsub = this.client.subscribeSession(
        this.state.sessionId!,
        (event: AgentSessionSyncEvent) => {
          this.listener({ event, type: "agentEvent" });
        },
      );
      this.unsubscribes.push(unsub);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      this.emitState({ connected: false, error: message });
      this.cleanup();
      this.scheduleReconnect(Math.min(delay * 2, maxDelay), maxDelay);
    }
  }

  private emitState(patch: Partial<ConnectionState>): void {
    this.state = { ...this.state, ...patch };
    this.listener({ patch, type: "state" });
  }

  private scheduleReconnect(delay: number, maxDelay: number): void {
    if (this.disposed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect(delay, maxDelay);
    }, delay);
  }
}
