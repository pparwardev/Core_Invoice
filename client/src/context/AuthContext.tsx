import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../api/client';

interface User {
  id: number;
  user_id: string;
  name: string;
  email: string;
  phone?: string;
  designation?: string;
  company_name?: string;
  role?: string;
  permissions?: Array<{ module: string; can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }>;
}

interface RegisterData {
  user_id: string;
  name: string;
  email: string;
  password: string;
  phone?: string;
  designation?: string;
  company_name?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (userId: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  updateProfile: (data: Partial<User>) => Promise<void>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token) {
      api.get('/auth/me')
        .then((res) => setUser(res.data))
        .catch(() => {
          localStorage.removeItem('token');
          setToken(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const login = async (userId: string, password: string) => {
    const res = await api.post('/auth/login', { user_id: userId, password });
    const { token: newToken, user: userData } = res.data;
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(userData);
  };

  const register = async (data: RegisterData) => {
    await api.post('/auth/register', data);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const updateProfile = async (data: Partial<User>) => {
    const res = await api.put('/auth/profile', data);
    setUser(res.data);
  };

  const updatePassword = async (currentPassword: string, newPassword: string) => {
    await api.put('/auth/password', { current_password: currentPassword, new_password: newPassword });
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, updateProfile, updatePassword, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
