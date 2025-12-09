
import React, { useState, useEffect, useCallback } from 'react';
import { SavedItem, SavedReport, PerformanceReport } from './types';
import HomeView from './views/HomeView';
import DatabaseView from './views/DatabaseView';
import AnalysisView from './views/AnalysisView';
import TeleprompterView from './views/TeleprompterView';
import LoginView from './views/LoginView';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import UserMenu from './components/UserMenu';
import * as db from './services/databaseService';

// Application Views
type AppView = 'home' | 'teleprompter' | 'analysis' | 'database';

const MainApp: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Load data from Supabase when user logs in
  useEffect(() => {
      if (!user) {
          setSavedItems([]);
          setSavedReports([]);
          return;
      }

      const loadUserData = async () => {
          setIsLoadingData(true);
          try {
              const [items, reports] = await Promise.all([
                  db.fetchSavedItems(user.id),
                  db.fetchSavedReports(user.id)
              ]);
              setSavedItems(items);
              setSavedReports(reports);
          } catch (e) {
              console.error("Failed to load user data from database", e);
          } finally {
              setIsLoadingData(false);
          }
      };

      loadUserData();
  }, [user]);


  // -- Snippet Logic --
  const toggleSaveItem = useCallback(async (item: Omit<SavedItem, 'id' | 'date'>) => {
      if (!user) return;
      
      const existingItem = savedItems.find(i => i.title === item.title && i.content === item.content);
      
      if (existingItem) {
          // Delete from database
          const success = await db.deleteSavedItem(existingItem.id);
          if (success) {
              setSavedItems(prev => prev.filter(i => i.id !== existingItem.id));
          }
      } else {
          // Create in database
          const newItem = await db.createSavedItem(user.id, item);
          if (newItem) {
              setSavedItems(prev => [newItem, ...prev]);
          }
      }
  }, [user, savedItems]);
  
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
  const saveReport = useCallback(async (title: string, type: 'coach' | 'rehearsal', report: PerformanceReport) => {
      if (!user) return;
      
      const newReport = await db.createSavedReport(user.id, title, type, report);
      if (newReport) {
          setSavedReports(prev => [newReport, ...prev]);
      }
  }, [user]);

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

  if (isLoading || isLoadingData) {
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
