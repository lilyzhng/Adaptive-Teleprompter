
import React from 'react';
import { ArrowRight, Flame, ScrollText, BarChart3, Zap, Radio } from 'lucide-react';

interface HomeViewProps {
    onNavigate: (view: 'teleprompter' | 'analysis' | 'database' | 'hot-take' | 'walkie-talkie') => void;
}

const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
    return (
        <div className="h-full bg-cream text-charcoal flex flex-col items-center py-12 px-6 relative overflow-y-auto font-sans">
            <div className="fixed top-0 left-0 w-full h-full opacity-40 pointer-events-none" 
                 style={{ backgroundImage: 'radial-gradient(circle at 15% 15%, #F0EBE0 0%, transparent 20%), radial-gradient(circle at 85% 85%, #E8E0D0 0%, transparent 20%)' }}>
            </div>

            <div className="text-center mb-12 z-10 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700">
                <h1 className="text-6xl md:text-8xl font-serif mb-6 tracking-tight text-charcoal">
                    MicDrop
                </h1>
                <p className="text-gray-500 text-xl font-serif italic max-w-lg mx-auto leading-relaxed">
                    Don't just answer. Perform.
                </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 z-10 w-full max-w-7xl px-4 pb-12">
                {/* Row 1, Card 1: The Coach */}
                <button onClick={() => onNavigate('analysis')} className="group bg-white p-10 rounded-3xl shadow-xl hover:shadow-2xl transition-all border border-[#EBE8E0] hover:border-gold/30 text-left relative overflow-hidden flex flex-col h-full">
                     <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                         <Flame size={120} className="text-gold" />
                     </div>
                     <div className="w-16 h-16 rounded-2xl bg-cream border border-gold/20 text-gold flex items-center justify-center mb-8 shadow-lg group-hover:scale-110 transition-transform duration-300 shrink-0">
                         <Flame size={32} />
                     </div>
                     <div className="flex-1">
                         <h3 className="text-2xl font-serif font-bold text-charcoal mb-4">The Coach</h3>
                         <p className="text-gray-500 text-base leading-relaxed mb-8">
                             Complete interview analysis. Upload your audio to get a forensic transcript followed by executive-level feedback on delivery, strategy, and leadership presence.
                         </p>
                     </div>
                     <div className="flex items-center gap-2 text-gold font-bold text-xs tracking-widest uppercase mt-auto">
                         Start Analysis <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                     </div>
                </button>

                {/* Row 1, Card 2: Hot Take */}
                <button onClick={() => onNavigate('hot-take')} className="group bg-white p-10 rounded-3xl shadow-xl hover:shadow-2xl transition-all border border-gold/30 hover:border-gold text-left relative overflow-hidden flex flex-col h-full ring-2 ring-gold/10">
                     <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                         <Zap size={120} className="text-gold" />
                     </div>
                     <div className="w-16 h-16 rounded-2xl bg-gold text-white flex items-center justify-center mb-8 shadow-lg group-hover:scale-110 transition-transform duration-300 shrink-0">
                         <Zap size={32} />
                     </div>
                     <div className="flex-1">
                         <h3 className="text-2xl font-serif font-bold text-charcoal mb-4">Hot Take</h3>
                         <p className="text-gray-500 text-base leading-relaxed mb-8">
                            Live voice sparring. Gemini evaluates your story and probes with follow-up questions to stress-test your narrative.
                         </p>
                     </div>
                     <div className="flex items-center gap-2 text-gold font-bold text-xs tracking-widest uppercase mt-auto">
                         Start Sparring <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                     </div>
                </button>

                {/* Row 1, Card 3: Walkie-Talkie */}
                <button onClick={() => onNavigate('walkie-talkie')} className="group bg-white p-10 rounded-3xl shadow-xl hover:shadow-2xl transition-all border border-[#EBE8E0] hover:border-gold/30 text-left relative overflow-hidden flex flex-col h-full">
                     <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                         <Radio size={120} className="text-charcoal" />
                     </div>
                     <div className="w-16 h-16 rounded-2xl bg-charcoal text-white flex items-center justify-center mb-8 shadow-lg group-hover:scale-110 transition-transform duration-300 shrink-0">
                         <Radio size={32} />
                     </div>
                     <div className="flex-1">
                         <h3 className="text-2xl font-serif font-bold text-charcoal mb-4">Walkie-Talkie</h3>
                         <p className="text-gray-500 text-base leading-relaxed mb-8">
                            Master the Blind 75 on the move. Explain algorithms out loud while you walk and get AI feedback.
                         </p>
                     </div>
                     <div className="flex items-center gap-2 text-gold font-bold text-xs tracking-widest uppercase mt-auto">
                         Go Out <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                     </div>
                </button>

                {/* Row 1, Card 4: My Performance */}
                <button onClick={() => onNavigate('database')} className="group bg-white p-10 rounded-3xl shadow-xl hover:shadow-2xl transition-all border border-[#EBE8E0] hover:border-gold/30 text-left relative overflow-hidden flex flex-col h-full">
                     <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                         <BarChart3 size={120} className="text-gold" />
                     </div>
                     <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gold/10 to-gold/20 border border-gold/30 text-gold flex items-center justify-center mb-8 shadow-lg group-hover:scale-110 transition-transform duration-300 shrink-0">
                         <BarChart3 size={32} />
                     </div>
                     <div className="flex-1">
                         <h3 className="text-2xl font-serif font-bold text-charcoal mb-4">My Performance</h3>
                         <p className="text-gray-500 text-base leading-relaxed mb-8">
                            Access your saved performance reports and track your progress over time. Review past analyses and see how you've improved.
                         </p>
                     </div>
                     <div className="flex items-center gap-2 text-gold font-bold text-xs tracking-widest uppercase mt-auto">
                         View Reports <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                     </div>
                </button>
            </div>
        </div>
    );
};

export default HomeView;
