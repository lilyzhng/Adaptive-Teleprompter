
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Database, Trash2, Lightbulb, PenTool, Star, Ear, Mic2, FileText, Calendar, ArrowLeft, Edit2, Check, X, Play } from 'lucide-react';
import { SavedItem, SavedReport } from '../types';
import PerformanceReportComponent from '../components/PerformanceReport';
import { titleToSlug, findReportBySlug } from '../utils';

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
    const [activeTab, setActiveTab] = useState<'reports' | 'snippets'>('reports');
    const selectedReport = selectedReportSlug ? findReportBySlug(savedReports, selectedReportSlug) : null;
    
    // Edit State
    const [editingReportId, setEditingReportId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<{ title: string; date: string }>({ title: '', date: '' });

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
                         <PerformanceReportComponent 
                            report={selectedReport.reportData}
                            context={selectedReport.title}
                            isSaved={isSaved} 
                            onToggleSave={onToggleSave} 
                            onDone={() => navigate('/database')} 
                         />
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
                    className={`px-8 py-4 text-sm font-bold uppercase tracking-widest border-b-2 transition-colors ${activeTab === 'reports' ? 'border-gold text-charcoal' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                 >
                    Full Reports
                 </button>
                 <button 
                    onClick={() => setActiveTab('snippets')}
                    className={`px-8 py-4 text-sm font-bold uppercase tracking-widest border-b-2 transition-colors ${activeTab === 'snippets' ? 'border-gold text-charcoal' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                 >
                    Saved Snippets
                 </button>
             </div>
             
             <div className="flex-1 overflow-y-auto p-8 relative min-h-0">
                 <div className="max-w-4xl mx-auto pb-20">
                     
                     {/* --- REPORTS TAB (Coach Reports Only) --- */}
                     {activeTab === 'reports' && (
                         savedReports.filter(r => r.type === 'coach').length === 0 ? (
                            <div className="text-center py-20">
                                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-400">
                                    <FileText size={32} />
                                </div>
                                <h3 className="text-2xl font-serif font-bold text-charcoal mb-2">No Full Interview Reports</h3>
                                <p className="text-gray-500 max-w-sm mx-auto">
                                    Your full interview coaching analysis reports will appear here automatically after you complete Stage 2 analysis.
                                </p>
                            </div>
                         ) : (
                             <div className="space-y-4">
                                 {savedReports.filter(r => r.type === 'coach').map(report => {
                                     const isEditing = editingReportId === report.id;
                                     return (
                                     <div key={report.id} className="bg-white rounded-xl p-6 shadow-sm border border-[#EBE8E0] hover:shadow-md transition-shadow flex items-center gap-6 group">
                                         {/* Score Badge */}
                                         <div className="shrink-0 relative w-16 h-16 flex items-center justify-center">
                                            <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(#C7A965 ${report.rating}%, #F0EBE0 ${report.rating}% 100%)` }}></div>
                                            <div className="absolute inset-1 bg-white rounded-full flex flex-col items-center justify-center z-10">
                                                <span className="text-lg font-serif font-bold text-charcoal">{report.rating}</span>
                                            </div>
                                         </div>

                                         <div className="flex-1 min-w-0">
                                             <div className="flex items-center gap-2 mb-1">
                                                 <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${report.type === 'coach' ? 'bg-gold/10 text-gold' : 'bg-charcoal/10 text-charcoal'}`}>
                                                     {report.type === 'coach' ? 'Coach' : 'Rehearsal'}
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
                         )
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
        </div>
    );
};

export default DatabaseView;
