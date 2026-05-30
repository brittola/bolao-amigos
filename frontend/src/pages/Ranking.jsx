import { useEffect, useState } from "react";
import { api, errorMessage } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import styles from "./Ranking.module.css";

export default function Ranking() {
  const { user } = useAuth();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/ranking")
      .then(({ data }) => setRows(data))
      .catch((err) => setError(errorMessage(err, "Não foi possível carregar o ranking.")));
  }, []);

  if (error) {
    return (
      <div className="container">
        <div className="notice error">{error}</div>
      </div>
    );
  }

  return (
    <div className="container">
      <header className={styles.pageHead}>
        <span className="eyebrow">Classificação</span>
        <h1 className={styles.title}>Ranking</h1>
      </header>

      {!rows ? (
        <div className={styles.skel} aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={styles.skelRow} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className={styles.empty}>Ainda não há jogadores pontuando.</p>
      ) : (
        <ol className={styles.board}>
          {rows.map((r, i) => {
            const me = r.user_id === user?.id;
            return (
              <li
                key={r.user_id}
                className={`${styles.row} ${i < 3 ? styles.podium : ""} ${me ? styles.me : ""}`}
              >
                <span className={`${styles.pos} mono`}>{i + 1}</span>
                <span className={styles.name}>
                  {r.name}
                  {me && <span className={styles.youTag}>você</span>}
                </span>
                <span className={styles.detail}>
                  <span className={`${styles.exact} mono`} title="placares exatos">
                    {r.exact_count}✓
                  </span>
                  <span className={`${styles.points} mono`}>{r.points}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <p className={styles.legend}>
        <span className="mono">n✓</span> placares exatos · <span className="mono">pts</span> pontuação total
      </p>
    </div>
  );
}
