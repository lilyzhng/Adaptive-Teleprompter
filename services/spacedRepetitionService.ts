/**
 * Spaced Repetition Service
 * 
 * Handles adaptive spaced repetition logic for Blind 75 problems.
 * - Score-based graduation (reviews needed based on performance)
 * - Difficulty adjustments (easy problems graduate faster)
 * - Goal-driven scheduling (complete all 75 in target days)
 */

import { BlindProblem } from '../types';
import { 
    UserStudySettings, 
    UserProblemProgress, 
    ProblemStatus,
    StudyStats 
} from '../types/database';
import {
    fetchUserStudySettings,
    upsertUserStudySettings,
    fetchAllUserProgress,
    fetchDueReviews,
    fetchDueTomorrow,
    upsertUserProblemProgress,
    batchUpsertUserProgress,
    fetchAllBlindProblems
} from './databaseService';

// ============================================
// Constants
// ============================================

const TOTAL_BLIND_75 = 75;

// Default settings
export const DEFAULT_SETTINGS: Omit<UserStudySettings, 'userId'> = {
    targetDays: 10,
    dailyCap: 15,
    easyBonus: 10,
    startDate: new Date()
};

// Score thresholds for determining reviews needed
const SCORE_THRESHOLDS = {
    EXCEPTIONAL: 85,  // 0 reviews needed
    MASTERED: 75,     // 1 review needed
    PARTIAL: 50,      // 2 reviews needed
    // Below 50: 3 reviews needed
};

// Difficulty bonuses/penalties
const DIFFICULTY_ADJUSTMENTS: Record<'easy' | 'medium' | 'hard', number> = {
    easy: 10,    // +10 points
    medium: 0,   // No adjustment
    hard: -5     // -5 points
};

// ============================================
// Score-Based Review Calculation
// ============================================

/**
 * Calculate how many reviews are needed based on score and difficulty
 */
export function calculateReviewsNeeded(
    score: number,
    difficulty: 'easy' | 'medium' | 'hard',
    easyBonus: number = DEFAULT_SETTINGS.easyBonus
): number {
    // Apply difficulty adjustment
    const adjustment = difficulty === 'easy' ? easyBonus : DIFFICULTY_ADJUSTMENTS[difficulty];
    const adjustedScore = score + adjustment;

    if (adjustedScore >= SCORE_THRESHOLDS.EXCEPTIONAL) {
        return 0; // Instant mastery
    } else if (adjustedScore >= SCORE_THRESHOLDS.MASTERED) {
        return 1; // Quick review
    } else if (adjustedScore >= SCORE_THRESHOLDS.PARTIAL) {
        return 2; // Standard review cycle
    } else {
        return 3; // Extra practice needed
    }
}

/**
 * Determine the new status based on reviews completed vs needed
 */
export function determineStatus(
    reviewsCompleted: number,
    reviewsNeeded: number
): ProblemStatus {
    if (reviewsNeeded === 0 || reviewsCompleted >= reviewsNeeded) {
        return 'mastered';
    }
    return 'learning';
}

// ============================================
// Settings Management
// ============================================

/**
 * Get user settings with defaults
 */
export async function getSettingsWithDefaults(userId: string): Promise<UserStudySettings> {
    const settings = await fetchUserStudySettings(userId);
    if (settings) {
        return settings;
    }
    
    // Create default settings for new user
    const defaultWithUser: UserStudySettings = {
        userId,
        ...DEFAULT_SETTINGS
    };
    
    await upsertUserStudySettings(userId, DEFAULT_SETTINGS);
    return defaultWithUser;
}

/**
 * Update user settings
 */
export async function updateSettings(
    userId: string,
    updates: Partial<Omit<UserStudySettings, 'userId'>>
): Promise<UserStudySettings | null> {
    return upsertUserStudySettings(userId, updates);
}

/**
 * Reset study plan (start fresh)
 */
export async function resetStudyPlan(userId: string): Promise<UserStudySettings | null> {
    return upsertUserStudySettings(userId, {
        ...DEFAULT_SETTINGS,
        startDate: new Date()
    });
}

// ============================================
// Progress Tracking
// ============================================

/**
 * Update progress after completing a problem
 */
export async function updateProgressAfterAttempt(
    userId: string,
    problemTitle: string,
    score: number,
    difficulty: 'easy' | 'medium' | 'hard',
    existingProgress: UserProblemProgress | null
): Promise<UserProblemProgress | null> {
    const settings = await getSettingsWithDefaults(userId);
    
    // Calculate reviews needed based on this attempt's score
    const reviewsNeeded = calculateReviewsNeeded(score, difficulty, settings.easyBonus);
    
    // Get current review count (first attempt = 1)
    const previousReviews = existingProgress?.reviewsCompleted || 0;
    const newReviewsCompleted = previousReviews + 1;
    
    // Determine new status
    const newStatus = determineStatus(newReviewsCompleted, reviewsNeeded);
    
    // Calculate next review date (tomorrow if still learning)
    let nextReviewAt: Date | null = null;
    if (newStatus === 'learning') {
        nextReviewAt = new Date();
        nextReviewAt.setDate(nextReviewAt.getDate() + 1);
        nextReviewAt.setHours(0, 0, 0, 0);
    }
    
    // Determine best score
    const bestScore = existingProgress?.bestScore 
        ? Math.max(existingProgress.bestScore, score) 
        : score;
    
    return upsertUserProblemProgress(userId, problemTitle, {
        status: newStatus,
        bestScore,
        reviewsNeeded,
        reviewsCompleted: newReviewsCompleted,
        lastReviewedAt: new Date(),
        nextReviewAt
    });
}

// ============================================
// Queue Building
// ============================================

/**
 * Build daily practice queue with spaced repetition
 * 
 * Algorithm:
 * 1. Calculate pace (new problems per day based on days left)
 * 2. Get all due reviews (priority - sorted by most overdue)
 * 3. Get new problems (sorted by difficulty: easy → hard)
 * 4. Build queue: reviews first, then new, capped at daily limit
 * 
 * @param userId - The user's ID
 * @param topicFilter - Optional: filter problems to a specific topic (problem_group)
 */
export async function buildSpacedRepetitionQueue(
    userId: string,
    topicFilter?: string
): Promise<{
    queue: BlindProblem[];
    stats: StudyStats;
}> {
    const settings = await getSettingsWithDefaults(userId);
    const allProgress = await fetchAllUserProgress(userId);
    const dueReviews = await fetchDueReviews(userId);
    const dueTomorrow = await fetchDueTomorrow(userId);
    let allProblems = await fetchAllBlindProblems();
    
    // Apply topic filter if provided
    if (topicFilter && topicFilter !== 'all_mastered') {
        // Need to match both formatted and raw group names
        const normalizedFilter = topicFilter.toLowerCase().replace(/\s+/g, '_');
        allProblems = allProblems.filter(p => {
            const problemGroup = (p.problemGroup || '').toLowerCase().replace(/\s+/g, '_');
            const formattedGroup = formatGroupName(p.problemGroup || '').toLowerCase();
            return problemGroup.includes(normalizedFilter) || 
                   formattedGroup.toLowerCase().includes(topicFilter.toLowerCase()) ||
                   topicFilter.toLowerCase().includes(problemGroup);
        });
        console.log(`[Spaced Repetition] Filtered to topic "${topicFilter}": ${allProblems.length} problems`);
    }
    
    // Create a map of problem titles to progress
    const progressMap = new Map<string, UserProblemProgress>();
    allProgress.forEach(p => progressMap.set(p.problemTitle, p));
    
    // Calculate pace
    const today = new Date();
    const startDate = new Date(settings.startDate);
    const daysPassed = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysLeft = Math.max(1, settings.targetDays - daysPassed);
    
    // Count problems by status (for filtered set if topic provided)
    const filteredProgress = allProgress.filter(p => 
        allProblems.some(prob => prob.title === p.problemTitle)
    );
    const introducedCount = filteredProgress.filter(p => p.status !== 'new').length;
    const remainingNew = allProblems.length - introducedCount;
    
    // Calculate how many new problems per day (with 2-day buffer for reviews)
    const bufferDays = 2;
    const effectiveDaysLeft = Math.max(1, daysLeft - bufferDays);
    const newPerDay = Math.ceil(remainingNew / effectiveDaysLeft);
    
    // Get problems that have progress and are due for review (filtered by topic)
    const filteredDueReviews = dueReviews.filter(p => 
        allProblems.some(prob => prob.title === p.problemTitle)
    );
    
    const dueProblems = filteredDueReviews
        .filter(p => p.reviewsCompleted < p.reviewsNeeded)
        .map(progress => {
            const problem = allProblems.find(p => p.title === progress.problemTitle);
            return problem ? { problem, progress } : null;
        })
        .filter((item): item is { problem: BlindProblem; progress: UserProblemProgress } => item !== null);
    
    // Get new problems (not yet attempted) from filtered set
    const newProblems = allProblems
        .filter(p => !progressMap.has(p.title))
        .sort((a, b) => {
            // Sort by difficulty (easy first)
            const diffOrder = { easy: 0, medium: 1, hard: 2 };
            return diffOrder[a.difficulty] - diffOrder[b.difficulty];
        });
    
    // Build the queue
    const queue: BlindProblem[] = [];
    
    // Add due reviews first (they take priority)
    for (const { problem } of dueProblems) {
        if (queue.length >= settings.dailyCap) break;
        queue.push(problem);
    }
    
    // Fill remaining slots with new problems
    const slotsForNew = Math.min(newPerDay, settings.dailyCap - queue.length);
    queue.push(...newProblems.slice(0, slotsForNew));
    
    // Calculate stats (for the full set, not filtered)
    const fullAllProgress = allProgress;
    const stats: StudyStats = {
        totalProblems: TOTAL_BLIND_75,
        newCount: TOTAL_BLIND_75 - fullAllProgress.length,
        learningCount: fullAllProgress.filter(p => p.status === 'learning').length,
        masteredCount: fullAllProgress.filter(p => p.status === 'mastered').length,
        dueToday: dueReviews.length,
        dueTomorrow: dueTomorrow.length,
        daysLeft,
        onPace: fullAllProgress.length >= (daysPassed * (TOTAL_BLIND_75 / settings.targetDays)),
        todaysQueue: {
            newProblems: Math.min(slotsForNew, newProblems.length),
            reviews: Math.min(dueProblems.length, settings.dailyCap),
            total: queue.length
        }
    };
    
    console.log(`[Spaced Repetition] Queue built: ${queue.length} problems (${stats.todaysQueue.reviews} reviews + ${stats.todaysQueue.newProblems} new)${topicFilter ? ` [Topic: ${topicFilter}]` : ''}`);
    
    return { queue, stats };
}

// ============================================
// Progress Grid Data
// ============================================

export interface ProblemGridItem {
    problem: BlindProblem;
    progress: UserProblemProgress | null;
    isDueToday: boolean;
}

export interface GroupedProblems {
    groupName: string;
    problems: ProblemGridItem[];
    masteredCount: number;
    totalCount: number;
}

/**
 * Get all problems grouped by category with progress status
 */
export async function getProgressGrid(userId: string): Promise<GroupedProblems[]> {
    const allProgress = await fetchAllUserProgress(userId);
    const dueReviews = await fetchDueReviews(userId);
    const allProblems = await fetchAllBlindProblems();
    
    // Create maps for quick lookup
    const progressMap = new Map<string, UserProblemProgress>();
    allProgress.forEach(p => progressMap.set(p.problemTitle, p));
    
    const dueSet = new Set(dueReviews.map(p => p.problemTitle));
    
    // Group problems by problem_group
    const grouped = new Map<string, ProblemGridItem[]>();
    
    for (const problem of allProblems) {
        const groupName = problem.problemGroup || 'Other';
        if (!grouped.has(groupName)) {
            grouped.set(groupName, []);
        }
        
        const progress = progressMap.get(problem.title) || null;
        grouped.get(groupName)!.push({
            problem,
            progress,
            isDueToday: dueSet.has(problem.title)
        });
    }
    
    // Convert to array and calculate stats
    const result: GroupedProblems[] = [];
    
    // Sort groups by a predefined order
    const groupOrder = [
        'arrays_hashing',
        'two_pointers',
        'sliding_window',
        'stack',
        'binary_search',
        'linked_list',
        'trees',
        'tries',
        'heap',
        'backtracking',
        'graphs',
        'dynamic_programming_1d',
        'dynamic_programming_2d',
        'greedy',
        'intervals',
        'math_geometry',
        'bit_manipulation'
    ];
    
    const sortedGroups = Array.from(grouped.entries()).sort((a, b) => {
        const aIdx = groupOrder.indexOf(a[0]);
        const bIdx = groupOrder.indexOf(b[0]);
        if (aIdx === -1 && bIdx === -1) return a[0].localeCompare(b[0]);
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
    });
    
    for (const [groupName, problems] of sortedGroups) {
        const masteredCount = problems.filter(p => p.progress?.status === 'mastered').length;
        result.push({
            groupName: formatGroupName(groupName),
            problems,
            masteredCount,
            totalCount: problems.length
        });
    }
    
    return result;
}

/**
 * Format group name for display
 */
function formatGroupName(name: string): string {
    return name
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// ============================================
// Migration from localStorage
// ============================================

/**
 * Migrate mastered IDs from localStorage to Supabase
 */
export async function migrateFromLocalStorage(
    userId: string,
    masteredIds: string[]
): Promise<boolean> {
    if (masteredIds.length === 0) {
        return true;
    }
    
    console.log(`[Migration] Migrating ${masteredIds.length} mastered problems from localStorage`);
    
    // Create progress records for mastered problems
    const progressItems = masteredIds.map(title => ({
        problemTitle: title,
        status: 'mastered' as ProblemStatus,
        bestScore: 85, // Assume good performance since they were marked mastered
        reviewsNeeded: 1,
        reviewsCompleted: 1,
        nextReviewAt: new Date() // Due for review today (first cycle in new system)
    }));
    
    const success = await batchUpsertUserProgress(userId, progressItems);
    
    if (success) {
        console.log(`[Migration] Successfully migrated ${masteredIds.length} problems`);
    } else {
        console.error('[Migration] Failed to migrate localStorage mastery');
    }
    
    return success;
}

