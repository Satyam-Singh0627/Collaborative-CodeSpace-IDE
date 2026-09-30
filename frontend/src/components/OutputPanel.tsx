import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Terminal,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Play,
  Square,
  Copy,
  Check,
  XCircle,
  CornerDownLeft,
} from 'lucide-react';
import type { ProjectFile, ExecutionResult } from '../types';
import { getExecutionWebSocketUrl } from '../config';
import { api } from '../services/api';

export interface OutputPanelProps {
  activeFile: ProjectFile | null;
  files: ProjectFile[];
  token?: string;
  runTrigger?: number;
  onExecutionDone?: (result: ExecutionResult) => void;
  broadcastResult?: { output: string; status: ExecutionResult['status'] } | null;
}

export const OutputPanel: React.FC<OutputPanelProps> = ({
  activeFile,
  files,
  token,
  runTrigger = 0,
  onExecutionDone,
  broadcastResult,
}) => {
  const [terminalOutput, setTerminalOutput] = useState<string>('');
  const [currentInput, setCurrentInput] = useState<string>('');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [status, setStatus] = useState<ExecutionResult['status']>('idle');
  const [execTime, setExecTime] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const terminalScrollRef = useRef<HTMLDivElement>(null);
  const outputAccumulatorRef = useRef<string>('');
  const lastTriggerRef = useRef<number>(0);

  // Auto-scroll to bottom helper
  const scrollToBottom = useCallback(() => {
    if (terminalScrollRef.current) {
      terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight;
    }
  }, []);

  // Update terminal content and maintain accumulator ref
  const appendOutput = useCallback((chunk: string) => {
    outputAccumulatorRef.current += chunk;
    setTerminalOutput((prev) => prev + chunk);
  }, []);

  // Stop running execution
  const handleStop = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }
    setIsRunning(false);
    setStatus('idle');
  }, []);

  // Clean up WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  // Handle incoming broadcast results from collaborators
  useEffect(() => {
    if (broadcastResult && !isRunning) {
      setTerminalOutput(broadcastResult.output);
      setStatus(broadcastResult.status);
      outputAccumulatorRef.current = broadcastResult.output;
    }
  }, [broadcastResult, isRunning]);

  // Execute Code via Interactive WebSocket (with HTTP fallback)
  const handleRun = useCallback(async () => {
    if (!activeFile || isRunning) return;

    // Reset state for new execution run
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const entryFileName = activeFile.name || 'main.py';
    const langKey = (activeFile.language || 'python').toLowerCase();
    const commandHeader = `$ ${langKey} ${entryFileName}\n`;

    outputAccumulatorRef.current = commandHeader;
    setTerminalOutput(commandHeader);
    setCurrentInput('');
    setIsRunning(true);
    setStatus('running');
    setExecTime(null);

    // Prepare project files
    const projectFiles = files
      .filter((f) => !f.name.endsWith('.md'))
      .map((f) => ({
        name: f.name,
        content: f.id === activeFile.id || f.name === activeFile.name ? activeFile.content : f.content,
      }));

    if (!projectFiles.some((f) => f.name === activeFile.name)) {
      projectFiles.unshift({ name: activeFile.name, content: activeFile.content });
    }

    let socketOpened = false;
    const wsUrl = getExecutionWebSocketUrl(token);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        socketOpened = true;
        ws.send(
          JSON.stringify({
            type: 'start',
            language: langKey,
            files: projectFiles,
            entry_file: entryFileName,
          })
        );
        // Focus the input capture so the user can immediately interact
        setTimeout(() => inputRef.current?.focus(), 50);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'stdout' || msg.type === 'stderr') {
            if (msg.data) {
              appendOutput(msg.data);
            }
          } else if (msg.type === 'done') {
            setIsRunning(false);
            setStatus(msg.status || 'success');
            if (typeof msg.execution_time === 'number') {
              setExecTime(msg.execution_time);
            }
            const finalResult: ExecutionResult = {
              status: msg.status || 'success',
              output: outputAccumulatorRef.current,
              execution_time: msg.execution_time,
            };
            onExecutionDone?.(finalResult);
          } else if (msg.type === 'stopped') {
            appendOutput(msg.message || '\n[Process terminated by user]\n');
            setIsRunning(false);
            setStatus('idle');
            onExecutionDone?.({
              status: 'idle',
              output: outputAccumulatorRef.current,
            });
          } else if (msg.type === 'error') {
            appendOutput(msg.message || '\n[Execution error]\n');
            setIsRunning(false);
            setStatus('error');
            onExecutionDone?.({
              status: 'error',
              output: outputAccumulatorRef.current,
            });
          }
        } catch {
          if (typeof event.data === 'string') {
            appendOutput(event.data);
          }
        }
      };

      ws.onerror = async () => {
        if (!socketOpened) {
          // If WebSocket failed before establishing, fallback smoothly to HTTP API
          try {
            const httpRes = await api.executeCode(
              langKey,
              projectFiles,
              entryFileName,
              ''
            );
            const fullOutput = commandHeader + (httpRes.output || '');
            setTerminalOutput(fullOutput);
            outputAccumulatorRef.current = fullOutput;
            setStatus(httpRes.status);
            setExecTime(httpRes.execution_time ?? null);
            onExecutionDone?.(httpRes);
          } catch (httpErr) {
            const errText = `\n[Execution failed: ${httpErr instanceof Error ? httpErr.message : 'Unknown error'}]\n`;
            appendOutput(errText);
            setStatus('error');
            onExecutionDone?.({ status: 'error', output: outputAccumulatorRef.current });
          } finally {
            setIsRunning(false);
          }
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
      };
    } catch {
      // Direct HTTP fallback on WebSocket constructor failure
      try {
        const httpRes = await api.executeCode(
          langKey,
          projectFiles,
          entryFileName,
          ''
        );
        const fullOutput = commandHeader + (httpRes.output || '');
        setTerminalOutput(fullOutput);
        outputAccumulatorRef.current = fullOutput;
        setStatus(httpRes.status);
        setExecTime(httpRes.execution_time ?? null);
        onExecutionDone?.(httpRes);
      } catch (httpErr) {
        const errText = `\n[Execution failed: ${httpErr instanceof Error ? httpErr.message : 'Unknown error'}]\n`;
        appendOutput(errText);
        setStatus('error');
      } finally {
        setIsRunning(false);
      }
    }
  }, [activeFile, files, isRunning, token, appendOutput, onExecutionDone]);

  // Trigger execution on runTrigger change (e.g., Ctrl+Enter)
  useEffect(() => {
    if (runTrigger > 0 && runTrigger !== lastTriggerRef.current) {
      lastTriggerRef.current = runTrigger;
      handleRun();
    }
  }, [runTrigger, handleRun]);

  // Handle Enter key and terminal stdin piping
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const lineToSend = currentInput;
      // Echo user typing into terminal buffer with newline
      appendOutput(`${lineToSend}\n`);
      setCurrentInput('');

      // Send to backend stdin process via WebSocket
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'stdin',
            data: `${lineToSend}\n`,
          })
        );
      }
      setTimeout(scrollToBottom, 10);
    } else if (e.key === 'c' && (e.ctrlKey || e.metaKey) && isRunning) {
      // Ctrl+C in terminal cancels running execution
      e.preventDefault();
      handleStop();
    }
  };

  // Scroll to bottom on content or input change
  useEffect(() => {
    scrollToBottom();
  }, [terminalOutput, currentInput, scrollToBottom]);

  // Clear Terminal
  const handleClear = () => {
    if (isRunning) return;
    setTerminalOutput('');
    outputAccumulatorRef.current = '';
    setCurrentInput('');
    setStatus('idle');
    setExecTime(null);
  };

  // Copy Terminal Content
  const handleCopy = () => {
    if (!terminalOutput) return;
    navigator.clipboard.writeText(terminalOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Focus terminal input when clicking anywhere in terminal body
  const handleTerminalClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Status Badge Component
  const renderStatusBadge = () => {
    if (isRunning) {
      return (
        <span className="flex items-center gap-1.5 text-[11px] text-[#f59e0b] font-medium bg-[#f59e0b]/10 border border-[#f59e0b]/20 px-2 py-0.5 rounded">
          <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-ping" />
          Running...
        </span>
      );
    }
    if (status === 'success') {
      return (
        <span className="flex items-center gap-1 text-[11px] text-[#10b981] font-medium bg-[#10b981]/10 border border-[#10b981]/20 px-2 py-0.5 rounded">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Success {execTime !== null ? `(${execTime}s)` : ''}
        </span>
      );
    }
    if (status === 'compile_error') {
      return (
        <span className="flex items-center gap-1 text-[11px] text-[#ef4444] font-medium bg-[#ef4444]/10 border border-[#ef4444]/20 px-2 py-0.5 rounded">
          <XCircle className="w-3.5 h-3.5" />
          Compile Error {execTime !== null ? `(${execTime}s)` : ''}
        </span>
      );
    }
    if (status === 'error') {
      return (
        <span className="flex items-center gap-1 text-[11px] text-[#ef4444] font-medium bg-[#ef4444]/10 border border-[#ef4444]/20 px-2 py-0.5 rounded">
          <AlertCircle className="w-3.5 h-3.5" />
          Runtime Error {execTime !== null ? `(${execTime}s)` : ''}
        </span>
      );
    }
    if (status === 'timeout') {
      return (
        <span className="flex items-center gap-1 text-[11px] text-[#f59e0b] font-medium bg-[#f59e0b]/10 border border-[#f59e0b]/20 px-2 py-0.5 rounded">
          <Clock className="w-3.5 h-3.5" />
          Timed Out
        </span>
      );
    }
    return (
      <span className="text-[11px] text-[#606470] bg-[#1a1c22] border border-[#2b2d35] px-2 py-0.5 rounded">
        Ready
      </span>
    );
  };

  const activeLangName = activeFile?.language || 'python';

  return (
    <div className="h-56 border-t border-[#2b2d35] bg-[#0c0d10] flex flex-col font-mono text-xs select-none relative shrink-0">
      {/* Terminal Title & Controls Bar */}
      <div className="h-8 px-3 bg-[#131418] border-b border-[#2b2d35] flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-white font-semibold text-[11px] tracking-wide">
            <Terminal className="w-3.5 h-3.5 text-[#10b981]" />
            <span>TERMINAL</span>
          </div>

          <span className="px-1.5 py-0.5 bg-[#1a1c22] border border-[#2b2d35] text-[10px] text-[#38bdf8] rounded font-mono uppercase">
            {activeLangName}
          </span>

          <div className="hidden sm:flex items-center">
            {renderStatusBadge()}
          </div>
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-1.5">
          {isRunning ? (
            <button
              onClick={handleStop}
              title="Stop Execution (Ctrl+C)"
              aria-label="Stop execution process"
              className="flex items-center gap-1 px-2.5 py-1 bg-red-600/90 hover:bg-red-600 text-white rounded text-[11px] font-medium transition cursor-pointer shadow-sm active:scale-95"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              onClick={handleRun}
              title="Run Code (Ctrl+Enter)"
              aria-label="Run program in terminal"
              className="flex items-center gap-1 px-2.5 py-1 bg-[#10b981] hover:bg-[#059669] text-white rounded text-[11px] font-medium transition cursor-pointer shadow-sm active:scale-95"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Run</span>
            </button>
          )}

          <div className="w-[1px] h-4 bg-[#2b2d35] mx-1" />

          <button
            onClick={handleClear}
            disabled={isRunning || !terminalOutput}
            title="Clear Terminal"
            aria-label="Clear terminal output"
            className="p-1.5 hover:bg-[#202227] text-[#9a9ea8] hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#9a9ea8] rounded transition cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleCopy}
            disabled={!terminalOutput}
            title="Copy Terminal Text"
            aria-label="Copy terminal text to clipboard"
            className="p-1.5 hover:bg-[#202227] text-[#9a9ea8] hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#9a9ea8] rounded transition cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#10b981]" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Unified Terminal Output & Interactive Stdin Area */}
      <div
        ref={terminalScrollRef}
        onClick={handleTerminalClick}
        className="flex-1 p-3 overflow-y-auto overflow-x-hidden font-mono text-[12px] leading-relaxed select-text cursor-text bg-[#0c0d10] text-[#e2e8f0]"
      >
        {/* Empty State when no execution has occurred */}
        {!terminalOutput && !isRunning && (
          <div className="h-full flex flex-col items-center justify-center text-[#606470] select-none text-center p-4">
            <Terminal className="w-7 h-7 mb-2 opacity-40 text-[#10b981]" />
            <p className="text-xs font-medium text-[#9a9ea8]">Integrated Interactive Terminal</p>
            <p className="text-[11px] text-[#606470] mt-1">
              Click <span className="text-[#10b981] font-semibold">Run</span> (or press{' '}
              <kbd className="px-1 py-0.5 bg-[#17181c] border border-[#2b2d35] rounded text-[10px] text-white">Ctrl+Enter</kbd>
              ) to execute. Interactive programs (like Python <code className="text-[#38bdf8]">input()</code>) accept typing directly here.
            </p>
          </div>
        )}

        {/* Live Terminal Output & Active Inline Input */}
        {(terminalOutput || isRunning) && (
          <div className="whitespace-pre-wrap break-words">
            <span>{terminalOutput}</span>

            {/* Inline active user typing area at prompt cursor */}
            {isRunning && (
              <span className="inline">
                <span className="text-white font-medium">{currentInput}</span>
                <span className="inline-block w-2 h-3.5 bg-[#10b981] align-middle animate-pulse ml-0.5 shadow-[0_0_8px_#10b981]" />
              </span>
            )}
          </div>
        )}

        {/* Hidden active input handler to capture keyboard typing naturally */}
        <input
          ref={inputRef}
          type="text"
          value={currentInput}
          onChange={(e) => setCurrentInput(e.target.value)}
          onKeyDown={handleInputKeyDown}
          disabled={!isRunning}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          className="opacity-0 absolute pointer-events-none -left-[9999px] -top-[9999px] w-1 h-1"
          aria-label="Terminal input"
        />
      </div>

      {/* Bottom Status bar for input hint while running */}
      {isRunning && (
        <div className="h-6 px-3 bg-[#131418] border-t border-[#2b2d35] flex items-center justify-between text-[10px] text-[#9a9ea8]">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Terminal is active — type directly here and press Enter</span>
          </div>
          <div className="flex items-center gap-1 text-[#606470]">
            <span>Press</span>
            <kbd className="px-1 py-0.2 bg-[#1c1e24] border border-[#2b2d35] rounded text-white text-[9px] flex items-center gap-0.5">
              <CornerDownLeft className="w-2.5 h-2.5" /> Enter
            </kbd>
            <span>to send input</span>
          </div>
        </div>
      )}
    </div>
  );
};
