import { supabase } from '../config/supabase';
import { SavedItem, SavedReport, PerformanceReport, BlindProblem } from '../types';

// ========== SAVED ITEMS (Snippets) ==========

export const fetchSavedItems = async (userId: string): Promise<SavedItem[]> => {
    const { data, error } = await supabase
        .from('saved_items')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching saved items:', error);
        return [];
    }

    return data.map(item => ({
        id: item.id,
        title: item.title,
        content: item.content,
        type: item.type,
        date: item.created_at,
        question: item.question,
        humanRewrite: item.human_rewrite,
        category: item.category || '',
        rewrite: item.rewrite,
        explanation: item.explanation,
        reportData: item.report_data as any
    }));
};

export const createSavedItem = async (userId: string, item: Omit<SavedItem, 'id' | 'date'>): Promise<SavedItem | null> => {
    const { data, error } = await supabase
        .from('saved_items')
        .insert({
            user_id: userId,
            title: item.title,
            content: item.content,
            type: item.type,
            category: item.category,
            rewrite: item.rewrite,
            explanation: item.explanation,
            question: item.question,
            human_rewrite: item.humanRewrite,
            report_data: item.reportData as any
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating saved item:', error);
        return null;
    }

    return {
        id: data.id,
        title: data.title,
        content: data.content,
        type: data.type,
        date: data.created_at,
        category: data.category || '',
        rewrite: data.rewrite,
        explanation: data.explanation,
        question: data.question,
        humanRewrite: data.human_rewrite,
        reportData: data.report_data as any
    };
};

export const deleteSavedItem = async (itemId: string): Promise<boolean> => {
    const { error } = await supabase
        .from('saved_items')
        .delete()
        .eq('id', itemId);

    if (error) {
        console.error('Error deleting saved item:', error);
        return false;
    }

    return true;
};

// ========== SAVED REPORTS ==========

export const fetchSavedReports = async (userId: string): Promise<SavedReport[]> => {
    const { data, error } = await supabase
        .from('saved_reports')
        .select('*')
        .eq('user_id', userId)
        .order('report_date', { ascending: false });

    if (error) {
        console.error('Error fetching saved reports:', error);
        return [];
    }

    return data.map(report => ({
        id: report.id,
        title: report.title,
        type: report.type,
        rating: report.rating,
        reportData: report.report_data as PerformanceReport,
        date: report.report_date || report.created_at
    }));
};

export const createSavedReport = async (
    userId: string,
    title: string,
    type: 'coach' | 'walkie' | 'hot-take' | 'teach' | 'readiness',
    report: PerformanceReport
): Promise<SavedReport | null> => {
    console.log('[DEBUG] createSavedReport called:', { userId, title, type, rating: report.rating });
    
    const { data, error } = await supabase
        .from('saved_reports')
        .insert({
            user_id: userId,
            title: title || 'Untitled Session',
            type,
            rating: report.rating,
            report_data: report as any,
            report_date: new Date().toISOString()
        })
        .select()
        .single();

    if (error) {
        console.error('[DEBUG] Error creating saved report:', error);
        return null;
    }
    
    console.log('[DEBUG] Report saved successfully:', data.id);

    return {
        id: data.id,
        title: data.title,
        type: data.type,
        rating: data.rating,
        reportData: data.report_data as PerformanceReport,
        date: data.report_date || data.created_at
    };
};

export const updateSavedReport = async (reportId: string, updates: Partial<SavedReport>): Promise<boolean> => {
    const updateData: any = {};
    
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.rating !== undefined) updateData.rating = updates.rating;
    if (updates.reportData !== undefined) updateData.report_data = updates.reportData;
    if (updates.date !== undefined) updateData.report_date = updates.date;

    const { error } = await supabase
        .from('saved_reports')
        .update(updateData)
        .eq('id', reportId);

    if (error) {
        console.error('Error updating saved report:', error);
        return false;
    }

    return true;
};

export const deleteSavedReport = async (reportId: string): Promise<boolean> => {
    const { error } = await supabase
        .from('saved_reports')
        .delete()
        .eq('id', reportId);

    if (error) {
        console.error('Error deleting saved report:', error);
        return false;
    }

    return true;
};

// ========== BLIND PROBLEMS ==========

/**
 * Fetch blind problems by topics
 * Selects random problems that match any of the given topics
 */
export const fetchBlindProblemsByTopics = async (
    topics: string[],
    limit: number = 5,
    excludeIds: string[] = []
): Promise<BlindProblem[]> => {
    // Supabase doesn't have native array overlap, so we'll fetch all and filter
    // For a small dataset of 75 problems, this is efficient enough
    let query = supabase
        .from('blind_problems')
        .select('*');

    if (excludeIds.length > 0) {
        query = query.not('id', 'in', `(${excludeIds.join(',')})`);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching blind problems:', error);
        return [];
    }

    // Filter problems that match any of the requested topics
    const matchingProblems = data.filter(problem => {
        const problemTopics = problem.topics as string[];
        return problemTopics.some(topic => topics.includes(topic));
    });

    // Shuffle and take the requested number
    const shuffled = matchingProblems.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, limit);

    return selected.map(mapDbProblemToBlindProblem);
};

/**
 * Fetch a single blind problem by title
 */
export const fetchBlindProblemByTitle = async (title: string): Promise<BlindProblem | null> => {
    const { data, error } = await supabase
        .from('blind_problems')
        .select('*')
        .eq('title', title)
        .single();

    if (error) {
        console.error('Error fetching blind problem by title:', error);
        return null;
    }

    return data ? mapDbProblemToBlindProblem(data) : null;
};

/**
 * Fetch all blind problems (for stats/admin purposes)
 */
export const fetchAllBlindProblems = async (): Promise<BlindProblem[]> => {
    const { data, error } = await supabase
        .from('blind_problems')
        .select('*')
        .order('title', { ascending: true });

    if (error) {
        console.error('Error fetching all blind problems:', error);
        return [];
    }

    return data.map(mapDbProblemToBlindProblem);
};

/**
 * Get total count of blind problems
 */
export const getBlindProblemsCount = async (): Promise<number> => {
    const { count, error } = await supabase
        .from('blind_problems')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error('Error counting blind problems:', error);
        return 0;
    }

    return count || 0;
};

/**
 * Helper to map database row to BlindProblem type
 */
const mapDbProblemToBlindProblem = (row: any): BlindProblem => ({
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    example: row.example || undefined,
    constraints: row.constraints as string[],
    pattern: row.pattern,
    keyIdea: row.key_idea,
    detailedHint: row.detailed_hint || undefined,
    definition: row.definition || undefined,
    skeleton: row.skeleton,
    timeComplexity: row.time_complexity,
    spaceComplexity: row.space_complexity,
    steps: row.steps as string[],
    expectedEdgeCases: row.expected_edge_cases as string[],
    topics: row.topics as string[],
    difficulty: row.difficulty as 'easy' | 'medium' | 'hard',
    problemGroup: row.problem_group || undefined,
    leetcodeNumber: row.leetcode_number || undefined,
    mnemonicImageUrl: row.mnemonic_image_url || undefined
});

// ========== PROGRESSIVE QUEUE BUILDING ==========

type DifficultyLevel = 'easy' | 'medium' | 'hard';

/**
 * Shuffle an array in place using Fisher-Yates algorithm
 */
const shuffleArray = <T>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

/**
 * Sort problems by difficulty (easy → medium → hard)
 */
const sortByDifficulty = (problems: BlindProblem[]): BlindProblem[] => {
    const order: Record<DifficultyLevel, number> = { easy: 0, medium: 1, hard: 2 };
    return [...problems].sort((a, b) => order[a.difficulty] - order[b.difficulty]);
};

/**
 * Pick a random element from an array
 */
const pickRandom = <T>(array: T[]): T => {
    return array[Math.floor(Math.random() * array.length)];
};

/**
 * Group problems by their problem_group field
 */
const groupByProblemGroup = (problems: BlindProblem[]): Record<string, BlindProblem[]> => {
    return problems.reduce((acc, problem) => {
        const group = problem.problemGroup || 'ungrouped';
        if (!acc[group]) acc[group] = [];
        acc[group].push(problem);
        return acc;
    }, {} as Record<string, BlindProblem[]>);
};

/**
 * Build a progressive problem queue using focus groups
 * 
 * Algorithm:
 * 1. Fetch all problems, exclude mastered, filter by difficulty
 * 2. Group by problem_group
 * 3. Pick a random focus group
 * 4. Fill from focus group first
 * 5. Backfill from other groups if needed
 * 6. Sort by difficulty (easy → medium → hard)
 */
export const buildProblemQueue = async (
    masteredIds: string[],
    allowedDifficulties: DifficultyLevel[],
    limit: number = 5
): Promise<BlindProblem[]> => {
    // 1. Fetch all problems
    let query = supabase
        .from('blind_problems')
        .select('*');

    // Exclude mastered problems
    if (masteredIds.length > 0) {
        // Supabase uses title for mastered IDs in this app
        query = query.not('title', 'in', `(${masteredIds.map(id => `"${id}"`).join(',')})`);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching problems for queue:', error);
        return [];
    }

    if (!data || data.length === 0) {
        console.warn('No problems found in database');
        return [];
    }

    // Map to BlindProblem type
    const allProblems = data.map(mapDbProblemToBlindProblem);

    // 2. Filter by allowed difficulties
    const filteredProblems = allProblems.filter(p => 
        allowedDifficulties.includes(p.difficulty)
    );

    if (filteredProblems.length === 0) {
        console.warn('No problems match the difficulty filter, falling back to all difficulties');
        // Fallback: use all problems if no match
        const fallback = allProblems.slice(0, limit);
        return sortByDifficulty(shuffleArray(fallback));
    }

    // 3. Group by problem_group
    const byGroup = groupByProblemGroup(filteredProblems);
    const groupNames = Object.keys(byGroup);

    if (groupNames.length === 0) {
        // No groups, just shuffle and return
        return sortByDifficulty(shuffleArray(filteredProblems).slice(0, limit));
    }

    // 4. Pick a random focus group
    const focusGroup = pickRandom(groupNames);
    console.log(`[Queue Builder] Focus group: ${focusGroup}`);

    // 5. Start with focus group problems (shuffled)
    const queue: BlindProblem[] = shuffleArray([...byGroup[focusGroup]]);
    delete byGroup[focusGroup];

    // 6. Backfill from other groups if needed
    const remainingGroups = Object.keys(byGroup);
    while (queue.length < limit && remainingGroups.length > 0) {
        const nextGroupIdx = Math.floor(Math.random() * remainingGroups.length);
        const nextGroup = remainingGroups[nextGroupIdx];
        
        // Add shuffled problems from next group
        queue.push(...shuffleArray(byGroup[nextGroup]));
        
        // Remove from remaining groups
        remainingGroups.splice(nextGroupIdx, 1);
    }

    // 7. Sort by difficulty and take first `limit`
    const finalQueue = sortByDifficulty(queue).slice(0, limit);
    
    console.log(`[Queue Builder] Final queue: ${finalQueue.map(p => `${p.title} (${p.difficulty})`).join(', ')}`);
    
    return finalQueue;
};

// ========== SPACED REPETITION: USER STUDY SETTINGS ==========

import { UserStudySettings, UserProblemProgress, ProblemStatus } from '../types/database';

/**
 * Fetch user study settings
 */
export const fetchUserStudySettings = async (userId: string): Promise<UserStudySettings | null> => {
    const { data, error } = await supabase
        .from('user_study_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            // No settings found - return null
            return null;
        }
        console.error('Error fetching user study settings:', error);
        return null;
    }

    return {
        userId: data.user_id,
        targetDays: data.target_days,
        dailyCap: data.daily_cap,
        easyBonus: data.easy_bonus,
        startDate: new Date(data.start_date)
    };
};

/**
 * Create or update user study settings
 */
export const upsertUserStudySettings = async (
    userId: string,
    settings: Partial<Omit<UserStudySettings, 'userId'>>
): Promise<UserStudySettings | null> => {
    const { data, error } = await supabase
        .from('user_study_settings')
        .upsert({
            user_id: userId,
            target_days: settings.targetDays,
            daily_cap: settings.dailyCap,
            easy_bonus: settings.easyBonus,
            start_date: settings.startDate?.toISOString()
        }, { onConflict: 'user_id' })
        .select()
        .single();

    if (error) {
        console.error('Error upserting user study settings:', error);
        return null;
    }

    return {
        userId: data.user_id,
        targetDays: data.target_days,
        dailyCap: data.daily_cap,
        easyBonus: data.easy_bonus,
        startDate: new Date(data.start_date)
    };
};

// ========== SPACED REPETITION: USER PROBLEM PROGRESS ==========

/**
 * Helper to map database row to UserProblemProgress type
 */
const mapDbProgressToProgress = (row: any): UserProblemProgress => ({
    id: row.id,
    userId: row.user_id,
    problemTitle: row.problem_title,
    status: row.status as ProblemStatus,
    bestScore: row.best_score,
    reviewsNeeded: row.reviews_needed,
    reviewsCompleted: row.reviews_completed,
    lastReviewedAt: row.last_reviewed_at ? new Date(row.last_reviewed_at) : null,
    nextReviewAt: row.next_review_at ? new Date(row.next_review_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
});

/**
 * Fetch all problem progress for a user
 */
export const fetchAllUserProgress = async (userId: string): Promise<UserProblemProgress[]> => {
    const { data, error } = await supabase
        .from('user_problem_progress')
        .select('*')
        .eq('user_id', userId)
        .order('problem_title', { ascending: true });

    if (error) {
        console.error('Error fetching user problem progress:', error);
        return [];
    }

    return data.map(mapDbProgressToProgress);
};

/**
 * Fetch progress for a single problem
 */
export const fetchUserProgressByTitle = async (
    userId: string,
    problemTitle: string
): Promise<UserProblemProgress | null> => {
    const { data, error } = await supabase
        .from('user_problem_progress')
        .select('*')
        .eq('user_id', userId)
        .eq('problem_title', problemTitle)
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            return null; // Not found
        }
        console.error('Error fetching user progress by title:', error);
        return null;
    }

    return mapDbProgressToProgress(data);
};

/**
 * Fetch problems due for review (next_review_at <= today)
 */
export const fetchDueReviews = async (userId: string): Promise<UserProblemProgress[]> => {
    const today = new Date().toISOString();
    
    const { data, error } = await supabase
        .from('user_problem_progress')
        .select('*')
        .eq('user_id', userId)
        .neq('status', 'mastered')
        .lte('next_review_at', today)
        .order('next_review_at', { ascending: true });

    if (error) {
        console.error('Error fetching due reviews:', error);
        return [];
    }

    return data.map(mapDbProgressToProgress);
};

/**
 * Fetch problems due tomorrow
 */
export const fetchDueTomorrow = async (userId: string): Promise<UserProblemProgress[]> => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);
    
    const { data, error } = await supabase
        .from('user_problem_progress')
        .select('*')
        .eq('user_id', userId)
        .neq('status', 'mastered')
        .gt('next_review_at', today.toISOString())
        .lte('next_review_at', tomorrow.toISOString())
        .order('next_review_at', { ascending: true });

    if (error) {
        console.error('Error fetching due tomorrow:', error);
        return [];
    }

    return data.map(mapDbProgressToProgress);
};

/**
 * Create or update problem progress
 */
export const upsertUserProblemProgress = async (
    userId: string,
    problemTitle: string,
    updates: Partial<Omit<UserProblemProgress, 'id' | 'userId' | 'problemTitle' | 'createdAt' | 'updatedAt'>>
): Promise<UserProblemProgress | null> => {
    const { data, error } = await supabase
        .from('user_problem_progress')
        .upsert({
            user_id: userId,
            problem_title: problemTitle,
            status: updates.status,
            best_score: updates.bestScore,
            reviews_needed: updates.reviewsNeeded,
            reviews_completed: updates.reviewsCompleted,
            last_reviewed_at: updates.lastReviewedAt?.toISOString(),
            next_review_at: updates.nextReviewAt?.toISOString()
        }, { onConflict: 'user_id,problem_title' })
        .select()
        .single();

    if (error) {
        console.error('Error upserting user problem progress:', error);
        return null;
    }

    return mapDbProgressToProgress(data);
};

/**
 * Batch upsert problem progress (for migration)
 */
export const batchUpsertUserProgress = async (
    userId: string,
    progressItems: Array<{
        problemTitle: string;
        status: ProblemStatus;
        bestScore?: number;
        reviewsNeeded?: number;
        reviewsCompleted?: number;
        nextReviewAt?: Date;
    }>
): Promise<boolean> => {
    const records = progressItems.map(item => ({
        user_id: userId,
        problem_title: item.problemTitle,
        status: item.status,
        best_score: item.bestScore || null,
        reviews_needed: item.reviewsNeeded || 2,
        reviews_completed: item.reviewsCompleted || 0,
        next_review_at: item.nextReviewAt?.toISOString() || null,
        last_reviewed_at: item.status !== 'new' ? new Date().toISOString() : null
    }));

    const { error } = await supabase
        .from('user_problem_progress')
        .upsert(records, { onConflict: 'user_id,problem_title' });

    if (error) {
        console.error('Error batch upserting user progress:', error);
        return false;
    }

    return true;
};

/**
 * Get progress statistics for a user
 */
export const getProgressStats = async (userId: string): Promise<{
    newCount: number;
    learningCount: number;
    masteredCount: number;
    dueToday: number;
}> => {
    const allProgress = await fetchAllUserProgress(userId);
    const dueReviews = await fetchDueReviews(userId);

    return {
        newCount: allProgress.filter(p => p.status === 'new').length,
        learningCount: allProgress.filter(p => p.status === 'learning').length,
        masteredCount: allProgress.filter(p => p.status === 'mastered').length,
        dueToday: dueReviews.length
    };
};

