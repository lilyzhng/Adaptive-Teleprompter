
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Settings, Download, Type, MonitorPlay, Sparkles, ArrowRight, X, Loader2, Award, Lightbulb, Volume2, StopCircle, Mic, Ear, Upload, MessageSquare, AlertCircle, Check, ChevronLeft, FileText, ArrowRightCircle, Video, FileAudio, Home } from 'lucide-react';
import { GoogleGenAI, Type as GeminiType, Modality } from '@google/genai';
import { ScriptWord, PerformanceReport, DetailedFeedback } from './types';
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

const App: React.FC = () => {
  // Navigation State
  const [currentView, setCurrentView] = useState<AppView>('home');
  
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
  const reportRef = useRef<HTMLDivElement>(null);
  
  // External Upload State
  const [uploadContext, setUploadContext] = useState("");
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

  const goHome = () => {
      if (confirm("Are you sure you want to go back? Current progress will be lost.")) {
          setCurrentView('home');
          // Reset states
          setPerformanceReport(null);
          setTranscriptionResult(null);
          setUploadedAudioBase64(null);
          setScriptText("");
          setScriptWords([]);
          stopTTS();
      }
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
                      { text: `You are an expert public speaking coach. Analyze this audio recording of a speech. I will provide the original script below. Compare the audio to the script. Check for mispronunciations or unclear words (e.g. if the user says 'motor' instead of 'model'). 

Original Script:
"${scriptText}"

Provide a JSON report with: 
- rating (0-100)
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
                          pronunciationFeedback: { type: GeminiType.ARRAY, items: { type: GeminiType.STRING } }
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

  const startExternalAnalysis = async () => {
      if (!selectedFile) return;

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
          await analyzeStage1_Transcribe(base64Audio, selectedFile.type, uploadContext);
      } catch (error) {
          console.error("Upload analysis failed:", error);
          alert("Failed to analyze uploaded audio. Please try a valid audio file (mp3, wav, m4a).");
          setIsAnalyzing(false);
          setAnalysisStep('idle');
      }
  };

  const analyzeStage1_Transcribe = async (base64Audio: string, mimeType: string, context: string) => {
      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const audioMime = mimeType.includes('m4a') ? 'audio/mp4' : mimeType;

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
                 5. Output Format: Clean Markdown.`
              },
              contents: {
                  parts: [
                      { inlineData: { mimeType: audioMime, data: base64Audio } },
                      { text: `Please transcribe the attached audio file following the forensic guidelines.
                      User Context to identify speakers: "${context}"` }
                  ]
              }
          });
          
          const transcript = transcriptResponse.text;
          setTranscriptionResult(transcript);
      } catch (error) {
          console.error("Transcription stage failed:", error);
          throw error;
      } finally {
          setIsAnalyzing(false);
          setAnalysisStep('idle');
      }
  };

  const analyzeStage2_Coach = async (base64Audio: string, transcript: string) => {
      if (!base64Audio || !transcript) return;
      
      setIsAnalyzing(true);
      setAnalysisStep('analyzing');

      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const audioMime = selectedFile?.type.includes('m4a') ? 'audio/mp4' : (selectedFile?.type || 'audio/mp3');

          const response = await ai.models.generateContent({
              model: 'gemini-3-pro-preview', // Using Pro/3.0 for high-level reasoning
              config: {
                  systemInstruction: `Role: You are an Elite Executive Communication Coach and Technical Recruiter.
                  Objective: Provide "brutally honest" constructive feedback to the Candidate based on their Audio (tone/delivery) and Transcript (content/strategy).

                  Analysis Framework:
                  1. Delivery (Audio Focus):
                     - The "Nervous Spike": Correlate Audio to Transcript. Point out where pitch rises or pace rushes.
                     - Silence & Pauses: Did the candidate pause before answering?
                     - Tone Mapping: Does tone match content? (e.g. apologetic when discussing achievements).
                  2. Strategy (Text Focus):
                     - The "Punchline" Rule: Did answer start with result/impact?
                     - Relevance: Did they answer the specific question?
                     - Leadership Signals: "I led" vs "We did".

                  Output Style:
                  - Diagnosis: Identify top issues.
                  - Evidence: Quote transcript AND describe audio (e.g. "At 02:14 you said 'I think so...' but voice trailed off").
                  - Drill: One specific exercise to fix it.`,
                  responseMimeType: "application/json",
                  responseSchema: {
                      type: GeminiType.OBJECT,
                      properties: {
                          rating: { type: GeminiType.INTEGER },
                          summary: { type: GeminiType.STRING },
                          suggestions: { type: GeminiType.ARRAY, items: { type: GeminiType.STRING } },
                          detailedFeedback: {
                              type: GeminiType.ARRAY,
                              items: {
                                  type: GeminiType.OBJECT,
                                  properties: {
                                      category: { type: GeminiType.STRING },
                                      issue: { type: GeminiType.STRING },
                                      instance: { type: GeminiType.STRING },
                                      improvement: { type: GeminiType.STRING }
                                  },
                                  required: ["category", "issue", "instance", "improvement"]
                              }
                          },
                          pronunciationFeedback: { type: GeminiType.ARRAY, items: { type: GeminiType.STRING } }
                      },
                      required: ["rating", "summary", "suggestions", "detailedFeedback"]
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
                      Based on the Audio (for tone) and the Text (for content), analyze my performance.
                      1. Did I sound like a Leader or a Contributor?
                      2. Critique my "Check-in" questions—were they effective?
                      3. Find the exact moment my "English anxiety" kicked in (rushing/monotone) and tell me how to fix it.` }
                  ]
              }
          });

          const result = JSON.parse(response.text);
          setPerformanceReport(result);
          setShowReport(true);
      } catch (error) {
          console.error("Stage 2 Coach analysis failed:", error);
          alert("Coach analysis failed. Please try again.");
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
          analyzeStage2_Coach(uploadedAudioBase64, transcriptionResult);
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
      <div className="min-h-screen bg-cream text-charcoal flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
          <div className="absolute top-0 left-0 w-full h-full opacity-40 pointer-events-none" 
               style={{ backgroundImage: 'radial-gradient(circle at 15% 15%, #F0EBE0 0%, transparent 20%), radial-gradient(circle at 85% 85%, #E8E0D0 0%, transparent 20%)' }}>
          </div>

          <div className="text-center mb-16 z-10 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700">
              <div className="mb-4 inline-block px-4 py-1.5 rounded-full border border-gold/40 text-gold text-[10px] font-bold tracking-[0.2em] uppercase bg-white/50 backdrop-blur-sm">
                  AI-Powered Communications
              </div>
              <h1 className="text-6xl md:text-8xl font-serif mb-6 tracking-tight text-charcoal">
                  Interview Coach
              </h1>
              <p className="text-gray-500 text-xl font-serif italic max-w-lg mx-auto leading-relaxed">
                  Master your delivery with adaptive teleprompting and multi-modal behavioral analysis.
              </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 z-10 w-full max-w-4xl">
              <button onClick={() => { setCurrentView('teleprompter'); setHasStarted(false); }} className="group bg-white p-10 rounded-3xl shadow-xl hover:shadow-2xl transition-all border border-[#EBE8E0] hover:border-gold/30 text-left relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                       <Video size={100} className="text-charcoal" />
                   </div>
                   <div className="w-16 h-16 rounded-2xl bg-charcoal text-white flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300">
                       <Video size={32} />
                   </div>
                   <h3 className="text-2xl font-serif font-bold text-charcoal mb-2">Teleprompter Practice</h3>
                   <p className="text-gray-500 leading-relaxed mb-6">Record yourself with a smart, listening script. Get real-time scrolling and instant feedback.</p>
                   <div className="flex items-center gap-2 text-gold font-bold text-sm tracking-widest uppercase">
                       Start Session <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                   </div>
              </button>

              <button onClick={() => { setCurrentView('analysis'); }} className="group bg-white p-10 rounded-3xl shadow-xl hover:shadow-2xl transition-all border border-[#EBE8E0] hover:border-gold/30 text-left relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                       <FileAudio size={100} className="text-gold" />
                   </div>
                   <div className="w-16 h-16 rounded-2xl bg-cream border border-gold/20 text-gold flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300">
                       <Upload size={32} />
                   </div>
                   <h3 className="text-2xl font-serif font-bold text-charcoal mb-2">Forensic Analysis</h3>
                   <p className="text-gray-500 leading-relaxed mb-6">Upload an existing interview recording. Get a forensic transcript and executive coaching critique.</p>
                   <div className="flex items-center gap-2 text-gold font-bold text-sm tracking-widest uppercase">
                       Upload Audio <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                   </div>
              </button>
          </div>
      </div>
  );

  const renderAnalysisView = () => (
      <div className="min-h-screen bg-cream text-charcoal flex flex-col font-sans overflow-hidden">
           {/* Header */}
           <div className="h-20 bg-white border-b border-[#E6E6E6] flex items-center justify-between px-8 z-50 shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={goHome} className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors">
                        <Home size={18} className="text-gray-500" />
                    </button>
                    <div>
                        <div className="text-[10px] font-bold text-gold uppercase tracking-widest">Interview Coach</div>
                        <h2 className="text-xl font-serif font-bold text-charcoal">Forensic Analysis</h2>
                    </div>
                </div>
           </div>

           {/* Main Content Area */}
           <div className="flex-1 overflow-y-auto p-8 relative">
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
                                    placeholder="e.g., 'This is an interview between recruiter (Joe) and me (Lily). Ignore Joe's speech and focus on my answers.'"
                                    value={uploadContext}
                                    onChange={(e) => setUploadContext(e.target.value)}
                                />
                            </div>

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
                                        <div className="w-14 h-14 rounded-full bg-[#FAF9F6] border border-[#E6E6E6] flex items-center justify-center text-gray-400 mb-1">
                                            <Upload size={24} />
                                        </div>
                                        <div className="text-center">
                                            <span className="block text-lg font-medium text-charcoal">Click to browse</span>
                                            <span className="text-sm text-gray-400">or drag and drop audio file here</span>
                                        </div>
                                    </>
                                )}
                            </div>

                            <button 
                                onClick={startExternalAnalysis}
                                disabled={!selectedFile || isAnalyzing}
                                className={`w-full py-5 rounded-xl font-bold flex items-center justify-center gap-3 transition-all text-lg shadow-lg ${!selectedFile || isAnalyzing ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-charcoal text-white hover:bg-black hover:shadow-xl hover:-translate-y-0.5'}`}
                            >
                                {isAnalyzing ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
                                <span>{isAnalyzing ? 'Analyzing Audio...' : 'Start Forensic Transcription'}</span>
                            </button>
                        </div>
                    </div>
                ) : transcriptionResult && !performanceReport ? (
                    // Transcription View (Stage 1)
                     <div className="max-w-4xl mx-auto h-full flex flex-col">
                        <div className="bg-white rounded-t-3xl border border-[#EBE8E0] border-b-0 p-8 flex justify-between items-center shadow-sm z-10">
                             <div>
                                 <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Stage 1: The Scribe</div>
                                 <h2 className="text-2xl font-serif font-bold text-charcoal">Forensic Transcript</h2>
                             </div>
                             <div className="flex gap-3">
                                <button onClick={downloadTranscript} className="px-5 py-2 bg-white border border-gray-200 rounded-full text-xs font-bold hover:bg-gray-50 transition-colors flex items-center gap-2">
                                    <Download size={14} /> Download
                                </button>
                                <button onClick={proceedToCoaching} className="px-6 py-2 bg-charcoal text-white rounded-full text-xs font-bold hover:bg-black transition-colors flex items-center gap-2 shadow-lg hover:shadow-xl">
                                    {isAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightCircle size={14} />}
                                    Proceed to Stage 2: Coach
                                </button>
                             </div>
                        </div>
                        <div className="flex-1 bg-white border-x border-[#EBE8E0] p-10 overflow-y-auto">
                            <div className="prose prose-lg max-w-none font-serif text-charcoal leading-relaxed whitespace-pre-wrap">
                                {transcriptionResult}
                            </div>
                        </div>
                        <div className="h-8 bg-white border border-t-0 border-[#EBE8E0] rounded-b-3xl mb-8"></div>
                     </div>
                ) : (
                    // Performance Report (Stage 2)
                    <div ref={reportRef} className="max-w-5xl mx-auto bg-white rounded-3xl shadow-xl border border-[#EBE8E0] overflow-hidden">
                         {/* This re-uses the full report UI structure but inline */}
                         {renderPerformanceReportContent()}
                    </div>
                )}
           </div>
      </div>
  );

  const renderPerformanceReportContent = () => (
     <div className="flex flex-col h-full">
         <div className="p-10 border-b border-[#F0F0F0] flex justify-between items-start bg-gradient-to-br from-white to-[#FAF9F6]">
             <div>
                 <div className="flex items-center gap-2 mb-2">
                     <Award size={18} className="text-gold" />
                     <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Stage 2: The Coach</span>
                 </div>
                 <h2 className="text-4xl font-serif font-bold text-charcoal">Performance Report</h2>
             </div>
             <div className="flex gap-3" data-html2canvas-ignore>
                 <button onClick={downloadReportAsImage} className="px-5 py-2.5 bg-white border border-gray-200 rounded-full text-xs font-bold hover:bg-gray-50 transition-colors flex items-center gap-2">
                    <Download size={14} /> Export Image
                 </button>
                 <button onClick={goHome} className="px-5 py-2.5 bg-charcoal text-white rounded-full text-xs font-bold hover:bg-black transition-colors">Done</button>
             </div>
         </div>
         
         <div className="p-10 space-y-10">
             <div className="flex flex-col md:flex-row gap-10 items-center md:items-start">
                 <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
                     <div className="absolute inset-0 rounded-full border-8 border-[#F5F5F0]"></div>
                     <div 
                         className="absolute inset-0 rounded-full border-8 border-gold border-t-transparent transform -rotate-45" 
                         style={{ 
                             clipPath: `polygon(0 0, 100% 0, 100% ${performanceReport!.rating}%, 0 ${performanceReport!.rating}%)`
                         }}
                     ></div>
                     <div className="text-center">
                         <span className="block text-4xl font-serif font-bold text-charcoal">{performanceReport!.rating}</span>
                         <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1 block">Score</span>
                     </div>
                 </div>
                 <div className="flex-1 space-y-3 text-center md:text-left">
                     <h3 className="text-2xl font-serif font-bold text-charcoal">Executive Summary</h3>
                     <div className="text-gray-600 leading-relaxed whitespace-pre-wrap">{performanceReport!.summary}</div>
                 </div>
             </div>

             {performanceReport!.detailedFeedback ? (
                 <div className="space-y-6">
                     <h3 className="flex items-center gap-3 text-sm font-bold text-charcoal uppercase tracking-widest border-b border-gray-100 pb-2">
                         <Lightbulb size={18} className="text-gold" />
                         Detailed Analysis
                     </h3>
                     <div className="grid grid-cols-1 gap-6">
                         {performanceReport!.detailedFeedback.map((item, i) => (
                             <div key={i} className="bg-white rounded-2xl p-8 border border-[#EBE8E0] shadow-sm">
                                 <div className="flex items-center gap-3 mb-4">
                                     <span className="w-1.5 h-1.5 rounded-full bg-gold"></span>
                                     <div className="text-gold text-xs font-bold uppercase tracking-widest font-serif">{item.category}</div>
                                 </div>
                                 
                                 <div className="mb-6">
                                     <span className="font-bold text-charcoal text-base block mb-2">The Issue</span>
                                     <div className="text-gray-600 leading-relaxed whitespace-pre-wrap">{item.issue}</div>
                                 </div>

                                 <div className="grid md:grid-cols-2 gap-6">
                                     <div className="bg-[#FAF9F6] p-5 rounded-xl border-l-4 border-gray-300">
                                         <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Specific Instance</span>
                                         <div className="text-sm text-gray-600 italic leading-relaxed whitespace-pre-wrap">"{item.instance}"</div>
                                     </div>

                                     <div className="bg-[#F0FDF4] p-5 rounded-xl border-l-4 border-green-400">
                                         <span className="text-xs font-bold text-green-700 uppercase tracking-wider block mb-2">Improvement Strategy</span>
                                         <div className="text-sm text-green-800 font-medium leading-relaxed whitespace-pre-wrap">{item.improvement}</div>
                                     </div>
                                 </div>
                             </div>
                         ))}
                     </div>
                 </div>
             ) : (
                 <div className="bg-white rounded-3xl p-8 border border-[#EBE8E0] shadow-sm">
                     <h3 className="flex items-center gap-2 text-sm font-bold text-charcoal uppercase tracking-widest mb-6"><Lightbulb size={16} className="text-gold" />Key Suggestions</h3>
                     <div className="space-y-4">
                         {performanceReport!.suggestions.map((tip, i) => (
                             <div key={i} className="flex gap-5 p-5 rounded-xl bg-[#FAF9F6] border border-[#F0F0F0]">
                                 <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-sm font-serif font-bold text-gold shrink-0 shadow-sm">{i + 1}</div>
                                 <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">{tip}</p>
                             </div>
                         ))}
                     </div>
                 </div>
             )}

            {performanceReport!.pronunciationFeedback && performanceReport!.pronunciationFeedback.length > 0 && (
                 <div className="bg-white rounded-3xl p-8 border border-[#EBE8E0] shadow-sm">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-charcoal uppercase tracking-widest mb-6">
                        <Ear size={16} className="text-gold" />
                        Pronunciation & Clarity
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {performanceReport!.pronunciationFeedback.map((item, i) => (
                            <div key={i} className="flex items-start gap-3 p-4 bg-[#FAF9F6] rounded-xl border border-[#F0F0F0]">
                                <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                                <span className="text-gray-700 text-sm whitespace-pre-wrap">{item}</span>
                            </div>
                        ))}
                    </div>
                 </div>
            )}
         </div>
     </div>
  );

  const renderTeleprompterView = () => (
      <div className="relative h-screen w-screen bg-cream overflow-hidden flex flex-col font-sans">
      <div className="h-16 bg-cream/90 backdrop-blur-md border-b border-[#E6E6E6] flex items-center justify-between px-8 z-50 shrink-0">
        <div className="flex items-center gap-4">
            <button onClick={goHome} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors">
                <Home size={16} className="text-gray-500" />
            </button>
            <h1 className="text-charcoal font-serif font-bold text-xl tracking-tight">Teleprompter Practice</h1>
        </div>

        <div className="flex items-center gap-6">
             {!hasStarted ? (
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                    Setup Mode
                </div>
             ) : (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase bg-green-50 text-green-700 border border-green-200">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                    Ready
                </div>
             )}
             {recordingState === 'recording' && (
                 <div className="flex items-center gap-2 text-red-500 font-bold text-[10px] tracking-widest uppercase animate-pulse">
                     <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                     REC
                 </div>
             )}
        </div>
      </div>

      <div className="relative flex-1 bg-[#1a1a1a] overflow-hidden">
        {permissionError ? (
          <div className="flex flex-col items-center justify-center h-full text-white/50 p-8 text-center font-serif italic gap-4">
            <span>{permissionError}</span>
            <button onClick={initCamera} className="px-6 py-2 bg-white/10 text-white rounded-full text-sm font-sans font-bold hover:bg-white/20 transition-colors">Retry Camera Access</button>
          </div>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1]" />
            
            {!hasStarted ? (
                 // Start Screen (Setup)
                 <div className="absolute inset-0 z-40 bg-cream/80 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in duration-500">
                      <div className="w-full max-w-3xl">
                        <div className="bg-white rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] border border-[#EBE8E0] overflow-hidden">
                            <div className="px-8 py-5 border-b border-[#F0F0F0] flex justify-between items-center bg-white">
                                <div className="flex items-center gap-3">
                                    <div className="w-1.5 h-1.5 rounded-full bg-gold"></div>
                                    <span className="text-xs font-bold text-gray-400 tracking-widest uppercase">Script Editor</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <button 
                                        onClick={generateAndPlayTTS}
                                        disabled={isGeneratingTTS || !scriptText}
                                        className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-colors ${isPlayingTTS ? 'text-red-500 animate-pulse' : 'text-gold hover:text-charcoal'}`}
                                    >
                                        {isGeneratingTTS ? <Loader2 size={14} className="animate-spin" /> : isPlayingTTS ? <><StopCircle size={14} /><span>Stop Audio</span></> : <><Volume2 size={14} /><span>Listen to AI</span></>}
                                    </button>
                                    <div className="h-4 w-px bg-gray-200"></div>
                                    <button onClick={handleClearScript} className="text-xs font-medium text-gray-400 hover:text-red-500 transition-colors">Clear</button>
                                </div>
                            </div>
                            <div className="p-2 bg-white">
                                <textarea
                                    className="w-full h-80 bg-white text-charcoal p-6 outline-none resize-none text-xl leading-relaxed font-light placeholder-gray-300 font-serif"
                                    placeholder="Paste your script here..."
                                    value={scriptText}
                                    onChange={handleScriptChange}
                                />
                            </div>
                            <div className="bg-[#FAF9F6] px-8 py-4 border-t border-[#F0F0F0] flex justify-between text-xs text-gray-400 font-medium tracking-wide">
                                <span>{scriptWords.length} words</span>
                                <span>~{Math.ceil(scriptWords.length / 2.5)}s estimated</span>
                            </div>
                        </div>

                        <div className="mt-10 flex flex-col items-center gap-6">
                            <button
                                onClick={() => setHasStarted(true)}
                                disabled={scriptWords.length === 0}
                                className={`group px-10 py-4 rounded-full font-medium text-lg flex items-center gap-3 transition-all transform duration-300 ${scriptWords.length > 0 ? 'bg-charcoal text-white hover:bg-black hover:-translate-y-1 shadow-lg shadow-black/10' : 'bg-[#E0E0E0] text-gray-400 cursor-not-allowed'}`}
                            >
                                <span>Start Session</span>
                                <ArrowRight size={18} className={`transition-transform duration-300 ${scriptWords.length > 0 ? 'group-hover:translate-x-1' : ''}`} />
                            </button>
                            <div className="h-8">
                                {!stream && (
                                     <div className="flex items-center justify-center gap-2 text-gray-400 text-sm animate-pulse">
                                        <Sparkles size={14} className="text-gold" />
                                        <span>Initializing Camera...</span>
                                     </div>
                                )}
                            </div>
                        </div>
                      </div>
                 </div>
            ) : (
                <>
                    {/* Active Teleprompter */}
                    {!isEditMode && !showReport && <Teleprompter words={scriptWords} activeWordIndex={activeWordIndex} fontSize={fontSize} opacity={opacity} />}
                    
                    {/* Edit Mode Overlay */}
                    {isEditMode && (
                       <div className="absolute inset-0 z-30 bg-cream/95 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
                          <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl border border-[#E6E6E6] flex flex-col h-[80vh]">
                            <div className="flex justify-between items-center px-8 py-6 border-b border-[#F0F0F0]">
                                <h2 className="text-2xl font-serif font-bold text-charcoal">Edit Script</h2>
                                <div className="flex items-center gap-6">
                                    <button 
                                        onClick={generateAndPlayTTS}
                                        disabled={isGeneratingTTS || !scriptText}
                                        className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-colors ${isPlayingTTS ? 'text-red-500 animate-pulse' : 'text-gold hover:text-charcoal'}`}
                                    >
                                        {isGeneratingTTS ? <Loader2 size={14} className="animate-spin" /> : isPlayingTTS ? <><StopCircle size={14} /><span>Stop Audio</span></> : <><Volume2 size={14} /><span>Listen to AI</span></>}
                                    </button>
                                    <div className="h-6 w-px bg-gray-200"></div>
                                    <button onClick={() => setIsEditMode(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={24} className="text-gray-500" /></button>
                                </div>
                            </div>
                            <div className="flex-1 p-4 bg-white overflow-hidden">
                                 <textarea className="w-full h-full bg-transparent text-charcoal p-4 outline-none resize-none text-2xl leading-relaxed font-serif placeholder-gray-300" placeholder="Type your script..." value={scriptText} onChange={handleScriptChange} />
                            </div>
                            <div className="px-8 py-5 border-t border-[#F0F0F0] bg-[#FAF9F6] flex justify-between items-center rounded-b-2xl">
                                 <button onClick={handleClearScript} className="text-sm font-medium text-red-500 hover:text-red-600">Clear All</button>
                                 <div className="flex items-center gap-6">
                                    <span className="text-xs text-gray-400 font-mono">{scriptWords.length} words</span>
                                    <button onClick={() => setIsEditMode(false)} className="px-6 py-2 bg-charcoal text-white rounded-full text-sm font-bold hover:bg-black transition-colors">Done</button>
                                 </div>
                            </div>
                          </div>
                       </div>
                    )}

                    {/* Report Overlay for Teleprompter Session */}
                    {showReport && performanceReport && (
                        <div className="absolute inset-0 z-40 bg-cream/95 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-500">
                             <div ref={reportRef} className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-[#EBE8E0] overflow-hidden flex flex-col max-h-[90vh]">
                                 <div className="p-6 border-b border-[#F0F0F0] flex justify-between items-center bg-gradient-to-br from-white to-[#FAF9F6]">
                                    <h2 className="text-2xl font-serif font-bold text-charcoal">Performance Report</h2>
                                     <button onClick={() => setShowReport(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-charcoal transition-colors"><X size={24} /></button>
                                 </div>
                                 <div className="flex-1 overflow-y-auto">
                                    {/* Reuse the render logic but wrapped differently for this modal context */}
                                    <div className="p-8">
                                        <div className="flex items-center gap-6 mb-8">
                                            <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
                                                <div className="absolute inset-0 rounded-full border-4 border-[#F0F0F0]"></div>
                                                <div className="absolute inset-0 rounded-full border-4 border-gold border-t-transparent transform -rotate-45" style={{ clipPath: `polygon(0 0, 100% 0, 100% ${performanceReport.rating}%, 0 ${performanceReport.rating}%)`}}></div>
                                                <span className="text-3xl font-serif font-bold text-charcoal">{performanceReport.rating}</span>
                                            </div>
                                            <div>
                                                <div className="text-sm text-gray-500 font-medium mb-1">Summary</div>
                                                <div className="text-lg text-charcoal leading-snug whitespace-pre-wrap">{performanceReport.summary}</div>
                                            </div>
                                        </div>
                                        {/* Brief Suggestions for Teleprompter Mode */}
                                        <h3 className="flex items-center gap-2 text-sm font-bold text-charcoal uppercase tracking-widest mb-4"><Lightbulb size={16} className="text-gold" />Suggestions</h3>
                                        <div className="space-y-3 mb-6">
                                             {performanceReport.suggestions.map((tip, i) => (
                                                 <div key={i} className="flex gap-4 p-4 rounded-xl bg-[#FAF9F6] border border-[#F0F0F0]">
                                                     <div className="w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center text-xs font-serif font-bold text-gold shrink-0">{i + 1}</div>
                                                     <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">{tip}</p>
                                                 </div>
                                             ))}
                                        </div>
                                        {performanceReport.pronunciationFeedback && (
                                            <div>
                                                <h3 className="flex items-center gap-2 text-sm font-bold text-charcoal uppercase tracking-widest mb-4"><Ear size={16} className="text-gold" />Pronunciation</h3>
                                                <div className="bg-[#FAF9F6] p-4 rounded-xl border border-[#F0F0F0]">
                                                    {performanceReport.pronunciationFeedback.length > 0 ? (
                                                        <ul className="space-y-2">{performanceReport.pronunciationFeedback.map((s, i) => <li key={i} className="text-sm text-gray-600 list-disc ml-4">{s}</li>)}</ul>
                                                    ) : <span className="text-sm text-gray-400 italic">No issues detected.</span>}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                 </div>
                                 <div className="p-4 bg-[#FAF9F6] border-t border-[#F0F0F0] flex justify-end gap-3" data-html2canvas-ignore>
                                     <button onClick={downloadReportAsImage} className="px-5 py-2 bg-white text-charcoal border border-gray-300 rounded-full text-xs font-bold hover:bg-gray-50 flex items-center gap-2"><Download size={14} /> Download</button>
                                     <button onClick={() => setShowReport(false)} className="px-5 py-2 bg-charcoal text-white rounded-full text-xs font-bold hover:bg-black">Close</button>
                                 </div>
                             </div>
                        </div>
                    )}
                </>
            )}
          </>
        )}
      </div>

      {hasStarted && (
          <div className="h-24 bg-cream/90 backdrop-blur-md border-t border-[#E6E6E6] flex items-center justify-between px-10 z-50 shrink-0">
             <div className="flex items-center gap-4 w-1/3">
                <div className="relative group">
                    <button onClick={() => setShowSettings(!showSettings)} className={`p-3 rounded-full transition-all duration-300 ${showSettings ? 'bg-charcoal text-white' : 'text-gray-500 hover:bg-gray-200 hover:text-charcoal'}`} title="Settings"><Settings size={20} /></button>
                    {showSettings && (
                        <div className="absolute bottom-full left-0 mb-6 w-72 bg-white rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] border border-[#EBE8E0] p-6 animate-in slide-in-from-bottom-2">
                            <h3 className="text-[10px] font-bold text-gold mb-6 uppercase tracking-widest">Display Settings</h3>
                            <div className="space-y-8">
                                <div>
                                    <div className="flex justify-between text-xs font-medium text-gray-500 mb-3"><span>Text Size</span><span>{fontSize}px</span></div>
                                    <input type="range" min="24" max="96" value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value))} className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-charcoal" />
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs font-medium text-gray-500 mb-3"><span>Future Text Visibility</span><span>{Math.round(opacity * 100)}%</span></div>
                                    <input type="range" min="0" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(parseFloat(e.target.value))} className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-charcoal" />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <button onClick={() => setIsEditMode(true)} className="p-3 text-gray-500 hover:bg-gray-200 hover:text-charcoal rounded-full transition-all" title="Edit Script"><Type size={20} /></button>
             </div>

             <div className="flex items-center justify-center w-1/3">
                 {recordingState === 'idle' ? (
                    <button onClick={startRecording} disabled={scriptWords.length === 0} className={`w-16 h-16 rounded-full flex items-center justify-center border-[3px] transition-all duration-300 ${scriptWords.length > 0 ? 'border-charcoal bg-transparent hover:bg-charcoal group' : 'border-gray-300 bg-gray-100 cursor-not-allowed opacity-50'}`} title={scriptWords.length === 0 ? "Add script to record" : "Start Recording"}>
                         <div className={`w-6 h-6 rounded-full transition-colors duration-300 ${scriptWords.length > 0 ? 'bg-red-500 group-hover:bg-red-500' : 'bg-gray-300'}`}></div>
                    </button>
                 ) : (
                    <button onClick={stopRecording} className="w-16 h-16 rounded-full flex items-center justify-center border-[3px] border-red-500 bg-transparent hover:bg-red-50 transition-all group">
                        <div className="w-6 h-6 bg-red-500 rounded-sm group-hover:scale-90 transition-transform"></div>
                    </button>
                 )}
             </div>

             <div className="flex items-center justify-end gap-3 w-1/3 text-sm">
                 {recordingState !== 'idle' && <div className="font-mono text-charcoal font-medium text-lg tracking-widest">{formatTime(recordingDuration)}</div>}
                 {recordingState === 'idle' && recordedChunks.length > 0 && (
                    <>
                        <button onClick={performanceReport ? () => setShowReport(true) : analyzePerformance} disabled={isAnalyzing} className={`flex items-center gap-2 px-5 py-3 rounded-full text-xs font-bold tracking-wider uppercase transition-all shadow-md ${isAnalyzing ? 'bg-gray-100 text-gray-400 cursor-wait' : 'bg-white text-gold border border-gold/30 hover:bg-gold hover:text-white'}`}>
                            {isAnalyzing ? <><Loader2 size={16} className="animate-spin" /><span>Analyzing...</span></> : <><Sparkles size={16} /><span>{performanceReport ? 'View Report' : 'Analyze'}</span></>}
                        </button>
                        <button onClick={downloadVideo} className="flex items-center gap-2 px-5 py-3 bg-charcoal text-white rounded-full text-xs font-bold tracking-wider uppercase hover:bg-black transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"><Download size={16} /><span>Save Video</span></button>
                    </>
                 )}
             </div>
          </div>
      )}
      </div>
  );

  return (
    <>
        {currentView === 'home' && renderHome()}
        {currentView === 'analysis' && renderAnalysisView()}
        {currentView === 'teleprompter' && renderTeleprompterView()}
    </>
  );
};

export default App;
