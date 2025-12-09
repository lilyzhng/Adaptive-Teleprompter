
import React, { useState, useRef } from 'react';
import { Home, Upload, Check, ArrowRight, Loader2, Download, Flame } from 'lucide-react';
import { PerformanceReport, SavedItem } from '../types';
import { getAudioMimeType } from '../utils';
import { analyzeStage1_Transcribe, analyzeStage2_Coach } from '../services/analysisService';
import PerformanceReportComponent from '../components/PerformanceReport';

interface AnalysisViewProps {
    onHome: (force: boolean) => void;
    isSaved: (title: string, content: string) => boolean;
    onToggleSave: (item: Omit<SavedItem, 'id' | 'date'>) => void;
    onSaveReport: (title: string, type: 'coach' | 'rehearsal', report: PerformanceReport) => void;
}

const AnalysisView: React.FC<AnalysisViewProps> = ({ onHome, isSaved, onToggleSave, onSaveReport }) => {
    // Local State
    const [uploadContext, setUploadContext] = useState("");
    const [manualTranscript, setManualTranscript] = useState("");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploadedAudioBase64, setUploadedAudioBase64] = useState<string | null>(null);
    
    // Process State
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisStep, setAnalysisStep] = useState<'idle' | 'transcribing' | 'analyzing'>('idle');
    const [transcriptionResult, setTranscriptionResult] = useState<string | null>(null);
    const [performanceReport, setPerformanceReport] = useState<PerformanceReport | null>(null);
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleHomeClick = () => {
        const hasData = !!(selectedFile || manualTranscript.trim() || uploadContext.trim() || transcriptionResult || performanceReport);
        if (hasData && !performanceReport) {
            if (!window.confirm("Are you sure you want to go back? Current progress will be lost.")) return;
        }
        onHome(true);
    };

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setSelectedFile(file);
        }
    };

    const startUnifiedAnalysis = async () => {
        if (!selectedFile && !manualTranscript.trim()) {
            alert("Please upload an audio file or paste a transcript.");
            return;
        }

        // Increased limit to 50MB as requested
        if (selectedFile && selectedFile.size > 50 * 1024 * 1024) {
             alert("File is too large. Please use a file smaller than 50MB.");
             return;
        }

        setIsAnalyzing(true);
        try {
            let base64Audio = null;
            let mimeType = 'audio/mp3';

            if (selectedFile) {
                base64Audio = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve((reader.result as string).split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(selectedFile);
                });
                setUploadedAudioBase64(base64Audio);
                mimeType = getAudioMimeType(selectedFile);
            }

            // LOGIC BRANCHING
            
            // Path A: Manual Transcript provided -> Skip Stage 1, Go straight to Stage 2
            if (manualTranscript.trim()) {
                setAnalysisStep('analyzing');
                setTranscriptionResult(manualTranscript); // Treat manual as the result
                
                const report = await analyzeStage2_Coach(base64Audio, manualTranscript, uploadContext, mimeType);
                setPerformanceReport(report);
                onSaveReport(uploadContext || "Coach Session", 'coach', report);
            } 
            // Path B: Audio Only -> Run Stage 1 (Transcribe) -> Automatically Run Stage 2 (Coach)
            else if (base64Audio) {
                // Phase 1: Transcribe
                setAnalysisStep('transcribing');
                const transcript = await analyzeStage1_Transcribe(base64Audio, mimeType, uploadContext);
                setTranscriptionResult(transcript);

                // Phase 2: Coach (Automatic Transition)
                setAnalysisStep('analyzing');
                const report = await analyzeStage2_Coach(base64Audio, transcript, uploadContext, mimeType);
                setPerformanceReport(report);
                onSaveReport(uploadContext || "Coach Session", 'coach', report);
            } else {
                throw new Error("No input provided");
            }

        } catch (error: any) {
            console.error("Analysis failed:", error);
            
            let errorMessage = "Unknown error";
            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (typeof error === 'object') {
                try {
                    errorMessage = JSON.stringify(error);
                } catch {
                    errorMessage = "Network or API Error";
                }
            } else {
                errorMessage = String(error);
            }

            // Detect common large payload/network errors
            if (errorMessage.includes("xhr error") || errorMessage.includes("error code: 6") || errorMessage.includes("Rpc failed")) {
                errorMessage = "Network Error: The file may be too large for the connection or API limits. Please try a smaller file (under 50MB).";
            }

            alert(`Analysis failed. ${errorMessage}`);
        } finally {
            setIsAnalyzing(false);
            setAnalysisStep('idle');
        }
    };

    const downloadTranscript = () => {
        if (!transcriptionResult) return;
        const blob = new Blob([transcriptionResult], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transcript.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
      <div className="h-full bg-cream text-charcoal flex flex-col font-sans overflow-hidden">
           {/* Header */}
           <div className="h-20 bg-white border-b border-[#E6E6E6] flex items-center justify-between px-8 z-50 shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={handleHomeClick} className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors">
                        <Home size={18} className="text-gray-500" />
                    </button>
                    <div>
                        <div className="text-[10px] font-bold text-gold uppercase tracking-widest">MicDrop</div>
                        <h2 className="text-xl font-serif font-bold text-charcoal flex items-center gap-2">
                           <Flame size={18} className="text-gold" /> The Coach
                        </h2>
                    </div>
                </div>
           </div>

           {/* Content */}
           <div className="flex-1 overflow-y-auto p-8 relative min-h-0">
                {!performanceReport ? (
                    isAnalyzing ? (
                        <div className="max-w-4xl mx-auto pb-20">
                             <div className="bg-white rounded-3xl shadow-xl border border-[#EBE8E0] p-12 text-center animate-in fade-in zoom-in-95 duration-300">
                                 <Loader2 className="animate-spin mx-auto text-gold mb-6" size={48} />
                                 <h3 className="text-2xl font-serif font-bold text-charcoal mb-2">
                                     {analysisStep === 'transcribing' ? 'Phase 1: Forensic Transcription...' : 'Phase 2: Coach Analysis...'}
                                 </h3>
                                 <p className="text-gray-500 animate-pulse">
                                     {analysisStep === 'transcribing' 
                                        ? "Extracting verbatim speech and non-verbal cues..." 
                                        : "Evaluating pacing, clarity, and leadership presence..."}
                                 </p>
                             </div>
                        </div>
                    ) : (
                        <div className="max-w-2xl mx-auto mt-6 bg-white rounded-3xl shadow-xl border border-[#EBE8E0] p-10 animate-in fade-in slide-in-from-bottom-4">
                            <div className="mb-8">
                                 <h3 className="text-3xl font-serif font-bold text-charcoal mb-2">New Session</h3>
                                 <p className="text-gray-500">Upload your interview audio. We'll extract the transcript and provide executive coaching.</p>
                            </div>
                            
                            <div className="space-y-8">
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Context & Roles (Optional)</label>
                                    <textarea 
                                        className="w-full h-24 bg-[#FAF9F6] border border-[#E6E6E6] rounded-xl p-4 text-sm text-charcoal outline-none focus:border-gold resize-none focus:ring-1 focus:ring-gold/50"
                                        placeholder="e.g., 'Technical Interview for Senior ML Engineer role. Recruiter is Joe, I am Lily.'"
                                        value={uploadContext}
                                        onChange={(e) => setUploadContext(e.target.value)}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Transcript (Optional)</label>
                                    <textarea 
                                        className="w-full h-32 bg-[#FAF9F6] border border-[#E6E6E6] rounded-xl p-4 text-sm text-charcoal outline-none focus:border-gold resize-none focus:ring-1 focus:ring-gold/50 placeholder:text-gray-300"
                                        placeholder="Paste existing transcript here to skip the transcription step..."
                                        value={manualTranscript}
                                        onChange={(e) => setManualTranscript(e.target.value)}
                                    />
                                </div>

                                <div 
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all ${selectedFile ? 'border-green-400 bg-green-50/50' : 'border-gray-200 hover:border-gold/50 hover:bg-gray-50'}`}
                                >
                                    <input type="file" accept="audio/*" className="hidden" ref={fileInputRef} onChange={handleFileSelect} />
                                    {selectedFile ? (
                                        <>
                                            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center text-green-600 shadow-sm">
                                                <Check size={28} />
                                            </div>
                                            <div className="text-center">
                                                <span className="block text-lg font-bold text-green-800 break-all">{selectedFile.name}</span>
                                                <span className="text-xs text-green-600 uppercase tracking-widest font-bold mt-1">Ready to Analyze</span>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="w-14 h-14 rounded-full bg-cream flex items-center justify-center text-gold mb-2">
                                                <Upload size={24} />
                                            </div>
                                            <div className="text-center">
                                                <span className="block font-medium text-gray-600">Click to upload audio file</span>
                                                <span className="text-xs text-gray-400 mt-1">MP3, WAV, M4A supported (Max 50MB)</span>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Unified Action Button */}
                                {(selectedFile || manualTranscript.trim()) && (
                                    <button 
                                        onClick={startUnifiedAnalysis}
                                        className="w-full py-4 bg-charcoal text-white rounded-xl font-bold hover:bg-black transition-colors shadow-lg flex items-center justify-center gap-2"
                                    >
                                        {manualTranscript.trim() ? (
                                            <>Start Coach Analysis <Flame size={18} /></>
                                        ) : (
                                            <>Start Full Analysis <ArrowRight size={18} /></>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    )
                ) : (
                    <div className="max-w-4xl mx-auto pb-20">
                         {/* Stage 2 Result: Performance Report */}
                         <PerformanceReportComponent
                            report={performanceReport}
                            transcript={transcriptionResult || manualTranscript}
                            isSaved={isSaved}
                            onToggleSave={onToggleSave}
                            onDone={(f) => onHome(f)}
                         />
                    </div>
                )}
           </div>
      </div>
    );
};

export default AnalysisView;
