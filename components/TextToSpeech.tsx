import React, { useState, useRef } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { Play, Loader2, Square, Volume2, Sparkles, User, Download, Mic, BookOpen, Radio, Settings2 } from 'lucide-react';
import { base64ToUint8Array, pcmToAudioBuffer, pcmToWav } from '../services/audioUtils';
import Visualizer from './Visualizer';
import Notification, { NotificationType } from './Notification';
import { VoiceName } from '../types';

interface TextToSpeechProps {
  apiKey: string;
}

type VoiceStyle = 'standard' | 'asian-female' | 'asian-male' | 'news' | 'storyteller' | 'custom';

const TextToSpeech: React.FC<TextToSpeechProps> = ({ apiKey }) => {
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>(VoiceName.Kore);
  const [voiceStyle, setVoiceStyle] = useState<VoiceStyle>('standard');
  const [customStylePrompt, setCustomStylePrompt] = useState('Giọng trầm, khàn với nhịp độ chậm, giống như người dẫn chuyện trong trailer phim cũ.');
  const [lastGeneratedAudio, setLastGeneratedAudio] = useState<Uint8Array | null>(null);
  
  // Notification State
  const [notification, setNotification] = useState<{ visible: boolean; message: string; type: NotificationType }>({
    visible: false,
    message: '',
    type: 'info'
  });
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const showNotification = (message: string, type: NotificationType = 'info') => {
    setNotification({ visible: true, message, type });
  };

  const handleStyleChange = (style: VoiceStyle) => {
    setVoiceStyle(style);
    // Auto-select appropriate base voice for the style to help the user
    switch (style) {
        case 'asian-female':
            setSelectedVoice(VoiceName.Zephyr);
            break;
        case 'asian-male':
            setSelectedVoice(VoiceName.Puck);
            break;
        case 'news':
            setSelectedVoice(VoiceName.Fenrir); // Fenrir is usually clear/strong
            break;
        case 'storyteller':
            setSelectedVoice(VoiceName.Kore); // Kore/Charon are good for deeper tones
            break;
        default:
            break;
    }
  };

  const handleGenerateAndPlay = async () => {
    if (!text.trim()) return;
    setIsLoading(true);
    setLastGeneratedAudio(null); // Clear previous

    try {
      const ai = new GoogleGenAI({ apiKey });

      // Construct prompt based on style
      let finalPrompt = text;
      let styleInstructions = "";

      switch (voiceStyle) {
        case 'asian-female':
            styleInstructions = `Generate speech with these characteristics:
- Thin, bright, natural timbre, not too deep.
- Clear, even, soft pronunciation, avoiding "swallowing" final sounds.
- Slightly rising intonation at the end of sentences, reminiscent of Vietnamese or East Asian speech patterns.
- Speaking speed approximately 0.95x (natural, not too fast).
- Pitch approximately 8% higher than the default voice.
- Limit resonance and vibrato.`;
            break;
        case 'asian-male':
            styleInstructions = `Generate speech with these characteristics:
- Bright, medium tone.
- Clear, even pronunciation.
- Slightly rising intonation at the end of sentences, reminiscent of Vietnamese or East Asian speech patterns.
- Speaking speed approximately 0.95x.
- Pitch approximately 3% higher than the default voice.
- Limit resonance and vibrato.`;
            break;
        case 'news':
            styleInstructions = `Generate speech with these characteristics:
- Professional, authoritative, and crisp tone like a news anchor.
- Fast-paced but very clear articulation (approx 1.1x speed).
- Flat, objective intonation with emphasis on key nouns.
- Minimal emotional fluctuation.`;
            break;
        case 'storyteller':
            styleInstructions = `Generate speech with these characteristics:
- Warm, engaging, and expressive timbre.
- Slower pace (approx 0.85x) with dramatic pauses.
- Rich resonance and dynamic pitch variation to convey emotion.
- Good for audiobooks or bedtime stories.`;
            break;
        case 'custom':
            styleInstructions = `Generate speech with the following specific characteristics:
${customStylePrompt}`;
            break;
        default:
            // Standard: no specific instructions, just the text
            break;
      }

      if (voiceStyle !== 'standard') {
          finalPrompt = `${styleInstructions}

The text to speak is: "${text}"`;
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: finalPrompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: selectedVoice },
            },
          },
        },
      });

      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      
      if (audioData) {
         const pcmBytes = base64ToUint8Array(audioData);
         setLastGeneratedAudio(pcmBytes);
         playAudio(pcmBytes);
      } else {
         console.warn("No audio data returned");
         showNotification("Không nhận được dữ liệu âm thanh từ AI.", "error");
      }

    } catch (error: any) {
      console.error("TTS Error:", error);
      
      // Check for Quota/Rate Limit errors
      const errorMessage = error.message || error.toString();
      if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('Resource has been exhausted')) {
          showNotification("Bạn đã đạt đến hạn mức sử dụng (Quota Exceeded). Vui lòng đợi một lát hoặc nâng cấp gói dịch vụ.", "error");
      } else {
          showNotification(`Lỗi tạo giọng nói: ${errorMessage}`, "error");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const playAudio = async (pcmBytes: Uint8Array) => {
    // Stop previous if playing
    stopAudio();

    // Init context if needed
    if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
    }
    const ctx = audioContextRef.current;
    
    // Resume context if suspended (browser policy)
    if (ctx.state === 'suspended') {
        await ctx.resume();
    }

    try {
        const buffer = pcmToAudioBuffer(pcmBytes, ctx, 24000);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        
        const gainNode = ctx.createGain();
        gainNode.connect(ctx.destination);
        source.connect(gainNode);

        sourceNodeRef.current = source;
        gainNodeRef.current = gainNode;

        source.onended = () => setIsPlaying(false);
        source.start();
        setIsPlaying(true);
    } catch (e) {
        console.error("Playback error", e);
    }
  };

  const stopAudio = () => {
    if (sourceNodeRef.current) {
        try {
            sourceNodeRef.current.stop();
        } catch (e) {}
        sourceNodeRef.current = null;
    }
    setIsPlaying(false);
  };

  const downloadAudio = () => {
    if (!lastGeneratedAudio) return;
    
    // Create WAV blob
    const wavBlob = pcmToWav(lastGeneratedAudio);
    const url = URL.createObjectURL(wavBlob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `voice-studio-${Date.now()}.wav`; 
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getButtonStyle = (style: VoiceStyle, activeColor: string, borderColor: string) => {
    const isActive = voiceStyle === style;
    return `p-3 rounded-lg border text-sm font-medium transition-all flex flex-col items-center gap-2 ${
        isActive
        ? `bg-${activeColor}-500/20 border-${borderColor}-500/50 text-${borderColor}-200 ring-1 ring-${borderColor}-500/50`
        : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
    }`;
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 p-6">
        <Notification 
            isVisible={notification.visible}
            message={notification.message}
            type={notification.type}
            onClose={() => setNotification(prev => ({ ...prev, visible: false }))}
        />

        <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-emerald-400">
            Chuyển văn bản thành giọng nói
            </h2>
            <p className="text-slate-400">
            Biến văn bản thành giọng nói sống động bằng Gemini 2.5 Flash TTS.
            </p>
        </div>

        <div className="space-y-6">
            {/* Style Selector */}
            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 space-y-4">
                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-teal-400" />
                    Phong cách & Đặc điểm giọng nói
                </label>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    <button 
                        onClick={() => handleStyleChange('standard')}
                        className={getButtonStyle('standard', 'teal', 'teal')}
                    >
                        <User className="w-5 h-5" />
                        Tiêu chuẩn
                    </button>
                    <button 
                        onClick={() => handleStyleChange('asian-female')}
                        className={getButtonStyle('asian-female', 'pink', 'pink')}
                    >
                        <span className="text-xs font-bold">CHÂU Á</span>
                        Nữ
                    </button>
                    <button 
                        onClick={() => handleStyleChange('asian-male')}
                        className={getButtonStyle('asian-male', 'blue', 'blue')}
                    >
                        <span className="text-xs font-bold">CHÂU Á</span>
                        Nam
                    </button>
                     <button 
                        onClick={() => handleStyleChange('news')}
                        className={getButtonStyle('news', 'purple', 'purple')}
                    >
                        <Radio className="w-5 h-5" />
                        Tin tức
                    </button>
                     <button 
                        onClick={() => handleStyleChange('storyteller')}
                        className={getButtonStyle('storyteller', 'amber', 'amber')}
                    >
                        <BookOpen className="w-5 h-5" />
                        Kể chuyện
                    </button>
                    <button 
                        onClick={() => handleStyleChange('custom')}
                        className={getButtonStyle('custom', 'indigo', 'indigo')}
                    >
                        <Settings2 className="w-5 h-5" />
                        Tùy chỉnh
                    </button>
                </div>

                {/* Custom Prompt Area */}
                {voiceStyle === 'custom' && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                        <label className="text-xs font-medium text-indigo-300 mb-1.5 block">
                            Mô tả giọng nói bạn muốn (Tông, Cao độ, Tốc độ, Âm sắc):
                        </label>
                        <textarea
                            value={customStylePrompt}
                            onChange={(e) => setCustomStylePrompt(e.target.value)}
                            className="w-full h-20 p-3 bg-indigo-900/20 border border-indigo-500/30 rounded-lg text-indigo-100 text-sm placeholder-indigo-400/50 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-none"
                            placeholder="Ví dụ: Giọng trầm, ồm, chậm rãi như phim kinh dị..."
                        />
                    </div>
                )}
            </div>

            <div className="flex justify-between items-center px-1">
                <label className="text-sm font-medium text-slate-300">Giọng nền tảng (Persona)</label>
                <select 
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value as VoiceName)}
                    className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg focus:ring-teal-500 focus:border-teal-500 block p-2"
                >
                {Object.values(VoiceName).map(v => (
                    <option key={v} value={v}>{v}</option>
                ))}
                </select>
            </div>
            
            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Nhập văn bản cần đọc..."
                className="w-full h-32 p-4 bg-slate-800/50 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-teal-500 focus:outline-none resize-none transition-all font-light"
            />
        </div>

        <div className="flex flex-col items-center gap-4 pt-4">
            <div className="flex items-center gap-4">
                {isPlaying ? (
                    <button
                        onClick={stopAudio}
                        className="flex items-center space-x-2 px-8 py-3 bg-red-500 hover:bg-red-600 text-white rounded-full font-semibold transition-colors shadow-lg shadow-red-500/20"
                    >
                        <Square className="w-5 h-5 fill-current" />
                        <span>Dừng phát</span>
                    </button>
                ) : (
                    <button
                        onClick={handleGenerateAndPlay}
                        disabled={isLoading || !text.trim()}
                        className={`flex items-center space-x-2 px-8 py-3 rounded-full font-semibold transition-all shadow-lg ${
                            isLoading || !text.trim() 
                            ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                            : 'bg-teal-500 hover:bg-teal-400 text-slate-900 shadow-teal-500/20 hover:scale-105'
                        }`}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span>Đang tạo...</span>
                            </>
                        ) : (
                            <>
                                <Play className="w-5 h-5 fill-current" />
                                <span>Tạo giọng đọc</span>
                            </>
                        )}
                    </button>
                )}

                {lastGeneratedAudio && !isLoading && (
                    <button
                        onClick={downloadAudio}
                        title="Tải xuống (WAV)"
                        className="flex items-center justify-center p-3 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-200 transition-all border border-slate-600 shadow-lg hover:scale-105"
                    >
                        <Download className="w-5 h-5" />
                    </button>
                )}
            </div>
        </div>

        {/* Visualizer Container */}
        <div className="w-full h-32 bg-slate-800/30 rounded-lg border border-slate-700/50 flex items-center justify-center overflow-hidden relative">
             <div className="absolute top-2 left-2 text-xs text-slate-500 flex items-center gap-2">
                <Volume2 className="w-3 h-3" /> Biểu đồ âm thanh
             </div>
             {audioContextRef.current && gainNodeRef.current ? (
                 <Visualizer 
                    isActive={isPlaying} 
                    audioContext={audioContextRef.current}
                    sourceNode={gainNodeRef.current}
                    barColor="#14b8a6"
                 />
             ) : (
                <div className="text-slate-600 text-sm italic">
                    Sẵn sàng hiển thị
                </div>
             )}
        </div>
    </div>
  );
};

export default TextToSpeech;