/**
 * Join Room Component
 * 
 * Modern, sleek form for users to enter:
 * - Room name
 * - Their display name
 * - Target language (language they want to hear)
 */

import { useState, useEffect } from 'react';
import { RoomConfig, Language } from '../types';
import { checkHealth } from '../services/api';

// Supported languages with flags
const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'hi', name: 'हिन्दी (Hindi)', flag: '🇮🇳' },
  { code: 'es', name: 'Español (Spanish)', flag: '🇪🇸' },
  { code: 'fr', name: 'Français (French)', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch (German)', flag: '🇩🇪' },
  { code: 'ja', name: '日本語 (Japanese)', flag: '🇯🇵' },
  { code: 'ko', name: '한국어 (Korean)', flag: '🇰🇷' },
  { code: 'zh', name: '中文 (Chinese)', flag: '🇨🇳' }
];

interface JoinRoomProps {
  onJoin: (config: RoomConfig) => void;
}

export default function JoinRoom({ onJoin }: JoinRoomProps) {
  const [roomName, setRoomName] = useState('');
  const [participantName, setParticipantName] = useState('');
  const [targetLanguage, setTargetLanguage] = useState<string>('en');
  const [isBackendHealthy, setIsBackendHealthy] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  // Check backend health on mount
  useEffect(() => {
    checkHealth()
      .then(setIsBackendHealthy)
      .finally(() => setIsChecking(false));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!roomName.trim() || !participantName.trim()) {
      alert('Please fill in all fields');
      return;
    }

    if (!isBackendHealthy) {
      alert('Backend is not available. Please start the backend server.');
      return;
    }

    onJoin({
      roomName: roomName.trim(),
      participantName: participantName.trim(),
      targetLanguage: targetLanguage as any
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Glass Card */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="p-8 pb-0">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl mb-4 shadow-lg shadow-purple-500/30">
                <span className="text-3xl">🌐</span>
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">
                Multilingual Conference
              </h1>
              <p className="text-gray-400 text-sm">
                Real-time AI translation for everyone
              </p>
            </div>
          </div>

          {/* Status Bar */}
          <div className="px-8 py-4">
            {isChecking ? (
              <div className="flex items-center justify-center py-2 px-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2"></div>
                <span className="text-blue-400 text-sm">Connecting to server...</span>
              </div>
            ) : isBackendHealthy ? (
              <div className="flex items-center justify-center py-2 px-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <div className="w-2 h-2 bg-emerald-400 rounded-full mr-2 animate-pulse"></div>
                <span className="text-emerald-400 text-sm">Server connected</span>
              </div>
            ) : (
              <div className="py-3 px-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                <div className="flex items-center">
                  <span className="text-red-400 text-sm">⚠️ Server offline</span>
                </div>
                <p className="text-red-300/70 text-xs mt-1 font-mono">
                  Run: cd backend && npm run dev
                </p>
              </div>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-8 pt-4 space-y-5">
            {/* Room Name */}
            <div>
              <label htmlFor="roomName" className="block text-sm font-medium text-gray-300 mb-2">
                Room Name
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">🏠</span>
                <input
                  id="roomName"
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="e.g., team-meeting"
                  className="w-full pl-12 pr-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                  disabled={!isBackendHealthy}
                />
              </div>
            </div>

            {/* Participant Name */}
            <div>
              <label htmlFor="participantName" className="block text-sm font-medium text-gray-300 mb-2">
                Your Name
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">👤</span>
                <input
                  id="participantName"
                  type="text"
                  value={participantName}
                  onChange={(e) => setParticipantName(e.target.value)}
                  placeholder="e.g., John Doe"
                  className="w-full pl-12 pr-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                  disabled={!isBackendHealthy}
                />
              </div>
            </div>

            {/* Target Language */}
            <div>
              <label htmlFor="targetLanguage" className="block text-sm font-medium text-gray-300 mb-2">
                I want to hear translations in
              </label>
              <div className="relative">
                <select
                  id="targetLanguage"
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600/50 rounded-xl text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition appearance-none cursor-pointer"
                  disabled={!isBackendHealthy}
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code} className="bg-slate-800">
                      {lang.flag} {lang.name}
                    </option>
                  ))}
                </select>
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">▼</span>
              </div>
              <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                <span>💡</span>
                Others' speech will be translated to this language
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!isBackendHealthy}
              className={`w-full py-4 px-6 rounded-xl font-semibold text-white transition-all duration-300 ${
                isBackendHealthy
                  ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 hover:scale-[1.02] active:scale-[0.98]'
                  : 'bg-slate-600 cursor-not-allowed'
              }`}
            >
              {isBackendHealthy ? (
                <span className="flex items-center justify-center gap-2">
                  Join Room
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </span>
              ) : (
                'Server Offline'
              )}
            </button>
          </form>

          {/* How it works */}
          <div className="px-8 pb-8">
            <div className="bg-slate-700/30 rounded-xl p-4 border border-slate-600/30">
              <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                <span>✨</span> How it works
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-start gap-2">
                  <span className="text-lg">🎤</span>
                  <div>
                    <p className="text-xs text-gray-400">Speak naturally</p>
                    <p className="text-[10px] text-gray-500">Any language</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-lg">🤖</span>
                  <div>
                    <p className="text-xs text-gray-400">AI translates</p>
                    <p className="text-[10px] text-gray-500">In real-time</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-lg">🔊</span>
                  <div>
                    <p className="text-xs text-gray-400">Others hear</p>
                    <p className="text-[10px] text-gray-500">Their language</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-lg">⚡</span>
                  <div>
                    <p className="text-xs text-gray-400">2-4 sec delay</p>
                    <p className="text-[10px] text-gray-500">Near real-time</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-500 text-xs mt-6">
          Powered by OpenAI Whisper, GPT & TTS
        </p>
      </div>
    </div>
  );
}
