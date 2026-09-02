import React, { createContext, useContext, useState, useEffect } from 'react';

interface UserMetadata {
  id?: string;
  name?: string;
  email?: string;
}

interface AuthContextType {
  user: UserMetadata | null;
  role: 'admin' | 'company' | null;
  token: string | null;
  login: (token: string, role: 'admin' | 'company', userMeta: UserMetadata) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserMetadata | null>(null);
  const [role, setRole] = useState<'admin' | 'company' | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Restore session from localStorage on initialization
    const storedToken = localStorage.getItem('token');
    const storedRole = localStorage.getItem('role') as 'admin' | 'company' | null;
    const storedUser = localStorage.getItem('user');

    if (storedToken && storedRole) {
      setToken(storedToken);
      setRole(storedRole);
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (e) {
          setUser(null);
        }
      }
    }
    setIsLoading(false);
  }, []);

  const login = (newToken: string, newRole: 'admin' | 'company', userMeta: UserMetadata) => {
    setToken(newToken);
    setRole(newRole);
    setUser(userMeta);
    localStorage.setItem('token', newToken);
    localStorage.setItem('role', newRole);
    localStorage.setItem('user', JSON.stringify(userMeta));
  };

  const logout = () => {
    setToken(null);
    setRole(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('user');
  };

  const isAuthenticated = !!token;

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        token,
        login,
        logout,
        isAuthenticated,
        isLoading,
      }}
    >
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
