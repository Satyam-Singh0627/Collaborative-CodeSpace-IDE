import React from 'react';
import { Terminal, Users, Video, Play, Sparkles, FolderTree, ArrowRight, ShieldCheck, Code2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface LandingPageProps {
  onOpenCreateRoom: () => void;
  onOpenJoinRoom: () => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenCreateRoom,
  onOpenJoinRoom,
  onOpenAuth,
}) => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="flex-1 flex flex-col bg-[#111215] text-[#eceef2]">
      {/* Hero Section */}
      <section className="border-b border-[#2b2d35] px-6 py-16 text-center flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-[#17181c] border border-[#2b2d35] text-[#10b981] text-xs font-mono mb-5">
          <Terminal className="w-3.5 h-3.5" />
          <span>Real-Time Collaborative Code Workspace</span>
        </div>

        <h1 className="text-3xl md:text-5xl font-bold text-white tracking-tight max-w-3xl leading-tight mb-4">
          Real-Time Code Collaboration <span className="text-[#10b981]">Built for Developers</span>
        </h1>

        <p className="text-sm md:text-base text-[#9a9ea8] max-w-2xl mx-auto mb-8 font-normal leading-relaxed">
          A focused developer environment combining Monaco editor, multi-language sandbox execution, 
          WebRTC audio/video, WebSocket synchronization, and dynamic AI code intelligence.
        </p>

        {/* Primary CTA Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
          {isAuthenticated ? (
            <>
              <button
                onClick={onOpenCreateRoom}
                className="px-5 py-2.5 bg-[#10b981] hover:bg-[#059669] text-white font-semibold text-xs rounded transition flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <span>Create Coding Room</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onOpenJoinRoom}
                className="px-5 py-2.5 bg-[#17181c] hover:bg-[#1e2026] text-white font-medium text-xs border border-[#2b2d35] rounded transition flex items-center gap-2 cursor-pointer"
              >
                <span>Join with Code</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onOpenAuth('register')}
                className="px-5 py-2.5 bg-[#10b981] hover:bg-[#059669] text-white font-semibold text-xs rounded transition flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <span>Get Started Free</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onOpenAuth('login')}
                className="px-5 py-2.5 bg-[#17181c] hover:bg-[#1e2026] text-white font-medium text-xs border border-[#2b2d35] rounded transition cursor-pointer"
              >
                Sign In
              </button>
            </>
          )}
        </div>

        {/* Workspace Preview */}
        <div className="w-full max-w-4xl border border-[#2b2d35] rounded-lg overflow-hidden bg-[#17181c] shadow-xl text-left">
          {/* Mock Window Top Bar */}
          <div className="bg-[#111215] border-b border-[#2b2d35] px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]/70"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]/70"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]/70"></span>
              <span className="text-xs font-mono text-[#9a9ea8] ml-2">ROOM-DEV • main.py</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-[#9a9ea8] font-mono text-[11px]">
                <Code2 className="w-3.5 h-3.5 text-[#10b981]" />
                Python 3.8
              </span>
              <span className="px-2 py-0.5 rounded bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30 font-mono text-[10px]">
                ● Live Sync Active
              </span>
            </div>
          </div>

          {/* Mock Inner Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 text-xs font-mono">
            {/* Mock Files */}
            <div className="border-r border-[#2b2d35] p-3 bg-[#111215]/60 space-y-1">
              <div className="text-[#606470] text-[10px] font-bold uppercase tracking-wider mb-2">Project Files</div>
              <div className="flex items-center gap-1.5 text-[#eceef2] bg-[#1e2026] px-2 py-1 rounded border border-[#2b2d35]">
                <span>📄</span> main.py
              </div>
              <div className="flex items-center gap-1.5 text-[#9a9ea8] px-2 py-1 hover:text-white">
                <span>📄</span> utils.py
              </div>
              <div className="flex items-center gap-1.5 text-[#9a9ea8] px-2 py-1 hover:text-white">
                <span>📄</span> README.md
              </div>
            </div>

            {/* Mock Editor */}
            <div className="col-span-2 p-4 bg-[#111215] leading-relaxed">
              <div className="text-[#606470] mb-1"># Live Multi-File Execution</div>
              <div className="text-[#f87171]">from <span className="text-[#38bdf8]">utils</span> <span className="text-[#f87171]">import</span> <span className="text-[#c084fc]">greet_team</span></div>
              <div className="mt-1 text-[#f87171]">def <span className="text-[#c084fc]">main</span><span className="text-white">():</span></div>
              <div className="pl-4 text-white">team = [<span className="text-[#a7f3d0]">"Developer A"</span>, <span className="text-[#a7f3d0]">"Developer B"</span>]</div>
              <div className="pl-4 text-[#38bdf8]">print<span className="text-white">(greet_team(team))</span></div>
              
              <div className="mt-4 pt-2.5 border-t border-[#2b2d35] flex items-center justify-between text-[11px] text-[#9a9ea8]">
                <span className="text-[#10b981]">Output: Welcome to Collaborative CodeSpace!</span>
                <span className="text-[#606470]">0.02s</span>
              </div>
            </div>

            {/* Mock Chat */}
            <div className="border-l border-[#2b2d35] p-3 bg-[#111215]/60 flex flex-col justify-between">
              <div>
                <div className="text-[#606470] text-[10px] font-bold uppercase tracking-wider mb-2">Room Chat</div>
                <div className="space-y-1.5 text-[11px]">
                  <div className="bg-[#17181c] p-2 rounded border border-[#2b2d35]">
                    <span className="text-[#10b981] font-semibold">Teammate:</span>
                    <p className="text-[#eceef2] font-sans text-xs mt-0.5">Let's test the endpoint response.</p>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-[#2b2d35] text-[11px] text-[#9a9ea8] flex items-center gap-1.5 font-mono">
                <ShieldCheck className="w-3.5 h-3.5 text-[#10b981]" />
                <span>Judge0 Sandbox</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Architecture Grid */}
      <section className="py-12 px-6 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded border border-[#2b2d35] bg-[#17181c]">
            <div className="w-8 h-8 rounded bg-[#1e2026] text-[#10b981] flex items-center justify-center mb-3">
              <Terminal className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">Monaco Code Editor</h3>
            <p className="text-xs text-[#9a9ea8] leading-relaxed">
              VS Code editor engine with multi-file tabs, syntax highlighting for 13+ languages, and debounce inline completions.
            </p>
          </div>

          <div className="p-4 rounded border border-[#2b2d35] bg-[#17181c]">
            <div className="w-8 h-8 rounded bg-[#1e2026] text-[#38bdf8] flex items-center justify-center mb-3">
              <Play className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">Multi-Language Sandbox</h3>
            <p className="text-xs text-[#9a9ea8] leading-relaxed">
              Execute Python, JavaScript, TypeScript, C, C++, Java, Go, Rust, PHP, and Ruby with isolated runtime environments.
            </p>
          </div>

          <div className="p-4 rounded border border-[#2b2d35] bg-[#17181c]">
            <div className="w-8 h-8 rounded bg-[#1e2026] text-[#8b5cf6] flex items-center justify-center mb-3">
              <Sparkles className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">Dynamic AI Assistant</h3>
            <p className="text-xs text-[#9a9ea8] leading-relaxed">
              Context-aware code explanations, bug diagnosis, snippet generation, and natural-language coding assistance.
            </p>
          </div>

          <div className="p-4 rounded border border-[#2b2d35] bg-[#17181c]">
            <div className="w-8 h-8 rounded bg-[#1e2026] text-[#10b981] flex items-center justify-center mb-3">
              <Users className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">Live Presence & Sync</h3>
            <p className="text-xs text-[#9a9ea8] leading-relaxed">
              Real-time WebSocket code synchronization, cursor tracking, and collaborative chat.
            </p>
          </div>

          <div className="p-4 rounded border border-[#2b2d35] bg-[#17181c]">
            <div className="w-8 h-8 rounded bg-[#1e2026] text-[#f87171] flex items-center justify-center mb-3">
              <Video className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">WebRTC Audio & Video</h3>
            <p className="text-xs text-[#9a9ea8] leading-relaxed">
              Direct peer-to-peer audio and video communication within the room without external conference links.
            </p>
          </div>

          <div className="p-4 rounded border border-[#2b2d35] bg-[#17181c]">
            <div className="w-8 h-8 rounded bg-[#1e2026] text-[#fbbf24] flex items-center justify-center mb-3">
              <FolderTree className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">Multi-File Project Explorer</h3>
            <p className="text-xs text-[#9a9ea8] leading-relaxed">
              Create, edit, rename, and delete project files with persistent storage per room.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
