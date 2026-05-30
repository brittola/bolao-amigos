import knexFactory from 'knex';
import knexConfig from '../../knexfile.js';

/** Roda migrations no banco de teste antes da suíte. */
export async function setup() {
  const knex = knexFactory(knexConfig);
  await knex.migrate.latest();
  await knex.destroy();
}
