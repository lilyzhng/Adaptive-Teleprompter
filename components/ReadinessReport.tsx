/**
 * Readiness Report Component
 * 
 * Displays the "Readiness to Teach" evaluation after Pass 1 (Explain mode).
 * Layout: Score → Rubric → Two columns (Analysis | Model) → Full-width Code
 */

import React, { useRef } from 'react';
import { 
    CheckCircle2, 
    XCircle, 
    AlertTriangle, 
    Lightbulb, 
    Database, 
    Route, 
    Shield,
    ArrowRight,
    RotateCcw,
    FileText,
    FileJson,
    Download,
    Code2,
    BookOpen
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { ReadinessReport, BlindProblem } from '../types';

interface ReadinessReportComponentProps {
    report: ReadinessReport;
    problemTitle: string;
    problem?: BlindProblem;
    onContinueToTeach: () => void;
    onTryAgain: () => void;
    rawTranscript?: string;
    refinedTranscript?: string;
}

const ReadinessReportComponent: React.FC<ReadinessReportComponentProps> = ({
    report,
    problemTitle,
    problem,
    onContinueToTeach,
    onTryAgain,
    rawTranscript,
    refinedTranscript
}) => {
    const { checklist, readinessScore, isReadyToTeach } = report;
    const reportRef = useRef<HTMLDivElement>(null);

    // Download handlers
    const downloadReportAsImage = async () => {
        if (!reportRef.current) return;
        try {
            const canvas = await html2canvas(reportRef.current, {
                backgroundColor: '#FAF9F6',
                scale: 2,
                useCORS: true
            });
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            link.download = `readiness-report-${problemTitle.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.png`;
            link.click();
        } catch (e) {
            console.error('Failed to export report:', e);
        }
    };

    const downloadTranscript = () => {
        const content = `=== READINESS EVALUATION TRANSCRIPT ===
Problem: ${problemTitle}
Date: ${new Date().toISOString()}

=== RAW TRANSCRIPT ===
${rawTranscript || '(not available)'}

=== REFINED TRANSCRIPT ===
${refinedTranscript || '(not available)'}
`;
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transcript-${problemTitle.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const downloadEvaluation = () => {
        const content = JSON.stringify({
            problemTitle,
            timestamp: new Date().toISOString(),
            transcriptUsed: refinedTranscript || rawTranscript || '(not available)',
            evaluation: report
        }, null, 2);
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `evaluation-${problemTitle.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Get quality indicator
    const getQualityIndicator = (quality: string, present: boolean) => {
        if (!present || quality === 'missing') {
            return { icon: <XCircle size={14} />, color: 'text-red-500', status: 'missing', points: 0 };
        }
        if (quality === 'vague' || quality === 'hand-wavy' || quality === 'abstract') {
            return { icon: <AlertTriangle size={14} />, color: 'text-amber-500', status: 'partial', points: 10 };
        }
        return { icon: <CheckCircle2 size={14} />, color: 'text-green-600', status: 'good', points: 20 };
    };

    // Combined analysis items with scores (5 × 20 = 100)
    const analysisItems = [
        { 
            key: 'coreInsight', 
            label: 'Core Insight', 
            icon: <Lightbulb size={14} />, 
            data: checklist.coreInsight,
            quality: checklist.coreInsight.quality,
            present: checklist.coreInsight.present
        },
        { 
            key: 'stateDefinition', 
            label: 'State Definition', 
            icon: <Database size={14} />, 
            data: checklist.stateDefinition,
            quality: checklist.stateDefinition.quality,
            present: checklist.stateDefinition.present
        },
        { 
            key: 'exampleWalkthrough', 
            label: 'Example Walkthrough', 
            icon: <Route size={14} />, 
            data: checklist.exampleWalkthrough,
            quality: checklist.exampleWalkthrough.quality,
            present: checklist.exampleWalkthrough.present
        },
        { 
            key: 'edgeCases', 
            label: 'Edge Cases', 
            icon: <Shield size={14} />, 
            data: { present: checklist.edgeCases.mentioned.length > 0, quality: checklist.edgeCases.missing.length === 0 ? 'clear' : checklist.edgeCases.mentioned.length > 0 ? 'vague' : 'missing', feedback: checklist.edgeCases.feedback },
            quality: checklist.edgeCases.missing.length === 0 ? 'clear' : checklist.edgeCases.mentioned.length > 0 ? 'vague' : 'missing',
            present: checklist.edgeCases.mentioned.length > 0
        },
        { 
            key: 'complexity', 
            label: 'Complexity', 
            icon: <Code2 size={14} />, 
            data: { present: checklist.complexity.timeMentioned || checklist.complexity.spaceMentioned, quality: (checklist.complexity.timeCorrect && checklist.complexity.spaceCorrect) ? 'clear' : (checklist.complexity.timeMentioned || checklist.complexity.spaceMentioned) ? 'vague' : 'missing', feedback: checklist.complexity.feedback },
            quality: (checklist.complexity.timeCorrect && checklist.complexity.spaceCorrect) ? 'clear' : (checklist.complexity.timeMentioned || checklist.complexity.spaceMentioned) ? 'vague' : 'missing',
            present: checklist.complexity.timeMentioned || checklist.complexity.spaceMentioned
        }
    ].map(item => ({
        ...item,
        ...getQualityIndicator(item.quality, item.present),
        maxPoints: 20
    }));
    
    const totalPoints = analysisItems.reduce((sum, item) => sum + item.points, 0);

    // Format text with escaped newlines/tabs (from AI-generated content)
    const formatText = (text: string) => {
        if (!text) return '';
        return text.replace(/\\n/g, '\n').replace(/\\t/g, '    ').trim();
    };

    return (
        <div className="space-y-4">
            {/* Export Buttons */}
            <div className="flex justify-end gap-2 flex-wrap">
                <button onClick={downloadTranscript} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-xs font-medium hover:bg-gray-50 transition-all">
                    <FileText size={12} /> Transcript
                </button>
                <button onClick={downloadEvaluation} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-xs font-medium hover:bg-gray-50 transition-all">
                    <FileJson size={12} /> JSON
                </button>
                <button onClick={downloadReportAsImage} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-gray-200 text-charcoal text-xs font-medium hover:bg-gray-50 shadow-sm transition-all">
                    <Download size={12} /> Export Image
                </button>
            </div>

            {/* Report Content */}
            <div ref={reportRef} className="bg-cream p-4 rounded-2xl space-y-4">
                {/* Score Header */}
                <div className={`rounded-xl p-4 border ${isReadyToTeach ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-serif font-bold text-charcoal">{problemTitle}</h3>
                            <p className="text-xs text-gray-500">{isReadyToTeach ? "Ready to teach!" : "Almost there — review the model answer"}</p>
                        </div>
                        <div className={`text-3xl font-bold font-mono ${isReadyToTeach ? 'text-green-600' : 'text-amber-600'}`}>
                            {readinessScore}
                        </div>
                    </div>
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mt-3">
                        <div className={`h-full transition-all duration-700 ${isReadyToTeach ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${readinessScore}%` }} />
                    </div>
                </div>

                {/* Your Explanation with Inline Scores - 2x2 Grid + Full-width Edge Cases */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                        <h4 className="text-xs font-bold text-charcoal uppercase tracking-widest flex items-center gap-1.5">
                            <BookOpen size={12} /> Your Explanation
                        </h4>
                        <span className="text-xs text-gray-400">{totalPoints} / 100</span>
                    </div>
                    
                    {/* 2x2 Grid for Core Insight, State Definition, Example Walkthrough, Complexity */}
                    <div className="grid grid-cols-2 divide-x divide-y divide-gray-100">
                        {analysisItems.filter(item => item.key !== 'edgeCases').map(item => (
                            <div key={item.key} className="p-3">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <span className={item.color}>{item.icon}</span>
                                    <span className="text-xs font-semibold text-charcoal flex-1">{item.label}</span>
                                    <span className={`text-[10px] font-bold ${item.color}`}>{item.points}/{item.maxPoints}</span>
                                </div>
                                <p className="text-[11px] text-gray-600 leading-relaxed">{item.data.feedback}</p>
                            </div>
                        ))}
                    </div>
                    
                    {/* Edge Cases - Full Width */}
                    {(() => {
                        const edgeCasesItem = analysisItems.find(item => item.key === 'edgeCases')!;
                        return (
                            <div className="p-3 border-t border-gray-100">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <span className={edgeCasesItem.color}>{edgeCasesItem.icon}</span>
                                    <span className="text-xs font-semibold text-charcoal flex-1">Edge Cases</span>
                                    <span className={`text-[10px] font-bold ${edgeCasesItem.color}`}>{edgeCasesItem.points}/{edgeCasesItem.maxPoints}</span>
                                </div>
                                <p className="text-[11px] text-gray-600 leading-relaxed mb-2">{edgeCasesItem.data.feedback}</p>
                                <div className="flex flex-wrap gap-1">
                                    {checklist.edgeCases.mentioned.map((ec, i) => (
                                        <span key={`m-${i}`} className="inline-flex items-center gap-0.5 bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded text-[10px]">
                                            <CheckCircle2 size={8} /> {ec}
                                        </span>
                                    ))}
                                    {checklist.edgeCases.missing.map((ec, i) => (
                                        <span key={`x-${i}`} className="inline-flex items-center gap-0.5 bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded text-[10px]">
                                            <XCircle size={8} /> {ec}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}
                </div>

                {/* Section 2: Model Answer (Dark theme) */}
                {problem ? (
                    <div className="bg-[#1a1a1a] rounded-xl border border-[#333] overflow-hidden">
                        <div className="px-4 py-2 border-b border-[#333] bg-[#222]">
                            <h4 className="text-xs font-bold text-gold uppercase tracking-widest flex items-center gap-1.5">
                                <Lightbulb size={12} /> Model Answer
                            </h4>
                        </div>
                        
                        {/* The Right Explanation */}
                        <div className="p-4 border-b border-[#333]">
                            <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Key Insight</h5>
                            <p className="text-sm text-gray-200 leading-relaxed">{problem.keyIdea}</p>
                            {problem.steps && problem.steps.length > 0 && (
                                <ol className="text-xs text-gray-400 mt-3 space-y-1 list-decimal list-inside">
                                    {problem.steps.map((step, idx) => (
                                        <li key={idx}>{step}</li>
                                    ))}
                                </ol>
                            )}
                        </div>

                        {/* Complexity */}
                        <div className="p-4 border-b border-[#333] bg-[#181818]">
                            <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Complexity</h5>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <div className="bg-[#222] rounded-lg p-3 border border-[#333]">
                                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">Time</span>
                                    <p className="text-lg font-mono font-bold text-white">{problem.timeComplexity}</p>
                                </div>
                                <div className="bg-[#222] rounded-lg p-3 border border-[#333]">
                                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">Space</span>
                                    <p className="text-lg font-mono font-bold text-white">{problem.spaceComplexity}</p>
                                </div>
                            </div>
                            {/* Complexity Explanation */}
                            {checklist.complexity.correctExplanation && (
                                <div className="pt-3 border-t border-[#333]">
                                    <p className="text-xs text-gray-400 leading-relaxed">
                                        <span className="text-gold font-medium">Why? </span>
                                        {checklist.complexity.correctExplanation}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Example Walkthrough */}
                        {checklist.exampleWalkthrough.modelExample && (
                            <div className="p-4">
                                <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Example Walkthrough</h5>
                                <div className="text-xs text-gray-300 leading-relaxed whitespace-pre-line">
                                    {formatText(checklist.exampleWalkthrough.modelExample)}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="bg-[#1a1a1a] rounded-xl border border-[#333] p-4">
                        <p className="text-sm text-gray-400 text-center">Model answer not available.</p>
                    </div>
                )}

                {/* Full-width Python Code at Bottom */}
                {problem?.skeleton && (
                    <div className="bg-[#0d0d0d] rounded-xl border border-[#333] overflow-hidden">
                        <div className="px-4 py-2 border-b border-[#333] flex items-center gap-2 bg-[#1a1a1a]">
                            <Code2 size={14} className="text-gold" />
                            <span className="text-xs font-bold text-gold uppercase tracking-wider">Python Solution</span>
                        </div>
                        <pre className="p-4 overflow-x-auto text-sm leading-relaxed">
                            <code className="text-gray-300 font-mono whitespace-pre">
                                {formatText(problem.skeleton)}
                            </code>
                        </pre>
                    </div>
                )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
                <button
                    onClick={onTryAgain}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-bold uppercase tracking-wider text-xs hover:border-gray-400 hover:bg-gray-50 transition-all"
                >
                    <RotateCcw size={16} />
                    Explain Again
                </button>
                <button
                    onClick={onContinueToTeach}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold uppercase tracking-wider text-xs transition-all ${
                        isReadyToTeach
                            ? 'bg-green-600 text-white hover:bg-green-700 shadow-lg'
                            : 'bg-amber-500 text-white hover:bg-amber-600'
                    }`}
                >
                    Continue to Teach
                    <ArrowRight size={16} />
                </button>
            </div>

            {!isReadyToTeach && (
                <p className="text-center text-[10px] text-gray-400 italic">
                    Review the model answer, then try explaining again or continue to teach
                </p>
            )}
        </div>
    );
};

export default ReadinessReportComponent;
