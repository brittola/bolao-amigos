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
