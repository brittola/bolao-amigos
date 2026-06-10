import { useEffect, useState } from "react";
import { api, errorMessage } from "../api/client.js";
import styles from "./Admin.module.css";

export default function Admin() {
  return (
    <div className="container wide">
      <header className={styles.pageHead}>
        <span className="eyebrow">Organização</span>
        <h1 className={styles.title}>Admin</h1>
      </header>

      <div className={styles.sections}>
        <InvitesSection />
        <SyncSection />
        <BonusResultSection />
        <ScoreFixSection />
      </div>
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <section className={styles.section}>
      <header className={styles.secHead}>
        <h2 className={styles.secTitle}>{title}</h2>
        {hint && <p className={styles.secHint}>{hint}</p>}
      </header>
      {children}
    </section>
  );
}

function InvitesSection() {
  const [code, setCode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const link = code ? `${location.origin}/cadastro?convite=${code}` : "";

  async function generate() {
    setBusy(true);
    setCopied(false);
    try {
      const { data } = await api.post("/admin/invites", {});
      setCode(data.code);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Section title="Convites" hint="Gere um link para um amigo entrar no bolão.">
      <button className="btn primary" onClick={generate} disabled={busy}>
        {busy ? "Gerando..." : "Gerar convite"}
      </button>
      {code && (
        <div className={styles.invite}>
          <code className={styles.code}>{link}</code>
          <button className="btn ghost" onClick={copy}>
            {copied ? "Copiado ✓" : "Copiar"}
          </button>
        </div>
      )}
    </Section>
  );
}

function SyncSection() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function sync() {
    setBusy(true);
    setResult(null);
    try {
      const { data } = await api.post("/admin/sync", {});
      setResult({
        type: "ok",
        msg: `${data.synced} jogos sincronizados${data.date ? ` em ${data.date}` : " (hoje + amanhã)"}.`,
      });
    } catch (err) {
      setResult({ type: "error", msg: errorMessage(err, "Falha ao sincronizar.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Sincronizar jogos" hint="Busca os jogos na API-Football. Consome requests do limite diário.">
      <div className={styles.inline}>
        <button className="btn" onClick={sync} disabled={busy}>
          {busy ? "..." : "Buscar hoje + amanhã"}
        </button>
      </div>
      {result && (
        <div className={`notice ${result.type === "ok" ? "ok" : "error"}`} style={{ marginTop: "0.75rem" }}>
          {result.msg}
        </div>
      )}
    </Section>
  );
}

function BonusResultSection() {
  const [values, setValues] = useState({ champion: "", top_scorer: "" });
  const [feedback, setFeedback] = useState(null);

  async function save(type) {
    setFeedback(null);
    try {
      await api.put("/admin/bonus-results", { type, value: values[type].trim() });
      setFeedback({ type: "ok", msg: `Resultado de ${type === "champion" ? "campeão" : "artilheiro"} salvo e pontos recalculados.` });
    } catch (err) {
      setFeedback({ type: "error", msg: errorMessage(err) });
    }
  }

  const fields = [
    { type: "champion", label: "Campeão" },
    { type: "top_scorer", label: "Artilheiro" },
  ];

  return (
    <Section title="Resultado dos bônus" hint="Os palpites bônus travam sozinhos no início da Copa. Aqui você define o resultado real (campeão/artilheiro) para recalcular a pontuação.">
      {feedback && (
        <div className={`notice ${feedback.type === "ok" ? "ok" : "error"}`} style={{ marginBottom: "0.75rem" }}>
          {feedback.msg}
        </div>
      )}
      {fields.map((f) => (
        <div key={f.type} className={styles.inline}>
          <div className="field" style={{ margin: 0, flex: 1 }}>
            <label htmlFor={`r-${f.type}`}>{f.label}</label>
            <input
              id={`r-${f.type}`}
              className="input"
              value={values[f.type]}
              onChange={(e) => setValues((v) => ({ ...v, [f.type]: e.target.value }))}
            />
          </div>
          <button className="btn" onClick={() => save(f.type)} disabled={!values[f.type].trim()}>
            Salvar
          </button>
        </div>
      ))}
    </Section>
  );
}

function ScoreFixSection() {
  const [matches, setMatches] = useState([]);
  const [feedback, setFeedback] = useState(null);

  async function load() {
    const { data } = await api.get("/matches");
    setMatches(data);
  }
  useEffect(() => {
    load();
  }, []);

  async function fix(matchId, home, away) {
    setFeedback(null);
    try {
      await api.patch(`/admin/matches/${matchId}/score`, { home_score: home, away_score: away });
      setFeedback({ type: "ok", msg: "Placar corrigido e pontos recalculados." });
      load();
    } catch (err) {
      setFeedback({ type: "error", msg: errorMessage(err) });
    }
  }

  return (
    <Section title="Corrigir placar" hint="Ajuste manual do resultado final (sobrepõe a API).">
      {feedback && (
        <div className={`notice ${feedback.type === "ok" ? "ok" : "error"}`} style={{ marginBottom: "0.75rem" }}>
          {feedback.msg}
        </div>
      )}
      {matches.length === 0 ? (
        <p className={styles.secHint}>Nenhum jogo na janela atual.</p>
      ) : (
        <ul className={styles.fixList}>
          {matches.map((m) => (
            <ScoreFixRow key={m.id} match={m} onFix={fix} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function ScoreFixRow({ match, onFix }) {
  const [home, setHome] = useState(match.home_score ?? 0);
  const [away, setAway] = useState(match.away_score ?? 0);

  return (
    <li className={styles.fixRow}>
      <span className={styles.fixTeams}>
        {match.home_team?.name || "A definir"} <span className={styles.vs}>x</span>{" "}
        {match.away_team?.name || "A definir"}
        {match.score_source === "manual" && <span className={styles.manualTag}>manual</span>}
      </span>
      <div className={styles.fixControls}>
        <input
          type="number"
          min="0"
          className={`input ${styles.num}`}
          value={home}
          onChange={(e) => setHome(Number(e.target.value))}
        />
        <span className={styles.colon}>:</span>
        <input
          type="number"
          min="0"
          className={`input ${styles.num}`}
          value={away}
          onChange={(e) => setAway(Number(e.target.value))}
        />
        <button className="btn ghost" onClick={() => onFix(match.id, home, away)}>
          Aplicar
        </button>
      </div>
    </li>
  );
}
