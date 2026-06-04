'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Mic, Square, Trash2, FolderOpen } from 'lucide-react';
import { getDesktopService } from '@/lib/desktop/desktopAdapter';
import { resolveMediaUrl } from '@/lib/api';

// React Node View Component for the editor rendering
function VoiceNoteView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const { src, duration } = node.attrs;

  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  // Availability & Playback states
  const [isMicAvailable, setIsMicAvailable] = useState<boolean | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  // Effect to check mic availability
  useEffect(() => {
    const available = !!(typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    setIsMicAvailable(available);
  }, []);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Recording controls
  const startRecording = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Microphone access is not supported or permitted in this context.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Determine the best supported audio container and extension
      let mimeType = 'audio/webm';
      let extension = 'webm';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
          extension = 'm4a';
        } else if (MediaRecorder.isTypeSupported('audio/aac')) {
          mimeType = 'audio/aac';
          extension = 'aac';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
          extension = 'webm';
        }
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      const startTime = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const elapsedMs = Date.now() - startTime;
        const durationSec = Math.round(elapsedMs / 1000);
        const mins = Math.floor(durationSec / 60).toString().padStart(2, '0');
        const secs = (durationSec % 60).toString().padStart(2, '0');
        const formattedDuration = `${mins}:${secs}`;

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const file = new File([audioBlob], `voice_${Date.now()}.${extension}`, { type: mimeType });

        const uploadedUrl = await getDesktopService().uploadMedia(file, node.attrs.userId || '');
        if (uploadedUrl) {
          updateAttributes({ src: uploadedUrl, duration: formattedDuration });
        }

        // Stop all tracks to release mic
        stream.getTracks().forEach(track => track.stop());
      };

      setRecordingTime(0);
      setIsRecording(true);
      mediaRecorder.start();

      timerRef.current = setInterval(() => {
        const elapsedSec = Math.round((Date.now() - startTime) / 1000);
        setRecordingTime(elapsedSec);
      }, 1000);

    } catch (err) {
      console.error('Error starting audio recording:', err);
      alert('Failed to access microphone. Please check your permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  // Upload/File selector controls
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Get audio duration
    const getAudioDuration = (audioFile: File): Promise<string> => {
      return new Promise((resolve) => {
        const audio = new Audio();
        audio.src = URL.createObjectURL(audioFile);
        audio.onloadedmetadata = () => {
          const durationSec = Math.round(audio.duration);
          const mins = Math.floor(durationSec / 60).toString().padStart(2, '0');
          const secs = (durationSec % 60).toString().padStart(2, '0');
          resolve(`${mins}:${secs}`);
          URL.revokeObjectURL(audio.src);
        };
        audio.onerror = () => {
          resolve('00:00');
          URL.revokeObjectURL(audio.src);
        };
      });
    };

    const formattedDuration = await getAudioDuration(file);
    const uploadedUrl = await getDesktopService().uploadMedia(file, node.attrs.userId || '');
    if (uploadedUrl) {
      updateAttributes({ src: uploadedUrl, duration: formattedDuration });
    }
  };

  // Cleanup timers and recorders on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Playback sync
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setAudioDuration(audio.duration || 0);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, [src]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(err => {
        console.error('Audio playback failed:', err);
      });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    const seekTime = Number(e.target.value);
    audioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const formatTime = (timeSec: number) => {
    const mins = Math.floor(timeSec / 60).toString().padStart(2, '0');
    const secs = Math.floor(timeSec % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  // 1. Rendering Recording/Empty State UI
  if (!src) {
    return (
      <NodeViewWrapper className="voice-note-node" style={{ margin: '16px 0', display: 'block' }}>
        <div className="voice-note-block voice-note-empty">
          {isRecording ? (
            <div className="voice-note-recording-active">
              <span className="voice-note-recording-dot"></span>
              <span className="voice-note-text">Recording Reflection: {formatTime(recordingTime)}</span>
              <button
                type="button"
                className="voice-note-action-circle bg-red-active"
                onClick={stopRecording}
                title="Stop Recording"
              >
                <Square size={14} className="icon-white" fill="currentColor" />
              </button>
            </div>
          ) : (
            <div className="voice-note-recording-setup">
              <span className="voice-note-title">Attach Contextual Reflection</span>
              <div className="voice-note-actions">
                {isMicAvailable !== false ? (
                  <button
                    type="button"
                    className="voice-note-setup-btn"
                    onClick={startRecording}
                  >
                    <Mic size={14} />
                    Record
                  </button>
                ) : (
                  <span 
                    className="voice-note-warning-text"
                    title="Microphone recording is unavailable. Secure context (HTTPS/Tauri) and permissions are required."
                  >
                    ⚠️ Mic Unavailable
                  </span>
                )}
                <button
                  type="button"
                  className="voice-note-setup-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FolderOpen size={14} />
                  Upload
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />
                <button
                  type="button"
                  className="voice-note-setup-btn btn-danger"
                  onClick={deleteNode}
                  title="Remove block"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </NodeViewWrapper>
    );
  }

  // 2. Rendering Playback UI
  return (
    <NodeViewWrapper className="voice-note-node" style={{ margin: '16px 0', display: 'block' }}>
      <div className="voice-note-block voice-note-playback">
        <audio ref={audioRef} src={resolveMediaUrl(src)} preload="metadata" />
        
        <button
          type="button"
          className="voice-note-action-circle"
          onClick={togglePlay}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" style={{ marginLeft: 2 }} />}
        </button>

        <div className="voice-note-progress-container">
          <input
            type="range"
            className="voice-note-seekbar"
            min={0}
            max={audioDuration || 1}
            value={currentTime}
            onChange={handleSeek}
          />
          <div className="voice-note-time-info">
            <span>{formatTime(currentTime)} / {duration || formatTime(audioDuration)}</span>
          </div>
        </div>

        <button
          type="button"
          className="voice-note-delete-btn"
          onClick={deleteNode}
          title="Delete voice note"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </NodeViewWrapper>
  );
}

// TipTap Node Extension Configuration
export const VoiceNote = Node.create({
  name: 'voiceNote',
  group: 'block',
  atom: true,
  defining: true,

  addAttributes() {
    return {
      src: {
        default: '',
        parseHTML: element => element.getAttribute('src') || '',
        renderHTML: attributes => ({ src: attributes.src }),
      },
      duration: {
        default: '00:00',
        parseHTML: element => element.getAttribute('duration') || '00:00',
        renderHTML: attributes => ({ duration: attributes.duration }),
      },
      userId: {
        default: '',
        parseHTML: element => element.getAttribute('userId') || '',
        renderHTML: attributes => ({ userId: attributes.userId }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'voice-note',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['voice-note', mergeAttributes(HTMLAttributes)];
  },

  // Support plain text degradation for copy-pastes externally
  renderText({ node }) {
    return `[Voice Note: ${node.attrs.duration || '00:00'}]`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(VoiceNoteView);
  },
});
