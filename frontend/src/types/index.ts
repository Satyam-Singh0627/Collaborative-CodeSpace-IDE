export interface User {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface RoomMember {
  user_id: string;
  name: string;
  email: string;
  role: string;
  joined_at: string;
}

export interface Room {
  id: string;
  room_code: string;
  name: string;
  owner_id: string;
  created_at: string;
  member_count: number;
  members: RoomMember[];
}

export interface ProjectFile {
  id: string;
  room_id: string;
  name: string;
  language: string;
  content: string;
  version: number;
  updated_at: string;
  isLocal?: boolean;
  unsaved?: boolean;
  fileHandle?: any;
}

export type SyncStatus = 'idle' | 'syncing' | 'saved' | 'error';

export interface ChatMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  message: string;
  timestamp: string;
}

export interface OnlineUser {
  user_id: string;
  name: string;
}

export interface CursorPosition {
  user_id: string;
  user_name: string;
  file_id: string;
  cursor: {
    lineNumber: number;
    column: number;
  };
}

export interface ExecutionResult {
  status: 'idle' | 'running' | 'success' | 'error' | 'timeout' | 'compile_error';
  output: string;
  execution_time?: number;
  runtime_provider?: string;
}

export interface AIChatTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  modelUsed?: string;
  action?: string;
  isError?: boolean;
  toolCalls?: AIToolCall[];
  filesModified?: string[];
}

export interface AIToolCall {
  tool: string;
  args: Record<string, unknown>;
  result?: string;
}

export interface LanguageInfo {
  key: string;
  name: string;
  ext: string;
  monacoLang: string;
  entry_default: string;
}
