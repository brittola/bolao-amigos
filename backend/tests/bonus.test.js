import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { db } from '../src/config/db.js';
import { signToken } from '../src/middleware/auth.js';
import { resetDb, createPlayer, createMatch } from './helpers/db.js';

function future(h = 24) {
  return new Date(Date.now() + h * 3600 * 1000).toISOString();
}
function past(h = 1) {
  return new Date(Date.now() - h * 3600 * 1000).toISOString();
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await db.destroy();
});

describe('POST /predictions/bonus', () => {
  it('cria e atualiza palpite bonus (upsert)', async () => {
    const player = await createPlayer({ email: 'p@bolao.local' });
    const token = signToken(player);

    let res = await request(app)
      .post('/predictions/bonus')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'champion', value: 'Brasil' });
    expect(res.status).toBe(201);

    res = await request(app)
      .post('/predictions/bonus')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'champion', value: 'Argentina' });
    expect(res.status).toBe(201);

    const rows = await db('bonus_predictions').where({ user_id: player.id, type: 'champion' });
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe('Argentina');
  });

  it('rejeita tipo invalido', async () => {
    const player = await createPlayer({ email: 'p@bolao.local' });
    const token = signToken(player);
    const res = await request(app)
      .post('/predictions/bonus')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'qualquer', value: 'x' });
    expect(res.status).toBe(400);
  });

  it('permite enquanto a primeira partida nao começou', async () => {
    const player = await createPlayer({ email: 'p@bolao.local' });
    const token = signToken(player);
    await createMatch({ api_fixture_id: 1, kickoff_at: future(48) });

    const res = await request(app)
      .post('/predictions/bonus')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'champion', value: 'Brasil' });
    expect(res.status).toBe(201);
  });

  it('trava o palpite bonus apos o inicio da primeira partida da copa', async () => {
    const player = await createPlayer({ email: 'p@bolao.local' });
    const token = signToken(player);
    await createMatch({ api_fixture_id: 1, kickoff_at: past(2) });
    await createMatch({ api_fixture_id: 2, kickoff_at: future(48) });

    const res = await request(app)
      .post('/predictions/bonus')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'champion', value: 'Brasil' });
    expect(res.status).toBe(422);
  });

  it('trava o palpite bonus depois que o resultado foi publicado', async () => {
    const player = await createPlayer({ email: 'p@bolao.local' });
    const token = signToken(player);
    await db('bonus_results').insert({ type: 'champion', value: 'Brasil' });

    const res = await request(app)
      .post('/predictions/bonus')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'champion', value: 'Argentina' });
    expect(res.status).toBe(422);
  });
});
