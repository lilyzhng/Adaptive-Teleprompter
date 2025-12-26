
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Home, ArrowLeft, Mic, StopCircle, ChevronRight, CheckCircle2, Award, Sparkles, Code2, Loader2, BrainCircuit, X, ShieldAlert, BookOpen, Coffee, Trees, Train, Trophy, Star, AlertCircle, Flame, Target, Repeat, Zap, Leaf, GraduationCap, MessageCircle, Volume2, VolumeX, Send, Layers, ExternalLink, Settings, Calendar, RefreshCw, Lock } from 'lucide-react';
import { BlindProblem, PerformanceReport, SavedItem, SavedReport, TeachingSession, TeachingTurn, JuniorState, TeachingReport, ReadinessReport } from '../types';
import { UserStudySettings, StudyStats } from '../types/database';
import { analyzeWalkieSession, refineTranscript } from '../services/analysisService';
import { buildProblemQueue, fetchBlindProblemByTitle, fetchUserProgressByTitle } from '../services/databaseService';
import { 
  getInitialJuniorState, 
  getJuniorResponse, 
  getJuniorSummary, 
  evaluateTeaching,
  speakJuniorResponse,
  stopSpeaking,
  createTeachingSession,
  addTurn,
  updateJuniorState,
  setJuniorSummary,
  evaluateReadinessToTeach
} from '../services/teachBackService';
import {
  getSettingsWithDefaults,
  updateSettings,
  buildSpacedRepetitionQueue,
  updateProgressAfterAttempt,
  getProgressGrid,
  GroupedProblems,
  DEFAULT_SETTINGS
} from '../services/spacedRepetitionService';
import { useAuth } from '../contexts/AuthContext';
import PerformanceReportComponent from '../components/PerformanceReport';
import TeachingReportComponent from '../components/TeachingReport';
import ReadinessReportComponent from '../components/ReadinessReport';

// Difficulty mode types
type DifficultyMode = 'warmup' | 'standard' | 'challenge';
// Session mode types - Paired (default) combines Explain → Teach on same problem
type SessionMode = 'paired' | 'explain' | 'teach';

const DIFFICULTY_MAP: Record<DifficultyMode, ('easy' | 'medium' | 'hard')[]> = {
  warmup: ['easy'],
  standard: ['easy', 'medium'],
  challenge: ['easy', 'medium', 'hard']
};

// NeetCode video solution URLs mapped by problem title
const NEETCODE_VIDEO_URLS: Record<string, string> = {
  'Two Sum': 'https://youtu.be/KLlXCFG5TnA',
  'Best Time to Buy and Sell Stock': 'https://youtu.be/1pkOgXD63yU',
  'Contains Duplicate': 'https://youtu.be/3OamzN90kPg',
  'Product of Array Except Self': 'https://youtu.be/bNvIQI2wAjk',
  'Maximum Subarray': 'https://youtu.be/5WZl3MMT0Eg',
  'Maximum Product Subarray': 'https://youtu.be/lXVy6YWFcRM',
  'Find Minimum in Rotated Sorted Array': 'https://youtu.be/nIVW4P8b1VA',
  'Search in Rotated Sorted Array': 'https://youtu.be/U8XENwh8Oy8',
  '3Sum': 'https://youtu.be/jzZsG8n2R9A',
  'Container With Most Water': 'https://youtu.be/UuiTKBwPgAo',
  'Sum of Two Integers': 'https://youtu.be/gVUrDV4tZfY',
  'Number of 1 Bits': 'https://youtu.be/5Km3utixwZs',
  'Counting Bits': 'https://youtu.be/RyBM56RIWrM',
  'Missing Number': 'https://youtu.be/WnPLSRLSANE',
  'Reverse Bits': 'https://youtu.be/UcoN6UjAI64',
  'Climbing Stairs': 'https://youtu.be/Y0lT9Fck7qI',
  'Coin Change': 'https://youtu.be/H9bfqozjoqs',
  'Longest Increasing Subsequence': 'https://youtu.be/cjWnW0hdF1Y',
  'Longest Common Subsequence': 'https://youtu.be/Ua0GhsJSlWM',
  'Word Break': 'https://youtu.be/Sx9NNgInc3A',
  'Word Break Problem': 'https://youtu.be/Sx9NNgInc3A',
  'Combination Sum': 'https://youtu.be/GBKI9VSKdGg',
  'House Robber': 'https://youtu.be/73r3KWiEvyk',
  'House Robber II': 'https://youtu.be/rWAJCfYYOvM',
  'Decode Ways': 'https://youtu.be/6aEyTjOwlJU',
  'Unique Paths': 'https://youtu.be/IlEsdxuD4lY',
  'Jump Game': 'https://youtu.be/Yan0cv2cLy8',
  'Clone Graph': 'https://youtu.be/mQeF6bN8hMk',
  'Course Schedule': 'https://youtu.be/EgI5nU9etnU',
  'Pacific Atlantic Water Flow': 'https://youtu.be/s-VkcjHqkGI',
  'Number of Islands': 'https://youtu.be/pV2kpPD66nE',
  'Longest Consecutive Sequence': 'https://youtu.be/P6RZZMu_maU',
  'Alien Dictionary': 'https://youtu.be/6kTZYvNNyps',
  'Graph Valid Tree': 'https://youtu.be/bXsUuownnoQ',
  'Number of Connected Components in an Undirected Graph': 'https://youtu.be/8f1XPm4WOUc',
  'Insert Interval': 'https://youtu.be/A8NUOmlwOlM',
  'Merge Intervals': 'https://youtu.be/44H3cEC2fFM',
  'Non-overlapping Intervals': 'https://youtu.be/nONCGxWoUfM',
  'Meeting Rooms': 'https://youtu.be/PaJxqZVPhbg',
  'Meeting Rooms II': 'https://youtu.be/FdzJmTCVyJU',
  'Reverse Linked List': 'https://youtu.be/G0_I-ZF0S38',
  'Reverse a Linked List': 'https://youtu.be/G0_I-ZF0S38',
  'Linked List Cycle': 'https://youtu.be/gBTe7lFR3vc',
  'Detect Cycle in a Linked List': 'https://youtu.be/gBTe7lFR3vc',
  'Merge Two Sorted Lists': 'https://youtu.be/XIdigk956u0',
  'Merge K Sorted Lists': 'https://youtu.be/q5a5OiGbT6Q',
  'Remove Nth Node From End of List': 'https://youtu.be/XVuQxVej6y8',
  'Remove Nth Node From End Of List': 'https://youtu.be/XVuQxVej6y8',
  'Reorder List': 'https://youtu.be/S5bfdUTrKLM',
  'Set Matrix Zeroes': 'https://youtu.be/T41rL0L3Pnw',
  'Spiral Matrix': 'https://youtu.be/BJnMZNwUk1M',
  'Rotate Image': 'https://youtu.be/fMSJSS7eO1w',
  'Word Search': 'https://youtu.be/pfiQ_PS1g8E',
  'Longest Substring Without Repeating Characters': 'https://youtu.be/wiGpQwVHdE0',
  'Longest Repeating Character Replacement': 'https://youtu.be/gqXU1UyA8pk',
  'Minimum Window Substring': 'https://youtu.be/jSto0O4AJbM',
  'Valid Anagram': 'https://youtu.be/9UtInBqnCgA',
  'Group Anagrams': 'https://youtu.be/vzdNOK2oB2E',
  'Valid Parentheses': 'https://youtu.be/WTzjTskDFMg',
  'Valid Palindrome': 'https://youtu.be/jJXJ16kPFWg',
  'Longest Palindromic Substring': 'https://youtu.be/XYQecbcd6_c',
  'Palindromic Substrings': 'https://youtu.be/4RACzI5-du8',
  'Encode and Decode Strings': 'https://youtu.be/B1k_sxOSgv8',
  'Maximum Depth of Binary Tree': 'https://youtu.be/hTM3phVI6YQ',
  'Same Tree': 'https://youtu.be/vRbbcKXCxOw',
  'Invert Binary Tree': 'https://youtu.be/OnSn2XEQ4MY',
  'Invert/Flip Binary Tree': 'https://youtu.be/OnSn2XEQ4MY',
  'Binary Tree Maximum Path Sum': 'https://youtu.be/Hr5cWUld4vU',
  'Binary Tree Level Order Traversal': 'https://youtu.be/6ZnyEApgFYg',
  'Serialize and Deserialize Binary Tree': 'https://youtu.be/u4JAi2JJhI8',
  'Subtree of Another Tree': 'https://youtu.be/E36O5SWp-LE',
  'Construct Binary Tree from Preorder and Inorder Traversal': 'https://youtu.be/ihj4IQGZ2zc',
  'Validate Binary Search Tree': 'https://youtu.be/s6ATEkipzow',
  'Kth Smallest Element in a BST': 'https://youtu.be/5LUXSvjmGCw',
  'Lowest Common Ancestor of a Binary Search Tree': 'https://youtu.be/gs2LMfuOR9k',
  'Lowest Common Ancestor of BST': 'https://youtu.be/gs2LMfuOR9k',
  'Implement Trie (Prefix Tree)': 'https://youtu.be/oobqoCJlHA0',
  'Implement Trie': 'https://youtu.be/oobqoCJlHA0',
  'Design Add and Search Words Data Structure': 'https://youtu.be/BTf05gs_8iU',
  'Add and Search Word': 'https://youtu.be/BTf05gs_8iU',
  'Word Search II': 'https://youtu.be/asbcE9mZz_U',
  'Top K Frequent Elements': 'https://youtu.be/YPTqKIgVk-k',
  'Find Median from Data Stream': 'https://youtu.be/itmhHWaHupI',
};

// Get NeetCode video URL - uses mapping first, falls back to generated URL
const getNeetCodeUrl = (title: string): string => {
  // Check direct match first
  if (NEETCODE_VIDEO_URLS[title]) {
    return NEETCODE_VIDEO_URLS[title];
  }
  
  // Try normalized match (case-insensitive)
  const normalizedTitle = title.toLowerCase().trim();
  for (const [key, url] of Object.entries(NEETCODE_VIDEO_URLS)) {
    if (key.toLowerCase().trim() === normalizedTitle) {
      return url;
    }
  }
  
  // Fallback to generated URL
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
  return `https://neetcode.io/problems/${slug}`;
};

interface WalkieTalkieViewProps {
  onHome: (force: boolean) => void;
  onSaveReport: (title: string, type: 'walkie' | 'teach' | 'readiness', report: PerformanceReport) => void;
  masteredIds: string[];
  onMastered: (id: string) => void;
  isSaved: (title: string, content: string) => boolean;
  onToggleSave: (item: Omit<SavedItem, 'id' | 'date'>) => void;
  savedReports: SavedReport[];
}

// Helper to get date string in YYYY-MM-DD format (LOCAL timezone)
const getDateString = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  // Use local timezone instead of UTC
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper to count questions solved per day from saved reports
const countQuestionsByDate = (reports: SavedReport[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  
  // Only count walkie and teach reports that were "mastered"
  // Walkie: detectedAutoScore === 'good'
  // Teach: studentOutcome === 'can_implement' AND teachingScore >= 75
  const relevantReports = reports.filter(r => {
    if (r.type === 'walkie') {
      return r.reportData?.detectedAutoScore === 'good';
    }
    if (r.type === 'teach') {
      const teachingData = r.reportData?.teachingReportData;
      return teachingData?.studentOutcome === 'can_implement' && (teachingData?.teachingScore ?? 0) >= 75;
    }
    return false;
  });
  
  for (const report of relevantReports) {
    const dateStr = getDateString(report.date);
    counts[dateStr] = (counts[dateStr] || 0) + 1;
  }
  
  return counts;
};

// Get last N days of stats
interface DailyStats {
  date: string;
  displayDate: string;
  count: number;
  isToday: boolean;
}

const getDailyStats = (reports: SavedReport[], days: number = 7): DailyStats[] => {
  const counts = countQuestionsByDate(reports);
  const today = new Date();
  const stats: DailyStats[] = [];
  
  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = getDateString(date);
    const isToday = i === 0;
    
    stats.push({
      date: dateStr,
      displayDate: isToday ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      count: counts[dateStr] || 0,
      isToday
    });
  }
  
  return stats;
};

// 3 REAL WORLD LOCATIONS - Two with specific topics, one random (mystery)
const POWER_SPOTS = [
  { 
    id: 'spot1', 
    name: 'The Mysterious Forest', 
    ritual: 'Adventure', 
    icon: 'forest', 
    description: 'Venture into the unknown with mixed challenges.',
    isRandom: true
  },
  { 
    id: 'spot2', 
    name: 'The Coffee Sanctuary', 
    ritual: 'Deep Focus', 
    icon: 'coffee', 
    description: 'A warm brew and focused topic practice.',
    isRandom: false
  },
  { 
    id: 'spot3', 
    name: 'The Daily Commute', 
    ritual: 'Transit', 
    icon: 'train', 
    description: 'Quick-fire problem solving on the move.',
    isRandom: false
  }
];

// Type for spot with assigned topic
interface SpotWithTopic {
  id: string;
  name: string;
  ritual: string;
  icon: string;
  description: string;
  topic: string;  // The problem_group name (or 'random' for mystery spot)
  topicDisplay: string;  // Formatted display name
  remaining: number;  // Problems not mastered in this topic (or total remaining for random)
  isRandom: boolean;  // Whether this spot uses random/mixed topics
  locked: boolean;  // Whether the topic is locked (user has entered this spot today)
}

// Type for saved spot topic assignments (persisted per day)
// Only spots that have been "entered" are saved/locked
interface SavedSpotAssignment {
  spotId: string;
  topic: string;
  topicDisplay: string;
  locked: boolean;  // true = user has entered this spot, topic is frozen for the day
}

interface SavedDayAssignments {
  date: string;  // YYYY-MM-DD format
  assignments: SavedSpotAssignment[];
}

// Helper to get/save today's locked spot topic assignments from localStorage
const SPOT_ASSIGNMENTS_KEY = 'walkie_talkie_spot_assignments';

const getLockedSpotAssignments = (userId: string): SavedDayAssignments | null => {
  try {
    const key = `${SPOT_ASSIGNMENTS_KEY}_${userId}`;
    const saved = localStorage.getItem(key);
    if (!saved) return null;
    
    const parsed: SavedDayAssignments = JSON.parse(saved);
    const todayStr = getDateString(new Date());
    
    // Only return if the saved assignments are from today
    if (parsed.date === todayStr) {
      return parsed;
    }
    return null;
  } catch (error) {
    console.error('Error loading saved spot assignments:', error);
    return null;
  }
};

const lockSpotAssignment = (userId: string, spotId: string, topic: string, topicDisplay: string) => {
  try {
    const key = `${SPOT_ASSIGNMENTS_KEY}_${userId}`;
    const todayStr = getDateString(new Date());
    
    // Get existing locked assignments
    const existing = getLockedSpotAssignments(userId);
    const existingAssignments = existing?.assignments || [];
    
    // Check if this spot is already locked
    const alreadyLocked = existingAssignments.find(a => a.spotId === spotId && a.locked);
    if (alreadyLocked) return; // Already locked, don't update
    
    // Add/update this spot as locked
    const updatedAssignments = existingAssignments.filter(a => a.spotId !== spotId);
    updatedAssignments.push({
      spotId,
      topic,
      topicDisplay,
      locked: true
    });
    
    const data: SavedDayAssignments = {
      date: todayStr,
      assignments: updatedAssignments
    };
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error('Error locking spot assignment:', error);
  }
};

const WalkieTalkieView: React.FC<WalkieTalkieViewProps> = ({ onHome, onSaveReport, masteredIds, onMastered, isSaved, onToggleSave, savedReports }) => {
  // Get auth context for user ID
  const { user } = useAuth();
  
  // Get navigation state for "Teach Again" functionality
  const location = useLocation();
  const teachAgainProblem = (location.state as { teachAgainProblem?: string } | null)?.teachAgainProblem;

  // Step types now include paired repetition flow steps
  type StepType = 'locations' | 'curating' | 'problem' | 'recording' | 'analyzing' | 'reveal'
    // Paired flow: Explain → Readiness → Teach
    | 'readiness_evaluating' | 'readiness_reveal'
    // Teaching mode steps
    | 'teaching' | 'junior_thinking' | 'junior_question' | 'junior_summarizing' | 'dean_evaluating' | 'teaching_reveal';
  
  const [step, setStep] = useState<StepType>('locations');
  const [analysisPhase, setAnalysisPhase] = useState<'refining' | 'evaluating'>('refining');
  const [selectedSpot, setSelectedSpot] = useState<typeof POWER_SPOTS[0] | null>(null);
  const [showStats, setShowStats] = useState(false);
  
  // Spaced Repetition Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [studySettings, setStudySettings] = useState<UserStudySettings | null>(null);
  const [studyStats, setStudyStats] = useState<StudyStats | null>(null);
  const [settingsForm, setSettingsForm] = useState({
    targetDays: DEFAULT_SETTINGS.targetDays,
    dailyCap: DEFAULT_SETTINGS.dailyCap
  });
  const [useSpacedRepetition, setUseSpacedRepetition] = useState(true);
  
  // Spot topic assignments - each spot gets a random topic
  const [spotsWithTopics, setSpotsWithTopics] = useState<SpotWithTopic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [isLoadingSpots, setIsLoadingSpots] = useState(true);
  
  // Store progress grid for refresh functionality
  const [progressGridData, setProgressGridData] = useState<Awaited<ReturnType<typeof getProgressGrid>>>([]);
  
  // Helper function to assign random topics to unlocked spots
  const assignTopicsToSpots = (
    progressGrid: Awaited<ReturnType<typeof getProgressGrid>>,
    lockedAssignments: SavedSpotAssignment[]
  ): SpotWithTopic[] => {
    const topicsWithRemaining = progressGrid.filter(g => g.masteredCount < g.totalCount);
    const totalRemaining = topicsWithRemaining.reduce(
      (sum, g) => sum + (g.totalCount - g.masteredCount), 0
    );
    
    // Get topics that are already locked (to avoid assigning same topic to unlocked spots)
    const lockedTopics = lockedAssignments.map(a => a.topic);
    
    // Filter out locked topics from available topics for unlocked spots
    const availableTopics = topicsWithRemaining.filter(t => !lockedTopics.includes(t.groupName));
    const shuffledTopics = [...availableTopics].sort(() => Math.random() - 0.5);
    
    let topicIdx = 0;
    
    return POWER_SPOTS.map((spot) => {
      // Handle random/mystery spot
      if (spot.isRandom) {
        return {
          ...spot,
          topic: 'random',
          topicDisplay: 'Mixed Topics',
          remaining: totalRemaining,
          isRandom: true,
          locked: false
        };
      }
      
      // Check if this spot is locked
      const lockedAssignment = lockedAssignments.find(a => a.spotId === spot.id && a.locked);
      
      if (lockedAssignment) {
        // Use the locked topic
        const topicGroup = progressGrid.find(g => g.groupName === lockedAssignment.topic);
        const remaining = topicGroup 
          ? topicGroup.totalCount - topicGroup.masteredCount 
          : 0;
        
        return {
          ...spot,
          topic: lockedAssignment.topic,
          topicDisplay: lockedAssignment.topicDisplay,
          remaining,
          isRandom: false,
          locked: true
        };
      }
      
      // Unlocked spot - assign a random topic
      const topicGroup = shuffledTopics[topicIdx % Math.max(shuffledTopics.length, 1)] 
        || topicsWithRemaining[topicIdx % Math.max(topicsWithRemaining.length, 1)];
      topicIdx++;
      
      if (topicGroup) {
        return {
          ...spot,
          topic: topicGroup.groupName,
          topicDisplay: topicGroup.groupName,
          remaining: topicGroup.totalCount - topicGroup.masteredCount,
          isRandom: false,
          locked: false
        };
      } else {
        return {
          ...spot,
          topic: 'all_mastered',
          topicDisplay: 'All Mastered!',
          remaining: 0,
          isRandom: false,
          locked: false
        };
      }
    });
  };
  
  // Refresh a single unlocked spot with a new random topic
  const handleRefreshSingleSpot = (spotId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the spot click
    if (!user?.id || progressGridData.length === 0) return;
    
    const topicsWithRemaining = progressGridData.filter(g => g.masteredCount < g.totalCount);
    
    // Get topics that are already used by other spots (to avoid duplicates)
    const usedTopics = spotsWithTopics
      .filter(s => s.id !== spotId && !s.isRandom)
      .map(s => s.topic);
    
    // Filter out used topics
    const availableTopics = topicsWithRemaining.filter(t => !usedTopics.includes(t.groupName));
    
    if (availableTopics.length === 0) return;
    
    // Pick a random topic from available ones
    const randomTopic = availableTopics[Math.floor(Math.random() * availableTopics.length)];
    
    // Update just this spot
    setSpotsWithTopics(prev => prev.map(spot => {
      if (spot.id === spotId) {
        return {
          ...spot,
          topic: randomTopic.groupName,
          topicDisplay: randomTopic.groupName,
          remaining: randomTopic.totalCount - randomTopic.masteredCount
        };
      }
      return spot;
    }));
  };
  
  // Load settings and assign topics to spots on mount
  useEffect(() => {
    if (!user?.id) return;
    
    const loadSettingsAndTopics = async () => {
      setIsLoadingSpots(true);
      try {
        // Load settings
        const settings = await getSettingsWithDefaults(user.id);
        setStudySettings(settings);
        setSettingsForm({
          targetDays: settings.targetDays,
          dailyCap: settings.dailyCap
        });
        
        // Load progress grid to get topics with remaining problems
        const progressGrid = await getProgressGrid(user.id);
        setProgressGridData(progressGrid);
        
        // Get locked assignments from today
        const lockedAssignments = getLockedSpotAssignments(user.id);
        const lockedOnly = lockedAssignments?.assignments.filter(a => a.locked) || [];
        
        // Assign topics: locked spots keep their topics, unlocked spots get random topics
        const assignedSpots = assignTopicsToSpots(progressGrid, lockedOnly);
        
        setSpotsWithTopics(assignedSpots);
      } catch (error) {
        console.error('Error loading spots with topics:', error);
      } finally {
        setIsLoadingSpots(false);
      }
    };
    
    loadSettingsAndTopics();
  }, [user?.id]);
  
  // Save settings handler
  const handleSaveSettings = async () => {
    if (!user?.id) return;
    
    const updated = await updateSettings(user.id, {
      targetDays: settingsForm.targetDays,
      dailyCap: settingsForm.dailyCap
    });
    
    if (updated) {
      setStudySettings(updated);
    }
    setShowSettings(false);
  };
  
  // Session Mode State - Paired (Explain → Teach) is the default for best learning
  const [sessionMode, setSessionMode] = useState<SessionMode>('paired');
  
  // Difficulty Mode State
  const [difficultyMode, setDifficultyMode] = useState<DifficultyMode>('standard');
  
  // Session State
  const [problemQueue, setProblemQueue] = useState<BlindProblem[]>([]);
  const [currentQueueIdx, setCurrentQueueIdx] = useState(0);
  const [sessionScore, setSessionScore] = useState(0); // How many cleared in THIS visit

  // Daily & Lifetime Stats - computed from saved reports
  const dailyStats = useMemo(() => getDailyStats(savedReports, 7), [savedReports]);
  const dailyCleared = useMemo(() => {
    const todayStr = getDateString(new Date());
    const counts = countQuestionsByDate(savedReports);
    return counts[todayStr] || 0;
  }, [savedReports]);
  
  // Session-local counter for immediate feedback (before reports are saved)
  const [sessionCleared, setSessionCleared] = useState(0);
  
  const totalConquered = useMemo(() => {
    // Count all mastered questions from saved reports (uses same logic as countQuestionsByDate)
    const counts = countQuestionsByDate(savedReports);
    return Object.values(counts).reduce((sum, count) => sum + count, 0);
  }, [savedReports]);

  // Analysis State (Explain mode)
  const [transcript, setTranscript] = useState("");
  const [rawTranscript, setRawTranscript] = useState("");
  const [aiReport, setAiReport] = useState<PerformanceReport | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [revealHintIdx, setRevealHintIdx] = useState(0);
  const [usedHints, setUsedHints] = useState(false); // Track if user requested any hints

  // Teaching Mode State
  const [teachingSession, setTeachingSession] = useState<TeachingSession | null>(null);
  const [juniorQuestion, setJuniorQuestion] = useState<string>("");
  const [teachingReport, setTeachingReport] = useState<TeachingReport | null>(null);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [isTeachingRecording, setIsTeachingRecording] = useState(false);
  const [teachingRawTranscript, setTeachingRawTranscript] = useState("");

  // Paired Flow State - Readiness to Teach (Pass 1)
  const [readinessReport, setReadinessReport] = useState<ReadinessReport | null>(null);
  const [explainTranscript, setExplainTranscript] = useState<string>("");

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  // Time tracking - track when the current attempt started
  const problemStartTimeRef = useRef<number>(Date.now());
  
  // Helper to get elapsed time in seconds for current attempt
  const getElapsedSeconds = (): number => {
    return Math.round((Date.now() - problemStartTimeRef.current) / 1000);
  };
  
  // Helper to reset the timer (call when starting any new attempt)
  const resetProblemStartTime = () => {
    problemStartTimeRef.current = Date.now();
  };

  const currentProblem = problemQueue[currentQueueIdx];

  // Global progress (Hidden)
  const globalProgress = useMemo(() => {
    return Math.round((masteredIds.length / 75) * 100);
  }, [masteredIds]);

  // Current Pass Calculation (e.g., if you've done 80 problems, you're on your 2nd pass)
  const masteryCycle = useMemo(() => {
    return Math.floor(totalConquered / 75) + 1;
  }, [totalConquered]);

  useEffect(() => {
    return () => { 
      if (recognitionRef.current) recognitionRef.current.stop();
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
    };
  }, []);

  // Handle "Teach Again" navigation from saved reports
  useEffect(() => {
    if (!teachAgainProblem) return;

    const loadProblemAndStartTeaching = async () => {
      setStep('curating');
      
      const problem = await fetchBlindProblemByTitle(teachAgainProblem);
      
      if (problem) {
        // Set up the problem queue with just this one problem
        setProblemQueue([problem]);
        setCurrentQueueIdx(0);
        setSessionMode('teach'); // Go directly to teach mode
        
        // Initialize teaching session
        const session = createTeachingSession(problem.id);
        setTeachingSession(session);
        
        // Reset other state
        setReadinessReport(null);
        setExplainTranscript("");
        setTeachingReport(null);
        setTeachingRawTranscript("");
        setJuniorQuestion("");
        setRevealHintIdx(0);
        setUsedHints(false);
        
        // Reset timer for this problem
        resetProblemStartTime();
        
        // Start teaching
        setStep('teaching');
      } else {
        // Problem not found, go back to locations
        console.error('Could not find problem:', teachAgainProblem);
        setStep('locations');
      }
      
      // Clear the navigation state to prevent re-triggering
      window.history.replaceState({}, document.title);
    };

    loadProblemAndStartTeaching();
  }, [teachAgainProblem]);

  const handleStartRecording = async () => {
    setTranscript("");
    setRawTranscript("");
    setAiReport(null);
    setIsRecording(true);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      mediaRecorderRef.current.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      mediaRecorderRef.current.start();
    } catch (e) { console.error("Mic access failed", e); }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.onresult = (event: any) => {
        let current = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) current += event.results[i][0].transcript;
        }
        if (current) setRawTranscript(prev => prev + " " + current);
      };
      recognitionRef.current.start();
    }
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    if (recognitionRef.current) recognitionRef.current.stop();
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = async () => {
        // For paired mode, evaluate readiness to teach first
        if (sessionMode === 'paired') {
          // Show loading state immediately while processing
          setStep('readiness_evaluating');
          
          try {
            if (currentProblem) {
              // Skip refinement - send raw transcript directly to preserve all content
              // The evaluation prompt handles transcription errors gracefully
              setExplainTranscript(rawTranscript);
              setTranscript(rawTranscript);
              
              // HINT PENALTY: If user used hints, they are automatically "not ready"
              // A teacher should be able to explain the solution without referring to hints
              if (usedHints) {
                const hintPenaltyReport: ReadinessReport = {
                  readinessScore: 40,
                  isReadyToTeach: false,
                  checklist: {
                    coreInsight: {
                      present: false,
                      quality: 'vague',
                      feedback: 'You used hints during this section. Try to internalize the core insight before teaching.'
                    },
                    stateDefinition: {
                      present: false,
                      quality: 'hand-wavy',
                      feedback: 'Hints were referenced. Practice explaining the state definition from memory.'
                    },
                    exampleWalkthrough: {
                      present: false,
                      quality: 'abstract',
                      feedback: 'Work through examples without hints to build confidence.'
                    },
                    edgeCases: {
                      mentioned: [],
                      missing: ['All edge cases - hints were used'],
                      feedback: 'Review edge cases without hints to solidify understanding.'
                    },
                    complexity: {
                      timeMentioned: false,
                      timeCorrect: false,
                      spaceMentioned: false,
                      spaceCorrect: false,
                      feedback: 'Practice complexity analysis without referring to hints.'
                    }
                  },
                  missingElements: [
                    'You used hints during this explanation',
                    'Teachers should explain without external references',
                    'Try again without revealing any hints'
                  ],
                  strengthElements: [],
                  suggestion: 'Go back and explain the solution without using any hints. A strong teacher can explain the concept from memory.'
                };
                setReadinessReport(hintPenaltyReport);
                
                // Save hint penalty readiness report
                const hintPenaltyPerformanceReport: PerformanceReport = {
                  rating: hintPenaltyReport.readinessScore,
                  summary: hintPenaltyReport.suggestion,
                  suggestions: [],
                  pronunciationFeedback: [],
                  readinessReportData: hintPenaltyReport,
                  readinessProblem: currentProblem,
                  rawTranscript: rawTranscript,
                  refinedTranscript: rawTranscript,
                  timeSpentSeconds: getElapsedSeconds()
                };
                onSaveReport(currentProblem.title, 'readiness', hintPenaltyPerformanceReport);
                
                setStep('readiness_reveal');
                return;
              }
              
              // No hints used - proceed with AI evaluation (loading state already shown)
              const readiness = await evaluateReadinessToTeach(currentProblem, rawTranscript);
              setReadinessReport(readiness);
              setExplainTranscript(rawTranscript);
              
              // Save readiness report to My Performance
              const readinessPerformanceReport: PerformanceReport = {
                rating: readiness.readinessScore,
                summary: readiness.suggestion,
                suggestions: [],
                pronunciationFeedback: [],
                readinessReportData: readiness,
                readinessProblem: currentProblem,
                rawTranscript: rawTranscript,
                refinedTranscript: rawTranscript,
                timeSpentSeconds: getElapsedSeconds()
              };
              onSaveReport(currentProblem.title, 'readiness', readinessPerformanceReport);
              
              setStep('readiness_reveal');
            }
          } catch (e) {
            console.error("Readiness evaluation failed", e);
            setStep('problem');
          }
          return;
        }
        
        // Standard explain mode - full analysis
        setStep('analyzing');
        setAnalysisPhase('refining');
        
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mp3' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          try {
            if (currentProblem) {
              const polishedText = await refineTranscript(rawTranscript, `Solving coding problem: ${currentProblem.title}`);
              setTranscript(polishedText);
              setAnalysisPhase('evaluating');
              const report = await analyzeWalkieSession(base64Audio, polishedText, currentProblem);
              
              // Determine mastery based on rating (source of truth)
              // The AI's detectedAutoScore can be inconsistent, so we use rating thresholds
              // HINT PENALTY: If user used hints, they cannot achieve 'good' (mastered) status
              let score: 'good' | 'partial' | 'missed' = 
                report.rating >= 75 ? 'good' : 
                report.rating >= 50 ? 'partial' : 
                'missed';
              
              // Apply hint penalty - max score is 'partial' if hints were used
              if (usedHints && score === 'good') {
                score = 'partial';
              }
              report.detectedAutoScore = score;
              report.timeSpentSeconds = getElapsedSeconds();
              
              setAiReport(report);

              // Auto-Save and Auto-Update Stats
              onSaveReport(currentProblem.title, 'walkie', report);
              
              // Update spaced repetition progress
              if (useSpacedRepetition && user?.id) {
                  const existingProgress = await fetchUserProgressByTitle(user.id, currentProblem.title);
                  await updateProgressAfterAttempt(
                      user.id,
                      currentProblem.title,
                      report.rating,
                      currentProblem.difficulty,
                      existingProgress
                  );
              }
              
              if (score === 'good') {
                  onMastered(currentProblem.title);
                  setSessionScore(prev => prev + 1);
                  setSessionCleared(prev => prev + 1);
              }

              setStep('reveal');
            }
          } catch (e) {
            console.error("AI Analysis failed", e);
            setStep('reveal');
          }
        };
        reader.readAsDataURL(audioBlob);
      };
      mediaRecorderRef.current.stop();
    }
  };

  const handleContinue = () => {
    if (!aiReport) return;
    const score = aiReport.detectedAutoScore || 'partial';

    if (score !== 'good') {
      const remainingQueue = [...problemQueue];
      remainingQueue.push(currentProblem);
      setProblemQueue(remainingQueue);
    }

    if (currentQueueIdx < problemQueue.length - 1) {
      setCurrentQueueIdx(prev => prev + 1);
      setStep('problem');
      setRevealHintIdx(0);
      setUsedHints(false); // Reset hint usage for next problem
      setTranscript("");
      setRawTranscript("");
    } else {
      setStep('locations');
    }
  };

  const startSpotSession = async (spot: SpotWithTopic) => {
    // Set the selected topic for this session
    setSelectedTopic(spot.topic);
    setSelectedSpot(spot);
    setStep('curating');
    
    // Lock this spot's topic for the rest of the day (unless it's the random/mystery spot)
    if (!spot.isRandom && user?.id) {
      lockSpotAssignment(user.id, spot.id, spot.topic, spot.topicDisplay);
      
      // Update local state to reflect the lock
      setSpotsWithTopics(prev => prev.map(s => 
        s.id === spot.id ? { ...s, locked: true } : s
      ));
    }
    
    try {
        let problems: BlindProblem[] = [];
        
        // Calculate remaining problems for today's goal
        const dailyGoal = studySettings?.dailyCap || DEFAULT_SETTINGS.dailyCap;
        const completedToday = dailyCleared + sessionCleared;
        const remainingToday = Math.max(0, dailyGoal - completedToday);
        
        // Cap batch size at remaining daily goal or a reasonable max
        const batchSize = Math.min(remainingToday, 10);
        
        if (batchSize === 0) {
            console.log('[Session] Daily goal already reached!');
            setStep('locations');
            return;
        }
        
        // Use spaced repetition queue if enabled and user is logged in
        if (useSpacedRepetition && user?.id) {
            // For random/mystery spot, don't pass a topic filter - get mixed problems
            const topicFilter = spot.isRandom ? undefined : spot.topic;
            const { queue, stats } = await buildSpacedRepetitionQueue(user.id, topicFilter);
            problems = queue.slice(0, batchSize);
            setStudyStats(stats);
            console.log(`[Spaced Repetition] Topic: ${spot.isRandom ? 'RANDOM/MIXED' : spot.topic}, Queue:`, problems.map(p => p.title));
        } else {
            // Fallback to original queue building (no topic filter)
            const allowedDifficulties = DIFFICULTY_MAP[difficultyMode];
            problems = await buildProblemQueue(masteredIds, allowedDifficulties, batchSize);
        }
        
        if (problems.length === 0) {
            console.warn("No problems found for queue in topic:", spot.topic);
            // Fallback: try fetching without topic filter
            const allowedDifficulties = DIFFICULTY_MAP[difficultyMode];
            const fallbackProblems = await buildProblemQueue([], allowedDifficulties, batchSize);
            if (fallbackProblems.length === 0) {
                console.error("No problems available in database");
                setStep('locations');
                return;
            }
            problems = fallbackProblems;
        }
        
        setProblemQueue(problems);
        setCurrentQueueIdx(0);
        setSessionScore(0);
        
        // Reset state for new session
        setReadinessReport(null);
        setExplainTranscript("");
        setTeachingSession(null);
        setTeachingReport(null);
        setRevealHintIdx(0);
        setUsedHints(false);
        setTranscript("");
        setRawTranscript("");
        
        // Reset timer when starting a new problem
        resetProblemStartTime();
        
        // Initialize based on session mode
        if (sessionMode === 'teach') {
            // Direct teach mode - skip explain step
            const firstProblem = problems.length > 0 ? problems[0] : null;
            if (firstProblem) {
                setTeachingSession(createTeachingSession(firstProblem.id));
                setJuniorQuestion("");
                setTeachingRawTranscript("");
            }
            setStep('teaching');
        } else {
            // Paired mode or Explain mode - start with problem/explain step
            setStep('problem');
        }
    } catch (e) {
        console.error("Curating failed", e);
        setStep('locations');
    }
  };

  // Handler for continuing from readiness reveal to teaching (paired mode)
  const handleContinueToTeach = () => {
    if (!currentProblem) return;
    
    // Initialize teaching session for the SAME problem
    setTeachingSession(createTeachingSession(currentProblem.id));
    setJuniorQuestion("");
    setTeachingReport(null);
    setTeachingRawTranscript("");
    setStep('teaching');
  };

  // Handler for trying again (re-explain before teaching)
  const handleTryExplainAgain = () => {
    setReadinessReport(null);
    setExplainTranscript("");
    setRawTranscript("");
    setTranscript("");
    // Reset hints - user should try without hints this time
    setRevealHintIdx(0);
    setUsedHints(false);
    // Reset timer for fresh attempt
    resetProblemStartTime();
    setStep('problem');
  };

  // Teaching Mode Handlers
  const handleStartTeachingRecording = async () => {
    setTeachingRawTranscript("");
    setIsTeachingRecording(true);
    stopSpeaking(); // Stop any TTS in progress

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.onresult = (event: any) => {
        let current = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) current += event.results[i][0].transcript;
        }
        if (current) setTeachingRawTranscript(prev => prev + " " + current);
      };
      recognitionRef.current.start();
    }
  };

  const handleStopTeachingRecording = async () => {
    setIsTeachingRecording(false);
    if (recognitionRef.current) recognitionRef.current.stop();
    
    if (!teachingRawTranscript.trim() || !currentProblem || !teachingSession) return;
    
    setStep('junior_thinking');
    
    try {
      // Skip refinement - send raw transcript directly to preserve ALL content
      // The Junior Engineer prompt handles transcription errors gracefully
      // This prevents the AI refiner from accidentally removing example traces
      const updatedSession = addTurn(teachingSession, 'teacher', teachingRawTranscript, teachingRawTranscript);
      setTeachingSession(updatedSession);
      
      // Get junior's response
      const { response, newState, isComplete } = await getJuniorResponse(
        currentProblem,
        updatedSession.turns,
        updatedSession.juniorState
      );
      
      // Add junior's response to session
      const sessionWithJunior = addTurn(
        updateJuniorState(updatedSession, newState),
        'junior',
        response
      );
      setTeachingSession(sessionWithJunior);
      setJuniorQuestion(response);
      
      if (isComplete || newState.readyToSummarize) {
        // Junior is ready to summarize
        setStep('junior_summarizing');
        const summary = await getJuniorSummary(currentProblem, sessionWithJunior.turns);
        const finalSession = setJuniorSummary(sessionWithJunior, summary);
        setTeachingSession(finalSession);
        
        // Now have Dean evaluate
        setStep('dean_evaluating');
        const report = await evaluateTeaching(currentProblem, finalSession);
        setTeachingReport(report);
        
        // Save the teaching report as a PerformanceReport-compatible format
        // Include full teaching report data for proper viewing later
        const performanceReport: PerformanceReport = {
          rating: report.teachingScore,
          summary: `Teaching evaluation: ${report.studentOutcome === 'can_implement' ? 'Student can implement' : report.studentOutcome === 'conceptual_only' ? 'Conceptual understanding only' : 'Student still confused'}`,
          suggestions: report.topGaps,
          pronunciationFeedback: [],
          detailedFeedback: report.evidenceNotes.map((note, idx) => ({
            category: 'Teaching',
            issue: note,
            instance: '',
            rewrite: idx === 0 ? report.concreteImprovement : '',
            explanation: ''
          })),
          teachingReportData: report,
          teachingSession: updatedSession,  // Include the full dialog
          juniorSummary: finalSession.juniorSummary,
          teachingProblem: currentProblem,  // Include problem for model answer display
          timeSpentSeconds: getElapsedSeconds()
        };
        onSaveReport(currentProblem.title, 'teach', performanceReport);
        
        // Update spaced repetition progress (use teaching score as rating)
        if (useSpacedRepetition && user?.id) {
          const existingProgress = await fetchUserProgressByTitle(user.id, currentProblem.title);
          await updateProgressAfterAttempt(
            user.id,
            currentProblem.title,
            report.teachingScore,
            currentProblem.difficulty,
            existingProgress
          );
        }
        
        // Mark as mastered if student can implement AND teaching score >= 75
        // This ensures both good outcome AND quality teaching
        if (report.studentOutcome === 'can_implement' && report.teachingScore >= 75) {
          onMastered(currentProblem.title);
          setSessionScore(prev => prev + 1);
          setSessionCleared(prev => prev + 1);
        }
        
        setStep('teaching_reveal');
      } else {
        // Continue teaching
        setStep('junior_question');
        
        // Optionally speak the question
        if (ttsEnabled) {
          speakJuniorResponse(response);
        }
      }
    } catch (e) {
      console.error("Teaching response failed", e);
      setStep('teaching');
    }
    
    setTeachingRawTranscript("");
  };

  const handleEndTeachingSession = async () => {
    if (!currentProblem || !teachingSession) return;
    
    setStep('junior_summarizing');
    
    try {
      // Generate junior's summary even if not "ready"
      const summary = await getJuniorSummary(currentProblem, teachingSession.turns);
      const finalSession = setJuniorSummary(teachingSession, summary);
      setTeachingSession(finalSession);
      
      // Have Dean evaluate
      setStep('dean_evaluating');
      const report = await evaluateTeaching(currentProblem, finalSession);
      setTeachingReport(report);
      
      // Save the teaching report as a PerformanceReport-compatible format
      // Include full teaching report data for proper viewing later
      const performanceReport: PerformanceReport = {
        rating: report.teachingScore,
        summary: `Teaching evaluation: ${report.studentOutcome === 'can_implement' ? 'Student can implement' : report.studentOutcome === 'conceptual_only' ? 'Conceptual understanding only' : 'Student still confused'}`,
        suggestions: report.topGaps,
        pronunciationFeedback: [],
        detailedFeedback: report.evidenceNotes.map((note, idx) => ({
          category: 'Teaching',
          issue: note,
          instance: '',
          rewrite: idx === 0 ? report.concreteImprovement : '',
          explanation: ''
        })),
        teachingReportData: report,
        teachingSession: finalSession,  // Include the full dialog
        juniorSummary: finalSession.juniorSummary,
        teachingProblem: currentProblem,  // Include problem for model answer display
        timeSpentSeconds: getElapsedSeconds()
      };
      onSaveReport(currentProblem.title, 'teach', performanceReport);
      
      // Update spaced repetition progress (use teaching score as rating)
      if (useSpacedRepetition && user?.id) {
        const existingProgress = await fetchUserProgressByTitle(user.id, currentProblem.title);
        await updateProgressAfterAttempt(
          user.id,
          currentProblem.title,
          report.teachingScore,
          currentProblem.difficulty,
          existingProgress
        );
      }
      
      // Mark as mastered if student can implement AND teaching score >= 75
      // This ensures both good outcome AND quality teaching
      if (report.studentOutcome === 'can_implement' && report.teachingScore >= 75) {
        onMastered(currentProblem.title);
        setSessionScore(prev => prev + 1);
        setSessionCleared(prev => prev + 1);
      }
      
      setStep('teaching_reveal');
    } catch (e) {
      console.error("End teaching session failed", e);
      setStep('locations');
    }
  };

  const handleTeachingContinue = () => {
    // Move to next problem or back to locations
    if (currentQueueIdx < problemQueue.length - 1) {
      const nextIdx = currentQueueIdx + 1;
      setCurrentQueueIdx(nextIdx);
      
      // Reset state for next problem
      setReadinessReport(null);
      setExplainTranscript("");
      setTeachingSession(null);
      setTeachingReport(null);
      setTeachingRawTranscript("");
      setJuniorQuestion("");
      setRevealHintIdx(0);
      setUsedHints(false);
      setTranscript("");
      setRawTranscript("");
      
      // Reset timer for the new problem
      resetProblemStartTime();
      
      if (sessionMode === 'paired') {
        // Paired mode: go back to explain step for next problem
        setStep('problem');
      } else {
        // Direct teach mode: go straight to teaching
        const nextProblem = problemQueue[nextIdx];
        setTeachingSession(createTeachingSession(nextProblem.id));
        setStep('teaching');
      }
    } else {
      setStep('locations');
    }
  };

  // Handler for trying teaching again (re-teach the same problem)
  const handleTryTeachAgain = () => {
    if (!currentProblem) return;
    
    // Reset teaching session state for a fresh attempt
    setTeachingSession(createTeachingSession(currentProblem.id));
    setTeachingReport(null);
    setTeachingRawTranscript("");
    setJuniorQuestion("");
    // Reset timer for fresh teaching attempt
    resetProblemStartTime();
    setStep('teaching');
  };

  const getSpotIcon = (icon: string) => {
    const iconClass = "w-6 h-6 sm:w-7 sm:h-7";
    switch(icon) {
        case 'coffee': return <Coffee className={iconClass} />;
        case 'park': return <Trees className={iconClass} />;
        case 'forest': return <Trees className={iconClass} />; // Color inherited from parent container
        case 'train': return <Train className={iconClass} />;
        default: return <Target className={iconClass} />;
    }
  };

  if (step === 'locations') {
    return (
      <div className="h-full bg-charcoal text-white flex flex-col font-sans overflow-hidden">
        {/* Daily Quest Header - Single row with absolutely centered Daily Quest */}
        <div className="border-b border-white/5 shrink-0 bg-black px-4 sm:px-6 py-4 sm:py-5 pr-16 sm:pr-20 relative">
          {/* Absolutely centered Daily Quest - aligned with content below */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-full max-w-2xl px-4 sm:px-6">
              <div className="text-center">
                <div className="text-[8px] sm:text-[10px] text-gold font-bold tracking-[0.2em] sm:tracking-[0.3em] uppercase mb-1">Daily Quest</div>
                <div className="flex items-center justify-center gap-2 sm:gap-3">
                    <div className="h-1 sm:h-1.5 w-24 sm:w-40 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-gold transition-all duration-700" style={{ width: `${((dailyCleared + sessionCleared) / (studySettings?.dailyCap || DEFAULT_SETTINGS.dailyCap)) * 100}%` }}></div>
                    </div>
                    <span className="text-xs sm:text-sm font-bold font-mono text-gold">{dailyCleared + sessionCleared}/{studySettings?.dailyCap || DEFAULT_SETTINGS.dailyCap}</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Left and Right buttons - positioned normally */}
          <div className="relative flex items-center justify-between">
            {/* Left: Home button */}
            <button onClick={() => onHome(true)} className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-white/5 rounded-full border border-white/10 hover:bg-white/10 transition-colors shrink-0"><Home size={16} className="sm:w-5 sm:h-5" /></button>
            
            {/* Right: Action buttons */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Mode Toggle Button */}
              <button 
                onClick={() => {
                  const modes: SessionMode[] = ['paired', 'explain', 'teach'];
                  const currentIdx = modes.indexOf(sessionMode);
                  const nextIdx = (currentIdx + 1) % modes.length;
                  setSessionMode(modes[nextIdx]);
                }}
                className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition-all shrink-0 ${
                  sessionMode === 'paired'
                    ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                    : sessionMode === 'teach'
                    ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                    : 'bg-gold/20 border-gold/40 text-gold'
                }`}
                title={sessionMode === 'paired' ? 'Paired: Explain → Teach same problem' : sessionMode === 'teach' ? 'Teach only mode' : 'Explain only mode'}
              >
                {sessionMode === 'paired' ? (
                  <><Layers size={12} className="sm:w-3.5 sm:h-3.5" /><span>Paired</span></>
                ) : sessionMode === 'teach' ? (
                  <><GraduationCap size={12} className="sm:w-3.5 sm:h-3.5" /><span>Teach</span></>
                ) : (
                  <><Mic size={12} className="sm:w-3.5 sm:h-3.5" /><span>Explain</span></>
                )}
              </button>

              <button 
                onClick={() => setShowSettings(true)}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white transition-all shrink-0"
                title="Study Settings"
              >
                <Settings size={16} className="sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:px-8 space-y-4 sm:space-y-6 pb-32 sm:pb-40 max-w-2xl mx-auto w-full">
          <div className="text-center mb-2 sm:mb-4">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-serif font-bold text-white mb-1 sm:mb-2">Power Spots</h2>
              <p className="text-gray-500 text-xs sm:text-sm italic px-4">
                {sessionMode === 'paired' 
                  ? 'Best for learning: Explain first → then teach the same problem.' 
                  : sessionMode === 'teach' 
                  ? 'Teach a junior engineer who asks questions until they understand.' 
                  : 'Explain your solution and AI evaluates correctness.'}
              </p>
          </div>

          {/* Difficulty Mode Selector */}
          <div className="flex items-center justify-center gap-2 sm:gap-3 mb-4 sm:mb-6">
            <button
              onClick={() => setDifficultyMode('warmup')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-full border text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all ${
                difficultyMode === 'warmup'
                  ? 'bg-green-500/20 border-green-500/50 text-green-300'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'
              }`}
            >
              <Leaf size={12} className="sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">Warm-Up</span>
              <span className="sm:hidden">Easy</span>
            </button>
            <button
              onClick={() => setDifficultyMode('standard')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-full border text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all ${
                difficultyMode === 'standard'
                  ? 'bg-gold/20 border-gold/50 text-gold'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'
              }`}
            >
              <Zap size={12} className="sm:w-3.5 sm:h-3.5" />
              <span>Standard</span>
            </button>
            <button
              onClick={() => setDifficultyMode('challenge')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-full border text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all ${
                difficultyMode === 'challenge'
                  ? 'bg-red-500/20 border-red-500/50 text-red-300'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'
              }`}
            >
              <Flame size={12} className="sm:w-3.5 sm:h-3.5" />
              <span>Challenge</span>
            </button>
          </div>
          
          {/* Difficulty Description */}
          <p className="text-center text-[10px] sm:text-xs text-gray-500 italic mb-4 sm:mb-6">
            {difficultyMode === 'warmup' && 'Easy problems only — build momentum'}
            {difficultyMode === 'standard' && 'Easy + Medium — balanced practice'}
            {difficultyMode === 'challenge' && 'All difficulties — test your limits'}
          </p>

          {isLoadingSpots ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Loader2 size={32} className="animate-spin mb-4" />
              <p className="text-sm">Loading topics...</p>
            </div>
          ) : spotsWithTopics.length === 0 ? (
            <div className="bg-gold/10 border border-gold/40 rounded-2xl p-8 text-center">
              <Trophy size={40} className="mx-auto mb-4 text-gold" />
              <h3 className="text-xl font-serif font-bold text-gold mb-2">All Topics Mastered!</h3>
              <p className="text-gold/60 text-sm">You've conquered all 75 problems. Legendary.</p>
            </div>
          ) : (
            spotsWithTopics.map((spot) => (
              <button 
                key={spot.id} 
                onClick={() => spot.remaining > 0 ? startSpotSession(spot) : null}
                disabled={spot.remaining === 0}
                className={`w-full rounded-2xl sm:rounded-[2.5rem] border-2 p-4 sm:p-6 md:p-8 flex items-center gap-4 sm:gap-6 md:gap-8 text-left transition-all group ${
                  spot.remaining === 0 
                    ? 'bg-white/5 border-white/5 opacity-50 cursor-not-allowed' 
                    : spot.isRandom
                    ? 'bg-emerald-950/30 border-emerald-500/20 hover:border-emerald-400/50 hover:bg-emerald-900/40'
                    : 'bg-white/5 border-white/5 hover:border-gold/40 hover:bg-gold/5'
                }`}
              >
                <div className={`w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-2xl sm:rounded-3xl border flex items-center justify-center transition-all shrink-0 ${
                  spot.isRandom 
                    ? 'bg-emerald-900/50 border-emerald-500/30 text-emerald-400 group-hover:scale-110 group-hover:bg-emerald-400 group-hover:text-charcoal'
                    : 'bg-charcoal border-white/10 text-white group-hover:scale-110 group-hover:bg-gold group-hover:text-charcoal'
                }`}>
                    {getSpotIcon(spot.icon)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className={`text-[8px] sm:text-[10px] font-bold uppercase tracking-widest mb-0.5 sm:mb-1 ${spot.isRandom ? 'text-emerald-400' : 'text-gold'}`}>{spot.ritual}</div>
                    <h3 className="text-lg sm:text-xl md:text-2xl font-serif font-bold mb-1 sm:mb-1.5 truncate">{spot.name}</h3>
                    
                    {/* Topic Tag */}
                    <div className="flex items-center gap-2 mb-1 sm:mb-1.5 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium ${
                        spot.isRandom 
                          ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
                          : spot.locked
                          ? 'bg-amber-500/20 border border-amber-500/30 text-amber-300'
                          : 'bg-blue-500/20 border border-blue-500/30 text-blue-300'
                      }`}>
                        {spot.isRandom ? <Sparkles size={10} className="sm:w-3 sm:h-3" /> : spot.locked ? <Lock size={10} className="sm:w-3 sm:h-3" /> : <Target size={10} className="sm:w-3 sm:h-3" />}
                        {spot.topicDisplay}
                      </span>
                      {/* Shuffle button for unlocked, non-random spots */}
                      {!spot.isRandom && !spot.locked && spot.remaining > 0 && (
                        <button
                          onClick={(e) => handleRefreshSingleSpot(spot.id, e)}
                          className="w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center bg-white/5 border border-white/10 text-gray-400 hover:bg-blue-500/20 hover:border-blue-500/30 hover:text-blue-300 transition-all"
                          title={`Shuffle ${spot.name} topic`}
                        >
                          <RefreshCw size={10} className="sm:w-3 sm:h-3" />
                        </button>
                      )}
                      {spot.locked && (
                        <span className="text-[8px] sm:text-[9px] text-amber-400/70 italic">
                          locked today
                        </span>
                      )}
                      <span className={`text-[9px] sm:text-[10px] font-mono ${spot.remaining === 0 ? 'text-green-400' : 'text-gray-400'}`}>
                        {spot.remaining === 0 ? '✓ Complete' : `${spot.remaining} remaining`}
                      </span>
                    </div>
                    
                    <p className="text-[10px] sm:text-xs text-gray-500 leading-relaxed line-clamp-1">{spot.description}</p>
                </div>
                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 ${
                  spot.isRandom 
                    ? 'bg-emerald-500/10 text-emerald-500 group-hover:text-emerald-300'
                    : 'bg-white/5 text-gray-500 group-hover:text-gold'
                }`}>
                    <ChevronRight size={16} className="sm:w-5 sm:h-5" />
                </div>
              </button>
            ))
          )}

          {(dailyCleared + sessionCleared) >= (studySettings?.dailyCap || DEFAULT_SETTINGS.dailyCap) && (
            <div className="bg-gold/10 border border-gold/40 rounded-2xl sm:rounded-[2.5rem] p-6 sm:p-10 text-center animate-in zoom-in duration-500">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gold rounded-full flex items-center justify-center text-charcoal mx-auto mb-3 sm:mb-4 shadow-[0_0_30px_rgba(199,169,101,0.4)]">
                    <Star size={24} className="sm:w-8 sm:h-8" fill="currentColor" />
                </div>
                <h3 className="text-xl sm:text-2xl font-serif font-bold text-gold mb-1 sm:mb-2">Daily Goal Achieved!</h3>
                <p className="text-gold/60 text-xs sm:text-sm">You have mastered {studySettings?.dailyCap || DEFAULT_SETTINGS.dailyCap} coding patterns today. Ritual complete.</p>
            </div>
          )}
        </div>

        {/* HALL OF FAME MODAL - Mobile responsive */}
        {showStats && (
            <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
                <div className="bg-charcoal border border-white/10 rounded-2xl sm:rounded-[3rem] w-full max-w-lg overflow-hidden shadow-2xl relative max-h-[90vh] overflow-y-auto">
                    <div className="p-6 sm:p-10 text-center border-b border-white/5">
                        <button onClick={() => setShowStats(false)} className="absolute top-4 right-4 sm:top-8 sm:right-8 text-gray-500 hover:text-white transition-colors">
                            <X size={20} className="sm:w-6 sm:h-6" />
                        </button>
                        <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gold/10 rounded-xl sm:rounded-2xl flex items-center justify-center text-gold mx-auto mb-4 sm:mb-6 border border-gold/20">
                            <Award size={24} className="sm:w-8 sm:h-8" />
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-serif font-bold mb-1 sm:mb-2 uppercase tracking-tight">The Hall of Fame</h2>
                        <p className="text-gray-500 text-xs sm:text-sm italic tracking-widest uppercase">Blind 75 Progress</p>
                    </div>

                    <div className="p-4 sm:p-10 space-y-6 sm:space-y-10">
                        {/* Coverage Progress */}
                        <div className="space-y-3 sm:space-y-4">
                            <div className="flex items-center justify-between px-1 sm:px-2">
                                <span className="text-[8px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-wider sm:tracking-widest">Global Coverage</span>
                                <span className="text-base sm:text-lg font-mono font-bold text-white">{masteredIds.length} <span className="text-gray-600 text-[10px] sm:text-xs">/ 75</span></span>
                            </div>
                            <div className="relative h-2 sm:h-2.5 w-full bg-black/40 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-gradient-to-r from-gold/60 to-gold shadow-[0_0_15px_rgba(199,169,101,0.3)] transition-all duration-1000 ease-out" 
                                    style={{ width: `${globalProgress}%` }}
                                ></div>
                            </div>
                        </div>

                        {/* Cards Section */}
                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                            <div className="bg-white/5 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/5 group hover:border-gold/30 transition-colors">
                                <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                                    <Target size={12} className="sm:w-3.5 sm:h-3.5 text-gray-500" />
                                    <span className="text-[8px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-wider">Breadth</span>
                                </div>
                                <div className="text-2xl sm:text-3xl font-bold text-white">{globalProgress}%</div>
                                <div className="text-[8px] sm:text-[10px] text-gray-500 mt-0.5 sm:mt-1 uppercase tracking-tighter">Unique Patterns</div>
                            </div>
                            
                            <div className="bg-white/5 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-white/5 group hover:border-gold/30 transition-colors">
                                <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                                    <Flame size={12} className="sm:w-3.5 sm:h-3.5 text-gold" />
                                    <span className="text-[8px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-wider">Depth</span>
                                </div>
                                <div className="text-2xl sm:text-3xl font-bold text-gold">{totalConquered}</div>
                                <div className="text-[8px] sm:text-[10px] text-gray-500 mt-0.5 sm:mt-1 uppercase tracking-tighter">Total Clears</div>
                            </div>
                        </div>

                        {/* Mastery Cycle */}
                        <div className="bg-gold/5 border border-gold/20 rounded-xl sm:rounded-2xl p-4 sm:p-6 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 sm:gap-4">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gold/10 flex items-center justify-center text-gold shrink-0">
                                    <Repeat size={16} className="sm:w-5 sm:h-5" />
                                </div>
                                <div>
                                    <div className="text-[8px] sm:text-[10px] font-bold text-gold uppercase tracking-wider sm:tracking-widest">Mastery Cycle</div>
                                    <div className="text-xs sm:text-sm font-bold text-white">Full Passes: {masteryCycle - 1}.{Math.floor((totalConquered % 75) / 7.5)}</div>
                                </div>
                            </div>
                            <div className="text-[8px] sm:text-[10px] text-gold/60 font-medium max-w-[80px] sm:max-w-[100px] text-right italic leading-tight hidden sm:block">
                                "The master does it until he cannot fail."
                            </div>
                        </div>

                        {/* Daily History - 7 Day Tracker */}
                        <div className="space-y-3 sm:space-y-4">
                            <div className="flex items-center gap-2 px-1 sm:px-2">
                                <Flame size={14} className="text-gold" />
                                <span className="text-[8px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-wider sm:tracking-widest">7-Day History</span>
                            </div>
                            <div className="space-y-2">
                                {dailyStats.map((day) => (
                                    <div 
                                        key={day.date}
                                        className={`flex items-center justify-between p-3 sm:p-4 rounded-xl ${
                                            day.isToday 
                                                ? 'bg-gold/10 border border-gold/30' 
                                                : 'bg-white/5 border border-white/5'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                                day.count >= 15 
                                                    ? 'bg-gold text-charcoal' 
                                                    : day.count > 0 
                                                    ? 'bg-gold/20 text-gold' 
                                                    : 'bg-white/10 text-gray-600'
                                            }`}>
                                                {day.count >= 15 ? <Star size={14} fill="currentColor" /> : day.count}
                                            </div>
                                            <span className={`text-xs sm:text-sm font-medium ${
                                                day.isToday ? 'text-gold' : 'text-gray-400'
                                            }`}>
                                                {day.displayDate}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {day.count > 0 && (
                                                <div className="flex">
                                                    {Array.from({ length: Math.min(day.count, 5) }).map((_, i) => (
                                                        <div 
                                                            key={i} 
                                                            className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-gold -ml-0.5 first:ml-0"
                                                        />
                                                    ))}
                                                    {day.count > 5 && (
                                                        <span className="text-[8px] sm:text-[9px] text-gold ml-1">+{day.count - 5}</span>
                                                    )}
                                                </div>
                                            )}
                                            <span className={`text-[10px] sm:text-xs font-mono ${
                                                day.isToday ? 'text-gold' : 'text-gray-500'
                                            }`}>
                                                {day.count} solved
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <button 
                        onClick={() => setShowStats(false)} 
                        className="w-full py-5 sm:py-8 bg-black text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.3em] sm:tracking-[0.4em] text-gold hover:bg-gold hover:text-charcoal transition-all"
                    >
                        Return to Quest
                    </button>
                </div>
            </div>
        )}

        {/* SETTINGS MODAL */}
        {showSettings && (
            <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
                <div className="bg-charcoal border border-white/10 rounded-2xl sm:rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl relative">
                    <div className="p-6 sm:p-8 border-b border-white/5">
                        <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 sm:top-6 sm:right-6 text-gray-500 hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                        <div className="flex items-center gap-3 mb-2">
                            <Settings size={20} className="text-gold" />
                            <h2 className="text-xl sm:text-2xl font-serif font-bold text-white">Study Settings</h2>
                        </div>
                        <p className="text-gray-500 text-xs sm:text-sm">Configure your spaced repetition study plan</p>
                    </div>

                    <div className="p-6 sm:p-8 space-y-6">
                        {/* Spaced Repetition Toggle */}
                        <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                            <div>
                                <div className="text-sm font-medium text-white mb-1">Spaced Repetition</div>
                                <div className="text-xs text-gray-500">Use adaptive scheduling for reviews</div>
                            </div>
                            <button
                                onClick={() => setUseSpacedRepetition(!useSpacedRepetition)}
                                className={`w-12 h-6 rounded-full transition-all ${
                                    useSpacedRepetition ? 'bg-gold' : 'bg-gray-600'
                                }`}
                            >
                                <div className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                                    useSpacedRepetition ? 'translate-x-6' : 'translate-x-0.5'
                                }`} />
                            </button>
                        </div>

                        {/* Target Days */}
                        <div>
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                                <Calendar size={12} className="inline mr-2" />
                                Target Days to Complete
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="range"
                                    min="5"
                                    max="30"
                                    value={settingsForm.targetDays}
                                    onChange={(e) => setSettingsForm(prev => ({ ...prev, targetDays: parseInt(e.target.value) }))}
                                    className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-gold"
                                />
                                <span className="text-xl font-bold text-gold w-12 text-center">{settingsForm.targetDays}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                                ~{Math.ceil(75 / settingsForm.targetDays)} new problems per day
                            </p>
                        </div>

                        {/* Daily Cap */}
                        <div>
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                                <Target size={12} className="inline mr-2" />
                                Daily Problem Cap
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="range"
                                    min="5"
                                    max="25"
                                    value={settingsForm.dailyCap}
                                    onChange={(e) => setSettingsForm(prev => ({ ...prev, dailyCap: parseInt(e.target.value) }))}
                                    className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-gold"
                                />
                                <span className="text-xl font-bold text-gold w-12 text-center">{settingsForm.dailyCap}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                                Maximum problems (new + reviews) per day
                            </p>
                        </div>

                        {/* Current Status */}
                        {studySettings && (
                            <div className="p-4 bg-gold/5 rounded-xl border border-gold/20">
                                <div className="text-xs font-bold text-gold uppercase tracking-widest mb-2">Current Plan</div>
                                <div className="text-sm text-gray-300">
                                    Started: {new Date(studySettings.startDate).toLocaleDateString()}
                                </div>
                                <div className="text-sm text-gray-300">
                                    Target: {studySettings.targetDays} days • Cap: {studySettings.dailyCap}/day
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="p-6 sm:p-8 border-t border-white/5 flex gap-3">
                        <button 
                            onClick={() => setShowSettings(false)} 
                            className="flex-1 py-3 bg-white/5 text-gray-400 text-sm font-bold uppercase tracking-widest rounded-xl hover:bg-white/10 transition-all"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleSaveSettings} 
                            className="flex-1 py-3 bg-gold text-charcoal text-sm font-bold uppercase tracking-widest rounded-xl hover:bg-white transition-all"
                        >
                            Save
                        </button>
                    </div>
                </div>
            </div>
        )}
      </div>
    );
  }

  if (step === 'curating') {
    const modeLabel = difficultyMode === 'warmup' ? 'easy' : difficultyMode === 'standard' ? 'easy + medium' : 'all';
    return (
      <div className="h-full bg-charcoal text-white flex flex-col items-center justify-center p-6 sm:p-8 text-center">
        <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-gold/10 flex items-center justify-center text-gold mb-6 sm:mb-8 animate-pulse border border-gold/20">
          <Sparkles size={32} className="sm:w-12 sm:h-12" />
        </div>
        <h2 className="text-2xl sm:text-4xl font-serif font-bold mb-3 sm:mb-4 px-4">Entering {selectedSpot?.name}</h2>
        <p className="text-gray-400 font-light italic leading-relaxed max-w-sm text-sm sm:text-base px-4">
          Curating 5 related {modeLabel} problems for your ritual...
        </p>
        <Loader2 size={20} className="sm:w-6 sm:h-6 mt-8 sm:mt-12 animate-spin text-gold/40" />
      </div>
    );
  }

  if (step === 'analyzing') {
    return (
      <div className="h-full bg-charcoal text-white flex flex-col items-center justify-center p-6 sm:p-8 text-center">
        <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-gold/10 flex items-center justify-center text-gold mb-6 sm:mb-8 animate-pulse border border-gold/20">
          <BrainCircuit size={32} className="sm:w-12 sm:h-12" />
        </div>
        <h2 className="text-2xl sm:text-4xl font-serif font-bold mb-3 sm:mb-4 px-4">
            {analysisPhase === 'refining' ? 'Polishing Logic' : 'Verifying Model'}
        </h2>
        <p className="text-gray-400 font-light italic leading-relaxed max-w-sm text-sm sm:text-base px-4">
          {analysisPhase === 'refining' ? "Refining speech data..." : "Checking Logic, Complexity, and Examples..."}
        </p>
        <Loader2 size={20} className="sm:w-6 sm:h-6 mt-8 sm:mt-12 animate-spin text-gold/40" />
      </div>
    );
  }

  // Readiness evaluation loading screen (paired mode)
  if (step === 'readiness_evaluating') {
    return (
      <div className="h-full bg-charcoal text-white flex flex-col items-center justify-center p-6 sm:p-8 text-center">
        <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-300 mb-6 sm:mb-8 animate-pulse border border-blue-500/20">
          <Layers size={32} className="sm:w-12 sm:h-12" />
        </div>
        <h2 className="text-2xl sm:text-4xl font-serif font-bold mb-3 sm:mb-4 px-4">
            Checking Readiness to Teach
        </h2>
        <p className="text-gray-400 font-light italic leading-relaxed max-w-sm text-sm sm:text-base px-4">
          Evaluating your mental model: core insight, state definitions, examples, edge cases, complexity...
        </p>
        <Loader2 size={20} className="sm:w-6 sm:h-6 mt-8 sm:mt-12 animate-spin text-blue-400/40" />
      </div>
    );
  }

  // Readiness reveal screen (paired mode - Pass 1 complete)
  if (step === 'readiness_reveal' && readinessReport && currentProblem) {
    return (
      <div className="h-full bg-cream text-charcoal flex flex-col font-sans overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-6 md:p-8 pr-14 sm:pr-20 md:pr-24 flex items-center justify-between shrink-0 bg-white border-b border-[#E6E6E6]">
          <div className="flex items-center gap-3 sm:gap-6">
            <button onClick={() => onHome(true)} className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-charcoal text-white flex items-center justify-center border border-white/10 shrink-0 hover:bg-black transition-colors">
              <Home size={20} className="sm:w-6 sm:h-6" />
            </button>
            <div>
              <h2 className="text-base sm:text-xl font-serif font-bold text-charcoal">Pass 1 Complete</h2>
              <p className="text-[8px] sm:text-[10px] font-bold text-blue-600 uppercase tracking-widest flex items-center gap-1">
                <Layers size={10} /> Paired Learning Flow
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
              {dailyCleared + sessionCleared}/{studySettings?.dailyCap || DEFAULT_SETTINGS.dailyCap} today
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 pb-24 sm:pb-32">
          <div className="max-w-2xl mx-auto">
            <ReadinessReportComponent
              report={readinessReport}
              problemTitle={currentProblem.title}
              problem={currentProblem}
              onContinueToTeach={handleContinueToTeach}
              onTryAgain={handleTryExplainAgain}
              rawTranscript={rawTranscript}
              refinedTranscript={explainTranscript}
            />
          </div>
        </div>
      </div>
    );
  }

  if (step === 'problem' || step === 'recording') {
    return (
      <div className="h-full bg-charcoal text-white flex flex-col font-sans overflow-hidden">
        {/* Header - Mobile responsive */}
        <div className="p-3 sm:p-6 md:p-8 pr-14 sm:pr-20 md:pr-24 flex items-center justify-between shrink-0 bg-black/20 border-b border-white/5 gap-2">
          <button onClick={() => setStep('locations')} className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-white/5 rounded-full border border-white/10 hover:bg-white/10 transition-colors shrink-0"><ArrowLeft size={16} className="sm:w-[18px] sm:h-[18px]" /></button>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
             {/* Show Pass 1 indicator for paired mode */}
             {sessionMode === 'paired' && (
               <div className="px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-full border border-blue-500/30 text-[8px] sm:text-[10px] font-bold text-blue-300 bg-blue-500/10 uppercase tracking-wider">
                 <Layers size={10} className="inline mr-1" /> Pass 1 • Explain
               </div>
             )}
             <div className="px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-full border border-gold/30 text-[8px] sm:text-[10px] font-bold text-gold bg-gold/5 uppercase tracking-wider sm:tracking-widest truncate max-w-[120px] sm:max-w-none">
                {selectedSpot?.name}
             </div>
             <div className="px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-full border border-white/10 text-[8px] sm:text-[10px] font-bold text-gray-400 bg-white/5 uppercase tracking-wider sm:tracking-widest whitespace-nowrap">
                {dailyCleared + sessionCleared}/{studySettings?.dailyCap || DEFAULT_SETTINGS.dailyCap} today
             </div>
          </div>
        </div>

        {/* Problem Content - Mobile vertical, Desktop side-by-side */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-8 py-4">
          <div className="max-w-6xl mx-auto pb-32 sm:pb-40">
            {/* Problem Title with LeetCode Number - Always on top */}
            <h2 className="text-2xl sm:text-4xl md:text-5xl font-serif font-bold mb-4 sm:mb-6 leading-tight">
              {currentProblem?.leetcodeNumber && (
                <span className="text-gold">#{currentProblem.leetcodeNumber}. </span>
              )}
              {currentProblem?.title}
            </h2>
            
            {/* Desktop: Side-by-side layout with equal heights | Mobile: Vertical layout */}
            <div className="flex flex-col lg:flex-row lg:gap-8 lg:items-stretch">
              {/* Left Column: Problem Statement */}
              <div className="flex-1 lg:max-w-[55%] order-first lg:order-first mb-6 lg:mb-0">
                <div className="bg-white/5 rounded-2xl sm:rounded-[2.5rem] p-5 sm:p-8 md:p-10 border border-white/10 h-full flex flex-col">
                  <div className="flex items-center justify-between mb-4 sm:mb-6">
                     <div className="flex items-center gap-2">
                       <BookOpen size={16} className="sm:w-5 sm:h-5 text-gold" />
                       <span className="text-[10px] sm:text-xs font-bold text-gold uppercase tracking-widest">Problem Statement</span>
                     </div>
                     {currentProblem?.title && (
                       <a 
                         href={getNeetCodeUrl(currentProblem.title)} 
                         target="_blank" 
                         rel="noopener noreferrer"
                         className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-300 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider hover:bg-orange-500/20 transition-colors"
                         title="Watch NeetCode video solution"
                       >
                         <ExternalLink size={10} className="sm:w-3 sm:h-3" />
                         <span>NeetCode Video</span>
                       </a>
                     )}
                  </div>
                  <p className="text-base sm:text-lg md:text-xl text-gray-200 leading-relaxed font-light mb-6 sm:mb-8 flex-grow">{currentProblem?.prompt}</p>
                  {currentProblem?.example && (
                    <div className="bg-black/40 p-4 sm:p-6 md:p-8 rounded-xl sm:rounded-3xl border border-white/5 font-mono text-xs sm:text-sm text-gray-300 leading-relaxed overflow-x-auto"><pre className="whitespace-pre-wrap">{currentProblem.example}</pre></div>
                  )}
                </div>
              </div>
              
              {/* Right Column: Visual Mnemonic Image - Matches problem height on desktop */}
              {currentProblem?.mnemonicImageUrl && (
                <div className="lg:flex-1 lg:max-w-[45%] order-2 lg:order-last mb-6 lg:mb-0">
                  <div className="rounded-2xl sm:rounded-[2.5rem] overflow-hidden border border-white/10 bg-white/5 h-full">
                    <img 
                      src={currentProblem.mnemonicImageUrl} 
                      alt={`Visual mnemonic for ${currentProblem.title}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                </div>
              )}
            </div>
            
            {/* Need a Hint Button - Centered below the two columns */}
            {revealHintIdx < 5 && (
              <div className="flex justify-center mt-8 sm:mt-10">
                <button 
                  onClick={() => {
                    setRevealHintIdx(p => Math.min(p + 1, 5));
                    setUsedHints(true); // Mark that hints were used - prevents 'Mastered' status
                  }} 
                  className="text-[9px] sm:text-[10px] font-bold text-gold uppercase tracking-[0.2em] sm:tracking-[0.3em] border border-gold/40 px-5 sm:px-8 py-3 sm:py-4 rounded-full hover:bg-gold/10 transition-all flex items-center gap-2 sm:gap-3"
                >
                  {revealHintIdx === 0 ? 'Need a Hint?' : 'Need More Hints?'} <Sparkles size={12} className="sm:w-3.5 sm:h-3.5" />
                </button>
              </div>
            )}
            
            {/* Hints Section - Full width below */}
            {/* Order: 1. Definition (data structure basics) → 2. Pattern → 3. Key Idea → 4. Detailed Hint → 5. Skeleton */}
            <div className="grid gap-4 sm:gap-6 mt-6 sm:mt-8">
              {revealHintIdx >= 1 && currentProblem?.definition && <div className="p-5 sm:p-8 bg-emerald-950/30 border border-emerald-500/20 rounded-xl sm:rounded-[2rem] animate-in slide-in-from-bottom-4"><span className="text-[9px] sm:text-[10px] font-bold uppercase text-emerald-400 tracking-widest mb-2 sm:mb-3 block">📚 Definitions & Concepts</span><div className="text-sm sm:text-base text-gray-200 leading-relaxed whitespace-pre-wrap prose prose-invert prose-sm max-w-none [&_strong]:text-emerald-300">{currentProblem?.definition?.split('**').map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : part)}</div></div>}
              {revealHintIdx >= 2 && <div className="p-5 sm:p-8 bg-gold/5 border border-gold/10 rounded-xl sm:rounded-[2rem] animate-in slide-in-from-bottom-4"><span className="text-[9px] sm:text-[10px] font-bold uppercase text-gold tracking-widest mb-2 sm:mb-3 block opacity-60">Pattern</span><p className="text-lg sm:text-2xl font-serif font-semibold">{currentProblem?.pattern}</p></div>}
              {revealHintIdx >= 3 && <div className="p-5 sm:p-8 bg-white/5 border border-white/10 rounded-xl sm:rounded-[2rem] animate-in slide-in-from-bottom-4"><span className="text-[9px] sm:text-[10px] font-bold uppercase text-gray-500 tracking-widest mb-2 sm:mb-3 block">Key Idea</span><p className="text-base sm:text-xl italic font-light">"{currentProblem?.keyIdea}"</p></div>}
              {revealHintIdx >= 4 && currentProblem?.detailedHint && <div className="p-5 sm:p-8 bg-blue-950/30 border border-blue-500/20 rounded-xl sm:rounded-[2rem] animate-in slide-in-from-bottom-4"><span className="text-[9px] sm:text-[10px] font-bold uppercase text-blue-400 tracking-widest mb-2 sm:mb-3 block">Approach Walkthrough</span><p className="text-sm sm:text-base text-gray-200 leading-relaxed whitespace-pre-wrap">{currentProblem?.detailedHint}</p></div>}
              {revealHintIdx >= 5 && <div className="p-5 sm:p-8 bg-black border border-white/10 rounded-xl sm:rounded-[2rem] animate-in slide-in-from-bottom-4"><span className="text-[9px] sm:text-[10px] font-bold uppercase text-gray-600 tracking-widest mb-2 sm:mb-3 block">Logic Structure (Python)</span><pre className="text-xs sm:text-sm font-mono text-gold/80 whitespace-pre-wrap overflow-x-auto">{currentProblem?.skeleton?.replace(/\\n/g, '\n')}</pre></div>}
            </div>
          </div>
        </div>

        {/* Recording Controls - Mobile responsive */}
        <div className="p-6 sm:p-10 bg-gradient-to-t from-black via-black/90 to-transparent shrink-0 flex flex-col items-center">
          {step === 'problem' ? (
            <button onClick={() => { setStep('recording'); handleStartRecording(); }} className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-charcoal border-4 border-white/10 flex items-center justify-center text-white shadow-2xl hover:scale-110 active:scale-90 transition-all group"><Mic size={28} className="sm:w-10 sm:h-10 group-hover:text-gold transition-colors" /></button>
          ) : (
            <div className="w-full max-w-2xl flex flex-col items-center">
              <div className={`w-full bg-white/5 backdrop-blur-2xl rounded-2xl sm:rounded-[2.5rem] p-4 sm:p-8 mb-6 sm:mb-10 border border-white/10 min-h-[80px] sm:min-h-[120px] max-h-[30vh] sm:max-h-[40vh] overflow-y-auto text-gray-400 font-serif italic text-base sm:text-xl text-center ${!rawTranscript ? 'flex items-center justify-center' : 'block'}`}>
                  {rawTranscript || (sessionMode === 'paired' 
                    ? "Form your mental model: insight, state, example, edges, complexity..." 
                    : "Verbalize your mental model...")}
              </div>
              <button onClick={handleStopRecording} className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-red-600 flex items-center justify-center text-white shadow-2xl animate-pulse border-4 border-white/10 active:scale-95"><StopCircle size={28} className="sm:w-10 sm:h-10" /></button>
            </div>
          )}
          <span className="mt-5 sm:mt-8 text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-[0.3em] sm:tracking-[0.4em]">
            {step === 'problem' 
              ? (sessionMode === 'paired' ? 'Start Explaining' : 'Push to Explain') 
              : 'Stop Recording'}
          </span>
          {sessionMode === 'paired' && step === 'problem' && (
            <p className="mt-3 text-[9px] text-gray-600 text-center max-w-sm">
              Cover: core insight, state definition, example walkthrough, edge cases, and complexity
            </p>
          )}
        </div>
      </div>
    );
  }

  if (step === 'reveal' && aiReport) {
    const score = aiReport.detectedAutoScore || 'partial';
    
    return (
      <div className="h-full bg-cream text-charcoal flex flex-col font-sans overflow-hidden">
        {/* Header - Mobile responsive */}
        <div className="p-4 sm:p-6 md:p-8 pr-14 sm:pr-20 md:pr-24 flex items-center justify-between shrink-0 bg-white border-b border-[#E6E6E6]">
             <div className="flex items-center gap-3 sm:gap-6">
                 <button onClick={() => onHome(true)} className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-charcoal text-white flex items-center justify-center border border-white/10 shrink-0 hover:bg-black transition-colors">
                     <Home size={20} className="sm:w-6 sm:h-6" />
                 </button>
                 <div>
                     <h2 className="text-base sm:text-xl font-serif font-bold text-charcoal">{currentProblem?.title || 'LeetCode Report'}</h2>
                     <p className="text-[8px] sm:text-[10px] font-bold text-gold uppercase tracking-widest">Problem Review</p>
                 </div>
             </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 pb-24 sm:pb-32">
            <div className="max-w-4xl mx-auto">
                {/* AI Verdict Card - Mobile responsive */}
                <div className="bg-charcoal text-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-xl mb-6 sm:mb-8 flex flex-col gap-4 sm:gap-6 border border-white/10">
                    <div className="text-center sm:text-left">
                        <h3 className="text-xl sm:text-2xl font-serif font-bold mb-1 sm:mb-2">AI Verdict</h3>
                        <p className="text-gray-400 text-xs sm:text-sm">Gemini has evaluated your solution correctness.</p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center justify-center sm:justify-end gap-3 sm:gap-6">
                         {score === 'good' && (
                             <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2 sm:py-3 bg-green-500/20 border border-green-500/50 rounded-lg sm:rounded-xl text-green-300 w-full sm:w-auto justify-center">
                                 <CheckCircle2 size={20} className="sm:w-6 sm:h-6" />
                                 <span className="font-bold uppercase tracking-widest text-xs sm:text-sm">Mastered</span>
                             </div>
                         )}
                         {score === 'partial' && (
                             <div className="flex flex-col items-center gap-1">
                                 <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2 sm:py-3 bg-yellow-500/20 border border-yellow-500/50 rounded-lg sm:rounded-xl text-yellow-300 w-full sm:w-auto justify-center">
                                     <AlertCircle size={20} className="sm:w-6 sm:h-6" />
                                     <span className="font-bold uppercase tracking-widest text-xs sm:text-sm">Partial</span>
                                 </div>
                                 {usedHints && aiReport && aiReport.rating >= 75 && (
                                     <span className="text-[9px] sm:text-[10px] text-yellow-400/70 italic">Hints used — try again without hints to master</span>
                                 )}
                             </div>
                         )}
                         {score === 'missed' && (
                             <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2 sm:py-3 bg-red-500/20 border border-red-500/50 rounded-lg sm:rounded-xl text-red-300 w-full sm:w-auto justify-center">
                                 <ShieldAlert size={20} className="sm:w-6 sm:h-6" />
                                 <span className="font-bold uppercase tracking-widest text-xs sm:text-sm">Missed</span>
                             </div>
                         )}
                         
                        <button onClick={handleContinue} className="px-5 sm:px-8 py-2.5 sm:py-3 rounded-lg sm:rounded-xl bg-gold text-charcoal hover:bg-white transition-all font-bold text-[10px] sm:text-xs uppercase tracking-wider sm:tracking-widest shadow-lg flex items-center justify-center gap-2 w-full sm:w-auto">
                           {currentQueueIdx < problemQueue.length - 1 ? 'Next' : 'Complete'} <ArrowLeft className="rotate-180 w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </button>
                    </div>
                </div>

<PerformanceReportComponent
                   report={aiReport}
                   reportType="walkie"
                   transcript={transcript}
                   context={currentProblem?.title}
                   isSaved={isSaved}
                   onToggleSave={onToggleSave}
                   onDone={() => onHome(true)}
                />
            </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // TEACHING MODE UI
  // ============================================================

  // Teaching conversation screen
  if (step === 'teaching' || step === 'junior_question') {
    return (
      <div className="h-full bg-charcoal text-white flex flex-col font-sans overflow-hidden">
        {/* Header */}
        <div className="p-3 sm:p-6 md:p-8 pr-14 sm:pr-20 md:pr-24 flex items-center justify-between shrink-0 bg-black/20 border-b border-white/5 gap-2">
          <button onClick={() => setStep('locations')} className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-white/5 rounded-full border border-white/10 hover:bg-white/10 transition-colors shrink-0">
            <ArrowLeft size={16} className="sm:w-[18px] sm:h-[18px]" />
          </button>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
            {/* Show Pass 2 indicator for paired mode, otherwise just Teach Mode */}
            <div className="px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-full border border-purple-500/30 text-[8px] sm:text-[10px] font-bold text-purple-300 bg-purple-500/10 uppercase tracking-wider sm:tracking-widest">
              <GraduationCap size={10} className="inline mr-1" /> 
              {sessionMode === 'paired' ? 'Pass 2 • Teach' : 'Teach Mode'}
            </div>
            <div className="px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-full border border-white/10 text-[8px] sm:text-[10px] font-bold text-gray-400 bg-white/5 uppercase tracking-wider sm:tracking-widest whitespace-nowrap">
              {currentQueueIdx + 1}/5
            </div>
          </div>
        </div>

        {/* Problem Title & Conversation */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-8 py-4">
          <div className="max-w-6xl mx-auto pb-48 sm:pb-56">
            {/* Problem Title with LeetCode Number - Always on top */}
            <h2 className="text-2xl sm:text-4xl md:text-5xl font-serif font-bold mb-4 sm:mb-6 leading-tight">
              {currentProblem?.leetcodeNumber && (
                <span className="text-purple-300">#{currentProblem.leetcodeNumber}. </span>
              )}
              {currentProblem?.title}
            </h2>
            
            {/* Desktop: Side-by-side layout with equal heights | Mobile: Vertical layout */}
            <div className="flex flex-col lg:flex-row lg:gap-8 lg:items-stretch mb-6">
              {/* Left Column: Problem Statement */}
              <div className="flex-1 lg:max-w-[55%] order-first lg:order-first mb-6 lg:mb-0">
                <div className="bg-white/5 rounded-2xl sm:rounded-[2.5rem] p-5 sm:p-8 md:p-10 border border-white/10 h-full flex flex-col">
                  <div className="flex items-center gap-2 mb-4 sm:mb-6">
                    <BookOpen size={16} className="sm:w-5 sm:h-5 text-purple-300" />
                    <span className="text-[10px] sm:text-xs font-bold text-purple-300 uppercase tracking-widest">Problem Statement</span>
                  </div>
                  <p className="text-base sm:text-lg md:text-xl text-gray-200 leading-relaxed font-light mb-6 sm:mb-8 flex-grow">{currentProblem?.prompt}</p>
                  {currentProblem?.example && (
                    <div className="bg-black/40 p-4 sm:p-6 md:p-8 rounded-xl sm:rounded-3xl border border-white/5 font-mono text-xs sm:text-sm text-gray-300 leading-relaxed overflow-x-auto"><pre className="whitespace-pre-wrap">{currentProblem.example}</pre></div>
                  )}
                </div>
              </div>
              
              {/* Right Column: Visual Mnemonic Image - Matches problem height on desktop */}
              {currentProblem?.mnemonicImageUrl && (
                <div className="lg:flex-1 lg:max-w-[45%] order-2 lg:order-last mb-6 lg:mb-0">
                  <div className="rounded-2xl sm:rounded-[2.5rem] overflow-hidden border border-white/10 bg-white/5 h-full">
                    <img 
                      src={currentProblem.mnemonicImageUrl} 
                      alt={`Visual mnemonic for ${currentProblem.title}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Conversation History */}
            <div className="space-y-4 max-w-2xl mx-auto">
              {teachingSession?.turns.map((turn, idx) => (
                <div 
                  key={idx} 
                  className={`flex ${turn.speaker === 'teacher' ? 'justify-end' : 'justify-start'}`}
                >
                  <div 
                    className={`max-w-[85%] rounded-2xl p-4 ${
                      turn.speaker === 'teacher' 
                        ? 'bg-gold/20 border border-gold/30 text-white' 
                        : 'bg-purple-500/20 border border-purple-500/30 text-purple-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] font-bold uppercase tracking-widest opacity-60">
                        {turn.speaker === 'teacher' ? 'You (Teaching)' : 'Junior Engineer'}
                      </span>
                      {turn.speaker === 'junior' && (
                        <button 
                          onClick={() => speakJuniorResponse(turn.content)}
                          className="p-1 rounded hover:bg-white/10 transition-colors"
                          title="Read aloud"
                        >
                          <Volume2 size={14} className="text-purple-300" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm sm:text-base leading-relaxed">{turn.content}</p>
                  </div>
                </div>
              ))}

              {/* Initial prompt if no conversation yet */}
              {(!teachingSession?.turns.length || teachingSession.turns.length === 0) && (
                <div className="text-center py-8">
                  <MessageCircle size={32} className="mx-auto text-gray-600 mb-3" />
                  <p className="text-gray-500 text-sm italic">Start teaching the junior engineer...</p>
                  <p className="text-gray-600 text-xs mt-1">Explain the problem and your approach</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recording Controls */}
        <div className="p-4 sm:p-8 bg-gradient-to-t from-black via-black/95 to-transparent shrink-0">
          <div className="max-w-2xl mx-auto">
            {/* TTS Toggle */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <button 
                onClick={() => setTtsEnabled(!ttsEnabled)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all ${
                  ttsEnabled 
                    ? 'bg-purple-500/20 border border-purple-500/40 text-purple-300' 
                    : 'bg-white/5 border border-white/10 text-gray-500'
                }`}
              >
                {ttsEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
                <span>Read Aloud</span>
              </button>
            </div>

            {/* Recording UI */}
            {isTeachingRecording ? (
              <div className="flex flex-col items-center">
                <div className="w-full bg-white/5 backdrop-blur-2xl rounded-2xl p-4 mb-4 border border-white/10 min-h-[60px] max-h-[20vh] overflow-y-auto text-gray-400 font-serif italic text-sm text-center">
                  {teachingRawTranscript || "Speaking..."}
                </div>
                <button 
                  onClick={handleStopTeachingRecording} 
                  className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-red-600 flex items-center justify-center text-white shadow-2xl animate-pulse border-4 border-white/10 active:scale-95"
                >
                  <Send size={24} className="sm:w-8 sm:h-8" />
                </button>
                <span className="mt-3 text-[9px] font-bold text-gray-500 uppercase tracking-widest">Tap to Send</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={handleStartTeachingRecording} 
                    className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-charcoal border-4 border-purple-500/30 flex items-center justify-center text-white shadow-2xl hover:scale-110 active:scale-90 transition-all group"
                  >
                    <Mic size={24} className="sm:w-8 sm:h-8 group-hover:text-purple-300 transition-colors" />
                  </button>
                  <button 
                    onClick={handleEndTeachingSession}
                    className="px-4 py-2 rounded-full bg-white/10 border border-white/20 text-xs font-bold uppercase tracking-wider text-gray-400 hover:bg-white/20 hover:text-white transition-all"
                  >
                    End Session
                  </button>
                </div>
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                  {step === 'junior_question' ? 'Continue Teaching' : 'Start Teaching'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Junior thinking/processing screen
  if (step === 'junior_thinking') {
    return (
      <div className="h-full bg-charcoal text-white flex flex-col items-center justify-center p-6 sm:p-8 text-center">
        <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-300 mb-6 sm:mb-8 animate-pulse border border-purple-500/20">
          <MessageCircle size={32} className="sm:w-12 sm:h-12" />
        </div>
        <h2 className="text-2xl sm:text-4xl font-serif font-bold mb-3 sm:mb-4 px-4">Junior is Thinking...</h2>
        <p className="text-gray-400 font-light italic leading-relaxed max-w-sm text-sm sm:text-base px-4">
          Processing what you taught and forming a question...
        </p>
        <Loader2 size={20} className="sm:w-6 sm:h-6 mt-8 sm:mt-12 animate-spin text-purple-400/40" />
      </div>
    );
  }

  // Junior summarizing screen
  if (step === 'junior_summarizing') {
    return (
      <div className="h-full bg-charcoal text-white flex flex-col items-center justify-center p-6 sm:p-8 text-center">
        <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-300 mb-6 sm:mb-8 animate-pulse border border-purple-500/20">
          <GraduationCap size={32} className="sm:w-12 sm:h-12" />
        </div>
        <h2 className="text-2xl sm:text-4xl font-serif font-bold mb-3 sm:mb-4 px-4">Junior Summarizing...</h2>
        <p className="text-gray-400 font-light italic leading-relaxed max-w-sm text-sm sm:text-base px-4">
          The junior is restating what they learned in their own words...
        </p>
        <Loader2 size={20} className="sm:w-6 sm:h-6 mt-8 sm:mt-12 animate-spin text-purple-400/40" />
      </div>
    );
  }

  // Dean evaluating screen
  if (step === 'dean_evaluating') {
    return (
      <div className="h-full bg-charcoal text-white flex flex-col items-center justify-center p-6 sm:p-8 text-center">
        <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-gold/10 flex items-center justify-center text-gold mb-6 sm:mb-8 animate-pulse border border-gold/20">
          <Award size={32} className="sm:w-12 sm:h-12" />
        </div>
        <h2 className="text-2xl sm:text-4xl font-serif font-bold mb-3 sm:mb-4 px-4">The Dean is Evaluating...</h2>
        <p className="text-gray-400 font-light italic leading-relaxed max-w-sm text-sm sm:text-base px-4">
          Assessing your teaching effectiveness...
        </p>
        <Loader2 size={20} className="sm:w-6 sm:h-6 mt-8 sm:mt-12 animate-spin text-gold/40" />
      </div>
    );
  }

  // Teaching reveal/report screen
  if (step === 'teaching_reveal' && teachingReport && teachingSession) {
    return (
      <div className="h-full bg-cream text-charcoal flex flex-col font-sans overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-6 md:p-8 pr-14 sm:pr-20 md:pr-24 flex items-center justify-between shrink-0 bg-white border-b border-[#E6E6E6]">
          <div className="flex items-center gap-3 sm:gap-6">
            <button onClick={() => onHome(true)} className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-charcoal text-white flex items-center justify-center border border-white/10 shrink-0 hover:bg-black transition-colors">
              <Home size={20} className="sm:w-6 sm:h-6" />
            </button>
            <div>
              <h2 className="text-base sm:text-xl font-serif font-bold text-charcoal">{currentProblem?.title || 'Teaching Report'}</h2>
              <p className="text-[8px] sm:text-[10px] font-bold text-purple-600 uppercase tracking-widest">Teaching Evaluation</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 pb-24 sm:pb-32">
          <div className="max-w-4xl mx-auto">
            <TeachingReportComponent
              report={teachingReport}
              juniorSummary={teachingSession.juniorSummary}
              problemTitle={currentProblem?.title || ''}
              leetcodeNumber={currentProblem?.leetcodeNumber}
              problem={currentProblem}
              onContinue={handleTeachingContinue}
              onTryAgain={handleTryTeachAgain}
              isLastProblem={currentQueueIdx >= problemQueue.length - 1}
              teachingSession={teachingSession}
            />
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default WalkieTalkieView;
