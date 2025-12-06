
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Settings, Download, Type, MonitorPlay, Sparkles, ArrowRight, X, Loader2, Award, Lightbulb, Volume2, StopCircle, Mic, Ear, Upload, MessageSquare, AlertCircle, Check, ChevronLeft, FileText, ArrowRightCircle, Video, FileAudio, Home, AudioLines, Flame, ScrollText, ThumbsUp, Star, PenTool, Quote, Mic2, PlayCircle } from 'lucide-react';
import { GoogleGenAI, Type as GeminiType, Modality } from '@google/genai';
import { ScriptWord, PerformanceReport, DetailedFeedback, Highlight, SpeechDrill } from './types';
import Teleprompter from './components/Teleprompter';
import html2canvas from 'html2canvas';

// Add type definition for Web Speech API
interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}
const _window = window as unknown as IWindow;
const SpeechRecognition = _window.SpeechRecognition || _window.webkitSpeechRecognition;

// Utility to generate unique IDs
const generateId = () => Math.random().toString(36).substr(2, 9);

// Utility to clean text for comparison
const cleanText = (text: string) => 
  text.toLowerCase()
    .replace(/[\u2018\u2019]/g, "'") // Normalize curly single quotes
    .replace(/[\u201C\u201D]/g, '"') // Normalize curly double quotes
    .replace(/-/g, " ")              // Treat hyphens as spaces
    .replace(/[^\w\s']|_/g, "")      // Remove punctuation except apostrophes
    .trim();

// Utility to convert blob to base64
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Utility to convert AudioBuffer to WAV Blob
const audioBufferToWav = (buffer: AudioBuffer): Blob => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  const bufferLength = buffer.length;
  const byteRate = sampleRate * blockAlign;
  const dataByteCount = bufferLength * blockAlign;
  
  const bufferArr = new ArrayBuffer(44 + dataByteCount);
  const view = new DataView(bufferArr);
  
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* RIFF chunk length */
  view.setUint32(4, 36 + dataByteCount, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, byteRate, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, blockAlign, true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, dataByteCount, true);
  
  // Write interleaved PCM data
  let offset = 44;
  for (let i = 0; i < bufferLength; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = buffer.getChannelData(channel)[i];
      // Clip sample
      const s = Math.max(-1, Math.min(1, sample));
      // Scale to 16-bit integer
      const int16 = s < 0 ? s * 0x8000 : s * 0x7FFF;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }
  
  return new Blob([bufferArr], { type: 'audio/wav' });
};

// Utility to decode raw PCM data into an AudioBuffer
const pcmToAudioBuffer = (
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): AudioBuffer => {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Convert int16 to float [-1.0, 1.0]
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// Utility to extract audio from video blob
const extractAudioFromVideo = async (videoBlob: Blob): Promise<string> => {
    const arrayBuffer = await videoBlob.arrayBuffer();
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const wavBlob = audioBufferToWav(audioBuffer);
    return blobToBase64(wavBlob);
};

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
    
    // Relaxed threshold: Allow ~40% error rate to catch mispronunciations/ASR drift
    return dist <= Math.floor(len * 0.4); 
};

// Application Views
type AppView = 'home' | 'teleprompter' | 'analysis';
type AnalysisMode = 'sound_check' | 'coach';

const App: React.FC = () => {
  // Navigation State
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('sound_check');
  
  // App State (Teleprompter)
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  
  // Media State
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Script State
  const [scriptText, setScriptText] = useState<string>("");
  const [scriptWords, setScriptWords] = useState<ScriptWord[]>([]);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(0);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  
  // Recording State
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'paused'>('idle');
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  // AI Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<'idle' | 'transcribing' | 'analyzing'>('idle');
  const [performanceReport, setPerformanceReport] = useState<PerformanceReport | null>(null);
  const [transcriptionResult, setTranscriptionResult] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [showRewrite, setShowRewrite] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  
  // External Upload State
  const [uploadContext, setUploadContext] = useState("");
  const [manualTranscript, setManualTranscript] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedAudioBase64, setUploadedAudioBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // TTS State
  const [isPlayingTTS, setIsPlayingTTS] = useState(false);
  const [isGeneratingTTS, setIsGeneratingTTS] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Settings
  const [fontSize, setFontSize] = useState(40);
  const [opacity, setOpacity] = useState(0.4);
  const [showSettings, setShowSettings] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);

  // -- Initialization --

  const initCamera = useCallback(async () => {
    // Only initialize camera if we are in teleprompter mode
    if (currentView !== 'teleprompter') return;

    setPermissionError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" },
        audio: true,
      });
      
      streamRef.current = mediaStream;
      setStream(mediaStream);
    } catch (err: any) {
      console.error("Media access error:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
         setPermissionError("Camera/Microphone access was denied. Please allow permissions in your browser address bar.");
      } else if (err.name === 'NotFoundError') {
         setPermissionError("No camera or microphone found.");
      } else if (err.name === 'NotReadableError') {
         setPermissionError("Camera/Microphone is in use by another application.");
      } else {
         setPermissionError("Unable to access media devices: " + (err.message || "Unknown error"));
      }
    }
  }, [currentView]);

  useEffect(() => {
    initCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [initCamera]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [hasStarted, stream, videoRef.current, currentView]);

  // Cleanup when leaving view
  useEffect(() => {
      if (currentView !== 'teleprompter') {
           if (streamRef.current) {
               streamRef.current.getTracks().forEach(track => track.stop());
               setStream(null);
               streamRef.current = null;
           }
           setHasStarted(false);
      }
  }, [currentView]);

  // -- Navigation --

  const goHome = (force: boolean = false) => {
      // If we have report results, warn unless forced (e.g. clicking Done button)
      if (!force && (performanceReport || transcriptionResult)) {
          if (!confirm("Are you sure you want to go back? Current progress will be lost.")) {
              return;
          }
      }
      
      setCurrentView('home');
      // Reset states
      setPerformanceReport(null);
      setTranscriptionResult(null);
      setUploadedAudioBase64(null);
      setScriptText("");
      setScriptWords([]);
      setManualTranscript("");
      setSelectedFile(null);
      setUploadContext("");
      setShowRewrite(false);
      setIsAnalyzing(false);
      setAnalysisStep('idle');
      stopTTS();
  };

  const navigateToAnalysis = (mode: AnalysisMode) => {
      setAnalysisMode(mode);
      setCurrentView('analysis');
      // Reset view specific states
      setPerformanceReport(null);
      setTranscriptionResult(null);
      setUploadedAudioBase64(null);
      setManualTranscript("");
      setSelectedFile(null);
      setUploadContext("");
      setShowRewrite(false);
  };

  // -- Script Processing --

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
      stopTTS();
  }

  // -- ASR Matching Logic (Anchor Search) --

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
               
               while (
                   s + scriptOffset < searchEnd && 
                   i + inputOffset < incomingWords.length
               ) {
                   if (isMatch(currentWords[s + scriptOffset].cleanWord, incomingWords[i + inputOffset])) {
                       matchLen++;
                       scriptOffset++;
                       inputOffset++;
                   } else {
                       break;
                   }
               }

               const wordLen = currentWords[s].cleanWord.length;
               const isStrongMatch = (matchLen >= 2) || (matchLen === 1 && wordLen >= 5);
               
               if (isStrongMatch) {
                   const skippedCount = s - startIndex;
                   if (skippedCount === 0 || (skippedCount < 5 && matchLen >= 2) || (skippedCount < 2 && wordLen >= 5)) {
                        bestMatchIndex = s + matchLen;
                        i = incomingWords.length; 
                        s = searchEnd; 
                   }
               }
           }
        }
      }

      if (bestMatchIndex > startIndex) {
         return currentWords.map((w, i) => ({
           ...w,
           isSpoken: i < bestMatchIndex ? true : w.isSpoken
         }));
      }

      return currentWords;
    });
  }, []);

  useEffect(() => {
    const idx = scriptWords.findIndex(w => !w.isSpoken);
    if (idx !== -1) {
      setActiveWordIndex(idx);
    } else if (scriptWords.length > 0 && scriptWords.every(w => w.isSpoken)) {
        setActiveWordIndex(scriptWords.length);
    }
  }, [scriptWords]);

  // -- TTS --

  const stopTTS = () => {
    if (audioSourceRef.current) {
        try {
            audioSourceRef.current.stop();
        } catch(e) {}
        audioSourceRef.current = null;
    }
    setIsPlayingTTS(false);
  };

  const generateAndPlayTTS = async () => {
    if (isPlayingTTS) {
        stopTTS();
        return;
    }
    
    if (!scriptText.trim()) return;
    setIsGeneratingTTS(true);
    
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: { parts: [{ text: scriptText }] },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } }
                }
            }
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) throw new Error("No audio data returned");

        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }

        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        const audioBuffer = pcmToAudioBuffer(bytes, audioContextRef.current, 24000, 1);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        source.onended = () => { setIsPlayingTTS(false); audioSourceRef.current = null; };
        audioSourceRef.current = source;
        source.start();
        setIsPlayingTTS(true);

    } catch (error) {
        console.error("TTS Error:", error);
        alert("Failed to generate speech preview.");
    } finally {
        setIsGeneratingTTS(false);
    }
  };


  // -- Recording --

  const startRecording = async () => {
    if (!stream) {
        await initCamera();
        if (!streamRef.current) return;
    }
    stopTTS();
    setRecordedChunks([]);
    setRecordingDuration(0);
    setPerformanceReport(null);
    setShowReport(false);

    let options = { mimeType: 'video/mp4' };
    if (!MediaRecorder.isTypeSupported('video/mp4')) {
        options = { mimeType: 'video/webm;codecs=vp9' };
    }
    
    const recorder = new MediaRecorder(stream || streamRef.current!, options);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        setRecordedChunks(prev => [...prev, e.data]);
      }
    };
    recorder.start(1000);
    mediaRecorderRef.current = recorder;

    if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US'; 

        recognition.onresult = (event: any) => {
            const resultIndex = event.resultIndex;
            const transcript = event.results[resultIndex][0].transcript;
            handleTranscription(transcript);
        };

        try {
            recognition.start();
            recognitionRef.current = recognition;
        } catch (e) {
            console.error("Speech Recognition failed to start:", e);
        }
    } else {
        alert("Speech Recognition is not supported in this browser. Scrolling will not work.");
    }

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

    if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
    }

    setRecordingState('idle');
  };

  const analyzePerformance = async () => {
      if (recordedChunks.length === 0) return;
      setIsAnalyzing(true);
      setAnalysisStep('analyzing');
      try {
          const videoBlob = new Blob(recordedChunks, { type: recordedChunks[0].type });
          const base64Audio = await extractAudioFromVideo(videoBlob);
          
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: {
                  parts: [
                      { inlineData: { mimeType: 'audio/wav', data: base64Audio } },
                      { text: `You are an expert public speaking coach. Analyze this audio recording of a speech. I will provide the original script below. Compare the audio to the script. Check for mispronunciations or unclear words. 

Original Script:
"${scriptText}"

Provide a JSON report with: 
- rating (integer 0-100)
- summary
- suggestions (3 general tips)
- pronunciationFeedback (list of specific words that were mispronounced or unclear, compared to the script. If none, leave empty)` }
                  ]
              },
              config: {
                  responseMimeType: "application/json",
                  responseSchema: {
                      type: GeminiType.OBJECT,
                      properties: {
                          rating: { type: GeminiType.INTEGER },
                          summary: { type: GeminiType.STRING },
                          suggestions: { type: GeminiType.ARRAY, items: { type: GeminiType.STRING } },
                          pronunciationFeedback: { 
                              type: GeminiType.ARRAY, 
                              items: { 
                                  type: GeminiType.OBJECT,
                                  properties: {
                                      phrase: { type: GeminiType.STRING },
                                      issue: { type: GeminiType.STRING },
                                      practiceDrill: { type: GeminiType.STRING },
                                      reason: { type: GeminiType.STRING }
                                  },
                                  required: ["phrase", "issue", "practiceDrill", "reason"]
                              } 
                          }
                      },
                      required: ["rating", "summary", "suggestions", "pronunciationFeedback"]
                  }
              }
          });

          setPerformanceReport(JSON.parse(response.text));
          setShowReport(true);
      } catch (error) {
          console.error("Analysis failed:", error);
          alert("Analysis failed. Try again.");
      } finally {
          setIsAnalyzing(false);
          setAnalysisStep('idle');
      }
  };

  // -- External Audio Analysis --
  
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
          setSelectedFile(file);
      }
  };

  // Helper to get robust mime type
  const getAudioMimeType = (file: File): string => {
      // Priority 1: Check extension (safest for m4a)
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'm4a') return 'audio/mp4';
      
      // Priority 2: Use file type if available and not empty
      if (file.type) return file.type;
      
      // Priority 3: Fallbacks
      if (ext === 'mp3') return 'audio/mp3';
      if (ext === 'wav') return 'audio/wav';
      if (ext === 'aac') return 'audio/aac';
      
      return 'audio/mp3';
  };

  // Stage 1 Analysis (Sound Check)
  const startSoundCheckAnalysis = async () => {
      if (!selectedFile) return;

      // Check file size (20MB limit for inline base64)
      const MAX_SIZE = 20 * 1024 * 1024;
      if (selectedFile.size > MAX_SIZE) {
          alert("File is too large. Please upload an audio file smaller than 20MB.");
          return;
      }

      setIsAnalyzing(true);
      try {
          // Convert file to base64
          const base64Audio = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                  const result = reader.result as string;
                  resolve(result.split(',')[1]);
              };
              reader.onerror = reject;
              reader.readAsDataURL(selectedFile);
          });
          
          setUploadedAudioBase64(base64Audio);
          const mimeType = getAudioMimeType(selectedFile);
          await analyzeStage1_Transcribe(base64Audio, mimeType, uploadContext);
      } catch (error) {
          console.error("Upload analysis failed:", error);
          const msg = error instanceof Error ? error.message : JSON.stringify(error);
          alert(`Failed to analyze uploaded audio. Error: ${msg}`);
          setIsAnalyzing(false);
          setAnalysisStep('idle');
      }
  };

  // Stage 2 Start Trigger (Coach)
  const startCoachAnalysis = async () => {
      if (!selectedFile) return;

       // Check file size
       const MAX_SIZE = 20 * 1024 * 1024;
       if (selectedFile.size > MAX_SIZE) {
           alert("File is too large. Please upload an audio file smaller than 20MB.");
           return;
       }

      setIsAnalyzing(true);
      try {
          // Convert file to base64
          const base64Audio = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                  const result = reader.result as string;
                  resolve(result.split(',')[1]);
              };
              reader.onerror = reject;
              reader.readAsDataURL(selectedFile);
          });
          
          setUploadedAudioBase64(base64Audio);
          const mimeType = getAudioMimeType(selectedFile);

          if (manualTranscript.trim()) {
              // User provided transcript, skip stage 1
              await analyzeStage2_Coach(base64Audio, manualTranscript, mimeType);
          } else {
              // No transcript, run stage 1 internally then stage 2
              await analyzeStage1_Transcribe(base64Audio, mimeType, uploadContext, true);
          }

      } catch (error) {
          console.error("Coach analysis failed:", error);
          const msg = error instanceof Error ? error.message : JSON.stringify(error);
          alert(`Failed to analyze uploaded audio. Error: ${msg}`);
          setIsAnalyzing(false);
          setAnalysisStep('idle');
      }
  };


  const analyzeStage1_Transcribe = async (base64Audio: string, mimeType: string, context: string, autoChainToStage2: boolean = false) => {
      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          
          setAnalysisStep('transcribing');
          
          const transcriptResponse = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              config: {
                 systemInstruction: `You are a Professional Forensic Transcriber.
                 Objective: Convert interview audio into a verbatim transcript optimized for behavioral analysis.
                 Guidelines:
                 1. Verbatim Accuracy: Do not "clean up" grammar. Keep all "ums," "uhs," "likes," and repeated words. These are crucial for the coach to analyze later.
                 2. Speaker Identification: Label speakers clearly (e.g., [Candidate], [Recruiter]) based on context.
                 3. Timestamps: Insert a timestamp [00:00] every 30-60 seconds or at every speaker change.
                 4. Non-Verbal Cues: Transcribe significant sounds in brackets, e.g., [nervous laughter], [long pause], [sigh], [typing noise].
                 5. Output Format: Clean Markdown.
                 6. Start Logic: Ignore any initial background noise, rustling, static, or setup sounds (e.g. microphone adjustments) at the very beginning of the file. Start the transcription strictly at the first intelligible human speech.`
              },
              contents: {
                  parts: [
                      { inlineData: { mimeType: mimeType, data: base64Audio } },
                      { text: `Please transcribe the attached audio file following the forensic guidelines.
                      User Context to identify speakers: "${context}"` }
                  ]
              }
          });
          
          const transcript = transcriptResponse.text;
          setTranscriptionResult(transcript);

          if (autoChainToStage2) {
              await analyzeStage2_Coach(base64Audio, transcript, mimeType);
          }

      } catch (error) {
          console.error("Transcription stage failed:", error);
          throw error;
      } finally {
          if (!autoChainToStage2) {
            setIsAnalyzing(false);
            setAnalysisStep('idle');
          }
      }
  };

  const analyzeStage2_Coach = async (base64Audio: string, transcript: string, mimeType?: string) => {
      if (!base64Audio || !transcript) return;
      
      setIsAnalyzing(true);
      setAnalysisStep('analyzing');

      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          // Ensure we have a mime type, default to mp3 if not passed
          const audioMime = mimeType || 'audio/mp3';

          const response = await ai.models.generateContent({
              model: 'gemini-3-pro-preview', // Using Pro/3.0 for high-level reasoning
              config: {
                  systemInstruction: `Role: You are the "Stage 2: Coach" for the MicDrop interview preparation app. Your user is a Technical Team Lead / Engineering Manager candidate (balancing technical depth with vision/people management).

                  Goal: Analyze the user's interview transcript/audio input and provide "brutally honest" feedback to specific issues.
                  
                  KEY REQUIREMENT: HUMAN STORY REWRITING
                  For every issue identified in the "Areas for Improvement" section, you MUST provide a "Human Rewrite" instead of a generic strategy.
                  
                  The Rewrite Philosophy:
                  - The goal is NOT a polished press release. It is to sound like a colleague grabbing coffee.
                  - Use "Bridge Words": "To be honest...", "Here's the thing...", "I say this with love...".
                  - Use Vulnerability/Humor: Make it relatable.
                  - Use Check-ins: "Does that match what you're seeing?"

                  KEY REQUIREMENT: DELIVERY DYNAMICS (Pronunciation & Clarity)
                  You must identify 3 specific moments where the user sounded 'Machine Gun' (Rushed/Monotone) vs 'Maestro' (Varied Pace/Emphasis).
                  - Focus on Technical Terms: Candidates often rush "Convolutional Neural Networks". They should say "Con-vo-LU-tion-al... Neu-ral... NET-works".
                  - Focus on Tone: Detect robotic delivery.
                  - Create a "Drill": Use visual cues like UPPERCASE for stress and '...' for pauses.
                  
                  Output Format:
                  Provide feedback in this exact structure:
                  1.  **The Diagnosis:** A 1-2 sentence summary of the biggest red flag.
                  2.  **The Fix:** Tactical advice (Structure, Soft Skills).
                  3.  **The "Human" Rewrite (Global):** A rewrite of the most critical part of their answer to sound conversational and high-EQ.
                  4.  **Detailed Improvements:** For each specific issue found, provide:
                      - The Issue: What went wrong.
                      - Specific Instance: Quote the transcript.
                      - The Human Rewrite: Rewrite THAT SPECIFIC part to be better.
                      - Why This Works: Explain the EQ/Soft skills used (e.g. "bridge words signal authenticity").

                  Output Style:
                  - Rating: 0-100 integer scale.
                  - **Separation**: Split into 'detailedFeedback' (Improvements) and 'highlights' (Strengths).
                  - detailedFeedback: MUST use the 'rewrite' and 'explanation' fields instead of generic improvement strategies.
                  - highlights: Areas where the candidate excelled.
                  `,
                  responseMimeType: "application/json",
                  responseSchema: {
                      type: GeminiType.OBJECT,
                      properties: {
                          rating: { type: GeminiType.INTEGER },
                          summary: { type: GeminiType.STRING },
                          suggestions: { type: GeminiType.ARRAY, items: { type: GeminiType.STRING } },
                          coachingRewrite: {
                              type: GeminiType.OBJECT,
                              properties: {
                                  diagnosis: { type: GeminiType.STRING },
                                  fix: { type: GeminiType.STRING },
                                  rewrite: { type: GeminiType.STRING }
                              },
                              required: ["diagnosis", "fix", "rewrite"]
                          },
                          detailedFeedback: {
                              type: GeminiType.ARRAY,
                              description: "Areas for Improvement. For each issue, provide a Human Rewrite.",
                              items: {
                                  type: GeminiType.OBJECT,
                                  properties: {
                                      category: { type: GeminiType.STRING },
                                      issue: { type: GeminiType.STRING },
                                      instance: { type: GeminiType.STRING },
                                      rewrite: { type: GeminiType.STRING, description: "The revised, human-sounding version of the answer." },
                                      explanation: { type: GeminiType.STRING, description: "Why this rewrite works (soft skills analysis)." }
                                  },
                                  required: ["category", "issue", "instance", "rewrite", "explanation"]
                              }
                          },
                          highlights: {
                              type: GeminiType.ARRAY,
                              description: "Positive feedback / Key Strengths / Good Answers.",
                              items: {
                                  type: GeminiType.OBJECT,
                                  properties: {
                                      category: { type: GeminiType.STRING },
                                      strength: { type: GeminiType.STRING },
                                      quote: { type: GeminiType.STRING }
                                  },
                                  required: ["category", "strength", "quote"]
                              }
                          },
                          pronunciationFeedback: { 
                              type: GeminiType.ARRAY, 
                              description: "3 Specific drills to fix Monotone/Rushed delivery",
                              items: { 
                                  type: GeminiType.OBJECT,
                                  properties: {
                                      phrase: { type: GeminiType.STRING, description: "The original phrase spoken" },
                                      issue: { type: GeminiType.STRING, description: "e.g. 'Rushed technical term', 'Monotone'" },
                                      practiceDrill: { type: GeminiType.STRING, description: "Visual guide using CAPS and ... for rhythm" },
                                      reason: { type: GeminiType.STRING, description: "Why this emphasis matters" }
                                  },
                                  required: ["phrase", "issue", "practiceDrill", "reason"]
                              } 
                          }
                      },
                      required: ["rating", "summary", "suggestions", "detailedFeedback", "highlights", "coachingRewrite", "pronunciationFeedback"]
                  }
              },
              contents: {
                  parts: [
                      { inlineData: { mimeType: audioMime, data: base64Audio } },
                      { text: `Context: ${uploadContext}
                      
                      Input 1: Attached is the original Audio.
                      Input 2: Below is the Transcript generated from this call.

                      ${transcript}

                      Task:
                      Based on the Audio (for tone) and the Text (for content), analyze my performance as a Technical Team Lead.
                      1. Did I demonstrate technical depth AND leadership vision/empathy?
                      2. Was my communication clear and concise?
                      3. Identify any "anxiety" markers (rushing, fillers) and how to fix them.
                      
                      Note: Ignore the first few seconds of setup/silence in your audio evaluation.` }
                  ]
              }
          });

          const result = JSON.parse(response.text);
          setPerformanceReport(result);
          setShowReport(true);
      } catch (error) {
          console.error("Stage 2 Coach analysis failed:", error);
          throw error;
      } finally {
          setIsAnalyzing(false);
          setAnalysisStep('idle');
      }
  };

  const downloadTranscript = () => {
    if (!transcriptionResult) return;
    const blob = new Blob([transcriptionResult], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forensic-transcript-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  
  const proceedToCoaching = () => {
      if (uploadedAudioBase64 && transcriptionResult) {
          // Trigger loading state immediately
          setIsAnalyzing(true);
          setAnalysisStep('analyzing');
          
          // Use helper to get type from file if available, otherwise assume mp3
          const mimeType = selectedFile ? getAudioMimeType(selectedFile) : 'audio/mp3';
          
          // Small timeout to allow UI to update to loader before async work potentially blocks
          setTimeout(() => {
             analyzeStage2_Coach(uploadedAudioBase64, transcriptionResult, mimeType);
          }, 50);
      } else {
          alert("Missing audio or transcript data.");
      }
  };

  const downloadVideo = () => {
    if (recordedChunks.length === 0) return;
    const blob = new Blob(recordedChunks, { type: recordedChunks[0].type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    document.body.appendChild(a);
    a.style.display = 'none';
    a.href = url;
    a.download = `adaptive-recording-${new Date().toISOString()}.mp4`; 
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const downloadReportAsImage = async () => {
    if (!reportRef.current) return;
    try {
        const canvas = await html2canvas(reportRef.current, {
            scale: 2,
            backgroundColor: null,
            useCORS: true,
            windowWidth: 1920
        });
        const url = canvas.toDataURL("image/png");
        const a = document.createElement('a');
        a.href = url;
        a.download = `performance-report-${new Date().toISOString().split('T')[0]}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (error) {
        console.error("Snapshot failed:", error);
        alert("Could not save image.");
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // -- Render Components --

  const renderHome = () => (
      <div className="h-full bg-cream text-charcoal flex flex-col items-center md:justify-center p-6 relative overflow-y-auto font-sans">
          <div className="fixed top-0 left-0 w-full h-full opacity-40 pointer-events-none" 
               style={{ backgroundImage: 'radial-gradient(circle at 15% 15%, #F0EBE0 0%, transparent 20%), radial-gradient(circle at 85% 85%, #E8E0D0 0%, transparent 20%)' }}>
          </div>

          <div className="text-center mb-16 z-10 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700 shrink-0 mt-10 md:mt-0">
              <div className="mb-4 inline-block px-4 py-1.5 rounded-full border border-gold/40 text-gold text-[10px] font-bold tracking-[0.2em] uppercase bg-white/50 backdrop-blur-sm">
                  Executive Performance Suite
              </div>
              <h1 className="text-6xl md:text-8xl font-serif mb-6 tracking-tight text-charcoal">
                  MicDrop
              </h1>
              <p className="text-gray-500 text-xl font-serif italic max-w-lg mx-auto leading-relaxed">
                  Don't just answer. Perform.
              </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 z-10 w-full max-w-6xl px-4 pb-10 shrink-0">
              {/* Card 1: Sound Check */}
              <button onClick={() => navigateToAnalysis('sound_check')} className="group bg-white p-8 rounded-3xl shadow-xl hover:shadow-2xl transition-all border border-[#EBE8E0] hover:border-gold/30 text-left relative overflow-hidden flex flex-col h-full">
                   <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                       <AudioLines size={80} className="text-charcoal" />
                   </div>
                   <div className="w-14 h-14 rounded-2xl bg-charcoal text-white flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300 shrink-0">
                       <AudioLines size={24} />
                   </div>
                   <div className="flex-1">
                       <h3 className="text-xl font-serif font-bold text-charcoal mb-3">Sound Check</h3>
                       <p className="text-gray-500 text-sm leading-relaxed mb-6">Upload your raw audio. Get a forensic, timestamped transcript that captures every hesitation.</p>
                   </div>
                   <div className="flex items-center gap-2 text-gold font-bold text-xs tracking-widest uppercase mt-auto">
                       Analyze Audio <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                   </div>
              </button>

              {/* Card 2: Coach */}
              <button onClick={() => navigateToAnalysis('coach')} className="group bg-white p-8 rounded-3xl shadow-xl hover:shadow-2xl transition-all border border-[#EBE8E0] hover:border-gold/30 text-left relative overflow-hidden flex flex-col h-full">
                   <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                       <Flame size={80} className="text-gold" />
                   </div>
                   <div className="w-14 h-14 rounded-2xl bg-cream border border-gold/20 text-gold flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300 shrink-0">
                       <Flame size={24} />
                   </div>
                   <div className="flex-1">
                       <h3 className="text-xl font-serif font-bold text-charcoal mb-3">Coach</h3>
                       <p className="text-gray-500 text-sm leading-relaxed mb-6">Executive-level feedback on delivery, strategy, and leadership presence.</p>
                   </div>
                   <div className="flex items-center gap-2 text-gold font-bold text-xs tracking-widest uppercase mt-auto">
                       Get Coached <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                   </div>
              </button>

              {/* Card 3: Rehearsal */}
              <button onClick={() => { setCurrentView('teleprompter'); setHasStarted(false); }} className="group bg-white p-8 rounded-3xl shadow-xl hover:shadow-2xl transition-all border border-[#EBE8E0] hover:border-gold/30 text-left relative overflow-hidden flex flex-col h-full">
                   <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                       <ScrollText size={80} className="text-charcoal" />
                   </div>
                   <div className="w-14 h-14 rounded-2xl bg-charcoal text-white flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300 shrink-0">
                       <ScrollText size={24} />
                   </div>
                   <div className="flex-1">
                       <h3 className="text-xl font-serif font-bold text-charcoal mb-3">Rehearsal</h3>
                       <p className="text-gray-500 text-sm leading-relaxed mb-6">Practice your pitch with an adaptive teleprompter that listens to your pace in real-time.</p>
                   </div>
                   <div className="flex items-center gap-2 text-gold font-bold text-xs tracking-widest uppercase mt-auto">
                       Start Practice <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                   </div>
              </button>
          </div>
      </div>
  );

  const renderAnalysisView = () => (
      <div className="h-full bg-cream text-charcoal flex flex-col font-sans overflow-hidden">
           {/* Header */}
           <div className="h-20 bg-white border-b border-[#E6E6E6] flex items-center justify-between px-8 z-50 shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => goHome(false)} className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors">
                        <Home size={18} className="text-gray-500" />
                    </button>
                    <div>
                        <div className="text-[10px] font-bold text-gold uppercase tracking-widest">MicDrop</div>
                        <h2 className="text-xl font-serif font-bold text-charcoal">
                            {analysisMode === 'sound_check' ? 'Sound Check' : 'The Coach'}
                        </h2>
                    </div>
                </div>
           </div>

           {/* Main Content Area */}
           <div className="flex-1 overflow-y-auto p-8 relative min-h-0">
                {!transcriptionResult && !performanceReport ? (
                    // Upload State
                    <div className="max-w-2xl mx-auto mt-12 bg-white rounded-3xl shadow-xl border border-[#EBE8E0] p-10 animate-in fade-in slide-in-from-bottom-4">
                        <div className="mb-8">
                             <h3 className="text-3xl font-serif font-bold text-charcoal mb-2">Upload Interview</h3>
                             <p className="text-gray-500">Supported formats: MP3, WAV, M4A.</p>
                        </div>
                        
                        <div className="space-y-8">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Context & Roles</label>
                                <textarea 
                                    className="w-full h-32 bg-[#FAF9F6] border border-[#E6E6E6] rounded-xl p-4 text-sm text-charcoal outline-none focus:border-gold resize-none focus:ring-1 focus:ring-gold/50"
                                    placeholder="e.g., 'This is an interview between recruiter (Joe) and me (Lily).'"
                                    value={uploadContext}
                                    onChange={(e) => setUploadContext(e.target.value)}
                                />
                            </div>

                            {/* Manual Transcript Input for Coach Mode */}
                            {analysisMode === 'coach' && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Transcript (Optional)</label>
                                    <textarea 
                                        className="w-full h-32 bg-[#FAF9F6] border border-[#E6E6E6] rounded-xl p-4 text-sm text-charcoal outline-none focus:border-gold resize-none focus:ring-1 focus:ring-gold/50 placeholder:text-gray-300"
                                        placeholder="Paste existing transcript here to skip the transcription step..."
                                        value={manualTranscript}
                                        onChange={(e) => setManualTranscript(e.target.value)}
                                    />
                                </div>
                            )}

                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all ${selectedFile ? 'border-green-400 bg-green-50/50' : 'border-gray-200 hover:border-gold/50 hover:bg-gray-50'}`}
                            >
                                <input type="file" accept="audio/*" className="hidden" ref={fileInputRef} onChange={handleFileSelect} />
                                {selectedFile ? (
                                    <>
                                        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center text-green-600 shadow-sm">
                                            <Check size={28} />
                                        </div>
                                        <div className="text-center">
                                            <span className="block text-lg font-bold text-green-800 break-all">{selectedFile.name}</span>
                                            <span className="text-xs text-green-600 uppercase tracking-widest font-bold mt-1">Ready to Analyze</span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-14 h-14 rounded-full bg-cream flex items-center justify-center text-gold mb-2">
                                            <Upload size={24} />
                                        </div>
                                        <div className="text-center">
                                            <span className="block font-medium text-gray-600">Click to upload audio file</span>
                                            <span className="text-xs text-gray-400 mt-1">or drag and drop</span>
                                        </div>
                                    </>
                                )}
                            </div>

                            {selectedFile && !isAnalyzing && (
                                <button 
                                    onClick={analysisMode === 'sound_check' ? startSoundCheckAnalysis : startCoachAnalysis}
                                    className="w-full py-4 bg-charcoal text-white rounded-xl font-bold hover:bg-black transition-colors shadow-lg flex items-center justify-center gap-2"
                                >
                                    {analysisMode === 'sound_check' ? 'Start Transcription' : 'Start Coach Analysis'}
                                    <ArrowRight size={18} />
                                </button>
                            )}

                            {isAnalyzing && (
                                <div className="text-center py-8">
                                    <Loader2 className="animate-spin mx-auto text-gold mb-4" size={32} />
                                    <p className="text-charcoal font-medium animate-pulse">
                                        {analysisStep === 'transcribing' ? 'Phase 1: Forensic Transcription...' : 'Phase 2: Coach Analysis...'}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-2">This usually takes 15-30 seconds.</p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    // Results View
                    <div className="max-w-4xl mx-auto pb-20">
                         {isAnalyzing ? (
                             <div className="bg-white rounded-3xl shadow-xl border border-[#EBE8E0] p-12 text-center animate-in fade-in zoom-in-95 duration-300">
                                 <Loader2 className="animate-spin mx-auto text-gold mb-6" size={48} />
                                 <h3 className="text-2xl font-serif font-bold text-charcoal mb-2">
                                     {analysisStep === 'transcribing' ? 'Phase 1: Forensic Transcription...' : 'Phase 2: Coach Analysis...'}
                                 </h3>
                                 <p className="text-gray-500 animate-pulse">
                                     Gemini is reviewing your pacing, clarity, and delivery...
                                 </p>
                                 <p className="text-xs text-gray-400 mt-4">This usually takes 15-30 seconds.</p>
                             </div>
                         ) : (
                             <>
                                 {analysisMode === 'sound_check' && transcriptionResult && !performanceReport && (
                                     <div className="bg-white rounded-3xl shadow-xl border border-[#EBE8E0] overflow-hidden animate-in fade-in slide-in-from-bottom-8">
                                         <div className="p-8 border-b border-[#E6E6E6] flex justify-between items-center bg-cream/50">
                                             <div>
                                                 <h3 className="text-2xl font-serif font-bold text-charcoal">Forensic Transcript</h3>
                                                 <p className="text-sm text-gray-500">Stage 1 Analysis Complete</p>
                                             </div>
                                             <div className="flex gap-3">
                                                 <button onClick={downloadTranscript} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 text-charcoal">
                                                     <Download size={14} /> Download Text
                                                 </button>
                                                 <button onClick={proceedToCoaching} className="flex items-center gap-2 px-4 py-2 bg-charcoal text-white rounded-lg text-sm font-bold hover:bg-black shadow-lg">
                                                     Proceed to Coaching <ArrowRight size={14} />
                                                 </button>
                                             </div>
                                         </div>
                                         <div className="p-8 max-h-[60vh] overflow-y-auto font-mono text-sm leading-relaxed whitespace-pre-wrap text-gray-700 bg-[#FAF9F6]">
                                             {transcriptionResult}
                                         </div>
                                     </div>
                                 )}

                                 {(analysisMode === 'coach' || performanceReport) && performanceReport && (
                                     renderPerformanceReportContent()
                                 )}
                             </>
                         )}
                    </div>
                )}
           </div>
      </div>
  );

  const renderPerformanceReportContent = () => {
    if (!performanceReport) return null;
    const { rating, summary, suggestions, detailedFeedback, highlights, pronunciationFeedback, coachingRewrite } = performanceReport;

    return (
        <div ref={reportRef} className="bg-cream min-h-full">
            <div className="mb-8 flex items-center justify-between">
                <div>
                     <div className="flex items-center gap-2 text-gold text-xs font-bold tracking-widest uppercase mb-2">
                        <Award size={14} /> Stage 2: The Coach
                     </div>
                     <h2 className="text-4xl font-serif font-bold text-charcoal">Performance Report</h2>
                </div>
                <div className="flex gap-3">
                     <button onClick={downloadReportAsImage} className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-medium hover:bg-gray-50 text-charcoal flex items-center gap-2">
                        <Download size={14} /> Export Image
                     </button>
                     <button onClick={() => goHome(true)} className="px-6 py-2 bg-charcoal text-white rounded-full text-sm font-bold hover:bg-black">
                        Done
                     </button>
                </div>
            </div>

            {/* Executive Summary Card */}
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-[#EBE8E0] mb-8 flex flex-col md:flex-row gap-8 items-start">
                 <div className="shrink-0 relative w-32 h-32 flex items-center justify-center">
                      {/* Conic Gradient Ring */}
                      <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(#C7A965 ${rating}%, #F0EBE0 ${rating}% 100%)` }}></div>
                      <div className="absolute inset-2 bg-white rounded-full flex flex-col items-center justify-center z-10">
                          <span className="text-4xl font-serif font-bold text-charcoal">{rating}</span>
                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">/ 100</span>
                      </div>
                 </div>
                 <div className="flex-1">
                      <h3 className="text-xl font-serif font-bold text-charcoal mb-3">Executive Summary</h3>
                      <p className="text-gray-600 leading-relaxed">{summary}</p>
                      
                      {/* Global Rewrite Toggle */}
                      {coachingRewrite && (
                        <div className="mt-6">
                            <button 
                                onClick={() => setShowRewrite(!showRewrite)}
                                className="text-sm font-bold text-gold hover:text-charcoal transition-colors flex items-center gap-2"
                            >
                                <PenTool size={14} /> {showRewrite ? 'Hide Story Rewrite' : 'View Story Rewrite'}
                            </button>

                            {showRewrite && (
                                <div className="mt-4 bg-[#FAF9F6] border-l-4 border-gold p-6 rounded-r-xl animate-in slide-in-from-top-2">
                                    <div className="flex items-start gap-4 mb-4">
                                        <div className="w-8 h-8 rounded-full bg-gold/10 flex items-center justify-center text-gold shrink-0">
                                            <Quote size={14} />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-charcoal uppercase tracking-widest mb-1">The Diagnosis</h4>
                                            <p className="text-gray-600 italic text-sm">{coachingRewrite.diagnosis}</p>
                                        </div>
                                    </div>
                                    <div className="mb-4">
                                         <h4 className="text-sm font-bold text-charcoal uppercase tracking-widest mb-2">The Fix</h4>
                                         <p className="text-gray-700 text-sm">{coachingRewrite.fix}</p>
                                    </div>
                                    <div>
                                         <h4 className="text-sm font-bold text-charcoal uppercase tracking-widest mb-2">The Human Rewrite</h4>
                                         <div className="text-charcoal font-serif text-lg leading-relaxed pl-4 border-l-2 border-gray-200">
                                            "{coachingRewrite.rewrite}"
                                         </div>
                                    </div>
                                </div>
                            )}
                        </div>
                      )}
                 </div>
            </div>

            {/* Areas for Improvement (Constructive) */}
            <div className="mb-4 flex items-center gap-2 text-charcoal text-xs font-bold tracking-widest uppercase mt-12">
                <Lightbulb size={14} /> Areas for Improvement
            </div>
            
            <div className="space-y-6">
                {detailedFeedback?.map((item, i) => (
                    <div key={i} className="bg-white rounded-2xl p-8 shadow-sm border border-[#EBE8E0]">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-2 h-2 rounded-full bg-red-400"></div>
                            <span className="text-[10px] font-bold text-gold uppercase tracking-widest">{item.category}</span>
                        </div>
                        
                        <h4 className="text-lg font-bold text-charcoal mb-2">The Issue</h4>
                        <p className="text-gray-600 mb-6">{item.issue}</p>

                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="bg-[#FAF9F6] p-6 rounded-xl border-l-4 border-gray-200">
                                <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Specific Instance</h5>
                                <p className="text-charcoal font-serif text-lg leading-relaxed">"{item.instance}"</p>
                            </div>
                            <div className="bg-green-50/50 p-6 rounded-xl border-l-4 border-green-400">
                                <h5 className="text-[10px] font-bold text-green-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                                   <PenTool size={12}/> The Human Rewrite
                                </h5>
                                <div className="text-charcoal font-serif text-lg leading-relaxed mb-4">
                                   "{item.rewrite}"
                                </div>
                                <div className="pt-4 border-t border-green-200/50">
                                    <h6 className="text-[10px] font-bold text-green-600 uppercase tracking-widest mb-1">Why this works</h6>
                                    <p className="text-sm text-green-800 italic">{item.explanation}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Highlights (Positive) */}
            {highlights && highlights.length > 0 && (
                <>
                    <div className="mb-4 flex items-center gap-2 text-charcoal text-xs font-bold tracking-widest uppercase mt-12">
                        <ThumbsUp size={14} /> Key Strengths & Highlights
                    </div>
                    <div className="grid md:grid-cols-2 gap-6">
                        {highlights.map((item, i) => (
                            <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-[#EBE8E0] relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-5">
                                    <Star size={80} />
                                </div>
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-6 h-6 rounded-full bg-gold/10 flex items-center justify-center text-gold">
                                        <Star size={12} fill="#C7A965" />
                                    </div>
                                    <span className="text-[10px] font-bold text-gold uppercase tracking-widest">{item.category}</span>
                                </div>
                                <h4 className="text-md font-bold text-charcoal mb-2">{item.strength}</h4>
                                <div className="bg-[#FAF9F6] p-4 rounded-xl mt-4">
                                    <p className="text-charcoal italic font-serif text-sm">"{item.quote}"</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Pronunciation & Pacing (New Rich Design) */}
            {pronunciationFeedback && pronunciationFeedback.length > 0 && (
                <div className="mt-12">
                     <div className="mb-4 flex items-center gap-2 text-charcoal text-xs font-bold tracking-widest uppercase">
                        <Ear size={14} /> Pronunciation, Pace & Presence
                     </div>
                     <div className="bg-white rounded-3xl p-8 border border-[#EBE8E0] shadow-sm">
                         <p className="text-gray-600 mb-6">Targeted drills to shift from "Machine Gun" delivery to "Executive Presence".</p>
                         <div className="grid gap-6">
                             {pronunciationFeedback.map((drill, i) => (
                                 <div key={i} className="flex flex-col md:flex-row gap-6 p-6 rounded-2xl border border-gray-100 bg-[#FAF9F6]">
                                     {/* The Issue */}
                                     <div className="md:w-1/3">
                                        <div className="flex items-center gap-2 mb-2 text-red-500">
                                            <AlertCircle size={14} />
                                            <span className="text-[10px] font-bold uppercase tracking-widest">The Trap</span>
                                        </div>
                                        <h5 className="font-bold text-charcoal mb-1">{drill.issue}</h5>
                                        <p className="text-sm text-gray-500 italic mb-2">"{drill.phrase}"</p>
                                     </div>

                                     {/* The Fix */}
                                     <div className="flex-1 bg-white p-6 rounded-xl border border-gold/20 shadow-sm">
                                         <div className="flex items-center gap-2 mb-3 text-gold">
                                            <Mic2 size={14} />
                                            <span className="text-[10px] font-bold uppercase tracking-widest">The Drill</span>
                                        </div>
                                        <div className="font-serif text-xl text-charcoal tracking-wide mb-3 leading-relaxed">
                                            {drill.practiceDrill}
                                        </div>
                                        <p className="text-xs text-gray-500 border-t border-gray-100 pt-3">
                                            <span className="font-bold">Why:</span> {drill.reason}
                                        </p>
                                     </div>
                                 </div>
                             ))}
                         </div>
                     </div>
                </div>
            )}
        </div>
    );
  };

  const renderTeleprompterView = () => (
      <div className="relative h-full bg-black">
          {/* Video Layer */}
          <video 
            ref={videoRef} 
            autoPlay 
            muted 
            playsInline
            className="absolute inset-0 w-full h-full object-cover z-0 opacity-80" 
          />
          
          {/* Teleprompter Overlay */}
          <Teleprompter 
            words={scriptWords} 
            activeWordIndex={activeWordIndex}
            fontSize={fontSize}
            opacity={opacity}
          />
          
          {/* Top Control Bar */}
          <div className="absolute top-0 left-0 right-0 p-6 z-30 flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent">
               <div>
                  <div className="text-[10px] font-bold text-white/60 uppercase tracking-widest mb-1">MicDrop</div>
                  <h2 className="text-xl font-serif font-bold text-white tracking-wide">The Rehearsal</h2>
               </div>
               
               <div className="flex gap-4">
                   <button 
                     onClick={() => setIsEditMode(true)}
                     disabled={recordingState === 'recording'}
                     className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-full text-white text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                   >
                     <FileText size={14} /> Script
                   </button>
                   <button 
                     onClick={() => setShowSettings(!showSettings)}
                     className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 rounded-full text-white text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2"
                   >
                     <Settings size={14} /> Settings
                   </button>
                   <button onClick={() => goHome(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20">
                       <X size={16} />
                   </button>
               </div>
          </div>
          
          {/* Settings Panel */}
          {showSettings && (
             <div className="absolute top-20 right-6 w-64 bg-charcoal/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 z-40 text-white animate-in slide-in-from-top-4">
                 <h3 className="text-xs font-bold uppercase tracking-widest mb-6 text-gold">Display Settings</h3>
                 
                 <div className="mb-6">
                     <div className="flex justify-between mb-2">
                         <span className="text-xs font-medium">Font Size</span>
                         <span className="text-xs text-gray-400">{fontSize}px</span>
                     </div>
                     <input 
                       type="range" min="20" max="80" value={fontSize} 
                       onChange={(e) => setFontSize(Number(e.target.value))}
                       className="w-full accent-gold h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                     />
                 </div>

                 <div>
                     <div className="flex justify-between mb-2">
                         <span className="text-xs font-medium">Opacity</span>
                         <span className="text-xs text-gray-400">{Math.round(opacity * 100)}%</span>
                     </div>
                     <input 
                       type="range" min="0" max="1" step="0.1" value={opacity} 
                       onChange={(e) => setOpacity(Number(e.target.value))}
                       className="w-full accent-gold h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                     />
                 </div>
             </div>
          )}

          {/* Bottom Control Bar */}
          <div className="absolute bottom-10 left-0 right-0 z-30 flex justify-center items-center gap-8">
               {recordingState === 'idle' ? (
                   <button 
                     onClick={startRecording}
                     className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 border-4 border-white/20 shadow-2xl flex items-center justify-center transition-all hover:scale-105 group"
                   >
                     <div className="w-8 h-8 rounded bg-white group-hover:rounded-sm transition-all" />
                   </button>
               ) : (
                   <div className="flex items-center gap-6">
                       <div className="px-6 py-3 bg-black/60 backdrop-blur-md rounded-full border border-white/10 text-white font-mono text-xl tabular-nums">
                           {formatTime(recordingDuration)}
                       </div>
                       <button 
                         onClick={stopRecording}
                         className="w-20 h-20 rounded-full bg-white hover:bg-gray-200 border-4 border-white/20 shadow-2xl flex items-center justify-center transition-all hover:scale-105"
                       >
                         <div className="w-8 h-8 bg-red-500 rounded-sm" />
                       </button>
                   </div>
               )}
          </div>
          
          {/* Permission Error Overlay */}
          {permissionError && (
              <div className="absolute inset-0 bg-black/90 z-50 flex items-center justify-center p-8 text-center">
                  <div className="max-w-md">
                      <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
                      <h3 className="text-xl font-bold text-white mb-2">Camera Access Required</h3>
                      <p className="text-gray-400 mb-6">{permissionError}</p>
                      <button onClick={initCamera} className="px-6 py-3 bg-white text-black rounded-full font-bold hover:bg-gray-200">
                          Try Again
                      </button>
                  </div>
              </div>
          )}

          {/* Script Editor Modal */}
          {isEditMode && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-charcoal w-full max-w-2xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                      <div className="p-6 border-b border-white/10 flex justify-between items-center">
                          <h3 className="text-white font-serif font-bold text-xl">Script Editor</h3>
                          <div className="flex gap-2">
                             <button onClick={generateAndPlayTTS} className="text-xs font-bold text-gold uppercase tracking-widest px-3 py-1.5 border border-gold/30 rounded-full hover:bg-gold/10 flex items-center gap-2">
                                 {isPlayingTTS ? <StopCircle size={14} /> : <Volume2 size={14} />}
                                 {isGeneratingTTS ? 'Generating...' : (isPlayingTTS ? 'Stop AI' : 'Listen to AI')}
                             </button>
                             <button onClick={handleClearScript} className="text-xs font-bold text-red-400 uppercase tracking-widest px-3 py-1.5 hover:text-red-300">Clear</button>
                          </div>
                      </div>
                      <textarea
                        value={scriptText}
                        onChange={handleScriptChange}
                        placeholder="Paste your script here... (e.g. 'Hi, I'm Lily...')"
                        className="flex-1 bg-black/20 text-white p-6 resize-none outline-none focus:bg-black/40 transition-colors text-lg leading-relaxed font-serif placeholder:text-white/20"
                      />
                      <div className="p-6 border-t border-white/10 flex justify-between items-center bg-black/20">
                          <span className="text-xs text-gray-500 font-medium">
                              {scriptWords.length} words • ~{Math.ceil(scriptWords.length / 150)} min
                          </span>
                          <button 
                            onClick={() => setIsEditMode(false)}
                            className="px-8 py-3 bg-gold text-charcoal rounded-xl font-bold hover:bg-yellow-500 transition-colors"
                          >
                            Save & Close
                          </button>
                      </div>
                  </div>
              </div>
          )}
          
          {/* Post-Recording Modal (Analysis Trigger) */}
          {recordedChunks.length > 0 && recordingState === 'idle' && !isAnalyzing && !showReport && (
               <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-6">
                    <div className="bg-white max-w-md w-full rounded-3xl p-8 text-center animate-in scale-in-95 duration-200">
                        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Check size={32} />
                        </div>
                        <h3 className="text-2xl font-serif font-bold text-charcoal mb-2">Recording Complete</h3>
                        <p className="text-gray-500 mb-8">Your rehearsal is ready for AI analysis.</p>
                        
                        <div className="space-y-3">
                            <button onClick={analyzePerformance} className="w-full py-4 bg-charcoal text-white rounded-xl font-bold hover:bg-black flex items-center justify-center gap-2 shadow-lg">
                                <Sparkles size={18} /> Analyze Performance
                            </button>
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={downloadVideo} className="py-3 bg-gray-100 text-charcoal rounded-xl font-bold hover:bg-gray-200 text-sm">
                                    Download Video
                                </button>
                                <button onClick={() => setRecordedChunks([])} className="py-3 border border-gray-200 text-gray-500 rounded-xl font-bold hover:bg-gray-50 text-sm">
                                    Discard
                                </button>
                            </div>
                        </div>
                    </div>
               </div>
          )}
          
          {/* Analysis Loading State */}
          {isAnalyzing && (
               <div className="absolute inset-0 bg-cream/90 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 text-center">
                    <Loader2 size={48} className="text-gold animate-spin mb-6" />
                    <h3 className="text-2xl font-serif font-bold text-charcoal mb-2">Analyzing Performance</h3>
                    <p className="text-gray-500 max-w-xs mx-auto animate-pulse">
                        Gemini is reviewing your pacing, clarity, and delivery...
                    </p>
               </div>
          )}
          
          {/* Performance Report Modal (Full Screen Overlay) */}
          {showReport && performanceReport && (
              <div className="absolute inset-0 bg-cream z-50 overflow-y-auto animate-in slide-in-from-bottom-10">
                   <div className="max-w-4xl mx-auto p-8 pt-12 pb-24">
                       {renderPerformanceReportContent()}
                   </div>
              </div>
          )}
      </div>
  );

  return (
    <div className="h-full w-full">
        {currentView === 'home' && renderHome()}
        {currentView === 'analysis' && renderAnalysisView()}
        {currentView === 'teleprompter' && renderTeleprompterView()}
    </div>
  );
};

export default App;
