import React, { useState } from 'react';
import { X, Lock, Mail, User as UserIcon, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  initialMode: 'login' | 'register';
  onClose: () => void;
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode,
  onClose,
  onSuccess,
}) => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'register') {
        if (!name.trim()) throw new Error('Please enter your name');
        if (password.length < 6) throw new Error('Password must be at least 6 characters');
        await register(name.trim(), email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-[#17181c] border border-[#2b2d35] rounded-lg shadow-xl overflow-hidden animate-in fade-in duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#2b2d35]">
          <h2 className="text-sm font-semibold text-white">
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </h2>
          <button
            onClick={onClose}
            className="text-[#9a9ea8] hover:text-white transition p-1 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-[#2b2d35] bg-[#111215]">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(null); }}
            className={`flex-1 py-2 text-xs font-medium text-center transition cursor-pointer ${
              mode === 'login'
                ? 'text-[#10b981] border-b-2 border-[#10b981] bg-[#17181c]'
                : 'text-[#9a9ea8] hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(null); }}
            className={`flex-1 py-2 text-xs font-medium text-center transition cursor-pointer ${
              mode === 'register'
                ? 'text-[#10b981] border-b-2 border-[#10b981] bg-[#17181c]'
                : 'text-[#9a9ea8] hover:text-white'
            }`}
          >
            Register
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          {error && (
            <div className="p-2.5 bg-[#ef4444]/10 border border-[#ef4444]/30 rounded text-xs text-[#f87171] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-[#eceef2] mb-1">Full Name</label>
              <div className="relative">
                <UserIcon className="w-3.5 h-3.5 text-[#606470] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="Your Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#111215] border border-[#2b2d35] rounded pl-8 pr-3 py-1.5 text-xs text-white placeholder-[#606470] focus:border-[#10b981] focus:outline-hidden transition"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#eceef2] mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-[#606470] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                placeholder="developer@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#111215] border border-[#2b2d35] rounded pl-8 pr-3 py-1.5 text-xs text-white placeholder-[#606470] focus:border-[#10b981] focus:outline-hidden transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#eceef2] mb-1">Password</label>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-[#606470] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#111215] border border-[#2b2d35] rounded pl-8 pr-3 py-1.5 text-xs text-white placeholder-[#606470] focus:border-[#10b981] focus:outline-hidden transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-[#10b981] hover:bg-[#059669] text-white text-xs font-semibold rounded transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <span>{loading ? 'Authenticating...' : mode === 'login' ? 'Sign In' : 'Create Account'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
