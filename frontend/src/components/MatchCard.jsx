import { useState } from "react";
import moment from "moment";
import ScoreStepper from "./ScoreStepper.jsx";
import styles from "./MatchCard.module.css";

const FINAL = ["FT", "AET", "PEN"];

function teamLabel(team) {
  return team?.name || "A definir";
}

function StatusBadge({ locked, status }) {
  if (!locked) return <span className="badge open">Aberto</span>;
  if (FINAL.includes(status)) return <span className="badge done">Encerrado</span>;
  return <span className="badge live">Ao vivo</span>;
}

export default function MatchCard({ match, onSave }) {
  const { locked, home_team, away_team, my_prediction } = match;
  const isFinal = FINAL.includes(match.status);
  const hasScore = match.home_score != null && match.away_score != null;

  const [home, setHome] = useState(my_prediction?.home_score ?? 0);
  const [away, setAway] = useState(my_prediction?.away_score ?? 0);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState("");

  const time = moment(match.kickoff_at).format("HH:mm");

  async function save() {
    setSaving(true);
    setError("");
    try {
      await onSave(match.id, home, away);
      setSavedAt(moment().valueOf());
      setTimeout(() => setSavedAt(null), 2200);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className={styles.card}>
      <header className={styles.head}>
        <span className="eyebrow">
          {match.round || "Jogo"} · {time}
        </span>
        <StatusBadge locked={locked} status={match.status} />
      </header>

      {/* Linhas de time */}
      <div className={styles.rows}>
        <TeamRow
          name={teamLabel(home_team)}
          logo={home_team?.logo_url}
          locked={locked}
          score={hasScore ? match.home_score : null}
          value={home}
          onChange={setHome}
        />
        <TeamRow
          name={teamLabel(away_team)}
          logo={away_team?.logo_url}
          locked={locked}
          score={hasScore ? match.away_score : null}
          value={away}
          onChange={setAway}
        />
      </div>

      {/* Estado: aberto → formulário; travado → resultados */}
      {!locked ? (
        <footer className={styles.foot}>
          <span className={styles.hint}>Encerra no apito inicial</span>
          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? "Salvando..." : savedAt ? "Salvo ✓" : my_prediction ? "Atualizar" : "Salvar palpite"}
          </button>
        </footer>
      ) : (
        <LockedDetails match={match} />
      )}

      {error && <div className="notice error" style={{ marginTop: "0.75rem" }}>{error}</div>}
      {!locked && !isFinal && my_prediction && (
        <p className={styles.youHave}>
          Seu palpite atual: <b className="mono">{my_prediction.home_score}–{my_prediction.away_score}</b>
        </p>
      )}
    </article>
  );
}

function TeamRow({ name, logo, locked, score, value, onChange }) {
  return (
    <div className={styles.teamRow}>
      <span className={styles.team}>
        {logo ? <img src={logo} alt="" className={styles.logo} /> : <span className={styles.logoFallback} aria-hidden="true" />}
        <span className={styles.teamName}>{name}</span>
      </span>
      {locked ? (
        <span className={`${styles.finalScore} mono`}>{score ?? "–"}</span>
      ) : (
        <ScoreStepper value={value} onChange={onChange} label={name} />
      )}
    </div>
  );
}

function LockedDetails({ match }) {
  const list = match.predictions || [];
  return (
    <div className={styles.locked}>
      <div className={styles.divider} />
      {match.my_prediction && (
        <p className={styles.youHave}>
          Seu palpite: <b className="mono">{match.my_prediction.home_score}–{match.my_prediction.away_score}</b>
          {match.my_prediction.points != null && (
            <span className={styles.pts}> +{match.my_prediction.points} pts</span>
          )}
        </p>
      )}
      {list.length > 0 ? (
        <ul className={styles.preds}>
          {list
            .slice()
            .sort((a, b) => (b.points ?? -1) - (a.points ?? -1))
            .map((p) => (
              <li key={p.user_id} className={styles.predRow}>
                <span className={styles.predName}>{p.user_name}</span>
                <span className={`${styles.predScore} mono`}>
                  {p.home_score}–{p.away_score}
                </span>
                <span className={`${styles.predPts} mono ${p.points > 0 ? styles.win : ""}`}>
                  {p.points == null ? "—" : `+${p.points}`}
                </span>
              </li>
            ))}
        </ul>
      ) : (
        <p className={styles.hint}>Ninguém palpitou neste jogo.</p>
      )}
    </div>
  );
}
