
import React, { useRef, useState } from 'react';
import { Download, Award, PenTool, Quote, Lightbulb, Bookmark, ThumbsUp, Star, Ear, AlertCircle, Mic2, FileText } from 'lucide-react';
import { PerformanceReport as ReportType, SavedItem } from '../types';
import html2canvas from 'html2canvas';

interface PerformanceReportProps {
    report: ReportType;
    transcript?: string;
    isSaved: (title: string, content: string) => boolean;
    onToggleSave: (item: Omit<SavedItem, 'id' | 'date'>) => void;
    onDone: (force: boolean) => void;
}

const PerformanceReport: React.FC<PerformanceReportProps> = ({ report, transcript, isSaved, onToggleSave, onDone }) => {
    const { rating, summary, detailedFeedback, highlights, pronunciationFeedback, coachingRewrite } = report;
    const [showRewrite, setShowRewrite] = useState(false);
    const reportRef = useRef<HTMLDivElement>(null);

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
        if (!transcript) return;
        const blob = new Blob([transcript], { type: 'text/plain' });
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
            <div className="mb-8 flex items-center justify-between">
                <div>
                     <div className="flex items-center gap-2 text-gold text-xs font-bold tracking-widest uppercase mb-2">
                        <Award size={14} /> Stage 2: The Coach
                     </div>
                     <h2 className="text-4xl font-serif font-bold text-charcoal">Performance Report</h2>
                </div>
                <div className="flex gap-3">
                     {transcript && (
                        <button onClick={downloadTranscript} className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-medium hover:bg-gray-50 text-charcoal flex items-center gap-2">
                            <FileText size={14} /> Download Transcript
                        </button>
                     )}
                     <button onClick={downloadReportAsImage} className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-medium hover:bg-gray-50 text-charcoal flex items-center gap-2">
                        <Download size={14} /> Export Image
                     </button>
                     <button onClick={() => onDone(true)} className="px-6 py-2 bg-charcoal text-white rounded-full text-sm font-bold hover:bg-black">
                        Done
                     </button>
                </div>
            </div>

            {/* Executive Summary Card */}
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-[#EBE8E0] mb-8 flex flex-col md:flex-row gap-8 items-start">
                 <div className="shrink-0 relative w-32 h-32 flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(#C7A965 ${rating}%, #F0EBE0 ${rating}% 100%)` }}></div>
                      <div className="absolute inset-2 bg-white rounded-full flex flex-col items-center justify-center z-10">
                          <span className="text-4xl font-serif font-bold text-charcoal">{rating}</span>
                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">/ 100</span>
                      </div>
                 </div>
                 <div className="flex-1">
                      <h3 className="text-xl font-serif font-bold text-charcoal mb-3">Executive Summary</h3>
                      <p className="text-gray-600 leading-relaxed">{summary}</p>
                      
                      {coachingRewrite && (
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

            {/* Areas for Improvement */}
            <div className="mb-4 flex items-center gap-2 text-charcoal text-xs font-bold tracking-widest uppercase mt-12">
                <Lightbulb size={14} /> Areas for Improvement
            </div>
            
            <div className="space-y-6">
                {detailedFeedback?.map((item, i) => {
                    const saved = isSaved(item.issue, item.instance);
                    return (
                        <div key={i} className="bg-white rounded-2xl p-8 shadow-sm border border-[#EBE8E0] relative group">
                            <button 
                                onClick={() => onToggleSave({
                                    type: 'improvement',
                                    category: item.category,
                                    title: item.issue,
                                    content: item.instance,
                                    rewrite: item.rewrite,
                                    explanation: item.explanation
                                })}
                                className={`absolute top-6 right-6 p-2 rounded-full transition-all ${saved ? 'text-gold bg-gold/10' : 'text-gray-300 hover:text-charcoal hover:bg-gray-50'}`}
                                title={saved ? "Remove from database" : "Save to database"}
                            >
                                <Bookmark size={18} fill={saved ? "currentColor" : "none"} />
                            </button>

                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-2 h-2 rounded-full bg-red-400"></div>
                                <span className="text-[10px] font-bold text-gold uppercase tracking-widest">{item.category}</span>
                            </div>
                            
                            <h4 className="text-lg font-bold text-charcoal mb-2">The Issue</h4>
                            <p className="text-gray-600 mb-6 mr-8">{item.issue}</p>

                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="bg-[#FAF9F6] p-6 rounded-xl border-l-4 border-gray-200">
                                    <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Specific Instance</h5>
                                    <p className="text-charcoal text-lg leading-relaxed">"{item.instance}"</p>
                                </div>
                                <div className="bg-green-50/50 p-6 rounded-xl border-l-4 border-green-400">
                                    <h5 className="text-[10px] font-bold text-green-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <PenTool size={12}/> The Human Rewrite
                                    </h5>
                                    <div className="text-charcoal font-serif text-lg leading-relaxed mb-4">
                                    "{item.rewrite}"
                                    </div>
                                    <div className="pt-4 border-t border-green-200/50">
                                        <h6 className="text-[10px] font-bold text-green-600 uppercase tracking-widest mb-1">Why this works</h6>
                                        <p className="text-sm text-green-800 italic">{item.explanation}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Highlights */}
            {highlights && highlights.length > 0 && (
                <>
                    <div className="mb-4 flex items-center gap-2 text-charcoal text-xs font-bold tracking-widest uppercase mt-12">
                        <ThumbsUp size={14} /> Key Strengths & Highlights
                    </div>
                    <div className="grid md:grid-cols-2 gap-6">
                        {highlights.map((item, i) => {
                            const saved = isSaved(item.strength, item.quote);
                            return (
                                <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-[#EBE8E0] relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-4 opacity-5">
                                        <Star size={80} />
                                    </div>
                                    
                                    <button 
                                        onClick={() => onToggleSave({
                                            type: 'highlight',
                                            category: item.category,
                                            title: item.strength,
                                            content: item.quote
                                        })}
                                        className={`absolute top-4 right-4 p-2 rounded-full z-10 transition-all ${saved ? 'text-gold bg-gold/10' : 'text-gray-300 hover:text-charcoal hover:bg-gray-50'}`}
                                        title={saved ? "Remove from database" : "Save to database"}
                                    >
                                        <Bookmark size={16} fill={saved ? "currentColor" : "none"} />
                                    </button>

                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-6 h-6 rounded-full bg-gold/10 flex items-center justify-center text-gold">
                                            <Star size={12} fill="#C7A965" />
                                        </div>
                                        <span className="text-[10px] font-bold text-gold uppercase tracking-widest">{item.category}</span>
                                    </div>
                                    <h4 className="text-md font-bold text-charcoal mb-2 pr-6">{item.strength}</h4>
                                    <div className="bg-[#FAF9F6] p-4 rounded-xl mt-4">
                                        <p className="text-charcoal italic font-serif text-sm">"{item.quote}"</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {/* Pronunciation & Pacing */}
            {pronunciationFeedback && pronunciationFeedback.length > 0 && (
                <div className="mt-12">
                     <div className="mb-4 flex items-center gap-2 text-charcoal text-xs font-bold tracking-widest uppercase">
                        <Ear size={14} /> Pronunciation, Pace & Presence
                     </div>
                     <div className="bg-white rounded-3xl p-8 border border-[#EBE8E0] shadow-sm">
                         <p className="text-gray-600 mb-6">Targeted drills to shift from "Machine Gun" delivery to "Executive Presence".</p>
                         <div className="grid gap-6">
                             {pronunciationFeedback.map((drill, i) => {
                                 const saved = isSaved(drill.issue, drill.phrase);
                                 return (
                                     <div key={i} className="flex flex-col md:flex-row gap-6 p-6 rounded-2xl border border-gray-100 bg-[#FAF9F6] relative group">
                                         <button 
                                            onClick={() => onToggleSave({
                                                type: 'drill',
                                                category: 'Pronunciation',
                                                title: drill.issue,
                                                content: drill.phrase,
                                                rewrite: drill.practiceDrill
                                            })}
                                            className={`absolute top-4 right-4 p-2 rounded-full transition-all z-10 ${saved ? 'text-gold bg-gold/10' : 'text-gray-300 hover:text-charcoal hover:bg-white'}`}
                                            title={saved ? "Remove from database" : "Save to database"}
                                        >
                                            <Bookmark size={16} fill={saved ? "currentColor" : "none"} />
                                        </button>

                                         <div className="md:w-1/3">
                                            <div className="flex items-center gap-2 mb-2 text-red-500">
                                                <AlertCircle size={14} />
                                                <span className="text-[10px] font-bold uppercase tracking-widest">The Trap</span>
                                            </div>
                                            <h5 className="font-bold text-charcoal mb-1">{drill.issue}</h5>
                                            <p className="text-sm text-gray-500 italic mb-2">"{drill.phrase}"</p>
                                         </div>

                                         <div className="flex-1 bg-white p-6 rounded-xl border border-gold/20 shadow-sm">
                                             <div className="flex items-center gap-2 mb-3 text-gold">
                                                <Mic2 size={14} />
                                                <span className="text-[10px] font-bold uppercase tracking-widest">The Drill</span>
                                            </div>
                                            <div className="font-serif text-xl text-charcoal tracking-wide mb-3 leading-relaxed">
                                                {drill.practiceDrill}
                                            </div>
                                            <p className="text-xs text-gray-500 border-t border-gray-100 pt-3">
                                                <span className="font-bold">Why:</span> {drill.reason}
                                            </p>
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
