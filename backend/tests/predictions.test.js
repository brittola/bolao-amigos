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

function future(hours = 24) {
  return new Date(Date.now() + hours * 3600 * 1000).toISOString();
}
function past(hours = 1) {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

async function setup() {
  const player = await createPlayer({ email: 'p1@bolao.local' });
  const token = signToken(player);
  const brasil = await createTeam({ api_team_id: 10, name: 'Brasil' });
  const croacia = await createTeam({ api_team_id: 20, name: 'Croácia' });
  return { player, token, brasil, croacia };
}

describe('POST /predictions', () => {
  it('exige autenticação', async () => {
    const res = await request(app).post('/predictions').send({ match_id: 1, home_score: 1, away_score: 0 });
    expect(res.status).toBe(401);
  });

  it('cria palpite para jogo futuro', async () => {
    const { token, brasil, croacia } = await setup();
    const match = await createMatch({ api_fixture_id: 1, kickoff_at: future(), home_team_id: brasil.id, away_team_id: croacia.id });

    const res = await request(app)
      .post('/predictions')
      .set('Authorization', `Bearer ${token}`)
      .send({ match_id: match.id, home_score: 2, away_score: 1 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ match_id: match.id, home_score: 2, away_score: 1 });
    const row = await db('predictions').where({ match_id: match.id }).first();
    expect(row.home_score).toBe(2);
  });

  it('atualiza o palpite existente (upsert)', async () => {
    const { token, brasil, croacia } = await setup();
    const match = await createMatch({ api_fixture_id: 1, kickoff_at: future(), home_team_id: brasil.id, away_team_id: croacia.id });

    await request(app).post('/predictions').set('Authorization', `Bearer ${token}`).send({ match_id: match.id, home_score: 2, away_score: 1 });
    await request(app).post('/predictions').set('Authorization', `Bearer ${token}`).send({ match_id: match.id, home_score: 0, away_score: 0 });

    const rows = await db('predictions').where({ match_id: match.id });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ home_score: 0, away_score: 0 });
  });

  it('rejeita palpite após o início do jogo (trava)', async () => {
    const { token, brasil, croacia } = await setup();
    const match = await createMatch({ api_fixture_id: 1, kickoff_at: past(), home_team_id: brasil.id, away_team_id: croacia.id });

    const res = await request(app)
      .post('/predictions')
      .set('Authorization', `Bearer ${token}`)
      .send({ match_id: match.id, home_score: 1, away_score: 0 });

    expect(res.status).toBe(422);
    const count = await db('predictions').count({ c: '*' }).first();
    expect(Number(count.c)).toBe(0);
  });
});

describe('GET /matches', () => {
  it('lista jogos da janela (hoje+amanhã) com times e meu palpite', async () => {
    const { token, brasil, croacia } = await setup();
    const match = await createMatch({ api_fixture_id: 1, kickoff_at: future(10), home_team_id: brasil.id, away_team_id: croacia.id });
    await request(app).post('/predictions').set('Authorization', `Bearer ${token}`).send({ match_id: match.id, home_score: 3, away_score: 1 });

    const res = await request(app).get('/matches').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: match.id,
      home_team: { name: 'Brasil' },
      away_team: { name: 'Croácia' },
      my_prediction: { home_score: 3, away_score: 1 },
    });
  });

  it('mostra palpites de todos só depois do início (trava)', async () => {
    const { token, player, brasil, croacia } = await setup();
    const other = await createPlayer({ email: 'p2@bolao.local' });

    const futuro = await createMatch({ api_fixture_id: 1, kickoff_at: future(5), home_team_id: brasil.id, away_team_id: croacia.id });
    const iniciado = await createMatch({ api_fixture_id: 2, kickoff_at: past(1), home_team_id: brasil.id, away_team_id: croacia.id, status: '1H' });

    await db('predictions').insert([
      { user_id: player.id, match_id: futuro.id, home_score: 1, away_score: 0 },
      { user_id: other.id, match_id: futuro.id, home_score: 2, away_score: 2 },
      { user_id: player.id, match_id: iniciado.id, home_score: 1, away_score: 1 },
      { user_id: other.id, match_id: iniciado.id, home_score: 3, away_score: 0 },
    ]);

    const res = await request(app).get('/matches').set('Authorization', `Bearer ${token}`);
    const byId = Object.fromEntries(res.body.map((m) => [m.id, m]));

    // jogo futuro: não expõe palpites dos outros
    expect(byId[futuro.id].predictions).toBeUndefined();
    // jogo iniciado: expõe todos os palpites
    expect(byId[iniciado.id].predictions).toHaveLength(2);
  });
});
