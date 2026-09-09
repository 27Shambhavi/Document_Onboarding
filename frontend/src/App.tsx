import React, { createContext, useContext, useEffect, useState, Component } from 'react';
import type { ErrorInfo } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';

import DashboardLayout from './layouts/DashboardLayout';
import AdminShell from './layouts/AdminShell';

import HomeDashboard from './pages/HomeDashboard';
import ConfigHub from './pages/ConfigHub';
import AuditEngine from './pages/AuditEngine';
import Billing from './pages/Billing';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import { HRRankingDashboard } from './pages/HRRankingDashboard';

import { api, type UserSession } from './api/client';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { ChatbotWidget } from './components/ChatbotWidget';

// ==========================================
// CRASH-PREVENTION ERROR BOUNDARY
// ==========================================

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('DocVerify App Crash caught by ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold">Component Error Caught</h3>
            <p className="text-xs text-slate-400">
              {this.state.error?.message || 'An unexpected rendering error occurred.'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = '/dashboard';
              }}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Return to Dashboard</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ==========================================
// THEME CONTEXT & PROVIDER
// ==========================================

export type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  theme: ThemeMode;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
  isDark: true,
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('docverify_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('docverify_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
};

// ==========================================
// AUTHENTICATION CONTEXT & PROTECTED GUARD
// ==========================================

interface AuthContextType {
  user: UserSession | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { company_id: string; company_name: string; email: string; password: string; invite_token: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  login: async () => {},
  register: async () => {},
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(() => {
    const savedUser = localStorage.getItem('docverify_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const login = async (email: string, password: string) => {
    const session = await api.loginCompany(email, password);
    setUser(session);
    localStorage.setItem('docverify_token', session.access_token);
    localStorage.setItem('docverify_user', JSON.stringify(session));
  };

  const register = async (data: { company_id: string; company_name: string; email: string; password: string; invite_token: string }) => {
    const session = await api.onboardCompany(data);
    setUser(session);
    localStorage.setItem('docverify_token', session.access_token);
    localStorage.setItem('docverify_user', JSON.stringify(session));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('docverify_token');
    localStorage.removeItem('docverify_user');
    localStorage.removeItem('docverify_admin_token');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Protected Route Guard Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

// ==========================================
// MAIN APP ROUTING & LAYOUT WRAPPER
// ==========================================

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* PUBLIC AUTH ROUTE */}
              <Route path="/login" element={<LoginPage />} />

              {/* ADMIN PORTAL ROUTES */}
              <Route
                element={
                  <ProtectedRoute>
                    <AdminShell />
                  </ProtectedRoute>
                }
              >
                <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
              </Route>

              {/* PROTECTED CLIENT DASHBOARD ROUTES */}
              <Route
                element={
                  <ProtectedRoute>
                    <DashboardLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<HomeDashboard />} />
                <Route path="/hr-ranking" element={<HRRankingDashboard />} />
                <Route path="/config" element={<ConfigHub />} />
                <Route path="/audit" element={<AuditEngine />} />
                <Route path="/billing" element={<Billing />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Routes>
            <ChatbotWidget />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
