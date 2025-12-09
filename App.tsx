
import React, { useState, useEffect, useCallback } from 'react';
import { SavedItem, SavedReport, PerformanceReport } from './types';
import { generateId } from './utils';
import HomeView from './views/HomeView';
import DatabaseView from './views/DatabaseView';
import AnalysisView from './views/AnalysisView';
import TeleprompterView from './views/TeleprompterView';
import LoginView from './views/LoginView';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import UserMenu from './components/UserMenu';

// Application Views
type AppView = 'home' | 'teleprompter' | 'analysis' | 'database';

const MainApp: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<AppView>('home');
  
  // -- User-Specific Persistence --
  // We use the user.id to namespace the data
  const STORAGE_KEY_ITEMS = user ? `micdrop_items_v2_${user.id}` : 'micdrop_items_v2_guest';
  const STORAGE_KEY_REPORTS = user ? `micdrop_reports_v2_${user.id}` : 'micdrop_reports_v2_guest';

  const [savedItems, setSavedItems] = useState<SavedItem[]>(() => {
      if (!user) return [];
      try {
          const stored = localStorage.getItem(STORAGE_KEY_ITEMS);
          return stored ? JSON.parse(stored) : [];
      } catch { return []; }
  });

  const [savedReports, setSavedReports] = useState<SavedReport[]>(() => {
      if (!user) return [];
      try {
          const stored = localStorage.getItem(STORAGE_KEY_REPORTS);
          return stored ? JSON.parse(stored) : [];
      } catch { return []; }
  });

  // Load data when user changes (re-sync)
  useEffect(() => {
      if (!user) return;
      try {
          const storedItems = localStorage.getItem(STORAGE_KEY_ITEMS);
          const storedReports = localStorage.getItem(STORAGE_KEY_REPORTS);
          setSavedItems(storedItems ? JSON.parse(storedItems) : []);
          setSavedReports(storedReports ? JSON.parse(storedReports) : []);
      } catch (e) {
          console.error("Failed to load user data", e);
      }
  }, [user, STORAGE_KEY_ITEMS, STORAGE_KEY_REPORTS]);

  // Sync data when state changes
  useEffect(() => {
      if (!user) return;
      try {
          localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(savedItems));
      } catch (e) {
          console.error("Failed to save items", e);
      }
  }, [savedItems, user, STORAGE_KEY_ITEMS]);

  useEffect(() => {
      if (!user) return;
      try {
          localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(savedReports));
      } catch (e) {
          console.error("Failed to save reports", e);
      }
  }, [savedReports, user, STORAGE_KEY_REPORTS]);


  // -- Snippet Logic --
  const toggleSaveItem = useCallback((item: Omit<SavedItem, 'id' | 'date'>) => {
      setSavedItems(prevItems => {
          const existingIndex = prevItems.findIndex(i => i.title === item.title && i.content === item.content);
          if (existingIndex >= 0) {
              return prevItems.filter((_, idx) => idx !== existingIndex);
          } else {
              const newItem: SavedItem = { ...item, id: generateId(), date: new Date().toISOString() };
              return [newItem, ...prevItems];
          }
      });
  }, []);
  
  const isSaved = useCallback((title: string, content: string) => {
      return savedItems.some(i => i.title === title && i.content === content);
  }, [savedItems]);
  
  const deleteSavedItem = useCallback((id: string) => {
      setSavedItems(prev => prev.filter(i => i.id !== id));
  }, []);

  // -- Report Logic --
  const saveReport = useCallback((title: string, type: 'coach' | 'rehearsal', report: PerformanceReport) => {
      const newReport: SavedReport = {
          id: generateId(),
          date: new Date().toISOString(),
          title: title || "Untitled Session",
          type,
          rating: report.rating,
          reportData: report
      };
      setSavedReports(prev => [newReport, ...prev]);
  }, []);

  const updateSavedReport = useCallback((id: string, updates: Partial<SavedReport>) => {
      setSavedReports(prev => prev.map(report => 
          report.id === id ? { ...report, ...updates } : report
      ));
  }, []);

  const deleteSavedReport = useCallback((id: string) => {
      setSavedReports(prev => prev.filter(r => r.id !== id));
  }, []);

  // -- Navigation --
  const handleNavigate = (view: AppView) => {
      setCurrentView(view);
  };

  const goHome = (force: boolean | unknown = false) => {
      const shouldForce = force === true;
      if (!shouldForce) {
          if (!window.confirm("Are you sure you want to go back? Current progress will be lost.")) return;
      }
      setCurrentView('home');
  };

  if (isLoading) {
      return <div className="h-screen w-screen bg-cream flex items-center justify-center">Loading...</div>;
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

      {currentView === 'home' && (
          <HomeView onNavigate={handleNavigate} />
      )}
      
      {currentView === 'database' && (
          <DatabaseView 
            savedItems={savedItems} 
            savedReports={savedReports}
            onDeleteSnippet={deleteSavedItem} 
            onDeleteReport={deleteSavedReport}
            onUpdateReport={updateSavedReport}
            onHome={() => setCurrentView('home')} 
            isSaved={isSaved}
            onToggleSave={toggleSaveItem}
          />
      )}
      
      {currentView === 'analysis' && (
          <AnalysisView 
              onHome={goHome} 
              isSaved={isSaved} 
              onToggleSave={toggleSaveItem}
              onSaveReport={saveReport}
          />
      )}
      
      {currentView === 'teleprompter' && (
          <TeleprompterView 
              onHome={goHome} 
              isSaved={isSaved} 
              onToggleSave={toggleSaveItem}
              onSaveReport={saveReport}
          />
      )}
    </div>
  );
};

const App: React.FC = () => {
    return (
        <AuthProvider>
            <MainApp />
        </AuthProvider>
    );
};

export default App;
