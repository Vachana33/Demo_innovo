import { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import styles from "./Layout.module.css";
import logo from "../../assets/innovo-logo.png";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, userEmail } = useAuth();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const navItems = [
    { path: "/dashboard", label: "Dashboard", icon: "📊" },
    { path: "/funding-programs", label: "Funding Programs", icon: "💼" },
    { path: "/companies", label: "Companies", icon: "🏢" },
    { path: "/documents", label: "Documents", icon: "📄" },
    { path: "/templates", label: "Templates", icon: "📋" },
  ];

  const isActive = (path: string) => {
    if (path === "/dashboard") {
      return location.pathname === "/dashboard";
    }
    return location.pathname.startsWith(path);
  };

  // Get user initials for avatar
  const getUserInitials = () => {
    if (userEmail) {
      return userEmail.charAt(0).toUpperCase();
    }
    return "U";
  };

  // Truncate email for display
  const truncateEmail = (email: string, maxLength: number = 25) => {
    if (email.length <= maxLength) return email;
    return email.substring(0, maxLength - 3) + "...";
  };

  return (
    <div className={styles.container}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        {/* Logo and App Name */}
        <div className={styles.logoSection}>
          <img src={logo} alt="Innovo Logo" className={styles.logo} />
          <h1 className={styles.appName}>Innovo Agent</h1>
        </div>

        {/* Navigation Items */}
        <nav className={styles.nav}>
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`${styles.navItem} ${
                isActive(item.path) ? styles.navItemActive : ""
              }`}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* User Profile Section */}
        <div className={styles.userSection}>
          <div className={styles.userAvatar}>{getUserInitials()}</div>
          <div className={styles.userInfo}>
            <div className={styles.userName}>User</div>
            <div className={styles.userEmail}>
              {userEmail ? truncateEmail(userEmail) : "user@example.com"}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className={styles.logoutButton}
            title="Log out"
          >
            →
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={styles.mainContent}>{children}</main>
    </div>
  );
}
