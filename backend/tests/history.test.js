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
