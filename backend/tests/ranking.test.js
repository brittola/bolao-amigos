import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { db } from '../src/config/db.js';
import { RULES } from '../src/config/scoring.js';
import { signToken } from '../src/middleware/auth.js';
import { resetDb, createPlayer, createMatch } from './helpers/db.js';

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await db.destroy();
});

describe('GET /ranking', () => {
  it('soma pontos (jogos + bonus), ordena desc e desempata por acertos exatos', async () => {
    const ana = await createPlayer({ name: 'Ana', email: 'ana@bolao.local' });
    const bia = await createPlayer({ name: 'Bia', email: 'bia@bolao.local' });
    const m1 = await createMatch({ api_fixture_id: 1, kickoff_at: new Date().toISOString(), status: 'FT', home_score: 2, away_score: 1 });
    const m2 = await createMatch({ api_fixture_id: 2, kickoff_at: new Date().toISOString(), status: 'FT', home_score: 0, away_score: 0 });

    // Ana: 1 exato (5) + 1 correctWinner (3) = 8, 1 exato
    // Bia: 1 exato (5) + bonus champion (10) = 15, 1 exato
    await db('predictions').insert([
      { user_id: ana.id, match_id: m1.id, home_score: 2, away_score: 1, points: RULES.exactScore, is_exact: true },
      { user_id: ana.id, match_id: m2.id, home_score: 1, away_score: 1, points: RULES.correctWinner, is_exact: false },
      { user_id: bia.id, match_id: m1.id, home_score: 2, away_score: 1, points: RULES.exactScore, is_exact: true },
    ]);
    await db('bonus_predictions').insert([
      { user_id: bia.id, type: 'champion', value: 'Brasil', points: RULES.bonusChampion },
    ]);

    const token = signToken(ana);
    const res = await request(app).get('/ranking').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    expect(res.body.map((r) => r.name)).toEqual(['Bia', 'Ana']);
    expect(res.body[0]).toMatchObject({ name: 'Bia', points: 15, exact_count: 1 });
    expect(res.body[1]).toMatchObject({ name: 'Ana', points: 8, exact_count: 1 });
  });

  it('exige autenticação', async () => {
    const res = await request(app).get('/ranking');
    expect(res.status).toBe(401);
  });
});
