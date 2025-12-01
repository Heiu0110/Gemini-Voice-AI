import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, AlertCircle, Loader2 } from 'lucide-react';
import { float32ToB64PCM, base64ToUint8Array, pcmToAudioBuffer } from '../services/audioUtils';
import Visualizer from './Visualizer';
import Notification, { NotificationType } from './Notification';
import { VoiceName } from '../types';

interface LiveSessionProps {
  apiKey: string;
}

const LiveSession: React.FC<LiveSessionProps> = ({ apiKey }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState<string>('Sẵn sàng kết nối');
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>(VoiceName.Zephyr);
  
  // Notification State
  const [notification, setNotification] = useState<{ visible: boolean; message: string; type: NotificationType }>({
    visible: false,
    message: '',
    type: 'info'
  });

  // Refs for audio context and state management
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // For Visualization
  const outputAnalyserNodeRef = useRef<GainNode | null>(null); // Using gain as a tap point

  const showNotification = (message: string, type: NotificationType = 'info') => {
      setNotification({ visible: true, message, type });
  };

  const cleanup = useCallback(() => {
    // Stop all active audio sources
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    activeSourcesRef.current.clear();

    // Close media stream (mic)
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // Disconnect processor
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (inputSourceRef.current) {
      inputSourceRef.current.disconnect();
      inputSourceRef.current = null;
    }

    // Close session if possible (no explicit close method on promise, but we stop sending data)
    sessionPromiseRef.current = null;

    setIsRecording(false);
    setStatus('Sẵn sàng kết nối');
  }, []);

  const startSession = async () => {
    setStatus('Đang khởi tạo âm thanh...');

    try {
      // 1. Initialize Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass({ sampleRate: 24000 }); // Output rate
      audioContextRef.current = ctx;
      
      // Node for visualization
      outputAnalyserNodeRef.current = ctx.createGain();
      outputAnalyserNodeRef.current.connect(ctx.destination);

      nextStartTimeRef.current = ctx.currentTime;

      // 2. Get Microphone Access (Input rate 16000 recommended for speech)
      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      setStatus('Đang kết nối với Gemini...');

      // 3. Connect to Gemini Live API
      const ai = new GoogleGenAI({ apiKey });
      
      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setStatus('Đã kết nối! Hãy bắt đầu nói chuyện.');
            setIsRecording(true);
            showNotification('Kết nối thành công! Đã bắt đầu trò chuyện.', 'success');

            // Setup Input Stream Processing
            const source = inputCtx.createMediaStreamSource(stream);
            inputSourceRef.current = source;
            
            // ScriptProcessor for raw PCM access (bufferSize, inputChannels, outputChannels)
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              // Create base64 PCM for Gemini
              const b64Data = float32ToB64PCM(inputData);
              
              if (sessionPromiseRef.current) {
                sessionPromiseRef.current.then(session => {
                   session.sendRealtimeInput({
                      media: {
                        mimeType: 'audio/pcm;rate=16000',
                        data: b64Data
                      }
                   });
                }).catch(err => {
                    console.error("Session send error", err);
                });
              }
            };

            source.connect(processor);
            processor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
             // Handle interruptions
             const interrupted = message.serverContent?.interrupted;
             if (interrupted) {
               setStatus('Bị gián đoạn...');
               activeSourcesRef.current.forEach(s => {
                 try { s.stop(); } catch(e) {}
               });
               activeSourcesRef.current.clear();
               nextStartTimeRef.current = ctx.currentTime;
             }

             // Handle Audio Output
             const modelTurn = message.serverContent?.modelTurn;
             if (modelTurn?.parts?.[0]?.inlineData) {
               const b64Data = modelTurn.parts[0].inlineData.data;
               if (b64Data) {
                 const pcmData = base64ToUint8Array(b64Data);
                 const audioBuffer = pcmToAudioBuffer(pcmData, ctx, 24000);
                 
                 // Schedule Playback
                 const source = ctx.createBufferSource();
                 source.buffer = audioBuffer;
                 source.connect(outputAnalyserNodeRef.current!); // Connect to visualizer node -> destination

                 // Calculate start time to ensure gapless playback
                 // Ensure we don't schedule in the past
                 const scheduleTime = Math.max(nextStartTimeRef.current, ctx.currentTime);
                 source.start(scheduleTime);
                 
                 nextStartTimeRef.current = scheduleTime + audioBuffer.duration;
                 activeSourcesRef.current.add(source);

                 source.onended = () => {
                   activeSourcesRef.current.delete(source);
                 };
               }
             }
          },
          onclose: (e) => {
            console.log("Session closed", e);
            setStatus("Đã ngắt kết nối");
            cleanup();
          },
          onerror: (e: any) => {
            console.error("Session error", e);
            
            const errorMessage = e.message || e.toString();
            if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('Resource has been exhausted')) {
               showNotification('Đã hết hạn mức sử dụng (Quota Exceeded). Vui lòng thử lại sau.', 'error');
            } else {
               showNotification('Đã xảy ra lỗi kết nối Live API.', 'error');
            }
            cleanup();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } }
          },
          systemInstruction: "Bạn là một trợ lý AI hữu ích, vui tính và súc tích. Hãy giao tiếp bằng Tiếng Việt.",
        }
      });

    } catch (err: any) {
      console.error(err);
      const errorMessage = err.message || err.toString();
      if (errorMessage.includes('429') || errorMessage.includes('quota')) {
        showNotification('Không thể bắt đầu phiên: Đã hết hạn mức sử dụng.', 'error');
      } else {
        showNotification('Không thể bắt đầu phiên. Vui lòng kiểm tra quyền truy cập micro.', 'error');
      }
      cleanup();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return (
    <div className="flex flex-col items-center justify-center p-6 space-y-8 w-full max-w-2xl mx-auto">
      <Notification 
          isVisible={notification.visible}
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(prev => ({ ...prev, visible: false }))}
      />
      
      <div className="w-full text-center space-y-2">
        <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
          Trò chuyện trực tiếp
        </h2>
        <p className="text-slate-400">
          Trò chuyện tự nhiên với Gemini 2.5 Live. Âm thanh hai chiều theo thời gian thực.
        </p>
      </div>

      <div className="flex items-center space-x-4">
         <label className="text-sm font-medium text-slate-300">Giọng đọc:</label>
         <select 
           value={selectedVoice}
           onChange={(e) => setSelectedVoice(e.target.value as VoiceName)}
           disabled={isRecording}
           className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-32 p-2.5"
         >
           {Object.values(VoiceName).map(v => (
             <option key={v} value={v}>{v}</option>
           ))}
         </select>
      </div>

      <div className="relative group">
        <div className={`absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full blur opacity-75 transition duration-1000 group-hover:opacity-100 ${isRecording ? 'animate-pulse' : ''}`}></div>
        <button
          onClick={isRecording ? cleanup : startSession}
          className={`relative px-8 py-4 rounded-full font-bold text-white transition-all transform hover:scale-105 active:scale-95 flex items-center space-x-3 ${
            isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-slate-900 hover:bg-slate-800'
          }`}
        >
          {isRecording ? (
            <>
              <MicOff className="w-6 h-6" />
              <span>Kết thúc</span>
            </>
          ) : (
            <>
               <Mic className="w-6 h-6 text-blue-400" />
               <span>Bắt đầu gọi</span>
            </>
          )}
        </button>
      </div>

      {/* Visualizer Area */}
      <div className="w-full bg-slate-800/50 rounded-xl p-4 border border-slate-700 backdrop-blur-sm min-h-[180px] flex items-center justify-center relative overflow-hidden">
        {status && (
             <div className="absolute top-2 left-4 text-xs font-mono text-slate-400 flex items-center gap-2">
               <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`}></span>
               {status}
             </div>
        )}
        
        {audioContextRef.current && outputAnalyserNodeRef.current ? (
             <Visualizer 
                isActive={isRecording} 
                audioContext={audioContextRef.current}
                sourceNode={outputAnalyserNodeRef.current}
                barColor="#60a5fa"
             />
        ) : (
            <div className="text-slate-600 text-sm">
                Biểu đồ âm thanh sẽ xuất hiện tại đây
            </div>
        )}
      </div>
    </div>
  );
};

export default LiveSession;