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
  userEmail: string | null;
  login: (token: string, email?: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_STORAGE_KEY = "innovo_auth_token";
const USER_EMAIL_KEY = "innovo_user_email";

// Helper to decode JWT and extract email
function decodeJWT(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload));
    return decoded.email || decoded.sub || null;
  } catch {
    return null;
  }
}

// Initialize state from localStorage (runs once on module load)
const getInitialToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_STORAGE_KEY);
};

const getInitialEmail = (): string | null => {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(USER_EMAIL_KEY);
  if (stored) return stored;
  // Try to decode from token if email not stored
  const token = getInitialToken();
  if (token) {
    return decodeJWT(token);
  }
  return null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(getInitialToken);
  const [userEmail, setUserEmail] = useState<string | null>(getInitialEmail);
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const storedToken = getInitialToken();
    return storedToken !== null;
  });

  const login = (newToken: string, email?: string) => {
    // Store token in localStorage
    // Security: In production, consider httpOnly cookies for better security
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setToken(newToken);
    setIsAuthenticated(true);
    
    // Extract email from token or use provided email
    const extractedEmail = email || decodeJWT(newToken);
    if (extractedEmail) {
      localStorage.setItem(USER_EMAIL_KEY, extractedEmail);
      setUserEmail(extractedEmail);
    }
  };

  const logout = () => {
    // Clear token and email from storage and state
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_EMAIL_KEY);
    setToken(null);
    setUserEmail(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ token, isAuthenticated, userEmail, login, logout }}>
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





