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

    await db('bonus_results').insert({ type: 'top_scorer', value: 'Mbappé', set_by: admin.id, updated_at: db.fn.now() });
    await db('bonus_predictions').insert({ user_id: player.id, type: 'top_scorer', value: 'Mbappé', points: 1 });

    const res = await request(app).post('/admin/recompute').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ matches: 1, bonus: 2 });

    const preds = await db('predictions').where({ match_id: match.id });
    const byUser = Object.fromEntries(preds.map((p) => [p.user_id, p]));
    expect(byUser[player.id]).toMatchObject({ points: RULES.exactScore, is_exact: true }); // 25
    expect(byUser[admin.id]).toMatchObject({ points: RULES.goalDifference, is_exact: false }); // 15

    const bonus = await db('bonus_predictions').where({ user_id: player.id, type: 'champion' }).first();
    expect(bonus.points).toBe(RULES.bonusChampion); // 30

    const topScorer = await db('bonus_predictions').where({ user_id: player.id, type: 'top_scorer' }).first();
    expect(topScorer.points).toBe(RULES.bonusTopScorer); // 30
  });
});
