import { CodeSpaceWebSocket } from './websocket';

export interface PeerStream {
  userId: string;
  userName: string;
  stream: MediaStream;
}

export class WebRTCService {
  private localStream: MediaStream | null = null;
  private ws: CodeSpaceWebSocket;
  private currentUserId: string;
  private currentUserName: string;
  private peers: Map<string, RTCPeerConnection> = new Map();
  private onRemoteStreamsChange: (streams: PeerStream[]) => void;
  private remoteStreams: Map<string, PeerStream> = new Map();
  private isAudioMuted = false;
  private isVideoMuted = false;

  private configuration: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  constructor(
    ws: CodeSpaceWebSocket,
    currentUserId: string,
    currentUserName: string,
    onRemoteStreamsChange: (streams: PeerStream[]) => void
  ) {
    this.ws = ws;
    this.currentUserId = currentUserId;
    this.currentUserName = currentUserName;
    this.onRemoteStreamsChange = onRemoteStreamsChange;
  }

  public async startLocalMedia(): Promise<MediaStream> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
    } catch {
      // If user camera/mic is blocked or unavailable on machine, synthesize a canvas video track & silent audio track
      console.warn('Physical camera/mic unavailable. Initializing mock fallback media stream.');
      this.localStream = this.createMockStream();
    }
    return this.localStream;
  }

  private createMockStream(): MediaStream {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      let frame = 0;
      setInterval(() => {
        frame++;
        ctx.fillStyle = '#161b22';
        ctx.fillRect(0, 0, 320, 240);
        ctx.fillStyle = '#58a6ff';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.currentUserName, 160, 100);
        ctx.fillStyle = '#8b949e';
        ctx.font = '12px sans-serif';
        ctx.fillText('Virtual Video Stream', 160, 130);
        ctx.fillStyle = frame % 2 === 0 ? '#3fb950' : '#238636';
        ctx.beginPath();
        ctx.arc(160, 160, 8, 0, 2 * Math.PI);
        ctx.fill();
      }, 500);
    }
    const canvasStream = canvas.captureStream(15);
    
    // Audio context for silent audio track
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const dst = audioCtx.createMediaStreamDestination();
    osc.connect(dst);
    osc.start();
    const audioTrack = dst.stream.getAudioTracks()[0];
    audioTrack.enabled = false; // Muted by default
    canvasStream.addTrack(audioTrack);
    
    return canvasStream;
  }

  public async initiateCallWithUser(targetUserId: string, targetUserName: string) {
    if (!this.localStream || this.peers.has(targetUserId)) return;

    const pc = this.createPeerConnection(targetUserId, targetUserName);
    this.peers.set(targetUserId, pc);

    this.localStream.getTracks().forEach((track) => {
      pc.addTrack(track, this.localStream!);
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.ws.sendSignal(targetUserId, {
      type: 'offer',
      sdp: offer,
      sender_name: this.currentUserName,
    });
  }

  public async handleSignal(senderId: string, senderName: string, signalData: any) {
    if (senderId === this.currentUserId) return;

    if (signalData.type === 'offer') {
      let pc = this.peers.get(senderId);
      if (!pc) {
        pc = this.createPeerConnection(senderId, senderName);
        this.peers.set(senderId, pc);

        if (this.localStream) {
          this.localStream.getTracks().forEach((track) => {
            pc!.addTrack(track, this.localStream!);
          });
        }
      }

      await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.ws.sendSignal(senderId, {
        type: 'answer',
        sdp: answer,
        sender_name: this.currentUserName,
      });
    } else if (signalData.type === 'answer') {
      const pc = this.peers.get(senderId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
      }
    } else if (signalData.type === 'candidate' && signalData.candidate) {
      const pc = this.peers.get(senderId);
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
        } catch (e) {
          console.error('Error adding ICE candidate:', e);
        }
      }
    }
  }

  private createPeerConnection(remoteUserId: string, remoteUserName: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(this.configuration);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws.sendSignal(remoteUserId, {
          type: 'candidate',
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      this.remoteStreams.set(remoteUserId, {
        userId: remoteUserId,
        userName: remoteUserName,
        stream: remoteStream,
      });
      this.onRemoteStreamsChange(Array.from(this.remoteStreams.values()));
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'closed') {
        this.remoteStreams.delete(remoteUserId);
        this.peers.delete(remoteUserId);
        this.onRemoteStreamsChange(Array.from(this.remoteStreams.values()));
      }
    };

    return pc;
  }

  public toggleAudio(): boolean {
    if (!this.localStream) return false;
    this.isAudioMuted = !this.isAudioMuted;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !this.isAudioMuted;
    });
    return !this.isAudioMuted;
  }

  public toggleVideo(): boolean {
    if (!this.localStream) return false;
    this.isVideoMuted = !this.isVideoMuted;
    this.localStream.getVideoTracks().forEach((track) => {
      track.enabled = !this.isVideoMuted;
    });
    return !this.isVideoMuted;
  }

  public leaveCall() {
    this.peers.forEach((pc) => pc.close());
    this.peers.clear();
    this.remoteStreams.clear();
    this.onRemoteStreamsChange([]);

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
  }
}
