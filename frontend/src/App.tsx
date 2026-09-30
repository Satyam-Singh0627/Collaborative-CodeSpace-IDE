import { useEffect, useState } from 'react';
import { Terminal, ShieldCheck, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface HealthData {
  status: string;
  timestamp: string;
  services: {
    api: string;
    websocket: string;
    database: string;
  };
}

export default function App() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/health');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data: HealthData = await res.json();
      setHealth(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to connect to backend server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-[#0d1117] text-[#c9d1d9]">
      {/* Header bar */}
      <header className="border-b border-[#30363d] bg-[#161b22] px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#1f6feb]/20 text-[#58a6ff] rounded-lg border border-[#1f6feb]/40">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white tracking-tight">Collaborative CodeSpace</h1>
            <p className="text-xs text-[#8b949e]">Code Together. Communicate Together. Build Together.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border bg-[#161b22] border-[#30363d]">
            {loading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-[#e3b341] animate-spin" />
                <span className="text-[#8b949e]">Checking API...</span>
              </>
            ) : health ? (
              <>
                <span className="w-2 h-2 rounded-full bg-[#3fb950] animate-pulse"></span>
                <span className="text-[#3fb950]">API Online</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-[#f85149]"></span>
                <span className="text-[#f85149]">API Offline</span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-4xl mx-auto w-full">
        <div className="w-full bg-[#161b22] border border-[#30363d] rounded-xl p-8 shadow-xl">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#30363d]">
            <ShieldCheck className="w-6 h-6 text-[#58a6ff]" />
            <div>
              <h2 className="text-xl font-bold text-white">System Verification (Phase 2.1)</h2>
              <p className="text-sm text-[#8b949e]">Frontend and backend development environment active</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-white">
                <CheckCircle2 className="w-4 h-4 text-[#3fb950]" />
                <span>Frontend Layer</span>
              </div>
              <ul className="text-xs text-[#8b949e] space-y-1.5 list-disc list-inside">
                <li>Vite 8 + React 19 + TypeScript active</li>
                <li>Tailwind CSS loaded</li>
                <li>Monaco Editor ready for mount</li>
              </ul>
            </div>

            <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-white">
                {health ? (
                  <CheckCircle2 className="w-4 h-4 text-[#3fb950]" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-[#f85149]" />
                )}
                <span>Backend Layer</span>
              </div>
              {loading ? (
                <p className="text-xs text-[#8b949e]">Pinging backend /api/health endpoint...</p>
              ) : health ? (
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-[#8b949e]">
                    <span>Status:</span>
                    <span className="text-[#3fb950] font-mono">{health.status}</span>
                  </div>
                  <div className="flex justify-between text-[#8b949e]">
                    <span>API Service:</span>
                    <span className="text-[#58a6ff] font-mono">{health.services.api}</span>
                  </div>
                  <div className="flex justify-between text-[#8b949e]">
                    <span>WebSocket:</span>
                    <span className="text-[#58a6ff] font-mono">{health.services.websocket}</span>
                  </div>
                  <div className="flex justify-between text-[#8b949e]">
                    <span>Database:</span>
                    <span className="text-[#58a6ff] font-mono">{health.services.database}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[#f85149]">Error: {error}</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[#30363d] text-xs text-[#8b949e]">
            <span>Next: Phase 2.2 — SQLite Persistence, Auth & Rooms</span>
            <button
              onClick={fetchHealth}
              disabled={loading}
              className="px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] text-white rounded border border-[#30363d] transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Re-test Backend
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#30363d] bg-[#161b22] px-6 py-3 text-center text-xs text-[#8b949e]">
        Collaborative CodeSpace &copy; 2026 &bull; Real-Time Hackathon Prototype
      </footer>
    </div>
  );
}
