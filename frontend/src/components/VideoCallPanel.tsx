import React, { useRef, useEffect } from 'react';
import { Video, VideoOff, Mic, MicOff, PhoneOff, PhoneCall, Users } from 'lucide-react';
import type { PeerStream } from '../services/webrtc';
import { useAuth } from '../context/AuthContext';

interface VideoCallPanelProps {
  inCall: boolean;
  localStream: MediaStream | null;
  remoteStreams: PeerStream[];
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  onJoinCall: () => void;
  onLeaveCall: () => void;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
}

const VideoTile: React.FC<{ stream: MediaStream; name: string; isLocal?: boolean }> = ({
  stream,
  name,
  isLocal = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative bg-[#111215] border border-[#2b2d35] rounded overflow-hidden aspect-video flex items-center justify-center shadow-xs">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal} // Avoid local feedback echo
        className="w-full h-full object-cover"
      />
      <div className="absolute bottom-1 left-1.5 px-1.5 py-0.2 rounded bg-black/80 text-[10px] font-medium text-white flex items-center gap-1">
        <span className="truncate max-w-[80px]">{name}</span>
        {isLocal && <span className="text-[#10b981]">(You)</span>}
      </div>
    </div>
  );
};

export const VideoCallPanel: React.FC<VideoCallPanelProps> = ({
  inCall,
  localStream,
  remoteStreams,
  isAudioMuted,
  isVideoMuted,
  onJoinCall,
  onLeaveCall,
  onToggleAudio,
  onToggleVideo,
}) => {
  const { user } = useAuth();

  if (!inCall) {
    return (
      <div className="p-2.5 bg-[#17181c] border-b border-[#2b2d35] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#606470]"></div>
          <span className="text-xs font-medium text-[#9a9ea8]">Voice & Video Call</span>
        </div>
        <button
          onClick={onJoinCall}
          className="px-2.5 py-1 bg-[#1e2026] hover:bg-[#262830] text-white border border-[#2b2d35] text-xs font-medium rounded transition flex items-center gap-1.5 cursor-pointer"
        >
          <PhoneCall className="w-3 h-3 text-[#10b981]" />
          <span>Join</span>
        </button>
      </div>
    );
  }

  return (
    <div className="p-2.5 bg-[#17181c] border-b border-[#2b2d35] flex flex-col gap-2.5">
      {/* Call Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
          <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse"></span>
          <span>In Call</span>
          <span className="text-[10px] font-normal text-[#9a9ea8] flex items-center gap-1 font-mono">
            <Users className="w-3 h-3" />
            {1 + remoteStreams.length}
          </span>
        </div>

        {/* Media Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleAudio}
            title={isAudioMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            aria-label={isAudioMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            className={`h-8 w-8 min-w-[32px] flex items-center justify-center rounded border text-xs transition cursor-pointer ${
              isAudioMuted
                ? 'bg-[#ef4444]/20 border-[#ef4444]/40 text-[#ef4444]'
                : 'bg-[#1e2026] border-[#2b2d35] text-white hover:bg-[#262830]'
            }`}
          >
            {isAudioMuted ? <MicOff className="w-[18px] h-[18px]" /> : <Mic className="w-[18px] h-[18px]" />}
          </button>

          <button
            onClick={onToggleVideo}
            title={isVideoMuted ? 'Start Camera' : 'Stop Camera'}
            aria-label={isVideoMuted ? 'Start Camera' : 'Stop Camera'}
            className={`h-8 w-8 min-w-[32px] flex items-center justify-center rounded border text-xs transition cursor-pointer ${
              isVideoMuted
                ? 'bg-[#ef4444]/20 border-[#ef4444]/40 text-[#ef4444]'
                : 'bg-[#1e2026] border-[#2b2d35] text-white hover:bg-[#262830]'
            }`}
          >
            {isVideoMuted ? <VideoOff className="w-[18px] h-[18px]" /> : <Video className="w-[18px] h-[18px]" />}
          </button>

          <button
            onClick={onLeaveCall}
            title="Leave Call"
            aria-label="Leave Call"
            className="h-8 px-2.5 bg-[#ef4444] hover:bg-[#dc2626] text-white rounded text-xs font-medium transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <PhoneOff className="w-4 h-4" />
            <span>Leave</span>
          </button>
        </div>
      </div>

      {/* Video Tiles Grid */}
      <div className="grid grid-cols-2 gap-1.5">
        {localStream && (
          <VideoTile stream={localStream} name={user?.name || 'Local'} isLocal={true} />
        )}
        {remoteStreams.map((peer) => (
          <VideoTile key={peer.userId} stream={peer.stream} name={peer.userName} />
        ))}
      </div>
    </div>
  );
};
