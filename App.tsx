import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Settings, Download, Type, MonitorPlay, Sparkles } from 'lucide-react';
import { ScriptWord, ConnectionState } from './types';
import { GeminiLiveService } from './services/geminiLiveService';
import Teleprompter from './components/Teleprompter';

// Utility to generate unique IDs
const generateId = () => Math.random().toString(36).substr(2, 9);

// Utility to clean text for comparison
const cleanText = (text: string) => text.toLowerCase().replace(/[^\w\s]|_/g, "").trim();

// Levenshtein distance for fuzzy matching
const getLevenshteinDistance = (a: string, b: string) => {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

const COMMON_WORDS = new Set([
  'a', 'an', 'the', 'to', 'of', 'and', 'in', 'on', 'at', 'is', 'it', 'that', 'i', 'my', 'we', 
  'for', 'with', 'this', 'but', 'not', 'are', 'was', 'were', 'be', 'so', 'if', 'or', 'as', 'by'
]);

const isMatch = (scriptWord: string, spokenWord: string): boolean => {
    if (!scriptWord || !spokenWord) return false;
    if (scriptWord === spokenWord) return true;
    
    const len = Math.max(scriptWord.length, spokenWord.length);
    
    // Very short words must match exactly to avoid false positives (e.g. "a" vs "at")
    if (len <= 3) return scriptWord === spokenWord; 
    
    // Fuzzy match for longer words
    const dist = getLevenshteinDistance(scriptWord, spokenWord);
    
    // Allow ~30% error rate for longer words
    return dist <= Math.ceil(len * 0.3); 
};

const App: React.FC = () => {
  // App State
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  
  // Media State
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  
  // Script State
  const [scriptText, setScriptText] = useState<string>("");
  const [scriptWords, setScriptWords] = useState<ScriptWord[]>([]);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(0);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  
  // Recording State
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'paused'>('idle');
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  // AI State
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [liveService, setLiveService] = useState<GeminiLiveService | null>(null);

  // Settings
  const [fontSize, setFontSize] = useState(48);
  const [opacity, setOpacity] = useState(0.4);
  const [showSettings, setShowSettings] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  // -- Initialization --

  useEffect(() => {
    // Request permissions on mount to be ready
    const initCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" },
          audio: true,
        });
        setStream(mediaStream);
      } catch (err) {
        setPermissionError("Please allow camera and microphone access to use the teleprompter.");
        console.error("Media access error:", err);
      }
    };
    initCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Bind stream to video element whenever it appears and stream is available
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [hasStarted, stream, videoRef.current]);

  // -- Script Processing --

  const processScript = (text: string) => {
      const words = text.split(/\s+/).filter(w => w.length > 0).map(word => ({
          id: generateId(),
          word: word,
          cleanWord: cleanText(word),
          isSpoken: false
      }));
      setScriptWords(words);
      setActiveWordIndex(0);
  }

  const handleScriptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setScriptText(text);
    processScript(text);
  };

  const handleClearScript = () => {
      setScriptText("");
      setScriptWords([]);
      setActiveWordIndex(0);
  }

  // -- ASR Matching Logic --

  const handleTranscription = useCallback((transcription: string) => {
    if (!transcription) return;
    
    // Clean and split incoming text into words
    const incomingWords = transcription.split(/\s+/).map(cleanText).filter(Boolean);
    if (incomingWords.length === 0) return;

    setScriptWords(currentWords => {
      // Find the current anchor point (first unspoken word)
      let currentIndex = currentWords.findIndex(w => !w.isSpoken);
      if (currentIndex === -1) currentIndex = currentWords.length;

      // --- Robust Matching Algorithm ---
      // We look ahead in the script to find the best matching sequence for the incoming words.
      // We penalize skipping words to prevent jumping too fast, unless there is a strong sequence match.

      const LOOKAHEAD = 60; // How far ahead to scan for a match
      const searchEnd = Math.min(currentWords.length, currentIndex + LOOKAHEAD);
      
      let bestMatch = {
        endIndex: currentIndex, // Default to no change
        score: -1
      };

      // 1. Iterate through potential start positions in the script
      for (let s = currentIndex; s < searchEnd; s++) {
        let matchLength = 0;
        
        // 2. Try to align the incoming words with the script starting at 's'
        for (let i = 0; i < incomingWords.length; i++) {
            if (s + i >= currentWords.length) break;

            const scriptW = currentWords[s + i].cleanWord;
            const inputW = incomingWords[i];

            if (isMatch(scriptW, inputW)) {
                matchLength++;
            } else {
                // Stop counting on first mismatch to enforce sequential matching
                // We could allow 1 gap, but strict sequence is safer for now
                break;
            }
        }

        if (matchLength > 0) {
            // 3. Calculate Score
            // Distance from current position (Penalty for skipping)
            const distance = s - currentIndex;
            
            // Dynamic Requirement:
            // - If we are right at the cursor (distance 0), even 1 word match is good.
            // - If we skip words (distance > 0), we need stronger evidence (more consecutive matches).
            let requiredLength = 1;
            if (distance > 0) requiredLength = 2; // Need 2 words to skip
            if (distance > 5) requiredLength = 3; // Need 3 words to skip far
            
            // If the word is very unique (long), we can be slightly more lenient on skips?
            // For now, let's stick to sequence length as the primary robust factor.

            if (matchLength >= requiredLength) {
                // Score formula: Reward length heavily, slight penalty for distance
                const score = (matchLength * 10) - (distance * 0.2);
                
                if (score > bestMatch.score) {
                    bestMatch = {
                        endIndex: s + matchLength,
                        score: score
                    };
                }
            }
        }
      }

      // Only update if we found a valid match that moves us forward
      if (bestMatch.endIndex > currentIndex) {
         return currentWords.map((w, i) => ({
           ...w,
           isSpoken: i < bestMatch.endIndex
         }));
      }

      return currentWords;
    });
  }, []);

  // Sync active index with words state changes
  useEffect(() => {
    const idx = scriptWords.findIndex(w => !w.isSpoken);
    if (idx !== -1) {
      setActiveWordIndex(idx);
    } else if (scriptWords.length > 0 && scriptWords.every(w => w.isSpoken)) {
        setActiveWordIndex(scriptWords.length);
    }
  }, [scriptWords]);


  // -- Recording & AI --

  const startRecording = async () => {
    if (!stream) return;
    
    setRecordedChunks([]);
    setRecordingDuration(0);

    const service = new GeminiLiveService({
      onConnect: () => setConnectionState('connected'),
      onDisconnect: () => setConnectionState('disconnected'),
      onError: (e) => {
        console.error(e);
        setConnectionState('disconnected');
        stopRecording();
      },
      onTranscription: handleTranscription
    });

    setLiveService(service);
    setConnectionState('connecting');
    await service.connect(stream);

    let options = { mimeType: 'video/mp4' };
    if (!MediaRecorder.isTypeSupported('video/mp4')) {
        options = { mimeType: 'video/webm;codecs=vp9' };
    }
    
    const recorder = new MediaRecorder(stream, options);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        setRecordedChunks(prev => [...prev, e.data]);
      }
    };

    recorder.start(1000);
    mediaRecorderRef.current = recorder;
    setRecordingState('recording');
    setIsEditMode(false);

    timerIntervalRef.current = window.setInterval(() => {
      setRecordingDuration(d => d + 1);
    }, 1000);
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current && recordingState !== 'idle') {
      mediaRecorderRef.current.stop();
    }
    
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (liveService) {
      await liveService.disconnect();
      setLiveService(null);
    }

    setRecordingState('idle');
  };

  const downloadVideo = () => {
    if (recordedChunks.length === 0) return;
    
    const blob = new Blob(recordedChunks, {
      type: recordedChunks[0].type
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    document.body.appendChild(a);
    a.style.display = 'none';
    a.href = url;
    a.download = `teleprompter-recording-${new Date().toISOString()}.mp4`; 
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // -- Start Screen Render --
  if (!hasStarted) {
      return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
            {/* Background Effects */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-900/20 rounded-full blur-[120px]"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-900/20 rounded-full blur-[120px]"></div>

            {/* Header */}
            <div className="text-center mb-10 z-10">
                <h1 className="text-5xl md:text-6xl font-bold mb-3 tracking-tight">
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
                        Adaptive Teleprompter
                    </span>
                </h1>
                <p className="text-gray-400 text-lg font-light tracking-wide">
                    A teleprompter that listens
                </p>
            </div>

            {/* Script Input Card */}
            <div className="w-full max-w-2xl z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 overflow-hidden">
                    {/* Card Header */}
                    <div className="px-6 py-4 bg-gray-950/50 border-b border-gray-800 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                             <Type size={14} className="text-gray-500" />
                             <span className="text-xs font-bold text-gray-500 tracking-widest uppercase">Script Editor</span>
                        </div>
                        <button 
                            onClick={handleClearScript}
                            className="text-xs font-medium text-gray-500 hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-800"
                        >
                            Clear
                        </button>
                    </div>
                    
                    {/* Text Area */}
                    <div className="p-1 bg-gray-900">
                        <textarea
                            className="w-full h-80 bg-gray-900 text-white p-6 outline-none resize-none text-lg leading-relaxed font-light placeholder-gray-700"
                            placeholder="Paste your script here... The teleprompter will detect your speech and scroll automatically."
                            value={scriptText}
                            onChange={handleScriptChange}
                        />
                    </div>
                    
                    {/* Footer Stats */}
                    <div className="bg-gray-950/30 px-6 py-3 border-t border-gray-800 flex justify-between text-xs text-gray-500 font-mono">
                        <span>{scriptWords.length} words</span>
                        <span>~{Math.ceil(scriptWords.length / 2.5)}s estimated</span>
                    </div>
                </div>

                {/* Start Button */}
                <div className="mt-8 flex justify-center">
                    <button
                        onClick={() => setHasStarted(true)}
                        disabled={scriptWords.length === 0}
                        className={`
                            px-10 py-4 rounded-full font-bold text-lg flex items-center gap-3 transition-all transform shadow-xl
                            ${scriptWords.length > 0 
                                ? 'bg-blue-600 hover:bg-blue-500 hover:scale-105 hover:shadow-blue-500/25 text-white cursor-pointer' 
                                : 'bg-gray-800 text-gray-500 cursor-not-allowed'}
                        `}
                    >
                        <span>Start Camera & Prompter</span>
                    </button>
                </div>

                {/* Permission Status */}
                <div className="mt-6 text-center h-6">
                    {!stream && !permissionError && (
                         <div className="flex items-center justify-center gap-2 text-gray-500 text-sm animate-pulse">
                            <Sparkles size={14} />
                            <span>Initializing Camera...</span>
                         </div>
                    )}
                    {permissionError && (
                        <span className="text-red-400 text-sm bg-red-900/20 px-3 py-1 rounded-full border border-red-900/50">
                            {permissionError}
                        </span>
                    )}
                </div>
            </div>
        </div>
      );
  }

  // -- Main App Render --
  return (
    <div className="relative h-screen w-screen bg-black overflow-hidden flex flex-col font-sans">
      
      {/* --- Top Header Bar --- */}
      <div className="h-14 bg-black border-b border-gray-800 flex items-center justify-between px-6 z-50 shrink-0">
        <div className="flex items-center gap-3">
            <button 
                onClick={() => setHasStarted(false)}
                className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20 hover:bg-blue-500 transition-colors"
                title="Back to Setup"
            >
                <MonitorPlay size={20} className="text-white" />
            </button>
            <h1 className="text-white font-bold text-lg tracking-tight">Adaptive Teleprompter</h1>
        </div>

        <div className="flex items-center gap-4">
             {/* AI Status Pill */}
             <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold tracking-wider transition-colors duration-300 ${
                 connectionState === 'connected' ? 'bg-green-900/30 text-green-400 border border-green-800' : 'bg-gray-800 text-gray-500 border border-gray-700'
             }`}>
                <div className={`w-2 h-2 rounded-full ${connectionState === 'connected' ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`}></div>
                {connectionState === 'connected' ? 'AI ACTIVE' : connectionState === 'connecting' ? 'CONNECTING...' : 'AI READY'}
             </div>

             {/* Rec Status */}
             {recordingState === 'recording' ? (
                 <div className="flex items-center gap-2 text-red-500 font-bold text-xs tracking-wider animate-pulse">
                     <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                     REC
                 </div>
             ) : (
                <div className="flex items-center gap-2 text-gray-600 font-bold text-xs tracking-wider">
                    <div className="w-3 h-3 bg-gray-600 rounded-full"></div>
                    REC
                </div>
             )}
        </div>
      </div>

      {/* --- Main Viewport --- */}
      <div className="relative flex-1 bg-gray-900 overflow-hidden">
        {permissionError ? (
          <div className="flex items-center justify-center h-full text-red-400 p-8 text-center">
            {permissionError}
          </div>
        ) : (
          <>
            {/* Video Feed */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1]"
            />
            
            {/* Teleprompter Overlay */}
            {!isEditMode && (
              <Teleprompter 
                words={scriptWords} 
                activeWordIndex={activeWordIndex}
                fontSize={fontSize}
                opacity={opacity}
              />
            )}

            {/* Edit Mode Modal (Overlay) */}
            {isEditMode && (
               <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
                  <div className="w-full max-w-3xl bg-gray-900 rounded-2xl shadow-2xl p-6 border border-gray-800">
                    <div className="flex justify-between items-center mb-4 border-b border-gray-800 pb-4">
                        <h2 className="text-xl font-bold text-white flex items-center gap-3">
                           <Type size={20} className="text-blue-500"/> 
                           Edit Script
                        </h2>
                        <div className="flex gap-4">
                             <button onClick={handleClearScript} className="text-sm text-gray-500 hover:text-red-400 transition-colors">Clear All</button>
                             <button 
                                onClick={() => setIsEditMode(false)}
                                className="text-sm text-blue-400 hover:text-blue-300 font-bold transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                    <textarea
                        className="w-full h-80 bg-gray-950/50 text-white p-4 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none resize-none border border-gray-800 text-lg leading-relaxed font-light"
                        placeholder="Paste your script here..."
                        value={scriptText}
                        onChange={handleScriptChange}
                    />
                    <div className="mt-4 flex justify-between text-xs text-gray-500 font-mono">
                        <span>{scriptWords.length} words</span>
                        <span>~{Math.ceil(scriptWords.length / 2.5)} seconds</span>
                    </div>
                  </div>
               </div>
            )}
          </>
        )}
      </div>

      {/* --- Bottom Control Bar --- */}
      <div className="h-24 bg-black border-t border-gray-800 flex items-center justify-between px-8 z-50 shrink-0">
         
         {/* Left: Settings */}
         <div className="flex items-center gap-6 w-1/3">
            <div className="relative group">
                <button 
                    onClick={() => setShowSettings(!showSettings)}
                    className="p-3 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-all"
                    title="Settings"
                >
                    <Settings size={22} />
                </button>
                
                {showSettings && (
                    <div className="absolute bottom-full left-0 mb-4 w-72 bg-gray-900/95 backdrop-blur rounded-xl shadow-2xl border border-gray-700 p-6">
                        <h3 className="text-xs font-bold text-gray-500 mb-6 uppercase tracking-wider">Display Settings</h3>
                        <div className="space-y-6">
                            <div>
                                <div className="flex justify-between text-xs text-gray-400 mb-2">
                                    <span>Text Size</span>
                                    <span>{fontSize}px</span>
                                </div>
                                <input 
                                    type="range" min="24" max="96" value={fontSize} 
                                    onChange={(e) => setFontSize(parseInt(e.target.value))}
                                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>
                            <div>
                                <div className="flex justify-between text-xs text-gray-400 mb-2">
                                    <span>Future Text Visibility</span>
                                    <span>{Math.round(opacity * 100)}%</span>
                                </div>
                                <input 
                                    type="range" min="0" max="1" step="0.05" value={opacity} 
                                    onChange={(e) => setOpacity(parseFloat(e.target.value))}
                                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
            
            <button 
                onClick={() => setIsEditMode(true)}
                className="p-3 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-all"
                title="Edit Script"
            >
                <Type size={22} />
            </button>
         </div>

         {/* Center: Record Button */}
         <div className="flex items-center justify-center gap-6 w-1/3">
             {recordingState === 'idle' ? (
                <button 
                    onClick={startRecording}
                    disabled={scriptWords.length === 0}
                    className={`
                        w-16 h-16 rounded-full flex items-center justify-center border-4 transition-all duration-300
                        ${scriptWords.length > 0 
                            ? 'border-white bg-red-600 hover:bg-red-500 hover:scale-105 shadow-lg shadow-red-900/40' 
                            : 'border-gray-700 bg-gray-800 cursor-not-allowed opacity-50'}
                    `}
                    title={scriptWords.length === 0 ? "Add script to record" : "Start Recording"}
                >
                     <div className="w-6 h-6 bg-white rounded-md"></div>
                </button>
             ) : (
                <div className="flex flex-col items-center gap-2">
                    <button 
                        onClick={stopRecording}
                        className="w-16 h-16 rounded-full flex items-center justify-center border-4 border-red-500/50 bg-transparent hover:bg-red-500/10 transition-all group"
                    >
                        <div className="w-6 h-6 bg-red-500 rounded-sm group-hover:scale-90 transition-transform"></div>
                    </button>
                </div>
             )}
         </div>

         {/* Right: Actions & Info */}
         <div className="flex items-center justify-end gap-4 w-1/3 text-gray-500 text-sm">
             {recordingState !== 'idle' && (
                <div className="font-mono text-red-400 text-lg tracking-widest">
                    {formatTime(recordingDuration)}
                </div>
             )}
             
             {recordingState === 'idle' && recordedChunks.length > 0 && (
                <button 
                    onClick={downloadVideo}
                    className="flex items-center gap-2 px-6 py-2.5 bg-white text-black rounded-full font-bold hover:bg-gray-200 transition-colors shadow-lg"
                >
                    <Download size={18} />
                    <span>Export Video</span>
                </button>
             )}
         </div>

      </div>
    </div>
  );
};

export default App;