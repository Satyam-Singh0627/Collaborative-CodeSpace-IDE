import React, { useState } from 'react';
import { Terminal, Trash2, CheckCircle2, AlertCircle, Clock, Play, Copy, Check } from 'lucide-react';
import type { ExecutionResult } from '../types';

interface OutputPanelProps {
  result: ExecutionResult;
  onRun: () => void;
  onClear: () => void;
  isRunning: boolean;
}

export const OutputPanel: React.FC<OutputPanelProps> = ({
  result,
  onRun,
  onClear,
  isRunning,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!result.output) return;
    navigator.clipboard.writeText(result.output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-44 border-t border-[#2b2d35] bg-[#111215] flex flex-col font-mono text-xs select-none">
      {/* Terminal Title Bar */}
      <div className="h-7 px-3 bg-[#17181c] border-b border-[#2b2d35] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-[#10b981]" />
          <span className="text-[11px] font-semibold text-white tracking-wide uppercase">Output Terminal</span>

          {/* Status badge */}
          {isRunning ? (
            <span className="flex items-center gap-1 text-[11px] text-[#f59e0b]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-ping"></span>
              Executing...
            </span>
          ) : result.status === 'success' ? (
            <span className="flex items-center gap-1 text-[11px] text-[#10b981]">
              <CheckCircle2 className="w-3 h-3" />
              Completed ({result.execution_time ?? 0}s)
            </span>
          ) : result.status === 'error' ? (
            <span className="flex items-center gap-1 text-[11px] text-[#ef4444]">
              <AlertCircle className="w-3 h-3" />
              Process Error ({result.execution_time ?? 0}s)
            </span>
          ) : result.status === 'timeout' ? (
            <span className="flex items-center gap-1 text-[11px] text-[#f59e0b]">
              <Clock className="w-3 h-3" />
              Timeout (10s Limit)
            </span>
          ) : (
            <span className="text-[11px] text-[#606470]">Idle</span>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5">
          {result.output && (
            <button
              onClick={handleCopy}
              title="Copy Output"
              className="p-1 text-[#9a9ea8] hover:text-white hover:bg-[#202227] rounded transition cursor-pointer"
            >
              {copied ? <Check className="w-3 h-3 text-[#10b981]" /> : <Copy className="w-3 h-3" />}
            </button>
          )}

          <button
            onClick={onClear}
            title="Clear Console"
            className="p-1 text-[#9a9ea8] hover:text-white hover:bg-[#202227] rounded transition cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
          </button>

          <button
            onClick={onRun}
            disabled={isRunning}
            className="px-2 py-0.5 bg-[#10b981] hover:bg-[#059669] text-white rounded text-[11px] font-medium flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
          >
            <Play className="w-2.5 h-2.5 fill-current" />
            <span>Run</span>
          </button>
        </div>
      </div>

      {/* Terminal Output Body */}
      <div className="flex-1 p-2.5 overflow-y-auto font-mono text-[11.5px] leading-relaxed select-text">
        {result.output ? (
          <span
            className={
              result.status === 'error'
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
            Press <kbd className="px-1 py-0.5 rounded bg-[#1e2026] text-[#9a9ea8] border border-[#2b2d35] text-[10px] font-mono not-italic">Ctrl+Enter</kbd> or click 'Run' to execute code.
          </span>
        )}
      </div>
    </div>
  );
};
