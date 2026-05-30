import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { db } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { resetDb, createAdmin } from './helpers/db.js';

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await db.destroy();
});

async function loginAdmin() {
  await createAdmin();
  const res = await request(app)
    .post('/auth/login')
    .send({ email: env.admin.email, password: env.admin.password });
  return res.body.token;
}

describe('POST /auth/login', () => {
  it('loga o admin com credenciais corretas', async () => {
    await createAdmin();
    const res = await request(app)
      .post('/auth/login')
      .send({ email: env.admin.email, password: env.admin.password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toMatchObject({ email: env.admin.email, role: 'admin' });
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('rejeita senha incorreta com 401', async () => {
    await createAdmin();
    const res = await request(app)
      .post('/auth/login')
      .send({ email: env.admin.email, password: 'errada' });
    expect(res.status).toBe(401);
  });
});

describe('POST /admin/invites', () => {
  it('admin gera convite', async () => {
    const token = await loginAdmin();
    const res = await request(app)
      .post('/admin/invites')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.code).toBeTruthy();
  });

  it('sem token retorna 401', async () => {
    const res = await request(app).post('/admin/invites').send({});
    expect(res.status).toBe(401);
  });

  it('jogador comum nao gera convite (403)', async () => {
    const token = await loginAdmin();
    // registra um jogador via convite e tenta gerar convite com ele
    const invite = await request(app)
      .post('/admin/invites')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const reg = await request(app).post('/auth/register').send({
      name: 'Maria',
      email: 'maria@bolao.local',
      password: 'senha123',
      code: invite.body.code,
    });
    const res = await request(app)
      .post('/admin/invites')
      .set('Authorization', `Bearer ${reg.body.token}`)
      .send({});
    expect(res.status).toBe(403);
  });
});

describe('POST /auth/register', () => {
  it('registra jogador com convite valido e marca convite como usado', async () => {
    const token = await loginAdmin();
    const invite = await request(app)
      .post('/admin/invites')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const code = invite.body.code;

    const res = await request(app).post('/auth/register').send({
      name: 'João',
      email: 'joao@bolao.local',
      password: 'senha123',
      code,
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toMatchObject({ email: 'joao@bolao.local', role: 'player' });

    const used = await db('invites').where({ code }).first();
    expect(used.used_at).toBeTruthy();
    expect(used.used_by).toBe(res.body.user.id);
  });

  it('rejeita codigo inexistente', async () => {
    const res = await request(app).post('/auth/register').send({
      name: 'X',
      email: 'x@bolao.local',
      password: 'senha123',
      code: 'NAO-EXISTE',
    });
    expect(res.status).toBe(400);
  });

  it('rejeita convite ja usado', async () => {
    const token = await loginAdmin();
    const invite = await request(app)
      .post('/admin/invites')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const code = invite.body.code;

    await request(app).post('/auth/register').send({
      name: 'A', email: 'a@bolao.local', password: 'senha123', code,
    });
    const res = await request(app).post('/auth/register').send({
      name: 'B', email: 'b@bolao.local', password: 'senha123', code,
    });
    expect(res.status).toBe(400);
  });
});
