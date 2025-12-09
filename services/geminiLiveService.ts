import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

interface LiveServiceCallbacks {
  onTranscription: (text: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onError: (error: Error) => void;
}

export class GeminiLiveService {
  private client: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private callbacks: LiveServiceCallbacks;
  private isConnected: boolean = false;

  constructor(callbacks: LiveServiceCallbacks) {
    this.client = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
    this.callbacks = callbacks;
  }

  async connect(audioStream: MediaStream) {
    if (this.isConnected) return;

    try {
      this.stream = audioStream;
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000,
      });

      this.sessionPromise = this.client.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            this.isConnected = true;
            this.startAudioStream();
            this.callbacks.onConnect();
          },
          onmessage: (message: LiveServerMessage) => {
            this.handleMessage(message);
          },
          onclose: () => {
            this.cleanup();
          },
          onerror: (e) => {
            console.error('Gemini Live Error:', e);
            this.callbacks.onError(new Error("Connection error"));
            this.cleanup();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          // Enable input transcription to detect what the user is saying
          inputAudioTranscription: {}, 
          systemInstruction: "You are a passive listener. Do not speak. Only transcribe.",
          speechConfig: {
             voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
          }
        },
      });
    } catch (error) {
      this.callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      this.cleanup();
    }
  }

  private startAudioStream() {
    if (!this.inputAudioContext || !this.stream || !this.sessionPromise) return;

    this.source = this.inputAudioContext.createMediaStreamSource(this.stream);
    // Buffer size 4096, 1 input channel, 1 output channel
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmBlob = this.createBlob(inputData);
      
      this.sessionPromise?.then((session) => {
        session.sendRealtimeInput({ media: pcmBlob });
      });
    };

    this.source.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  private handleMessage(message: LiveServerMessage) {
    // We are primarily interested in inputTranscription to track user progress
    if (message.serverContent?.inputTranscription) {
      const text = message.serverContent.inputTranscription.text;
      if (text) {
        this.callbacks.onTranscription(text);
      }
    }
    
    // We can ignore model audio output since we instructed it to be silent/passive
    // but we must handle the potential audio bytes if they come to avoid errors? 
    // Actually, simply ignoring them is fine if we aren't playing them back.
  }

  async disconnect() {
    if (this.sessionPromise) {
        const session = await this.sessionPromise;
        session.close();
    }
    this.cleanup();
  }

  private cleanup() {
    this.isConnected = false;
    this.callbacks.onDisconnect();
    
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.inputAudioContext) {
      this.inputAudioContext.close();
      this.inputAudioContext = null;
    }
    this.sessionPromise = null;
  }

  private createBlob(data: Float32Array) {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      // Convert float audio to int16 PCM
      int16[i] = Math.max(-1, Math.min(1, data[i])) * 32767;
    }
    
    // Manual base64 encoding for the raw bytes
    const uint8 = new Uint8Array(int16.buffer);
    let binary = '';
    const len = uint8.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64Data = btoa(binary);

    return {
      data: base64Data,
      mimeType: 'audio/pcm;rate=16000',
    };
  }
}
