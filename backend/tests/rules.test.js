import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { db } from '../src/config/db.js';
import { RULES } from '../src/config/scoring.js';
import { signToken } from '../src/middleware/auth.js';
import { resetDb, createPlayer } from './helpers/db.js';

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await db.destroy();
});

describe('GET /rules', () => {
  it('exige autenticação', async () => {
    const res = await request(app).get('/rules');
    expect(res.status).toBe(401);
  });

  it('retorna o objeto RULES para usuário autenticado', async () => {
    const player = await createPlayer({ email: 'p@bolao.local' });
    const token = signToken(player);

    const res = await request(app).get('/rules').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(RULES);
  });
});
