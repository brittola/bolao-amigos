import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';

/**
 * Cria o usuário admin a partir das variáveis de ambiente.
 * Idempotente: não duplica se o email já existir.
 */
export async function seed(knex) {
  const existing = await knex('users').where({ email: env.admin.email }).first();
  if (existing) return;

  const passwordHash = await bcrypt.hash(env.admin.password, 10);
  await knex('users').insert({
    name: env.admin.name,
    email: env.admin.email,
    password_hash: passwordHash,
    role: 'admin',
  });
}
