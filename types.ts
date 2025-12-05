
export interface ScriptWord {
  id: string;
  word: string;
  cleanWord: string;
  isSpoken: boolean;
  isParagraphStart?: boolean;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

export interface TeleprompterConfig {
  fontSize: number;
  opacity: number;
  scrollSpeed: number; // Manual offset if needed, though we use auto
}

export interface DetailedFeedback {
  category: string; // e.g. "Pace (Speed & Rhythm)"
  issue: string;    // "The Issue: ..."
  instance: string; // "Specific Instance: ..."
  improvement: string; // "Improvement: ..."
}

export interface PerformanceReport {
  rating: number;
  summary: string;
  suggestions: string[];
  pronunciationFeedback: string[];
  detailedFeedback?: DetailedFeedback[]; // New field for deep analysis
}
