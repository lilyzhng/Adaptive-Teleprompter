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
    type: 'coach' | 'walkie' | 'hot-take', 
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
    skeleton: row.skeleton,
    timeComplexity: row.time_complexity,
    spaceComplexity: row.space_complexity,
    steps: row.steps as string[],
    expectedEdgeCases: row.expected_edge_cases as string[]
});

