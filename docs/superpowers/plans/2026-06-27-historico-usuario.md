# Histórico do Usuário — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a private screen where the logged-in user sees finished matches, their own prediction for each, and the points earned.

**Architecture:** New protected backend endpoint `GET /matches/history` returns finished matches (status FT/AET/PEN) ordered by kickoff descending, each with the user's prediction embedded and **without** other users' predictions. A new `/historico` React page groups them by day (Brasília time) and renders the existing `MatchCard` in a new read-only `variant="history"`.

**Tech Stack:** Backend — Node/Express + Knex (Postgres), tests with Vitest + Supertest. Frontend — React 18 + React Router 6 + Vite, CSS Modules, moment.js. No UI test framework exists; frontend tasks are verified via `vite build` + manual smoke.

## Global Constraints

- **Privacy:** the history screen is private — the endpoint MUST NOT return other users' predictions (no `predictions` array in the response).
- **Finished status set:** a match is "finished" when `status ∈ {'FT','AET','PEN'}`. Use exactly this set.
- **Brasília time:** day grouping uses BRT fixed at UTC-3 (Brazil has no DST). The schedule day starts at 01:00 BRT — reuse the existing `businessDay`/`dayBucket` logic, do not reinvent it.
- **No env fallbacks:** config reads `process.env` directly without defaults — do not add fallback defaults.
- **No new frontend test framework:** the frontend has no component tests today; do not introduce one. Verify frontend tasks with `npm run build` and a manual smoke check.
- **Follow existing patterns:** match the style of `routes/matches.js`, `pages/Matches.jsx`, and the existing CSS-module/design-token conventions.
- **Backend tests need Postgres:** the test database must be running (docker-compose) before `npm test`.

---

### Task 1: Backend endpoint `GET /matches/history`

**Files:**
- Modify: `backend/src/routes/matches.js` (add handler + a `FINAL` status constant)
- Test: `backend/tests/history.test.js` (create)

**Interfaces:**
- Consumes: existing helpers in `matches.js` — `team(row, prefix)` builder, the `db` Knex instance, and `authenticate` middleware already applied at `matchesRouter.use(authenticate)`. Test helpers from `tests/helpers/db.js`: `resetDb()`, `createPlayer({email})`, `createTeam({api_team_id,name})`, `createMatch({api_fixture_id,kickoff_at,status,home_team_id,away_team_id,home_score,away_score})`. Auth helper `signToken(user)` from `src/middleware/auth.js`.
- Produces: `GET /matches/history` → `200` with a JSON array of match objects, newest kickoff first. Each object:
  ```
  {
    id, api_fixture_id, round, kickoff_at, status,
    home_score, away_score, home_penalties, away_penalties,
    home_team: { id, name, logo_url } | null,
    away_team: { id, name, logo_url } | null,
    locked: true,
    my_prediction: { home_score, away_score, points } | null
    // NOTE: no `predictions` field
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `backend/tests/history.test.js`:

```js
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { db } from '../src/config/db.js';
import { signToken } from '../src/middleware/auth.js';
import { resetDb, createPlayer, createTeam, createMatch } from './helpers/db.js';

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await db.destroy();
});

function past(hours = 1) {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}
function future(hours = 24) {
  return new Date(Date.now() + hours * 3600 * 1000).toISOString();
}

describe('GET /matches/history', () => {
  it('exige autenticação', async () => {
    const res = await request(app).get('/matches/history');
    expect(res.status).toBe(401);
  });

  it('lista só partidas encerradas (desc), com meu palpite e sem vazar palpites alheios', async () => {
    const player = await createPlayer({ email: 'p1@bolao.local' });
    const other = await createPlayer({ email: 'p2@bolao.local' });
    const token = signToken(player);
    const brasil = await createTeam({ api_team_id: 10, name: 'Brasil' });
    const croacia = await createTeam({ api_team_id: 20, name: 'Croácia' });

    // encerrada mais antiga, com meu palpite
    const antiga = await createMatch({
      api_fixture_id: 1, kickoff_at: past(48), status: 'FT',
      home_team_id: brasil.id, away_team_id: croacia.id, home_score: 3, away_score: 1,
    });
    // encerrada mais recente, sem meu palpite
    const recente = await createMatch({
      api_fixture_id: 2, kickoff_at: past(2), status: 'FT',
      home_team_id: croacia.id, away_team_id: brasil.id, home_score: 0, away_score: 0,
    });
    // não encerrada — não deve aparecer
    await createMatch({
      api_fixture_id: 3, kickoff_at: future(5), status: 'NS',
      home_team_id: brasil.id, away_team_id: croacia.id,
    });

    await db('predictions').insert([
      { user_id: player.id, match_id: antiga.id, home_score: 2, away_score: 1, points: 3 },
      { user_id: other.id, match_id: antiga.id, home_score: 0, away_score: 0, points: 0 },
    ]);

    const res = await request(app)
      .get('/matches/history')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    // ordem desc por kickoff: a recente vem primeiro
    expect(res.body[0].id).toBe(recente.id);
    expect(res.body[1].id).toBe(antiga.id);

    // meu palpite correto na antiga
    expect(res.body[1].my_prediction).toMatchObject({ home_score: 2, away_score: 1, points: 3 });
    // sem palpite na recente
    expect(res.body[0].my_prediction).toBeNull();

    // não vaza palpites de outros usuários
    expect(res.body[0].predictions).toBeUndefined();
    expect(res.body[1].predictions).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- tests/history.test.js`
Expected: the auth test may pass (route 404 → not 401? actually unknown route returns 404), but the main test FAILS — `GET /matches/history` returns `404`/empty, so `res.body` is not the expected array. (Confirm RED before implementing.)

- [ ] **Step 3: Add the `FINAL` constant and the handler**

In `backend/src/routes/matches.js`, add the constant near the top (after the existing `DAY_START_HOUR` const):

```js
// Status que indicam jogo encerrado (mesma lista do front em MatchCard).
const FINAL = ['FT', 'AET', 'PEN'];
```

Then add the handler **after** the existing `matchesRouter.get('/', ...)` block:

```js
/** Histórico privado: partidas encerradas com o meu palpite e pontos (sem palpites alheios). */
matchesRouter.get('/history', async (req, res) => {
  const rows = await db('matches as m')
    .leftJoin('teams as ht', 'm.home_team_id', 'ht.id')
    .leftJoin('teams as at', 'm.away_team_id', 'at.id')
    .whereIn('m.status', FINAL)
    .orderBy('m.kickoff_at', 'desc')
    .select(
      'm.*',
      'ht.id as home_id', 'ht.name as home_name', 'ht.logo_url as home_logo',
      'at.id as away_id', 'at.name as away_name', 'at.logo_url as away_logo',
    );

  const matchIds = rows.map((r) => r.id);
  const mine = matchIds.length
    ? await db('predictions').where('user_id', req.user.id).whereIn('match_id', matchIds)
    : [];
  const myByMatch = Object.fromEntries(mine.map((p) => [p.match_id, p]));

  const result = rows.map((r) => {
    const mp = myByMatch[r.id];
    return {
      id: r.id,
      api_fixture_id: r.api_fixture_id,
      round: r.round,
      kickoff_at: r.kickoff_at,
      status: r.status,
      home_score: r.home_score,
      away_score: r.away_score,
      home_penalties: r.home_penalties,
      away_penalties: r.away_penalties,
      home_team: team(r, 'home'),
      away_team: team(r, 'away'),
      locked: true,
      my_prediction: mp
        ? { home_score: mp.home_score, away_score: mp.away_score, points: mp.points }
        : null,
    };
  });

  return res.json(result);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- tests/history.test.js`
Expected: PASS (both `it` blocks green).

- [ ] **Step 5: Run the full backend suite to check for regressions**

Run: `cd backend && npm test`
Expected: all tests PASS (no existing test broken).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/matches.js backend/tests/history.test.js
git commit -m "feat(api): add GET /matches/history for private user history"
```

---

### Task 2: Extract day-grouping helper into a shared util

**Why:** `Matches.jsx` defines `businessDay`/`dayBucket` (the BRT business-day rule). The history page needs the identical logic. Extract it to one place so the rule stays in sync.

**Files:**
- Create: `frontend/src/lib/day.js`
- Modify: `frontend/src/pages/Matches.jsx` (remove the local helpers, import from the util)

**Interfaces:**
- Produces: `dayBucket(kickoff: string): string` — returns `"Hoje"`, `"Amanhã"`, or a formatted day label (e.g. `"segunda-feira, 22 de jun"`), using BRT fixed offset and the 01:00 day start.

- [ ] **Step 1: Create the util**

Create `frontend/src/lib/day.js`:

```js
import moment from "moment";

// O dia da agenda vai de 01:00 às 01:00 do dia seguinte (igual ao back): jogos da
// madrugada (00:00–00:59) entram na noite do dia anterior.
const DAY_START_HOUR = 1;

const businessDay = (value) => moment(value).subtract(DAY_START_HOUR, "hours").startOf("day");

/** Rótulo do dia para agrupamento: "Hoje", "Amanhã" ou data formatada. */
export function dayBucket(kickoff) {
  const d = businessDay(kickoff);
  const today = businessDay(moment());
  if (d.isSame(today, "day")) return "Hoje";
  if (d.isSame(moment(today).add(1, "day"), "day")) return "Amanhã";
  return d.format("dddd, DD [de] MMM");
}
```

- [ ] **Step 2: Refactor `Matches.jsx` to use the util**

In `frontend/src/pages/Matches.jsx`:
1. Remove the local `DAY_START_HOUR`, `businessDay`, and `dayBucket` definitions (lines ~8–19).
2. Remove the now-unused `import moment from "moment";` (line 2) — after the extraction nothing else in `Matches.jsx` uses `moment`.
3. Add the import near the other imports:

```js
import { dayBucket } from "../lib/day.js";
```

Leave the rest of `Matches.jsx` unchanged — it already calls `dayBucket(m.kickoff_at)`.

- [ ] **Step 3: Verify the build still passes**

Run: `cd frontend && npm run build`
Expected: build succeeds, no unresolved import errors.

- [ ] **Step 4: Manual smoke (Matches unchanged)**

Run `cd frontend && npm run dev`, open the Jogos page, confirm matches still group by day exactly as before. (No visual change expected.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/day.js frontend/src/pages/Matches.jsx
git commit -m "refactor(web): extract dayBucket helper into lib/day.js"
```

---

### Task 3: Add `variant="history"` to `MatchCard`

**Files:**
- Modify: `frontend/src/components/MatchCard.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `MatchCard` accepts a new prop `variant` (default `"matches"`). When `variant === "history"` and the match is locked: render only the user's own prediction (or a "Sem palpite · 0 pts" line when `my_prediction` is null) and do **not** render the list of other users' predictions. With the default variant, behavior is byte-for-byte unchanged.

- [ ] **Step 1: Thread the `variant` prop through `MatchCard`**

In `frontend/src/components/MatchCard.jsx`, change the component signature and the `LockedDetails` call site:

```js
export default function MatchCard({ match, onSave, variant = "matches" }) {
```

and where it renders locked details (currently `<LockedDetails match={match} />`):

```js
<LockedDetails match={match} variant={variant} />
```

- [ ] **Step 2: Rewrite `LockedDetails` to honor the variant**

Replace the existing `LockedDetails` function with:

```js
function LockedDetails({ match, variant }) {
  const isHistory = variant === "history";
  const list = match.predictions || [];
  return (
    <div className={styles.locked}>
      <div className={styles.divider} />
      {match.my_prediction ? (
        <p className={styles.youHave}>
          Seu palpite: <b className="mono">{match.my_prediction.home_score}–{match.my_prediction.away_score}</b>
          {match.my_prediction.points != null && (
            <span className={styles.pts}> +{match.my_prediction.points} pts</span>
          )}
        </p>
      ) : (
        isHistory && (
          <p className={styles.youHave}>
            <span className={styles.hint}>Sem palpite · 0 pts</span>
          </p>
        )
      )}
      {!isHistory &&
        (list.length > 0 ? (
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
        ))}
    </div>
  );
}
```

Note: for the default (`matches`) variant this is logically identical to the original — when `my_prediction` is null it shows nothing for the prediction line and then renders the predictions list / empty hint exactly as before.

- [ ] **Step 3: Verify the build passes**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual smoke (Matches still correct)**

Run `npm run dev`, open Jogos, confirm a locked/finished match still shows everyone's predictions (default variant unaffected).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MatchCard.jsx
git commit -m "feat(web): add history variant to MatchCard (own prediction only)"
```

---

### Task 4: Create the `Historico` page

**Files:**
- Create: `frontend/src/pages/Historico.jsx`

**Interfaces:**
- Consumes: `api`/`errorMessage` from `../api/client.js`; `MatchCard` from `../components/MatchCard.jsx` (with `variant="history"`); `dayBucket` from `../lib/day.js`; styles reused from `./Matches.module.css`. Backend endpoint `GET /matches/history` (Task 1).
- Produces: default-exported `Historico` React component rendering the grouped, read-only history. Used by the route added in Task 5.

- [ ] **Step 1: Create the page**

Create `frontend/src/pages/Historico.jsx`:

```jsx
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
```

- [ ] **Step 2: Verify the build passes**

Run: `cd frontend && npm run build`
Expected: build succeeds (page compiles even before it is routed).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Historico.jsx
git commit -m "feat(web): add Historico page (finished matches, own prediction + points)"
```

---

### Task 5: Wire the route and the nav link

**Files:**
- Modify: `frontend/src/App.jsx` (add protected route `/historico`)
- Modify: `frontend/src/components/Layout.jsx` (add nav link between Jogos and Ranking)

**Interfaces:**
- Consumes: `Historico` page (Task 4).
- Produces: navigable `/historico` route and a "Histórico" tab in the header.

- [ ] **Step 1: Add the route in `App.jsx`**

Add the import alongside the other page imports:

```js
import Historico from "./pages/Historico.jsx";
```

Inside the protected `<Layout />` group, add the route after the `/ranking` route:

```jsx
<Route path="/historico" element={<Historico />} />
```

- [ ] **Step 2: Add the nav link in `Layout.jsx`**

In the `<nav className={styles.nav}>` block, add a link after the Ranking `NavLink` (and before the admin link):

```jsx
<NavLink to="/historico" className={tabClass}>
  Histórico
</NavLink>
```

- [ ] **Step 3: Verify the build passes**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual smoke test (end to end)**

With backend running (and at least one finished match + a prediction in the DB), run `cd frontend && npm run dev`:
- Click the "Histórico" tab → navigates to `/historico`.
- Finished matches appear grouped by day, newest first.
- A match you predicted shows "Seu palpite: X–Y +N pts".
- A finished match you did **not** predict shows "Sem palpite · 0 pts".
- Other users' predictions are **not** shown.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/Layout.jsx
git commit -m "feat(web): route and nav link for the Historico page"
```

---

## Notes for the implementer

- Run backend tests with the Postgres test DB up (docker-compose). The command `npm test -- tests/history.test.js` runs just the new file; `npm test` runs everything.
- The frontend has no automated component tests — that is intentional for this feature. Verify with `npm run build` plus the manual smoke steps.
- Keep commits small and per-task as written above.
