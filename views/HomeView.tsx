
import React from 'react';
import { Database, ArrowRight, Flame, ScrollText } from 'lucide-react';

interface HomeViewProps {
    onNavigate: (view: 'teleprompter' | 'analysis' | 'database') => void;
}

const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
    return (
        <div className="h-full bg-cream text-charcoal flex flex-col items-center md:justify-center p-6 relative overflow-y-auto font-sans">
            <div className="fixed top-0 left-0 w-full h-full opacity-40 pointer-events-none" 
                 style={{ backgroundImage: 'radial-gradient(circle at 15% 15%, #F0EBE0 0%, transparent 20%), radial-gradient(circle at 85% 85%, #E8E0D0 0%, transparent 20%)' }}>
            </div>

            <div className="text-center mb-16 z-10 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700 shrink-0 mt-10 md:mt-0">
                <div className="mb-4 inline-block px-4 py-1.5 rounded-full border border-gold/40 text-gold text-[10px] font-bold tracking-[0.2em] uppercase bg-white/50 backdrop-blur-sm">
                    Executive Performance Suite
                </div>
                <h1 className="text-6xl md:text-8xl font-serif mb-6 tracking-tight text-charcoal">
                    MicDrop
                </h1>
                <p className="text-gray-500 text-xl font-serif italic max-w-lg mx-auto leading-relaxed">
                    Don't just answer. Perform.
                </p>
                
                <button 
                  onClick={() => onNavigate('database')}
                  className="mt-8 px-6 py-2 bg-white border border-[#EBE8E0] hover:border-gold/50 rounded-full text-charcoal text-xs font-bold uppercase tracking-widest shadow-sm hover:shadow-md transition-all flex items-center gap-2 mx-auto"
                >
                    <Database size={14} className="text-gold" /> My Database
                </button>
            </div>

            <div className="grid md:grid-cols-2 gap-8 z-10 w-full max-w-5xl px-4 pb-10 shrink-0">
                {/* Card 1: The Coach */}
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

                {/* Card 2: Rehearsal */}
                <button onClick={() => onNavigate('teleprompter')} className="group bg-white p-10 rounded-3xl shadow-xl hover:shadow-2xl transition-all border border-[#EBE8E0] hover:border-gold/30 text-left relative overflow-hidden flex flex-col h-full">
                     <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                         <ScrollText size={120} className="text-charcoal" />
                     </div>
                     <div className="w-16 h-16 rounded-2xl bg-charcoal text-white flex items-center justify-center mb-8 shadow-lg group-hover:scale-110 transition-transform duration-300 shrink-0">
                         <ScrollText size={32} />
                     </div>
                     <div className="flex-1">
                         <h3 className="text-2xl font-serif font-bold text-charcoal mb-4">Rehearsal</h3>
                         <p className="text-gray-500 text-base leading-relaxed mb-8">
                            Practice your pitch with an adaptive teleprompter that listens to your pace in real-time. Record, review, and perfect your delivery.
                         </p>
                     </div>
                     <div className="flex items-center gap-2 text-gold font-bold text-xs tracking-widest uppercase mt-auto">
                         Enter Studio <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                     </div>
                </button>
            </div>
        </div>
    );
};

export default HomeView;
