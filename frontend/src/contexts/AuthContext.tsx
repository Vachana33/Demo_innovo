import { createContext, useState, useContext, type ReactNode } from "react";
import {
  TOKEN_STORAGE_KEY,
  USER_EMAIL_KEY,
  decodeJWT,
} from "../utils/authUtils";

interface AuthContextType {
  token: string | null;
  isAuthenticated: boolean;
  userEmail: string | null;
  login: (token: string, email?: string) => void;
  logout: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem(TOKEN_STORAGE_KEY)
  );
  const [userEmail, setUserEmail] = useState<string | null>(
    localStorage.getItem(USER_EMAIL_KEY)
  );

  const isAuthenticated = Boolean(token);

  const login = (newToken: string, email?: string) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setToken(newToken);

    const extractedEmail = email || decodeJWT(newToken);
    if (extractedEmail) {
      localStorage.setItem(USER_EMAIL_KEY, extractedEmail);
      setUserEmail(extractedEmail);
    }
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_EMAIL_KEY);
    setToken(null);
    setUserEmail(null);
  };

  return (
    <AuthContext.Provider
      value={{ token, isAuthenticated, userEmail, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AuthContext.tsx:useAuth:ENTRY',message:'useAuth hook called',data:{},hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  const context = useContext(AuthContext);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AuthContext.tsx:useAuth:CONTEXT_CHECK',message:'Context check result',data:{isUndefined:context===undefined,hasToken:!!context?.token,hasUserEmail:!!context?.userEmail},hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  if (context === undefined) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AuthContext.tsx:useAuth:ERROR',message:'useAuth called outside AuthProvider',data:{},hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    throw new Error("useAuth must be used within an AuthProvider");
  }
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/b9f8d913-3377-4ae3-a275-a5c009f021ec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AuthContext.tsx:useAuth:SUCCESS',message:'useAuth returning context',data:{isAuthenticated:context.isAuthenticated,hasUserEmail:!!context.userEmail},hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  return context;
}
