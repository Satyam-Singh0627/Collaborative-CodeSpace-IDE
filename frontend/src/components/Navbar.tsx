import React from 'react';
import { Terminal, LogOut, User as UserIcon, Plus, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  onOpenAuth: (mode: 'login' | 'register') => void;
  onOpenCreateRoom: () => void;
  onOpenJoinRoom: () => void;
  inRoom?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenAuth,
  onOpenCreateRoom,
  onOpenJoinRoom,
  inRoom = false,
}) => {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <header className="h-12 border-b border-[#2b2d35] bg-[#17181c] px-4 flex items-center justify-between z-20 select-none">
      {/* Brand logo & workspace title */}
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-md bg-[#262830] border border-[#363945] flex items-center justify-center shadow-xs">
          <Terminal className="w-4 h-4 text-[#10b981]" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-tight text-white uppercase">Collaborative CodeSpace</span>
            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#202227] text-[#9a9ea8] border border-[#2b2d35]">
              IDE
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2.5">
        {isAuthenticated ? (
          <>
            {!inRoom && (
              <div className="flex items-center gap-2">
                <button
                  onClick={onOpenJoinRoom}
                  className="px-2.5 py-1 text-xs font-medium text-[#eceef2] bg-[#202227] hover:bg-[#262830] border border-[#2b2d35] rounded-md transition cursor-pointer flex items-center gap-1.5"
                >
                  <LogIn className="w-3.5 h-3.5 text-[#9a9ea8]" />
                  <span>Join Room</span>
                </button>
                <button
                  onClick={onOpenCreateRoom}
                  className="px-3 py-1 text-xs font-medium text-white bg-[#10b981] hover:bg-[#059669] rounded-md transition shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Room</span>
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 pl-2 border-l border-[#2b2d35]">
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#111215] border border-[#2b2d35]">
                <UserIcon className="w-3.5 h-3.5 text-[#10b981]" />
                <span className="text-xs font-medium text-[#eceef2]">{user?.name}</span>
              </div>
              <button
                onClick={logout}
                title="Sign out"
                className="p-1 text-[#9a9ea8] hover:text-[#ef4444] hover:bg-[#202227] rounded transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenAuth('login')}
              className="px-3 py-1 text-xs font-medium text-[#9a9ea8] hover:text-white transition cursor-pointer"
            >
              Sign In
            </button>
            <button
              onClick={() => onOpenAuth('register')}
              className="px-3 py-1 text-xs font-medium text-white bg-[#10b981] hover:bg-[#059669] rounded-md transition shadow-xs cursor-pointer"
            >
              Get Started
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
