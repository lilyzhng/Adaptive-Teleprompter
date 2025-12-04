import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Settings, Download, Type, MonitorPlay, Sparkles, ArrowRight, X } from 'lucide-react';
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
  const [fontSize, setFontSize] = useState(40);
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
      // Split by newline first to preserve paragraph structure
      const paragraphs = text.split(/\n/);
      const processedWords: ScriptWord[] = [];
      let isFirstWordOfText = true;

      paragraphs.forEach((para) => {
          const trimmedPara = para.trim();
          if (!trimmedPara) return; // Skip empty lines

          const wordsInPara = trimmedPara.split(/\s+/).filter(w => w.length > 0);
          
          wordsInPara.forEach((word, index) => {
              processedWords.push({
                  id: generateId(),
                  word: word,
                  cleanWord: cleanText(word),
                  isSpoken: false,
                  // Mark as paragraph start if it's the first word of the paragraph
                  // (but not the very first word of the entire script)
                  isParagraphStart: index === 0 && !isFirstWordOfText
              });
              isFirstWordOfText = false;
          });
      });

      setScriptWords(processedWords);
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
      const LOOKAHEAD = 60; 
      const searchEnd = Math.min(currentWords.length, currentIndex + LOOKAHEAD);
      
      let bestMatch = {
        endIndex: currentIndex, // Default to no change
        score: -1
      };

      for (let s = currentIndex; s < searchEnd; s++) {
        let matchLength = 0;
        
        for (let i = 0; i < incomingWords.length; i++) {
            if (s + i >= currentWords.length) break;
            const scriptW = currentWords[s + i].cleanWord;
            const inputW = incomingWords[i];
            if (isMatch(scriptW, inputW)) {
                matchLength++;
            } else {
                break;
            }
        }

        if (matchLength > 0) {
            const distance = s - currentIndex;
            let requiredLength = 1;
            if (distance > 0) requiredLength = 2; // Need 2 words to skip
            if (distance > 5) requiredLength = 3; // Need 3 words to skip far
            
            if (matchLength >= requiredLength) {
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
    a.download = `adaptive-recording-${new Date().toISOString()}.mp4`; 
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
        <div className="min-h-screen bg-cream text-charcoal flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
            {/* Background Texture/Elements */}
            <div className="absolute top-0 left-0 w-full h-full opacity-40 pointer-events-none" 
                 style={{ 
                     backgroundImage: 'radial-gradient(circle at 15% 15%, #F0EBE0 0%, transparent 20%), radial-gradient(circle at 85% 85%, #E8E0D0 0%, transparent 20%)' 
                 }}>
            </div>

            {/* Header */}
            <div className="text-center mb-12 z-10 max-w-2xl mx-auto">
                <div className="mb-4 inline-block px-4 py-1.5 rounded-full border border-gold/40 text-gold text-[10px] font-bold tracking-[0.2em] uppercase bg-white/50 backdrop-blur-sm">
                    AI For Video Creation
                </div>
                <h1 className="text-6xl md:text-7xl font-serif mb-6 tracking-tight text-charcoal">
                    Adaptive Teleprompter
                </h1>
                <p className="text-gray-500 text-lg font-serif italic max-w-lg mx-auto leading-relaxed">
                    A responsive teleprompter that listens to your voice and scrolls in real-time, powered by Gemini.
                </p>
            </div>

            {/* Script Input Card */}
            <div className="w-full max-w-3xl z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="bg-white rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] border border-[#EBE8E0] overflow-hidden">
                    {/* Card Header */}
                    <div className="px-8 py-5 border-b border-[#F0F0F0] flex justify-between items-center bg-white">
                        <div className="flex items-center gap-3">
                             <div className="w-1.5 h-1.5 rounded-full bg-gold"></div>
                             <span className="text-xs font-bold text-gray-400 tracking-widest uppercase">Script Editor</span>
                        </div>
                        <button 
                            onClick={handleClearScript}
                            className="text-xs font-medium text-gray-400 hover:text-red-500 transition-colors px-2 py-1"
                        >
                            Clear
                        </button>
                    </div>
                    
                    {/* Text Area */}
                    <div className="p-2 bg-white">
                        <textarea
                            className="w-full h-80 bg-white text-charcoal p-6 outline-none resize-none text-xl leading-relaxed font-light placeholder-gray-300 font-serif"
                            placeholder="Paste your script here..."
                            value={scriptText}
                            onChange={handleScriptChange}
                        />
                    </div>
                    
                    {/* Footer Stats */}
                    <div className="bg-[#FAF9F6] px-8 py-4 border-t border-[#F0F0F0] flex justify-between text-xs text-gray-400 font-medium tracking-wide">
                        <span>{scriptWords.length} words</span>
                        <span>~{Math.ceil(scriptWords.length / 2.5)}s estimated</span>
                    </div>
                </div>

                {/* Start Button */}
                <div className="mt-10 flex justify-center">
                    <button
                        onClick={() => setHasStarted(true)}
                        disabled={scriptWords.length === 0}
                        className={`
                            group px-10 py-4 rounded-full font-medium text-lg flex items-center gap-3 transition-all transform duration-300
                            ${scriptWords.length > 0 
                                ? 'bg-charcoal text-white hover:bg-black hover:-translate-y-1 shadow-lg shadow-black/10' 
                                : 'bg-[#E0E0E0] text-gray-400 cursor-not-allowed'}
                        `}
                    >
                        <span>Start Session</span>
                        <ArrowRight size={18} className={`transition-transform duration-300 ${scriptWords.length > 0 ? 'group-hover:translate-x-1' : ''}`} />
                    </button>
                </div>

                {/* Permission Status */}
                <div className="mt-8 text-center h-6">
                    {!stream && !permissionError && (
                         <div className="flex items-center justify-center gap-2 text-gray-400 text-sm animate-pulse">
                            <Sparkles size={14} className="text-gold" />
                            <span>Initializing Camera...</span>
                         </div>
                    )}
                    {permissionError && (
                        <span className="text-red-500 text-sm bg-red-50 px-3 py-1 rounded-full border border-red-100">
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
    <div className="relative h-screen w-screen bg-cream overflow-hidden flex flex-col font-sans">
      
      {/* --- Top Header Bar --- */}
      <div className="h-16 bg-cream/90 backdrop-blur-md border-b border-[#E6E6E6] flex items-center justify-between px-8 z-50 shrink-0">
        <div className="flex items-center gap-4">
            <button 
                onClick={() => setHasStarted(false)}
                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors group"
                title="Back to Setup"
            >
                <MonitorPlay size={16} className="text-gray-600 group-hover:text-charcoal" />
            </button>
            <h1 className="text-charcoal font-serif font-bold text-xl tracking-tight">Adaptive Teleprompter</h1>
        </div>

        <div className="flex items-center gap-6">
             {/* AI Status Pill */}
             <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase transition-colors duration-300 ${
                 connectionState === 'connected' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-500 border border-gray-200'
             }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${connectionState === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
                {connectionState === 'connected' ? 'AI Active' : connectionState === 'connecting' ? 'Connecting...' : 'AI Ready'}
             </div>

             {/* Rec Status */}
             {recordingState === 'recording' && (
                 <div className="flex items-center gap-2 text-red-500 font-bold text-[10px] tracking-widest uppercase animate-pulse">
                     <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                     REC
                 </div>
             )}
        </div>
      </div>

      {/* --- Main Viewport --- */}
      <div className="relative flex-1 bg-[#1a1a1a] overflow-hidden">
        {permissionError ? (
          <div className="flex items-center justify-center h-full text-white/50 p-8 text-center font-serif italic">
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
               <div className="absolute inset-0 z-30 bg-cream/95 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
                  <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl border border-[#E6E6E6] flex flex-col h-[80vh]">
                    <div className="flex justify-between items-center px-8 py-6 border-b border-[#F0F0F0]">
                        <h2 className="text-2xl font-serif font-bold text-charcoal">Edit Script</h2>
                        <button 
                           onClick={() => setIsEditMode(false)}
                           className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <X size={24} className="text-gray-500" />
                        </button>
                    </div>
                    
                    <div className="flex-1 p-4 bg-white overflow-hidden">
                         <textarea
                            className="w-full h-full bg-transparent text-charcoal p-4 outline-none resize-none text-2xl leading-relaxed font-serif placeholder-gray-300"
                            placeholder="Type your script..."
                            value={scriptText}
                            onChange={handleScriptChange}
                        />
                    </div>

                    <div className="px-8 py-5 border-t border-[#F0F0F0] bg-[#FAF9F6] flex justify-between items-center rounded-b-2xl">
                         <button onClick={handleClearScript} className="text-sm font-medium text-red-500 hover:text-red-600">
                             Clear All
                         </button>
                         <div className="flex items-center gap-6">
                            <span className="text-xs text-gray-400 font-mono">{scriptWords.length} words</span>
                            <button 
                                onClick={() => setIsEditMode(false)}
                                className="px-6 py-2 bg-charcoal text-white rounded-full text-sm font-bold hover:bg-black transition-colors"
                            >
                                Done
                            </button>
                         </div>
                    </div>
                  </div>
               </div>
            )}
          </>
        )}
      </div>

      {/* --- Bottom Control Bar --- */}
      <div className="h-24 bg-cream/90 backdrop-blur-md border-t border-[#E6E6E6] flex items-center justify-between px-10 z-50 shrink-0">
         
         {/* Left: Settings */}
         <div className="flex items-center gap-4 w-1/3">
            <div className="relative group">
                <button 
                    onClick={() => setShowSettings(!showSettings)}
                    className={`p-3 rounded-full transition-all duration-300 ${showSettings ? 'bg-charcoal text-white' : 'text-gray-500 hover:bg-gray-200 hover:text-charcoal'}`}
                    title="Settings"
                >
                    <Settings size={20} />
                </button>
                
                {showSettings && (
                    <div className="absolute bottom-full left-0 mb-6 w-72 bg-white rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] border border-[#EBE8E0] p-6 animate-in slide-in-from-bottom-2">
                        <h3 className="text-[10px] font-bold text-gold mb-6 uppercase tracking-widest">Display Settings</h3>
                        <div className="space-y-8">
                            <div>
                                <div className="flex justify-between text-xs font-medium text-gray-500 mb-3">
                                    <span>Text Size</span>
                                    <span>{fontSize}px</span>
                                </div>
                                <input 
                                    type="range" min="24" max="96" value={fontSize} 
                                    onChange={(e) => setFontSize(parseInt(e.target.value))}
                                    className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-charcoal"
                                />
                            </div>
                            <div>
                                <div className="flex justify-between text-xs font-medium text-gray-500 mb-3">
                                    <span>Future Text Visibility</span>
                                    <span>{Math.round(opacity * 100)}%</span>
                                </div>
                                <input 
                                    type="range" min="0" max="1" step="0.05" value={opacity} 
                                    onChange={(e) => setOpacity(parseFloat(e.target.value))}
                                    className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-charcoal"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
            
            <button 
                onClick={() => setIsEditMode(true)}
                className="p-3 text-gray-500 hover:bg-gray-200 hover:text-charcoal rounded-full transition-all"
                title="Edit Script"
            >
                <Type size={20} />
            </button>
         </div>

         {/* Center: Record Button */}
         <div className="flex items-center justify-center w-1/3">
             {recordingState === 'idle' ? (
                <button 
                    onClick={startRecording}
                    disabled={scriptWords.length === 0}
                    className={`
                        w-16 h-16 rounded-full flex items-center justify-center border-[3px] transition-all duration-300
                        ${scriptWords.length > 0 
                            ? 'border-charcoal bg-transparent hover:bg-charcoal group' 
                            : 'border-gray-300 bg-gray-100 cursor-not-allowed opacity-50'}
                    `}
                    title={scriptWords.length === 0 ? "Add script to record" : "Start Recording"}
                >
                     <div className={`w-6 h-6 rounded-full transition-colors duration-300 ${scriptWords.length > 0 ? 'bg-red-500 group-hover:bg-red-500' : 'bg-gray-300'}`}></div>
                </button>
             ) : (
                <button 
                    onClick={stopRecording}
                    className="w-16 h-16 rounded-full flex items-center justify-center border-[3px] border-red-500 bg-transparent hover:bg-red-50 transition-all group"
                >
                    <div className="w-6 h-6 bg-red-500 rounded-sm group-hover:scale-90 transition-transform"></div>
                </button>
             )}
         </div>

         {/* Right: Actions & Info */}
         <div className="flex items-center justify-end gap-4 w-1/3 text-sm">
             {recordingState !== 'idle' && (
                <div className="font-mono text-charcoal font-medium text-lg tracking-widest">
                    {formatTime(recordingDuration)}
                </div>
             )}
             
             {recordingState === 'idle' && recordedChunks.length > 0 && (
                <button 
                    onClick={downloadVideo}
                    className="flex items-center gap-2 px-6 py-3 bg-charcoal text-white rounded-full text-xs font-bold tracking-wider uppercase hover:bg-black transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                >
                    <Download size={16} />
                    <span>Download</span>
                </button>
             )}
         </div>

      </div>
    </div>
  );
};

export default App;