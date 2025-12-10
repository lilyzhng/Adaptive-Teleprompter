
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
  rewrite: string;  // "The Human Rewrite" - Conversational, high-EQ revision
  explanation: string; // "Why this works" - Breakdown of techniques used
}

export interface Highlight {
  category: string;
  strength: string;
  quote: string;
}

export interface CoachingRewrite {
  diagnosis: string; // "The Diagnosis (Brutal Honesty)"
  fix: string;       // "The Fix (Tactical Strategy)"
  rewrite: string;   // "The Human Rewrite"
}

export interface SpeechDrill {
  phrase: string;       // The original phrase spoken
  issue: string;        // e.g. "Rushed technical term", "Monotone"
  practiceDrill: string; // Visual guide: "Con-vo-LU-tion-al ... NET-works"
  reason: string;       // Why this emphasis matters
}

export interface PerformanceReport {
  rating: number;
  summary: string;
  suggestions: string[];
  pronunciationFeedback: SpeechDrill[];
  detailedFeedback?: DetailedFeedback[]; // Negative/Constructive feedback
  highlights?: Highlight[]; // Positive feedback
  coachingRewrite?: CoachingRewrite; // Global rewrite
}

export interface SavedItem {
  id: string;
  type: 'improvement' | 'highlight' | 'drill';
  date: string;
  category: string;
  title: string; // "strength" or "issue"
  content: string; // "quote" or "instance"
  rewrite?: string; // Only for improvements
  explanation?: string; // Only for improvements
  question?: string; // The original interview question (for rehearsal practice)
  humanRewrite?: string; // AI recommended human-like rewrite for speaking practice
}

export interface SavedReport {
    id: string;
    date: string;
    title: string; // Context string or Script name
    type: 'coach' | 'rehearsal';
    rating: number;
    reportData: PerformanceReport;
}

export interface User {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
}
