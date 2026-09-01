import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile } from '../types/project';

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  signInWithGoogle: (customEmail?: string, customName?: string, customPhoto?: string) => Promise<UserProfile>;
  continueAsGuest: () => UserProfile;
  signOut: () => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
}

// Storage keys keep their pre-rebrand names deliberately. Renaming them would
// orphan every existing user's saved session and projects on first launch of
// the rebranded build. The name is internal; the product name is not.
const AUTH_STORAGE_KEY = 'geostudio_user_session_v1';

const DEFAULT_GOOGLE_USER: UserProfile = {
  id: 'usr_google_886009',
  email: 'emailofsalim@gmail.com',
  name: 'Salim Geomatics',
  photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
  isGuest: false,
  provider: 'google',
  createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
  lastLoginAt: Date.now()
};

const DEFAULT_GUEST_USER: UserProfile = {
  id: 'guest_local_user',
  email: 'guest@bhunex.local',
  name: 'Guest Surveyor (Offline)',
  photoUrl: '',
  isGuest: true,
  provider: 'guest',
  createdAt: Date.now(),
  lastLoginAt: Date.now()
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to parse user session:', e);
    }
    // Default to Google user or guest for instant smooth access without forcing roadblocks
    return DEFAULT_GOOGLE_USER;
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  useEffect(() => {
    if (user) {
      try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      } catch (e) {
        console.warn('Failed to save user session:', e);
      }
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, [user]);

  const signInWithGoogle = async (customEmail?: string, customName?: string, customPhoto?: string): Promise<UserProfile> => {
    const newUser: UserProfile = {
      id: `usr_google_${Date.now().toString(36)}`,
      email: customEmail || 'emailofsalim@gmail.com',
      name: customName || 'Salim Geomatics',
      photoUrl: customPhoto || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
      isGuest: false,
      provider: 'google',
      createdAt: Date.now(),
      lastLoginAt: Date.now()
    };
    setUser(newUser);
    return newUser;
  };

  const continueAsGuest = (): UserProfile => {
    const guestUser: UserProfile = {
      id: `guest_${Date.now().toString(36)}`,
      email: 'guest@geostudio.local',
      name: 'Guest Surveyor (Local Offline)',
      photoUrl: '',
      isGuest: true,
      provider: 'guest',
      createdAt: Date.now(),
      lastLoginAt: Date.now()
    };
    setUser(guestUser);
    return guestUser;
  };

  const signOut = () => {
    // Switch to guest or null
    setUser(null);
  };

  const updateProfile = (updates: Partial<UserProfile>) => {
    if (!user) return;
    setUser({ ...user, ...updates });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user && !user.isGuest,
        isGuest: !user || user.isGuest,
        signInWithGoogle,
        continueAsGuest,
        signOut,
        updateProfile,
        isAuthModalOpen,
        setIsAuthModalOpen
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
