import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { errorMessage } from "../api/client.js";
import styles from "./Auth.module.css";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    code: params.get("convite") || "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        code: form.code.trim(),
      });
      navigate("/");
    } catch (err) {
      setError(errorMessage(err, "Não foi possível criar a conta."));
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
          <p className={styles.tagline}>Entrou no grupo? Garante sua vaga.</p>
        </div>

        <form className={styles.card} onSubmit={handleSubmit} noValidate>
          <h1 className={styles.title}>Criar conta</h1>

          {error && <div className="notice error spacer">{error}</div>}

          <div className="field">
            <label htmlFor="code">Código do convite</label>
            <input
              id="code"
              className="input mono"
              value={form.code}
              onChange={update("code")}
              placeholder="ex: 9f3a2b1c4d5e"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="name">Seu nome</label>
            <input id="name" className="input" value={form.name} onChange={update("name")} required />
          </div>

          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={update("email")}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={update("password")}
              required
            />
          </div>

          <button className="btn primary block" disabled={loading}>
            {loading ? "Criando..." : "Criar conta"}
          </button>
        </form>

        <p className={styles.foot}>
          Já tem conta? <Link to="/login">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
