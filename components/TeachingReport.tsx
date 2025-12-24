import React, { useRef } from 'react';
import { Award, CheckCircle2, AlertCircle, XCircle, ArrowRight, Target, Lightbulb, TrendingUp, MessageSquare, GraduationCap, Download, FileText, AlertTriangle, RotateCcw, Code2, Route } from 'lucide-react';
import html2canvas from 'html2canvas';
import { TeachingReport, TeachingSession, BlindProblem } from '../types';

interface TeachingReportComponentProps {
  report: TeachingReport;
  juniorSummary?: string;
  problemTitle: string;
  leetcodeNumber?: number;
  problem?: BlindProblem; // For displaying solution, complexity, example
  onContinue: () => void;
  onTryAgain?: () => void; // Optional: retry teaching the same problem
  isLastProblem: boolean;
  teachingSession?: TeachingSession; // For debug transcript export
}

const TeachingReportComponent: React.FC<TeachingReportComponentProps> = ({
  report,
  juniorSummary,
  problemTitle,
  leetcodeNumber,
  problem,
  onContinue,
  onTryAgain,
  isLastProblem,
  teachingSession
}) => {
  const reportRef = useRef<HTMLDivElement>(null);

  // Format text with escaped newlines/tabs (from AI-generated or stored content)
  const formatText = (text: string) => {
    if (!text) return '';
    return text.replace(/\\n/g, '\n').replace(/\\t/g, '    ').trim();
  };

  const downloadReportAsImage = async () => {
    if (!reportRef.current) return;
    try {
      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: '#FAF9F6', // cream background
        scale: 2,
        useCORS: true
      });
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `teaching-report-${problemTitle.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.png`;
      link.click();
    } catch (e) {
      console.error('Failed to export report:', e);
    }
  };

  // Download debug transcript for troubleshooting evaluation issues
  const downloadDebugTranscript = () => {
    if (!teachingSession) return;

    const timestamp = new Date().toISOString();
    let debugContent = `=== TEACHING SESSION DEBUG EXPORT ===\n`;
    debugContent += `Problem: ${problemTitle}\n`;
    debugContent += `Exported: ${timestamp}\n`;
    debugContent += `\n${'='.repeat(60)}\n\n`;

    // Show each turn with both raw and refined versions
    debugContent += `=== CONVERSATION TRANSCRIPT ===\n\n`;
    teachingSession.turns.forEach((turn, idx) => {
      debugContent += `--- Turn ${idx + 1} (${turn.speaker.toUpperCase()}) ---\n`;
      if (turn.speaker === 'teacher') {
        if (turn.rawContent) {
          debugContent += `\n[RAW TRANSCRIPT - What you actually said]:\n${turn.rawContent}\n`;
          debugContent += `\n[REFINED TRANSCRIPT - After AI refinement]:\n${turn.content}\n`;
          
          // Highlight potential differences
          if (turn.rawContent !== turn.content) {
            debugContent += `\n⚠️ NOTE: Refinement changed the transcript. Check if examples were removed.\n`;
          }
        } else {
          debugContent += `\n[TRANSCRIPT (no raw version saved)]:\n${turn.content}\n`;
        }
      } else {
        debugContent += `\n[JUNIOR'S RESPONSE]:\n${turn.content}\n`;
      }
      debugContent += `\n`;
    });

    // Junior's summary
    if (juniorSummary) {
      debugContent += `\n${'='.repeat(60)}\n`;
      debugContent += `=== JUNIOR'S FINAL SUMMARY ===\n\n`;
      debugContent += juniorSummary;
      debugContent += `\n`;
    }

    // Evaluation results
    debugContent += `\n${'='.repeat(60)}\n`;
    debugContent += `=== DEAN'S EVALUATION ===\n\n`;
    debugContent += `Teaching Score: ${report.teachingScore}/100\n`;
    debugContent += `Student Outcome: ${report.studentOutcome}\n`;
    debugContent += `Junior Summary Correct: ${report.juniorSummaryCorrect}\n\n`;
    
    debugContent += `Breakdown:\n`;
    debugContent += `  - Clarity: ${report.breakdown.clarity}/10\n`;
    debugContent += `  - Correctness: ${report.breakdown.correctness}/10\n`;
    debugContent += `  - Completeness: ${report.breakdown.completeness}/10\n`;
    debugContent += `  - Student Mastery: ${report.breakdown.studentMastery}/10\n`;
    debugContent += `  - Scaffolding: ${report.breakdown.scaffolding}/10\n\n`;

    debugContent += `Evidence Notes:\n`;
    report.evidenceNotes.forEach((note, idx) => {
      debugContent += `  ${idx + 1}. ${note}\n`;
    });

    debugContent += `\nTop Gaps:\n`;
    report.topGaps.forEach((gap, idx) => {
      debugContent += `  ${idx + 1}. ${gap}\n`;
    });

    debugContent += `\nConcrete Improvement:\n  ${report.concreteImprovement}\n`;

    // Create and download the file
    const blob = new Blob([debugContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `teaching-debug-${problemTitle.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Download full session data as JSON for detailed analysis
  const downloadSessionJSON = () => {
    if (!teachingSession) return;

    const sessionData = {
      metadata: {
        problemTitle,
        exportedAt: new Date().toISOString(),
        totalTurns: teachingSession.turns.length,
      },
      conversation: teachingSession.turns.map((turn, idx) => ({
        turnNumber: idx + 1,
        speaker: turn.speaker,
        timestamp: new Date(turn.timestamp).toISOString(),
        refinedContent: turn.content,
        rawContent: turn.rawContent || null,
        refinementChanged: turn.rawContent ? turn.rawContent !== turn.content : null,
        // Character count comparison to detect if content was significantly shortened
        characterDiff: turn.rawContent ? {
          rawLength: turn.rawContent.length,
          refinedLength: turn.content.length,
          difference: turn.rawContent.length - turn.content.length,
          percentRemoved: turn.rawContent.length > 0 
            ? Math.round(((turn.rawContent.length - turn.content.length) / turn.rawContent.length) * 100)
            : 0
        } : null
      })),
      juniorState: teachingSession.juniorState,
      juniorSummary: juniorSummary || null,
      evaluation: {
        teachingScore: report.teachingScore,
        studentOutcome: report.studentOutcome,
        juniorSummaryCorrect: report.juniorSummaryCorrect,
        breakdown: report.breakdown,
        evidenceNotes: report.evidenceNotes,
        topGaps: report.topGaps,
        concreteImprovement: report.concreteImprovement
      }
    };

    const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `teaching-session-${problemTitle.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const getOutcomeConfig = (outcome: TeachingReport['studentOutcome']) => {
    switch (outcome) {
      case 'can_implement':
        return {
          icon: CheckCircle2,
          label: 'Student Can Implement',
          bgClass: 'bg-green-500/20 border-green-500/50 text-green-600',
          description: 'The junior understood well enough to code the solution'
        };
      case 'conceptual_only':
        return {
          icon: AlertCircle,
          label: 'Conceptual Understanding',
          bgClass: 'bg-yellow-500/20 border-yellow-500/50 text-yellow-600',
          description: 'The junior gets the idea but might struggle with implementation'
        };
      case 'still_confused':
        return {
          icon: XCircle,
          label: 'Still Confused',
          bgClass: 'bg-red-500/20 border-red-500/50 text-red-600',
          description: 'The junior needs more explanation to understand'
        };
      default:
        return {
          icon: AlertCircle,
          label: 'Unknown',
          bgClass: 'bg-gray-500/20 border-gray-500/50 text-gray-600',
          description: ''
        };
    }
  };

  const outcomeConfig = getOutcomeConfig(report.studentOutcome);
  const OutcomeIcon = outcomeConfig.icon;

  const getScoreColor = (score: number, max: number = 10) => {
    const percentage = (score / max) * 100;
    if (percentage >= 80) return 'text-green-600';
    if (percentage >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBarColor = (score: number, max: number = 10) => {
    const percentage = (score / max) * 100;
    if (percentage >= 80) return 'bg-green-500';
    if (percentage >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-6">
      {/* Export Buttons */}
      <div className="flex justify-end gap-2 flex-wrap">
        {teachingSession && (
          <>
            <button 
              onClick={downloadSessionJSON} 
              className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-full text-sm font-medium hover:bg-blue-100 text-blue-700 flex items-center gap-2 shadow-sm"
              title="Download full session data as JSON for analysis"
            >
              <FileText size={14} /> Export JSON
            </button>
            <button 
              onClick={downloadDebugTranscript} 
              className="px-4 py-2 bg-purple-50 border border-purple-200 rounded-full text-sm font-medium hover:bg-purple-100 text-purple-700 flex items-center gap-2 shadow-sm"
              title="Download raw & refined transcripts for debugging"
            >
              <FileText size={14} /> Debug TXT
            </button>
          </>
        )}
        <button 
          onClick={downloadReportAsImage} 
          className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-medium hover:bg-gray-50 text-charcoal flex items-center gap-2 shadow-sm"
        >
          <Download size={14} /> Export Image
        </button>
      </div>

      {/* Report Content - wrapped for export */}
      <div ref={reportRef} className="space-y-6 bg-cream p-4 rounded-2xl">
        {/* Header Score Card */}
        <div className="bg-charcoal text-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-xl border border-white/10">
        {/* Problem Title */}
        <div className="mb-6 pb-4 border-b border-white/10">
          <h2 className="text-xl sm:text-2xl font-serif font-bold text-center">
            {leetcodeNumber && (
              <span className="text-gold">#{leetcodeNumber}. </span>
            )}
            {problemTitle}
          </h2>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
              <Award className="w-5 h-5 text-gold" />
              <span className="text-[10px] font-bold text-gold uppercase tracking-widest">Dean's Verdict</span>
            </div>
            <h3 className="text-3xl sm:text-4xl font-serif font-bold">
              {report.teachingScore}<span className="text-lg text-gray-500">/100</span>
            </h3>
            <p className="text-gray-400 text-sm mt-1">Teaching Score</p>
          </div>

          <div className="flex flex-col items-center sm:items-end gap-3">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${outcomeConfig.bgClass}`}>
              <OutcomeIcon size={18} />
              <span className="font-bold text-sm">{outcomeConfig.label}</span>
            </div>
            <p className="text-xs text-gray-400 max-w-[200px] text-center sm:text-right">
              {outcomeConfig.description}
            </p>
          </div>
        </div>
      </div>

      {/* Breakdown Scores */}
      <div className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-lg border border-gray-100">
        <h4 className="text-sm font-bold text-charcoal uppercase tracking-widest mb-6 flex items-center gap-2">
          <Target size={16} className="text-purple-600" />
          Score Breakdown
        </h4>
        
        <div className="space-y-4">
          {[
            { label: 'Clarity', score: report.breakdown.clarity, desc: 'Core insight stated clearly (brief but precise)' },
            { label: 'Correctness', score: report.breakdown.correctness, desc: 'Taught algorithm is correct' },
            { label: 'Completeness', score: report.breakdown.completeness, desc: 'By end: intuition, steps, edge cases, complexity' },
            { label: 'Student Mastery', score: report.breakdown.studentMastery, desc: 'Junior can summarize and implement' },
            { label: 'Scaffolding', score: report.breakdown.scaffolding, desc: 'Guided discovery well through Q&A' }
          ].map((item, idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-charcoal">{item.label}</span>
                <span className={`font-bold ${getScoreColor(item.score)}`}>{item.score}/10</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full ${getScoreBarColor(item.score)} transition-all duration-500`}
                  style={{ width: `${(item.score / 10) * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-400">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Factual Errors - CRITICAL SECTION */}
      {report.factualErrors && report.factualErrors.length > 0 && (
        <div className="bg-red-100 rounded-2xl sm:rounded-3xl p-6 sm:p-8 border-2 border-red-400 shadow-lg">
          <h4 className="text-sm font-bold text-red-800 uppercase tracking-widest mb-4 flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-600" />
            ⚠️ Factual Errors Found — This Is Why The Student Was Confused
          </h4>
          <div className="space-y-4">
            {report.factualErrors.map((error, idx) => (
              <div key={idx} className="bg-white rounded-xl p-4 border border-red-200">
                <div className="mb-3">
                  <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider">What You Said (Incorrect):</span>
                  <p className="text-sm text-red-800 font-medium mt-1 italic">"{error.whatTeacherSaid}"</p>
                </div>
                <div className="mb-3">
                  <span className="text-[10px] font-bold text-green-700 uppercase tracking-wider">What's Actually Correct:</span>
                  <p className="text-sm text-green-800 mt-1">{error.whatIsCorrect}</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
                  <span className="text-[10px] font-bold text-yellow-700 uppercase tracking-wider">Why This Caused Confusion:</span>
                  <p className="text-sm text-yellow-800 mt-1">{error.whyItMatters}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Annotated Dialogue View */}
      {teachingSession && report.dialogueAnnotations && report.dialogueAnnotations.length > 0 && (
        <div className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-lg border border-gray-100">
          <h4 className="text-sm font-bold text-charcoal uppercase tracking-widest mb-6 flex items-center gap-2">
            <MessageSquare size={16} className="text-indigo-600" />
            Annotated Dialogue — See What Went Wrong
          </h4>
          
          <div className="space-y-4">
            {teachingSession.turns.map((turn, idx) => {
              const annotation = report.dialogueAnnotations.find(a => a.turnIndex === idx);
              const isTeacher = turn.speaker === 'teacher';
              const issueType = annotation?.issueType;
              
              // Determine border/background colors based on issue type
              const getBubbleStyle = () => {
                if (!isTeacher) return 'bg-purple-50 border-purple-200';
                switch (issueType) {
                  case 'factual_error': return 'bg-red-50 border-red-300';
                  case 'incomplete': return 'bg-yellow-50 border-yellow-300';
                  case 'unclear': return 'bg-orange-50 border-orange-300';
                  case 'hand_wavy': return 'bg-amber-50 border-amber-300';
                  case 'good': return 'bg-green-50 border-green-300';
                  default: return 'bg-gray-50 border-gray-200';
                }
              };
              
              const getAnnotationStyle = () => {
                if (!isTeacher) return 'bg-purple-100 border-purple-300 text-purple-800';
                switch (issueType) {
                  case 'factual_error': return 'bg-red-100 border-red-400 text-red-800';
                  case 'incomplete': return 'bg-yellow-100 border-yellow-400 text-yellow-800';
                  case 'unclear': return 'bg-orange-100 border-orange-400 text-orange-800';
                  case 'hand_wavy': return 'bg-amber-100 border-amber-400 text-amber-800';
                  case 'good': return 'bg-green-100 border-green-400 text-green-800';
                  default: return 'bg-gray-100 border-gray-300 text-gray-700';
                }
              };
              
              const getIssueLabel = () => {
                switch (issueType) {
                  case 'factual_error': return '❌ FACTUAL ERROR';
                  case 'incomplete': return '⚠️ INCOMPLETE';
                  case 'unclear': return '😕 UNCLEAR';
                  case 'hand_wavy': return '🤷 HAND-WAVY';
                  case 'good': return '✅ GOOD';
                  case 'question_reason': return '❓ WHY THEY ASKED';
                  default: return '';
                }
              };

              return (
                <div key={idx} className={`flex ${isTeacher ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] ${isTeacher ? 'items-end' : 'items-start'} flex flex-col`}>
                    {/* Speaker Label */}
                    <span className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${isTeacher ? 'text-right text-gray-500' : 'text-purple-600'}`}>
                      {isTeacher ? 'You (Teacher)' : 'Junior Engineer'}
                    </span>
                    
                    {/* Message Bubble */}
                    <div className={`rounded-2xl p-4 border ${getBubbleStyle()}`}>
                      <p className="text-sm text-gray-800 leading-relaxed">{turn.content}</p>
                    </div>
                    
                    {/* Annotation */}
                    {annotation && (
                      <div className={`mt-2 rounded-xl p-3 border-l-4 ${getAnnotationStyle()} max-w-full`}>
                        {issueType && (
                          <span className="text-[9px] font-bold uppercase tracking-wider block mb-1">
                            {getIssueLabel()}
                          </span>
                        )}
                        <p className="text-xs leading-relaxed">{annotation.annotation}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Junior's Summary */}
      {juniorSummary && (
        <div className="bg-purple-50 rounded-2xl sm:rounded-3xl p-6 sm:p-8 border border-purple-200">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-purple-200 flex items-center justify-center shrink-0">
              <GraduationCap size={16} className="text-purple-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-sm font-bold text-charcoal uppercase tracking-widest">Junior's Summary</h4>
                {report.juniorSummaryCorrect ? (
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[9px] font-bold rounded-full uppercase">Correct</span>
                ) : (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[9px] font-bold rounded-full uppercase">Has Errors</span>
                )}
              </div>
              <p className="text-sm text-gray-700 italic leading-relaxed">"{juniorSummary}"</p>
            </div>
          </div>
        </div>
      )}

      {/* Evidence Notes */}
      {report.evidenceNotes && report.evidenceNotes.length > 0 && (
        <div className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-lg border border-gray-100">
          <h4 className="text-sm font-bold text-charcoal uppercase tracking-widest mb-4 flex items-center gap-2">
            <MessageSquare size={16} className="text-blue-600" />
            Evidence Notes
          </h4>
          <ul className="space-y-3">
            {report.evidenceNotes.map((note, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-blue-500 mt-1">•</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Top Gaps */}
      {report.topGaps && report.topGaps.length > 0 && (
        <div className="bg-red-50 rounded-2xl sm:rounded-3xl p-6 sm:p-8 border border-red-200">
          <h4 className="text-sm font-bold text-red-800 uppercase tracking-widest mb-4 flex items-center gap-2">
            <AlertCircle size={16} />
            Top Gaps to Address
          </h4>
          <ul className="space-y-3">
            {report.topGaps.map((gap, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-red-700">
                <span className="font-bold">{idx + 1}.</span>
                <span>{gap}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Concrete Improvement */}
      {report.concreteImprovement && (
        <div className="bg-green-50 rounded-2xl sm:rounded-3xl p-6 sm:p-8 border border-green-200">
          <h4 className="text-sm font-bold text-green-800 uppercase tracking-widest mb-3 flex items-center gap-2">
            <TrendingUp size={16} />
            One Thing to Improve
          </h4>
          <div className="flex items-start gap-3">
            <Lightbulb size={20} className="text-green-600 shrink-0 mt-0.5" />
            <p className="text-sm text-green-700 leading-relaxed">{report.concreteImprovement}</p>
          </div>
        </div>
      )}

      {/* Model Answer Section (Dark Theme) */}
      {problem && (
        <div className="bg-[#1a1a1a] rounded-2xl sm:rounded-3xl border border-[#333] overflow-hidden">
          <div className="px-6 py-3 border-b border-[#333] bg-[#222]">
            <h4 className="text-sm font-bold text-gold uppercase tracking-widest flex items-center gap-2">
              <Lightbulb size={16} /> Model Answer
            </h4>
          </div>
          
          {/* Key Insight */}
          <div className="p-6 border-b border-[#333]">
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
          <div className="p-6 border-b border-[#333] bg-[#181818]">
            <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Complexity</h5>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#222] rounded-lg p-4 border border-[#333]">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Time</span>
                <p className="text-xl font-mono font-bold text-white">{problem.timeComplexity}</p>
              </div>
              <div className="bg-[#222] rounded-lg p-4 border border-[#333]">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Space</span>
                <p className="text-xl font-mono font-bold text-white">{problem.spaceComplexity}</p>
              </div>
            </div>
          </div>

          {/* Example Walkthrough */}
          {problem.example && (
            <div className="p-6 border-b border-[#333]">
              <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Route size={12} /> Example Walkthrough
              </h5>
              <div className="text-xs text-gray-300 leading-relaxed whitespace-pre-line">
                {formatText(problem.example)}
              </div>
            </div>
          )}

          {/* Python Solution */}
          {problem.skeleton && (
            <div>
              <div className="px-6 py-2 border-b border-[#333] flex items-center gap-2 bg-[#1a1a1a]">
                <Code2 size={14} className="text-gold" />
                <span className="text-xs font-bold text-gold uppercase tracking-wider">Python Solution</span>
              </div>
              <pre className="p-6 overflow-x-auto text-sm leading-relaxed bg-[#0d0d0d]">
                <code className="text-gray-300 font-mono whitespace-pre">
                  {formatText(problem.skeleton)}
                </code>
              </pre>
            </div>
          )}
        </div>
      )}
      </div>
      {/* End of exportable content */}

      {/* Action Buttons - outside export area */}
      <div className="flex gap-3 justify-center pt-4">
        {onTryAgain && (
          <button
            onClick={onTryAgain}
            className="px-6 py-3 rounded-xl border-2 border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-all font-bold text-xs uppercase tracking-widest flex items-center gap-2"
          >
            <RotateCcw size={16} />
            Teach Again
          </button>
        )}
        <button
          onClick={onContinue}
          className="px-8 py-3 rounded-xl bg-charcoal text-white hover:bg-black transition-all font-bold text-xs uppercase tracking-widest shadow-lg flex items-center gap-2"
        >
          {isLastProblem ? 'Complete Session' : 'Next Problem'}
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default TeachingReportComponent;
