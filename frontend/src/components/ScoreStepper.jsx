import styles from "./ScoreStepper.module.css";

/** Controle numérico de placar: − [n] +, com limite 0..max. */
export default function ScoreStepper({ value, onChange, label, max = 20 }) {
  const set = (v) => onChange(Math.max(0, Math.min(max, v)));
  return (
    <div className={styles.stepper} role="group" aria-label={label}>
      <button
        type="button"
        className={styles.btn}
        onClick={() => set(value - 1)}
        disabled={value <= 0}
        aria-label={`Menos um gol para ${label}`}
      >
        −
      </button>
      <span className={`${styles.value} mono`}>{value}</span>
      <button
        type="button"
        className={styles.btn}
        onClick={() => set(value + 1)}
        disabled={value >= max}
        aria-label={`Mais um gol para ${label}`}
      >
        +
      </button>
    </div>
  );
}
