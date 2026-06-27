# Novas Regras de Pontuação + Recálculo Retroativo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the bolão scoring values, add a goal-difference scoring tier, and add an admin route that retroactively recomputes all points.

**Architecture:** All scoring values live in `RULES` (`backend/src/config/scoring.js`); `computeMatchPoints` gains a middle tier (same winner AND same goal difference). A new `recomputeAllPoints()` service orchestrates the existing per-match/per-bonus recompute functions, exposed via `POST /admin/recompute`.

**Tech Stack:** Node/Express + Knex (Postgres). Tests: Vitest + Supertest. The Postgres test DB must be running (docker-compose) before `npm test`.

## Global Constraints

- **Scoring values (exact, verbatim):** placar exato = **25**; mesmo vencedor e mesmo saldo de gols (não exato) = **15**; mesmo resultado (vencedor/empate) com saldo diferente = **12**; bônus campeão = **30**; bônus artilheiro = **30**.
- **Tiers are exclusive** — return the highest applicable, never summed. Evaluation order: exact → goal-difference → outcome → 0.
- **Draws:** a correct draw prediction for a drawn match always matches goal difference (0) → falls in the 15 tier (or 25 if exact). The 12 tier only occurs for matches with a winner. Expected.
- **`is_exact`** stays defined as `points === RULES.exactScore` (now 25) — no code change beyond the constant value.
- **No UI changes:** point values do not appear as text in the frontend (it renders `{points} pts` dynamically). Do not touch the frontend.
- **No env fallbacks** (config reads process.env without defaults).
- **Reuse, don't duplicate:** the retroactive recompute must call the existing `recomputeMatchPoints`/`recomputeBonusPoints`, not re-implement scoring.
- **Admin auth:** admin routes are protected by `adminRouter.use(authenticate, requireAdmin)`. Test admin access with `signToken(adminUser)` where the user has `role: 'admin'` (via `createAdmin()`).

---

### Task 1: New scoring values + goal-difference tier

**Files:**
- Modify: `backend/src/config/scoring.js` (RULES values + new tier in `computeMatchPoints`)
- Test: `backend/tests/scoring.test.js` (rewrite the `computeMatchPoints` describe block)
- Test: `backend/tests/ranking.test.js` (update hardcoded point totals to symbolic sums)

**Interfaces:**
- Consumes: nothing new.
- Produces: `RULES = { exactScore: 25, goalDifference: 15, correctWinner: 12, bonusChampion: 30, bonusTopScorer: 30 }`. `computeMatchPoints(prediction, result)` returns one of those values or 0, with the exclusive tier order exact → goalDifference → correctWinner → 0. `computeBonusPoints` unchanged in shape (values come from RULES).

- [ ] **Step 1: Rewrite the `computeMatchPoints` tests (failing)**

In `backend/tests/scoring.test.js`, replace the entire `describe('computeMatchPoints', ...)` block (lines 4–43) with:

```js
describe('computeMatchPoints', () => {
  it('placar exato vale exactScore', () => {
    const points = computeMatchPoints({ home_score: 2, away_score: 1 }, { home_score: 2, away_score: 1 });
    expect(points).toBe(RULES.exactScore);
  });

  it('empate exato vale exactScore', () => {
    const points = computeMatchPoints({ home_score: 1, away_score: 1 }, { home_score: 1, away_score: 1 });
    expect(points).toBe(RULES.exactScore);
  });

  it('mesmo vencedor e mesmo saldo (nao exato) vale goalDifference', () => {
    // previu 3x1 (saldo +2), saiu 2x0 (saldo +2): mesmo vencedor e saldo, placar diferente
    const points = computeMatchPoints({ home_score: 3, away_score: 1 }, { home_score: 2, away_score: 0 });
    expect(points).toBe(RULES.goalDifference);
  });

  it('empate com saldo certo (nao exato) vale goalDifference', () => {
    // previu 2x2, saiu 1x1: empate, saldo 0 igual, placar diferente
    const points = computeMatchPoints({ home_score: 2, away_score: 2 }, { home_score: 1, away_score: 1 });
    expect(points).toBe(RULES.goalDifference);
  });

  it('acertou o vencedor mas com saldo diferente vale correctWinner', () => {
    // previu 1x0 (saldo +1), saiu 2x0 (saldo +2): mesmo vencedor, saldo diferente
    const points = computeMatchPoints({ home_score: 1, away_score: 0 }, { home_score: 2, away_score: 0 });
    expect(points).toBe(RULES.correctWinner);
  });

  it('errou o resultado vale 0, mesmo acertando os gols de um time', () => {
    // previu 2x3 (visitante vence), saiu 2x1 (mandante vence): resultado errado → 0
    const points = computeMatchPoints({ home_score: 2, away_score: 3 }, { home_score: 2, away_score: 1 });
    expect(points).toBe(0);
  });

  it('errou tudo vale 0', () => {
    const points = computeMatchPoints({ home_score: 0, away_score: 1 }, { home_score: 3, away_score: 0 });
    expect(points).toBe(0);
  });

  it('tiers sao exclusivos: exato retorna so exactScore (nao soma)', () => {
    const points = computeMatchPoints({ home_score: 2, away_score: 1 }, { home_score: 2, away_score: 1 });
    expect(points).toBe(RULES.exactScore);
    expect(points).toBeLessThan(RULES.exactScore + RULES.goalDifference);
  });
});
```

Leave the `describe('computeBonusPoints', ...)` block unchanged (it uses `RULES.*` symbolically).

- [ ] **Step 2: Run the scoring tests to verify they fail**

Run: `cd backend && npm test -- tests/scoring.test.js`
Expected: FAIL — the `goalDifference` cases fail because `RULES.goalDifference` is `undefined` and `computeMatchPoints` lacks the tier (it returns `RULES.correctWinner` for the 3x1→2x0 case).

- [ ] **Step 3: Implement the new values + tier, and fix ranking.test.js totals**

In `backend/src/config/scoring.js`, replace the `RULES` object (lines 7–12) with:

```js
export const RULES = {
  exactScore: 25, // cravou o placar exato
  goalDifference: 15, // acertou o vencedor e o saldo de gols, mas não o placar
  correctWinner: 12, // acertou o resultado (vencedor/empate), mas não o saldo
  bonusChampion: 30, // acertou o campeão do torneio
  bonusTopScorer: 30, // acertou o artilheiro do torneio
};
```

In the same file, replace the body of `computeMatchPoints` (lines 27–39) with:

```js
export function computeMatchPoints(prediction, result) {
  const exact =
    prediction.home_score === result.home_score &&
    prediction.away_score === result.away_score;
  if (exact) return RULES.exactScore;

  const sameGoalDiff =
    prediction.home_score - prediction.away_score ===
    result.home_score - result.away_score;
  if (sameGoalDiff) return RULES.goalDifference;

  const sameOutcome =
    outcome(prediction.home_score, prediction.away_score) ===
    outcome(result.home_score, result.away_score);
  if (sameOutcome) return RULES.correctWinner;

  return 0;
}
```

(`outcome(home, away)` already exists above this function — keep it.)

Then fix the hardcoded totals in `backend/tests/ranking.test.js` so they survive the value change. Replace lines 24–25 (the comments) and lines 40–41 (the assertions):

Comments (lines 24–25):
```js
    // Ana: 1 exato (25) + 1 correctWinner (12) = 37, 1 exato
    // Bia: 1 exato (25) + bonus champion (30) = 55, 1 exato
```

Assertions (lines 40–41):
```js
    expect(res.body[0]).toMatchObject({ name: 'Bia', points: RULES.exactScore + RULES.bonusChampion, exact_count: 1 });
    expect(res.body[1]).toMatchObject({ name: 'Ana', points: RULES.exactScore + RULES.correctWinner, exact_count: 1 });
```

(`ranking.test.js` already imports `RULES` at line 5, so the symbolic sums resolve.)

- [ ] **Step 4: Run scoring + ranking tests to verify they pass**

Run: `cd backend && npm test -- tests/scoring.test.js tests/ranking.test.js`
Expected: PASS (all green).

- [ ] **Step 5: Run the full backend suite to check for regressions**

Run: `cd backend && npm test`
Expected: all tests PASS. (`results.test.js` and `adminActions.test.js` use `RULES.*` symbolically and their fixture predictions do not reclassify under the new tier, so they stay green.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/config/scoring.js backend/tests/scoring.test.js backend/tests/ranking.test.js
git commit -m "feat(scoring): new point values + goal-difference tier"
```

---

### Task 2: Retroactive recompute service + admin route

**Files:**
- Modify: `backend/src/services/points.js` (add `recomputeAllPoints`)
- Modify: `backend/src/routes/admin.js` (import it + add `POST /recompute`)
- Test: `backend/tests/recompute.test.js` (create)

**Interfaces:**
- Consumes: `RULES` (Task 1 values), and the existing `recomputeMatchPoints(matchId)` / `recomputeBonusPoints(type)` in the same `points.js`.
- Produces: `recomputeAllPoints(): Promise<{ matches: number, bonus: number }>`. HTTP `POST /admin/recompute` → `200` with that summary object; `401` without a token; `403` for a non-admin.

- [ ] **Step 1: Write the failing route test**

Create `backend/tests/recompute.test.js`:

```js
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { db } from '../src/config/db.js';
import { RULES } from '../src/config/scoring.js';
import { signToken } from '../src/middleware/auth.js';
import { resetDb, createAdmin, createPlayer, createTeam, createMatch } from './helpers/db.js';

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await db.destroy();
});

function past(hours = 2) {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

describe('POST /admin/recompute', () => {
  it('exige autenticação', async () => {
    const res = await request(app).post('/admin/recompute');
    expect(res.status).toBe(401);
  });

  it('rejeita player não-admin (403)', async () => {
    const player = await createPlayer({ email: 'p@bolao.local' });
    const token = signToken(player);
    const res = await request(app).post('/admin/recompute').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('reaplica as regras a palpites e bônus já existentes', async () => {
    const admin = await createAdmin();
    const player = await createPlayer({ email: 'p@bolao.local' });
    const token = signToken(admin);
    const brasil = await createTeam({ api_team_id: 10, name: 'Brasil' });
    const servia = await createTeam({ api_team_id: 20, name: 'Sérvia' });

    const match = await createMatch({
      api_fixture_id: 1, kickoff_at: past(48), status: 'FT',
      home_team_id: brasil.id, away_team_id: servia.id, home_score: 2, away_score: 0,
    });

    // points propositalmente desatualizados, para provar que foram regravados
    await db('predictions').insert([
      { user_id: player.id, match_id: match.id, home_score: 2, away_score: 0, points: 1, is_exact: false }, // cravou → 25
      { user_id: admin.id, match_id: match.id, home_score: 3, away_score: 1, points: 99, is_exact: true }, // saldo → 15
    ]);

    await db('bonus_results').insert({ type: 'champion', value: 'Brasil', set_by: admin.id, updated_at: db.fn.now() });
    await db('bonus_predictions').insert({ user_id: player.id, type: 'champion', value: 'Brasil', points: 1 });

    const res = await request(app).post('/admin/recompute').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ matches: 1, bonus: 2 });

    const preds = await db('predictions').where({ match_id: match.id });
    const byUser = Object.fromEntries(preds.map((p) => [p.user_id, p]));
    expect(byUser[player.id]).toMatchObject({ points: RULES.exactScore, is_exact: true }); // 25
    expect(byUser[admin.id]).toMatchObject({ points: RULES.goalDifference, is_exact: false }); // 15

    const bonus = await db('bonus_predictions').where({ user_id: player.id, type: 'champion' }).first();
    expect(bonus.points).toBe(RULES.bonusChampion); // 30
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npm test -- tests/recompute.test.js`
Expected: the auth tests may pass (401/403 from middleware on a non-existent route), but the main test FAILS — `POST /admin/recompute` returns 404, so `res.status` is not 200.

- [ ] **Step 3: Implement `recomputeAllPoints`**

In `backend/src/services/points.js`, append after `recomputeBonusPoints`:

```js
/**
 * Reaplica as regras de pontuação a todo o histórico (uso retroativo).
 * Idempotente. Reaproveita os recompute por jogo e por tipo de bônus.
 */
export async function recomputeAllPoints() {
  const matches = await db('matches')
    .whereNotNull('home_score')
    .whereNotNull('away_score')
    .select('id');
  for (const m of matches) {
    await recomputeMatchPoints(m.id);
  }

  const bonusTypes = ['champion', 'top_scorer'];
  for (const type of bonusTypes) {
    await recomputeBonusPoints(type);
  }

  return { matches: matches.length, bonus: bonusTypes.length };
}
```

- [ ] **Step 4: Add the admin route**

In `backend/src/routes/admin.js`, update the points import (line 5) to include the new function:

```js
import { recomputeMatchPoints, recomputeBonusPoints, recomputeAllPoints } from '../services/points.js';
```

Then add this route (e.g. after the `PUT /bonus-results` handler):

```js
/** Recálculo retroativo: reaplica as regras de pontuação a todo o histórico. */
adminRouter.post('/recompute', async (req, res) => {
  const summary = await recomputeAllPoints();
  return res.json(summary);
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npm test -- tests/recompute.test.js`
Expected: PASS (3/3).

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && npm test`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/points.js backend/src/routes/admin.js backend/tests/recompute.test.js
git commit -m "feat(admin): POST /admin/recompute for retroactive point recomputation"
```

---

## Notes for the implementer

- Run backend tests with the Postgres test DB up (docker-compose). `npm test -- tests/<file>` runs a single file; `npm test` runs everything.
- No frontend changes in this plan — scoring values are not displayed as text.
- Keep commits per-task as written.
