import React, { useState } from 'react';
import {
  Terminal,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Play,
  Copy,
  Check,
  RotateCcw,
  Keyboard,
  XCircle,
} from 'lucide-react';
import type { ExecutionResult } from '../types';

interface OutputPanelProps {
  result: ExecutionResult;
  onRun: () => void;
  onClear: () => void;
  isRunning: boolean;
  stdin: string;
  onStdinChange: (value: string) => void;
  language?: string;
  requiresStdin?: boolean;
}

export const OutputPanel: React.FC<OutputPanelProps> = ({
  result,
  onRun,
  onClear,
  isRunning,
  stdin,
  onStdinChange,
  language = 'python',
  requiresStdin = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'output' | 'stdin'>('output');

  const handleCopy = () => {
    if (!result.output) return;
    navigator.clipboard.writeText(result.output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRun = () => {
    setActiveTab('output');
    onRun();
  };

  const getStatusBadge = () => {
    if (isRunning) {
      return (
        <span className="flex items-center gap-1.5 text-[11px] text-[#f59e0b] font-medium">
          <span className="w-2 h-2 rounded-full bg-[#f59e0b] animate-ping"></span>
          Running...
        </span>
      );
    }
    if (result.status === 'success') {
      return (
        <span className="flex items-center gap-1 text-[11px] text-[#10b981] font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Success ({result.execution_time ?? 0}s)
        </span>
      );
    }
    if (result.status === 'compile_error') {
      return (
        <span className="flex items-center gap-1 text-[11px] text-[#ef4444] font-medium">
          <XCircle className="w-3.5 h-3.5" />
          Compile Error ({result.execution_time ?? 0}s)
        </span>
      );
    }
    if (result.status === 'error') {
      return (
        <span className="flex items-center gap-1 text-[11px] text-[#ef4444] font-medium">
          <AlertCircle className="w-3.5 h-3.5" />
          Runtime Error ({result.execution_time ?? 0}s)
        </span>
      );
    }
    if (result.status === 'timeout') {
      return (
        <span className="flex items-center gap-1 text-[11px] text-[#f59e0b] font-medium">
          <Clock className="w-3.5 h-3.5" />
          Timed Out (10s limit)
        </span>
      );
    }
    return <span className="text-[11px] text-[#606470]">Ready</span>;
  };

  return (
    <div className="h-48 border-t border-[#2b2d35] bg-[#111215] flex flex-col font-mono text-xs select-none">
      {/* Terminal Title & Tabs Bar */}
      <div className="h-7 px-3 bg-[#17181c] border-b border-[#2b2d35] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-[#10b981]" />
            <span className="text-[11px] font-semibold text-white tracking-wide uppercase">Console</span>
          </div>

          {/* Subtabs: Output / Stdin */}
          <div className="flex items-center gap-1 bg-[#111215] p-0.5 rounded border border-[#2b2d35] text-[10px]">
            <button
              onClick={() => setActiveTab('output')}
              className={`px-2 py-0.5 rounded transition cursor-pointer ${
                activeTab === 'output' ? 'bg-[#202227] text-white font-medium' : 'text-[#9a9ea8] hover:text-white'
              }`}
            >
              Output
            </button>
            <button
              onClick={() => setActiveTab('stdin')}
              className={`px-2 py-0.5 rounded transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'stdin' ? 'bg-[#202227] text-white font-medium' : 'text-[#9a9ea8] hover:text-white'
              }`}
            >
              <Keyboard className="w-2.5 h-2.5" />
              <span>Input (stdin){stdin ? ' •' : ''}</span>
              {requiresStdin && !stdin.trim() && (
                <span className="px-1 py-0.2 rounded bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/40 text-[9px] font-semibold animate-pulse">
                  Required
                </span>
              )}
            </button>
          </div>

          {/* Status Badge */}
          {getStatusBadge()}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[#606470] font-mono px-2 py-0.5 bg-[#111215] rounded border border-[#2b2d35]">
            {language}
          </span>

          {result.output && (
            <button
              onClick={handleCopy}
              title="Copy Output"
              aria-label="Copy Output"
              className="h-7 w-7 min-w-[28px] flex items-center justify-center text-[#9a9ea8] hover:text-white hover:bg-[#202227] rounded transition cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-[#10b981]" /> : <Copy className="w-4 h-4" />}
            </button>
          )}

          <button
            onClick={onClear}
            title="Clear Console"
            aria-label="Clear Console"
            className="h-7 w-7 min-w-[28px] flex items-center justify-center text-[#9a9ea8] hover:text-white hover:bg-[#202227] rounded transition cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button
            onClick={handleRun}
            disabled={isRunning}
            title="Execute Code (Ctrl+Enter)"
            aria-label="Execute Code (Ctrl+Enter)"
            className="h-7 px-3 bg-[#10b981] hover:bg-[#059669] text-white rounded text-[11px] font-medium flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            {isRunning ? (
              <RotateCcw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{isRunning ? 'Running' : 'Run'}</span>
          </button>
        </div>
      </div>

      {/* Panel Body */}
      <div className="flex-1 p-2.5 overflow-y-auto font-mono text-[11.5px] leading-relaxed select-text bg-[#111215]">
        {activeTab === 'output' ? (
          <div>
            {requiresStdin && !stdin.trim() && !isRunning && (
              <div className="mb-2.5 px-3 py-2 rounded bg-[#f59e0b]/10 border border-[#f59e0b]/30 text-[11px] text-[#fbbf24] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Keyboard className="w-4 h-4 shrink-0 text-[#f59e0b]" />
                  <span>This program requires standard input (<code>input()</code>). Enter your input in the Input tab before running.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('stdin')}
                  className="px-2.5 py-0.5 rounded bg-[#f59e0b] hover:bg-[#d97706] text-black font-semibold text-[10px] transition cursor-pointer"
                >
                  Enter Input
                </button>
              </div>
            )}
            {result.output ? (
              <span
                className={
                  result.status === 'error' || result.status === 'compile_error'
                    ? 'text-[#f87171] whitespace-pre-wrap'
                    : result.status === 'timeout'
                    ? 'text-[#fbbf24] whitespace-pre-wrap'
                    : 'text-[#eceef2] whitespace-pre-wrap'
                }
              >
                {result.output}
              </span>
            ) : (
              <span className="text-[#606470] italic">
                Press <kbd className="px-1 py-0.5 rounded bg-[#1e2026] text-[#9a9ea8] border border-[#2b2d35] text-[10px] font-mono not-italic">Ctrl+Enter</kbd> or click 'Run' to execute code in sandbox.
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <textarea
              placeholder="Provide standard input (stdin) for your program here before running (e.g. Satyam)..."
              value={stdin}
              onChange={(e) => onStdinChange(e.target.value)}
              className="flex-1 w-full bg-[#17181c] border border-[#2b2d35] rounded p-2 text-xs text-white placeholder-[#606470] focus:outline-hidden focus:border-[#10b981] resize-none"
            />
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#2b2d35]">
              <span className="text-[10px] text-[#9a9ea8]">
                Standard input will be passed line-by-line to <code>input()</code>.
              </span>
              <button
                type="button"
                onClick={handleRun}
                disabled={isRunning}
                className="px-3 py-1 bg-[#10b981] hover:bg-[#059669] text-white rounded text-[11px] font-medium flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Run Code</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
