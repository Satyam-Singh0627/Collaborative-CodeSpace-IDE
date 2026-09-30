import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import type { ChatMessage } from '../types';
import { useAuth } from '../context/AuthContext';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  onSendMessage,
}) => {
  const { user } = useAuth();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInput('');
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#17181c] text-[#eceef2] select-none">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#2b2d35] flex items-center justify-between text-xs font-semibold text-white">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-[#10b981]" />
          <span>Room Chat</span>
        </div>
        <span className="text-[10px] text-[#606470] font-normal font-mono">
          {messages.length} msg{messages.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 font-sans select-text">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-[#606470]">
            <MessageSquare className="w-6 h-6 stroke-1 text-[#2b2d35] mb-2" />
            <p className="text-xs font-medium text-[#9a9ea8] mb-0.5">No messages yet</p>
            <p className="text-[11px] text-[#606470]">Send a message to room collaborators</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.sender_id === user?.id;
            return (
              <div
                key={msg.id || index}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-baseline gap-1.5 mb-0.5 px-1">
                  <span className={`text-[11px] font-semibold ${isMe ? 'text-[#10b981]' : 'text-[#38bdf8]'}`}>
                    {isMe ? 'You' : msg.sender_name}
                  </span>
                  <span className="text-[10px] text-[#606470]">{formatTime(msg.timestamp)}</span>
                </div>
                <div
                  className={`max-w-[85%] rounded px-2.5 py-1.5 text-xs break-words leading-relaxed ${
                    isMe
                      ? 'bg-[#10b981]/20 text-[#eceef2] border border-[#10b981]/40 rounded-tr-none'
                      : 'bg-[#1e2026] text-[#eceef2] border border-[#2b2d35] rounded-tl-none'
                  }`}
                >
                  {msg.message}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-2.5 border-t border-[#2b2d35] bg-[#111215] flex items-center gap-1.5">
        <input
          type="text"
          placeholder="Message room..."
          value={input}
          maxLength={2000}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 bg-[#17181c] border border-[#2b2d35] rounded px-2.5 py-1.5 text-xs text-white placeholder-[#606470] focus:border-[#10b981] focus:outline-hidden"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="p-1.5 bg-[#10b981] hover:bg-[#059669] text-white rounded transition disabled:opacity-40 cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
