import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  HelpCircle,
  Bug,
  Wand2,
  Send,
  RefreshCw,
  Copy,
  Check,
  RotateCcw,
  Trash2,
  Bot,
  User,
  Wrench,
  FileCode,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import type { AIChatTurn } from '../types';
import { api } from '../services/api';

interface AIAssistantPanelProps {
  currentCode: string;
  selectedCode: string;
  language: string;
  activeFileName?: string;
  lastError?: string;
  projectFiles?: string[];
  roomCode?: string;
  onFilesModified?: () => void;
}

export const AIAssistantPanel: React.FC<AIAssistantPanelProps> = ({
  currentCode,
  selectedCode,
  language,
  activeFileName = '',
  lastError = '',
  projectFiles = [],
  roomCode = '',
  onFilesModified,
}) => {
  const [messages, setMessages] = useState<AIChatTurn[]>([]);
  const [customPrompt, setCustomPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastFailedAction, setLastFailedAction] = useState<{ action: string; prompt: string } | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [agentMode, setAgentMode] = useState(true); // true = agent with tools, false = chat-only
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom on new messages
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleAction = async (action: string, promptText = '') => {
    const codeToAnalyze = selectedCode.trim() || currentCode.trim();
    if (!codeToAnalyze && !promptText && action !== 'generate') {
      const warningTurn: AIChatTurn = {
        id: `turn-${Date.now()}`,
        role: 'assistant',
        content: '⚠️ Please open a file containing code or select a snippet in the editor first.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: true,
      };
      setMessages((prev) => [...prev, warningTurn]);
      return;
    }

    const userTurn: AIChatTurn = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: promptText || (action === 'explain' ? 'Explain this code' : action === 'bug_detect' ? 'Find bugs and issues in this code' : action === 'improve' ? 'Suggest improvements for this code' : 'Generate code'),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      action,
    };

    setMessages((prev) => [...prev, userTurn]);
    setLoading(true);
    setLastFailedAction(null);

    // Build chat history context
    const historyPayload = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      // Use Agent mode if enabled and roomCode is available
      if (agentMode && roomCode) {
        const res = await api.askAIAgent(
          promptText || userTurn.content,
          roomCode,
          activeFileName,
          historyPayload,
        );

        // Build rich response with tool call details
        let displayContent = '';
        const allToolCalls: AIChatTurn['toolCalls'] = [];

        for (const step of res.steps) {
          if (step.thought) {
            displayContent += `💭 *${step.thought}*\n\n`;
          }
          for (const tc of step.tool_calls) {
            allToolCalls.push({
              tool: tc.tool,
              args: tc.args as Record<string, unknown>,
              result: tc.result ?? undefined,
            });
            displayContent += `🔧 **${tc.tool}**(${Object.entries(tc.args).map(([k, v]) => `${k}="${typeof v === 'string' && v.length > 50 ? v.slice(0, 50) + '…' : v}"`).join(', ')})\n`;
            if (tc.result) {
              displayContent += `→ ${tc.result}\n`;
            }
            displayContent += '\n';
          }
        }

        if (res.final_response) {
          displayContent += res.final_response;
        }

        const aiTurn: AIChatTurn = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: displayContent.trim() || res.final_response || 'Agent completed.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          modelUsed: res.model_used,
          toolCalls: allToolCalls,
          filesModified: res.files_modified,
          isError: res.model_used === 'unconfigured' || res.model_used === 'service-unavailable',
        };

        setMessages((prev) => [...prev, aiTurn]);

        // If files were modified, notify parent to refresh
        if (res.files_modified.length > 0 && onFilesModified) {
          onFilesModified();
        }
      } else {
        // Standard chat-only mode
        const res = await api.askAI(
          action,
          codeToAnalyze,
          language,
          promptText || userTurn.content,
          lastError,
          activeFileName,
          projectFiles,
          historyPayload,
        );

        const aiTurn: AIChatTurn = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: res.result,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          modelUsed: res.model_used,
          action: res.action,
          isError: res.model_used === 'unconfigured' || res.model_used === 'service-unavailable',
        };

        setMessages((prev) => [...prev, aiTurn]);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to connect to AI Assistant.';
      setLastFailedAction({ action, prompt: promptText });
      const errorTurn: AIChatTurn = {
        id: `ai-err-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ ${errMsg}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: true,
      };
      setMessages((prev) => [...prev, errorTurn]);
    } finally {
      setLoading(false);
    }
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = customPrompt.trim();
    if (!prompt || loading) return;
    handleAction('chat', prompt);
    setCustomPrompt('');
  };

  const handleRetry = () => {
    if (lastFailedAction) {
      handleAction(lastFailedAction.action, lastFailedAction.prompt);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-[#17181c] text-[#eceef2] select-none">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#2b2d35] flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-white">
          <Sparkles className="w-3.5 h-3.5 text-[#8b5cf6]" />
          <span>AI Assistant</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Agent mode toggle */}
          <button
            onClick={() => setAgentMode((prev) => !prev)}
            title={agentMode ? 'Agent Mode: Tools enabled (can modify files)' : 'Chat Mode: Analysis only'}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#111215] border border-[#2b2d35] text-[10px] font-medium transition cursor-pointer hover:bg-[#202227]"
          >
            {agentMode ? (
              <>
                <ToggleRight className="w-3 h-3 text-[#10b981]" />
                <Wrench className="w-2.5 h-2.5 text-[#10b981]" />
                <span className="text-[#10b981]">Agent</span>
              </>
            ) : (
              <>
                <ToggleLeft className="w-3 h-3 text-[#9a9ea8]" />
                <span className="text-[#9a9ea8]">Chat</span>
              </>
            )}
          </button>

          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              title="Clear Conversation"
              className="p-1 text-[#9a9ea8] hover:text-white hover:bg-[#202227] rounded transition cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Context Scope Bar */}
      <div className="px-3 py-1 bg-[#111215] border-b border-[#2b2d35] text-[11px] text-[#9a9ea8] flex items-center justify-between">
        <div className="truncate max-w-[170px] flex items-center gap-1">
          <span className="text-[#606470]">Scope:</span>
          <span className="text-[#eceef2] font-mono truncate">
            {selectedCode.trim()
              ? `Selection (${selectedCode.trim().split('\n').length} lines)`
              : activeFileName || 'Active File'}
          </span>
        </div>
        <span className="text-[#38bdf8] uppercase font-mono text-[10px] font-semibold">{language}</span>
      </div>

      {/* Quick Action Prompt Buttons */}
      <div className="p-2 border-b border-[#2b2d35] grid grid-cols-2 gap-1.5 bg-[#141518]">
        <button
          onClick={() => handleAction('explain')}
          disabled={loading}
          className="p-1.5 bg-[#1e2026] hover:bg-[#262830] text-[#eceef2] rounded border border-[#2b2d35] text-[11px] font-medium flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
        >
          <HelpCircle className="w-3.5 h-3.5 text-[#38bdf8]" />
          <span>Explain</span>
        </button>

        <button
          onClick={() => handleAction('bug_detect')}
          disabled={loading}
          className="p-1.5 bg-[#1e2026] hover:bg-[#262830] text-[#eceef2] rounded border border-[#2b2d35] text-[11px] font-medium flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
        >
          <Bug className="w-3.5 h-3.5 text-[#f87171]" />
          <span>Find Bugs</span>
        </button>

        <button
          onClick={() => handleAction('improve')}
          disabled={loading}
          className="p-1.5 bg-[#1e2026] hover:bg-[#262830] text-[#eceef2] rounded border border-[#2b2d35] text-[11px] font-medium flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
        >
          <Wand2 className="w-3.5 h-3.5 text-[#10b981]" />
          <span>Suggest Fixes</span>
        </button>

        <button
          onClick={() => handleAction('generate', 'Generate a clean implementation for this')}
          disabled={loading}
          className="p-1.5 bg-[#1e2026] hover:bg-[#262830] text-[#eceef2] rounded border border-[#2b2d35] text-[11px] font-medium flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#a78bfa]" />
          <span>Generate</span>
        </button>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 font-sans text-xs select-text">
        {messages.length === 0 && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-[#606470]">
            <Sparkles className="w-8 h-8 stroke-1 text-[#2b2d35] mb-2" />
            <p className="text-xs font-medium text-[#9a9ea8] mb-1">
              {agentMode ? 'AI Agent — Workspace Tools' : 'AI Pair Programmer'}
            </p>
            <p className="text-[11px] text-[#606470] max-w-[220px] leading-relaxed">
              {agentMode
                ? 'Ask the AI to create files, modify code, run programs, and debug issues directly in your workspace.'
                : 'Ask natural-language questions, analyze errors, explain architecture, or generate code with full workspace context.'}
            </p>
          </div>
        )}

        {messages.map((turn) => {
          const isUser = turn.role === 'user';
          return (
            <div
              key={turn.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
            >
              <div className="flex items-center gap-1.5 text-[10px] text-[#606470] px-1">
                {isUser ? (
                  <>
                    <span>{turn.timestamp}</span>
                    <span className="font-semibold text-[#9a9ea8]">You</span>
                    <User className="w-3 h-3 text-[#9a9ea8]" />
                  </>
                ) : (
                  <>
                    <Bot className="w-3 h-3 text-[#8b5cf6]" />
                    <span className="font-semibold text-[#8b5cf6]">AI {turn.toolCalls?.length ? 'Agent' : 'Assistant'}</span>
                    {turn.modelUsed && turn.modelUsed !== 'unconfigured' && (
                      <span className="font-mono text-[9px] bg-[#111215] px-1 rounded text-[#606470]">
                        {turn.modelUsed}
                      </span>
                    )}
                    <span>{turn.timestamp}</span>
                  </>
                )}
              </div>

              <div
                className={`max-w-[95%] p-2.5 rounded-lg text-[11.5px] leading-relaxed relative group ${
                  isUser
                    ? 'bg-[#202227] text-white border border-[#2b2d35]'
                    : turn.isError
                    ? 'bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#f87171]'
                    : 'bg-[#111215] text-[#eceef2] border border-[#2b2d35]'
                }`}
              >
                {!isUser && (
                  <button
                    onClick={() => copyToClipboard(turn.content, turn.id)}
                    title="Copy response"
                    className="absolute top-2 right-2 p-1 text-[#606470] hover:text-white hover:bg-[#202227] rounded transition opacity-0 group-hover:opacity-100 cursor-pointer"
                  >
                    {copiedIndex === turn.id ? (
                      <Check className="w-3 h-3 text-[#10b981]" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                )}

                {/* Tool calls badge */}
                {!isUser && turn.toolCalls && turn.toolCalls.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {turn.toolCalls.map((tc, i) => (
                      <span key={i} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#202227] border border-[#2b2d35] text-[10px] font-mono text-[#10b981]">
                        <Wrench className="w-2.5 h-2.5" />
                        {tc.tool}
                      </span>
                    ))}
                  </div>
                )}

                {/* Files modified badge */}
                {!isUser && turn.filesModified && turn.filesModified.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {turn.filesModified.map((fname, i) => (
                      <span key={i} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#10b981]/10 border border-[#10b981]/30 text-[10px] font-mono text-[#10b981]">
                        <FileCode className="w-2.5 h-2.5" />
                        {fname}
                      </span>
                    ))}
                  </div>
                )}

                <div className="whitespace-pre-wrap font-sans break-words pr-4">
                  {turn.content}
                </div>
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex items-center gap-2 p-3 bg-[#111215] rounded border border-[#2b2d35] text-[#9a9ea8]">
            <RefreshCw className="w-4 h-4 text-[#8b5cf6] animate-spin shrink-0" />
            <span className="text-[11px]">
              {agentMode ? 'Agent working on workspace...' : 'Analyzing code & generating response...'}
            </span>
          </div>
        )}

        {lastFailedAction && !loading && (
          <div className="flex items-center justify-between p-2 bg-[#ef4444]/10 border border-[#ef4444]/20 rounded text-xs text-[#f87171]">
            <span className="text-[11px]">Request failed</span>
            <button
              onClick={handleRetry}
              className="px-2 py-0.5 bg-[#ef4444]/20 hover:bg-[#ef4444]/30 text-white rounded text-[10px] font-medium flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Free-form Question Input */}
      <form onSubmit={handleChatSubmit} className="p-2.5 border-t border-[#2b2d35] bg-[#111215] flex items-center gap-1.5">
        <input
          type="text"
          placeholder={agentMode
            ? "Ask AI to create files, fix bugs, run code..."
            : "Ask AI (e.g. 'Why is this error occurring?', 'Convert to C++')..."
          }
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          disabled={loading}
          className="flex-1 bg-[#17181c] border border-[#2b2d35] rounded px-3 py-1.5 text-xs text-white placeholder-[#606470] focus:border-[#8b5cf6] focus:outline-hidden disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !customPrompt.trim()}
          title="Send Question"
          className="p-1.5 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded transition disabled:opacity-40 cursor-pointer shadow-xs"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
