import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

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
  // One-shot flag: armed by every successful login, disarmed on logout and
  // consumed by the Voice Copilot's first-login introduction so it shows
  // exactly once per authenticated session (never on refresh/route change).
  introEligible: boolean;
  login: (token: string, profile: UserProfile) => void;
  logout: () => void;
  consumeIntro: () => void;
}

const AuthContext = createContext<AuthState>({
  token: null,
  profile: null,
  isAuthenticated: false,
  introEligible: false,
  login: () => {},
  logout: () => {},
  consumeIntro: () => {},
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
  // False on page load (a refresh/restored session is NOT a fresh login), so
  // the intro only arms when login() runs.
  const [introEligible, setIntroEligible] = useState(false);

  const isAuthenticated = !!token && !!profile;

  const login = (newToken: string, newProfile: UserProfile) => {
    setToken(newToken);
    setProfile(newProfile);
    localStorage.setItem('trinetra_token', newToken);
    localStorage.setItem('trinetra_profile', JSON.stringify(newProfile));
    setIntroEligible(true);
  };

  const logout = () => {
    setToken(null);
    setProfile(null);
    localStorage.removeItem('trinetra_token');
    localStorage.removeItem('trinetra_profile');
    setIntroEligible(false);
  };

  const consumeIntro = useCallback(() => {
    setIntroEligible(false);
  }, []);

  return (
    <AuthContext.Provider value={{ token, profile, isAuthenticated, introEligible, login, logout, consumeIntro }}>
      {children}
    </AuthContext.Provider>
  );
}
