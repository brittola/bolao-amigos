import styles from "./MatchListSkeleton.module.css";

/** Placeholder de carregamento para listas de jogos (Jogos e Histórico). */
export default function MatchListSkeleton() {
  return (
    <div className={styles.skeletonWrap} aria-hidden="true">
      <div className={styles.skelTitle} />
      {[0, 1, 2].map((i) => (
        <div key={i} className={styles.skelCard} />
      ))}
    </div>
  );
}
