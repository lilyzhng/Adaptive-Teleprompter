
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Home, ArrowLeft, Mic, StopCircle, ChevronRight, CheckCircle2, Award, Sparkles, Code2, Loader2, BrainCircuit, X, ShieldAlert, BookOpen, Coffee, Trees, Train, Trophy, Star, AlertCircle, Flame, Target, Repeat } from 'lucide-react';
import { BlindProblem, PerformanceReport, SavedItem } from '../types';
import { analyzeWalkieSession, refineTranscript } from '../services/analysisService';
import { fetchBlindProblemsByTopics } from '../services/databaseService';
import PerformanceReportComponent from '../components/PerformanceReport';

interface WalkieTalkieViewProps {
  onHome: (force: boolean) => void;
  onSaveReport: (title: string, type: 'walkie', report: PerformanceReport) => void;
  masteredIds: string[];
  onMastered: (id: string) => void;
  isSaved: (title: string, content: string) => boolean;
  onToggleSave: (item: Omit<SavedItem, 'id' | 'date'>) => void;
}

// 3 REAL WORLD LOCATIONS MAPPED TO BLIND 75 TOPICS
const POWER_SPOTS = [
  { 
    id: 'spot1', 
    name: 'The Coffee Sanctuary', 
    ritual: 'Deep Focus Batch', 
    batchSize: 5, 
    icon: 'coffee', 
    description: 'Best for complex DP and Graph logic over a warm brew.',
    topics: ['Dynamic Programming', 'Graph', 'Matrix', 'Binary Search Tree']
  },
  { 
    id: 'spot2', 
    name: 'The Logic Trail', 
    ritual: 'Movement Batch', 
    batchSize: 5, 
    icon: 'park', 
    description: 'Walk and talk through Arrays, Strings, and Two-Pointer patterns.',
    topics: ['Array', 'String', 'Two Pointers', 'Sliding Window', 'Stack']
  },
  { 
    id: 'spot3', 
    name: 'The Daily Commute', 
    ritual: 'Transit Batch', 
    batchSize: 5, 
    icon: 'train', 
    description: 'Quick-fire Tree and Heap traversals while on the move.',
    topics: ['Binary Tree', 'Heap', 'Intervals', 'Linked List']
  }
];

const WalkieTalkieView: React.FC<WalkieTalkieViewProps> = ({ onHome, onSaveReport, masteredIds, onMastered, isSaved, onToggleSave }) => {
  const [step, setStep] = useState<'locations' | 'curating' | 'problem' | 'recording' | 'analyzing' | 'reveal'>('locations');
  const [analysisPhase, setAnalysisPhase] = useState<'refining' | 'evaluating'>('refining');
  const [selectedSpot, setSelectedSpot] = useState<typeof POWER_SPOTS[0] | null>(null);
  const [showStats, setShowStats] = useState(false);
  
  // Session State
  const [problemQueue, setProblemQueue] = useState<BlindProblem[]>([]);
  const [currentQueueIdx, setCurrentQueueIdx] = useState(0);
  const [sessionScore, setSessionScore] = useState(0); // How many cleared in THIS visit

  // Daily & Lifetime Stats (Simulated persistence)
  const [dailyCleared, setDailyCleared] = useState(0);
  const [totalConquered, setTotalConquered] = useState(() => {
    return Number(localStorage.getItem('micdrop_total_conquered') || 0);
  });

  // Analysis State
  const [transcript, setTranscript] = useState("");
  const [rawTranscript, setRawTranscript] = useState("");
  const [aiReport, setAiReport] = useState<PerformanceReport | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [revealHintIdx, setRevealHintIdx] = useState(0);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

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
        setStep('analyzing');
        setAnalysisPhase('refining');
        
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mp3' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          try {
            if (currentProblem) {
              const polishedText = await refineTranscript(rawTranscript, currentProblem);
              setTranscript(polishedText);
              setAnalysisPhase('evaluating');
              const report = await analyzeWalkieSession(base64Audio, polishedText, currentProblem);
              
              // Determine mastery based on rating (source of truth)
              // The AI's detectedAutoScore can be inconsistent, so we use rating thresholds
              const score: 'good' | 'partial' | 'missed' = 
                report.rating >= 75 ? 'good' : 
                report.rating >= 50 ? 'partial' : 
                'missed';
              report.detectedAutoScore = score;
              
              setAiReport(report);

              // Auto-Save and Auto-Update Stats
              onSaveReport(currentProblem.title, 'walkie', report);
              
              if (score === 'good') {
                  onMastered(currentProblem.title);
                  setSessionScore(prev => prev + 1);
                  setDailyCleared(prev => prev + 1);
                  setTotalConquered(prev => {
                      const newVal = prev + 1;
                      localStorage.setItem('micdrop_total_conquered', String(newVal));
                      return newVal;
                  });
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
      setTranscript("");
      setRawTranscript("");
    } else {
      setStep('locations');
    }
  };

  const startSpotSession = async (spot: typeof POWER_SPOTS[0]) => {
    setSelectedSpot(spot);
    setStep('curating');
    
    try {
        // Fetch pre-generated problems from Supabase instead of generating on the fly
        const problems = await fetchBlindProblemsByTopics(spot.topics, spot.batchSize, masteredIds);
        
        if (problems.length === 0) {
            console.warn("No problems found for topics:", spot.topics);
            // Fallback: try fetching without excluding mastered IDs
            const fallbackProblems = await fetchBlindProblemsByTopics(spot.topics, spot.batchSize, []);
            if (fallbackProblems.length === 0) {
                console.error("No problems available in database for these topics");
                setStep('locations');
                return;
            }
            setProblemQueue(fallbackProblems);
        } else {
            setProblemQueue(problems);
        }
        
        setCurrentQueueIdx(0);
        setSessionScore(0);
        setStep('problem');
    } catch (e) {
        console.error("Curating failed", e);
        setStep('locations');
    }
  };

  const getSpotIcon = (icon: string) => {
    const iconClass = "w-6 h-6 sm:w-7 sm:h-7";
    switch(icon) {
        case 'coffee': return <Coffee className={iconClass} />;
        case 'park': return <Trees className={iconClass} />;
        case 'train': return <Train className={iconClass} />;
        default: return <Target className={iconClass} />;
    }
  };

  if (step === 'locations') {
    return (
      <div className="h-full bg-charcoal text-white flex flex-col font-sans overflow-hidden">
        {/* Daily Quest Header - Mobile responsive */}
        <div className="p-4 sm:p-6 md:p-8 pr-16 sm:pr-20 md:pr-24 flex items-center gap-3 sm:gap-4 md:gap-6 border-b border-white/5 shrink-0 bg-black">
          <button onClick={() => onHome(true)} className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-white/5 rounded-full border border-white/10 hover:bg-white/10 transition-colors shrink-0"><Home size={16} className="sm:w-5 sm:h-5" /></button>
          
          <div className="flex-1 text-center min-w-0">
            <div className="text-[8px] sm:text-[10px] text-gold font-bold tracking-[0.2em] sm:tracking-[0.3em] uppercase mb-1">Daily Quest</div>
            <div className="flex items-center justify-center gap-2 sm:gap-3">
                <div className="h-1 sm:h-1.5 w-20 sm:w-32 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gold transition-all duration-700" style={{ width: `${(dailyCleared / 15) * 100}%` }}></div>
                </div>
                <span className="text-xs sm:text-sm font-bold font-mono text-gold">{dailyCleared}/15</span>
            </div>
          </div>

          <button 
            onClick={() => setShowStats(true)}
            className="w-9 h-9 sm:w-12 sm:h-12 rounded-full flex items-center justify-center bg-gold/10 border border-gold/20 text-gold hover:bg-gold/20 transition-all shadow-[0_0_20px_rgba(199,169,101,0.1)] shrink-0"
          >
            <Trophy size={16} className="sm:w-5 sm:h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6 pb-32 sm:pb-40 max-w-2xl mx-auto w-full">
          <div className="text-center mb-2 sm:mb-4">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-serif font-bold text-white mb-1 sm:mb-2">Power Spots</h2>
              <p className="text-gray-500 text-xs sm:text-sm italic px-4">Clear 5 problems at any spot to complete your ritual.</p>
          </div>

          {POWER_SPOTS.map((spot) => (
            <button 
              key={spot.id} 
              onClick={() => startSpotSession(spot)}
              className="w-full bg-white/5 rounded-2xl sm:rounded-[2.5rem] border-2 border-white/5 p-4 sm:p-6 md:p-8 flex items-center gap-4 sm:gap-6 md:gap-8 text-left hover:border-gold/40 hover:bg-gold/5 transition-all group"
            >
              <div className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-2xl sm:rounded-3xl bg-charcoal border border-white/10 flex items-center justify-center text-white group-hover:scale-110 group-hover:bg-gold group-hover:text-charcoal transition-all shrink-0">
                  {getSpotIcon(spot.icon)}
              </div>
              <div className="flex-1 min-w-0">
                  <div className="text-[8px] sm:text-[10px] font-bold text-gold uppercase tracking-widest mb-0.5 sm:mb-1">{spot.ritual}</div>
                  <h3 className="text-lg sm:text-xl md:text-2xl font-serif font-bold mb-0.5 sm:mb-1 truncate">{spot.name}</h3>
                  <p className="text-[10px] sm:text-xs text-gray-500 leading-relaxed line-clamp-2">{spot.description}</p>
              </div>
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-500 group-hover:text-gold shrink-0">
                  <ChevronRight size={16} className="sm:w-5 sm:h-5" />
              </div>
            </button>
          ))}

          {dailyCleared >= 15 && (
            <div className="bg-gold/10 border border-gold/40 rounded-2xl sm:rounded-[2.5rem] p-6 sm:p-10 text-center animate-in zoom-in duration-500">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gold rounded-full flex items-center justify-center text-charcoal mx-auto mb-3 sm:mb-4 shadow-[0_0_30px_rgba(199,169,101,0.4)]">
                    <Star size={24} className="sm:w-8 sm:h-8" fill="currentColor" />
                </div>
                <h3 className="text-xl sm:text-2xl font-serif font-bold text-gold mb-1 sm:mb-2">Daily Goal Achieved!</h3>
                <p className="text-gold/60 text-xs sm:text-sm">You have mastered 15 coding patterns today. Ritual complete.</p>
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
      </div>
    );
  }

  if (step === 'curating') {
    return (
      <div className="h-full bg-charcoal text-white flex flex-col items-center justify-center p-6 sm:p-8 text-center">
        <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-gold/10 flex items-center justify-center text-gold mb-6 sm:mb-8 animate-pulse border border-gold/20">
          <Sparkles size={32} className="sm:w-12 sm:h-12" />
        </div>
        <h2 className="text-2xl sm:text-4xl font-serif font-bold mb-3 sm:mb-4 px-4">Entering {selectedSpot?.name}</h2>
        <p className="text-gray-400 font-light italic leading-relaxed max-w-sm text-sm sm:text-base px-4">
          Selecting 5 unmastered challenges for your ritual...
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

  if (step === 'problem' || step === 'recording') {
    return (
      <div className="h-full bg-charcoal text-white flex flex-col font-sans overflow-hidden">
        {/* Header - Mobile responsive */}
        <div className="p-3 sm:p-6 md:p-8 pr-14 sm:pr-20 md:pr-24 flex items-center justify-between shrink-0 bg-black/20 border-b border-white/5 gap-2">
          <button onClick={() => setStep('locations')} className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-white/5 rounded-full border border-white/10 hover:bg-white/10 transition-colors shrink-0"><ArrowLeft size={16} className="sm:w-[18px] sm:h-[18px]" /></button>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
             <div className="px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-full border border-gold/30 text-[8px] sm:text-[10px] font-bold text-gold bg-gold/5 uppercase tracking-wider sm:tracking-widest truncate max-w-[120px] sm:max-w-none">
                {selectedSpot?.name}
             </div>
             <div className="px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-full border border-white/10 text-[8px] sm:text-[10px] font-bold text-gray-400 bg-white/5 uppercase tracking-wider sm:tracking-widest whitespace-nowrap">
                {currentQueueIdx + 1}/5
             </div>
          </div>
        </div>

        {/* Problem Content - Mobile responsive */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-8 py-4">
          <div className="max-w-2xl mx-auto pb-32 sm:pb-40">
            <h2 className="text-2xl sm:text-4xl md:text-5xl font-serif font-bold mb-6 sm:mb-10 leading-tight">{currentProblem?.title}</h2>
            <div className="bg-white/5 rounded-2xl sm:rounded-[2.5rem] p-5 sm:p-8 md:p-10 border border-white/10 mb-6 sm:mb-10">
              <div className="flex items-center gap-2 mb-4 sm:mb-6">
                 <BookOpen size={16} className="sm:w-5 sm:h-5 text-gold" />
                 <span className="text-[10px] sm:text-xs font-bold text-gold uppercase tracking-widest">Problem Statement</span>
              </div>
              <p className="text-base sm:text-lg md:text-xl text-gray-200 leading-relaxed font-light mb-6 sm:mb-10">{currentProblem?.prompt}</p>
              {currentProblem?.example && (
                <div className="bg-black/40 p-4 sm:p-6 md:p-8 rounded-xl sm:rounded-3xl border border-white/5 font-mono text-xs sm:text-sm text-gray-300 leading-relaxed overflow-x-auto"><pre className="whitespace-pre-wrap">{currentProblem.example}</pre></div>
              )}
            </div>
            {revealHintIdx < 4 && (
              <button 
                onClick={() => setRevealHintIdx(p => Math.min(p + 1, 4))} 
                className="text-[9px] sm:text-[10px] font-bold text-gold uppercase tracking-[0.2em] sm:tracking-[0.3em] border border-gold/40 px-5 sm:px-8 py-3 sm:py-4 rounded-full hover:bg-gold/10 transition-all flex items-center gap-2 sm:gap-3 mx-auto"
              >
                {revealHintIdx === 0 ? 'Need a Hint?' : 'Need More Hints?'} <Sparkles size={12} className="sm:w-3.5 sm:h-3.5" />
              </button>
            )}
            <div className="grid gap-4 sm:gap-6 mt-6 sm:mt-10">
              {revealHintIdx >= 1 && <div className="p-5 sm:p-8 bg-gold/5 border border-gold/10 rounded-xl sm:rounded-[2rem] animate-in slide-in-from-bottom-4"><span className="text-[9px] sm:text-[10px] font-bold uppercase text-gold tracking-widest mb-2 sm:mb-3 block opacity-60">Pattern</span><p className="text-lg sm:text-2xl font-serif font-semibold">{currentProblem?.pattern}</p></div>}
              {revealHintIdx >= 2 && <div className="p-5 sm:p-8 bg-white/5 border border-white/10 rounded-xl sm:rounded-[2rem] animate-in slide-in-from-bottom-4"><span className="text-[9px] sm:text-[10px] font-bold uppercase text-gray-500 tracking-widest mb-2 sm:mb-3 block">Key Idea</span><p className="text-base sm:text-xl italic font-light">"{currentProblem?.keyIdea}"</p></div>}
              {revealHintIdx >= 3 && currentProblem?.detailedHint && <div className="p-5 sm:p-8 bg-blue-950/30 border border-blue-500/20 rounded-xl sm:rounded-[2rem] animate-in slide-in-from-bottom-4"><span className="text-[9px] sm:text-[10px] font-bold uppercase text-blue-400 tracking-widest mb-2 sm:mb-3 block">Approach Walkthrough</span><p className="text-sm sm:text-base text-gray-200 leading-relaxed whitespace-pre-wrap">{currentProblem?.detailedHint}</p></div>}
              {revealHintIdx >= 4 && <div className="p-5 sm:p-8 bg-black border border-white/10 rounded-xl sm:rounded-[2rem] animate-in slide-in-from-bottom-4"><span className="text-[9px] sm:text-[10px] font-bold uppercase text-gray-600 tracking-widest mb-2 sm:mb-3 block">Logic Structure (Python)</span><pre className="text-xs sm:text-sm font-mono text-gold/80 whitespace-pre-wrap overflow-x-auto">{currentProblem?.skeleton}</pre></div>}
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
                  {rawTranscript || "Verbalize your mental model..."}
              </div>
              <button onClick={handleStopRecording} className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-red-600 flex items-center justify-center text-white shadow-2xl animate-pulse border-4 border-white/10 active:scale-95"><StopCircle size={28} className="sm:w-10 sm:h-10" /></button>
            </div>
          )}
          <span className="mt-5 sm:mt-8 text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-[0.3em] sm:tracking-[0.4em]">{step === 'problem' ? 'Push to Explain' : 'Stop Recording'}</span>
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
                             <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2 sm:py-3 bg-yellow-500/20 border border-yellow-500/50 rounded-lg sm:rounded-xl text-yellow-300 w-full sm:w-auto justify-center">
                                 <AlertCircle size={20} className="sm:w-6 sm:h-6" />
                                 <span className="font-bold uppercase tracking-widest text-xs sm:text-sm">Partial</span>
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

  return null;
};

export default WalkieTalkieView;
