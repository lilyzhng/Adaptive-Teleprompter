
export interface ScriptWord {
  id: string;
  word: string;
  cleanWord: string;
  isSpoken: boolean;
  isParagraphStart?: boolean;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

// export interface TeleprompterConfig { ... } - Removed as per refactor

export interface DetailedFeedback {
  category: string; // e.g. "Pace (Speed & Rhythm)"
  issue: string;    // "The Issue: ..."
  instance: string; // "Specific Instance: ..."
  rewrite: string;  // "The Human Rewrite" - Conversational, high-EQ revision
  explanation: string; // "Why this works" - Breakdown of techniques used
  question?: string; // The specific question or discussion point from the interviewer
}

export interface Highlight {
  category: string;
  strength: string;
  quote: string;
  question?: string; // The specific question or discussion point from the interviewer
}

export interface CandidateQuestion {
  questionAsked: string; // The actual question the candidate asked
  context: string; // The conversation context when this question was asked
  analysis: string; // What was good or problematic about this question
  improvedVersion?: string; // How to improve this question (if needed)
  reasoning: string; // Why the improved version is better
}

export interface FlipTheTable {
  candidateQuestions: CandidateQuestion[]; // Questions the candidate actually asked
  missedOpportunities: {
    suggestedQuestion: string; // A great question the candidate should have asked
    context: string; // When/why this would have been relevant
    impact: string; // Why asking this would have made a strong impression
  }[];
  overallAssessment: string; // General feedback on the candidate's question-asking strategy
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
  question?: string;    // The specific question or discussion point from the interviewer
}

// --- Hot Take Specific Types ---

export interface HotTakeTurn {
  stage: string;
  query: string;
  response: string;
}

export interface HotTakeGlobalContext {
  company: string;
  interviewer: string;
  roundFocus: string;
}

export interface HotTakePreference {
  questionText: string;
  feedback?: string;
  type: 'positive' | 'negative';
  timestamp: string;
}

export interface HotTakeRoundAnalysis {
  question: string;
  transcript: string;
  score: number;
  rubric: Record<string, number>;
  critique: string;
  rewrite: string;
}

export interface HotTakeQuestion {
  id: string;
  title: string;
  context: string;
  probingPrompt: string;
  source?: string; // Optional source tag (e.g., "Augment Code Interview")
}

export interface PerformanceReport {
  rating: number;
  summary: string;
  suggestions: string[];
  pronunciationFeedback: SpeechDrill[];
  detailedFeedback?: DetailedFeedback[]; // Negative/Constructive feedback
  highlights?: Highlight[]; // Positive feedback
  coachingRewrite?: CoachingRewrite; // Global rewrite
  flipTheTable?: FlipTheTable; // Analysis of candidate's questions
  // Walkie Talkie specific fields
  mentalModelChecklist?: {
    logicCorrect: boolean;
    edgeCasesMentioned: boolean;
    complexityAnalyzed: boolean;
    exampleTraced: boolean;
  };
  missingEdgeCases?: string[];
  detectedAutoScore?: 'good' | 'partial' | 'missed';
  // Hot Take specific fields
  hotTakeRubric?: Record<string, number>;
  continueSparring?: boolean;
  followUpQuestion?: string;
  hotTakeHistory?: HotTakeTurn[];
  hotTakeMasterRewrite?: string;
  hotTakeRounds?: {
    round1: HotTakeRoundAnalysis;
    round2: HotTakeRoundAnalysis;
  };
}

export interface SavedItem {
  id: string;
  type: 'improvement' | 'highlight' | 'drill' | 'candidate_question' | 'missed_opportunity';
  date: string;
  category: string;
  title: string; // "strength" or "issue" or "question"
  content: string; // "quote" or "instance" or "questionAsked"
  rewrite?: string; // Only for improvements and candidate questions
  explanation?: string; // Only for improvements
  question?: string; // The original interview question (for rehearsal practice)
  humanRewrite?: string; // AI recommended human-like rewrite for speaking practice
  context?: string; // For candidate questions: when this was relevant
  impact?: string; // For missed opportunities: why this matters
  reportData?: { // Full context for future flexibility
    report: PerformanceReport;
    transcript?: string;
    context?: string;
  };
}

export interface SavedReport {
    id: string;
    date: string;
    title: string; // Context string or Script name
    type: 'coach' | 'rehearsal' | 'walkie' | 'hot-take';
    rating: number;
    reportData: PerformanceReport;
}

export interface User {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
}

// --- Walkie-Talkie Specific Types ---

export interface BlindProblem {
  id: string;
  title: string;
  prompt: string;
  example?: string;
  constraints: string[];
  pattern: string;
  keyIdea: string;
  skeleton: string;
  timeComplexity: string;
  spaceComplexity: string;
  steps: string[];
  expectedEdgeCases: string[];
}
