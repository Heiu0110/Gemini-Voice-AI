import React, { useState, useRef } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { Play, Loader2, Square, Volume2, Sparkles, User, Download } from 'lucide-react';
import { base64ToUint8Array, pcmToAudioBuffer, pcmToWav } from '../services/audioUtils';
import Visualizer from './Visualizer';
import { VoiceName } from '../types';

interface TextToSpeechProps {
  apiKey: string;
}

type VoiceStyle = 'standard' | 'asian-female' | 'asian-male';

const TextToSpeech: React.FC<TextToSpeechProps> = ({ apiKey }) => {
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>(VoiceName.Kore);
  const [voiceStyle, setVoiceStyle] = useState<VoiceStyle>('standard');
  const [lastGeneratedAudio, setLastGeneratedAudio] = useState<Uint8Array | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const handleStyleChange = (style: VoiceStyle) => {
    setVoiceStyle(style);
    // Auto-select appropriate base voice for the style
    if (style === 'asian-female') {
        setSelectedVoice(VoiceName.Zephyr);
    } else if (style === 'asian-male') {
        setSelectedVoice(VoiceName.Puck);
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
      
      if (voiceStyle === 'asian-female') {
        finalPrompt = `Generate speech with the following characteristics:
- Thin, bright, natural timbre, not too deep.
- Clear, even, soft pronunciation, avoiding "swallowing" final sounds.
- Slightly rising intonation at the end of sentences, reminiscent of Vietnamese or East Asian speech patterns.
- Speaking speed approximately 0.95x (natural, not too fast).
- Pitch approximately 8% higher than the default voice.
- Limit resonance and vibrato.

The text to speak is: "${text}"`;
      } else if (voiceStyle === 'asian-male') {
        finalPrompt = `Generate speech with the following characteristics:
- Bright, medium tone.
- Clear, even pronunciation.
- Slightly rising intonation at the end of sentences, reminiscent of Vietnamese or East Asian speech patterns.
- Speaking speed approximately 0.95x.
- Pitch approximately 3% higher than the default voice.
- Limit resonance and vibrato.

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
      }

    } catch (error) {
      console.error("TTS Error:", error);
      alert("Failed to generate speech. See console for details.");
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
    a.download = `voice-studio-${Date.now()}.wav`; // WAV is more reliable for raw PCM than hacking an MP3 extension
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 p-6">
        <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-emerald-400">
            Text to Speech
            </h2>
            <p className="text-slate-400">
            Turn your text into lifelike speech using Gemini 2.5 Flash TTS.
            </p>
        </div>

        <div className="space-y-6">
            {/* Style Selector */}
            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 space-y-3">
                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-teal-400" />
                    Voice Style & Region
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button 
                        onClick={() => handleStyleChange('standard')}
                        className={`p-3 rounded-lg border text-sm font-medium transition-all flex flex-col items-center gap-2 ${
                            voiceStyle === 'standard' 
                            ? 'bg-teal-500/20 border-teal-500/50 text-teal-200' 
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                        }`}
                    >
                        <User className="w-5 h-5" />
                        Standard
                    </button>
                    <button 
                        onClick={() => handleStyleChange('asian-female')}
                        className={`p-3 rounded-lg border text-sm font-medium transition-all flex flex-col items-center gap-2 ${
                            voiceStyle === 'asian-female' 
                            ? 'bg-pink-500/20 border-pink-500/50 text-pink-200' 
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                        }`}
                    >
                        <div className="flex items-center gap-1">
                            <span className="text-xs font-bold uppercase tracking-wider">Asian</span>
                            <User className="w-5 h-5" />
                        </div>
                        Female (Soft/Bright)
                    </button>
                    <button 
                        onClick={() => handleStyleChange('asian-male')}
                        className={`p-3 rounded-lg border text-sm font-medium transition-all flex flex-col items-center gap-2 ${
                            voiceStyle === 'asian-male' 
                            ? 'bg-blue-500/20 border-blue-500/50 text-blue-200' 
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                        }`}
                    >
                        <div className="flex items-center gap-1">
                            <span className="text-xs font-bold uppercase tracking-wider">Asian</span>
                            <User className="w-5 h-5" />
                        </div>
                        Male (Clear/Medium)
                    </button>
                </div>
            </div>

            <div className="flex justify-between items-center px-1">
                <label className="text-sm font-medium text-slate-300">Base Voice Persona</label>
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
                placeholder={voiceStyle !== 'standard' 
                    ? "Enter text... (The model will apply Asian-style pronunciation and intonation)" 
                    : "Enter text to speak..."}
                className="w-full h-40 p-4 bg-slate-800/50 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-teal-500 focus:outline-none resize-none transition-all"
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
                        <span>Stop Playback</span>
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
                                <span>Generating...</span>
                            </>
                        ) : (
                            <>
                                <Play className="w-5 h-5 fill-current" />
                                <span>Generate Speech</span>
                            </>
                        )}
                    </button>
                )}

                {lastGeneratedAudio && !isLoading && (
                    <button
                        onClick={downloadAudio}
                        title="Download Audio (WAV)"
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
                <Volume2 className="w-3 h-3" /> Output Visualization
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
                    Visualization ready
                </div>
             )}
        </div>
    </div>
  );
};

export default TextToSpeech;