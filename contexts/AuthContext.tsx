
import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Check for existing session
        const storedUser = localStorage.getItem('micdrop_user_session');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
        setIsLoading(false);
    }, []);

    const signInWithGoogle = async () => {
        setIsLoading(true);
        // --- PRODUCTION NOTE ---
        // In a real app, you would use Firebase Auth here:
        // const result = await signInWithPopup(auth, googleProvider);
        // setUser(result.user);
        
        // --- SIMULATION ---
        // Simulating network delay and Google Login
        await new Promise(resolve => setTimeout(resolve, 800));
        
        const mockUser: User = {
            id: 'user_' + Math.random().toString(36).substr(2, 9),
            name: 'Demo User',
            email: 'demo@example.com',
            avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix'
        };
        
        setUser(mockUser);
        localStorage.setItem('micdrop_user_session', JSON.stringify(mockUser));
        setIsLoading(false);
    };

    const signOut = async () => {
        setIsLoading(true);
        await new Promise(resolve => setTimeout(resolve, 500));
        localStorage.removeItem('micdrop_user_session');
        setUser(null);
        setIsLoading(false);
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
