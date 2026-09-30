import type { OnlineUser, ProjectFile, ChatMessage } from '../types';
import { getWebSocketUrl } from '../config';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface WebSocketCallbacks {
  onStatusChange?: (status: ConnectionStatus) => void;
  onPresenceUpdate?: (users: OnlineUser[], event?: string, user?: { id: string; name: string }) => void;
  onCodeChange?: (data: { file_id: string; content: string; version: number; sender_id: string; sender_name: string; event_id: string }) => void;
  onVersionAck?: (data: { file_id: string; version: number; event_id: string }) => void;
  onVersionConflict?: (data: { file_id: string; server_version: number; client_version: number }) => void;
  onCursorMove?: (data: { file_id: string; sender_id: string; sender_name: string; cursor: { lineNumber: number; column: number }; selection?: unknown }) => void;
  onChatMessage?: (data: { id: string; sender_id: string; sender_name: string; message: string; timestamp: string }) => void;
  onFileEvent?: (data: { type: string; file?: unknown; sender_id?: string; sender_name?: string }) => void;
  onResync?: (data: { files: ProjectFile[]; messages: ChatMessage[]; online_users: OnlineUser[] }) => void;
  onSignal?: (data: { sender_id: string; sender_name: string; signal: unknown }) => void;
  onExecutionBroadcast?: (data: { sender_id: string; sender_name: string; output: string; status: string }) => void;
}

export class CodeSpaceWebSocket {
  private socket: WebSocket | null = null;
  private roomCode: string;
  private token: string;
  private callbacks: WebSocketCallbacks;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: number | null = null;
  private pingInterval: number | null = null;
  private isExplicitDisconnect = false;
  private hasConnectedBefore = false;

  constructor(roomCode: string, token: string, callbacks: WebSocketCallbacks) {
    this.roomCode = roomCode.toUpperCase().trim();
    this.token = token;
    this.callbacks = callbacks;
  }

  private cleanupSocket() {
    this.cleanupTimers();
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
        this.socket.close();
      }
      this.socket = null;
    }
  }

  public connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.cleanupSocket();
    this.isExplicitDisconnect = false;
    this.callbacks.onStatusChange?.('connecting');

    // Build environment-aware WS URL
    const wsUrl = getWebSocketUrl(this.roomCode, this.token);

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        const wasReconnect = this.hasConnectedBefore;
        this.reconnectAttempts = 0;
        this.hasConnectedBefore = true;
        this.callbacks.onStatusChange?.('connected');

        // On reconnect, request full state resynchronization
        if (wasReconnect) {
          this.send({ type: 'resync' });
        }

        // Setup ping keep-alive
        this.pingInterval = window.setInterval(() => {
          if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type: 'ping' }));
          }
        }, 20000);
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      this.socket.onclose = () => {
        this.cleanupTimers();
        if (!this.isExplicitDisconnect) {
          this.attemptReconnect();
        } else {
          this.callbacks.onStatusChange?.('disconnected');
        }
      };

      this.socket.onerror = () => {
        // onclose will handle the state transition and reconnect
      };
    } catch {
      this.attemptReconnect();
    }
  }

  private handleMessage(data: { type: string; [key: string]: any }) {
    switch (data.type) {
      case 'presence_update':
      case 'room_connected':
        if (data.online_users) {
          this.callbacks.onPresenceUpdate?.(data.online_users, data.event, data.user);
        }
        break;

      case 'code_change':
        this.callbacks.onCodeChange?.({
          file_id: data.file_id,
          content: data.content,
          version: data.version ?? 0,
          sender_id: data.sender_id,
          sender_name: data.sender_name,
          event_id: data.event_id ?? '',
        });
        break;

      case 'version_ack':
        this.callbacks.onVersionAck?.({
          file_id: data.file_id,
          version: data.version,
          event_id: data.event_id,
        });
        break;

      case 'version_conflict':
        this.callbacks.onVersionConflict?.({
          file_id: data.file_id,
          server_version: data.server_version,
          client_version: data.client_version,
        });
        break;

      case 'cursor_move':
        this.callbacks.onCursorMove?.({
          file_id: data.file_id,
          sender_id: data.sender_id,
          sender_name: data.sender_name,
          cursor: data.cursor,
          selection: data.selection,
        });
        break;

      case 'chat_message':
        this.callbacks.onChatMessage?.({
          id: data.id,
          sender_id: data.sender_id,
          sender_name: data.sender_name,
          message: data.message,
          timestamp: data.timestamp,
        });
        break;

      case 'file_created':
      case 'file_deleted':
      case 'file_renamed':
        this.callbacks.onFileEvent?.(data);
        break;

      case 'resync':
        this.callbacks.onResync?.({
          files: data.files || [],
          messages: data.messages || [],
          online_users: data.online_users || [],
        });
        break;

      case 'signal':
        this.callbacks.onSignal?.({
          sender_id: data.sender_id,
          sender_name: data.sender_name,
          signal: data.signal,
        });
        break;

      case 'execution_broadcast':
        this.callbacks.onExecutionBroadcast?.({
          sender_id: data.sender_id,
          sender_name: data.sender_name,
          output: data.output,
          status: data.status,
        });
        break;

      case 'pong':
        // Keep-alive received
        break;
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.callbacks.onStatusChange?.('disconnected');
      return;
    }

    this.reconnectAttempts++;
    this.callbacks.onStatusChange?.('reconnecting');
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 15000);

    this.reconnectTimer = window.setTimeout(() => {
      this.connect();
    }, delay);
  }

  private cleanupTimers() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  public disconnect() {
    this.isExplicitDisconnect = true;
    this.cleanupSocket();
    this.callbacks.onStatusChange?.('disconnected');
  }

  // Outgoing senders
  public sendCodeChange(fileId: string, content: string, version: number) {
    this.send({
      type: 'code_change',
      file_id: fileId,
      content: content ?? '',
      version: version ?? 0,
    });
  }

  public sendCursorMove(fileId: string, cursor: { lineNumber: number; column: number }, selection?: unknown) {
    this.send({
      type: 'cursor_move',
      file_id: fileId,
      cursor,
      selection,
    });
  }

  public sendChatMessage(message: string) {
    this.send({
      type: 'chat_message',
      message,
    });
  }

  public sendFileEvent(type: 'file_created' | 'file_deleted' | 'file_renamed', fileData: unknown) {
    this.send({
      type,
      file: fileData,
    });
  }

  public sendSignal(targetUserId: string | null, signal: unknown) {
    this.send({
      type: 'signal',
      target_user_id: targetUserId,
      signal,
    });
  }

  public sendExecutionBroadcast(output: string, status: string) {
    this.send({
      type: 'execution_broadcast',
      output,
      status,
    });
  }

  public sendResync() {
    this.send({ type: 'resync' });
  }

  private send(data: unknown) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }
}
