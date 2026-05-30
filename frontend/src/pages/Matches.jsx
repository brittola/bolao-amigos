import { useEffect, useState } from "react";
import moment from "moment";
import { api, errorMessage } from "../api/client.js";
import MatchCard from "../components/MatchCard.jsx";
import BonusPanel from "../components/BonusPanel.jsx";
import styles from "./Matches.module.css";

function dayBucket(kickoff) {
  const d = moment(kickoff);
  if (d.isSame(moment(), "day")) return "Hoje";
  if (d.isSame(moment().add(1, "day"), "day")) return "Amanhã";
  return d.format("dddd, DD [de] MMM");
}

export default function Matches() {
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const { data } = await api.get("/matches");
      setMatches(data);
    } catch (err) {
      setError(errorMessage(err, "Não foi possível carregar os jogos."));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(matchId, home, away) {
    try {
      await api.post("/predictions", { match_id: matchId, home_score: home, away_score: away });
      setMatches((prev) =>
        prev.map((m) =>
          m.id === matchId ? { ...m, my_prediction: { home_score: home, away_score: away, points: null } } : m
        )
      );
    } catch (err) {
      throw errorMessage(err, "Não foi possível salvar o palpite.");
    }
  }

  if (error) {
    return (
      <div className="container">
        <div className="notice error">{error}</div>
      </div>
    );
  }

  if (!matches) {
    return (
      <div className="container">
        <Skeleton />
      </div>
    );
  }

  const groups = [];
  for (const m of matches) {
    const label = dayBucket(m.kickoff_at);
    let g = groups.find((x) => x.label === label);
    if (!g) groups.push((g = { label, items: [] }));
    g.items.push(m);
  }

  return (
    <div className="container">
      <header className={styles.pageHead}>
        <span className="eyebrow">Rodada</span>
        <h1 className={styles.title}>Jogos</h1>
      </header>

      {matches.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Nenhum jogo por enquanto.</p>
          <p className={styles.emptyText}>
            Cada jogo aparece aqui um dia antes de acontecer, com os palpites abertos até o apito inicial.
          </p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.label} className={styles.group}>
            <h2 className={styles.groupLabel}>{g.label}</h2>
            <div className={styles.list}>
              {g.items.map((m) => (
                <MatchCard key={m.id} match={m} onSave={handleSave} />
              ))}
            </div>
          </section>
        ))
      )}

      <div className={styles.bonus}>
        <BonusPanel />
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className={styles.skeletonWrap} aria-hidden="true">
      <div className={styles.skelTitle} />
      {[0, 1, 2].map((i) => (
        <div key={i} className={styles.skelCard} />
      ))}
    </div>
  );
}
