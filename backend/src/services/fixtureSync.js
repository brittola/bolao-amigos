import moment from 'moment';
import { db } from '../config/db.js';
import { resolveProvider } from './footballProvider.js';

/** Faz upsert de um time da API e retorna o id local (ou null se TBD). */
async function upsertTeam(team, trx) {
  if (!team || team.id == null) return null;
  const [row] = await trx('teams')
    .insert({ api_team_id: team.id, name: team.name, logo_url: team.logo })
    .onConflict('api_team_id')
    .merge({ name: team.name, logo_url: team.logo })
    .returning('id');
  return row.id;
}

/**
 * Faz upsert de um fixture da API-Football (time + jogo) numa transação.
 * Atualiza confrontos TBD do mata-mata quando os times passam a ser definidos.
 */
export async function upsertFixture(fx) {
  return db.transaction(async (trx) => {
    const homeId = await upsertTeam(fx.teams?.home, trx);
    const awayId = await upsertTeam(fx.teams?.away, trx);

    const data = {
      api_fixture_id: fx.fixture.id,
      round: fx.league?.round ?? null,
      home_team_id: homeId,
      away_team_id: awayId,
      kickoff_at: fx.fixture.date,
      status: fx.fixture.status?.short ?? 'NS',
      home_score: fx.goals?.home ?? null,
      away_score: fx.goals?.away ?? null,
      updated_at: trx.fn.now(),
    };

    const [row] = await trx('matches')
      .insert(data)
      .onConflict('api_fixture_id')
      .merge({
        round: data.round,
        home_team_id: data.home_team_id,
        away_team_id: data.away_team_id,
        kickoff_at: data.kickoff_at,
        status: data.status,
        updated_at: data.updated_at,
        // placar não é sobrescrito aqui (preserva correção manual); ver resultPoller
      })
      .returning('*');
    return row;
  });
}

/** Busca os jogos de uma data na API e faz upsert de todos. Retorna a quantidade. */
export async function syncFixtures(date, { client = resolveProvider() } = {}) {
  const fixtures = await client.getFixturesByDate(date);
  for (const fx of fixtures) {
    await upsertFixture(fx);
  }
  return fixtures.length;
}

/** Sincroniza hoje + próximos N dias (default 1 = hoje e amanhã). */
export async function syncUpcoming({ days = 1, client = resolveProvider(), now = moment() } = {}) {
  let total = 0;
  for (let i = 0; i <= days; i++) {
    const date = moment(now).add(i, 'days').format('YYYY-MM-DD');
    total += await syncFixtures(date, { client });
  }
  return total;
}
