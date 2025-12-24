
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

// WalkieTalkie Rubric Scores
export interface WalkieRubricScores {
  algorithmScore: number;
  algorithmFeedback: string;
  edgeCasesScore: number;
  edgeCasesFeedback: string;
  timeComplexityScore: number;
  timeComplexityFeedback: string;
  spaceComplexityScore: number;
  spaceComplexityFeedback: string;
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
  rubricScores?: WalkieRubricScores; // Strict rubric scoring for LeetCode
  mentalModelChecklist?: {
    correctPattern?: boolean;
    logicCorrect?: boolean;
    timeComplexityMentioned?: boolean;
    timeComplexityCorrect?: boolean;
    spaceComplexityMentioned?: boolean;
    spaceComplexityCorrect?: boolean;
    edgeCasesMentioned?: boolean;
    // Legacy fields for backwards compatibility
    complexityAnalyzed?: boolean;
    exampleTraced?: boolean;
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
  // Teaching mode specific fields
  teachingReportData?: TeachingReport;
  teachingSession?: TeachingSession;  // The full dialog between teacher and junior
  juniorSummary?: string;
  teachingProblem?: BlindProblem; // The problem data for model answer display in teach reports
  // Readiness (Explain mode Phase 1) specific fields
  readinessReportData?: ReadinessReport;
  readinessProblem?: BlindProblem; // The problem data for model answer display
  rawTranscript?: string;
  refinedTranscript?: string;
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
  question?: string; // The original interview question
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
    type: 'coach' | 'walkie' | 'hot-take' | 'teach' | 'readiness';
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
  detailedHint?: string; // More thorough walkthrough of problem-solving approach
  definition?: string; // Data structure/concept definitions (shown first before hints)
  skeleton: string;
  timeComplexity: string;
  spaceComplexity: string;
  steps: string[];
  expectedEdgeCases: string[];
  topics: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  problemGroup?: string; // Learning group/pattern (e.g., 'arrays_hashing', 'two_pointers', 'dp_1d')
  leetcodeNumber?: number;
  mnemonicImageUrl?: string; // Visual mnemonic image URL from Supabase Storage
}

// --- Teach-Back Mode Types ---

export interface JuniorState {
  currentUnderstanding: string[];  // What junior believes they understand
  confusionPoints: string[];       // Active confusion points
  likelyMisimplementations: string[]; // What they'd get wrong if coding now
  readyToSummarize: boolean;
}

export interface TeachingTurn {
  speaker: 'teacher' | 'junior';
  content: string;
  rawContent?: string; // Original unrefined transcript (for debugging)
  timestamp: number;
}

export interface TeachingSession {
  problemId: string;
  turns: TeachingTurn[];
  juniorState: JuniorState;
  juniorSummary?: string;  // Final recap from junior
}

export interface TeachingReportBreakdown {
  clarity: number;        // 0-10: was core insight stated clearly? (brief but precise is good)
  correctness: number;    // 0-10: taught algorithm is correct
  completeness: number;   // 0-10: by end of conversation, intuition + steps + edge cases + complexity covered
  studentMastery: number; // 0-10: did the junior end able to summarize + implement?
  scaffolding: number;    // 0-10: did teacher guide discovery well through Q&A?
}

export interface FactualError {
  whatTeacherSaid: string;   // Quote the incorrect statement
  whatIsCorrect: string;      // The correct explanation
  whyItMatters: string;       // How this caused student confusion
}

export interface DialogueAnnotation {
  turnIndex: number;           // Which turn (0-indexed)
  speaker: 'teacher' | 'junior';
  annotation: string;          // Why student asked this / what's wrong with teacher's response
  issueType?: 'factual_error' | 'incomplete' | 'unclear' | 'hand_wavy' | 'good' | 'good_scaffolding' | 'discovery_question' | 'confusion_question';
}

export interface TeachingReport {
  teachingScore: number;  // 0-100
  breakdown: TeachingReportBreakdown;
  factualErrors: FactualError[];  // List of incorrect statements made by teacher
  dialogueAnnotations: DialogueAnnotation[];  // Per-turn analysis for visual feedback
  evidenceNotes: string[];   // Cite specific moments from dialogue
  topGaps: string[];         // Max 3 gaps that prevented understanding
  concreteImprovement: string; // One specific behavior change for next time
  studentOutcome: 'can_implement' | 'conceptual_only' | 'still_confused';
  juniorSummaryCorrect: boolean;
}

// --- Explain Mode (Pass 1 - Readiness to Teach) Types ---

export interface ReadinessChecklist {
  coreInsight: {
    present: boolean;
    quality: 'clear' | 'vague' | 'missing';
    feedback: string;
  };
  stateDefinition: {
    present: boolean;
    quality: 'precise' | 'hand-wavy' | 'missing';
    feedback: string;
  };
    exampleWalkthrough: {
    present: boolean;
    quality: 'concrete' | 'abstract' | 'missing';
    feedback: string;
    modelExample?: string; // AI-generated example walkthrough showing how to trace through the algorithm
  };
  edgeCases: {
    mentioned: string[];
    missing: string[];
    feedback: string;
  };
  complexity: {
    timeMentioned: boolean;
    timeCorrect: boolean;
    spaceMentioned: boolean;
    spaceCorrect: boolean;
    feedback: string;
    expectedTime?: string;  // The correct time complexity
    expectedSpace?: string; // The correct space complexity
    correctExplanation?: string; // How to correctly explain the complexity
  };
}

export interface MissingElement {
  element: string;       // What was missing
  correctAnswer: string; // The correct way to explain this element
}

export interface ReadinessReport {
  readinessScore: number;  // 0-100
  isReadyToTeach: boolean; // true if score >= 70
  checklist: ReadinessChecklist;
  missingElements: MissingElement[];  // What's still needed with correct answers
  strengthElements?: string[]; // Deprecated - kept for backwards compatibility
  suggestion: string;  // One concrete thing to add/improve
}

export interface ExplainSession {
  problemId: string;
  transcript: string;
  readinessReport?: ReadinessReport;
}
