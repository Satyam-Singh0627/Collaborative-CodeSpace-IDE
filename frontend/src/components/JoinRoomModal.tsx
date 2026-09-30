import React, { useState } from 'react';
import { X, LogIn, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

interface JoinRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRoomJoined: (roomCode: string) => void;
}

export const JoinRoomModal: React.FC<JoinRoomModalProps> = ({
  isOpen,
  onClose,
  onRoomJoined,
}) => {
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = roomCode.trim().toUpperCase();
    if (!cleanCode) {
      setError('Please enter a valid room code (e.g. ROOM-7F3A)');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const room = await api.joinRoom(cleanCode);
      onRoomJoined(room.room_code);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Room not found. Check the room ID and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-[#17181c] border border-[#2b2d35] rounded-lg shadow-xl overflow-hidden animate-in fade-in duration-150">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#2b2d35]">
          <div className="flex items-center gap-2">
            <LogIn className="w-4 h-4 text-[#10b981]" />
            <h2 className="text-sm font-semibold text-white">Join Room</h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#9a9ea8] hover:text-white transition p-1 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          {error && (
            <div className="p-2.5 bg-[#ef4444]/10 border border-[#ef4444]/30 rounded text-xs text-[#f87171] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#eceef2] mb-1.5">Room Code</label>
            <input
              type="text"
              required
              autoFocus
              placeholder="e.g. ROOM-7F3A"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              className="w-full bg-[#111215] border border-[#2b2d35] rounded px-3 py-1.5 text-xs font-mono uppercase text-white placeholder-[#606470] focus:border-[#10b981] focus:outline-hidden tracking-wider transition"
            />
          </div>

          <p className="text-xs text-[#9a9ea8]">
            Enter the 4-digit code provided by your teammate or room creator.
          </p>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-[#10b981] hover:bg-[#059669] text-white text-xs font-semibold rounded transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <span>{loading ? 'Joining...' : 'Enter Room'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
