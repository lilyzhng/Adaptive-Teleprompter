
import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Award, PenTool, Quote, Lightbulb, Bookmark, ThumbsUp, Star, Ear, AlertCircle, Mic2, FileText, MessageCircleQuestion, Target, Sparkles, Zap, History, MessageSquare } from 'lucide-react';
import { PerformanceReport as ReportType, SavedItem } from '../types';
import html2canvas from 'html2canvas';

type ReportDisplayType = 'coach' | 'walkie' | 'hot-take';

interface PerformanceReportProps {
    report: ReportType;
    reportType?: ReportDisplayType; // Explicitly set report type for display
    transcript?: string;
    context?: string; // Interview context/question for rehearsal practice
    isSaved: (title: string, content: string) => boolean;
    onToggleSave: (item: Omit<SavedItem, 'id' | 'date'>) => void;
    onDone: (force: boolean) => void;
}

// Report display configuration
const REPORT_CONFIG: Record<ReportDisplayType, { title: string; subtitle: string; icon: string }> = {
    'coach': { title: 'Interview Report', subtitle: 'Stage 2: The Coach', icon: 'award' },
    'hot-take': { title: 'Tech Drill Report', subtitle: 'Hot Take Protocol', icon: 'zap' },
    'walkie': { title: 'LeetCode Report', subtitle: 'Algorithm Analysis', icon: 'code' }
};

// Helper to create report data context for saving
const createReportContext = (report: ReportType, transcript?: string, context?: string) => ({
    report,
    transcript,
    context
});

const PerformanceReport: React.FC<PerformanceReportProps> = ({ report, reportType, transcript, context, isSaved, onToggleSave, onDone }) => {
    const { rating, summary, detailedFeedback, highlights, pronunciationFeedback, coachingRewrite, flipTheTable, hotTakeRubric, hotTakeMasterRewrite, hotTakeHistory, hotTakeRounds, mentalModelChecklist, missingEdgeCases, rubricScores } = report;
    const [showRewrite, setShowRewrite] = useState(false);
    const [activeHotTakeRound, setActiveHotTakeRound] = useState<'round1' | 'round2'>('round1');
    const reportRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    // Determine report type: explicit prop > auto-detect from content
    const isHotTake = !!hotTakeRubric || !!hotTakeRounds;
    const isWalkie = !!rubricScores || !!mentalModelChecklist || !!missingEdgeCases;
    const effectiveReportType: ReportDisplayType = reportType || (isHotTake ? 'hot-take' : isWalkie ? 'walkie' : 'coach');
    const reportConfig = REPORT_CONFIG[effectiveReportType];
    
    // Determine active data for Hot Take
    const currentRoundData = hotTakeRounds ? hotTakeRounds[activeHotTakeRound] : null;
    
    // Legacy fallback for rubric
    const displayedRubric = currentRoundData ? currentRoundData.rubric : hotTakeRubric;
    
    // CALCULATE SCORE: Sum the rubric values to ensure accuracy
    const calculatedScore = displayedRubric 
        ? Math.round(Object.values(displayedRubric).reduce((sum: number, val) => sum + (Number(val) || 0), 0))
        : Math.round(currentRoundData ? currentRoundData.score : rating);

    const displayedSummary = currentRoundData ? currentRoundData.critique : summary;
    const displayedRewrite = currentRoundData ? currentRoundData.rewrite : hotTakeMasterRewrite;
    const displayedQuestion = currentRoundData ? currentRoundData.question : null;
    const displayedTranscript = currentRoundData ? currentRoundData.transcript : null;

    const formatRubricLabel = (key: string) => {
        return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    };

    const downloadReportAsImage = async () => {
        if (!reportRef.current) return;
        try {
            const canvas = await html2canvas(reportRef.current, {
                scale: 2,
                backgroundColor: null,
                useCORS: true,
                windowWidth: 1920
            });
            const url = canvas.toDataURL("image/png");
            const a = document.createElement('a');
            a.href = url;
            a.download = `performance-report-${new Date().toISOString().split('T')[0]}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (error) {
            console.error("Snapshot failed:", error);
            alert("Could not save image.");
        }
    };

    const downloadTranscript = () => {
        let textToDownload = transcript || "";
        
        if (hotTakeRounds) {
            textToDownload = `ROUND 1: ${hotTakeRounds.round1.question}\nANSWER: ${hotTakeRounds.round1.transcript}\n\nROUND 2: ${hotTakeRounds.round2.question}\nANSWER: ${hotTakeRounds.round2.transcript}`;
        } else if (hotTakeHistory) {
            textToDownload = hotTakeHistory.map(t => `${t.stage.toUpperCase()}: ${t.query}\nYOU: ${t.response}\n`).join('\n\n');
        }
        
        if (!textToDownload) return;
        const blob = new Blob([textToDownload], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transcript-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <div ref={reportRef} className="bg-cream min-h-full">
            {/* Header - Mobile responsive */}
            <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                     <div className="flex items-center gap-2 text-gold text-[10px] sm:text-xs font-bold tracking-widest uppercase mb-1 sm:mb-2">
                        <Award size={12} className="sm:w-3.5 sm:h-3.5" /> {reportConfig.subtitle}
                     </div>
                     <h2 className="text-2xl sm:text-4xl font-serif font-bold text-charcoal">{reportConfig.title}</h2>
                </div>
                <div className="flex flex-wrap gap-2 sm:gap-3">
                     {(transcript || hotTakeHistory || hotTakeRounds) && (
                        <button onClick={downloadTranscript} className="px-3 sm:px-4 py-1.5 sm:py-2 bg-white border border-gray-200 rounded-full text-xs sm:text-sm font-medium hover:bg-gray-50 text-charcoal flex items-center gap-1.5 sm:gap-2">
                            <FileText size={12} className="sm:w-3.5 sm:h-3.5" /> <span className="hidden sm:inline">Download</span> Transcript
                        </button>
                     )}
                     <button onClick={downloadReportAsImage} className="px-3 sm:px-4 py-1.5 sm:py-2 bg-white border border-gray-200 rounded-full text-xs sm:text-sm font-medium hover:bg-gray-50 text-charcoal flex items-center gap-1.5 sm:gap-2">
                        <Download size={12} className="sm:w-3.5 sm:h-3.5" /> <span className="hidden sm:inline">Export</span> Image
                     </button>
                     <button onClick={() => onDone(true)} className="px-4 sm:px-6 py-1.5 sm:py-2 bg-charcoal text-white rounded-full text-xs sm:text-sm font-bold hover:bg-black">
                        Done
                     </button>
                </div>
            </div>
            
            {/* HOT TAKE TABS - Mobile responsive */}
            {hotTakeRounds && (
                <div className="flex justify-center mb-6 sm:mb-8">
                     <div className="bg-white p-1 sm:p-1.5 rounded-full border border-[#E6E6E6] flex gap-1 sm:gap-2 shadow-sm">
                          <button 
                            onClick={() => setActiveHotTakeRound('round1')}
                            className={`px-3 sm:px-6 py-2 sm:py-2.5 rounded-full text-[8px] sm:text-[10px] font-bold uppercase tracking-wider sm:tracking-widest transition-all ${activeHotTakeRound === 'round1' ? 'bg-charcoal text-white shadow-md' : 'text-gray-400 hover:text-charcoal'}`}
                          >
                             Round 1
                          </button>
                          <button 
                            onClick={() => setActiveHotTakeRound('round2')}
                            className={`px-3 sm:px-6 py-2 sm:py-2.5 rounded-full text-[8px] sm:text-[10px] font-bold uppercase tracking-wider sm:tracking-widest transition-all ${activeHotTakeRound === 'round2' ? 'bg-gold text-white shadow-md' : 'text-gray-400 hover:text-gold'}`}
                          >
                             Round 2
                          </button>
                     </div>
                </div>
            )}

            {/* Executive Summary Card - Mobile responsive */}
            <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-sm border border-[#EBE8E0] mb-6 sm:mb-8 flex flex-col sm:flex-row gap-5 sm:gap-8 items-center sm:items-start animate-in fade-in duration-300" key={activeHotTakeRound}>
                 <div className="shrink-0 relative w-24 h-24 sm:w-32 sm:h-32 flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(#C7A965 ${isHotTake ? calculatedScore : rating}%, #F0EBE0 ${isHotTake ? calculatedScore : rating}% 100%)` }}></div>
                      <div className="absolute inset-1.5 sm:inset-2 bg-white rounded-full flex flex-col items-center justify-center z-10">
                          <span className="text-2xl sm:text-4xl font-serif font-bold text-charcoal">{isHotTake ? calculatedScore : rating}</span>
                          <span className="text-[8px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-widest">/ 100</span>
                      </div>
                 </div>
                 <div className="flex-1 text-center sm:text-left">
                      <h3 className="text-lg sm:text-xl font-serif font-bold text-charcoal mb-2 sm:mb-3">Executive Summary</h3>
                      <p className="text-gray-600 leading-relaxed whitespace-pre-line text-sm sm:text-base">{isHotTake ? displayedSummary : summary}</p>
                      
                      {coachingRewrite && !isHotTake && (
                        <div className="mt-6">
                            <button 
                                onClick={() => setShowRewrite(!showRewrite)}
                                className="text-sm font-bold text-gold hover:text-charcoal transition-colors flex items-center gap-2"
                            >
                                <PenTool size={14} /> {showRewrite ? 'Hide Story Rewrite' : 'View Story Rewrite'}
                            </button>

                            {showRewrite && (
                                <div className="mt-4 bg-[#FAF9F6] border-l-4 border-gold p-6 rounded-r-xl animate-in slide-in-from-top-2">
                                    <div className="flex items-start gap-4 mb-4">
                                        <div className="w-8 h-8 rounded-full bg-gold/10 flex items-center justify-center text-gold shrink-0">
                                            <Quote size={14} />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-charcoal uppercase tracking-widest mb-1">The Diagnosis</h4>
                                            <p className="text-gray-600 italic text-sm">{coachingRewrite.diagnosis}</p>
                                        </div>
                                    </div>
                                    <div className="mb-4">
                                         <h4 className="text-sm font-bold text-charcoal uppercase tracking-widest mb-2">The Fix</h4>
                                         <p className="text-gray-700 text-sm">{coachingRewrite.fix}</p>
                                    </div>
                                    <div>
                                         <h4 className="text-sm font-bold text-charcoal uppercase tracking-widest mb-2">The Human Rewrite</h4>
                                         <div className="text-charcoal font-serif text-lg leading-relaxed pl-4 border-l-2 border-gray-200">
                                            "{coachingRewrite.rewrite}"
                                         </div>
                                    </div>
                                </div>
                            )}
                        </div>
                      )}
                 </div>
            </div>

            {/* --- HOT TAKE SPECIFIC SECTIONS --- */}
            
            {/* 1. Hot Take Rubric - Mobile responsive */}
            {displayedRubric && isHotTake && (
                <div className="mb-8 sm:mb-12 animate-in fade-in slide-in-from-bottom-2 duration-300" key={`rubric-${activeHotTakeRound}`}>
                     <div className="mb-3 sm:mb-4 flex items-center gap-2 text-charcoal text-[10px] sm:text-xs font-bold tracking-widest uppercase">
                        <Star size={12} className="sm:w-3.5 sm:h-3.5" /> Surgical Rubric
                     </div>
                     <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-8 border border-[#EBE8E0] shadow-sm">
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-x-12 sm:gap-y-8">
                             {Object.entries(displayedRubric).map(([key, val]) => (
                                <div key={key} className="space-y-1.5 sm:space-y-2">
                                    <div className="flex justify-between text-[10px] sm:text-xs font-bold uppercase tracking-wider sm:tracking-widest">
                                        <span className="text-gray-500">{formatRubricLabel(key)}</span>
                                        <span className="text-gold">{val} / 25</span>
                                    </div>
                                    <div className="h-1.5 sm:h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-gold" style={{ width: `${(Number(val) || 0) * 4}%` }}></div>
                                    </div>
                                </div>
                             ))}
                         </div>
                     </div>
                </div>
            )}

            {/* LeetCode Rubric Scores - Strict Evaluation */}
            {rubricScores && effectiveReportType === 'walkie' && (
                <div className="mb-8 sm:mb-12 animate-in fade-in slide-in-from-bottom-2 duration-300">
                     <div className="mb-3 sm:mb-4 flex items-center gap-2 text-charcoal text-[10px] sm:text-xs font-bold tracking-widest uppercase">
                        <Target size={12} className="sm:w-3.5 sm:h-3.5" /> Rubric Evaluation
                     </div>
                     <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-8 border border-[#EBE8E0] shadow-sm">
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                             {/* Algorithm Score */}
                             <div className="space-y-2">
                                 <div className="flex justify-between text-[10px] sm:text-xs font-bold uppercase tracking-wider sm:tracking-widest">
                                     <span className="text-gray-500">Algorithm</span>
                                     <span className={rubricScores.algorithmScore >= 20 ? 'text-green-600' : rubricScores.algorithmScore >= 10 ? 'text-yellow-600' : 'text-red-500'}>{rubricScores.algorithmScore} / 25</span>
                                 </div>
                                 <div className="h-1.5 sm:h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                     <div className={`h-full ${rubricScores.algorithmScore >= 20 ? 'bg-green-500' : rubricScores.algorithmScore >= 10 ? 'bg-yellow-500' : 'bg-red-400'}`} style={{ width: `${(rubricScores.algorithmScore || 0) * 4}%` }}></div>
                                 </div>
                                 <p className="text-xs text-gray-500 leading-relaxed">{rubricScores.algorithmFeedback}</p>
                             </div>
                             
                             {/* Edge Cases Score */}
                             <div className="space-y-2">
                                 <div className="flex justify-between text-[10px] sm:text-xs font-bold uppercase tracking-wider sm:tracking-widest">
                                     <span className="text-gray-500">Edge Cases</span>
                                     <span className={rubricScores.edgeCasesScore >= 20 ? 'text-green-600' : rubricScores.edgeCasesScore >= 10 ? 'text-yellow-600' : 'text-red-500'}>{rubricScores.edgeCasesScore} / 25</span>
                                 </div>
                                 <div className="h-1.5 sm:h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                     <div className={`h-full ${rubricScores.edgeCasesScore >= 20 ? 'bg-green-500' : rubricScores.edgeCasesScore >= 10 ? 'bg-yellow-500' : 'bg-red-400'}`} style={{ width: `${(rubricScores.edgeCasesScore || 0) * 4}%` }}></div>
                                 </div>
                                 <p className="text-xs text-gray-500 leading-relaxed">{rubricScores.edgeCasesFeedback}</p>
                             </div>
                             
                             {/* Time Complexity Score */}
                             <div className="space-y-2">
                                 <div className="flex justify-between text-[10px] sm:text-xs font-bold uppercase tracking-wider sm:tracking-widest">
                                     <span className="text-gray-500">Time Complexity</span>
                                     <span className={rubricScores.timeComplexityScore >= 20 ? 'text-green-600' : rubricScores.timeComplexityScore >= 10 ? 'text-yellow-600' : 'text-red-500'}>{rubricScores.timeComplexityScore} / 25</span>
                                 </div>
                                 <div className="h-1.5 sm:h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                     <div className={`h-full ${rubricScores.timeComplexityScore >= 20 ? 'bg-green-500' : rubricScores.timeComplexityScore >= 10 ? 'bg-yellow-500' : 'bg-red-400'}`} style={{ width: `${(rubricScores.timeComplexityScore || 0) * 4}%` }}></div>
                                 </div>
                                 <p className="text-xs text-gray-500 leading-relaxed">{rubricScores.timeComplexityFeedback}</p>
                             </div>
                             
                             {/* Space Complexity Score */}
                             <div className="space-y-2">
                                 <div className="flex justify-between text-[10px] sm:text-xs font-bold uppercase tracking-wider sm:tracking-widest">
                                     <span className="text-gray-500">Space Complexity</span>
                                     <span className={rubricScores.spaceComplexityScore >= 20 ? 'text-green-600' : rubricScores.spaceComplexityScore >= 10 ? 'text-yellow-600' : 'text-red-500'}>{rubricScores.spaceComplexityScore} / 25</span>
                                 </div>
                                 <div className="h-1.5 sm:h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                     <div className={`h-full ${rubricScores.spaceComplexityScore >= 20 ? 'bg-green-500' : rubricScores.spaceComplexityScore >= 10 ? 'bg-yellow-500' : 'bg-red-400'}`} style={{ width: `${(rubricScores.spaceComplexityScore || 0) * 4}%` }}></div>
                                 </div>
                                 <p className="text-xs text-gray-500 leading-relaxed">{rubricScores.spaceComplexityFeedback}</p>
                             </div>
                         </div>
                         
                         {/* Missing Edge Cases */}
                         {missingEdgeCases && missingEdgeCases.length > 0 && (
                             <div className="mt-6 pt-6 border-t border-gray-100">
                                 <div className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-red-500 mb-3 flex items-center gap-2">
                                     <AlertCircle size={12} /> Missing Edge Cases
                                 </div>
                                 <div className="flex flex-wrap gap-2">
                                     {missingEdgeCases.map((edgeCase, i) => (
                                         <span key={i} className="text-xs bg-red-50 text-red-600 px-3 py-1 rounded-full border border-red-100">
                                             {edgeCase}
                                         </span>
                                     ))}
                                 </div>
                             </div>
                         )}
                     </div>
                </div>
            )}

            {/* 2. Specific Turn Context (Active Dialogue) */}
            {displayedQuestion && displayedTranscript && isHotTake && (
                 <div className="mb-12 animate-in fade-in slide-in-from-bottom-2 duration-700" key={`context-${activeHotTakeRound}`}>
                    <div className="mb-4 flex items-center gap-2 text-charcoal text-xs font-bold tracking-widest uppercase">
                        <History size={14} /> Active Dialogue
                    </div>
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#EBE8E0]">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-[10px] font-bold text-gold uppercase tracking-[0.2em] bg-gold/5 px-2 py-1 rounded">
                                {activeHotTakeRound === 'round1' ? 'Initial Context' : 'The Probe'}
                            </span>
                        </div>
                        <div className="flex gap-4 items-start mb-4 opacity-70">
                            <MessageSquare size={16} className="shrink-0 mt-1 text-gray-400" />
                            <p className="text-sm font-bold text-gray-700">"{displayedQuestion}"</p>
                        </div>
                        <div className="flex gap-4 items-start">
                            <Quote size={18} className="shrink-0 text-gold mt-1" />
                            <p className="text-gray-600 leading-relaxed font-serif whitespace-pre-wrap">"{displayedTranscript}"</p>
                        </div>
                    </div>
                 </div>
            )}

            {/* 3. Hot Take Master Rewrite */}
            {displayedRewrite && isHotTake && (
                <div className="mb-12 animate-in fade-in slide-in-from-bottom-2 duration-500" key={`rewrite-${activeHotTakeRound}`}>
                     <div className="mb-4 flex items-center gap-2 text-charcoal text-xs font-bold tracking-widest uppercase">
                        <PenTool size={14} /> Master Coaching Rewrite
                     </div>
                     <div className="bg-white rounded-3xl p-10 border-l-4 border-gold shadow-sm relative overflow-hidden">
                         <div className="absolute top-0 right-0 p-8 opacity-5"><Zap size={100} className="text-gold" /></div>
                         <h4 className="text-[10px] font-bold text-gold uppercase tracking-widest mb-6">The Unified Punchline</h4>
                         <div className="text-xl font-serif font-bold text-charcoal leading-relaxed whitespace-pre-wrap italic relative z-10">
                            "{displayedRewrite}"
                         </div>
                     </div>
                </div>
            )}
            
            {/* 4. Hot Take History (Fallback for Legacy Data) */}
            {hotTakeHistory && hotTakeHistory.length > 0 && !hotTakeRounds && (
                <div className="mb-12">
                    <div className="mb-4 flex items-center gap-2 text-charcoal text-xs font-bold tracking-widest uppercase">
                        <History size={14} /> Dialogue Archive
                    </div>
                    <div className="space-y-6">
                        {hotTakeHistory.map((turn, i) => (
                            <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-[#EBE8E0]">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-[10px] font-bold text-gold uppercase tracking-[0.2em] bg-gold/5 px-2 py-1 rounded">{turn.stage}</span>
                                </div>
                                <div className="flex gap-4 items-start mb-4 opacity-70">
                                    <MessageSquare size={16} className="shrink-0 mt-1 text-gray-400" />
                                    <p className="text-sm font-bold text-gray-700">"{turn.query}"</p>
                                </div>
                                <div className="flex gap-4 items-start">
                                    <Quote size={18} className="shrink-0 text-gold mt-1" />
                                    <p className="text-gray-600 leading-relaxed font-serif whitespace-pre-wrap">"{turn.response}"</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Areas for Improvement - Mobile responsive */}
            <div className="mb-3 sm:mb-4 flex items-center gap-2 text-charcoal text-[10px] sm:text-xs font-bold tracking-widest uppercase mt-8 sm:mt-12">
                <Lightbulb size={12} className="sm:w-3.5 sm:h-3.5" /> Areas for Improvement
            </div>
            
            <div className="space-y-4 sm:space-y-6">
                {detailedFeedback?.map((item, i) => {
                    const saved = isSaved(item.issue, item.instance);
                    return (
                        <div key={i} className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-8 shadow-sm border border-[#EBE8E0] relative group">
                            <button 
                                onClick={() => onToggleSave({
                                    type: 'improvement',
                                    category: item.category,
                                    title: item.issue,
                                    content: item.instance,
                                    rewrite: item.rewrite,
                                    explanation: item.explanation,
                                    question: item.question || context,
                                    humanRewrite: item.rewrite,
                                    reportData: createReportContext(report, transcript, context)
                                })}
                                className={`absolute top-3 right-3 sm:top-6 sm:right-6 p-1.5 sm:p-2 rounded-full transition-all ${saved ? 'text-gold bg-gold/10' : 'text-gray-300 hover:text-charcoal hover:bg-gray-50'}`}
                                title={saved ? "Remove from database" : "Save to database"}
                            >
                                <Bookmark size={16} className="sm:w-[18px] sm:h-[18px]" fill={saved ? "currentColor" : "none"} />
                            </button>
                            
                            {/* Practice Button */}
                            <button 
                                onClick={() => navigate('/hot-take', { 
                                    state: { 
                                        practiceQuestion: { 
                                            title: item.question || item.issue, 
                                            context: item.question ? `Practice improving: ${item.issue}` : item.instance,
                                            source: context
                                        } 
                                    } 
                                })}
                                className="absolute top-3 right-10 sm:top-6 sm:right-16 p-1.5 sm:p-2 rounded-full text-gray-300 hover:text-gold hover:bg-gold/10 transition-all"
                                title="Practice this question in Hot Take"
                            >
                                <Zap size={16} className="sm:w-[18px] sm:h-[18px]" />
                            </button>

                            <div className="flex items-center gap-2 mb-3 sm:mb-4">
                                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-red-400"></div>
                                <span className="text-[9px] sm:text-[10px] font-bold text-gold uppercase tracking-widest">{item.category}</span>
                            </div>
                            
                            {/* Question Context */}
                            {item.question && (
                                <div className="mb-3 sm:mb-4 mr-16 sm:mr-8">
                                    <h5 className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 sm:mb-2">Interview Question</h5>
                                    <p className="text-gray-600 text-xs sm:text-sm italic">"{item.question}"</p>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                                <div className="bg-[#FAF9F6] p-4 sm:p-6 rounded-lg sm:rounded-xl border-l-4 border-gray-200">
                                    <h5 className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 sm:mb-3">What You Said</h5>
                                    <p className="text-charcoal font-serif text-base sm:text-lg leading-relaxed mb-2 sm:mb-3">"{item.instance}"</p>
                                    <div className="pt-2 sm:pt-3 border-t border-gray-200">
                                        <h6 className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">The Issue</h6>
                                        <p className="text-xs sm:text-sm text-gray-600">{item.issue}</p>
                                    </div>
                                </div>
                                <div className="bg-green-50/50 p-4 sm:p-6 rounded-lg sm:rounded-xl border-l-4 border-green-400">
                                    <h5 className="text-[9px] sm:text-[10px] font-bold text-green-600 uppercase tracking-widest mb-2 sm:mb-3 flex items-center gap-1.5 sm:gap-2">
                                    <PenTool size={10} className="sm:w-3 sm:h-3"/> The Human Rewrite
                                    </h5>
                                    <div className="text-charcoal font-serif text-base sm:text-lg leading-relaxed mb-3 sm:mb-4">
                                    "{item.rewrite}"
                                    </div>
                                    <div className="pt-3 sm:pt-4 border-t border-green-200/50">
                                        <h6 className="text-[9px] sm:text-[10px] font-bold text-green-600 uppercase tracking-widest mb-1">Why this works</h6>
                                        <p className="text-xs sm:text-sm text-green-800 italic">{item.explanation}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Highlights - Mobile responsive */}
            {highlights && highlights.length > 0 && (
                <>
                    <div className="mb-3 sm:mb-4 flex items-center gap-2 text-charcoal text-[10px] sm:text-xs font-bold tracking-widest uppercase mt-8 sm:mt-12">
                        <ThumbsUp size={12} className="sm:w-3.5 sm:h-3.5" /> Key Strengths & Highlights
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                        {highlights.map((item, i) => {
                            const saved = isSaved(item.strength, item.quote);
                            return (
                                <div key={i} className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm border border-[#EBE8E0] relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-2 sm:p-4 opacity-5">
                                        <Star size={60} className="sm:w-20 sm:h-20" />
                                    </div>
                                    
                                    <button 
                                        onClick={() => onToggleSave({
                                            type: 'highlight',
                                            category: item.category,
                                            title: item.strength,
                                            content: item.quote,
                                            question: item.question || context,
                                            reportData: createReportContext(report, transcript, context)
                                        })}
                                        className={`absolute top-3 right-3 sm:top-4 sm:right-4 p-1.5 sm:p-2 rounded-full z-10 transition-all ${saved ? 'text-gold bg-gold/10' : 'text-gray-300 hover:text-charcoal hover:bg-gray-50'}`}
                                        title={saved ? "Remove from database" : "Save to database"}
                                    >
                                        <Bookmark size={14} className="sm:w-4 sm:h-4" fill={saved ? "currentColor" : "none"} />
                                    </button>

                                    <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                                        <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gold/10 flex items-center justify-center text-gold">
                                            <Star size={10} className="sm:w-3 sm:h-3" fill="#C7A965" />
                                        </div>
                                        <span className="text-[9px] sm:text-[10px] font-bold text-gold uppercase tracking-widest">{item.category}</span>
                                    </div>
                                    
                                    {/* Question Context */}
                                    {item.question && (
                                        <div className="mb-2 sm:mb-3 mr-8 sm:mr-6">
                                            <h5 className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Interview Question</h5>
                                            <p className="text-gray-600 text-[10px] sm:text-xs italic">"{item.question}"</p>
                                        </div>
                                    )}
                                    
                                    <h4 className="text-sm sm:text-md font-bold text-charcoal mb-2 pr-8 sm:pr-6">{item.strength}</h4>
                                    <div className="bg-[#FAF9F6] p-3 sm:p-4 rounded-lg sm:rounded-xl mt-3 sm:mt-4">
                                        <p className="text-charcoal font-serif text-xs sm:text-sm">"{item.quote}"</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {/* Flip The Table - Question Analysis - Mobile responsive */}
            {flipTheTable && (
                <div className="mt-8 sm:mt-12">
                    <div className="mb-3 sm:mb-4 flex items-center gap-2 text-charcoal text-[10px] sm:text-xs font-bold tracking-widest uppercase">
                        <MessageCircleQuestion size={12} className="sm:w-3.5 sm:h-3.5" /> Flip The Table: Your Questions
                    </div>
                    
                    {/* Overall Assessment */}
                    <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm border border-[#EBE8E0] mb-4 sm:mb-6">
                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 shrink-0">
                                <Target size={14} className="sm:w-[18px] sm:h-[18px]" />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-xs sm:text-sm font-bold text-charcoal uppercase tracking-widest mb-1.5 sm:mb-2">Overall Assessment</h4>
                                <p className="text-gray-600 leading-relaxed text-sm sm:text-base">{flipTheTable.overallAssessment}</p>
                            </div>
                        </div>
                    </div>

                    {/* Questions Asked by Candidate - Mobile responsive */}
                    {flipTheTable.candidateQuestions && flipTheTable.candidateQuestions.length > 0 && (
                        <>
                            <h4 className="text-xs sm:text-sm font-bold text-charcoal mb-3 sm:mb-4 flex items-center gap-2">
                                <Quote size={12} className="sm:w-3.5 sm:h-3.5 text-purple-600" />
                                Questions You Asked
                            </h4>
                            <div className="space-y-4 sm:space-y-6 mb-6 sm:mb-8">
                                {flipTheTable.candidateQuestions.map((q, i) => {
                                    const saved = isSaved(q.questionAsked, q.context);
                                    return (
                                        <div key={i} className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm border border-[#EBE8E0] relative group">
                                            <button 
                                                onClick={() => onToggleSave({
                                                    type: 'candidate_question',
                                                    category: 'Question Analysis',
                                                    title: q.questionAsked,
                                                    content: q.context,
                                                    rewrite: q.improvedVersion,
                                                    context: q.context,
                                                    explanation: q.analysis + ' ' + q.reasoning,
                                                    reportData: createReportContext(report, transcript, context)
                                                })}
                                                className={`absolute top-3 right-3 sm:top-6 sm:right-6 p-1.5 sm:p-2 rounded-full z-10 transition-all ${saved ? 'text-gold bg-gold/10' : 'text-gray-300 hover:text-charcoal hover:bg-gray-50'}`}
                                                title={saved ? "Remove from database" : "Save to database"}
                                            >
                                                <Bookmark size={14} className="sm:w-4 sm:h-4" fill={saved ? "currentColor" : "none"} />
                                            </button>

                                            {/* Context Banner */}
                                            <div className="bg-purple-50 rounded-lg p-2.5 sm:p-3 mb-3 sm:mb-4 mr-10 sm:mr-8">
                                                <h5 className="text-[9px] sm:text-[10px] font-bold text-purple-600 uppercase tracking-widest mb-1">Conversation Context</h5>
                                                <p className="text-xs sm:text-sm text-purple-800 italic">{q.context}</p>
                                            </div>

                                        {/* Question Asked */}
                                        <div className="mb-3 sm:mb-4">
                                            <h5 className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 sm:mb-2">What You Asked</h5>
                                            <p className="text-charcoal font-serif text-base sm:text-lg">"{q.questionAsked}"</p>
                                        </div>

                                        {/* Analysis & Improved Version */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                                            <div className="bg-[#FAF9F6] p-3 sm:p-4 rounded-lg sm:rounded-xl">
                                                <h5 className="text-[9px] sm:text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5 sm:mb-2">Analysis</h5>
                                                <p className="text-xs sm:text-sm text-gray-700">{q.analysis}</p>
                                            </div>
                                            <div className={`p-3 sm:p-4 rounded-lg sm:rounded-xl ${q.improvedVersion ? 'bg-green-50 border-l-4 border-green-400' : 'bg-blue-50'}`}>
                                                {q.improvedVersion ? (
                                                    <>
                                                        <h5 className="text-[9px] sm:text-[10px] font-bold text-green-600 uppercase tracking-widest mb-1.5 sm:mb-2 flex items-center gap-1">
                                                            <Sparkles size={10} className="sm:w-3 sm:h-3" /> Improved Version
                                                        </h5>
                                                        <p className="text-xs sm:text-sm text-charcoal font-serif mb-2 sm:mb-3">"{q.improvedVersion}"</p>
                                                        <div className="pt-2 border-t border-green-200">
                                                            <p className="text-[10px] sm:text-xs text-green-800">{q.reasoning}</p>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <h5 className="text-[9px] sm:text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1.5 sm:mb-2">Why This Worked</h5>
                                                        <p className="text-xs sm:text-sm text-blue-800">{q.reasoning}</p>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                                })}
                            </div>
                        </>
                    )}

                    {/* Missed Opportunities - Mobile responsive */}
                    {flipTheTable.missedOpportunities && flipTheTable.missedOpportunities.length > 0 && (
                        <>
                            <h4 className="text-xs sm:text-sm font-bold text-charcoal mb-3 sm:mb-4 flex items-center gap-2">
                                <Sparkles size={12} className="sm:w-3.5 sm:h-3.5 text-orange-600" />
                                <span className="hidden sm:inline">Missed Opportunities: Questions You Should Have Asked</span>
                                <span className="sm:hidden">Missed Opportunities</span>
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                                {flipTheTable.missedOpportunities.map((opp, i) => {
                                    const saved = isSaved(opp.suggestedQuestion, opp.context);
                                    return (
                                        <div key={i} className="bg-gradient-to-br from-orange-50 to-yellow-50 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-sm border border-orange-200 relative group">
                                            <button 
                                                onClick={() => onToggleSave({
                                                    type: 'missed_opportunity',
                                                    category: 'Missed Opportunity',
                                                    title: opp.suggestedQuestion,
                                                    content: opp.context,
                                                    context: opp.context,
                                                    impact: opp.impact,
                                                    reportData: createReportContext(report, transcript, context)
                                                })}
                                                className={`absolute top-3 right-3 sm:top-4 sm:right-4 p-1.5 sm:p-2 rounded-full z-10 transition-all ${saved ? 'text-gold bg-gold/10' : 'text-gray-300 hover:text-charcoal hover:bg-white'}`}
                                                title={saved ? "Remove from database" : "Save to database"}
                                            >
                                                <Bookmark size={14} className="sm:w-4 sm:h-4" fill={saved ? "currentColor" : "none"} />
                                            </button>

                                            <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                                                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-orange-500 flex items-center justify-center text-white">
                                                    <Lightbulb size={10} className="sm:w-3 sm:h-3" />
                                                </div>
                                                <span className="text-[9px] sm:text-[10px] font-bold text-orange-600 uppercase tracking-widest">Opportunity {i + 1}</span>
                                            </div>

                                        {/* Suggested Question */}
                                        <div className="bg-white rounded-lg sm:rounded-xl p-3 sm:p-4 mb-3 sm:mb-4">
                                            <h5 className="text-[9px] sm:text-[10px] font-bold text-orange-600 uppercase tracking-widest mb-1.5 sm:mb-2">Suggested Question</h5>
                                            <p className="text-charcoal font-serif text-sm sm:text-base">"{opp.suggestedQuestion}"</p>
                                        </div>

                                        {/* Context */}
                                        <div className="mb-2 sm:mb-3">
                                            <h5 className="text-[9px] sm:text-[10px] font-bold text-orange-600 uppercase tracking-widest mb-1">When to Ask</h5>
                                            <p className="text-xs sm:text-sm text-orange-900">{opp.context}</p>
                                        </div>

                                        {/* Impact */}
                                        <div className="pt-2 sm:pt-3 border-t border-orange-200">
                                            <h5 className="text-[9px] sm:text-[10px] font-bold text-orange-600 uppercase tracking-widest mb-1">Why This Matters</h5>
                                            <p className="text-[10px] sm:text-xs text-orange-800 italic">{opp.impact}</p>
                                        </div>
                                    </div>
                                );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Pronunciation & Pacing - Mobile responsive */}
            {pronunciationFeedback && pronunciationFeedback.length > 0 && (
                <div className="mt-8 sm:mt-12">
                     <div className="mb-3 sm:mb-4 flex items-center gap-2 text-charcoal text-[10px] sm:text-xs font-bold tracking-widest uppercase">
                        <Ear size={12} className="sm:w-3.5 sm:h-3.5" /> Pronunciation, Pace & Presence
                     </div>
                     <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-8 border border-[#EBE8E0] shadow-sm">
                         <p className="text-gray-600 mb-4 sm:mb-6 text-xs sm:text-base">Targeted drills to shift from "Machine Gun" delivery to "Executive Presence".</p>
                         <div className="grid gap-4 sm:gap-6">
                             {pronunciationFeedback.map((drill, i) => {
                                 const saved = isSaved(drill.issue, drill.phrase);
                                 return (
                                     <div key={i} className="flex flex-col gap-3 sm:gap-4 p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-gray-100 bg-[#FAF9F6] relative group">
                                         <button 
                                            onClick={() => onToggleSave({
                                                type: 'drill',
                                                category: 'Pronunciation',
                                                title: drill.issue,
                                                content: drill.phrase,
                                                rewrite: drill.practiceDrill,
                                                question: drill.question || context,
                                                humanRewrite: drill.practiceDrill,
                                                reportData: createReportContext(report, transcript, context)
                                            })}
                                            className={`absolute top-3 right-3 sm:top-4 sm:right-4 p-1.5 sm:p-2 rounded-full transition-all z-10 ${saved ? 'text-gold bg-gold/10' : 'text-gray-300 hover:text-charcoal hover:bg-white'}`}
                                            title={saved ? "Remove from database" : "Save to database"}
                                        >
                                            <Bookmark size={14} className="sm:w-4 sm:h-4" fill={saved ? "currentColor" : "none"} />
                                        </button>

                                         {/* Question Context */}
                                         {drill.question && (
                                             <div className="mr-10 sm:mr-8 mb-1 sm:mb-2">
                                                 <h5 className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Interview Question</h5>
                                                 <p className="text-gray-600 text-[10px] sm:text-xs italic">"{drill.question}"</p>
                                             </div>
                                         )}

                                         <div className="flex flex-col md:flex-row gap-4 sm:gap-6">
                                             <div className="md:w-1/3">
                                                <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2 text-red-500">
                                                    <AlertCircle size={12} className="sm:w-3.5 sm:h-3.5" />
                                                    <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">The Trap</span>
                                                </div>
                                                <h5 className="font-bold text-charcoal mb-1 text-sm sm:text-base">{drill.issue}</h5>
                                                <p className="text-xs sm:text-sm text-gray-500 italic mb-2">"{drill.phrase}"</p>
                                             </div>

                                             <div className="flex-1 bg-white p-4 sm:p-6 rounded-lg sm:rounded-xl border border-gold/20 shadow-sm">
                                                 <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3 text-gold">
                                                    <Mic2 size={12} className="sm:w-3.5 sm:h-3.5" />
                                                    <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">The Drill</span>
                                                </div>
                                                <div className="font-serif text-base sm:text-xl text-charcoal tracking-wide mb-2 sm:mb-3 leading-relaxed">
                                                    {drill.practiceDrill}
                                                </div>
                                                <p className="text-[10px] sm:text-xs text-gray-500 border-t border-gray-100 pt-2 sm:pt-3">
                                                    <span className="font-bold">Why:</span> {drill.reason}
                                                </p>
                                             </div>
                                         </div>
                                     </div>
                                 );
                             })}
                         </div>
                     </div>
                </div>
            )}
        </div>
    );
};

export default PerformanceReport;
