import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteTrackPublication,
  RemoteTrack,
  Track,
  LocalAudioTrack,
  LocalVideoTrack,
  RemoteVideoTrack,
  createLocalAudioTrack,
  createLocalVideoTrack,
  ConnectionState
} from 'livekit-client';
import { getAccessToken, startWorker } from '../services/api';
import { RoomConfig, ParticipantInfo, LanguageCode } from '../types';

// Remote video info with track and participant details
export interface RemoteVideoInfo {
  participantId: string;
  participantName: string;
  track: RemoteVideoTrack;
}

export interface UseLiveKitResult {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  participants: ParticipantInfo[];
  isTranslating: boolean;
  isTalking: boolean;  // Push-to-Talk state
  isVideoEnabled: boolean;  // Video toggle state
  lastTranscription: string | null;   // What YOU said
  lastTranslation: string | null;     // Translation of what YOU said (for your reference)
  incomingMessage: IncomingMessage | null;  // Message from OTHER participant
  localVideoTrack: LocalVideoTrack | null;  // Local video track for UI to attach
  remoteVideoTracks: RemoteVideoInfo[];     // Remote video tracks for UI to attach
  disconnect: () => Promise<void>;
  startTalking: () => void;  // Push-to-Talk: start
  stopTalking: () => void;   // Push-to-Talk: stop
  toggleVideo: () => void;   // Toggle video on/off
}

// Message received from another participant
export interface IncomingMessage {
  from: string;
  originalText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  wasTranslated: boolean;
  timestamp: number;
}

// Translation WebSocket URL
const WS_URL = 'ws://localhost:3001/ws/translate';

/**
 * Resample audio from one sample rate to another
 * Uses linear interpolation for simplicity
 */
function resampleAudio(
  inputSamples: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
): Float32Array {
  if (inputSampleRate === outputSampleRate) {
    return inputSamples;
  }

  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.floor(inputSamples.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, inputSamples.length - 1);
    const fraction = srcIndex - srcIndexFloor;

    // Linear interpolation
    output[i] = inputSamples[srcIndexFloor] * (1 - fraction) + 
                inputSamples[srcIndexCeil] * fraction;
  }

  return output;
}

/**
 * useLiveKit Hook
 * 
 * @param config - Room configuration (name, participant name, target language)
 * @returns LiveKit connection state and controls
 */
export function useLiveKit(config: RoomConfig): UseLiveKitResult {
  const [room] = useState(() => new Room());
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isTalking, setIsTalking] = useState(false);  // Push-to-Talk state
  const [lastTranscription, setLastTranscription] = useState<string | null>(null);
  const [lastTranslation, setLastTranslation] = useState<string | null>(null);
  const [incomingMessage, setIncomingMessage] = useState<IncomingMessage | null>(null);
  
  // Refs
  const isMountedRef = useRef(true);
  const isConnectingRef = useRef(false);
  const connectionAttemptRef = useRef(0);
  const hasConnectedRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);
  const captureContextRef = useRef<AudioContext | null>(null);   // For capturing mic audio
  const playbackContextRef = useRef<AudioContext | null>(null);  // For playing translated audio
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const localTrackRef = useRef<LocalAudioTrack | null>(null);
  const localVideoTrackRef = useRef<LocalVideoTrack | null>(null);
  const [localVideoTrack, setLocalVideoTrack] = useState<LocalVideoTrack | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const micStreamRef = useRef<MediaStream | null>(null);  // Direct mic access for translation
  const isTalkingRef = useRef(false);  // Ref for audio processor callback
  
  // State for remote video tracks (store tracks, not elements)
  const [remoteVideoTracks, setRemoteVideoTracks] = useState<RemoteVideoInfo[]>([]);

  /**
   * Update participants list
   */
  const updateParticipants = useCallback(() => {
    const participantList: ParticipantInfo[] = [];

    room.remoteParticipants.forEach((participant) => {
      participantList.push({
        id: participant.identity,
        name: participant.name || participant.identity,
        isSpeaking: participant.isSpeaking,
        audioLevel: participant.audioLevel
      });
    });

    setParticipants(participantList);
  }, [room]);

  /**
   * Connect to translation WebSocket
   */
  const connectTranslation = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    console.log('[Translation] Connecting to WebSocket...');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log('[Translation] WebSocket connected');
      setIsTranslating(true);
      
      // Send start message
      ws.send(JSON.stringify({
        type: 'start',
        roomName: config.roomName,
        participantId: config.participantName,
        targetLanguage: config.targetLanguage,
        sampleRate: 16000,
        channels: 1,
      }));
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        // Binary data = translated audio (MP3)
        console.log(`[Translation] Received audio: ${event.data.byteLength} bytes`);
        playTranslatedAudio(event.data);
      } else {
        // JSON message
        try {
          const message = JSON.parse(event.data);
          handleTranslationMessage(message);
        } catch (e) {
          console.error('[Translation] Failed to parse message:', e);
        }
      }
    };

    ws.onclose = () => {
      console.log('[Translation] WebSocket closed');
      setIsTranslating(false);
      wsRef.current = null;
    };

    ws.onerror = (error) => {
      console.error('[Translation] WebSocket error:', error);
      setIsTranslating(false);
    };
  }, [config]);

  /**
   * Handle translation messages
   */
  const handleTranslationMessage = useCallback((message: any) => {
    console.log('[Translation] Message:', message.type, message);

    switch (message.type) {
      case 'started':
        console.log(`[Translation] Session started (${message.roomParticipants} in room)`);
        break;

      case 'processing':
        console.log(`[Translation] Processing ${message.audioSize} bytes...`);
        break;

      case 'transcription':
        // This is YOUR speech transcribed (for your reference)
        setLastTranscription(message.text);
        console.log(`[Translation] Your transcription: "${message.text}"`);
        break;

      case 'incoming_message':
        // This is a MESSAGE FROM ANOTHER PARTICIPANT (translated for you!)
        console.log(`[Translation] 📥 Message from ${message.from}: "${message.translatedText}"`);
        setIncomingMessage({
          from: message.from,
          originalText: message.originalText,
          translatedText: message.translatedText,
          sourceLanguage: message.sourceLanguage,
          targetLanguage: message.targetLanguage,
          wasTranslated: message.wasTranslated,
          timestamp: Date.now(),
        });
        break;

      case 'no_speech':
        console.log('[Translation] No speech detected');
        break;

      case 'error':
        console.error('[Translation] Error:', message.error);
        break;
    }
  }, []);

  /**
   * Play translated audio (MP3)
   * Uses a SEPARATE AudioContext from capture to avoid conflicts
   */
  const playTranslatedAudio = useCallback(async (audioData: ArrayBuffer) => {
    try {
      // Use dedicated playback context (separate from capture!)
      if (!playbackContextRef.current || playbackContextRef.current.state === 'closed') {
        playbackContextRef.current = new AudioContext();
        console.log('[Translation] Created new playback AudioContext');
      }

      const audioContext = playbackContextRef.current;
      
      // Resume if suspended (browser autoplay policy)
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // Decode MP3 audio
      const audioBuffer = await audioContext.decodeAudioData(audioData.slice(0));
      
      // Create and play source
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start(0);
      
      console.log('[Translation] 🔊 Playing translated audio');
    } catch (error) {
      console.error('[Translation] Failed to play audio:', error);
    }
  }, []);

  /**
   * Start capturing audio DIRECTLY from microphone for translation
   * This is separate from LiveKit track because we need unmuted audio
   */
  const startAudioCapture = useCallback(async () => {
    // Prevent duplicate capture
    if (micStreamRef.current || processorRef.current) {
      console.log('[Translation] Audio capture already active, skipping');
      return;
    }

    console.log('[Translation] Starting audio capture directly from microphone...');

    try {
      // Get microphone access DIRECTLY (not through LiveKit)
      // This ensures we get unmuted audio for translation
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      micStreamRef.current = micStream;
      
      // Debug: Check track state
      const audioTracks = micStream.getAudioTracks();
      console.log(`[Translation] Got microphone: ${audioTracks.length} track(s)`);
      audioTracks.forEach((track, i) => {
        console.log(`[Translation] Track ${i}: enabled=${track.enabled}, readyState=${track.readyState}, muted=${track.muted}`);
        console.log(`[Translation] Track ${i} settings:`, track.getSettings());
      });

      if (audioTracks.length === 0 || audioTracks[0].readyState !== 'live') {
        console.error('[Translation] Microphone track not active!');
        return;
      }

      // Create audio context - let browser use its native sample rate
      // Use dedicated capture context (separate from playback!)
      const audioContext = new AudioContext();
      captureContextRef.current = audioContext;
      
      // Resume AudioContext if needed (Chrome autoplay policy)
      if (audioContext.state === 'suspended') {
        console.log('[Translation] Resuming AudioContext...');
        await audioContext.resume();
      }
      console.log(`[Translation] AudioContext state: ${audioContext.state}`);
      
      const nativeSampleRate = audioContext.sampleRate;
      const targetSampleRate = 16000;
      console.log(`[Translation] Native sample rate: ${nativeSampleRate}Hz, target: ${targetSampleRate}Hz`);

      // Create source from our direct mic stream
      const source = audioContext.createMediaStreamSource(micStream);

      // Create script processor for capturing audio samples
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // Debug: Track frames to verify audio is flowing
      let frameCount = 0;
      let lastLogTime = Date.now();

      processor.onaudioprocess = (event) => {
        frameCount++;
        
        // Log every 2 seconds to show audio is flowing
        const now = Date.now();
        if (now - lastLogTime > 2000) {
          const inputData = event.inputBuffer.getChannelData(0);
          let max = 0, min = 0, sum = 0;
          for (let i = 0; i < inputData.length; i++) {
            const v = inputData[i];
            if (v > max) max = v;
            if (v < min) min = v;
            sum += Math.abs(v);
          }
          const avg = sum / inputData.length;
          console.log(`[Translation] Audio flowing: ${frameCount} frames, range=[${min.toFixed(4)}, ${max.toFixed(4)}], avg=${avg.toFixed(4)}, talking=${isTalkingRef.current}`);
          lastLogTime = now;
          frameCount = 0;
        }

        // Only send audio when Push-to-Talk is active
        if (!isTalkingRef.current) {
          return;
        }

        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          return;
        }

        // Get audio samples
        const inputData = event.inputBuffer.getChannelData(0);
        
        // Resample from native rate to 16kHz if needed
        let samples: Float32Array;
        if (nativeSampleRate !== targetSampleRate) {
          samples = resampleAudio(inputData, nativeSampleRate, targetSampleRate);
        } else {
          samples = inputData;
        }
        
        // Convert Float32 to Int16 (PCM)
        const int16Data = new Int16Array(samples.length);
        for (let i = 0; i < samples.length; i++) {
          const s = Math.max(-1, Math.min(1, samples[i]));
          int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Send to translation service
        wsRef.current.send(int16Data.buffer);
      };

      // Connect nodes - connect to destination to keep processing alive
      source.connect(processor);
      processor.connect(audioContext.destination);

      console.log('[Translation] ✅ Audio capture started successfully');
    } catch (err) {
      console.error('[Translation] Failed to get microphone access:', err);
    }
  }, []);

  /**
   * Handle remote track subscribed
   */
  const handleTrackSubscribed = useCallback(
    (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      if (track.kind === Track.Kind.Audio) {
        console.log(`[LiveKit] Subscribed to audio from ${participant.name}`);
        
        // Attach audio track to an HTML audio element for playback
        const audioElement = track.attach();
        audioElement.play().catch((err) => {
          console.error('[LiveKit] Error playing audio:', err);
        });

        document.body.appendChild(audioElement);
      } else if (track.kind === Track.Kind.Video) {
        console.log(`[LiveKit] 📹 Subscribed to video from ${participant.name} (${participant.identity})`);
        
        // Store the track itself (not an attached element) so UI can attach it
        const videoTrack = track as RemoteVideoTrack;
        
        setRemoteVideoTracks(prev => {
          // Remove any existing track for this participant
          const filtered = prev.filter(v => v.participantId !== participant.identity);
          return [...filtered, {
            participantId: participant.identity,
            participantName: participant.name || participant.identity,
            track: videoTrack
          }];
        });
        
        updateParticipants();
      }
    },
    [updateParticipants]
  );

  /**
   * Handle remote track unsubscribed
   */
  const handleTrackUnsubscribed = useCallback(
    (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      if (track.kind === Track.Kind.Audio) {
        console.log(`[LiveKit] Unsubscribed from audio from ${participant.name}`);
        track.detach().forEach((element) => element.remove());
      } else if (track.kind === Track.Kind.Video) {
        console.log(`[LiveKit] 📹 Unsubscribed from video from ${participant.name}`);
        track.detach().forEach((element) => element.remove());
        
        // Remove from state
        setRemoteVideoTracks(prev => prev.filter(v => v.participantId !== participant.identity));
      }
    },
    []
  );

  /**
   * Connect to LiveKit room
   */
  useEffect(() => {
    const attemptNumber = ++connectionAttemptRef.current;
    isMountedRef.current = true;
    
    console.log(`[LiveKit] Effect run #${attemptNumber} - Starting`);

    async function connect() {
      if (isConnectingRef.current) {
        console.log(`[LiveKit] Attempt #${attemptNumber} - Already connecting, aborting`);
        return;
      }

      if (room.state === ConnectionState.Connected) {
        console.log(`[LiveKit] Attempt #${attemptNumber} - Already connected, skipping`);
        if (!isConnected) {
          setIsConnected(true);
          setIsConnecting(false);
        }
        return;
      }

      if (hasConnectedRef.current && room.state === ConnectionState.Disconnected) {
        console.log(`[LiveKit] Attempt #${attemptNumber} - Previous connection detected, resetting`);
        hasConnectedRef.current = false;
      }

      isConnectingRef.current = true;
      console.log(`[LiveKit] Attempt #${attemptNumber} - Connecting to room: ${config.roomName}`);

      try {
        // Step 1: Get access token from backend
        const tokenResponse = await getAccessToken(config);
        console.log(`[LiveKit] Attempt #${attemptNumber} - Received access token`);

        if (!isMountedRef.current) {
          console.log(`[LiveKit] Attempt #${attemptNumber} - Component unmounted during token fetch, aborting`);
          isConnectingRef.current = false;
          return;
        }

        // Step 2: Set up event listeners
        console.log(`[LiveKit] Attempt #${attemptNumber} - Setting up event listeners`);
        room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
        room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
        room.on(RoomEvent.ParticipantConnected, updateParticipants);
        room.on(RoomEvent.ParticipantDisconnected, updateParticipants);
        room.on(RoomEvent.ActiveSpeakersChanged, updateParticipants);

        // Step 3: Connect to LiveKit server
        console.log(`[LiveKit] Attempt #${attemptNumber} - Calling room.connect()...`);
        console.log(`[LiveKit] Attempt #${attemptNumber} - URL: ${tokenResponse.url}`);
        
        await room.connect(tokenResponse.url, tokenResponse.token, {
          autoSubscribe: true,
          dynacast: true,
          rtcConfig: {
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
          }
        });
        
        hasConnectedRef.current = true;
        console.log(`[LiveKit] Attempt #${attemptNumber} - Connected to room successfully`);

        if (!isMountedRef.current) {
          console.log(`[LiveKit] Attempt #${attemptNumber} - Component unmounted after connect, disconnecting`);
          await room.disconnect();
          isConnectingRef.current = false;
          return;
        }

        // Step 4: Create local microphone audio track (but keep it muted!)
        // We don't want others to hear the original audio - only translated audio via WebSocket
        console.log(`[LiveKit] Attempt #${attemptNumber} - Creating audio track (muted by default)...`);
        const audioTrack = await createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000, // Match translation service
        });
        
        localTrackRef.current = audioTrack;
        
        // Publish the track but MUTE it - others should only hear translations
        const publication = await room.localParticipant.publishTrack(audioTrack);
        await publication.mute(); // Mute so original audio isn't sent to others
        console.log(`[LiveKit] Attempt #${attemptNumber} - Published microphone track (muted - translations only)`);

        // Step 4b: Create and publish local video track
        console.log(`[LiveKit] Attempt #${attemptNumber} - Creating video track...`);
        try {
          const videoTrack = await createLocalVideoTrack({
            resolution: { width: 640, height: 480 },
            facingMode: 'user',
          });
          
          localVideoTrackRef.current = videoTrack;
          setLocalVideoTrack(videoTrack); // Expose to UI for rendering
          
          // Publish video track (not muted - video is always sent)
          await room.localParticipant.publishTrack(videoTrack);
          console.log(`[LiveKit] Attempt #${attemptNumber} - 📹 Published video track`);
        } catch (videoErr) {
          console.warn(`[LiveKit] Attempt #${attemptNumber} - Could not create video track:`, videoErr);
          // Video is optional, continue without it
        }

        // Step 5: Notify backend (legacy endpoint, now returns success immediately)
        try {
          await startWorker(config.roomName);
          console.log(`[LiveKit] Attempt #${attemptNumber} - Backend notified`);
        } catch (workerErr) {
          console.log(`[LiveKit] Attempt #${attemptNumber} - Backend notification:`, workerErr);
        }

        // Step 6: Connect to translation WebSocket and start audio capture
        connectTranslation();
        
        // Wait a bit for WebSocket to connect, then start capturing
        setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            startAudioCapture();  // Now gets mic directly, doesn't need LiveKit track
          }
        }, 1000);

        // Step 7: Update state
        if (isMountedRef.current) {
          setIsConnected(true);
          setIsConnecting(false);
          updateParticipants();
          console.log(`[LiveKit] Attempt #${attemptNumber} - Setup complete ✓`);
        }

        isConnectingRef.current = false;
      } catch (err: any) {
        console.error(`[LiveKit] Attempt #${attemptNumber} - Connection error:`, err);
        isConnectingRef.current = false;
        
        if (isMountedRef.current) {
          setError(err.message || 'Failed to connect to room');
          setIsConnecting(false);
        }
      }
    }

    connect();

    // Cleanup on unmount
    return () => {
      console.log(`[LiveKit] Attempt #${attemptNumber} - Cleanup called`);
      isMountedRef.current = false;
      
      // Close translation WebSocket
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      // Stop audio processing
      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
      }

      // Close capture context
      if (captureContextRef.current && captureContextRef.current.state !== 'closed') {
        captureContextRef.current.close();
        captureContextRef.current = null;
      }

      // Close playback context
      if (playbackContextRef.current && playbackContextRef.current.state !== 'closed') {
        playbackContextRef.current.close();
        playbackContextRef.current = null;
      }

      // Stop direct mic stream
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop());
        micStreamRef.current = null;
      }

      // Stop local video track
      if (localVideoTrackRef.current) {
        localVideoTrackRef.current.stop();
        localVideoTrackRef.current = null;
        setLocalVideoTrack(null);
      }
      
      // Disconnect room if connected
      if (room.state === ConnectionState.Connected && hasConnectedRef.current) {
        console.log(`[LiveKit] Attempt #${attemptNumber} - Disconnecting room`);
        room.disconnect().catch(console.error);
      }
      
      room.removeAllListeners();
    };
  }, [config, room, handleTrackSubscribed, handleTrackUnsubscribed, updateParticipants, connectTranslation, startAudioCapture]);

  /**
   * Disconnect from room
   */
  const disconnect = useCallback(async () => {
    console.log('[LiveKit] Disconnecting...');
    
    // Close translation WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    await room.disconnect();
    setIsConnected(false);
    setIsTranslating(false);
    setParticipants([]);
  }, [room]);

  /**
   * Push-to-Talk: Start talking
   * - Unmutes LiveKit track
   * - Starts sending audio to translation service
   */
  const startTalking = useCallback(async () => {
    console.log('[PTT] Started talking');
    isTalkingRef.current = true;
    setIsTalking(true);

    // Unmute the LiveKit audio track so others can hear (if needed)
    // Actually, we DON'T want others to hear original audio - only translated!
    // So we keep the track muted and only send via WebSocket
  }, []);

  /**
   * Push-to-Talk: Stop talking
   * - Mutes LiveKit track
   * - Stops sending audio to translation service
   */
  const stopTalking = useCallback(async () => {
    console.log('[PTT] Stopped talking');
    isTalkingRef.current = false;
    setIsTalking(false);
  }, []);

  /**
   * Toggle video on/off
   */
  const toggleVideo = useCallback(async () => {
    if (localVideoTrackRef.current) {
      if (isVideoEnabled) {
        // Disable video
        await localVideoTrackRef.current.mute();
        console.log('[Video] Disabled local video');
      } else {
        // Enable video
        await localVideoTrackRef.current.unmute();
        console.log('[Video] Enabled local video');
      }
      setIsVideoEnabled(!isVideoEnabled);
    }
  }, [isVideoEnabled]);

  return {
    isConnected,
    isConnecting,
    error,
    participants,
    isTranslating,
    isTalking,
    isVideoEnabled,
    lastTranscription,
    lastTranslation,
    incomingMessage,
    localVideoTrack,
    remoteVideoTracks,
    disconnect,
    startTalking,
    stopTalking,
    toggleVideo
  };
}

export default useLiveKit;
