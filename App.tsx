
import React, { useState, useEffect, useCallback } from 'react';
import { SavedItem, SavedReport, PerformanceReport } from './types';
import { generateId } from './utils';
import HomeView from './views/HomeView';
import DatabaseView from './views/DatabaseView';
import AnalysisView from './views/AnalysisView';
import TeleprompterView from './views/TeleprompterView';

// Application Views
type AppView = 'home' | 'teleprompter' | 'analysis' | 'database';
type AnalysisMode = 'sound_check' | 'coach';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('sound_check');
  
  // -- Persistence State (Lazy Initialization) --
  // We initialize state directly from localStorage to prevent data loss on initial render
  const [savedItems, setSavedItems] = useState<SavedItem[]>(() => {
      try {
          const stored = localStorage.getItem('micdrop_saved_items');
          return stored ? JSON.parse(stored) : [];
      } catch (e) {
          console.error("Failed to load saved items", e);
          return [];
      }
  });

  const [savedReports, setSavedReports] = useState<SavedReport[]>(() => {
      try {
          const stored = localStorage.getItem('micdrop_saved_reports');
          return stored ? JSON.parse(stored) : [];
      } catch (e) {
          console.error("Failed to load saved reports", e);
          return [];
      }
  });

  // -- Auto-Sync Effects --
  // Whenever state changes, we automatically sync to localStorage.
  // This decoupling ensures we never save "stale" data from closures.
  useEffect(() => {
      localStorage.setItem('micdrop_saved_items', JSON.stringify(savedItems));
  }, [savedItems]);

  useEffect(() => {
      localStorage.setItem('micdrop_saved_reports', JSON.stringify(savedReports));
  }, [savedReports]);


  // -- Snippet Logic --
  // Use useCallback and functional updates (prev => ...) to ensure thread safety
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
  const handleNavigate = (view: AppView, mode?: AnalysisMode) => {
      if (mode) setAnalysisMode(mode);
      setCurrentView(view);
  };

  const goHome = (force: boolean | unknown = false) => {
      // Ensure force is a boolean because some event handlers might pass an event object
      const shouldForce = force === true;
      
      if (!shouldForce) {
          if (!window.confirm("Are you sure you want to go back? Current progress will be lost.")) return;
      }
      setCurrentView('home');
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-cream text-charcoal font-sans">
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
              mode={analysisMode} 
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

export default App;
