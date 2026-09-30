import React, { useState } from 'react';
import { Sparkles, HelpCircle, Bug, Wand2, Send, RefreshCw, CheckCircle2, MessageCircle, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';

interface AIAssistantPanelProps {
  currentCode: string;
  selectedCode: string;
  language: string;
  activeFileName?: string;
  lastError?: string;
}

export const AIAssistantPanel: React.FC<AIAssistantPanelProps> = ({
  currentCode,
  selectedCode,
  language,
  activeFileName = '',
  lastError = '',
}) => {
  const [response, setResponse] = useState<string | null>(null);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async (action: string, prompt?: string) => {
    const codeToAnalyze = selectedCode.trim() || currentCode.trim();
    if (!codeToAnalyze && action !== 'generate' && action !== 'chat') {
      setError('Please open a file with code or select code in the editor.');
      return;
    }

    setLoading(true);
    setError(null);
    setActiveAction(action);

    try {
      const res = await api.askAI(
        action,
        codeToAnalyze,
        language,
        prompt || customPrompt,
        lastError,
      );
      setResponse(res.result);
      setModelUsed(res.model_used);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'AI Assistant unavailable.');
    } finally {
      setLoading(false);
    }
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = customPrompt.trim();
    if (!prompt) return;
    handleAction('chat', prompt);
    setCustomPrompt('');
  };

  return (
    <div className="flex flex-col h-full bg-[#17181c] text-[#eceef2] select-none">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#2b2d35] flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-white">
          <Sparkles className="w-3.5 h-3.5 text-[#8b5cf6]" />
          <span>AI Assistant</span>
        </div>
        {modelUsed && (
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#111215] text-[#9a9ea8] border border-[#2b2d35]">
            {modelUsed}
          </span>
        )}
      </div>

      {/* Context Scope Bar */}
      <div className="px-3 py-1.5 bg-[#111215] border-b border-[#2b2d35] text-[11px] text-[#9a9ea8] flex items-center justify-between">
        <div className="truncate max-w-[170px]">
          <span className="text-[#606470]">Target: </span>
          <span className="text-[#eceef2] font-mono">
            {activeFileName ? activeFileName : selectedCode.trim() ? 'Selection' : 'Active File'}
          </span>
        </div>
        <span className="text-[#38bdf8] uppercase font-mono text-[10px] font-semibold">{language}</span>
      </div>

      {/* Quick Action Buttons */}
      <div className="p-2.5 border-b border-[#2b2d35] grid grid-cols-2 gap-1.5">
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
          onClick={() => handleAction('generate')}
          disabled={loading}
          className="p-1.5 bg-[#1e2026] hover:bg-[#262830] text-[#eceef2] rounded border border-[#2b2d35] text-[11px] font-medium flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#a78bfa]" />
          <span>Generate</span>
        </button>
      </div>

      {/* Output Stream Content */}
      <div className="flex-1 overflow-y-auto p-3 font-sans text-xs select-text">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-[#9a9ea8]">
            <RefreshCw className="w-5 h-5 text-[#8b5cf6] animate-spin mb-2" />
            <p className="text-white font-medium text-xs">Querying AI model…</p>
            <p className="text-[11px] text-[#606470] mt-0.5">Analyzing code context</p>
          </div>
        ) : error ? (
          <div className="p-2.5 bg-[#ef4444]/10 border border-[#ef4444]/30 rounded text-[#f87171] text-xs flex items-start gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : response ? (
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-[#10b981] font-medium text-xs">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="capitalize">{activeAction?.replace('_', ' ')} Result</span>
            </div>
            <div className="bg-[#111215] p-3 rounded border border-[#2b2d35] text-[#eceef2] whitespace-pre-wrap leading-relaxed font-mono text-[11px]">
              {response}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-[#606470]">
            <Sparkles className="w-6 h-6 stroke-1 text-[#2b2d35] mb-2" />
            <p className="text-xs font-medium text-[#9a9ea8] mb-0.5">AI Coding Assistant</p>
            <p className="text-[11px] text-[#606470]">
              Ask questions or use the quick actions above.
            </p>
          </div>
        )}
      </div>

      {/* Free-form Question Input */}
      <form onSubmit={handleChatSubmit} className="p-2.5 border-t border-[#2b2d35] bg-[#111215] flex items-center gap-1.5">
        <div className="relative flex-1">
          <MessageCircle className="w-3.5 h-3.5 text-[#606470] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Ask AI about this code…"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            className="w-full bg-[#17181c] border border-[#2b2d35] rounded pl-8 pr-2.5 py-1.5 text-xs text-white placeholder-[#606470] focus:border-[#8b5cf6] focus:outline-hidden"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !customPrompt.trim()}
          className="p-1.5 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded transition disabled:opacity-40 cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
