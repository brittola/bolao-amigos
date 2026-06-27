# Correção de Placar — Finalizados de Ontem+Hoje (Admin) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Admin "corrigir placar" section list finished matches from the last two days (yesterday+today, BRT) instead of today+tomorrow.

**Architecture:** A new `brtRecentDaysWindow(now)` helper (BRT business-day window for yesterday+today) feeds a new admin endpoint `GET /admin/matches/finished` returning finished matches in that window; the Admin score-fix UI switches its data source to it.

**Tech Stack:** Node/Express + Knex (Postgres); Vitest + Supertest. React + Vite. Postgres test DB must be running (docker-compose) for backend tests.

## Global Constraints

- **Window:** yesterday + today in BRT, with the day starting at 01:00 BRT (fixed UTC-3). Reuse the existing `BRT_OFFSET_MIN`/`DAY_START_HOUR` constants in `matches.js`.
- **Filter:** finished only — `status IN ('FT','AET','PEN')`.
- **Order:** most recent first (`kickoff_at` desc).
- **Endpoint shape:** `{ id, round, kickoff_at, status, home_score, away_score, home_penalties, away_penalties, score_source, home_team, away_team }`. Reuse the `team(row, prefix)` helper from `matches.js`. Including `score_source` is intentional (the old `/matches` payload omitted it, so the "manual" badge never showed).
- **Auth:** the endpoint inherits `authenticate, requireAdmin` from `adminRouter` — 401 without token, 403 for non-admin.
- **Do not change `GET /matches`** (the Jogos screen keeps today+tomorrow).
- **No env fallbacks.** **No new frontend test framework** (verify with `npm run build`).

---

### Task 1: `brtRecentDaysWindow` helper (yesterday+today BRT window)

**Files:**
- Modify: `backend/src/routes/matches.js` (extract a shared business-day-start helper; add `brtRecentDaysWindow`)
- Test: `backend/tests/matchesWindow.test.js` (add cases for the new helper)

**Interfaces:**
- Consumes: existing `BRT_OFFSET_MIN`, `DAY_START_HOUR`, `moment`.
- Produces: `export function brtRecentDaysWindow(now = moment()): { start: string, end: string }` — ISO (UTC) bounds of [yesterday 01:00 BRT, tomorrow 01:00 BRT) = yesterday+today. `brtDayWindow` keeps its current behavior (refactored to share the internal day-start computation).

- [ ] **Step 1: Add failing unit tests for the new helper**

In `backend/tests/matchesWindow.test.js`, update the import line and append a new describe block. Change line 3 from:

```js
import { brtDayWindow } from '../src/routes/matches.js';
```

to:

```js
import { brtDayWindow, brtRecentDaysWindow } from '../src/routes/matches.js';
```

Then append, after the existing `describe('brtDayWindow', ...)` block:

```js
describe('brtRecentDaysWindow', () => {
  // Janela = ontem + hoje, com a mesma fronteira de 01:00 BRT do brtDayWindow.
  it('cobre ontem+hoje com fronteira de 01:00 BRT', () => {
    const now = moment('2026-06-10T17:35:41Z'); // 14:35 BRT do dia 10
    const { start, end } = brtRecentDaysWindow(now);
    // [2026-06-09 01:00 BRT, 2026-06-11 01:00 BRT) = [04:00 UTC, 04:00 UTC)
    expect(start).toBe('2026-06-09T04:00:00.000Z');
    expect(end).toBe('2026-06-11T04:00:00.000Z');
  });

  it('entre 00:00 e 01:00 BRT ainda conta como o dia anterior', () => {
    const now = moment('2026-06-10T03:30:00Z'); // 00:30 BRT do dia 10 → dia de agenda = 09/jun
    const { start, end } = brtRecentDaysWindow(now);
    expect(start).toBe('2026-06-08T04:00:00.000Z');
    expect(end).toBe('2026-06-10T04:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- tests/matchesWindow.test.js`
Expected: FAIL — `brtRecentDaysWindow` is not exported / not a function (import is undefined).

- [ ] **Step 3: Extract the day-start helper and add `brtRecentDaysWindow`**

In `backend/src/routes/matches.js`, replace the existing `brtDayWindow` function (the block starting at `export function brtDayWindow(now = moment()) {` and ending at its closing `}`) with:

```js
/** Início do "dia" de agenda (01:00 BRT) que contém `now`, como objeto moment. */
function brtBusinessDayStart(now = moment()) {
  return moment(now)
    .utcOffset(BRT_OFFSET_MIN)
    .subtract(DAY_START_HOUR, 'hours')
    .startOf('day')
    .add(DAY_START_HOUR, 'hours');
}

export function brtDayWindow(now = moment()) {
  const start = brtBusinessDayStart(now);
  const end = moment(start).add(2, 'days');
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Janela "ontem + hoje" em horário de Brasília (dia começando às 01:00), retornada como
 * ISO em UTC. Usada para listar jogos finalizados recentes (correção de placar).
 */
export function brtRecentDaysWindow(now = moment()) {
  const todayStart = brtBusinessDayStart(now);
  const start = moment(todayStart).subtract(1, 'day');
  const end = moment(todayStart).add(1, 'day');
  return { start: start.toISOString(), end: end.toISOString() };
}
```

(Keep the existing doc-comment above `brtDayWindow` if present; the function body above is behavior-identical to the original `brtDayWindow`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npm test -- tests/matchesWindow.test.js`
Expected: PASS (existing `brtDayWindow` cases + the two new `brtRecentDaysWindow` cases).

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && npm test`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/matches.js backend/tests/matchesWindow.test.js
git commit -m "feat(matches): add brtRecentDaysWindow (yesterday+today BRT window)"
```

---

### Task 2: `GET /admin/matches/finished` endpoint

**Files:**
- Modify: `backend/src/routes/matches.js` (export the `team` helper)
- Modify: `backend/src/routes/admin.js` (import helpers; add the route)
- Test: `backend/tests/adminFinished.test.js` (create)

**Interfaces:**
- Consumes: `brtRecentDaysWindow` (Task 1) and `team(row, prefix)` from `matches.js`; `db`; the router-level `authenticate, requireAdmin`; the existing `FINAL_STATUSES = ['FT','AET','PEN']` constant already in `admin.js`.
- Produces: `GET /admin/matches/finished` → `200` with an array of finished matches (yesterday+today, kickoff desc), each `{ id, round, kickoff_at, status, home_score, away_score, home_penalties, away_penalties, score_source, home_team, away_team }`; `401` without token; `403` for non-admin.

- [ ] **Step 1: Export the `team` helper from matches.js**

In `backend/src/routes/matches.js`, change the `team` helper declaration from:

```js
function team(row, prefix) {
```

to:

```js
export function team(row, prefix) {
```

(No other change to the function.)

- [ ] **Step 2: Write the failing endpoint test**

Create `backend/tests/adminFinished.test.js`:

```js
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { db } from '../src/config/db.js';
import { signToken } from '../src/middleware/auth.js';
import { resetDb, createAdmin, createPlayer, createTeam, createMatch } from './helpers/db.js';

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await db.destroy();
});

function hoursAgo(h) {
  return new Date(Date.now() - h * 3600 * 1000).toISOString();
}

describe('GET /admin/matches/finished', () => {
  it('exige autenticação', async () => {
    const res = await request(app).get('/admin/matches/finished');
    expect(res.status).toBe(401);
  });

  it('rejeita player não-admin (403)', async () => {
    const player = await createPlayer({ email: 'p@bolao.local' });
    const token = signToken(player);
    const res = await request(app)
      .get('/admin/matches/finished')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('lista só finalizados de ontem+hoje, desc, com score_source', async () => {
    const admin = await createAdmin();
    const token = signToken(admin);
    const brasil = await createTeam({ api_team_id: 10, name: 'Brasil' });
    const servia = await createTeam({ api_team_id: 20, name: 'Sérvia' });

    // finalizado há 2h (hoje) — dentro da janela
    const recente = await createMatch({
      api_fixture_id: 1, kickoff_at: hoursAgo(2), status: 'FT',
      home_team_id: brasil.id, away_team_id: servia.id, home_score: 2, away_score: 0,
    });
    // finalizado há 20h (ontem) — dentro da janela
    const ontem = await createMatch({
      api_fixture_id: 2, kickoff_at: hoursAgo(20), status: 'AET',
      home_team_id: servia.id, away_team_id: brasil.id, home_score: 1, away_score: 1,
    });
    // finalizado há 72h — fora da janela
    await createMatch({
      api_fixture_id: 3, kickoff_at: hoursAgo(72), status: 'FT',
      home_team_id: brasil.id, away_team_id: servia.id, home_score: 3, away_score: 0,
    });
    // não finalizado, dentro da janela — excluído pelo filtro de status
    await createMatch({
      api_fixture_id: 4, kickoff_at: hoursAgo(1), status: '1H',
      home_team_id: brasil.id, away_team_id: servia.id,
    });

    // marca origem manual num jogo para conferir score_source no payload
    await db('matches').where({ id: recente.id }).update({ score_source: 'manual' });

    const res = await request(app)
      .get('/admin/matches/finished')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // só os 2 finalizados da janela, mais recente primeiro
    expect(res.body.map((m) => m.id)).toEqual([recente.id, ontem.id]);
    expect(res.body[0]).toMatchObject({
      id: recente.id,
      status: 'FT',
      score_source: 'manual',
      home_team: { name: 'Brasil' },
      away_team: { name: 'Sérvia' },
    });
    expect(res.body[1]).toMatchObject({ id: ontem.id, status: 'AET' });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd backend && npm test -- tests/adminFinished.test.js`
Expected: the auth tests may pass (middleware on a non-existent route), but the main test FAILS — `GET /admin/matches/finished` returns 404, not the array.

- [ ] **Step 4: Add the route in admin.js**

In `backend/src/routes/admin.js`, add this import near the other imports (top of file):

```js
import { brtRecentDaysWindow, team } from './matches.js';
```

Then add the route (e.g. right after the existing `adminRouter.patch('/matches/:id/score', ...)` handler). It reuses the `FINAL_STATUSES` constant already defined in this file:

```js
/** Jogos finalizados de ontem+hoje (BRT), para a correção manual de placar. */
adminRouter.get('/matches/finished', async (_req, res) => {
  const { start, end } = brtRecentDaysWindow();

  const rows = await db('matches as m')
    .leftJoin('teams as ht', 'm.home_team_id', 'ht.id')
    .leftJoin('teams as at', 'm.away_team_id', 'at.id')
    .whereIn('m.status', FINAL_STATUSES)
    .andWhere('m.kickoff_at', '>=', start)
    .andWhere('m.kickoff_at', '<', end)
    .orderBy('m.kickoff_at', 'desc')
    .select(
      'm.*',
      'ht.id as home_id', 'ht.name as home_name', 'ht.logo_url as home_logo',
      'at.id as away_id', 'at.name as away_name', 'at.logo_url as away_logo',
    );

  const result = rows.map((r) => ({
    id: r.id,
    round: r.round,
    kickoff_at: r.kickoff_at,
    status: r.status,
    home_score: r.home_score,
    away_score: r.away_score,
    home_penalties: r.home_penalties,
    away_penalties: r.away_penalties,
    score_source: r.score_source,
    home_team: team(r, 'home'),
    away_team: team(r, 'away'),
  }));

  return res.json(result);
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npm test -- tests/adminFinished.test.js`
Expected: PASS (3/3).

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && npm test`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/matches.js backend/src/routes/admin.js backend/tests/adminFinished.test.js
git commit -m "feat(admin): GET /admin/matches/finished (finished, last 2 days)"
```

---

### Task 3: Point the Admin score-fix UI at the new endpoint

**Files:**
- Modify: `frontend/src/pages/Admin.jsx` (the `ScoreFixSection` component)

**Interfaces:**
- Consumes: `GET /admin/matches/finished` (Task 2).
- Produces: the score-fix section now lists finished matches from the last two days.

- [ ] **Step 1: Switch the data source and empty-state text**

In `frontend/src/pages/Admin.jsx`, inside `ScoreFixSection`, change the `load` function — from:

```js
  async function load() {
    const { data } = await api.get("/matches");
    setMatches(data);
  }
```

to:

```js
  async function load() {
    const { data } = await api.get("/admin/matches/finished");
    setMatches(data);
  }
```

And change the empty-state line — from:

```jsx
        <p className={styles.secHint}>Nenhum jogo na janela atual.</p>
```

to:

```jsx
        <p className={styles.secHint}>Nenhum jogo finalizado nos últimos dois dias.</p>
```

Leave `ScoreFixRow` and the rest of the file unchanged.

- [ ] **Step 2: Verify the build passes**

Run: `cd frontend && npm run build`
Expected: build succeeds, no unresolved imports.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Admin.jsx
git commit -m "feat(web): admin score-fix lists finished matches (last 2 days)"
```

---

## Notes for the implementer

- Backend tests need the Postgres test DB up (docker-compose). `npm test -- tests/<file>` runs one file; `npm test` runs all.
- Frontend has no component tests by design — verify with `npm run build`.
- Keep commits per-task as written.
