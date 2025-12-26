
// Utility to generate unique IDs
export const generateId = () => Math.random().toString(36).substr(2, 9);

// Utility to clean text for comparison
export const cleanText = (text: string) => 
  text.toLowerCase()
    .replace(/[\u2018\u2019]/g, "'") // Normalize curly single quotes
    .replace(/[\u201C\u201D]/g, '"') // Normalize curly double quotes
    .replace(/-/g, " ")              // Treat hyphens as spaces
    .replace(/[^\w\s']|_/g, "")      // Remove punctuation except apostrophes
    .trim();

// Utility to convert blob to base64
export const blobToBase64 = (blob: Blob): Promise<string> => {
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
export const audioBufferToWav = (buffer: AudioBuffer): Blob => {
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
export const pcmToAudioBuffer = (
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
export const extractAudioFromVideo = async (videoBlob: Blob): Promise<string> => {
    const arrayBuffer = await videoBlob.arrayBuffer();
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const wavBlob = audioBufferToWav(audioBuffer);
    return blobToBase64(wavBlob);
};

// Helper to get robust mime type
export const getAudioMimeType = (file: File): string => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'm4a') return 'audio/mp4';
    if (file.type) return file.type;
    if (ext === 'mp3') return 'audio/mp3';
    if (ext === 'wav') return 'audio/wav';
    if (ext === 'aac') return 'audio/aac';
    return 'audio/mp3';
};

export const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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

export const isMatch = (scriptWord: string, spokenWord: string): boolean => {
    if (!scriptWord || !spokenWord) return false;
    if (scriptWord === spokenWord) return true;
    
    const len = Math.max(scriptWord.length, spokenWord.length);
    if (len <= 3) return scriptWord === spokenWord; 
    
    const dist = getLevenshteinDistance(scriptWord, spokenWord);
    return dist <= Math.floor(len * 0.4); 
};

// Utility to create URL-safe slugs from titles
export const titleToSlug = (title: string): string => {
  return title
    .toLowerCase()
    .trim()                    // Trim whitespace first
    .replace(/[^\w\s-]/g, '')  // Remove special characters
    .replace(/\s+/g, '-')      // Replace spaces with hyphens
    .replace(/-+/g, '-')       // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, '');  // Remove leading and trailing hyphens
};

// Utility to find report by slug (supports both ID-based and title-based lookups for backwards compatibility)
export const findReportBySlug = <T extends { id: string; title: string }>(reports: T[], slug: string): T | undefined => {
  // First try to find by ID (new format: id-based slugs)
  const byId = reports.find(report => report.id === slug);
  if (byId) return byId;
  
  // Fall back to title-based lookup for backwards compatibility
  return reports.find(report => titleToSlug(report.title) === slug);
};
