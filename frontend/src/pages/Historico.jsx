import { useEffect, useState } from "react";
import { api, errorMessage } from "../api/client.js";
import MatchCard from "../components/MatchCard.jsx";
import { dayBucket } from "../lib/day.js";
import styles from "./Matches.module.css";

export default function Historico() {
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const { data } = await api.get("/matches/history");
      setMatches(data);
    } catch (err) {
      setError(errorMessage(err, "Não foi possível carregar o histórico."));
    }
  }

  useEffect(() => {
    load();
  }, []);

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

  // O backend já devolve as partidas em ordem decrescente de kickoff; basta
  // preservar essa ordem ao agrupar por dia.
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
        <span className="eyebrow">Seus palpites</span>
        <h1 className={styles.title}>Histórico</h1>
      </header>

      {matches.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Nenhuma partida encerrada ainda.</p>
          <p className={styles.emptyText}>
            Quando os jogos terminarem, eles aparecem aqui com o seu palpite e os pontos.
          </p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.label} className={styles.group}>
            <h2 className={styles.groupLabel}>{g.label}</h2>
            <div className={styles.list}>
              {g.items.map((m) => (
                <MatchCard key={m.id} match={m} variant="history" />
              ))}
            </div>
          </section>
        ))
      )}
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
