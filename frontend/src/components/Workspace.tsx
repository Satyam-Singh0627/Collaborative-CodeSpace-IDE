import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Copy, Check, Play, Phone, PhoneOff, 
  ArrowLeft, RefreshCw, Radio, Code2, CloudOff, Cloud, Loader2,
  FolderDown, MessageSquare, AlertCircle, Sparkles
} from 'lucide-react';
import type { Room, ProjectFile, ChatMessage, OnlineUser, CursorPosition, ExecutionResult, SyncStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { CodeSpaceWebSocket } from '../services/websocket';
import type { ConnectionStatus } from '../services/websocket';
import { WebRTCService } from '../services/webrtc';
import type { PeerStream } from '../services/webrtc';
import { FileExplorer } from './FileExplorer';
import { EditorPanel } from './EditorPanel';
import { ChatPanel } from './ChatPanel';
import { AIAssistantPanel } from './AIAssistantPanel';
import { VideoCallPanel } from './VideoCallPanel';
import { OutputPanel } from './OutputPanel';
import { SUPPORTED_LANGUAGES, getLanguageFromFileName } from '../utils/languages';
import { openLocalFile, openLocalFolder, saveActiveFileLocally, saveProjectLocally } from '../utils/fileSystem';

interface WorkspaceProps {
  roomCode: string;
  onLeaveRoom: () => void;
}

export const Workspace: React.FC<WorkspaceProps> = ({ roomCode, onLeaveRoom }) => {
  const { user, token } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [openTabs, setOpenTabs] = useState<ProjectFile[]>([]);
  const [activeFile, setActiveFile] = useState<ProjectFile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [remoteCursors, setRemoteCursors] = useState<CursorPosition[]>([]);
  const [selectedText, setSelectedText] = useState('');
  const [lastError, setLastError] = useState('');
  const [stdin, setStdin] = useState('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  
  // Connection & UI states
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('connecting');
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState<'chat' | 'ai'>('ai');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Execution state
  const [execResult, setExecResult] = useState<ExecutionResult>({
    status: 'idle',
    output: '',
  });
  const [isRunning, setIsRunning] = useState(false);

  // Video call states
  const [inCall, setInCall] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<PeerStream[]>([]);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);

  // WebSocket & WebRTC refs
  const wsRef = useRef<CodeSpaceWebSocket | null>(null);
  const webrtcRef = useRef<WebRTCService | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const savingTimerRef = useRef<number | null>(null);

  // Map to remember local File System Access handles during active session
  const fileHandlesRef = useRef<Map<string, any>>(new Map());

  // Ref tracking latest monotonic file versions to avoid stale closures in debounced handlers
  const fileVersionsRef = useRef<Map<string, number>>(new Map());

  // Non-blocking toast notification for save actions
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast({ message, type });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 2500);
  }, []);

  // 1. Initial Load: Fetch room, files, messages
  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [roomData, filesData, messagesData] = await Promise.all([
        api.getRoom(roomCode),
        api.getFiles(roomCode),
        api.getMessages(roomCode),
      ]);

      setRoom(roomData);
      setFiles(filesData);
      filesData.forEach((f) => {
        fileVersionsRef.current.set(f.id, f.version || 1);
      });
      if (filesData.length > 0) {
        setActiveFile(filesData[0]);
        setOpenTabs([filesData[0]]);
      }
      setMessages(messagesData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load workspace.');
    } finally {
      setLoading(false);
    }
  }, [roomCode]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // 2. Initialize WebSocket & WebRTC
  useEffect(() => {
    if (!token || !user || loading) return;

    const ws = new CodeSpaceWebSocket(roomCode, token, {
      onStatusChange: (status) => {
        setConnStatus(status);
      },
      onPresenceUpdate: (users) => {
        setOnlineUsers(users);
      },
      onCodeChange: (data) => {
        // Ignore echo of our own edits to prevent cursor jumps and state conflicts
        if (user && data.sender_id === user.id) return;

        // Keep local version ref up to date
        fileVersionsRef.current.set(data.file_id, data.version);

        // Apply remote code change with monotonic version check
        setFiles((prev) =>
          prev.map((f) => {
            if (f.id === data.file_id) {
              if (data.version >= (f.version || 0)) {
                return { ...f, content: data.content, version: data.version, unsaved: false };
              }
              return f;
            }
            return f;
          })
        );
        setOpenTabs((prev) =>
          prev.map((f) => {
            if (f.id === data.file_id && data.version >= (f.version || 0)) {
              return { ...f, content: data.content, version: data.version, unsaved: false };
            }
            return f;
          })
        );
        setActiveFile((prev) => {
          if (prev && prev.id === data.file_id && data.version >= (prev.version || 0)) {
            return { ...prev, content: data.content, version: data.version, unsaved: false };
          }
          return prev;
        });
      },
      onVersionAck: (data) => {
        // Update local version ref and state after server acknowledges
        fileVersionsRef.current.set(data.file_id, data.version);
        setFiles((prev) =>
          prev.map((f) => (f.id === data.file_id ? { ...f, version: data.version, unsaved: false } : f))
        );
        setOpenTabs((prev) =>
          prev.map((f) => (f.id === data.file_id ? { ...f, version: data.version, unsaved: false } : f))
        );
        setActiveFile((prev) =>
          prev && prev.id === data.file_id ? { ...prev, version: data.version, unsaved: false } : prev
        );
        setSyncStatus('saved');
        if (savingTimerRef.current) clearTimeout(savingTimerRef.current);
        savingTimerRef.current = window.setTimeout(() => setSyncStatus('idle'), 2000);
      },
      onVersionConflict: (data) => {
        // Synchronize version pointer without clobbering active local changes
        if (data.server_version) {
          fileVersionsRef.current.set(data.file_id, data.server_version);
        }
      },
      onCursorMove: (data) => {
        setRemoteCursors((prev) => {
          const filtered = prev.filter((c) => c.user_id !== data.sender_id);
          return [
            ...filtered,
            {
              user_id: data.sender_id,
              user_name: data.sender_name,
              file_id: data.file_id,
              cursor: data.cursor,
            },
          ];
        });
      },
      onChatMessage: (data) => {
        setMessages((prev) => [...prev, data]);
      },
      onFileEvent: async () => {
        try {
          const refreshed = await api.getFiles(roomCode);
          setFiles((prev) => {
            return refreshed.map((fresh) => {
              const existing = prev.find((f) => f.id === fresh.id);
              if (existing && existing.unsaved) {
                return existing;
              }
              const currentV = fileVersionsRef.current.get(fresh.id) || 0;
              if (currentV > (fresh.version || 0)) {
                return existing || fresh;
              }
              fileVersionsRef.current.set(fresh.id, fresh.version || 0);
              return fresh;
            });
          });
          // Update open tabs with refreshed data
          setOpenTabs((prev) =>
            prev.map((tab) => {
              const fresh = refreshed.find((f) => f.id === tab.id);
              if (!fresh) return tab;
              if (tab.unsaved) return tab;
              const currentV = fileVersionsRef.current.get(tab.id) || 0;
              if (currentV > (fresh.version || 0)) return tab;
              return fresh;
            }).filter((tab) => refreshed.some((f) => f.id === tab.id))
          );
          // Update active file
          setActiveFile((prev) => {
            if (prev) {
              if (prev.unsaved) return prev;
              const fresh = refreshed.find((f) => f.id === prev.id);
              if (!fresh && refreshed.length > 0) return refreshed[0];
              const currentV = fileVersionsRef.current.get(prev.id) || 0;
              if (fresh && currentV > (fresh.version || 0)) return prev;
              return fresh || prev;
            }
            if (refreshed.length > 0) return refreshed[0];
            return null;
          });
        } catch {}
      },
      onResync: (data) => {
        // Full state resynchronization on reconnect
        setFiles((prev) => {
          return data.files.map((fresh: ProjectFile) => {
            const existing = prev.find((f) => f.id === fresh.id);
            if (existing && existing.unsaved) {
              return existing;
            }
            const currentV = fileVersionsRef.current.get(fresh.id) || 0;
            if (currentV > (fresh.version || 0)) {
              return existing || fresh;
            }
            fileVersionsRef.current.set(fresh.id, fresh.version || 0);
            return fresh;
          });
        });
        setMessages(data.messages);
        setOnlineUsers(data.online_users);
        // Update open tabs and active file
        setOpenTabs((prev) => {
          const updated = prev.map((tab) => {
            const fresh = data.files.find((f: ProjectFile) => f.id === tab.id);
            if (!fresh) return tab;
            if (tab.unsaved) return tab;
            const currentV = fileVersionsRef.current.get(tab.id) || 0;
            if (currentV > (fresh.version || 0)) return tab;
            return fresh;
          }).filter((tab) => data.files.some((f: ProjectFile) => f.id === tab.id));
          if (updated.length === 0 && data.files.length > 0) {
            return [data.files[0]];
          }
          return updated;
        });
        setActiveFile((prev) => {
          if (prev) {
            if (prev.unsaved) return prev;
            const fresh = data.files.find((f: ProjectFile) => f.id === prev.id);
            const currentV = fileVersionsRef.current.get(prev.id) || 0;
            if (fresh && currentV > (fresh.version || 0)) return prev;
            if (fresh) return fresh;
          }
          return data.files.length > 0 ? data.files[0] : null;
        });
      },
      onSignal: (data) => {
        if (webrtcRef.current) {
          webrtcRef.current.handleSignal(data.sender_id, data.sender_name, data.signal);
        }
      },
      onExecutionBroadcast: (data) => {
        setExecResult({
          status: data.status as ExecutionResult['status'],
          output: `[Broadcast from ${data.sender_name}]:\n${data.output}`,
        });
      },
    });

    ws.connect();
    wsRef.current = ws;

    const rtc = new WebRTCService(
      ws,
      user.id,
      user.name || 'Developer',
      (streams) => {
        setRemoteStreams(streams);
      }
    );
    webrtcRef.current = rtc;

    return () => {
      if (webrtcRef.current) {
        webrtcRef.current.leaveCall();
      }
      ws.disconnect();
    };
  }, [roomCode, token, user, loading]);

  // Code Execution Handler — sends all project files for multi-file project support
  const handleRunCode = async () => {
    if (!activeFile) return;
    setIsRunning(true);
    setExecResult({ status: 'running', output: 'Compiling and executing in sandbox environment...' });

    try {
      const projectFiles = files
        .filter((f) => !f.name.endsWith('.md'))
        .map((f) => ({ name: f.name, content: f.content }));

      if (!projectFiles.some((f) => f.name === activeFile.name)) {
        projectFiles.unshift({ name: activeFile.name, content: activeFile.content });
      }

      const res = await api.executeCode(
        activeFile.language,
        projectFiles,
        activeFile.name,
        stdin,
      );
      setExecResult(res);
      setLastError(res.status === 'error' || res.status === 'compile_error' ? res.output : '');
      wsRef.current?.sendExecutionBroadcast(res.output, res.status);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Execution failed.';
      setExecResult({ status: 'error', output: msg });
      setLastError(msg);
    } finally {
      setIsRunning(false);
    }
  };

  // Keyboard shortcut: Ctrl/Cmd + Enter to Run
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!isRunning && activeFile) {
          handleRunCode();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRunning, activeFile, files, stdin]);

  // Select a file & open tab
  const handleSelectFile = (file: ProjectFile) => {
    setActiveFile(file);
    setOpenTabs((prev) => {
      if (!prev.some((f) => f.id === file.id)) {
        return [...prev, file];
      }
      return prev.map((f) => f.id === file.id ? file : f);
    });
  };

  // Close an open tab
  const handleCloseTab = (fileId: string) => {
    setOpenTabs((prev) => {
      const remaining = prev.filter((f) => f.id !== fileId);
      if (activeFile?.id === fileId && remaining.length > 0) {
        setActiveFile(remaining[remaining.length - 1]);
      } else if (remaining.length === 0) {
        setActiveFile(null);
      }
      return remaining;
    });
  };

  // Code Change Handler — debounced WebSocket send
  const handleCodeChange = useCallback((fileId: string, content: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, content, unsaved: true } : f))
    );
    setOpenTabs((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, content, unsaved: true } : f))
    );
    setActiveFile((prev) => (prev && prev.id === fileId ? { ...prev, content, unsaved: true } : prev));

    setSyncStatus('syncing');

    // Debounce WebSocket send at 100ms
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      // Get current version from ref, avoiding stale closures
      const version = fileVersionsRef.current.get(fileId) || 0;
      wsRef.current?.sendCodeChange(fileId, content, version);
    }, 100);
  }, []);

  // Save active file to local computer (File System Access API with download fallback)
  const handleSaveActiveFileLocally = useCallback(async (fileToSave?: ProjectFile) => {
    const target = fileToSave || activeFile;
    if (!target) return;

    const existingHandle = target.fileHandle || fileHandlesRef.current.get(target.id);
    const res = await saveActiveFileLocally({
      name: target.name,
      content: target.content,
      handle: existingHandle,
    });

    if (res.aborted) {
      return;
    }

    if (res.success) {
      if (res.handle) {
        fileHandlesRef.current.set(target.id, res.handle);
      }
      setFiles((prev) =>
        prev.map((f) =>
          f.id === target.id ? { ...f, unsaved: false, fileHandle: res.handle || f.fileHandle } : f
        )
      );
      setOpenTabs((prev) =>
        prev.map((f) =>
          f.id === target.id ? { ...f, unsaved: false, fileHandle: res.handle || f.fileHandle } : f
        )
      );
      setActiveFile((prev) =>
        prev && prev.id === target.id ? { ...prev, unsaved: false, fileHandle: res.handle || prev.fileHandle } : prev
      );
      showToast(res.message, 'success');
    } else {
      showToast(res.message, 'error');
    }
  }, [activeFile, showToast]);

  // Save complete project to local folder
  const handleSaveProjectLocally = useCallback(async () => {
    if (files.length === 0) {
      showToast('No project files to save', 'info');
      return;
    }

    const projectName = room?.name || 'Collaborative-CodeSpace';
    const res = await saveProjectLocally(files, projectName);

    if (res.aborted) {
      return;
    }

    if (res.success) {
      setFiles((prev) => prev.map((f) => ({ ...f, unsaved: false })));
      setOpenTabs((prev) => prev.map((f) => ({ ...f, unsaved: false })));
      setActiveFile((prev) => (prev ? { ...prev, unsaved: false } : prev));
      showToast(res.message, 'success');
    } else {
      showToast(res.message, 'error');
    }
  }, [files, room?.name, showToast]);

  // Global keyboard shortcut: Ctrl/Cmd + S to Save File locally (prevent browser webpage save)
  useEffect(() => {
    const handleGlobalSaveKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        e.stopPropagation();
        handleSaveActiveFileLocally();
      }
    };
    window.addEventListener('keydown', handleGlobalSaveKey, true);
    return () => window.removeEventListener('keydown', handleGlobalSaveKey, true);
  }, [handleSaveActiveFileLocally]);

  // Cursor Move Handler
  const handleCursorMove = useCallback((fileId: string, cursor: { lineNumber: number; column: number }) => {
    wsRef.current?.sendCursorMove(fileId, cursor);
  }, []);

  // Chat Message Handler
  const handleSendMessage = useCallback((msg: string) => {
    wsRef.current?.sendChatMessage(msg);
  }, []);

  // File Operations
  const handleCreateFile = async (name: string, _language: string) => {
    const lang = getLanguageFromFileName(name);
    const newFile = await api.createFile(roomCode, name, lang, '');
    setFiles((prev) => [...prev, newFile]);
    handleSelectFile(newFile);
    wsRef.current?.sendFileEvent('file_created', newFile);
  };

  const handleRenameFile = async (fileId: string, newName: string) => {
    const lang = getLanguageFromFileName(newName);
    const updated = await api.updateFile(roomCode, fileId, { name: newName, language: lang });
    setFiles((prev) => prev.map((f) => (f.id === fileId ? updated : f)));
    setOpenTabs((prev) => prev.map((f) => (f.id === fileId ? updated : f)));
    if (activeFile?.id === fileId) setActiveFile(updated);
    wsRef.current?.sendFileEvent('file_renamed', updated);
  };

  const handleDeleteFile = async (fileId: string) => {
    await api.deleteFile(roomCode, fileId);
    setFiles((prev) => {
      const remaining = prev.filter((f) => f.id !== fileId);
      if (activeFile?.id === fileId && remaining.length > 0) {
        setActiveFile(remaining[0]);
      }
      return remaining;
    });
    handleCloseTab(fileId);
    wsRef.current?.sendFileEvent('file_deleted', { fileId });
  };

  // AI Agent callback — refresh files after agent modifies them
  const handleAIFilesModified = useCallback(async () => {
    try {
      const refreshed = await api.getFiles(roomCode);
      setFiles(refreshed);
      setOpenTabs((prev) =>
        prev.map((tab) => {
          const fresh = refreshed.find((f) => f.id === tab.id);
          return fresh || tab;
        })
      );
      setActiveFile((prev) => {
        if (prev) {
          const fresh = refreshed.find((f) => f.id === prev.id);
          return fresh || prev;
        }
        return prev;
      });
    } catch {}
  }, [roomCode]);

  // Local File System Access API Integrations
  const handleOpenLocalFile = async () => {
    const localEntry = await openLocalFile();
    if (!localEntry) return;

    // Check if file already exists in files list
    const existing = files.find((f) => f.name === localEntry.name);
    if (existing) {
      handleSelectFile(existing);
      return;
    }

    try {
      const created = await api.createFile(roomCode, localEntry.name, localEntry.language, localEntry.content);
      const enhanced: ProjectFile = {
        ...created,
        isLocal: true,
        fileHandle: localEntry.handle,
      };
      if (localEntry.handle) {
        fileHandlesRef.current.set(enhanced.id, localEntry.handle);
      }
      setFiles((prev) => [...prev, enhanced]);
      handleSelectFile(enhanced);
      showToast(`Opened ${localEntry.name}`, 'info');
    } catch {
      // Offline fallback
      const offlineFile: ProjectFile = {
        id: localEntry.id,
        room_id: roomCode,
        name: localEntry.name,
        language: localEntry.language,
        content: localEntry.content,
        version: 1,
        updated_at: new Date().toISOString(),
        isLocal: true,
        fileHandle: localEntry.handle,
      };
      if (localEntry.handle) {
        fileHandlesRef.current.set(offlineFile.id, localEntry.handle);
      }
      setFiles((prev) => [...prev, offlineFile]);
      handleSelectFile(offlineFile);
      showToast(`Opened ${localEntry.name} (offline)`, 'info');
    }
  };

  const handleOpenLocalFolder = async () => {
    const result = await openLocalFolder();
    if (!result || result.files.length === 0) return;

    for (const f of result.files) {
      try {
        await api.createFile(roomCode, f.name, f.language, f.content);
      } catch {}
    }
    const refreshed = await api.getFiles(roomCode);
    setFiles(refreshed);
    if (refreshed.length > 0) {
      handleSelectFile(refreshed[0]);
    }
  };

  // Video Call Controls
  const handleJoinCall = async () => {
    if (!webrtcRef.current) return;
    try {
      const stream = await webrtcRef.current.startLocalMedia();
      setLocalStream(stream);
      setInCall(true);

      onlineUsers.forEach((peer) => {
        if (peer.user_id !== user?.id) {
          webrtcRef.current?.initiateCallWithUser(peer.user_id, peer.name);
        }
      });
    } catch (e) {
      console.error('Failed to start call:', e);
    }
  };

  const handleLeaveCall = () => {
    if (webrtcRef.current) {
      webrtcRef.current.leaveCall();
    }
    setLocalStream(null);
    setRemoteStreams([]);
    setInCall(false);
  };

  const handleToggleAudio = () => {
    if (webrtcRef.current) {
      const unmuted = webrtcRef.current.toggleAudio();
      setIsAudioMuted(!unmuted);
    }
  };

  const handleToggleVideo = () => {
    if (webrtcRef.current) {
      const active = webrtcRef.current.toggleVideo();
      setIsVideoMuted(!active);
    }
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Get detected language display name for badge
  const detectedLang = activeFile
    ? SUPPORTED_LANGUAGES.find((l) => l.key === getLanguageFromFileName(activeFile.name))
    : null;

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#111215] text-[#eceef2] min-h-0">
        <RefreshCw className="w-6 h-6 text-[#10b981] animate-spin mb-3" />
        <h2 className="text-sm font-semibold">Connecting to Room {roomCode}...</h2>
        <p className="text-xs text-[#606470] mt-1">Synchronizing files and workspace presence</p>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#111215] p-6 text-center min-h-0">
        <div className="max-w-md p-6 bg-[#17181c] border border-[#ef4444]/30 rounded-lg">
          <h2 className="text-sm font-bold text-[#f87171] mb-2">Room Access Error</h2>
          <p className="text-xs text-[#9a9ea8] mb-4">{error || 'Room not found. Check the room code and try again.'}</p>
          <button
            onClick={onLeaveRoom}
            className="px-3 py-1.5 bg-[#202227] hover:bg-[#262830] text-white rounded text-xs font-medium cursor-pointer"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const projectFileNames = files.map((f) => f.name);

  return (
    <div className="flex-1 flex flex-col bg-[#111215] text-[#eceef2] overflow-hidden select-none min-h-0">
      {/* Workspace Subheader */}
      <header className="h-10 bg-[#17181c] border-b border-[#2b2d35] px-3 flex items-center justify-between z-10 shrink-0">
        {/* Left: Back, Room Code & File Info */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onLeaveRoom}
            title="Leave Workspace"
            aria-label="Leave Workspace"
            className="h-8 w-8 min-w-[32px] flex items-center justify-center text-[#9a9ea8] hover:text-white hover:bg-[#202227] rounded transition cursor-pointer"
          >
            <ArrowLeft className="w-[18px] h-[18px]" />
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white tracking-tight truncate max-w-[150px]">{room.name}</span>
            <button
              onClick={copyRoomCode}
              title="Click to copy Room Code"
              aria-label={`Copy room code ${room.room_code}`}
              className="h-7 px-2.5 rounded bg-[#111215] hover:bg-[#202227] border border-[#2b2d35] text-[11px] font-mono text-[#10b981] flex items-center gap-1.5 transition cursor-pointer"
            >
              <span>{room.room_code}</span>
              {copiedCode ? <Check className="w-3.5 h-3.5 text-[#10b981]" /> : <Copy className="w-3.5 h-3.5 text-[#606470]" />}
            </button>
          </div>

          {/* Read-only language badge (auto-detected) */}
          {activeFile && detectedLang && (
            <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-[#2b2d35]">
              <Code2 className="w-3.5 h-3.5 text-[#606470]" />
              <span className="px-2 py-0.5 bg-[#111215] border border-[#2b2d35] rounded text-[10px] font-mono text-[#38bdf8]">
                {detectedLang.name}
              </span>
            </div>
          )}

          {/* Sync Status */}
          {syncStatus !== 'idle' && (
            <div className="hidden sm:flex items-center gap-1 pl-2 border-l border-[#2b2d35] text-[10px]">
              {syncStatus === 'syncing' && (
                <span className="flex items-center gap-1 text-[#f59e0b]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Syncing…
                </span>
              )}
              {syncStatus === 'saved' && (
                <span className="flex items-center gap-1 text-[#10b981]">
                  <Cloud className="w-3.5 h-3.5" />
                  Saved
                </span>
              )}
              {syncStatus === 'error' && (
                <span className="flex items-center gap-1 text-[#ef4444]">
                  <CloudOff className="w-3.5 h-3.5" />
                  Sync Error
                </span>
              )}
            </div>
          )}
        </div>

        {/* Center: Live Presence */}
        <div className="hidden md:flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#111215] border border-[#2b2d35] text-[11px]">
            <Radio className="w-3 h-3 text-[#10b981] animate-pulse" />
            <span className="text-[#10b981] font-semibold">{onlineUsers.length} Online:</span>
            <span className="text-[#eceef2] truncate max-w-[280px]">
              {onlineUsers.map((u) => (u.user_id === user?.id ? `${u.name || 'You'} (You)` : u.name)).join(', ')}
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Connection Status Badge */}
          <div className="flex items-center gap-1 text-[11px]">
            {connStatus === 'connected' ? (
              <span className="flex items-center gap-1 text-[#10b981]">
                <span className="w-2 h-2 rounded-full bg-[#10b981]"></span>
                Connected
              </span>
            ) : connStatus === 'reconnecting' ? (
              <span className="flex items-center gap-1 text-[#f59e0b]">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Reconnecting…
              </span>
            ) : connStatus === 'connecting' ? (
              <span className="flex items-center gap-1 text-[#f59e0b]">
                <span className="w-2 h-2 rounded-full bg-[#f59e0b] animate-pulse"></span>
                Connecting…
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[#ef4444]">
                <span className="w-2 h-2 rounded-full bg-[#ef4444]"></span>
                Offline
              </span>
            )}
          </div>

          {/* Top Bar: Save Project Button */}
          <button
            onClick={handleSaveProjectLocally}
            title="Save Project (Save all files to local folder)"
            aria-label="Save Project to Local Folder"
            className="h-8 px-2.5 bg-[#17181c] hover:bg-[#202227] text-[#eceef2] border border-[#2b2d35] hover:border-[#38bdf8]/40 rounded text-xs font-medium flex items-center gap-1.5 transition cursor-pointer relative shadow-xs"
          >
            <FolderDown className="w-4 h-4 text-[#38bdf8]" />
            <span className="hidden sm:inline">Save Project</span>
            {files.some((f) => f.unsaved) && (
              <span
                className="w-2 h-2 rounded-full bg-[#f59e0b] animate-pulse shrink-0"
                title="Project has unsaved changes"
                aria-label="Project has unsaved changes"
              />
            )}
          </button>

          {/* Quick Call Button */}
          <button
            onClick={inCall ? handleLeaveCall : handleJoinCall}
            aria-label={inCall ? 'End Call' : 'Start Call'}
            className={`h-8 px-2.5 rounded text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
              inCall
                ? 'bg-[#ef4444] hover:bg-[#dc2626] text-white shadow-xs'
                : 'bg-[#202227] hover:bg-[#262830] text-white border border-[#2b2d35]'
            }`}
          >
            {inCall ? <PhoneOff className="w-4 h-4" /> : <Phone className="w-4 h-4 text-[#10b981]" />}
            <span>{inCall ? 'End Call' : 'Call'}</span>
          </button>

          {/* Run Code Button */}
          <button
            onClick={handleRunCode}
            disabled={isRunning || !activeFile}
            title="Execute Code in Sandbox (Ctrl+Enter)"
            aria-label="Execute Code in Sandbox (Ctrl+Enter)"
            className="h-8 px-3.5 bg-[#10b981] hover:bg-[#059669] text-white rounded text-xs font-semibold flex items-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            <Play className={`w-4 h-4 fill-current ${isRunning ? 'animate-pulse' : ''}`} />
            <span>{isRunning ? 'Running…' : 'Run'}</span>
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left: File Explorer */}
        <FileExplorer
          files={files}
          activeFileId={activeFile?.id || null}
          onSelectFile={handleSelectFile}
          onCreateFile={handleCreateFile}
          onRenameFile={handleRenameFile}
          onDeleteFile={handleDeleteFile}
          onOpenLocalFile={handleOpenLocalFile}
          onOpenLocalFolder={handleOpenLocalFolder}
          onRefresh={loadInitialData}
          roomName={room.name}
        />

        {/* Center: Monaco Collaborative Editor + Terminal */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <EditorPanel
            files={files}
            activeFile={activeFile}
            openTabs={openTabs}
            onSelectFile={handleSelectFile}
            onCloseTab={handleCloseTab}
            onCodeChange={handleCodeChange}
            onCursorMove={handleCursorMove}
            onSelectionChange={(text) => setSelectedText(text)}
            onSaveFile={handleSaveActiveFileLocally}
            remoteCursors={remoteCursors.filter((c) => c.file_id === activeFile?.id)}
          />

          <OutputPanel
            result={execResult}
            onRun={handleRunCode}
            onClear={() => setExecResult({ status: 'idle', output: '' })}
            isRunning={isRunning}
            stdin={stdin}
            onStdinChange={(val) => setStdin(val)}
            language={activeFile?.language || 'python'}
          />
        </div>

        {/* Right: Real-time Panel (Video + AI / Chat) */}
        <div className="w-80 border-l border-[#2b2d35] bg-[#17181c] flex flex-col overflow-hidden min-h-0">
          {/* Video Dock */}
          <VideoCallPanel
            inCall={inCall}
            localStream={localStream}
            remoteStreams={remoteStreams}
            isAudioMuted={isAudioMuted}
            isVideoMuted={isVideoMuted}
            onJoinCall={handleJoinCall}
            onLeaveCall={handleLeaveCall}
            onToggleAudio={handleToggleAudio}
            onToggleVideo={handleToggleVideo}
          />

          {/* Right Tab Switcher */}
          <div className="flex border-b border-[#2b2d35] bg-[#111215] text-xs shrink-0">
            <button
              onClick={() => setActiveRightTab('ai')}
              aria-label="Switch to AI Assistant"
              className={`flex-1 h-9 flex items-center justify-center gap-1.5 font-medium transition cursor-pointer ${
                activeRightTab === 'ai'
                  ? 'text-[#8b5cf6] border-b-2 border-[#8b5cf6] bg-[#17181c]'
                  : 'text-[#9a9ea8] hover:text-white'
              }`}
            >
              <Sparkles className="w-4 h-4 text-[#8b5cf6]" />
              <span>AI Assistant</span>
            </button>
            <button
              onClick={() => setActiveRightTab('chat')}
              aria-label="Switch to Room Chat"
              className={`flex-1 h-9 flex items-center justify-center gap-1.5 font-medium transition cursor-pointer ${
                activeRightTab === 'chat'
                  ? 'text-[#10b981] border-b-2 border-[#10b981] bg-[#17181c]'
                  : 'text-[#9a9ea8] hover:text-white'
              }`}
            >
              <MessageSquare className="w-4 h-4 text-[#10b981]" />
              <span>Chat</span>
            </button>
          </div>

          {/* Tab View */}
          <div className="flex-1 overflow-hidden min-h-0">
            {activeRightTab === 'ai' ? (
              <AIAssistantPanel
                currentCode={activeFile?.content || ''}
                selectedCode={selectedText}
                language={activeFile?.language || 'python'}
                activeFileName={activeFile?.name || ''}
                lastError={lastError}
                projectFiles={projectFileNames}
                roomCode={roomCode}
                onFilesModified={handleAIFilesModified}
              />
            ) : (
              <ChatPanel
                messages={messages}
                onSendMessage={handleSendMessage}
              />
            )}
          </div>
        </div>
      </div>

      {/* Non-blocking Save Status Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 bg-[#17181c] border border-[#2b2d35] text-white text-xs font-medium rounded-lg shadow-xl shadow-black/50 pointer-events-none"
        >
          {toast.type === 'success' && <Check className="w-4 h-4 text-[#10b981]" />}
          {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-[#ef4444]" />}
          {toast.type === 'info' && <FolderDown className="w-4 h-4 text-[#38bdf8]" />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};
