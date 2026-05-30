import { env } from './src/config/env.js';

// Postgres gerenciado (Neon, Supabase, Render) exige SSL em produção.
const connection =
  env.nodeEnv === 'production'
    ? { connectionString: env.databaseUrl, ssl: { rejectUnauthorized: false } }
    : env.databaseUrl;

/** @type {import('knex').Knex.Config} */
const config = {
  client: 'pg',
  connection,
  pool: { min: 0, max: 10 },
  migrations: {
    directory: './src/db/migrations',
  },
  seeds: {
    directory: './src/db/seeds',
  },
};

export default config;
