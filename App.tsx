
import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { SavedItem, SavedReport, PerformanceReport } from './types';
import HomeView from './views/HomeView';
import DatabaseView from './views/DatabaseView';
import AnalysisView from './views/AnalysisView';
import HotTakeView from './views/HotTakeView';
import WalkieTalkieView from './views/WalkieTalkieView';
import LoginView from './views/LoginView';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import UserMenu from './components/UserMenu';
import * as db from './services/databaseService';
import { titleToSlug, findReportBySlug } from './utils';

// Component to view individual reports by slug
interface ReportViewerProps {
  savedReports: SavedReport[];
  isSaved: (title: string, content: string) => boolean;
  onToggleSave: (item: Omit<SavedItem, 'id' | 'date'>) => void;
}

const ReportViewer: React.FC<ReportViewerProps> = ({ savedReports, isSaved, onToggleSave }) => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const report = slug ? findReportBySlug(savedReports, slug) : null;

  if (!report) {
    return (
      <div className="h-full bg-cream text-charcoal flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-serif font-bold mb-4">Report Not Found</h2>
          <p className="text-gray-500 mb-6">The report you're looking for doesn't exist or has been deleted.</p>
          <button 
            onClick={() => navigate('/database')}
            className="px-6 py-3 bg-charcoal text-white rounded-lg hover:bg-black transition-colors"
          >
            View All Reports
          </button>
        </div>
      </div>
    );
  }

  return (
    <DatabaseView 
      savedItems={[]} 
      savedReports={savedReports}
      onDeleteSnippet={() => {}}
      onDeleteReport={() => navigate('/database')}
      onUpdateReport={() => {}}
      onHome={() => navigate('/')} 
      isSaved={isSaved}
      onToggleSave={onToggleSave}
      selectedReportSlug={slug}
    />
  );
};

const MainApp: React.FC = () => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  
  // Track if we've loaded data for the current user to prevent re-fetching
  const loadedUserIdRef = React.useRef<string | null>(null);
  
  // Walkie-Talkie mastery state
  const [masteredIds, setMasteredIds] = useState<string[]>(() => {
      try {
          const stored = localStorage.getItem('micdrop_mastery_ids');
          return stored ? JSON.parse(stored) : [];
      } catch { return []; }
  });

  // Persist mastery state
  useEffect(() => {
      localStorage.setItem('micdrop_mastery_ids', JSON.stringify(masteredIds));
  }, [masteredIds]);

  const markAsMastered = useCallback((problemId: string) => {
      setMasteredIds(prev => {
          if (prev.includes(problemId)) return prev;
          return [...prev, problemId];
      });
  }, []);

  // Load data from Supabase when user logs in
  useEffect(() => {
      if (!user) {
          setSavedItems([]);
          setSavedReports([]);
          loadedUserIdRef.current = null;
          return;
      }

      // Skip if we already loaded data for this user
      if (loadedUserIdRef.current === user.id) {
          return;
      }

      const loadUserData = async () => {
          setIsLoadingData(true);
          loadedUserIdRef.current = user.id;
          try {
              const [items, reports] = await Promise.all([
                  db.fetchSavedItems(user.id),
                  db.fetchSavedReports(user.id)
              ]);
              setSavedItems(items);
              setSavedReports(reports);
          } catch (e) {
              console.error("Failed to load user data from database", e);
              // Reset ref so we can retry
              loadedUserIdRef.current = null;
          } finally {
              setIsLoadingData(false);
          }
      };

      loadUserData();
  }, [user]);


  // -- Snippet Logic --
  const toggleSaveItem = useCallback(async (item: Omit<SavedItem, 'id' | 'date'>) => {
      const userId = user?.id;
      if (!userId) return;
      
      const existingItem = savedItems.find(i => i.title === item.title && i.content === item.content);
      
      if (existingItem) {
          // Delete from database
          const success = await db.deleteSavedItem(existingItem.id);
          if (success) {
              setSavedItems(prev => prev.filter(i => i.id !== existingItem.id));
          }
      } else {
          // Create in database
          const newItem = await db.createSavedItem(userId, item);
          if (newItem) {
              setSavedItems(prev => [newItem, ...prev]);
          }
      }
  }, [user?.id, savedItems]);
  
  const isSaved = useCallback((title: string, content: string) => {
      return savedItems.some(i => i.title === title && i.content === content);
  }, [savedItems]);
  
  const deleteSavedItem = useCallback(async (id: string) => {
      const success = await db.deleteSavedItem(id);
      if (success) {
          setSavedItems(prev => prev.filter(i => i.id !== id));
      }
  }, []);

  // -- Report Logic --
const saveReport = useCallback(async (title: string, type: 'coach' | 'walkie' | 'hot-take', report: PerformanceReport) => {
      const userId = user?.id;
      console.log('[DEBUG] saveReport called:', { title, type, userId: userId || 'NO USER ID' });
      
      if (!userId) {
          console.error('[DEBUG] saveReport aborted - no user ID');
          return;
      }

      const newReport = await db.createSavedReport(userId, title, type, report);
      if (newReport) {
          console.log('[DEBUG] Report added to state:', newReport.id);
          setSavedReports(prev => [newReport, ...prev]);
      } else {
          console.error('[DEBUG] createSavedReport returned null');
      }
  }, [user?.id]);

  const updateSavedReport = useCallback(async (id: string, updates: Partial<SavedReport>) => {
      const success = await db.updateSavedReport(id, updates);
      if (success) {
          setSavedReports(prev => prev.map(report => 
              report.id === id ? { ...report, ...updates } : report
          ));
      }
  }, []);

  const deleteSavedReport = useCallback(async (id: string) => {
      const success = await db.deleteSavedReport(id);
      if (success) {
          setSavedReports(prev => prev.filter(r => r.id !== id));
      }
  }, []);

  // -- Navigation --
  const handleNavigate = useCallback((view: 'analysis' | 'database' | 'hot-take' | 'walkie-talkie') => {
      navigate(`/${view}`);
  }, [navigate]);

  const goHome = useCallback((force: boolean | unknown = false) => {
      const shouldForce = force === true;
      if (!shouldForce) {
          if (!window.confirm("Are you sure you want to go back? Current progress will be lost.")) return;
      }
      navigate('/');
  }, [navigate]);

    if (isLoading) {
      return <div className="h-screen w-screen bg-cream flex items-center justify-center">
          <div className="text-charcoal">Loading...</div>
      </div>;
  }

  if (!user) {
      return <LoginView />;
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-cream text-charcoal font-sans relative">
      {/* User Menu Overlay - Available on all views */}
      <div className="absolute top-6 right-6 z-[60]">
          <UserMenu />
      </div>

      <Routes>
        <Route path="/" element={<HomeView onNavigate={handleNavigate} />} />
        
        <Route path="/database" element={
          <DatabaseView 
            savedItems={savedItems} 
            savedReports={savedReports}
            onDeleteSnippet={deleteSavedItem} 
            onDeleteReport={deleteSavedReport}
            onUpdateReport={updateSavedReport}
            onHome={() => navigate('/')} 
            isSaved={isSaved}
            onToggleSave={toggleSaveItem}
          />
        } />
        
        <Route path="/report/:slug" element={
          <ReportViewer 
            savedReports={savedReports}
            isSaved={isSaved}
            onToggleSave={toggleSaveItem}
          />
        } />
        
        <Route path="/analysis" element={
          <AnalysisView 
            onHome={goHome} 
            isSaved={isSaved} 
            onToggleSave={toggleSaveItem}
            onSaveReport={saveReport}
          />
        } />
        
        <Route path="/hot-take" element={
          <HotTakeView 
            onHome={goHome}
            onSaveReport={saveReport}
            isSaved={isSaved}
            onToggleSave={toggleSaveItem}
          />
        } />
        
<Route path="/walkie-talkie" element={
          <WalkieTalkieView
            onHome={goHome}
            onSaveReport={saveReport}
            masteredIds={masteredIds}
            onMastered={markAsMastered}
            isSaved={isSaved}
            onToggleSave={toggleSaveItem}
          />
        } />
        
        {/* Redirect any unknown routes to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
};

const App: React.FC = () => {
    return (
        <BrowserRouter>
            <AuthProvider>
                <MainApp />
            </AuthProvider>
        </BrowserRouter>
    );
};

export default App;
