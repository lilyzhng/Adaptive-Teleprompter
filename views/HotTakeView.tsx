
import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Home, ArrowLeft, Mic, StopCircle, Zap, Loader2, Trophy, Timer, MessageSquare, Star, ArrowUpRight, Plus, X, BookOpen, Settings, Building2, UserCircle2, Target, ThumbsUp, ThumbsDown, Save, SkipForward } from 'lucide-react';
import { HotTakeQuestion, PerformanceReport, SavedItem, HotTakeTurn, HotTakeGlobalContext, HotTakePreference } from '../types';
import { evaluateHotTakeInitial, finalizeHotTake, refineHotTakeTranscript, customizeHotTakeQuestions, regenerateHotTakeFollowUp } from '../services/analysisService';
import { formatTime } from '../utils';
import PerformanceReportComponent from '../components/PerformanceReport';

interface HotTakeViewProps {
  onHome: (force: boolean) => void;
  onSaveReport: (title: string, type: 'hot-take', report: PerformanceReport) => void;
  isSaved: (title: string, content: string) => boolean;
  onToggleSave: (item: Omit<SavedItem, 'id' | 'date'>) => void;
}

const BASE_QUESTIONS: HotTakeQuestion[] = [
  { 
    id: 'ht1', 
    title: 'Introduce Yourself / Why Me?', 
    context: 'The walkthrough of your background. Why are you the best fit for this specific position right now?', 
    probingPrompt: 'Probe for narrative gaps or missing impact in the career transitions.' 
  },
  { 
    id: 'ht2', 
    title: 'Why Our Company?', 
    context: 'What specifically brings you to us? Show that you know our mission, challenges, and market position.', 
    probingPrompt: 'Act as a skeptical hiring manager looking for generic answers vs deep research.' 
  },
  { 
    id: 'ht3', 
    title: 'The Table Flip (Your Questions)', 
    context: 'The moment you ask questions. Rehearse your surgical, high-level inquiries that prove your seniority.', 
    probingPrompt: 'Evaluate if the questions are too basic or if they show strategic thinking and leadership.' 
  },
  {
    id: 'ht4',
    title: 'Tell Me About a Challenge',
    context: 'Describe a significant technical or leadership challenge you faced and how you overcame it.',
    probingPrompt: 'Evaluate the depth of problem-solving and the clarity of the STAR framework.'
  },
  {
    id: 'ht5',
    title: 'Leadership & Influence',
    context: 'How do you lead without authority? Give an example of influencing cross-functional teams.',
    probingPrompt: 'Probe for concrete examples of stakeholder management and conflict resolution.'
  },
  {
    id: 'ht6',
    title: 'Career Path (IC vs Management)',
    context: 'Looking ahead, what split do you want (management vs IC)?',
    probingPrompt: 'Evaluate the clarity of career goals and how they align with leadership expectations.'
  }
];

const HotTakeView: React.FC<HotTakeViewProps> = ({ onHome, onSaveReport, isSaved, onToggleSave }) => {
  const location = useLocation();
  const [step, setStep] = useState<'selection' | 'add_custom' | 'session' | 'analyzing' | 'reveal' | 'context_config'>('selection');
  const [sessionMode, setSessionMode] = useState<'initial' | 'probing'>('initial');
  const [isCustomizingQuestions, setIsCustomizingQuestions] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  
  const [globalContext, setGlobalContext] = useState<HotTakeGlobalContext>(() => {
    try {
      const stored = localStorage.getItem('micdrop_hot_take_context');
      return stored ? JSON.parse(stored) : { company: '', interviewer: '', roundFocus: '' };
    } catch { return { company: '', interviewer: '', roundFocus: '' }; }
  });

  const [preferences, setPreferences] = useState<HotTakePreference[]>(() => {
    try {
      const stored = localStorage.getItem('micdrop_hot_take_preferences');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const [activeQuestions, setActiveQuestions] = useState<HotTakeQuestion[]>(BASE_QUESTIONS);

  const [customQuestions, setCustomQuestions] = useState<HotTakeQuestion[]>(() => {
    try {
      const stored = localStorage.getItem('micdrop_custom_hot_takes');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const [newQuestion, setNewQuestion] = useState({ title: '', context: '' });
  const [selectedQuestion, setSelectedQuestion] = useState<HotTakeQuestion | null>(null);
  const processedPracticeRef = useRef<string | null>(null);

  // Check for incoming practice request
  useEffect(() => {
    if (location.state && (location.state as any).practiceQuestion) {
      const { title, context, source } = (location.state as any).practiceQuestion;
      
      // Prevent processing the same question twice (React StrictMode, re-renders, etc.)
      const questionKey = `${title}::${context}`;
      if (processedPracticeRef.current === questionKey) {
        return;
      }
      processedPracticeRef.current = questionKey;
      
      // Create a question object with source
      const practiceQ: HotTakeQuestion = {
        id: 'practice_' + Date.now(),
        title: title,
        context: context,
        probingPrompt: 'Probe the core logic, values, and outcomes of this story. Focus on impact and specifics.',
        source: source || undefined
      };
      
      // Check if this question already exists (by title) to avoid duplicates
      setCustomQuestions(prev => {
        const exists = prev.some(q => q.title === title);
        if (exists) {
          return prev;
        }
        return [practiceQ, ...prev];
      });
      
      setSelectedQuestion(practiceQ);
      setSessionMode('initial');
      setSessionHistory([]);
      setStep('session');
      
      // Clear state so it doesn't persist on reload/nav
      window.history.replaceState({}, document.title);
    }
  }, [location]);
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(90); 
  const [rawTranscript, setRawTranscript] = useState("");
  
  // Track history for reveal
  const [sessionHistory, setSessionHistory] = useState<HotTakeTurn[]>([]);

  const [initialReport, setInitialReport] = useState<PerformanceReport | null>(null);
  const [finalReport, setFinalReport] = useState<PerformanceReport | null>(null);

  // Feedback State
  const [ratingState, setRatingState] = useState<'idle' | 'negative_input' | 'rated'>('idle');
  const [feedbackText, setFeedbackText] = useState("");

  const timerRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    localStorage.setItem('micdrop_custom_hot_takes', JSON.stringify(customQuestions));
  }, [customQuestions]);

  useEffect(() => {
    localStorage.setItem('micdrop_hot_take_context', JSON.stringify(globalContext));
  }, [globalContext]);

  useEffect(() => {
    localStorage.setItem('micdrop_hot_take_preferences', JSON.stringify(preferences));
  }, [preferences]);

  const refreshCustomizedQuestions = async () => {
    setIsCustomizingQuestions(true);
    try {
      const tailored = await customizeHotTakeQuestions(BASE_QUESTIONS, globalContext);
      setActiveQuestions(tailored);
    } catch (e) {
      setActiveQuestions(BASE_QUESTIONS);
    } finally {
      setIsCustomizingQuestions(false);
    }
  };

  useEffect(() => {
    refreshCustomizedQuestions();
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  const handleStartRecording = () => {
    setRawTranscript("");
    setIsRecording(true);
    // Target duration is 90 seconds for all turns.
    setDuration(90); 
    
    timerRef.current = window.setInterval(() => {
      // Allow duration to go negative to track overtime
      setDuration(d => d - 1);
    }, 1000);

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

  const handleStopRecording = async () => {
    if (!isRecording) return;
    setIsRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (recognitionRef.current) recognitionRef.current.stop();

    const rawT = rawTranscript.trim();
    setStep('analyzing');
    setRatingState('idle'); // Reset rating state for next step

    try {
      const currentT = await refineHotTakeTranscript(rawT, selectedQuestion?.context || "");

      if (sessionMode === 'initial') {
        // Pass preferences here to condition the follow-up generation
        const report = await evaluateHotTakeInitial(currentT, selectedQuestion!.title, selectedQuestion!.context, globalContext, preferences);
        setInitialReport(report);
        setSessionHistory([{ stage: 'Initial Context', query: selectedQuestion!.title, response: currentT }]);
        setSessionMode('probing');
        setStep('session');
      } else if (sessionMode === 'probing') {
        // Strict 1 follow-up policy: Go straight to finalization
        const updatedHistory = [...sessionHistory, { stage: 'Probe', query: initialReport!.followUpQuestion!, response: currentT }];
        setSessionHistory(updatedHistory);
        
        // Finalize Evaluation (Round 2)
        const final = await finalizeHotTake(JSON.stringify(updatedHistory), globalContext);
        
        // CONSTRUCT COMPOSITE REPORT (Round 1 + Round 2)
        if (initialReport) {
            const compositeReport: PerformanceReport = {
                ...final,
                hotTakeHistory: updatedHistory,
                // Rating is the average of both rounds
                rating: Math.round(((initialReport.rating || 70) + final.rating) / 2),
                hotTakeRounds: {
                    round1: {
                        question: selectedQuestion!.title,
                        transcript: sessionHistory[0].response,
                        score: initialReport.rating,
                        rubric: initialReport.hotTakeRubric || {},
                        critique: initialReport.summary,
                        rewrite: initialReport.hotTakeMasterRewrite || "No rewrite available for introduction."
                    },
                    round2: {
                        question: initialReport.followUpQuestion || "Follow-up",
                        transcript: currentT,
                        score: final.rating,
                        rubric: final.hotTakeRubric || {},
                        critique: final.summary,
                        rewrite: final.hotTakeMasterRewrite || "No rewrite available for follow-up."
                    }
                }
            };
            setFinalReport(compositeReport);
            onSaveReport(selectedQuestion!.title, 'hot-take', compositeReport);
        } else {
             // Fallback if initialReport is missing (should not happen in normal flow)
             setFinalReport(final);
        }
        setStep('reveal');
      }
    } catch (e) {
      console.error(e);
      setStep('selection');
    }
  };

  const handleSkipQuestion = () => {
    if (!initialReport || !selectedQuestion) return;

    // 1. Mark history
    const updatedHistory = [...sessionHistory, {
        stage: 'Probe',
        query: initialReport.followUpQuestion || "Follow-up",
        response: "Skipped"
    }];
    setSessionHistory(updatedHistory);

    // 2. Construct Composite Report with skipped Round 2
    const compositeReport: PerformanceReport = {
        ...initialReport, // Use initial report as base
        hotTakeHistory: updatedHistory,
        rating: initialReport.rating, // Use only round 1 rating
        hotTakeRounds: {
            round1: {
                question: selectedQuestion.title,
                transcript: sessionHistory[0].response,
                score: initialReport.rating,
                rubric: initialReport.hotTakeRubric || {},
                critique: initialReport.summary,
                rewrite: initialReport.hotTakeMasterRewrite || "No rewrite available."
            },
            round2: {
                question: initialReport.followUpQuestion || "Follow-up",
                transcript: "Question Skipped",
                score: 0,
                rubric: {}, // Empty rubric will render as 0
                critique: "The user opted to skip the follow-up probing question.",
                rewrite: "N/A"
            }
        }
    };

    setFinalReport(compositeReport);
    onSaveReport(selectedQuestion.title, 'hot-take', compositeReport);
    setStep('reveal');
  };

  const handlePreference = async (type: 'positive' | 'negative', feedback?: string) => {
    if (!initialReport?.followUpQuestion) return;

    // 1. Save Preference locally
    const newPref: HotTakePreference = {
        questionText: initialReport.followUpQuestion,
        type,
        feedback: feedback || (type === 'positive' ? 'User liked this style.' : ''),
        timestamp: new Date().toISOString()
    };
    setPreferences(prev => [...prev, newPref]);

    // 2. If negative, immediately regenerate the question
    if (type === 'negative') {
        setIsRegenerating(true);
        try {
            // Use the last transcript from Round 1 history
            const userTranscript = sessionHistory.length > 0 ? sessionHistory[0].response : "";
            
            const newQuestion = await regenerateHotTakeFollowUp(
                userTranscript,
                initialReport.followUpQuestion,
                feedback || "Question was not relevant.",
                globalContext
            );

            // Update state with new question
            setInitialReport(prev => prev ? { ...prev, followUpQuestion: newQuestion } : null);
            setRatingState('idle'); // Reset UI so they can rate the new one if they want
            setFeedbackText(""); // Clear feedback
        } catch (e) {
            console.error("Failed to regenerate question", e);
        } finally {
            setIsRegenerating(false);
        }
    } else {
        setRatingState('rated');
        setFeedbackText("");
    }
  };

  const addCustomQuestion = () => {
    if (!newQuestion.title || !newQuestion.context) return;
    const q: HotTakeQuestion = {
      id: 'custom_' + Date.now(),
      title: newQuestion.title,
      context: newQuestion.context,
      probingPrompt: 'Probe the core logic, values, and outcomes of this story.'
    };
    setCustomQuestions([q, ...customQuestions]);
    setNewQuestion({ title: '', context: '' });
    setStep('selection');
  };

  const deleteCustomQuestion = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    setCustomQuestions(prev => prev.filter(q => q.id !== id));
  };

  const handleSaveProtocolIntelligence = () => {
    setStep('selection');
    refreshCustomizedQuestions();
  };

  if (step === 'reveal') {
    // Rely on the composite report structure which is now standardized in PerformanceReportComponent
    const report = finalReport || initialReport;
    if (!report) return null;

    return (
      <div className="h-full bg-cream text-charcoal flex flex-col font-sans overflow-hidden">
        <div className="p-8 pr-24 border-b border-[#E6E6E6] bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-6">
            <div className="w-12 h-12 rounded-2xl bg-gold text-white flex items-center justify-center"><Trophy size={24} /></div>
            <div>
              <h2 className="text-xl font-serif font-bold">Interview Verdict</h2>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Protocol Complete</p>
            </div>
          </div>
          <button onClick={() => onHome(true)} className="px-6 py-2 bg-charcoal text-white rounded-full text-xs font-bold uppercase tracking-widest hover:bg-black">Finish Review</button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-12 bg-[#FAF9F6]">
          <div className="max-w-7xl mx-auto pb-32">
<PerformanceReportComponent
                report={report}
                reportType="hot-take"
                isSaved={isSaved}
                onToggleSave={onToggleSave}
                onDone={() => onHome(true)}
             />
          </div>
        </div>
      </div>
    );
  }

  if (step === 'selection') {
    return (
      <div className="h-full bg-cream text-charcoal flex flex-col font-sans overflow-hidden">
        <div className="p-8 pr-24 border-b border-[#E6E6E6] bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-6">
            {/* FORCE HOME: Override confirmation since no active session exists */}
            <button onClick={() => onHome(true)} className="w-10 h-10 flex items-center justify-center bg-gray-50 border border-gray-200 rounded-full hover:bg-gray-100 transition-colors">
                <Home size={18} className="text-gray-500" />
            </button>
            <div>
              <div className="text-[10px] font-bold text-gold uppercase tracking-[0.2em] mb-1">Module 03</div>
              <h2 className="text-xl font-serif font-bold tracking-tight">Hot Take: Tough Sparring</h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <button 
                onClick={() => setStep('context_config')}
                className="px-4 py-2 bg-white border border-gray-200 rounded-full text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-gold hover:border-gold transition-all flex items-center gap-2"
              >
                <Settings size={14} /> Configure Context
              </button>
              <button 
                onClick={() => setStep('add_custom')}
                className="px-6 py-2 bg-charcoal text-white rounded-full text-xs font-bold uppercase tracking-widest hover:bg-black flex items-center gap-2 transition-all shadow-md"
              >
                <Plus size={14} /> Add Story
              </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-12 bg-[#FAF9F6]">
          <div className="max-w-4xl mx-auto">
            <div className="mb-12 text-center">
              <h1 className="text-4xl font-serif font-bold mb-4">The Performance Lab</h1>
              <p className="text-gray-500 italic mb-8">Enter the arena. Gemini will probe your logic once. Be concise, technical, and quantify your impact.</p>
              
              {globalContext.company && (
                <div className="flex items-center justify-center gap-2 py-2 px-6 bg-gold/5 border border-gold/20 rounded-full inline-flex mx-auto text-[9px] font-bold text-gold uppercase tracking-[0.4em] animate-in fade-in slide-in-from-top-2 duration-500 shadow-sm">
                  <Zap size={10} className="text-gold fill-gold/20" />
                  {globalContext.company} Protocol Engaged
                </div>
              )}
            </div>
            
            {isCustomizingQuestions ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-4">
                <Loader2 size={40} className="animate-spin text-gold" />
                <p className="text-xs font-bold uppercase tracking-[0.2em]">Tailoring Questions to your Protocol...</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-6 pb-20">
                {activeQuestions.map((q) => (
                  <button 
                    key={q.id}
                    onClick={() => { setSelectedQuestion(q); setSessionMode('initial'); setSessionHistory([]); setStep('session'); }}
                    className="bg-white border border-[#EBE8E0] p-8 rounded-3xl text-left hover:border-gold hover:shadow-xl transition-all group relative overflow-hidden animate-in fade-in slide-in-from-bottom-4"
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><Zap size={60} /></div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Sparring Protocol</div>
                    <h3 className="text-xl font-serif font-bold mb-3 pr-8">{q.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed mb-6 italic line-clamp-2">"{q.context}"</p>
                    <div className="flex items-center gap-2 text-gold font-bold text-[10px] uppercase tracking-widest">
                      Enter Sparring <ArrowUpRight size={14} />
                    </div>
                  </button>
                ))}

                {customQuestions.map((q) => (
                  <div 
                    key={q.id}
                    onClick={() => { setSelectedQuestion(q); setSessionMode('initial'); setSessionHistory([]); setStep('session'); }}
                    className="bg-white border border-gold/20 p-8 rounded-3xl text-left hover:border-gold hover:shadow-xl transition-all group relative overflow-hidden ring-1 ring-gold/5 animate-in fade-in slide-in-from-bottom-4 cursor-pointer"
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none"><Star size={60} /></div>
                    <div className="flex items-center gap-2 mb-2">
                      {q.source && (
                        <span className="text-[9px] font-bold text-white bg-charcoal px-2 py-0.5 rounded-full uppercase tracking-widest flex items-center gap-1">
                          <Building2 size={10} /> {q.source}
                        </span>
                      )}
                      {!q.source && (
                        <span className="text-[10px] font-bold text-gold uppercase tracking-widest">Custom Story</span>
                      )}
                    </div>
                    <h3 className="text-xl font-serif font-bold mb-3 pr-8">{q.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed mb-6 italic line-clamp-2">"{q.context}"</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-gold font-bold text-[10px] uppercase tracking-widest">
                        Enter Sparring <ArrowUpRight size={14} />
                      </div>
                      <button 
                        onClick={(e) => deleteCustomQuestion(e, q.id)} 
                        className="text-gray-300 hover:text-red-400 p-2 rounded-full hover:bg-red-50 transition-all z-10"
                        title="Delete question"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}

                <button 
                  onClick={() => setStep('add_custom')}
                  className="bg-dashed border-2 border-dashed border-gray-200 p-8 rounded-3xl text-center hover:border-gold/50 hover:bg-gold/5 transition-all flex flex-col items-center justify-center gap-4 text-gray-400 hover:text-gold group"
                >
                  <div className="w-12 h-12 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center group-hover:bg-gold/10 group-hover:border-gold/20 transition-colors">
                    <Plus size={24} />
                  </div>
                  <div className="font-bold text-xs uppercase tracking-[0.2em]">Add Custom Narrative</div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (step === 'context_config') {
    return (
      <div className="h-full bg-cream text-charcoal flex flex-col font-sans overflow-hidden">
        <div className="p-8 pr-24 border-b border-[#E6E6E6] bg-white flex items-center gap-6 shrink-0">
          <button onClick={() => setStep('selection')} className="w-10 h-10 flex items-center justify-center bg-gray-50 border border-gray-200 rounded-full hover:bg-gray-100 transition-colors"><ArrowLeft size={18} /></button>
          <h2 className="text-xl font-serif font-bold tracking-tight">Interview Intelligence Context</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-12 flex items-center justify-center bg-[#FAF9F6]">
          <div className="max-w-xl w-full bg-white p-10 rounded-[2.5rem] shadow-xl border border-[#EBE8E0]">
            <div className="mb-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gold/10 border border-gold/20 text-gold flex items-center justify-center mx-auto mb-6">
                <Settings size={32} />
              </div>
              <h2 className="text-3xl font-serif font-bold mb-2">Target Environment</h2>
              <p className="text-gray-500 text-sm">Tell Gemini about the specific interview stage and company to get tailored follow-up questions.</p>
            </div>
            
            <div className="space-y-8">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Company Name</label>
                <div className="relative">
                  <Building2 size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300" />
                  <input 
                    type="text"
                    placeholder="e.g., Google, Meta, Stripe"
                    className="w-full pl-14 pr-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:border-gold outline-none transition-all font-serif text-lg"
                    value={globalContext.company}
                    onChange={(e) => setGlobalContext({...globalContext, company: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Who are you talking with?</label>
                <div className="relative">
                  <UserCircle2 size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300" />
                  <input 
                    type="text"
                    placeholder="e.g., Senior ML Engineer / Hiring Manager"
                    className="w-full pl-14 pr-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:border-gold outline-none transition-all font-serif text-lg"
                    value={globalContext.interviewer}
                    onChange={(e) => setGlobalContext({...globalContext, interviewer: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Round Focus</label>
                <div className="relative">
                  <Target size={18} className="absolute left-6 top-6 text-gray-300" />
                  <textarea 
                    placeholder="e.g., Behavioral round focusing on leadership, system design discussion, culture fit..."
                    className="w-full pl-14 pr-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:border-gold outline-none transition-all font-serif text-lg h-32 resize-none overflow-y-auto"
                    value={globalContext.roundFocus}
                    onChange={(e) => setGlobalContext({...globalContext, roundFocus: e.target.value})}
                  />
                </div>
              </div>
              <button 
                onClick={handleSaveProtocolIntelligence}
                className="w-full py-5 bg-charcoal text-white rounded-full font-bold uppercase text-xs tracking-[0.3em] hover:bg-black transition-all shadow-lg"
              >
                Save Protocol Intelligence
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'add_custom') {
    return (
      <div className="h-full bg-cream text-charcoal flex flex-col font-sans overflow-hidden">
        <div className="p-8 pr-24 border-b border-[#E6E6E6] bg-white flex items-center gap-6 shrink-0">
          <button onClick={() => setStep('selection')} className="w-10 h-10 flex items-center justify-center bg-gray-50 border border-gray-200 rounded-full hover:bg-gray-100 transition-colors"><ArrowLeft size={18} /></button>
          <h2 className="text-xl font-serif font-bold tracking-tight">Draft New Protocol</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-12 flex items-center justify-center bg-[#FAF9F6]">
          <div className="max-w-xl w-full bg-white p-10 rounded-[2.5rem] shadow-xl border border-[#EBE8E0]">
            <div className="mb-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gold/10 border border-gold/20 text-gold flex items-center justify-center mx-auto mb-6">
                <BookOpen size={32} />
              </div>
              <h2 className="text-3xl font-serif font-bold mb-2">Define Your Case</h2>
              <p className="text-gray-500 text-sm">Prepare a narrative where Gemini will test your problem definition and impact.</p>
            </div>
            
            <div className="space-y-8">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Narrative Title</label>
                <input 
                  type="text"
                  placeholder="e.g., The Service Mesh Migration"
                  className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:border-gold outline-none transition-all font-serif text-lg"
                  value={newQuestion.title}
                  onChange={(e) => setNewQuestion({...newQuestion, title: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Brief Context</label>
                <textarea 
                  placeholder="State the problem and the high-level solution..."
                  className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:border-gold outline-none transition-all font-serif text-lg h-32 resize-none"
                  value={newQuestion.context}
                  onChange={(e) => setNewQuestion({...newQuestion, context: e.target.value})}
                />
              </div>
              <button 
                onClick={addCustomQuestion}
                disabled={!newQuestion.title || !newQuestion.context}
                className="w-full py-5 bg-charcoal text-white rounded-full font-bold uppercase text-xs tracking-[0.3em] hover:bg-black transition-all disabled:opacity-30 shadow-lg"
              >
                Seal Case
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'session') {
    const isProbing = sessionMode === 'probing';
    
    const currentQuestionTitle = isProbing 
        ? 'The Follow-Up' 
        : selectedQuestion?.title;
    const currentQuestionContext = isProbing 
        ? initialReport?.followUpQuestion 
        : selectedQuestion?.context;

    // Calculate display time. If duration < 0, we are in overtime.
    const isOvertime = duration < 0;
    const absDuration = Math.abs(duration);

    return (
      <div className="h-full bg-charcoal text-white flex flex-col font-sans overflow-hidden">
        <div className="p-8 pr-24 flex justify-between items-center bg-black/40 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-6">
            <button onClick={() => onHome(false)} className="w-10 h-10 flex items-center justify-center bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-colors">
                <Home size={18} />
            </button>
            <div className="hidden md:block">
              <h2 className="text-xl font-serif font-bold tracking-tight line-clamp-1">{currentQuestionTitle}</h2>
              <div className="text-[10px] font-bold text-gold uppercase tracking-[0.2em]">
                {isRecording ? 'Interrogating' : 'Prepare Response'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
             {isRecording && (
               <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border font-mono text-sm transition-colors ${isOvertime ? 'bg-red-500/20 border-red-500 text-red-500 animate-pulse' : 'bg-gold/10 border-gold/30 text-gold'}`}>
                 <Timer size={16} />
                 <span>{isOvertime ? '-' : ''}{formatTime(absDuration)}</span>
               </div>
             )}
             <div className="px-4 py-1.5 rounded-full border border-white/20 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Round {sessionMode === 'initial' ? '1' : '2'} / 2
             </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center relative overflow-y-auto">
            <div className="max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-10 shadow-2xl ${isProbing ? 'bg-gold text-charcoal' : 'bg-white/10 text-gold border border-white/10'}`}>
                   {isProbing ? <Zap size={40} /> : <MessageSquare size={40} />}
                </div>
                <h2 className="text-[10px] font-bold text-gold uppercase tracking-[0.4em] mb-4">The Active Prompt</h2>
                
                {isRegenerating ? (
                    <div className="flex flex-col items-center justify-center py-10">
                        <Loader2 className="animate-spin text-gold mb-4" size={40} />
                        <h3 className="text-xl font-serif font-bold animate-pulse">Pivoting Approach...</h3>
                    </div>
                ) : (
                    <>
                        <h3 className="text-2xl md:text-3xl font-serif font-bold mb-10 leading-snug">
                        {isProbing ? `"${currentQuestionContext}"` : currentQuestionTitle}
                        </h3>
                        {!isProbing && <p className="text-gray-400 font-light italic text-xl mb-12">"{currentQuestionContext}"</p>}
                    </>
                )}
                
                {/* Feedback UI for Follow-Up Question */}
                {isProbing && !isRegenerating && ratingState === 'idle' && (
                    <div className="flex items-center justify-center gap-4 mb-10 animate-in fade-in slide-in-from-bottom-2">
                        <button 
                            onClick={() => handlePreference('positive')}
                            className="flex items-center gap-2 px-4 py-2 rounded-full border border-gold/30 text-gold hover:bg-gold/10 transition-colors text-xs font-bold uppercase tracking-widest"
                        >
                            <ThumbsUp size={14} /> Good Question
                        </button>
                        <button 
                            onClick={() => setRatingState('negative_input')}
                            className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-colors text-xs font-bold uppercase tracking-widest"
                        >
                            <ThumbsDown size={14} /> Bad Question
                        </button>
                    </div>
                )}

                {isProbing && ratingState === 'negative_input' && (
                     <div className="flex items-center justify-center gap-2 mb-10 max-w-md mx-auto animate-in fade-in slide-in-from-bottom-2">
                        <input 
                            type="text" 
                            placeholder="Why was this bad? (e.g., too vague, irrelevant)"
                            className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-gold"
                            value={feedbackText}
                            onChange={(e) => setFeedbackText(e.target.value)}
                            autoFocus
                        />
                        <button 
                            onClick={() => handlePreference('negative', feedbackText)}
                            className="p-2 bg-gold text-charcoal rounded-lg hover:bg-white transition-colors"
                        >
                            <Save size={16} />
                        </button>
                         <button 
                            onClick={() => setRatingState('idle')}
                            className="p-2 text-gray-400 hover:text-white transition-colors"
                        >
                            <X size={16} />
                        </button>
                     </div>
                )}
                
                {isProbing && ratingState === 'rated' && (
                    <div className="mb-10 text-xs font-bold text-gold uppercase tracking-widest opacity-60">
                        Feedback Saved
                    </div>
                )}
                
                {isRecording && (
                   <div className="mt-12 bg-white/5 backdrop-blur-2xl rounded-3xl p-8 border border-white/10 text-xl font-serif italic text-gray-300 leading-relaxed shadow-2xl animate-in zoom-in duration-300">
                       {rawTranscript || "The floor is yours. Start speaking..."}
                   </div>
                )}
            </div>
        </div>

        <div className="p-12 bg-black/40 border-t border-white/5 relative flex justify-center items-center shrink-0">
           <div className="flex flex-col items-center">
               <button 
                 onClick={isRecording ? handleStopRecording : handleStartRecording}
                 disabled={isRegenerating}
                 className={`w-24 h-24 rounded-full flex items-center justify-center text-white shadow-2xl transition-all hover:scale-105 active:scale-95 group relative disabled:opacity-50 disabled:cursor-not-allowed ${isRecording ? 'bg-red-600 hover:bg-red-700' : 'bg-gold hover:bg-white hover:text-charcoal'}`}
               >
                 {isRecording ? <StopCircle size={40} /> : <Mic size={40} />}
                 {!isRecording && <div className="absolute inset-0 rounded-full border-2 border-gold animate-ping pointer-events-none opacity-50"></div>}
               </button>
               <span className="mt-8 text-[10px] font-bold text-gray-500 uppercase tracking-[0.4em] group-hover:text-white transition-colors">
                 {isRecording ? 'Finish Answer' : 'Engage Sparring'}
               </span>
           </div>

           {/* SKIP BUTTON */}
           {sessionMode === 'probing' && !isRecording && (
                <button 
                    onClick={handleSkipQuestion} 
                    className="absolute right-10 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 text-gray-500 hover:text-white transition-colors group"
                >
                     <div className="w-12 h-12 rounded-full border border-white/10 bg-white/5 flex items-center justify-center group-hover:bg-white/10 group-hover:border-white/20 transition-all">
                        <SkipForward size={20} />
                     </div>
                     <span className="text-[10px] font-bold uppercase tracking-widest">Skip</span>
                </button>
           )}
        </div>
      </div>
    );
  }

  if (step === 'analyzing') {
    return (
      <div className="h-full bg-charcoal text-white flex flex-col items-center justify-center p-12 text-center">
        <Loader2 className="animate-spin text-gold mb-10" size={60} />
        <h2 className="text-4xl font-serif font-bold mb-4">Adaptive Evaluation</h2>
        <p className="text-gray-400 font-light italic text-xl max-w-sm">Gemini is checking your claims and deciding if we need to probe deeper...</p>
      </div>
    );
  }

  return null;
};

export default HotTakeView;
