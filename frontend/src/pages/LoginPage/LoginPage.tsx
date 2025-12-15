import { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./LoginPage.module.css";

import logo from "../../assets/innovo-logo.png";
import bgImage from "../../assets/login-bg.jpg";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function isValidEmail(email: string): boolean {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!pattern.test(email)) return false;
  return (
    email.endsWith("@innovo-consulting.de") ||
    email.endsWith("@gmail.com")
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Client-side validation
    if (!isValidEmail(email)) {
      setError(
        "Email must end with @innovo-consulting.de or @gmail.com"
      );
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setIsLoading(true);

    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.toLowerCase(),
          password: password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // FastAPI returns errors in 'detail' field
        const errorMessage = data.detail || data.message || "An error occurred. Please try again.";
        
        // Handle error responses
        if (response.status === 409 || response.status === 400) {
          setError(errorMessage);
        } else if (response.status === 404) {
          setError(errorMessage);
        } else if (response.status === 401) {
          setError(errorMessage);
        } else {
          setError(errorMessage);
        }
        setIsLoading(false);
        return;
      }

      // Handle success based on mode
      if (data.success) {
        if (mode === "login") {
          // Login successful - navigate to projects
          navigate("/projects");
        } else {
          // Registration successful - show message, clear ALL fields, switch to login
          setSuccess("Account created successfully. Please log in with your credentials.");
          setEmail(""); // Clear email field
          setPassword(""); // Clear password field
          setMode("login"); // Switch to login mode
          setIsLoading(false);
        }
      } else {
        setError(data.message || "An error occurred. Please try again.");
        setIsLoading(false);
      }
    } catch (err) {
      // Network error or other exception
      setError(
        "Network error. Please check if the backend server is running."
      );
      setIsLoading(false);
    }
  }

  return (
    <div
      className={styles.container}
      style={{ backgroundImage: `url(${bgImage})` }}
    >
      <img src={logo} alt="Innovo Logo" className={styles.logo} />

      <div className={styles.box}>
        <h1 className={styles.title}>Innovo Agent Login</h1>
        <p className={styles.subtitle}>
          Internal workspace for funding projects.
        </p>

        {/* Mode toggle */}
        <div className={styles.modeSwitch}>
          <button
            className={mode === "login" ? styles.activeTab : styles.inactiveTab}
            onClick={() => {
              setMode("login");
              setError(null);
              setSuccess(null);
            }}
          >
            Login
          </button>
          <button
            className={mode === "signup" ? styles.activeTab : styles.inactiveTab}
            onClick={() => {
              setMode("signup");
              setError(null);
              setSuccess(null);
            }}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className={styles.label}>Email</label>
          <input
            className={styles.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@innovo-consulting.de"
          />

          <label className={styles.label}>Password</label>
          <input
            className={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />

          {error && <p className={styles.error}>{error}</p>}
          {success && <p className={styles.success}>{success}</p>}

          <button 
            className={styles.submit} 
            type="submit"
            disabled={isLoading}
          >
            {isLoading 
              ? "Processing..." 
              : mode === "login" 
                ? "Login" 
                : "Create Account"
            }
          </button>
        </form>

        <p className={styles.note}>
          Only @innovo-consulting.de or @gmail.com emails are allowed.
        </p>
      </div>
    </div>
  );
}
