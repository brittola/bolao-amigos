/**
 * Persiste se cada palpite acertou o placar exato. Usado como critério de
 * desempate no ranking (quantidade de placares exatos por usuário).
 */

export async function up(knex) {
  await knex.schema.alterTable('predictions', (t) => {
    t.boolean('is_exact').notNullable().defaultTo(false);
  });
}

export async function down(knex) {
  await knex.schema.alterTable('predictions', (t) => {
    t.dropColumn('is_exact');
  });
}
