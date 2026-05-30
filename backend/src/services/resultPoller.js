import moment from 'moment';
import { db } from '../config/db.js';
import { apiFootball } from './apiFootball.js';
import { recomputeMatchPoints } from './points.js';

/** Status considerados finais pela API-Football. */
const FINAL_STATUSES = ['FT', 'AET', 'PEN'];

/** Só checa jogos que já começaram há pelo menos este tempo (horas). */
const POLL_AFTER_HOURS = 2.5;

/** Tamanho máximo de ids por request da API-Football. */
const BATCH_SIZE = 20;

/** Jogos que já passaram do limiar e ainda não têm status final. */
export async function findPendingMatches({ now = moment() } = {}) {
  const threshold = moment(now).subtract(POLL_AFTER_HOURS, 'hours').toISOString();
  return db('matches')
    .where('kickoff_at', '<=', threshold)
    .whereNotIn('status', FINAL_STATUSES)
    .orderBy('kickoff_at');
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Busca resultados dos jogos pendentes em lote. Para cada jogo finalizado,
 * atualiza o placar (origem 'api') e recalcula os pontos. Não chama a API
 * se não houver jogo pendente. Preserva placares com origem manual.
 */
export async function pollResults({ client = apiFootball, now = moment() } = {}) {
  const pending = await findPendingMatches({ now });
  if (pending.length === 0) {
    return { polled: 0, finalized: 0 };
  }

  const ids = pending.map((m) => m.api_fixture_id);
  const fixtures = [];
  for (const group of chunk(ids, BATCH_SIZE)) {
    const part = await client.getFixturesByIds(group);
    fixtures.push(...part);
  }

  let finalized = 0;
  for (const fx of fixtures) {
    const short = fx.fixture?.status?.short;
    if (!FINAL_STATUSES.includes(short)) continue;

    const match = pending.find((m) => m.api_fixture_id === fx.fixture.id);
    if (!match || match.score_source === 'manual') continue;

    await db('matches').where({ id: match.id }).update({
      status: short,
      home_score: fx.goals?.home ?? null,
      away_score: fx.goals?.away ?? null,
      score_source: 'api',
      updated_at: db.fn.now(),
    });
    await recomputeMatchPoints(match.id);
    finalized += 1;
  }

  return { polled: pending.length, finalized };
}
