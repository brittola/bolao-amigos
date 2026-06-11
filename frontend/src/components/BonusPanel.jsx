import { useEffect, useState } from "react";
import { api, errorMessage } from "../api/client.js";
import styles from "./BonusPanel.module.css";

const FIELDS = [
  { type: "champion", label: "Campeão", placeholder: "Seleção campeã" },
  {
    type: "top_scorer",
    label: "Artilheiro",
    placeholder: "Nome e sobrenome (ex.: Kylian Mbappé)",
  },
];

// Copa já começou: palpites bônus encerrados. Trava fixa no front (decisão do time);
// para reabrir numa próxima edição, voltar para false.
const CUP_STARTED = true;

export default function BonusPanel() {
  const [values, setValues] = useState({ champion: "", top_scorer: "" });
  const [feedback, setFeedback] = useState(null); // { type: 'ok'|'error', msg }
  const [savingType, setSavingType] = useState(null);

  useEffect(() => {
    api.get("/predictions/bonus").then(({ data }) => {
      const next = { champion: "", top_scorer: "" };
      for (const row of data) next[row.type] = row.value;
      setValues(next);
    });
  }, []);

  async function save(type) {
    setSavingType(type);
    setFeedback(null);
    try {
      await api.post("/predictions/bonus", { type, value: values[type].trim() });
      setFeedback({ type: "ok", msg: "Palpite bônus salvo." });
    } catch (err) {
      setFeedback({ type: "error", msg: errorMessage(err, "Não foi possível salvar.") });
    } finally {
      setSavingType(null);
    }
  }

  return (
    <section className={styles.panel}>
      <header className={styles.head}>
        <span className="eyebrow">Palpites bônus</span>
        <span className={styles.note}>fecham no início da Copa · valem pontos extras</span>
      </header>

      {CUP_STARTED && (
        <div className="notice error" style={{ marginBottom: "0.75rem" }}>
          A Copa já começou — palpites bônus encerrados.
        </div>
      )}

      {feedback && (
        <div className={`notice ${feedback.type === "ok" ? "ok" : "error"}`} style={{ marginBottom: "0.75rem" }}>
          {feedback.msg}
        </div>
      )}

      <div className={styles.grid}>
        {FIELDS.map((f) => (
          <div key={f.type} className={styles.row}>
            <div className="field" style={{ margin: 0, flex: 1 }}>
              <label htmlFor={`bonus-${f.type}`}>{f.label}</label>
              <input
                id={`bonus-${f.type}`}
                className="input"
                value={values[f.type]}
                placeholder={f.placeholder}
                disabled={CUP_STARTED}
                onChange={(e) => setValues((v) => ({ ...v, [f.type]: e.target.value }))}
              />
            </div>
            <button
              className="btn"
              onClick={() => save(f.type)}
              disabled={CUP_STARTED || savingType === f.type || !values[f.type].trim()}
            >
              {savingType === f.type ? "..." : "Salvar"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
