import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { LandingPage } from './components/LandingPage';
import { Workspace } from './components/Workspace';
import { AuthModal } from './components/AuthModal';
import { CreateRoomModal } from './components/CreateRoomModal';
import { JoinRoomModal } from './components/JoinRoomModal';

function MainApp() {
  const { isAuthenticated } = useAuth();
  
  // Navigation & Modal state
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [joinRoomOpen, setJoinRoomOpen] = useState(false);

  // Sync room code from URL hash (e.g. #ROOM-XXXX)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '').trim().toUpperCase();
      if (hash && hash.startsWith('ROOM-')) {
        setActiveRoomCode(hash);
      } else {
        setActiveRoomCode(null);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleOpenAuth = (mode: 'login' | 'register') => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  const handleEnterRoom = (code: string) => {
    const normalized = code.toUpperCase().trim();
    window.location.hash = normalized;
    setActiveRoomCode(normalized);
  };

  const handleLeaveRoom = () => {
    window.location.hash = '';
    setActiveRoomCode(null);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#0d1117] text-[#c9d1d9] font-sans">
      {/* Top Navbar */}
      <Navbar
        onOpenAuth={handleOpenAuth}
        onOpenCreateRoom={() => {
          if (!isAuthenticated) handleOpenAuth('login');
          else setCreateRoomOpen(true);
        }}
        onOpenJoinRoom={() => {
          if (!isAuthenticated) handleOpenAuth('login');
          else setJoinRoomOpen(true);
        }}
        inRoom={Boolean(activeRoomCode && isAuthenticated)}
      />

      {/* Main Content Area */}
      {activeRoomCode && isAuthenticated ? (
        <Workspace
          roomCode={activeRoomCode}
          onLeaveRoom={handleLeaveRoom}
        />
      ) : (
        <LandingPage
          onOpenCreateRoom={() => {
            if (!isAuthenticated) handleOpenAuth('login');
            else setCreateRoomOpen(true);
          }}
          onOpenJoinRoom={() => {
            if (!isAuthenticated) handleOpenAuth('login');
            else setJoinRoomOpen(true);
          }}
          onOpenAuth={handleOpenAuth}
        />
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        initialMode={authMode}
        onClose={() => setAuthModalOpen(false)}
      />

      {/* Room Modals */}
      <CreateRoomModal
        isOpen={createRoomOpen}
        onClose={() => setCreateRoomOpen(false)}
        onRoomCreated={(code) => handleEnterRoom(code)}
      />

      <JoinRoomModal
        isOpen={joinRoomOpen}
        onClose={() => setJoinRoomOpen(false)}
        onRoomJoined={(code) => handleEnterRoom(code)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
