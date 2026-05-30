import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { db } from '../src/config/db.js';
import { RULES } from '../src/config/scoring.js';
import { signToken } from '../src/middleware/auth.js';
import { resetDb, createAdmin, createPlayer, createMatch } from './helpers/db.js';

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await db.destroy();
});

describe('PATCH /admin/matches/:id/score', () => {
  it('corrige placar manualmente e recomputa pontos', async () => {
    const admin = await createAdmin();
    const player = await createPlayer({ email: 'p@bolao.local' });
    const match = await createMatch({ api_fixture_id: 1, kickoff_at: new Date().toISOString(), status: '2H' });
    await db('predictions').insert({ user_id: player.id, match_id: match.id, home_score: 3, away_score: 0 });

    const res = await request(app)
      .patch(`/admin/matches/${match.id}/score`)
      .set('Authorization', `Bearer ${signToken(admin)}`)
      .send({ home_score: 3, away_score: 0 });

    expect(res.status).toBe(200);
    const updated = await db('matches').where({ id: match.id }).first();
    expect(updated.score_source).toBe('manual');
    expect(updated.status).toBe('FT');

    const pred = await db('predictions').where({ match_id: match.id }).first();
    expect(pred.points).toBe(RULES.exactScore);
  });

  it('nega para jogador comum', async () => {
    const player = await createPlayer({ email: 'p@bolao.local' });
    const match = await createMatch({ api_fixture_id: 1, kickoff_at: new Date().toISOString() });
    const res = await request(app)
      .patch(`/admin/matches/${match.id}/score`)
      .set('Authorization', `Bearer ${signToken(player)}`)
      .send({ home_score: 1, away_score: 0 });
    expect(res.status).toBe(403);
  });
});

describe('PUT /admin/bonus-results', () => {
  it('define o resultado bonus e recomputa os palpites', async () => {
    const admin = await createAdmin();
    const player = await createPlayer({ email: 'p@bolao.local' });
    await db('bonus_predictions').insert({ user_id: player.id, type: 'champion', value: 'Brasil' });

    const res = await request(app)
      .put('/admin/bonus-results')
      .set('Authorization', `Bearer ${signToken(admin)}`)
      .send({ type: 'champion', value: 'Brasil' });

    expect(res.status).toBe(200);
    const pred = await db('bonus_predictions').where({ user_id: player.id, type: 'champion' }).first();
    expect(pred.points).toBe(RULES.bonusChampion);
  });
});
