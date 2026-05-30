import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import styles from "./Layout.module.css";

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const tabClass = ({ isActive }) =>
    isActive ? `${styles.tab} ${styles.active}` : styles.tab;

  return (
    <div className="app-shell">
      <header className={styles.bar}>
        <div className={styles.barInner}>
          <NavLink to="/" className={styles.brand} aria-label="Bolão dos Amigos">
            <span className={styles.dot} aria-hidden="true" />
            BOLÃO<span className={styles.brandDim}>/AMIGOS</span>
          </NavLink>

          <nav className={styles.nav}>
            <NavLink to="/" end className={tabClass}>
              Jogos
            </NavLink>
            <NavLink to="/ranking" className={tabClass}>
              Ranking
            </NavLink>
            {user?.role === "admin" && (
              <NavLink to="/admin" className={tabClass}>
                Admin
              </NavLink>
            )}
          </nav>

          <button className={styles.user} onClick={handleLogout} title="Sair">
            <span className={styles.userName}>{user?.name?.split(" ")[0]}</span>
            <span className={styles.logout}>sair</span>
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
