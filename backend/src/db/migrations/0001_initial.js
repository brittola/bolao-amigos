/**
 * Schema inicial do bolão: usuários, convites, times, jogos, palpites,
 * palpites bônus, resultados de bônus e contador de uso da API.
 */

export async function up(knex) {
  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.string('name').notNullable();
    t.string('email').notNullable().unique();
    t.string('password_hash').notNullable();
    t.enu('role', ['admin', 'player']).notNullable().defaultTo('player');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('invites', (t) => {
    t.increments('id').primary();
    t.string('code').notNullable().unique();
    t.integer('created_by').notNullable().references('id').inTable('users');
    t.integer('used_by').nullable().references('id').inTable('users');
    t.timestamp('expires_at').nullable();
    t.timestamp('used_at').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('teams', (t) => {
    t.increments('id').primary();
    t.integer('api_team_id').notNullable().unique();
    t.string('name').notNullable();
    t.string('logo_url').nullable();
  });

  await knex.schema.createTable('matches', (t) => {
    t.increments('id').primary();
    t.integer('api_fixture_id').notNullable().unique();
    t.string('round').nullable();
    t.integer('home_team_id').nullable().references('id').inTable('teams');
    t.integer('away_team_id').nullable().references('id').inTable('teams');
    t.timestamp('kickoff_at').notNullable();
    t.string('status').notNullable().defaultTo('NS'); // NS, 1H, HT, FT, AET, PEN, etc.
    t.integer('home_score').nullable();
    t.integer('away_score').nullable();
    t.enu('score_source', ['api', 'manual']).nullable();
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.index('kickoff_at');
  });

  await knex.schema.createTable('predictions', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.integer('match_id').notNullable().references('id').inTable('matches').onDelete('CASCADE');
    t.integer('home_score').notNullable();
    t.integer('away_score').notNullable();
    t.integer('points').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['user_id', 'match_id']);
  });

  await knex.schema.createTable('bonus_predictions', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.enu('type', ['champion', 'top_scorer']).notNullable();
    t.string('value').notNullable();
    t.integer('points').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['user_id', 'type']);
  });

  await knex.schema.createTable('bonus_results', (t) => {
    t.increments('id').primary();
    t.enu('type', ['champion', 'top_scorer']).notNullable().unique();
    t.string('value').notNullable();
    t.integer('set_by').nullable().references('id').inTable('users');
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('api_usage', (t) => {
    t.date('date').primary();
    t.integer('count').notNullable().defaultTo(0);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('api_usage');
  await knex.schema.dropTableIfExists('bonus_results');
  await knex.schema.dropTableIfExists('bonus_predictions');
  await knex.schema.dropTableIfExists('predictions');
  await knex.schema.dropTableIfExists('matches');
  await knex.schema.dropTableIfExists('teams');
  await knex.schema.dropTableIfExists('invites');
  await knex.schema.dropTableIfExists('users');
}
