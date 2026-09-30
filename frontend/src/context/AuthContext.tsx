import React, { createContext, useContext, useEffect, useState } from 'react';
import type { AuthState } from '../types';
import { api } from '../services/api';

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem('codespace_token'),
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('codespace_token');
      if (!storedToken) {
        setAuthState(prev => ({ ...prev, isLoading: false }));
        return;
      }
      try {
        const user = await api.getMe(storedToken);
        setAuthState({
          user,
          token: storedToken,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch {
        localStorage.removeItem('codespace_token');
        setAuthState({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    };
    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const data = await api.login(email, password);
    localStorage.setItem('codespace_token', data.access_token);
    setAuthState({
      user: data.user,
      token: data.access_token,
      isAuthenticated: true,
      isLoading: false,
    });
  };

  const register = async (name: string, email: string, password: string) => {
    const data = await api.register(name, email, password);
    localStorage.setItem('codespace_token', data.access_token);
    setAuthState({
      user: data.user,
      token: data.access_token,
      isAuthenticated: true,
      isLoading: false,
    });
  };

  const logout = () => {
    localStorage.removeItem('codespace_token');
    setAuthState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  };

  return (
    <AuthContext.Provider value={{ ...authState, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
