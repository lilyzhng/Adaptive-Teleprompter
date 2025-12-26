
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Database, Trash2, Lightbulb, PenTool, Star, Ear, Mic2, FileText, Calendar, ArrowLeft, Edit2, Check, X, Play, Award, Zap, Code2, GraduationCap, Layers, TrendingUp, Target, ChevronLeft, ChevronRight, Clock, AlertCircle, BarChart3 } from 'lucide-react';
import { SavedItem, SavedReport } from '../types';
import { StudyStats } from '../types/database';
import PerformanceReportComponent from '../components/PerformanceReport';
import TeachingReportComponent from '../components/TeachingReport';
import ReadinessReportComponent from '../components/ReadinessReport';
import { titleToSlug, findReportBySlug } from '../utils';
import { useAuth } from '../contexts/AuthContext';
import { 
    getSettingsWithDefaults, 
    getProgressGrid, 
    GroupedProblems 
} from '../services/spacedRepetitionService';
import { 
    fetchAllUserProgress, 
    fetchDueReviews, 
    fetchDueTomorrow 
} from '../services/databaseService';

// Helper to get date string in YYYY-MM-DD format (LOCAL timezone)
const getDateString = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  // Use local timezone instead of UTC
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper to count mastered questions by date from saved reports
const countMasteredByDate = (reports: SavedReport[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  
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

// Count all attempts (not just mastered) by date
const countAttemptsByDate = (reports: SavedReport[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  
  const relevantReports = reports.filter(r => r.type === 'walkie' || r.type === 'teach');
  
  for (const report of relevantReports) {
    const dateStr = getDateString(report.date);
    counts[dateStr] = (counts[dateStr] || 0) + 1;
  }
  
  return counts;
};

// Get days in a month
const getDaysInMonth = (year: number, month: number): number => {
  return new Date(year, month + 1, 0).getDate();
};

// Get first day of month (0 = Sunday, 1 = Monday, etc.)
const getFirstDayOfMonth = (year: number, month: number): number => {
  return new Date(year, month, 1).getDay();
};

// Format seconds into a readable time string (e.g., "5m 30s" or "1h 15m")
const formatTimeSpent = (seconds: number | undefined): string => {
  if (!seconds || seconds <= 0) return '-';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
};


// Report type configuration for display
type ReportTypeFilter = 'all' | 'coach' | 'hot-take' | 'walkie' | 'teach' | 'readiness';
const REPORT_TYPE_CONFIG: Record<Exclude<ReportTypeFilter, 'all'>, { label: string; title: string; color: string; icon: React.ReactNode }> = {
    'coach': { label: 'Interview', title: 'Interview Reports', color: 'gold', icon: <Award size={12} /> },
    'hot-take': { label: 'Tech Drill', title: 'Tech Drill Reports', color: 'purple-500', icon: <Zap size={12} /> },
    'walkie': { label: 'LeetCode', title: 'LeetCode Reports', color: 'blue-500', icon: <Code2 size={12} /> },
    'teach': { label: 'Teach', title: 'Teaching Reports', color: 'emerald-500', icon: <GraduationCap size={12} /> },
    'readiness': { label: 'Explain', title: 'Explain (Readiness) Reports', color: 'teal-500', icon: <Layers size={12} /> }
};

interface DatabaseViewProps {
    savedItems: SavedItem[];
    savedReports: SavedReport[];
    onDeleteSnippet: (id: string) => void;
    onDeleteReport: (id: string) => void;
    onUpdateReport: (id: string, updates: Partial<SavedReport>) => void;
    onHome: () => void;
    isSaved: (title: string, content: string) => boolean;
    onToggleSave: (item: Omit<SavedItem, 'id' | 'date'>) => void;
    selectedReportSlug?: string;
}

const DatabaseView: React.FC<DatabaseViewProps> = ({ 
    savedItems, 
    savedReports, 
    onDeleteSnippet, 
    onDeleteReport, 
    onUpdateReport,
    onHome,
    isSaved,
    onToggleSave,
    selectedReportSlug
}) => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'reports' | 'snippets' | 'progress'>('reports');
    const [reportTypeFilter, setReportTypeFilter] = useState<ReportTypeFilter>('all');
    const selectedReport = selectedReportSlug ? findReportBySlug(savedReports, selectedReportSlug) : null;
    
    // Edit State
    const [editingReportId, setEditingReportId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<{ title: string; date: string }>({ title: '', date: '' });
    
    // Calendar navigation state for Progress tab
    const [calendarDate, setCalendarDate] = useState(() => new Date());
    
    // Spaced Repetition State
    const [studyStats, setStudyStats] = useState<StudyStats | null>(null);
    const [progressGrid, setProgressGrid] = useState<GroupedProblems[]>([]);
    const [dueToday, setDueToday] = useState<Array<{ problemTitle: string; bestScore: number | null; lastReviewedAt: Date | null }>>([]);
    const [dueTomorrow, setDueTomorrow] = useState<Array<{ problemTitle: string }>>([]);
    const [isLoadingProgress, setIsLoadingProgress] = useState(false);
    const [dailyCap, setDailyCap] = useState(10);
    const [targetDays, setTargetDays] = useState(10);
    const [showTodayDetails, setShowTodayDetails] = useState(false);
    const [showMasteredDetails, setShowMasteredDetails] = useState(false);
    
    // Helper to find the teach report for a problem
    const findTeachReportForProblem = (problemTitle: string): SavedReport | undefined => {
        // Find the most recent teach report matching this problem title
        return savedReports
            .filter(r => r.type === 'teach' && r.title === problemTitle)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    };
    
    // Get all mastered problems from progressGrid
    const allMasteredProblems = useMemo(() => {
        const mastered: Array<{ title: string; group: string; difficulty: 'easy' | 'medium' | 'hard'; bestScore: number | null }> = [];
        progressGrid.forEach(group => {
            group.problems.forEach(item => {
                if (item.progress?.status === 'mastered') {
                    mastered.push({
                        title: item.problem.title,
                        group: group.groupName,
                        difficulty: item.problem.difficulty,
                        bestScore: item.progress.bestScore
                    });
                }
            });
        });
        return mastered;
    }, [progressGrid]);
    
    // Get all today's reports (including readiness reports for time tracking)
    const todayAllReports = useMemo(() => {
        const todayStr = getDateString(new Date());
        return savedReports.filter(r => {
            if (r.type !== 'walkie' && r.type !== 'teach' && r.type !== 'readiness') return false;
            const reportDate = getDateString(r.date);
            return reportDate === todayStr;
        });
    }, [savedReports]);
    
    // Calculate cumulative time and attempt count per problem (sum all attempts: explain + teach + retries)
    const problemStatsMap = useMemo(() => {
        const statsMap: Record<string, { time: number; attempts: number }> = {};
        for (const r of todayAllReports) {
            const time = r.reportData?.timeSpentSeconds ?? 0;
            if (!statsMap[r.title]) {
                statsMap[r.title] = { time: 0, attempts: 0 };
            }
            statsMap[r.title].time += time;
            statsMap[r.title].attempts += 1;
        }
        return statsMap;
    }, [todayAllReports]);
    
    // Calculate today's reports with details (grouped by problem, with cumulative time)
    const todayReports = useMemo(() => {
        const todayStr = getDateString(new Date());
        // Get only walkie and teach reports for display (not readiness)
        const relevantReports = savedReports.filter(r => {
            if (r.type !== 'walkie' && r.type !== 'teach') return false;
            const reportDate = getDateString(r.date);
            return reportDate === todayStr;
        });
        
        // Group by problem title - take the best/latest result per problem
        const problemMap = new Map<string, {
            title: string;
            type: string;
            isMastered: boolean;
            score: number;
            date: string;
            timeSpentSeconds: number;
            attemptCount: number;
        }>();
        
        for (const r of relevantReports) {
            let isMastered = false;
            let score = 0;
            
            if (r.type === 'walkie') {
                isMastered = r.reportData?.detectedAutoScore === 'good';
                score = r.reportData?.rating ?? 0;
            } else if (r.type === 'teach') {
                const teachingData = r.reportData?.teachingReportData;
                isMastered = teachingData?.studentOutcome === 'can_implement' && 
                            (teachingData?.teachingScore ?? 0) >= 75;
                score = teachingData?.teachingScore ?? 0;
            }
            
            const stats = problemStatsMap[r.title] || { time: 0, attempts: 0 };
            const existing = problemMap.get(r.title);
            if (!existing) {
                problemMap.set(r.title, {
                    title: r.title,
                    type: r.type,
                    isMastered,
                    score,
                    date: r.date,
                    timeSpentSeconds: stats.time, // Use cumulative time from all reports
                    attemptCount: stats.attempts // Use cumulative attempts from all reports
                });
            } else {
                // Update with better result if this attempt was successful
                if (isMastered && !existing.isMastered) {
                    existing.isMastered = true;
                    existing.score = score;
                    existing.type = r.type;
                }
                // Always use cumulative stats
                existing.timeSpentSeconds = stats.time;
                existing.attemptCount = stats.attempts;
            }
        }
        
        return Array.from(problemMap.values());
    }, [savedReports, problemStatsMap]);
    
    // Calculate today's total study time (sum of all individual report times)
    const todayTotalTime = useMemo(() => {
        return todayAllReports.reduce((sum, r) => sum + (r.reportData?.timeSpentSeconds || 0), 0);
    }, [todayAllReports]);
    
    // Split into mastered and attempted (not mastered)
    const todayMastered = useMemo(() => 
        todayReports.filter(r => r.isMastered), [todayReports]);
    const todayAttempted = useMemo(() => 
        todayReports.filter(r => !r.isMastered), [todayReports]);
    const todayCompleted = todayMastered.length;
    
    // Load spaced repetition data when Progress tab is active
    useEffect(() => {
        if (activeTab !== 'progress' || !user?.id) return;
        
        const loadProgressData = async () => {
            setIsLoadingProgress(true);
            try {
                const [settings, allProgress, dueReviews, dueTomorrowData, grid] = await Promise.all([
                    getSettingsWithDefaults(user.id),
                    fetchAllUserProgress(user.id),
                    fetchDueReviews(user.id),
                    fetchDueTomorrow(user.id),
                    getProgressGrid(user.id)
                ]);
                
                // Calculate study stats
                const today = new Date();
                const startDate = new Date(settings.startDate);
                const daysPassed = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
                const daysLeft = Math.max(1, settings.targetDays - daysPassed);
                
                const newCount = 75 - allProgress.length;
                const learningCount = allProgress.filter(p => p.status === 'learning').length;
                const masteredCount = allProgress.filter(p => p.status === 'mastered').length;
                
                // Calculate today's queue
                const remainingNew = 75 - allProgress.filter(p => p.status !== 'new').length;
                const effectiveDaysLeft = Math.max(1, daysLeft - 2);
                const newPerDay = Math.ceil(remainingNew / effectiveDaysLeft);
                const reviewCount = dueReviews.length;
                const newProblemCount = Math.min(newPerDay, settings.dailyCap - reviewCount);
                
                setDailyCap(settings.dailyCap);
                setTargetDays(settings.targetDays);
                setStudyStats({
                    totalProblems: 75,
                    newCount,
                    learningCount,
                    masteredCount,
                    dueToday: dueReviews.length,
                    dueTomorrow: dueTomorrowData.length,
                    daysLeft,
                    onPace: allProgress.filter(p => p.status !== 'new').length >= (daysPassed * (75 / settings.targetDays)),
                    todaysQueue: {
                        newProblems: Math.max(0, newProblemCount),
                        reviews: reviewCount,
                        total: Math.min(settings.dailyCap, reviewCount + newProblemCount)
                    }
                });
                
                setDueToday(dueReviews.map(p => ({
                    problemTitle: p.problemTitle,
                    bestScore: p.bestScore,
                    lastReviewedAt: p.lastReviewedAt
                })));
                
                setDueTomorrow(dueTomorrowData.map(p => ({
                    problemTitle: p.problemTitle
                })));
                
                setProgressGrid(grid);
            } catch (error) {
                console.error('Error loading progress data:', error);
            } finally {
                setIsLoadingProgress(false);
            }
        };
        
        loadProgressData();
    }, [activeTab, user?.id]);
    
    // Compute daily stats
    const masteredByDate = useMemo(() => countMasteredByDate(savedReports), [savedReports]);
    const attemptsByDate = useMemo(() => countAttemptsByDate(savedReports), [savedReports]);
    
    
    // Filter reports based on selected type
    const filteredReports = savedReports.filter(r => {
        if (reportTypeFilter === 'all') return true;
        return r.type === reportTypeFilter;
    });
    
    // Count reports by type
    const reportCounts = {
        all: savedReports.length,
        coach: savedReports.filter(r => r.type === 'coach').length,
        'hot-take': savedReports.filter(r => r.type === 'hot-take').length,
        walkie: savedReports.filter(r => r.type === 'walkie').length,
        teach: savedReports.filter(r => r.type === 'teach').length,
        readiness: savedReports.filter(r => r.type === 'readiness').length
    };

    const startEditing = (report: SavedReport) => {
        setEditingReportId(report.id);
        // Use local time components to match what the user sees in the UI
        const d = new Date(report.date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        setEditForm({ title: report.title, date: dateStr });
    };

    const cancelEditing = () => {
        setEditingReportId(null);
        setEditForm({ title: '', date: '' });
    };

    const saveEditing = (id: string) => {
        // Construct date object in local time to preserve the selected day
        const [y, m, d] = editForm.date.split('-').map(Number);
        const newDate = new Date(y, m - 1, d); // Local midnight
        
        onUpdateReport(id, { 
            title: editForm.title, 
            date: newDate.toISOString() 
        });
        setEditingReportId(null);
    };

    // If Viewing a specific report
    if (selectedReport) {
        // Check if this is a teaching report with full data
        const isTeachReport = selectedReport.type === 'teach';
        const isReadinessReport = selectedReport.type === 'readiness';
        const teachingData = selectedReport.reportData.teachingReportData;
        const teachingSession = selectedReport.reportData.teachingSession;
        const readinessData = selectedReport.reportData.readinessReportData;
        
        return (
            <div className="h-full bg-cream text-charcoal flex flex-col font-sans overflow-hidden">
                <div className="h-20 bg-white border-b border-[#E6E6E6] flex items-center justify-between px-8 z-50 shrink-0">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/database')} className="flex items-center gap-2 px-4 py-2 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors text-xs font-bold uppercase tracking-widest text-gray-600">
                            <ArrowLeft size={14} /> Back to Database
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-8">
                     <div className="max-w-4xl mx-auto pb-20">
                         {isTeachReport && teachingData ? (
                             <TeachingReportComponent 
                                report={teachingData}
                                juniorSummary={selectedReport.reportData.juniorSummary}
                                problemTitle={selectedReport.title}
                                problem={selectedReport.reportData.teachingProblem}
                                onContinue={() => navigate('/database')}
                                onTryAgain={() => navigate('/walkie-talkie', { 
                                    state: { teachAgainProblem: selectedReport.title } 
                                })}
                                isLastProblem={true}
                                teachingSession={teachingSession}
                             />
                         ) : isReadinessReport && readinessData ? (
                             <ReadinessReportComponent 
                                report={readinessData}
                                problemTitle={selectedReport.title}
                                problem={selectedReport.reportData.readinessProblem}
                                onContinueToTeach={() => navigate('/walkie-talkie', { 
                                    state: { teachAgainProblem: selectedReport.title } 
                                })}
                                onTryAgain={() => navigate('/walkie-talkie')}
                                rawTranscript={selectedReport.reportData.rawTranscript}
                                refinedTranscript={selectedReport.reportData.refinedTranscript}
                             />
                         ) : (
                             <PerformanceReportComponent 
                                report={selectedReport.reportData}
                                reportType={selectedReport.type as 'coach' | 'walkie' | 'hot-take'}
                                transcript={selectedReport.reportData.refinedTranscript}
                                context={selectedReport.title}
                                isSaved={isSaved} 
                                onToggleSave={onToggleSave} 
                                onDone={() => navigate('/database')} 
                             />
                         )}
                     </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full bg-cream text-charcoal flex flex-col font-sans overflow-hidden">
             {/* Header */}
             <div className="h-20 bg-white border-b border-[#E6E6E6] flex items-center justify-between px-8 z-50 shrink-0">
                  <div className="flex items-center gap-4">
                      <button onClick={onHome} className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors">
                          <Home size={18} className="text-gray-500" />
                      </button>
                      <div>
                          <div className="text-[10px] font-bold text-gold uppercase tracking-widest">MicDrop</div>
                          <h2 className="text-xl font-serif font-bold text-charcoal">
                              My Database
                          </h2>
                      </div>
                  </div>
             </div>

             {/* Tab Navigation */}
             <div className="flex justify-center border-b border-[#E6E6E6] bg-white">
                 <button 
                    onClick={() => setActiveTab('reports')}
                    className={`px-6 sm:px-8 py-4 text-xs sm:text-sm font-bold uppercase tracking-widest border-b-2 transition-colors ${activeTab === 'reports' ? 'border-gold text-charcoal' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                 >
                    Full Reports
                 </button>
                 <button 
                    onClick={() => setActiveTab('progress')}
                    className={`px-6 sm:px-8 py-4 text-xs sm:text-sm font-bold uppercase tracking-widest border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'progress' ? 'border-gold text-charcoal' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                 >
                    <TrendingUp size={14} /> Progress
                 </button>
                 <button 
                    onClick={() => setActiveTab('snippets')}
                    className={`px-6 sm:px-8 py-4 text-xs sm:text-sm font-bold uppercase tracking-widest border-b-2 transition-colors ${activeTab === 'snippets' ? 'border-gold text-charcoal' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                 >
                    Saved Snippets
                 </button>
             </div>
             
             <div className="flex-1 overflow-y-auto p-8 relative min-h-0">
                 <div className="max-w-4xl mx-auto pb-20">
                     
                     {/* --- REPORTS TAB --- */}
                     {activeTab === 'reports' && (
                         <>
                             {/* Report Type Filter */}
                             <div className="flex flex-wrap gap-2 mb-6">
                                 <button
                                     onClick={() => setReportTypeFilter('all')}
                                     className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${reportTypeFilter === 'all' ? 'bg-charcoal text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'}`}
                                 >
                                     All ({reportCounts.all})
                                 </button>
                                 <button
                                     onClick={() => setReportTypeFilter('coach')}
                                     className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-1.5 ${reportTypeFilter === 'coach' ? 'bg-gold text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gold/50'}`}
                                 >
                                     <Award size={12} /> Interview ({reportCounts.coach})
                                 </button>
                                 <button
                                     onClick={() => setReportTypeFilter('hot-take')}
                                     className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-1.5 ${reportTypeFilter === 'hot-take' ? 'bg-purple-500 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-purple-300'}`}
                                 >
                                     <Zap size={12} /> Tech Drill ({reportCounts['hot-take']})
                                 </button>
                                 <button
                                     onClick={() => setReportTypeFilter('walkie')}
                                     className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-1.5 ${reportTypeFilter === 'walkie' ? 'bg-blue-500 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-blue-300'}`}
                                 >
                                     <Code2 size={12} /> LeetCode ({reportCounts.walkie})
                                 </button>
                                 <button
                                     onClick={() => setReportTypeFilter('teach')}
                                     className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-1.5 ${reportTypeFilter === 'teach' ? 'bg-emerald-500 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-emerald-300'}`}
                                 >
                                     <GraduationCap size={12} /> Teach ({reportCounts.teach})
                                 </button>
                                 <button
                                     onClick={() => setReportTypeFilter('readiness')}
                                     className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-1.5 ${reportTypeFilter === 'readiness' ? 'bg-teal-500 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-teal-300'}`}
                                 >
                                     <Layers size={12} /> Explain ({reportCounts.readiness})
                                 </button>
                             </div>

                             {filteredReports.length === 0 ? (
                                <div className="text-center py-20">
                                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-400">
                                        <FileText size={32} />
                                    </div>
                                    <h3 className="text-2xl font-serif font-bold text-charcoal mb-2">
                                        {reportTypeFilter === 'all' ? 'No Reports Yet' : `No ${REPORT_TYPE_CONFIG[reportTypeFilter as keyof typeof REPORT_TYPE_CONFIG]?.title || 'Reports'}`}
                                    </h3>
                                    <p className="text-gray-500 max-w-sm mx-auto">
                                        {reportTypeFilter === 'coach' && 'Complete an interview analysis in The Coach to see reports here.'}
                                        {reportTypeFilter === 'hot-take' && 'Complete a Hot Take drill session to see reports here.'}
                                        {reportTypeFilter === 'walkie' && 'Practice problems in WalkieTalkie to see reports here.'}
                                        {reportTypeFilter === 'teach' && 'Complete a teaching session in Teach mode to see reports here.'}
                                        {reportTypeFilter === 'readiness' && 'Complete the Explain phase (Pass 1) in Paired Learning mode to see reports here.'}
                                        {reportTypeFilter === 'all' && 'Your performance reports from all features will appear here.'}
                                    </p>
                                </div>
                             ) : (
                                 <div className="space-y-4">
                                     {filteredReports.map(report => {
                                         const isEditing = editingReportId === report.id;
                                         const typeConfig = REPORT_TYPE_CONFIG[report.type as keyof typeof REPORT_TYPE_CONFIG];
                                         const badgeColors: Record<string, string> = {
                                             'coach': 'bg-gold/10 text-gold',
                                             'hot-take': 'bg-purple-500/10 text-purple-600',
                                             'walkie': 'bg-blue-500/10 text-blue-600',
                                             'teach': 'bg-emerald-500/10 text-emerald-600',
                                             'readiness': 'bg-teal-500/10 text-teal-600'
                                         };
                                         const ringColors: Record<string, string> = {
                                             'coach': '#C7A965',
                                             'hot-take': '#a855f7',
                                             'walkie': '#3b82f6',
                                             'teach': '#10b981',
                                             'readiness': '#14b8a6'
                                         };
                                         return (
                                         <div key={report.id} className="bg-white rounded-xl p-6 shadow-sm border border-[#EBE8E0] hover:shadow-md transition-shadow flex items-center gap-6 group">
                                             {/* Score Badge */}
                                             <div className="shrink-0 relative w-16 h-16 flex items-center justify-center">
                                                <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(${ringColors[report.type]} ${report.rating}%, #F0EBE0 ${report.rating}% 100%)` }}></div>
                                                <div className="absolute inset-1 bg-white rounded-full flex flex-col items-center justify-center z-10">
                                                    <span className="text-lg font-serif font-bold text-charcoal">{report.rating}</span>
                                                </div>
                                             </div>

                                             <div className="flex-1 min-w-0">
                                                 <div className="flex items-center gap-2 mb-1">
                                                     <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full flex items-center gap-1 ${badgeColors[report.type]}`}>
                                                         {typeConfig?.icon} {typeConfig?.label || report.type}
                                                     </span>
                                                 
                                                 {isEditing ? (
                                                     <input 
                                                        type="date"
                                                        value={editForm.date}
                                                        onChange={(e) => setEditForm({...editForm, date: e.target.value})}
                                                        className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded px-2 py-0.5 focus:border-gold outline-none"
                                                     />
                                                 ) : (
                                                     <span className="text-xs text-gray-400 flex items-center gap-1">
                                                         <Calendar size={12} /> {new Date(report.date).toLocaleDateString()}
                                                     </span>
                                                 )}
                                             </div>
                                             
                                             {isEditing ? (
                                                 <input 
                                                     type="text"
                                                     value={editForm.title}
                                                     onChange={(e) => setEditForm({...editForm, title: e.target.value})}
                                                     className="text-lg font-bold text-charcoal w-full bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:border-gold outline-none"
                                                     autoFocus
                                                 />
                                             ) : (
                                                 <h3 className="text-lg font-bold text-charcoal truncate">{report.title}</h3>
                                             )}
                                         </div>

                                         <div className={`flex items-center gap-3 transition-opacity ${isEditing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                             {isEditing ? (
                                                 <>
                                                     <button 
                                                        onClick={() => saveEditing(report.id)}
                                                        className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                                                        title="Save Changes"
                                                     >
                                                         <Check size={16} />
                                                     </button>
                                                     <button 
                                                        onClick={cancelEditing}
                                                        className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                                                        title="Cancel"
                                                     >
                                                         <X size={16} />
                                                     </button>
                                                 </>
                                             ) : (
                                                 <>
                                                     <button 
                                                        onClick={() => startEditing(report)}
                                                        className="p-2 text-gray-300 hover:text-gold transition-colors"
                                                        title="Edit Report Details"
                                                     >
                                                         <Edit2 size={16} />
                                                     </button>
                                                    <button 
                                                       onClick={() => navigate(`/report/${titleToSlug(report.title)}`)}
                                                       className="px-4 py-2 bg-charcoal text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-black transition-colors"
                                                    >
                                                       View
                                                    </button>
                                                     <button 
                                                        onClick={(e) => { e.stopPropagation(); onDeleteReport(report.id); }}
                                                        className="p-2 text-gray-300 hover:text-red-400 transition-colors"
                                                        title="Delete Report"
                                                     >
                                                         <Trash2 size={16} />
                                                     </button>
                                                 </>
                                             )}
                                         </div>
                                    </div>
                                )})}
                            </div>
                         )}
                         </>
                     )}

                     {/* --- PROGRESS TAB --- */}
                     {activeTab === 'progress' && (
                         <div className="space-y-8">
                             {/* Study Plan Dashboard - Flat dark theme matching WalkieTalkie */}
                             {studyStats && (
                                 <div className="bg-charcoal rounded-2xl border border-white/10 overflow-hidden text-white">
                                     {/* Header */}
                                     <div className="px-6 py-4 bg-black border-b border-white/5 flex items-center justify-between">
                                         <div className="flex items-center gap-3">
                                             <Calendar size={18} className="text-gold" />
                                             <span className="text-sm font-bold uppercase tracking-widest text-gold">Study Plan</span>
                                             <span className="text-gray-600">•</span>
                                             <span className="text-sm font-medium text-gray-300">
                                                 Day {Math.max(1, targetDays - studyStats.daysLeft + 1)} of {targetDays}
                                             </span>
                                         </div>
                                         <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                                             studyStats.onPace 
                                                 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                                                 : 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                                         }`}>
                                             {studyStats.onPace ? 'On Pace' : 'Behind'}
                                         </div>
                                     </div>
                                     
                                     {/* Progress Cards */}
                                     <div className="p-6 grid grid-cols-2 gap-4">
                                         {/* Today's Progress - Clickable */}
                                         <button 
                                             onClick={() => setShowTodayDetails(true)}
                                             className="bg-white/5 rounded-xl p-5 border border-white/10 text-left hover:bg-white/10 hover:border-gold/30 transition-all cursor-pointer group"
                                         >
                                             <div className="flex items-center justify-between mb-3">
                                                 <div className="flex items-center gap-2">
                                                     <Target size={16} className="text-gold" />
                                                     <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Today's Progress</span>
                                                 </div>
                                                 <span className="text-[10px] text-gray-500 group-hover:text-gold transition-colors">View details →</span>
                                             </div>
                                            <div className="flex items-center gap-6">
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-4xl font-bold text-white">{todayCompleted}</span>
                                                    <span className="text-xl text-gray-500">/ {dailyCap}</span>
                                                </div>
                                                <div className="flex-1">
                                                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                                        <div 
                                                            className="h-full bg-gold transition-all duration-500" 
                                                            style={{ width: `${Math.min(100, (todayCompleted / dailyCap) * 100)}%` }}
                                                        />
                                                    </div>
                                                    <div className="text-xs text-gray-500 mt-2">
                                                        {todayCompleted >= dailyCap ? '🎉 Goal reached!' : `${dailyCap - todayCompleted} more to go`}
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                         
                                         {/* Today's Study Time */}
                                         <div className="bg-white/5 rounded-xl p-5 border border-white/10">
                                             <div className="flex items-center gap-2 mb-3">
                                                 <Clock size={16} className="text-blue-400" />
                                                 <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Today's Study Time</span>
                                             </div>
                                             <div className="flex items-baseline gap-2">
                                                 <span className="text-4xl font-bold text-blue-400">
                                                     {todayTotalTime > 0 ? formatTimeSpent(todayTotalTime) : '0m'}
                                                 </span>
                                             </div>
                                             <div className="text-xs text-gray-500 mt-3">
                                                 {todayTotalTime === 0 
                                                     ? 'Start practicing to track time' 
                                                     : `Across ${todayReports.length} session${todayReports.length !== 1 ? 's' : ''}`
                                                 }
                                             </div>
                                         </div>
                                     </div>
                                     
                                     {/* Second Row - Total Progress */}
                                     <div className="px-6 pb-6">
                                         <button 
                                             onClick={() => setShowMasteredDetails(true)}
                                             className="w-full bg-white/5 rounded-xl p-5 border border-white/10 text-left hover:bg-white/10 hover:border-emerald-500/30 transition-all cursor-pointer group"
                                         >
                                             <div className="flex items-center justify-between mb-3">
                                                 <div className="flex items-center gap-2">
                                                     <TrendingUp size={16} className="text-emerald-400" />
                                                     <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Progress</span>
                                                 </div>
                                                 <span className="text-[10px] text-gray-500 group-hover:text-emerald-400 transition-colors">View all →</span>
                                             </div>
                                             <div className="flex items-center gap-6">
                                                 <div className="flex items-baseline gap-2">
                                                     <span className="text-4xl font-bold text-emerald-400">{studyStats.masteredCount}</span>
                                                     <span className="text-xl text-gray-500">/ 75</span>
                                                 </div>
                                                 <div className="flex-1">
                                                     <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                                         <div 
                                                             className="h-full bg-emerald-500 transition-all duration-500" 
                                                             style={{ width: `${(studyStats.masteredCount / 75) * 100}%` }}
                                                         />
                                                     </div>
                                                     <div className="text-xs text-gray-500 mt-2">
                                                         {75 - studyStats.masteredCount} problems remaining
                                                     </div>
                                                 </div>
                                             </div>
                                         </button>
                                     </div>
                                 </div>
                             )}
                             
                             {/* Blind 75 Problem Grid */}
                             {progressGrid.length > 0 && (
                                 <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#EBE8E0]">
                                     <div className="flex items-center justify-between mb-6">
                                         <div className="flex items-center gap-2">
                                             <BarChart3 size={18} className="text-charcoal" />
                                             <h3 className="text-lg font-bold text-charcoal">Blind 75 Progress</h3>
                                         </div>
                                         <div className="text-sm text-gray-500">
                                             {studyStats?.masteredCount ?? 0}/75 mastered ({Math.round(((studyStats?.masteredCount ?? 0) / 75) * 100)}%)
                                         </div>
                                     </div>
                                     
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                                        {progressGrid.map((group) => (
                                            <div key={group.groupName}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-sm font-medium text-charcoal">{group.groupName}</span>
                                                    <span className="text-xs text-gray-500">
                                                        {group.masteredCount}/{group.totalCount}
                                                        {group.masteredCount === group.totalCount && ' ✓'}
                                                    </span>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {group.problems.map((item) => {
                                                        const status = item.progress?.status || 'new';
                                                        const isDue = item.isDueToday;
                                                        
                                                        return (
                                                            <div
                                                                key={item.problem.id}
                                                                className={`w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold cursor-pointer transition-all hover:scale-110 ${
                                                                    status === 'mastered' 
                                                                        ? 'bg-emerald-500 text-white' 
                                                                        : status === 'learning'
                                                                            ? isDue 
                                                                                ? 'bg-blue-500 text-white ring-2 ring-blue-300' 
                                                                                : 'bg-yellow-400 text-charcoal'
                                                                            : 'bg-gray-100 text-gray-400'
                                                                }`}
                                                                title={`${item.problem.title} (${item.problem.difficulty})${
                                                                    item.progress ? ` - Score: ${item.progress.bestScore ?? 'N/A'}` : ''
                                                                }${isDue ? ' - Due Today!' : ''}`}
                                                            >
                                                                {status === 'mastered' ? '✓' : status === 'learning' ? (isDue ? '!' : '○') : ''}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                     
                                     {/* Legend */}
                                     <div className="flex items-center justify-center gap-6 mt-6 pt-4 border-t border-gray-100">
                                         <div className="flex items-center gap-2">
                                             <div className="w-4 h-4 rounded bg-emerald-500"></div>
                                             <span className="text-xs text-gray-500">Mastered</span>
                                         </div>
                                         <div className="flex items-center gap-2">
                                             <div className="w-4 h-4 rounded bg-yellow-400"></div>
                                             <span className="text-xs text-gray-500">Learning</span>
                                         </div>
                                         <div className="flex items-center gap-2">
                                             <div className="w-4 h-4 rounded bg-blue-500"></div>
                                             <span className="text-xs text-gray-500">Due Today</span>
                                         </div>
                                         <div className="flex items-center gap-2">
                                             <div className="w-4 h-4 rounded bg-gray-100"></div>
                                             <span className="text-xs text-gray-500">New</span>
                                         </div>
                                     </div>
                                 </div>
                             )}
                             
                             {/* Review Queue Preview */}
                             {(dueToday.length > 0 || dueTomorrow.length > 0) && (
                                 <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#EBE8E0]">
                                     <div className="flex items-center gap-2 mb-4">
                                         <Clock size={18} className="text-charcoal" />
                                         <h3 className="text-lg font-bold text-charcoal">Review Queue</h3>
                                     </div>
                                     
                                     {dueToday.length > 0 && (
                                         <div className="mb-4">
                                             <div className="flex items-center gap-2 mb-3">
                                                 <AlertCircle size={14} className="text-blue-500" />
                                                 <span className="text-sm font-medium text-charcoal">Due Today ({dueToday.length})</span>
                                             </div>
                                             <div className="space-y-2">
                                                 {dueToday.slice(0, 5).map((item) => (
                                                     <div 
                                                         key={item.problemTitle}
                                                         className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100"
                                                     >
                                                         <span className="text-sm text-charcoal">{item.problemTitle}</span>
                                                         <div className="flex items-center gap-2">
                                                             {item.bestScore && (
                                                                 <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                                                                     item.bestScore >= 75 
                                                                         ? 'bg-emerald-100 text-emerald-700' 
                                                                         : item.bestScore >= 50 
                                                                             ? 'bg-yellow-100 text-yellow-700'
                                                                             : 'bg-red-100 text-red-700'
                                                                 }`}>
                                                                     {item.bestScore} pts
                                                                 </span>
                                                             )}
                                                             {item.lastReviewedAt && (
                                                                 <span className="text-xs text-gray-400">
                                                                     {Math.floor((new Date().getTime() - new Date(item.lastReviewedAt).getTime()) / (1000 * 60 * 60 * 24))}d ago
                                                                 </span>
                                                             )}
                                                         </div>
                                                     </div>
                                                 ))}
                                                 {dueToday.length > 5 && (
                                                     <div className="text-xs text-gray-500 text-center py-2">
                                                         + {dueToday.length - 5} more
                                                     </div>
                                                 )}
                                             </div>
                                         </div>
                                     )}
                                     
                                     {dueTomorrow.length > 0 && (
                                         <div>
                                             <div className="flex items-center gap-2 mb-3">
                                                 <Clock size={14} className="text-gray-400" />
                                                 <span className="text-sm font-medium text-gray-500">Due Tomorrow ({dueTomorrow.length})</span>
                                             </div>
                                             <div className="flex flex-wrap gap-2">
                                                 {dueTomorrow.slice(0, 8).map((item) => (
                                                     <span 
                                                         key={item.problemTitle}
                                                         className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded"
                                                     >
                                                         {item.problemTitle}
                                                     </span>
                                                 ))}
                                                 {dueTomorrow.length > 8 && (
                                                     <span className="text-xs px-2 py-1 text-gray-400">
                                                         +{dueTomorrow.length - 8} more
                                                     </span>
                                                 )}
                                             </div>
                                         </div>
                                     )}
                                 </div>
                             )}
                             
                             {/* Loading indicator */}
                             {isLoadingProgress && (
                                 <div className="text-center py-8 text-gray-500">
                                     Loading spaced repetition data...
                                 </div>
                             )}

                             {/* Calendar View */}
                             <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#EBE8E0]">
                                 <div className="flex items-center justify-between mb-6">
                                     <h3 className="text-lg font-bold text-charcoal">
                                         {calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                     </h3>
                                     <div className="flex items-center gap-2">
                                         <button 
                                             onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}
                                             className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                                         >
                                             <ChevronLeft size={18} className="text-gray-600" />
                                         </button>
                                         <button 
                                             onClick={() => setCalendarDate(new Date())}
                                             className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-gold hover:bg-gold/10 rounded-lg transition-colors"
                                         >
                                             Today
                                         </button>
                                         <button 
                                             onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}
                                             className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                                         >
                                             <ChevronRight size={18} className="text-gray-600" />
                                         </button>
                                     </div>
                                 </div>
                                 
                                 {/* Calendar Grid */}
                                 <div className="grid grid-cols-7 gap-1">
                                     {/* Day Headers */}
                                     {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                                         <div key={day} className="text-center text-xs font-bold text-gray-400 uppercase tracking-widest py-2">
                                             {day}
                                         </div>
                                     ))}
                                     
                                     {/* Empty cells for days before month starts */}
                                     {Array.from({ length: getFirstDayOfMonth(calendarDate.getFullYear(), calendarDate.getMonth()) }).map((_, i) => (
                                         <div key={`empty-${i}`} className="aspect-square" />
                                     ))}
                                     
                                     {/* Day cells */}
                                     {Array.from({ length: getDaysInMonth(calendarDate.getFullYear(), calendarDate.getMonth()) }).map((_, i) => {
                                         const day = i + 1;
                                         const date = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day);
                                         const dateStr = getDateString(date);
                                         const mastered = masteredByDate[dateStr] || 0;
                                         const attempts = attemptsByDate[dateStr] || 0;
                                         const isToday = dateStr === getDateString(new Date());
                                         const isFuture = date > new Date();
                                         
                                         return (
                                             <div 
                                                 key={day}
                                                 className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all ${
                                                     isToday ? 'ring-2 ring-gold ring-offset-2' : ''
                                                 } ${
                                                     mastered >= 15 ? 'bg-gold text-white' :
                                                     mastered >= 10 ? 'bg-gold/60 text-white' :
                                                     mastered >= 5 ? 'bg-gold/30 text-charcoal' :
                                                     mastered > 0 ? 'bg-gold/10 text-charcoal' :
                                                     isFuture ? 'bg-gray-50 text-gray-300' :
                                                     'bg-gray-50 text-gray-500'
                                                 }`}
                                                 title={`${mastered} mastered / ${attempts} attempts`}
                                             >
                                                 <span className={`text-sm font-bold ${mastered >= 10 ? 'text-white' : ''}`}>{day}</span>
                                                 {mastered > 0 && (
                                                     <span className={`text-[9px] font-bold ${mastered >= 10 ? 'text-white/80' : 'text-gold'}`}>
                                                         {mastered >= 15 ? '🔥' : mastered}
                                                     </span>
                                                 )}
                                             </div>
                                         );
                                     })}
                                 </div>
                                 
                                 {/* Legend */}
                                 <div className="flex items-center justify-center gap-4 mt-6 pt-4 border-t border-gray-100">
                                     <div className="flex items-center gap-2">
                                         <div className="w-4 h-4 rounded bg-gray-50"></div>
                                         <span className="text-xs text-gray-500">0</span>
                                     </div>
                                     <div className="flex items-center gap-2">
                                         <div className="w-4 h-4 rounded bg-gold/10"></div>
                                         <span className="text-xs text-gray-500">1-4</span>
                                     </div>
                                     <div className="flex items-center gap-2">
                                         <div className="w-4 h-4 rounded bg-gold/30"></div>
                                         <span className="text-xs text-gray-500">5-9</span>
                                     </div>
                                     <div className="flex items-center gap-2">
                                         <div className="w-4 h-4 rounded bg-gold/60"></div>
                                         <span className="text-xs text-gray-500">10-14</span>
                                     </div>
                                     <div className="flex items-center gap-2">
                                         <div className="w-4 h-4 rounded bg-gold"></div>
                                         <span className="text-xs text-gray-500">15+</span>
                                     </div>
                                 </div>
                             </div>
                         </div>
                     )}

                     {/* --- SNIPPETS TAB --- */}
                     {activeTab === 'snippets' && (
                         savedItems.length === 0 ? (
                             <div className="text-center py-20">
                                 <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-400">
                                     <Database size={32} />
                                 </div>
                                 <h3 className="text-2xl font-serif font-bold text-charcoal mb-2">No Saved Snippets</h3>
                                 <p className="text-gray-500 max-w-sm mx-auto">
                                     Bookmark highlights and improvement feedback from your coaching sessions to build your personal knowledge base.
                                 </p>
                             </div>
                         ) : (
                             <div className="space-y-8">
                                 {/* Improvements Section */}
                                 {savedItems.filter(i => i.type === 'improvement').length > 0 && (
                                     <div>
                                         <div className="flex items-center gap-2 mb-6">
                                             <Lightbulb className="text-charcoal" size={20} />
                                             <h3 className="text-lg font-bold text-charcoal uppercase tracking-widest">Improvements to Work On</h3>
                                         </div>
                                         <div className="grid gap-6">
                                             {savedItems.filter(i => i.type === 'improvement').map(item => {
                                                 // Extract data from reportData for backward compatibility
                                                 const questionText = item.question || item.reportData?.context;
                                                 const humanRewriteText = item.humanRewrite || item.rewrite;
                                                 // Source is derived from the report context (e.g., "Augment Code Interview")
                                                 const sourceText = item.reportData?.context || item.category;
                                                 
                                                 return (
                                                <div key={item.id} className="bg-white rounded-2xl p-8 shadow-sm border border-[#EBE8E0] relative group">
                                                    <button 
                                                        onClick={() => onDeleteSnippet(item.id)}
                                                        className="absolute top-4 right-4 p-2 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all z-10"
                                                        title="Remove from database"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                    <div className="flex items-center gap-2 mb-4 pr-12">
                                                         <div className="w-2 h-2 rounded-full bg-red-400"></div>
                                                         <span className="text-[10px] font-bold text-gold uppercase tracking-widest">{item.category}</span>
                                                         <span className="text-[10px] text-gray-300 ml-auto">{new Date(item.date).toLocaleDateString()}</span>
                                                    </div>
                                                    
                                                    {/* Question Context */}
                                                    {questionText && (
                                                        <div className="mb-4">
                                                            <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Interview Question</h5>
                                                            <p className="text-gray-600 text-sm italic">"{questionText}"</p>
                                                        </div>
                                                    )}
                                                    
                                                    <div className="bg-[#FAF9F6] p-4 rounded-xl border-l-4 border-gray-200 mb-4">
                                                         <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">What You Said</h5>
                                                         <p className="text-charcoal font-serif text-sm leading-relaxed mb-3">"{item.content}"</p>
                                                         {item.title && (
                                                             <div className="pt-3 border-t border-gray-200">
                                                                 <h6 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">The Issue</h6>
                                                                 <p className="text-sm text-gray-600">{item.title}</p>
                                                             </div>
                                                         )}
                                                    </div>
                                                    
                                                    {humanRewriteText && (
                                                        <div className="bg-green-50/50 p-4 rounded-xl border-l-4 border-green-400 mb-4">
                                                            <h5 className="text-[10px] font-bold text-green-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                               <PenTool size={12}/> The Human Rewrite (For Practice)
                                                            </h5>
                                                            <p className="text-charcoal font-serif text-sm leading-relaxed">"{humanRewriteText}"</p>
                                                            {item.explanation && (
                                                                <div className="mt-3 pt-3 border-t border-green-200/50">
                                                                    <p className="text-xs text-green-800 italic">{item.explanation}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                    
                                                    {/* Rehearse Button */}
                                                    {questionText && (
                                                        <button 
                                                            onClick={() => navigate('/hot-take', { 
                                                                state: { 
                                                                    practiceQuestion: { 
                                                                        title: questionText, 
                                                                        context: humanRewriteText || item.content,
                                                                        source: sourceText
                                                                    } 
                                                                } 
                                                            })}
                                                            className="w-full py-3 bg-gold text-white rounded-xl font-bold hover:bg-gold/90 transition-colors shadow-sm flex items-center justify-center gap-2"
                                                        >
                                                            <Play size={16} /> Practice in Hot Take
                                                        </button>
                                                    )}
                                                </div>
                                             )})}
                                         </div>
                                     </div>
                                 )}
      
                                 {/* Highlights Section */}
                                 {savedItems.filter(i => i.type === 'highlight').length > 0 && (
                                     <div>
                                         <div className="flex items-center gap-2 mb-6 mt-12">
                                             <Star className="text-gold" size={20} />
                                             <h3 className="text-lg font-bold text-charcoal uppercase tracking-widest">Key Strengths</h3>
                                         </div>
                                         <div className="grid md:grid-cols-2 gap-6">
                                             {savedItems.filter(i => i.type === 'highlight').map(item => (
                                                 <div key={item.id} className="bg-white rounded-2xl p-6 shadow-sm border border-[#EBE8E0] relative group">
                                                     <button 
                                                         onClick={() => onDeleteSnippet(item.id)}
                                                         className="absolute top-4 right-4 p-2 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                                         title="Remove from database"
                                                     >
                                                         <Trash2 size={16} />
                                                     </button>
                                                     <div className="flex items-center gap-2 mb-3">
                                                         <div className="w-6 h-6 rounded-full bg-gold/10 flex items-center justify-center text-gold">
                                                             <Star size={12} fill="#C7A965" />
                                                         </div>
                                                         <span className="text-[10px] font-bold text-gold uppercase tracking-widest">{item.category}</span>
                                                     </div>
                                                     <h4 className="text-md font-bold text-charcoal mb-2">{item.title}</h4>
                                                     <div className="bg-[#FAF9F6] p-4 rounded-xl mt-4">
                                                         <p className="text-charcoal italic font-serif text-sm">"{item.content}"</p>
                                                     </div>
                                                 </div>
                                             ))}
                                         </div>
                                     </div>
                                 )}
      
                                 {/* Drills Section */}
                                 {savedItems.filter(i => i.type === 'drill').length > 0 && (
                                     <div>
                                         <div className="flex items-center gap-2 mb-6 mt-12">
                                             <Ear className="text-charcoal" size={20} />
                                             <h3 className="text-lg font-bold text-charcoal uppercase tracking-widest">Saved Drills</h3>
                                         </div>
                                         <div className="grid gap-6">
                                             {savedItems.filter(i => i.type === 'drill').map(item => (
                                                 <div key={item.id} className="bg-white rounded-2xl p-6 shadow-sm border border-[#EBE8E0] relative group">
                                                     <button 
                                                         onClick={() => onDeleteSnippet(item.id)}
                                                         className="absolute top-4 right-4 p-2 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                                         title="Remove from database"
                                                     >
                                                         <Trash2 size={16} />
                                                     </button>
                                                     <div className="flex items-center gap-2 mb-3">
                                                         <div className="w-6 h-6 rounded-full bg-charcoal/5 flex items-center justify-center text-charcoal">
                                                             <Mic2 size={12} />
                                                         </div>
                                                         <span className="text-[10px] font-bold text-gold uppercase tracking-widest">{item.category}</span>
                                                     </div>
                                                     <h4 className="text-md font-bold text-charcoal mb-2">{item.title}</h4>
                                                     <p className="text-gray-500 italic text-sm mb-4">"{item.content}"</p>
                                                     <div className="bg-[#FAF9F6] p-4 rounded-xl border border-gold/20">
                                                         <p className="text-charcoal font-serif text-lg tracking-wide">{item.rewrite}</p>
                                                     </div>
                                                 </div>
                                             ))}
                                         </div>
                                     </div>
                                 )}
                             </div>
                         )
                     )}
                 </div>
             </div>
             
             {/* Today's Details Modal */}
             {showTodayDetails && (
                 <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowTodayDetails(false)}>
                     <div 
                         className="bg-charcoal rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl border border-white/10"
                         onClick={(e) => e.stopPropagation()}
                     >
                        {/* Header */}
                        <div className="p-6 border-b border-white/10 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-white">Today's Activity</h2>
                                <p className="text-sm text-gray-400 mt-1">
                                    {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                                </p>
                                {todayTotalTime > 0 && (
                                    <div className="flex items-center gap-1.5 mt-2 text-gold">
                                        <Clock size={14} />
                                        <span className="text-sm font-medium">Total study time: {formatTimeSpent(todayTotalTime)}</span>
                                    </div>
                                )}
                            </div>
                            <button 
                                onClick={() => setShowTodayDetails(false)}
                                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/20 transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>
                         
                         {/* Content */}
                         <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
                             {/* Mastered Section */}
                             <div>
                                 <div className="flex items-center gap-2 mb-3">
                                     <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
                                     <span className="text-sm font-bold text-emerald-400 uppercase tracking-widest">
                                         Mastered ({todayMastered.length})
                                     </span>
                                 </div>
                                 {todayMastered.length === 0 ? (
                                     <p className="text-gray-500 text-sm italic">No problems mastered yet today</p>
                                 ) : (
                                   <div className="space-y-2">
                                       {todayMastered.map((report, idx) => (
                                           <div key={idx} className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex items-center justify-between">
                                               <div className="flex-1">
                                                   <button
                                                       onClick={() => {
                                                           setShowTodayDetails(false);
                                                           navigate(`/report/${titleToSlug(report.title)}`);
                                                       }}
                                                       className="text-white font-medium hover:text-emerald-300 hover:underline transition-colors text-left"
                                                   >
                                                       {report.title}
                                                   </button>
                                                   <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                                                       <span className={report.type === 'teach' ? 'text-purple-400' : 'text-gold'}>
                                                           {report.type === 'teach' ? '👨‍🏫 Teach' : '🎤 Explain'}
                                                       </span>
                                                       <span>•</span>
                                                       <span>Score: {report.score}</span>
                                                       {report.timeSpentSeconds && report.timeSpentSeconds > 0 && (
                                                           <>
                                                               <span>•</span>
                                                               <span className="flex items-center gap-1 text-gray-500">
                                                                   <Clock size={10} />
                                                                   {formatTimeSpent(report.timeSpentSeconds)}
                                                                   {report.attemptCount > 1 && ` (${report.attemptCount} attempts)`}
                                                               </span>
                                                           </>
                                                       )}
                                                   </div>
                                               </div>
                                               <div className="text-emerald-400 ml-2">✓</div>
                                           </div>
                                       ))}
                                   </div>
                                 )}
                             </div>
                             
                             {/* Attempted (Not Mastered) Section */}
                             <div>
                                 <div className="flex items-center gap-2 mb-3">
                                     <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                                     <span className="text-sm font-bold text-yellow-400 uppercase tracking-widest">
                                         Attempted ({todayAttempted.length})
                                     </span>
                                 </div>
                                 {todayAttempted.length === 0 ? (
                                     <p className="text-gray-500 text-sm italic">No other attempts today</p>
                                 ) : (
                                   <div className="space-y-2">
                                       {todayAttempted.map((report, idx) => (
                                           <div key={idx} className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 flex items-center justify-between">
                                               <div className="flex-1">
                                                   <button
                                                       onClick={() => {
                                                           setShowTodayDetails(false);
                                                           navigate(`/report/${titleToSlug(report.title)}`);
                                                       }}
                                                       className="text-white font-medium hover:text-yellow-300 hover:underline transition-colors text-left"
                                                   >
                                                       {report.title}
                                                   </button>
                                                   <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                                                       <span className={report.type === 'teach' ? 'text-purple-400' : 'text-gold'}>
                                                           {report.type === 'teach' ? '👨‍🏫 Teach' : '🎤 Explain'}
                                                       </span>
                                                       <span>•</span>
                                                       <span>Score: {report.score}</span>
                                                       {report.timeSpentSeconds && report.timeSpentSeconds > 0 && (
                                                           <>
                                                               <span>•</span>
                                                               <span className="flex items-center gap-1 text-gray-500">
                                                                   <Clock size={10} />
                                                                   {formatTimeSpent(report.timeSpentSeconds)}
                                                                   {report.attemptCount > 1 && ` (${report.attemptCount} attempts)`}
                                                               </span>
                                                           </>
                                                       )}
                                                   </div>
                                               </div>
                                                <div className="text-yellow-400 text-xs ml-2">Needs review</div>
                                            </div>
                                        ))}
                                    </div>
                                 )}
                             </div>
                             
                             {/* Summary */}
                             {todayMastered.length === 0 && todayAttempted.length === 0 && (
                                 <div className="text-center py-8">
                                     <div className="text-4xl mb-3">📚</div>
                                     <p className="text-gray-400">No activity yet today</p>
                                     <p className="text-gray-500 text-sm mt-1">Start practicing to see your progress!</p>
                                 </div>
                             )}
                         </div>
                     </div>
                 </div>
             )}
             
             {/* All Mastered Problems Modal */}
             {showMasteredDetails && (
                 <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowMasteredDetails(false)}>
                     <div 
                         className="bg-charcoal rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl border border-white/10"
                         onClick={(e) => e.stopPropagation()}
                     >
                         {/* Header */}
                         <div className="p-6 border-b border-white/10 flex items-center justify-between">
                             <div>
                                 <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                     <TrendingUp size={20} className="text-emerald-400" />
                                     Mastered Problems
                                 </h2>
                                 <p className="text-sm text-gray-400 mt-1">
                                     {allMasteredProblems.length} of 75 problems completed
                                 </p>
                             </div>
                             <button 
                                 onClick={() => setShowMasteredDetails(false)}
                                 className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/20 transition-colors"
                             >
                                 <X size={16} />
                             </button>
                         </div>
                         
                         {/* Content */}
                         <div className="p-6 overflow-y-auto max-h-[70vh]">
                             {allMasteredProblems.length === 0 ? (
                                 <div className="text-center py-12">
                                     <div className="text-5xl mb-4">🎯</div>
                                     <p className="text-gray-400 text-lg">No problems mastered yet</p>
                                     <p className="text-gray-500 text-sm mt-2">Complete problems with a score of 75+ to master them!</p>
                                 </div>
                             ) : (
                                <div className="space-y-2">
                                    {allMasteredProblems.map((problem, idx) => {
                                        const teachReport = findTeachReportForProblem(problem.title);
                                        return (
                                            <div 
                                                key={idx} 
                                                className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 flex items-center justify-between hover:bg-emerald-500/15 transition-colors"
                                            >
                                                <div className="flex-1">
                                                    {teachReport ? (
                                                        <button
                                                            onClick={() => {
                                                                setShowMasteredDetails(false);
                                                                navigate(`/report/${titleToSlug(problem.title)}`);
                                                            }}
                                                            className="text-white font-medium hover:text-emerald-300 hover:underline transition-colors text-left"
                                                        >
                                                            {problem.title}
                                                        </button>
                                                    ) : (
                                                        <div className="text-white font-medium">{problem.title}</div>
                                                    )}
                                                    <div className="text-xs text-gray-400 mt-1 flex items-center gap-3">
                                                        <span className="text-emerald-400/70">{problem.group}</span>
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                            problem.difficulty === 'easy' 
                                                                ? 'bg-green-500/20 text-green-400' 
                                                                : problem.difficulty === 'medium'
                                                                ? 'bg-yellow-500/20 text-yellow-400'
                                                                : 'bg-red-500/20 text-red-400'
                                                        }`}>
                                                            {problem.difficulty}
                                                        </span>
                                                        {problem.bestScore && (
                                                            <span className="text-gray-500">Best: {problem.bestScore}</span>
                                                        )}
                                                        {teachReport && (
                                                            <span className="text-purple-400">👨‍🏫 Report available</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-emerald-400 text-lg">✓</div>
                                            </div>
                                        );
                                    })}
                                </div>
                             )}
                         </div>
                         
                         {/* Footer */}
                         {allMasteredProblems.length > 0 && (
                             <div className="p-4 border-t border-white/10 bg-white/5">
                                 <div className="flex items-center justify-between text-sm">
                                     <span className="text-gray-400">
                                         {75 - allMasteredProblems.length} problems remaining
                                     </span>
                                     <span className="text-emerald-400 font-bold">
                                         {Math.round((allMasteredProblems.length / 75) * 100)}% complete
                                     </span>
                                 </div>
                             </div>
                         )}
                     </div>
                 </div>
             )}
        </div>
    );
};

export default DatabaseView;
