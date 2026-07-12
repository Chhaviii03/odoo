import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setTokens, getAccessToken } from './api';
import { disconnectSocket } from './socket';
import type { Role, User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  can: (roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadMe() {
    if (!getAccessToken()) {
      setLoading(false);
      return;
    }
    try {
      const me = await api<User>('/auth/me');
      setUser(me);
    } catch {
      setTokens(null, null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  async function handleAuth(result: { user: User; accessToken: string; refreshToken: string }) {
    setTokens(result.accessToken, result.refreshToken);
    setUser(result.user);
  }

  const value: AuthState = {
    user,
    loading,
    async login(email, password) {
      const result = await api('/auth/login', { method: 'POST', body: { email, password } });
      await handleAuth(result);
    },
    async signup(name, email, password) {
      const result = await api('/auth/signup', { method: 'POST', body: { name, email, password } });
      await handleAuth(result);
    },
    logout() {
      disconnectSocket();
      setTokens(null, null);
      setUser(null);
    },
    async refreshUser() {
      await loadMe();
    },
    can(roles) {
      return !!user && roles.includes(user.role);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
