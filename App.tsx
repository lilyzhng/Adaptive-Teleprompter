import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Mic, Play, Square, Settings, Download, Type, Upload } from 'lucide-react';
import { ScriptWord, ConnectionState } from './types';
import { GeminiLiveService } from './services/geminiLiveService';
import Teleprompter from './components/Teleprompter';

// Utility to generate unique IDs
const generateId = () => Math.random().toString(36).substr(2, 9);

// Utility to clean text for comparison
const cleanText = (text: string) => text.toLowerCase().replace(/[^\w\s]|_/g, "").trim();

const App: React.FC = () => {
  // State
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [scriptText, setScriptText] = useState<string>("");
  const [scriptWords, setScriptWords] = useState<ScriptWord[]>([]);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(0);
  const [isEditMode, setIsEditMode] = useState<boolean>(true);
  
  // Recording State
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'paused'>('idle');
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  // AI State
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [liveService, setLiveService] = useState<GeminiLiveService | null>(null);

  // Settings
  const [fontSize, setFontSize] = useState(32);
  const [opacity, setOpacity] = useState(0.5);
  const [showSettings, setShowSettings] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  // -- Initialization --

  useEffect(() => {
    // Request permissions on mount
    const initCamera = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" },
          audio: true,
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        setPermissionError("Please allow camera and microphone access to use the teleprompter.");
        console.error("Media access error:", err);
      }
    };
    initCamera();

    return () => {
      // Cleanup stream
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // -- Script Processing --

  const handleScriptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setScriptText(text);
    
    // Tokenize script into words
    const words = text.split(/\s+/).filter(w => w.length > 0).map(word => ({
      id: generateId(),
      word: word,
      cleanWord: cleanText(word),
      isSpoken: false
    }));
    setScriptWords(words);
    setActiveWordIndex(0);
  };

  // -- ASR Matching Logic --

  const handleTranscription = useCallback((transcription: string) => {
    if (!transcription) return;
    
    // We compare incoming transcription chunks against the script
    // This simple algorithm looks ahead from the current index
    // to find a match.
    
    const incomingWords = transcription.split(/\s+/).map(cleanText).filter(Boolean);
    
    setScriptWords(currentWords => {
      let newActiveIndex = -1; // -1 means no change found in this chunk
      
      // We need to access the LATEST active index. 
      // Since we are inside setScriptWords updater, we can't easily see 'activeWordIndex' state 
      // without adding it to dependency, which might cause race conditions or loop.
      // Instead, we derive the current active index from the `currentWords` where `isSpoken` is false.
      
      let currentIndex = currentWords.findIndex(w => !w.isSpoken);
      if (currentIndex === -1) currentIndex = currentWords.length; // All spoken

      let searchIndex = currentIndex;
      const SEARCH_WINDOW = 5; // How far ahead to look for a match

      // Try to match incoming words to the script
      for (const incWord of incomingWords) {
        // Look ahead in the script
        for (let i = 0; i < SEARCH_WINDOW; i++) {
          const scriptIdx = searchIndex + i;
          if (scriptIdx >= currentWords.length) break;

          const scriptWord = currentWords[scriptIdx];
          
          // Fuzzy match or exact match
          if (scriptWord.cleanWord === incWord) {
            // Found a match!
            // Mark everything before this as spoken
            newActiveIndex = scriptIdx + 1;
            searchIndex = newActiveIndex; // Move search start forward
            break; 
          }
        }
      }

      if (newActiveIndex !== -1 && newActiveIndex > currentIndex) {
         // Update state
         setActiveWordIndex(newActiveIndex); // Side effect in render cycle is okay-ish here? No, better use useEffect or just set it. 
         // Actually, we can't call setActiveWordIndex inside this callback easily if it depends on prev state.
         // Let's return new words array.
         return currentWords.map((w, i) => ({
           ...w,
           isSpoken: i < newActiveIndex
         }));
      }

      return currentWords;
    });
  }, []);

  // Sync active index with words state changes (since we updated isSpoken above)
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

    // Initialize AI Service
    const service = new GeminiLiveService({
      onConnect: () => setConnectionState('connected'),
      onDisconnect: () => setConnectionState('disconnected'),
      onError: (e) => {
        console.error(e);
        setConnectionState('disconnected');
        stopRecording(); // Safety stop
      },
      onTranscription: handleTranscription
    });

    setLiveService(service);
    setConnectionState('connecting');
    await service.connect(stream);

    // Start Media Recorder
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

    recorder.start(1000); // Collect chunks every second
    mediaRecorderRef.current = recorder;
    setRecordingState('recording');
    setIsEditMode(false);

    // Timer
    timerIntervalRef.current = window.setInterval(() => {
      setRecordingDuration(d => d + 1);
    }, 1000);
  };

  const stopRecording = async () => {
    // Stop Media Recorder
    if (mediaRecorderRef.current && recordingState !== 'idle') {
      mediaRecorderRef.current.stop();
    }
    
    // Stop Timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // Stop AI
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
    a.download = `teleprompter-recording-${new Date().toISOString()}.mp4`; // Browser might enforce webm extension if codec is webm, but mp4 name is requested
    a.click();
    window.URL.revokeObjectURL(url);
    
    // Reset script progress? Optional.
    // setActiveWordIndex(0);
    // setScriptWords(prev => prev.map(w => ({...w, isSpoken: false})));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative h-screen w-screen bg-black overflow-hidden flex flex-col">
      
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
              muted // Muted to prevent feedback loop
              className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1]" // Mirror effect
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

            {/* Script Editor Mode */}
            {isEditMode && (
               <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="w-full max-w-2xl bg-gray-800 rounded-xl shadow-2xl p-6 border border-gray-700">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                           <Type size={20} className="text-blue-400"/> Script Editor
                        </h2>
                        <button 
                            onClick={() => setIsEditMode(false)}
                            className="text-gray-400 hover:text-white"
                        >
                            Close Preview
                        </button>
                    </div>
                    <textarea
                        className="w-full h-64 bg-gray-900 text-white p-4 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none border border-gray-700"
                        placeholder="Paste your script here..."
                        value={scriptText}
                        onChange={handleScriptChange}
                    />
                    <div className="mt-4 flex justify-between text-sm text-gray-400">
                        <span>{scriptWords.length} words</span>
                        <span>Estimated time: {Math.ceil(scriptWords.length / 2.5)}s</span>
                    </div>
                  </div>
               </div>
            )}
          </>
        )}
      </div>

      {/* --- Control Bar --- */}
      <div className="h-24 bg-gray-950 border-t border-gray-800 flex items-center justify-between px-8 z-50">
         
         {/* Left: Status & Settings */}
         <div className="flex items-center gap-4 w-1/3">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${connectionState === 'connected' ? 'bg-green-900/30 border-green-700 text-green-400' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                <div className={`w-2 h-2 rounded-full ${connectionState === 'connected' ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`}></div>
                {connectionState === 'connected' ? 'AI Connected' : connectionState === 'connecting' ? 'Connecting...' : 'AI Ready'}
            </div>
            
            <div className="relative">
                <button 
                    onClick={() => setShowSettings(!showSettings)}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-full transition-colors"
                >
                    <Settings size={20} />
                </button>
                
                {/* Settings Popup */}
                {showSettings && (
                    <div className="absolute bottom-full left-0 mb-4 w-64 bg-gray-800 rounded-lg shadow-xl border border-gray-700 p-4">
                        <h3 className="text-sm font-bold text-gray-300 mb-3">Teleprompter Settings</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">Font Size ({fontSize}px)</label>
                                <input 
                                    type="range" min="16" max="72" value={fontSize} 
                                    onChange={(e) => setFontSize(parseInt(e.target.value))}
                                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">Opacity ({Math.round(opacity * 100)}%)</label>
                                <input 
                                    type="range" min="0" max="1" step="0.1" value={opacity} 
                                    onChange={(e) => setOpacity(parseFloat(e.target.value))}
                                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
         </div>

         {/* Center: Main Controls */}
         <div className="flex items-center justify-center gap-6 w-1/3">
             {recordingState === 'idle' ? (
                 <>
                    <button 
                        onClick={() => setIsEditMode(true)}
                        className="p-4 bg-gray-800 text-gray-300 hover:bg-gray-700 rounded-full transition-all"
                        title="Edit Script"
                    >
                        <Type size={24} />
                    </button>
                    
                    <button 
                        onClick={startRecording}
                        disabled={scriptWords.length === 0}
                        className={`
                            p-5 rounded-full shadow-lg transition-all transform hover:scale-105 active:scale-95
                            ${scriptWords.length > 0 
                                ? 'bg-red-600 text-white hover:bg-red-500 shadow-red-900/50' 
                                : 'bg-gray-800 text-gray-600 cursor-not-allowed'}
                        `}
                        title="Start Recording"
                    >
                         <div className="w-4 h-4 bg-white rounded-full"></div>
                    </button>

                    {recordedChunks.length > 0 && (
                        <button 
                            onClick={downloadVideo}
                            className="p-4 bg-blue-600 text-white hover:bg-blue-500 rounded-full transition-all"
                            title="Download Last Recording"
                        >
                            <Download size={24} />
                        </button>
                    )}
                 </>
             ) : (
                <div className="flex flex-col items-center">
                    <button 
                        onClick={stopRecording}
                        className="p-5 bg-gray-800 border-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-white rounded-full transition-all transform hover:scale-105"
                    >
                        <Square size={20} fill="currentColor" />
                    </button>
                    <span className="mt-2 text-xs font-mono text-red-400 animate-pulse">
                        {formatTime(recordingDuration)}
                    </span>
                </div>
             )}
         </div>

         {/* Right: Info */}
         <div className="flex items-center justify-end gap-4 w-1/3 text-gray-500 text-sm">
             {recordingState === 'recording' && (
                <div className="flex items-center gap-2">
                    <Mic size={16} className="text-red-400 animate-bounce" />
                    <span>Listening...</span>
                </div>
             )}
         </div>

      </div>
    </div>
  );
};

export default App;
