import bcrypt from 'bcryptjs';
import { db } from '../../src/config/db.js';
import { env } from '../../src/config/env.js';

const TABLES = [
  'predictions',
  'bonus_predictions',
  'bonus_results',
  'invites',
  'matches',
  'teams',
  'api_usage',
  'users',
];

/** Limpa todas as tabelas e reinicia os ids. */
export async function resetDb() {
  await db.raw(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
}

/** Cria o usuário admin e retorna o registro. */
export async function createAdmin() {
  const password_hash = await bcrypt.hash(env.admin.password, 10);
  const [user] = await db('users')
    .insert({
      name: env.admin.name,
      email: env.admin.email,
      password_hash,
      role: 'admin',
    })
    .returning('*');
  return user;
}

/** Cria um time e retorna o registro. */
export async function createTeam({ api_team_id, name, logo_url = null }) {
  const [team] = await db('teams')
    .insert({ api_team_id, name, logo_url })
    .returning('*');
  return team;
}

/** Cria um jogo e retorna o registro. */
export async function createMatch({
  api_fixture_id,
  kickoff_at,
  home_team_id = null,
  away_team_id = null,
  round = 'Group Stage - 1',
  status = 'NS',
  home_score = null,
  away_score = null,
} = {}) {
  const [match] = await db('matches')
    .insert({ api_fixture_id, kickoff_at, home_team_id, away_team_id, round, status, home_score, away_score })
    .returning('*');
  return match;
}

/** Cria um jogador qualquer e retorna o registro. */
export async function createPlayer({ name = 'Jogador', email = 'jogador@bolao.local', password = 'senha123' } = {}) {
  const password_hash = await bcrypt.hash(password, 10);
  const [user] = await db('users')
    .insert({ name, email, password_hash, role: 'player' })
    .returning('*');
  return user;
}
