import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { errorMessage } from "../api/client.js";
import styles from "./Auth.module.css";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate("/");
    } catch (err) {
      setError(errorMessage(err, "Não foi possível entrar."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.panel}>
        <div className={styles.head}>
          <span className={styles.logo}>
            <span className={styles.dot} aria-hidden="true" />
            BOLÃO<span className={styles.logoDim}>/AMIGOS</span>
          </span>
          <p className={styles.tagline}>Palpita, soma ponto, ganha a zoeira.</p>
        </div>

        <form className={styles.card} onSubmit={handleSubmit} noValidate>
          <h1 className={styles.title}>Entrar</h1>

          {error && <div className="notice error spacer">{error}</div>}

          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="senha">Senha</label>
            <input
              id="senha"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button className="btn primary block" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className={styles.foot}>
          Tem um convite? <Link to="/cadastro">Criar conta</Link>
        </p>
      </div>
    </div>
  );
}
