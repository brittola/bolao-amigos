import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import styles from "./ScoringPanel.module.css";

export default function ScoringPanel() {
  const [rules, setRules] = useState(null);

  useEffect(() => {
    api
      .get("/rules")
      .then(({ data }) => setRules(data))
      .catch(() => {}); // informativo complementar: em erro, não renderiza
  }, []);

  if (!rules) return null;

  const tiers = [
    { label: "Cravada (placar exato)", pts: rules.exactScore },
    { label: "Vencedor + saldo de gols", pts: rules.goalDifference },
    { label: "Resultado (vencedor/empate)", pts: rules.correctWinner },
  ];
  const bonus = [
    { label: "Campeão", pts: rules.bonusChampion },
    { label: "Artilheiro", pts: rules.bonusTopScorer },
  ];

  return (
    <section className={styles.panel} aria-label="Como funciona a pontuação">
      <h2 className={styles.title}>Pontuação</h2>

      <ul className={styles.list}>
        {tiers.map((t) => (
          <li key={t.label} className={styles.row}>
            <span className={styles.label}>{t.label}</span>
            <span className={`${styles.pts} mono`}>{t.pts}</span>
          </li>
        ))}
      </ul>

      <h3 className={styles.subtitle}>Bônus</h3>
      <ul className={styles.list}>
        {bonus.map((b) => (
          <li key={b.label} className={styles.row}>
            <span className={styles.label}>{b.label}</span>
            <span className={`${styles.pts} mono`}>{b.pts}</span>
          </li>
        ))}
      </ul>

      <p className={styles.note}>
        Todo empate tem saldo zero — acertar um empate sem cravar o placar cai sempre na
        faixa de saldo ({rules.goalDifference} pts).
      </p>
      <p className={styles.note}>
        Nos jogos de mata-mata vale o resultado do tempo regular (90'), sem prorrogação nem
        pênaltis.
      </p>
    </section>
  );
}
