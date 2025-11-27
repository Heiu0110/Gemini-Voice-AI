import React, { useState } from 'react';
import { Sparkles, MessageSquare, Mic } from 'lucide-react';
import LiveSession from './components/LiveSession';
import TextToSpeech from './components/TextToSpeech';

enum ActiveTab {
  LIVE = 'LIVE',
  TTS = 'TTS'
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>(ActiveTab.LIVE);
  
  // In a real app, this would be handled via environment variables strictly.
  // We assume process.env.API_KEY is available as per instructions.
  const apiKey = process.env.API_KEY || '';

  if (!apiKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-200">
         <div className="bg-slate-800 p-8 rounded-xl shadow-2xl border border-slate-700 max-w-md text-center">
            <h1 className="text-2xl font-bold mb-4 text-red-400">Missing API Key</h1>
            <p>Please ensure <code>process.env.API_KEY</code> is configured in your environment.</p>
         </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Sparkles className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-100 to-purple-100">
              Gemini Voice Studio
            </h1>
          </div>
          <div className="text-xs text-slate-500 font-mono hidden sm:block">
            Powered by Gemini 2.5
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full p-4 sm:p-6 lg:p-8 flex flex-col items-center">
        
        {/* Navigation Tabs */}
        <div className="bg-slate-800/50 p-1 rounded-xl flex space-x-1 mb-10 border border-slate-700">
          <button
            onClick={() => setActiveTab(ActiveTab.LIVE)}
            className={`flex items-center space-x-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === ActiveTab.LIVE
                ? 'bg-slate-700 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Mic className="w-4 h-4" />
            <span>Live Conversation</span>
          </button>
          <button
            onClick={() => setActiveTab(ActiveTab.TTS)}
            className={`flex items-center space-x-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === ActiveTab.TTS
                ? 'bg-slate-700 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Text to Speech</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="w-full bg-slate-800/30 rounded-2xl border border-slate-800 p-1 shadow-2xl shadow-black/50 overflow-hidden relative min-h-[500px]">
           {/* Decorative Gradients */}
           <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2"></div>
           <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none translate-y-1/2"></div>

           <div className="relative z-0">
             {activeTab === ActiveTab.LIVE ? (
               <LiveSession apiKey={apiKey} />
             ) : (
               <TextToSpeech apiKey={apiKey} />
             )}
           </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-6 text-center text-slate-500 text-sm">
        <p>&copy; {new Date().getFullYear()} Gemini Voice Studio. Built with Google Gen AI SDK.</p>
      </footer>
    </div>
  );
};

export default App;
