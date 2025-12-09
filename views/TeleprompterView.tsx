
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Home, FileText, Loader2, StopCircle, Volume2, ArrowRightCircle, ChevronLeft, Settings, X, AlertCircle } from 'lucide-react';
import { ScriptWord, PerformanceReport, SavedItem } from '../types';
import Teleprompter from '../components/Teleprompter';
import PerformanceReportComponent from '../components/PerformanceReport';
import { generateId, cleanText, isMatch, formatTime, extractAudioFromVideo } from '../utils';
import { generateTTS, analyzeTeleprompterRecording } from '../services/analysisService';

interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}
const _window = window as unknown as IWindow;
const SpeechRecognition = _window.SpeechRecognition || _window.webkitSpeechRecognition;

interface TeleprompterViewProps {
    onHome: (force: boolean) => void;
    isSaved: (title: string, content: string) => boolean;
    onToggleSave: (item: Omit<SavedItem, 'id' | 'date'>) => void;
    onSaveReport: (title: string, type: 'coach' | 'rehearsal', report: PerformanceReport) => void;
}

const TeleprompterView: React.FC<TeleprompterViewProps> = ({ onHome, isSaved, onToggleSave, onSaveReport }) => {
    // State
    const [hasStarted, setHasStarted] = useState(false);
    const [scriptText, setScriptText] = useState("");
    const [scriptWords, setScriptWords] = useState<ScriptWord[]>([]);
    const [activeWordIndex, setActiveWordIndex] = useState(0);
    const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'paused'>('idle');
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
    
    // Media & TTS
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [permissionError, setPermissionError] = useState<string | null>(null);
    const [isPlayingTTS, setIsPlayingTTS] = useState(false);
    const [isGeneratingTTS, setIsGeneratingTTS] = useState(false);
    
    // Analysis
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [performanceReport, setPerformanceReport] = useState<PerformanceReport | null>(null);

    // Settings
    const [fontSize, setFontSize] = useState(40);
    const [opacity, setOpacity] = useState(0.4);
    const [showSettings, setShowSettings] = useState(false);

    // Refs
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recognitionRef = useRef<any>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const timerIntervalRef = useRef<number | null>(null);

    // --- Logic ---
    const handleHomeClick = () => {
        // Smart check: Only ask for confirmation if script has content
        const hasData = scriptText.trim().length > 0;
        onHome(!hasData);
    };

    // --- Init ---
    const initCamera = useCallback(async () => {
        setPermissionError(null);
        try {
            if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" },
                audio: true,
            });
            streamRef.current = mediaStream;
            setStream(mediaStream);
        } catch (err: any) {
            console.error("Media access error:", err);
            setPermissionError("Camera/Microphone access denied.");
        }
    }, []);

    useEffect(() => {
        initCamera();
        return () => {
             if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
             stopTTS();
        };
    }, [initCamera]);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [hasStarted, stream]);

    const processScript = (text: string) => {
        const safeText = text.replace(/-/g, ' ');
        const paragraphs = safeText.split(/\n/);
        const processedWords: ScriptWord[] = [];
        let isFirstWordOfText = true;
        paragraphs.forEach((para) => {
            const trimmedPara = para.trim();
            if (!trimmedPara) return;
            const wordsInPara = trimmedPara.split(/\s+/).filter(w => w.length > 0);
            wordsInPara.forEach((word, index) => {
                processedWords.push({
                    id: generateId(),
                    word: word,
                    cleanWord: cleanText(word),
                    isSpoken: false,
                    isParagraphStart: index === 0 && !isFirstWordOfText
                });
                isFirstWordOfText = false;
            });
        });
        setScriptWords(processedWords);
        setActiveWordIndex(0);
    };

    const handleScriptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setScriptText(e.target.value);
        processScript(e.target.value);
    };

    const handleTranscription = useCallback((transcription: string) => {
        if (!transcription) return;
        const incomingWords = transcription.split(/\s+/).map(cleanText).filter(Boolean);
        if (incomingWords.length === 0) return;

        setScriptWords(currentWords => {
          let startIndex = currentWords.findIndex(w => !w.isSpoken);
          if (startIndex === -1) startIndex = currentWords.length;
          const LOOKAHEAD = 50; 
          const searchEnd = Math.min(currentWords.length, startIndex + LOOKAHEAD);
          let bestMatchIndex = -1;

          for (let s = startIndex; s < searchEnd; s++) {
            for (let i = 0; i < incomingWords.length; i++) {
               if (isMatch(currentWords[s].cleanWord, incomingWords[i])) {
                   let matchLen = 1;
                   let scriptOffset = 1;
                   let inputOffset = 1;
                   while (s + scriptOffset < searchEnd && i + inputOffset < incomingWords.length) {
                       if (isMatch(currentWords[s + scriptOffset].cleanWord, incomingWords[i + inputOffset])) {
                           matchLen++; scriptOffset++; inputOffset++;
                       } else { break; }
                   }
                   const wordLen = currentWords[s].cleanWord.length;
                   const isStrongMatch = (matchLen >= 2) || (matchLen === 1 && wordLen >= 5);
                   if (isStrongMatch) {
                       bestMatchIndex = s + matchLen;
                       i = incomingWords.length; s = searchEnd; 
                   }
               }
            }
          }
          if (bestMatchIndex > startIndex) {
             return currentWords.map((w, i) => ({ ...w, isSpoken: i < bestMatchIndex ? true : w.isSpoken }));
          }
          return currentWords;
        });
    }, []);

    useEffect(() => {
        const idx = scriptWords.findIndex(w => !w.isSpoken);
        if (idx !== -1) setActiveWordIndex(idx);
        else if (scriptWords.length > 0 && scriptWords.every(w => w.isSpoken)) setActiveWordIndex(scriptWords.length);
    }, [scriptWords]);

    // --- TTS ---
    const stopTTS = () => {
        if (audioSourceRef.current) {
            try { audioSourceRef.current.stop(); } catch(e) {}
            audioSourceRef.current = null;
        }
        setIsPlayingTTS(false);
    };

    const playTTS = async () => {
        if (isPlayingTTS) { stopTTS(); return; }
        if (!scriptText.trim()) return;
        setIsGeneratingTTS(true);
        try {
            const base64Audio = await generateTTS(scriptText);
            if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();

            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
            
            // Manual decoding logic simplified here or import helper
            const dataInt16 = new Int16Array(bytes.buffer);
            const buffer = audioContextRef.current.createBuffer(1, dataInt16.length, 24000);
            const channelData = buffer.getChannelData(0);
            for(let i=0; i<dataInt16.length; i++) channelData[i] = dataInt16[i]/32768.0;

            const source = audioContextRef.current.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContextRef.current.destination);
            source.onended = () => { setIsPlayingTTS(false); audioSourceRef.current = null; };
            audioSourceRef.current = source;
            source.start();
            setIsPlayingTTS(true);
        } catch (e) {
            console.error(e);
            alert("TTS Failed");
        } finally {
            setIsGeneratingTTS(false);
        }
    };

    // --- Recording ---
    const startRecording = async () => {
        if (!stream) { await initCamera(); if(!streamRef.current) return; }
        stopTTS();
        setRecordedChunks([]);
        setRecordingDuration(0);
        setPerformanceReport(null);
        
        const options = MediaRecorder.isTypeSupported('video/mp4') ? { mimeType: 'video/mp4' } : { mimeType: 'video/webm' };
        const recorder = new MediaRecorder(stream || streamRef.current!, options);
        recorder.ondataavailable = (e) => { if(e.data.size > 0) setRecordedChunks(p => [...p, e.data]); };
        recorder.start(1000);
        mediaRecorderRef.current = recorder;

        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';
            recognition.onresult = (e: any) => handleTranscription(e.results[e.resultIndex][0].transcript);
            try { recognition.start(); recognitionRef.current = recognition; } catch(e) {}
        } else {
            alert("Speech Recognition not supported.");
        }

        setRecordingState('recording');
        timerIntervalRef.current = window.setInterval(() => setRecordingDuration(d => d + 1), 1000);
    };

    const stopRecording = () => {
        if(mediaRecorderRef.current) mediaRecorderRef.current.stop();
        if(timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
        if(recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
        setRecordingState('idle');
        
        // Auto Analyze after stop (small delay for chunks)
        setTimeout(analyzeRecording, 500);
    };

    const analyzeRecording = async () => {
        if (recordedChunks.length === 0) return;
        setIsAnalyzing(true);
        try {
            const videoBlob = new Blob(recordedChunks, { type: recordedChunks[0].type });
            const base64Audio = await extractAudioFromVideo(videoBlob);
            const report = await analyzeTeleprompterRecording(base64Audio, scriptText);
            setPerformanceReport(report);
            await onSaveReport(scriptText.substring(0, 30) + (scriptText.length > 30 ? "..." : "") || "Rehearsal", 'rehearsal', report);
        } catch (e) {
            console.error(e);
            alert("Analysis failed.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="h-full w-full bg-cream text-charcoal font-sans relative">
            {!hasStarted ? (
                 <div className="h-full flex flex-col p-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 overflow-y-auto">
                    <div className="flex items-center justify-between mb-8">
                        <button onClick={handleHomeClick} className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors">
                            <Home size={18} className="text-gray-500" />
                        </button>
                         <div className="text-center">
                            <div className="text-[10px] font-bold text-gold uppercase tracking-widest">MicDrop</div>
                            <h2 className="text-2xl font-serif font-bold text-charcoal">Rehearsal Studio</h2>
                         </div>
                         <div className="w-10"></div>
                    </div>
                    
                    <div className="bg-white rounded-3xl shadow-xl border border-[#EBE8E0] overflow-hidden flex flex-col flex-1 min-h-[500px]">
                        <div className="p-4 border-b border-[#E6E6E6] flex justify-between items-center bg-[#FAF9F6]">
                            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
                                <FileText size={14} /> Script Editor
                            </div>
                            <div className="flex gap-2">
                                <button onClick={playTTS} disabled={isGeneratingTTS || !scriptText.trim()} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest border border-gray-200 hover:bg-white hover:border-gold/50 transition-all disabled:opacity-50">
                                    {isGeneratingTTS ? <Loader2 size={12} className="animate-spin"/> : isPlayingTTS ? <StopCircle size={12}/> : <Volume2 size={12}/>}
                                    {isPlayingTTS ? 'Stop' : 'Listen'}
                                </button>
                                <button onClick={() => { setScriptText(""); setScriptWords([]); }} className="text-xs font-bold text-gray-400 hover:text-red-400 uppercase tracking-widest px-3 py-1.5">Clear</button>
                            </div>
                        </div>
                        <textarea className="flex-1 p-8 text-lg font-serif leading-relaxed resize-none outline-none text-charcoal placeholder:text-gray-300" placeholder="Paste speech here..." value={scriptText} onChange={handleScriptChange} />
                        <div className="p-6 bg-[#FAF9F6] border-t border-[#E6E6E6] flex justify-between items-center">
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">{scriptWords.length} words</div>
                            <button onClick={() => setHasStarted(true)} className="px-8 py-3 bg-charcoal text-white rounded-xl font-bold hover:bg-black transition-colors shadow-lg flex items-center gap-2">Enter Studio <ArrowRightCircle size={18} /></button>
                        </div>
                    </div>
                 </div>
            ) : (
                <div className="relative h-full w-full bg-black">
                     <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover opacity-80" />
                     {/* Overlay UI */}
                     <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-30 bg-gradient-to-b from-black/60 to-transparent">
                        <button onClick={() => setHasStarted(false)} className="text-white/80 hover:text-white flex items-center gap-2 text-xs font-bold uppercase tracking-widest"><ChevronLeft size={16} /> Exit Studio</button>
                        <div className="flex items-center gap-4">
                            {recordingState === 'recording' && (
                                <div className="flex items-center gap-2 bg-red-500/20 border border-red-500/50 px-4 py-1.5 rounded-full backdrop-blur-md">
                                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                                    <span className="text-red-100 font-mono text-xs">{formatTime(recordingDuration)}</span>
                                </div>
                            )}
                            <button onClick={() => setShowSettings(!showSettings)} className="text-white/80 hover:text-white"><Settings size={20} /></button>
                        </div>
                     </div>
                     
                     <Teleprompter words={scriptWords} activeWordIndex={activeWordIndex} fontSize={fontSize} opacity={opacity} />

                     <div className="absolute bottom-0 left-0 right-0 p-10 flex justify-center items-center z-30 bg-gradient-to-t from-black/80 to-transparent">
                        {recordingState === 'idle' ? (
                            <button onClick={startRecording} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 border-4 border-white/20 flex items-center justify-center transition-all hover:scale-105 shadow-[0_0_30px_rgba(239,68,68,0.4)]">
                                <div className="w-6 h-6 rounded bg-white"></div>
                            </button>
                        ) : (
                            <button onClick={stopRecording} className="w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 border-4 border-white flex items-center justify-center backdrop-blur-md transition-all hover:scale-105">
                                <div className="w-6 h-6 rounded bg-red-500"></div>
                            </button>
                        )}
                     </div>

                     {/* Settings Modal */}
                     {showSettings && (
                        <div className="absolute top-20 right-6 w-72 bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 z-40 text-white">
                            <div className="flex justify-between items-center mb-6">
                                <span className="text-xs font-bold uppercase tracking-widest text-gold">Studio Settings</span>
                                <button onClick={() => setShowSettings(false)}><X size={16} /></button>
                            </div>
                            <div className="space-y-6">
                                <div><label className="block text-xs font-medium mb-2 text-gray-400">Font Size</label><input type="range" min="20" max="80" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-full accent-gold h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"/></div>
                                <div><label className="block text-xs font-medium mb-2 text-gray-400">Opacity</label><input type="range" min="0" max="1" step="0.1" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-full accent-gold h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"/></div>
                            </div>
                        </div>
                     )}

                     {performanceReport && (
                        <div className="fixed inset-0 z-50 bg-cream flex flex-col overflow-hidden animate-in fade-in duration-300">
                             <div className="flex-1 overflow-y-auto">
                                <div className="max-w-4xl mx-auto p-8 pb-32">
                                    <PerformanceReportComponent report={performanceReport} isSaved={isSaved} onToggleSave={onToggleSave} onDone={(f) => { setPerformanceReport(null); setHasStarted(false); }} />
                                </div>
                             </div>
                        </div>
                     )}

                     {isAnalyzing && (
                        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                            <div className="bg-white rounded-3xl p-8 text-center max-w-sm m-4">
                                <Loader2 className="animate-spin mx-auto text-gold mb-4" size={40} />
                                <h3 className="text-xl font-serif font-bold text-charcoal">Analyzing...</h3>
                            </div>
                        </div>
                     )}
                </div>
            )}
        </div>
    );
}

export default TeleprompterView;
