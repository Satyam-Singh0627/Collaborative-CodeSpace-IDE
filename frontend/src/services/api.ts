import type { User, Room, ProjectFile, ChatMessage, ExecutionResult, AIToolCall } from '../types';
import { API_BASE } from '../config';

function getAuthHeaders(token?: string | null): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  const activeToken = token || localStorage.getItem('codespace_token');
  if (activeToken) {
    headers['Authorization'] = `Bearer ${activeToken}`;
  }
  return headers;
}

export const api = {
  // Auth API
  async register(name: string, email: string, password: string): Promise<{ access_token: string; user: User }> {
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Registration failed');
      }
      return res.json();
    } catch (err: unknown) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Backend server is temporarily unreachable. Please ensure the backend is running.');
      }
      throw err;
    }
  },

  async login(email: string, password: string): Promise<{ access_token: string; user: User }> {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Login failed');
      }
      return res.json();
    } catch (err: unknown) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Backend server is temporarily unreachable. Please ensure the backend is running.');
      }
      throw err;
    }
  },

  async getMe(token?: string): Promise<User> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: getAuthHeaders(token),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error('Unauthorized');
      }
      return res.json();
    } catch (err: unknown) {
      if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('fetch'))) {
        throw new Error('Backend server is temporarily unreachable.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  },

  // Rooms API — language removed from create (auto-detected per file)
  async createRoom(name: string): Promise<Room> {
    const res = await fetch(`${API_BASE}/rooms`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to create room');
    }
    return res.json();
  },

  async getRoom(roomCode: string): Promise<Room> {
    const res = await fetch(`${API_BASE}/rooms/${encodeURIComponent(roomCode)}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Room not found');
    }
    return res.json();
  },

  async joinRoom(roomCode: string): Promise<Room> {
    const res = await fetch(`${API_BASE}/rooms/${encodeURIComponent(roomCode)}/join`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to join room');
    }
    return res.json();
  },

  // File Management
  async getFiles(roomCode: string): Promise<ProjectFile[]> {
    const res = await fetch(`${API_BASE}/rooms/${encodeURIComponent(roomCode)}/files`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      throw new Error('Failed to load files');
    }
    return res.json();
  },

  async createFile(roomCode: string, name: string, language?: string, content = ''): Promise<ProjectFile> {
    const res = await fetch(`${API_BASE}/rooms/${encodeURIComponent(roomCode)}/files`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, language: language || undefined, content }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to create file');
    }
    return res.json();
  },

  async updateFile(roomCode: string, fileId: string, updates: { name?: string; content?: string; language?: string; version?: number }): Promise<ProjectFile> {
    const res = await fetch(`${API_BASE}/rooms/${encodeURIComponent(roomCode)}/files/${fileId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to update file');
    }
    return res.json();
  },

  async deleteFile(roomCode: string, fileId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/rooms/${encodeURIComponent(roomCode)}/files/${fileId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to delete file');
    }
  },

  async getMessages(roomCode: string): Promise<ChatMessage[]> {
    const res = await fetch(`${API_BASE}/rooms/${encodeURIComponent(roomCode)}/messages`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      throw new Error('Failed to load messages');
    }
    return res.json();
  },

  // Code Execution — multi-file support
  async executeCode(
    language: string,
    files: { name: string; content: string }[],
    entryFile: string,
    stdin = '',
  ): Promise<ExecutionResult> {
    const res = await fetch(`${API_BASE}/execute`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ language, files, entry_file: entryFile, stdin }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Execution request failed');
    }
    return res.json();
  },

  // Supported languages list
  async getLanguages(): Promise<{ key: string; name: string; ext: string; entry_default: string }[]> {
    const res = await fetch(`${API_BASE}/execute/languages`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  },

  // AI Assistant — quick actions + free-form chat
  async askAI(
    action: string,
    code: string,
    language = 'python',
    prompt = '',
    errorOutput = '',
    fileName = '',
    projectFiles: string[] = [],
    chatHistory: { role: string; content: string }[] = [],
  ): Promise<{ action: string; result: string; model_used: string }> {
    const res = await fetch(`${API_BASE}/ai`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        action,
        code,
        language,
        prompt,
        error_output: errorOutput,
        file_name: fileName || undefined,
        project_files: projectFiles.length > 0 ? projectFiles : undefined,
        chat_history: chatHistory.length > 0 ? chatHistory : undefined,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'AI Assistant service unavailable');
    }
    return res.json();
  },

  // AI Agent — tool-use agentic mode
  async askAIAgent(
    prompt: string,
    roomCode: string,
    activeFile?: string,
    chatHistory: { role: string; content: string }[] = [],
  ): Promise<{
    steps: { thought?: string; tool_calls: AIToolCall[]; response?: string }[];
    final_response: string;
    model_used: string;
    files_modified: string[];
  }> {
    const res = await fetch(`${API_BASE}/ai/agent`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        prompt,
        room_code: roomCode,
        active_file: activeFile || undefined,
        chat_history: chatHistory.length > 0 ? chatHistory : undefined,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'AI Agent service unavailable');
    }
    return res.json();
  },

  // AI inline code completion
  async aiComplete(
    codeBefore: string,
    codeAfter: string,
    language: string,
    fileName: string,
  ): Promise<{ completion: string; model_used: string }> {
    const res = await fetch(`${API_BASE}/ai/complete`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ code_before: codeBefore, code_after: codeAfter, language, file_name: fileName }),
    });
    if (!res.ok) return { completion: '', model_used: 'none' };
    return res.json();
  },
};
