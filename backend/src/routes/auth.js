import { Router } from 'express';
import bcrypt from 'bcryptjs';
import moment from 'moment';
import { db } from '../config/db.js';
import { signToken, publicUser } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  const user = await db('users').where({ email }).first();
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  return res.json({ token: signToken(user), user: publicUser(user) });
});

authRouter.post('/register', async (req, res) => {
  const { name, email, password, code } = req.body || {};
  if (!name || !email || !password || !code) {
    return res.status(400).json({ error: 'Nome, email, senha e convite são obrigatórios' });
  }

  const invite = await db('invites').where({ code }).first();
  if (!invite || invite.used_at) {
    return res.status(400).json({ error: 'Convite inválido ou já utilizado' });
  }
  if (invite.expires_at && moment(invite.expires_at).isBefore(moment())) {
    return res.status(400).json({ error: 'Convite expirado' });
  }

  const existing = await db('users').where({ email }).first();
  if (existing) {
    return res.status(400).json({ error: 'Email já cadastrado' });
  }

  const password_hash = await bcrypt.hash(password, 10);

  const user = await db.transaction(async (trx) => {
    const [created] = await trx('users')
      .insert({ name, email, password_hash, role: 'player' })
      .returning('*');
    await trx('invites')
      .where({ id: invite.id })
      .update({ used_by: created.id, used_at: trx.fn.now() });
    return created;
  });

  return res.status(201).json({ token: signToken(user), user: publicUser(user) });
});
