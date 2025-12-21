
import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../config/supabase';
import { User } from '../types';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper function to convert Supabase User to our User type
const convertSupabaseUser = (supabaseUser: SupabaseUser): User => {
    return {
        id: supabaseUser.id,
        name: supabaseUser.user_metadata?.name || supabaseUser.user_metadata?.full_name || 'User',
        email: supabaseUser.email || '',
        avatarUrl: supabaseUser.user_metadata?.avatar_url || supabaseUser.user_metadata?.picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${supabaseUser.id}`
    };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Check active session
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                setUser(convertSupabaseUser(session.user));
            }
            setIsLoading(false);
        });

        // Listen to auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                const newUser = convertSupabaseUser(session.user);
                setUser(currentUser => {
                    // Deep comparison to prevent unnecessary re-renders
                    if (currentUser && 
                        currentUser.id === newUser.id && 
                        currentUser.email === newUser.email && 
                        currentUser.name === newUser.name && 
                        currentUser.avatarUrl === newUser.avatarUrl) {
                        return currentUser;
                    }
                    return newUser;
                });
            } else {
                setUser(null);
            }
            setIsLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const signInWithGoogle = async () => {
        setIsLoading(true);
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin
                }
            });
            if (error) throw error;
        } catch (error) {
            console.error('Error signing in with Google:', error);
            setIsLoading(false);
            throw error;
        }
        // Note: isLoading will be set to false by onAuthStateChange
    };

    const signOut = async () => {
        setIsLoading(true);
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            setUser(null);
        } catch (error) {
            console.error('Error signing out:', error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AuthContext.Provider value={{ user, isLoading, signInWithGoogle, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
