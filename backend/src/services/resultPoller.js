import moment from 'moment';
import { db } from '../config/db.js';
import { resolveProvider } from './footballProvider.js';
import { recomputeMatchPoints } from './points.js';

/** Status considerados finais pela API-Football. */
const FINAL_STATUSES = ['FT', 'AET', 'PEN'];

/** Só checa jogos que já começaram há pelo menos este tempo (horas). */
const POLL_AFTER_HOURS = 2.5;

/** Brasil não observa horário de verão desde 2019: BRT é fixo em UTC-3. */
const BRT_OFFSET_MIN = -180;

/** Data-calendário (YYYY-MM-DD) de um instante no fuso de Brasília — como a API agrupa por data. */
function brtDate(instant) {
  return moment(instant).utcOffset(BRT_OFFSET_MIN).format('YYYY-MM-DD');
}

/** Jogos que já passaram do limiar e ainda não têm status final. */
export async function findPendingMatches({ now = moment() } = {}) {
  const threshold = moment(now).subtract(POLL_AFTER_HOURS, 'hours').toISOString();
  return db('matches')
    .where('kickoff_at', '<=', threshold)
    .whereNotIn('status', FINAL_STATUSES)
    .orderBy('kickoff_at');
}

/**
 * Busca resultados dos jogos pendentes. Para cada jogo finalizado, atualiza o
 * placar (origem 'api') e recalcula os pontos. Não chama a API se não houver jogo
 * pendente. Preserva placares com origem manual.
 *
 * Consulta por DATA (não por `ids`): o plano free da API-Football bloqueia o
 * parâmetro `ids`, então reusamos o mesmo caminho do sync — buscar os jogos da
 * Copa de cada data BRT pendente e cruzar pelo fixture id. Jogos já finalizados
 * não entram em `findPendingMatches`, então não são reprocessados.
 */
export async function pollResults({ client = resolveProvider(), now = moment() } = {}) {
  const pending = await findPendingMatches({ now });
  if (pending.length === 0) {
    return { polled: 0, finalized: 0 };
  }

  const dates = [...new Set(pending.map((m) => brtDate(m.kickoff_at)))];
  const byFixtureId = new Map();
  for (const date of dates) {
    const fixtures = await client.getFixturesByDate(date);
    for (const fx of fixtures) byFixtureId.set(fx.fixture.id, fx);
  }

  let finalized = 0;
  for (const match of pending) {
    const fx = byFixtureId.get(match.api_fixture_id);
    if (!fx) {
      // Sem fixture na data: provavelmente fora da janela de ~3 dias do plano free.
      // Não dá pra confirmar via API; resolver pelo placar manual (admin).
      console.warn(
        `[poll] jogo ${match.api_fixture_id} (${brtDate(match.kickoff_at)}) pendente sem fixture na API — fora da janela do plano free?`,
      );
      continue;
    }

    const short = fx.fixture?.status?.short;
    if (!FINAL_STATUSES.includes(short)) continue;
    if (match.score_source === 'manual') continue;

    await db('matches').where({ id: match.id }).update({
      status: short,
      home_score: fx.goals?.home ?? null,
      away_score: fx.goals?.away ?? null,
      home_penalties: fx.score?.penalty?.home ?? null,
      away_penalties: fx.score?.penalty?.away ?? null,
      score_source: 'api',
      updated_at: db.fn.now(),
    });
    await recomputeMatchPoints(match.id);
    finalized += 1;
  }

  return { polled: pending.length, finalized };
}
