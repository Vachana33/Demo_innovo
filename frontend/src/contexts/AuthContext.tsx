/**
 * Authentication Context for managing user authentication state.
 * 
 * Security considerations:
 * - JWT token is stored in localStorage (not httpOnly cookies, but acceptable for SPA)
 * - Token is cleared on logout
 * - Token expiration is checked on each API call
 * - Auth state is checked on app initialization
 */
import { createContext, useContext, useState, type ReactNode } from "react";

interface AuthContextType {
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_STORAGE_KEY = "innovo_auth_token";

// Initialize state from localStorage (runs once on module load)
const getInitialToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(getInitialToken);
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const storedToken = getInitialToken();
    return storedToken !== null;
  });

  const login = (newToken: string) => {
    // Store token in localStorage
    // Security: In production, consider httpOnly cookies for better security
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setToken(newToken);
    setIsAuthenticated(true);
  };

  const logout = () => {
    // Clear token from storage and state
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ token, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}





