# Mata-mata (90') + Painel de Pontuação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make knockout results score on regular time (90') via the provider mapping, and add a scoring-info panel (fed by a new `GET /rules` endpoint) to the Ranking page.

**Architecture:** Part B changes one mapping line in the football-data provider so stored `home_score`/`away_score` are the 90' result (no schema/scoring change). Part D adds a tiny authenticated `GET /rules` endpoint returning the `RULES` object, and a `ScoringPanel` React component that renders it on the Ranking page.

**Tech Stack:** Node/Express + Knex (Postgres); Vitest + Supertest. React 18 + Vite + CSS Modules. Postgres test DB must be running (docker-compose) for backend tests.

## Global Constraints

- **B — knockout result = 90':** provider maps `goals` from `score.regularTime` with fallback to `score.fullTime`. Only the football-data provider (`footballData.js`) is in scope; `api-football` is suspended/out of scope. No schema change, no knockout detection, no change to scoring functions.
- **B out of scope:** retroactive re-fetch (no knockout played yet), storing extra-time goals, ET/penalty display indicator.
- **D — values come from the backend:** the panel renders values fetched from `GET /rules` (the single source of truth `RULES`), never hardcoded.
- **D — `GET /rules` is authenticated** (same as `/ranking`): 401 without token; returns the `RULES` object for an authenticated user.
- **D — panel placement:** always-visible card on the Ranking page, below the legend. Includes the draws note and the knockout note.
- **D — panel degrades gracefully:** while loading or on fetch error, it renders nothing (supplementary info must not break the ranking).
- **No new frontend test framework** (none exists). Frontend verified with `npm run build`.
- **No env fallbacks** (config reads process.env without defaults).
- **C-dependency / merge order:** this branch is off `master`, which still has the OLD `RULES` (C, PR #2, not merged). Backend tests assert against `RULES` symbolically, so they pass regardless. Merge C before this so the panel shows the new values at runtime. (On this branch `RULES` has no `goalDifference` key yet — the panel's "Vencedor + saldo" row will render blank in local dev until C merges; expected, and the build still passes.)

---

### Task 1 (B): Knockout result = regular time in the football-data provider

**Files:**
- Modify: `backend/src/services/footballData.js` (the `goals` mapping in `toFixture`, ~lines 75–78; and the comment at ~line 27)
- Test: `backend/tests/footballData.test.js` (modify the extra-time case)

**Interfaces:**
- Consumes: nothing new.
- Produces: `toFixture` maps `goals.home`/`goals.away` from `match.score.regularTime` when present, else `match.score.fullTime` (else null). Status and `score.penalty` mapping unchanged.

- [ ] **Step 1: Make the extra-time test assert the 90' score (failing)**

In `backend/tests/footballData.test.js`, replace the existing test block `it('mata-mata na prorrogação (sem pênaltis): status AET', ...)` (currently lines ~64–80) with:

```js
  it("mata-mata na prorrogação: goals = tempo regular (90'), não o pós-prorrogação", async () => {
    const aet = {
      ...GROUP_MATCH,
      id: 537061,
      status: 'FINISHED',
      stage: 'SEMI_FINALS',
      // 1-1 nos 90' (regularTime); 2-1 ao fim da prorrogação (fullTime)
      score: {
        winner: 'HOME_TEAM',
        duration: 'EXTRA_TIME',
        regularTime: { home: 1, away: 1 },
        fullTime: { home: 2, away: 1 },
      },
    };
    const http = fakeHttp([aet]);
    const api = createFootballData({ http, competition: 'WC', sleep: vi.fn() });

    const [fx] = await api.getFixturesByDate('2026-06-11');

    expect(fx.fixture.status.short).toBe('AET');
    expect(fx.goals).toEqual({ home: 1, away: 1 }); // 90', via regularTime — não 2-1
    expect(fx.score.penalty).toEqual({ home: null, away: null });
  });
```

(The existing `'mapeia FINISHED para FT e usa o placar de fullTime'` test has no `regularTime` and continues to assert the fallback to `fullTime` — leave it unchanged; it now also documents the fallback path.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- tests/footballData.test.js`
Expected: FAIL — current code maps `goals` from `fullTime`, so `fx.goals` is `{ home: 2, away: 1 }` but the test expects `{ home: 1, away: 1 }`.

- [ ] **Step 3: Map goals from regularTime (fallback fullTime)**

In `backend/src/services/footballData.js`, change the `goals` block in `toFixture` (currently):

```js
    goals: {
      home: match.score?.fullTime?.home ?? null,
      away: match.score?.fullTime?.away ?? null,
    },
```

to:

```js
    goals: {
      home: match.score?.regularTime?.home ?? match.score?.fullTime?.home ?? null,
      away: match.score?.regularTime?.away ?? match.score?.fullTime?.away ?? null,
    },
```

And update the comment at ~line 27 (currently "Em todos, o placar que pontua o bolão é `score.fullTime` (normal + prorrogação).") to:

```js
 * O placar que pontua o bolão é o tempo regular: `score.regularTime` (90'), com
 * fallback para `score.fullTime` quando não há prorrogação. Assim o mata-mata pontua
 * pelos 90' (sem prorrogação/pênaltis) sem precisar detectar a fase.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npm test -- tests/footballData.test.js`
Expected: PASS (all cases green, including the fallback FT test).

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && npm test`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/footballData.js backend/tests/footballData.test.js
git commit -m "feat(provider): score knockout matches on regular time (90')"
```

---

### Task 2 (D-backend): `GET /rules` endpoint

**Files:**
- Create: `backend/src/routes/rules.js`
- Modify: `backend/src/app.js` (mount the router)
- Test: `backend/tests/rules.test.js` (create)

**Interfaces:**
- Consumes: `RULES` from `config/scoring.js`; `authenticate` middleware; `signToken`/`createPlayer`/`resetDb` test helpers.
- Produces: `GET /rules` → `401` without a token; with an authenticated token, `200` with the `RULES` object (`{ exactScore, correctWinner, bonusChampion, bonusTopScorer, ... }` — exactly whatever `RULES` contains).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/rules.test.js`:

```js
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { db } from '../src/config/db.js';
import { RULES } from '../src/config/scoring.js';
import { signToken } from '../src/middleware/auth.js';
import { resetDb, createPlayer } from './helpers/db.js';

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await db.destroy();
});

describe('GET /rules', () => {
  it('exige autenticação', async () => {
    const res = await request(app).get('/rules');
    expect(res.status).toBe(401);
  });

  it('retorna o objeto RULES para usuário autenticado', async () => {
    const player = await createPlayer({ email: 'p@bolao.local' });
    const token = signToken(player);

    const res = await request(app).get('/rules').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(RULES);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- tests/rules.test.js`
Expected: the auth test may pass (no route → middleware/404), but the main test FAILS — `GET /rules` returns 404, not 200 with the RULES object.

- [ ] **Step 3: Create the router**

Create `backend/src/routes/rules.js`:

```js
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { RULES } from '../config/scoring.js';

export const rulesRouter = Router();

rulesRouter.use(authenticate);

/** Regras de pontuação (valores de RULES) para exibição no app. */
rulesRouter.get('/', (_req, res) => {
  return res.json(RULES);
});
```

- [ ] **Step 4: Mount the router in app.js**

In `backend/src/app.js`, add the import alongside the other route imports:

```js
import { rulesRouter } from './routes/rules.js';
```

and mount it with the other routers (e.g. after the `ranking` line):

```js
app.use('/rules', rulesRouter);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npm test -- tests/rules.test.js`
Expected: PASS (2/2).

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && npm test`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/rules.js backend/src/app.js backend/tests/rules.test.js
git commit -m "feat(api): add GET /rules exposing scoring values"
```

---

### Task 3 (D-frontend): ScoringPanel on the Ranking page

**Files:**
- Create: `frontend/src/components/ScoringPanel.jsx`
- Create: `frontend/src/components/ScoringPanel.module.css`
- Modify: `frontend/src/pages/Ranking.jsx` (render the panel below the legend)

**Interfaces:**
- Consumes: `api` from `../api/client.js`; `GET /rules` (Task 2) → `{ exactScore, goalDifference, correctWinner, bonusChampion, bonusTopScorer }`.
- Produces: default-exported `ScoringPanel` component; rendered once on the Ranking page.

- [ ] **Step 1: Create the component**

Create `frontend/src/components/ScoringPanel.jsx`:

```jsx
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
```

- [ ] **Step 2: Create the styles**

Create `frontend/src/components/ScoringPanel.module.css`:

```css
.panel {
  margin-top: var(--sp-5);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: var(--sp-4);
}
.title {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--amber);
  margin: 0 0 var(--sp-3);
}
.subtitle {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-dim);
  margin: var(--sp-4) 0 var(--sp-2);
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: 0.3rem 0;
  border-bottom: 1px solid var(--border);
}
.label {
  color: var(--text-dim);
  font-size: 0.95rem;
}
.pts {
  color: var(--amber);
  font-weight: 700;
}
.note {
  margin: var(--sp-3) 0 0;
  color: var(--text-faint);
  font-size: 0.82rem;
  line-height: 1.4;
}
```

- [ ] **Step 3: Render the panel on the Ranking page**

In `frontend/src/pages/Ranking.jsx`, add the import alongside the others:

```js
import ScoringPanel from "../components/ScoringPanel.jsx";
```

Then render `<ScoringPanel />` immediately after the legend paragraph (the `<p className={styles.legend}>…</p>` block), still inside the `<div className="container">`:

```jsx
      <p className={styles.legend}>
        <span className="mono">n✓</span> placares exatos · <span className="mono">pts</span> pontuação total
      </p>

      <ScoringPanel />
    </div>
```

- [ ] **Step 4: Verify the build passes**

Run: `cd frontend && npm run build`
Expected: build succeeds, no unresolved imports.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ScoringPanel.jsx frontend/src/components/ScoringPanel.module.css frontend/src/pages/Ranking.jsx
git commit -m "feat(web): scoring info panel on the Ranking page"
```

---

## Notes for the implementer

- Backend tests need the Postgres test DB up (docker-compose). `npm test -- tests/<file>` runs one file; `npm test` runs all.
- Frontend has no component tests by design — verify with `npm run build`.
- This branch is off `master` (old `RULES`): backend tests use `RULES` symbolically so they pass; the panel's goal-difference row is blank in local dev until C (PR #2) merges. Merge C before this branch.
- Keep commits per-task as written.
