import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export interface UserProfile {
  employee_id: number;
  name: string;
  kgid: string;
  dob: string | null;
  appointment_date: string | null;
  physically_challenged: boolean;
  gender_id: number | null;
  district_id: number;
  unit_id: number;
  rank_id: number | null;
  designation_id: number | null;
  district_name: string;
  unit_name: string;
  rank_name: string;
  designation_name: string;
  role: string;
}

interface AuthState {
  token: string | null;
  profile: UserProfile | null;
  isAuthenticated: boolean;
  login: (token: string, profile: UserProfile) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({
  token: null,
  profile: null,
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('trinetra_token');
  });
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const stored = localStorage.getItem('trinetra_profile');
    return stored ? JSON.parse(stored) : null;
  });

  const isAuthenticated = !!token && !!profile;

  const login = (newToken: string, newProfile: UserProfile) => {
    setToken(newToken);
    setProfile(newProfile);
    localStorage.setItem('trinetra_token', newToken);
    localStorage.setItem('trinetra_profile', JSON.stringify(newProfile));
  };

  const logout = () => {
    setToken(null);
    setProfile(null);
    localStorage.removeItem('trinetra_token');
    localStorage.removeItem('trinetra_profile');
  };

  return (
    <AuthContext.Provider value={{ token, profile, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
