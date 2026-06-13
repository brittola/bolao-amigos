/**
 * Placar de pênaltis dos jogos de mata-mata. O placar normal/prorrogação
 * (home_score/away_score) segue sendo o que pontua o bolão; os pênaltis ficam
 * à parte só para registrar e exibir quem avançou (status 'PEN').
 */

export async function up(knex) {
  await knex.schema.alterTable('matches', (t) => {
    t.integer('home_penalties');
    t.integer('away_penalties');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('matches', (t) => {
    t.dropColumn('home_penalties');
    t.dropColumn('away_penalties');
  });
}
