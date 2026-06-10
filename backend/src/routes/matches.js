import { Router } from 'express';
import moment from 'moment';
import { db } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

export const matchesRouter = Router();

matchesRouter.use(authenticate);

// Brasil não observa horário de verão desde 2019: BRT é fixo em UTC-3.
const BRT_OFFSET_MIN = -180;
// A agenda do dia vai de 01:00 BRT até 01:00 BRT do dia seguinte: jogos da
// madrugada (00:00–00:59) contam como a noite do dia anterior.
const DAY_START_HOUR = 1;

/**
 * Janela "hoje + amanhã" em horário de Brasília, retornada como ISO em UTC.
 * O servidor (Render) roda em UTC; calcular o dia no fuso do servidor perde jogos
 * noturnos cujo horário BRT vira o dia em UTC (ex.: 23h BRT = 02h UTC do dia
 * seguinte). Mesmo motivo do `timezone` no getFixturesByDate da sync.
 *
 * O dia começa às 01:00 BRT (não meia-noite); por isso subtraímos a hora de corte
 * antes do startOf e a somamos de volta — assim 00:30 BRT cai no dia anterior.
 */
export function brtDayWindow(now = moment()) {
  const start = moment(now)
    .utcOffset(BRT_OFFSET_MIN)
    .subtract(DAY_START_HOUR, 'hours')
    .startOf('day')
    .add(DAY_START_HOUR, 'hours');
  const end = moment(start).add(2, 'days');
  return { start: start.toISOString(), end: end.toISOString() };
}

function team(row, prefix) {
  if (row[`${prefix}_id`] == null) return null;
  return {
    id: row[`${prefix}_id`],
    name: row[`${prefix}_name`],
    logo_url: row[`${prefix}_logo`],
  };
}

/** Jogos de hoje + amanhã, com times, meu palpite e (se travado) os palpites de todos. */
matchesRouter.get('/', async (req, res) => {
  const now = moment();
  const { start, end } = brtDayWindow(now);

  const rows = await db('matches as m')
    .leftJoin('teams as ht', 'm.home_team_id', 'ht.id')
    .leftJoin('teams as at', 'm.away_team_id', 'at.id')
    .where('m.kickoff_at', '>=', start)
    .andWhere('m.kickoff_at', '<', end)
    .orderBy('m.kickoff_at')
    .select(
      'm.*',
      'ht.id as home_id', 'ht.name as home_name', 'ht.logo_url as home_logo',
      'at.id as away_id', 'at.name as away_name', 'at.logo_url as away_logo',
    );

  const matchIds = rows.map((r) => r.id);
  const lockedIds = rows.filter((r) => moment(r.kickoff_at).isSameOrBefore(now)).map((r) => r.id);

  const mine = matchIds.length
    ? await db('predictions').where('user_id', req.user.id).whereIn('match_id', matchIds)
    : [];
  const myByMatch = Object.fromEntries(mine.map((p) => [p.match_id, p]));

  const allLocked = lockedIds.length
    ? await db('predictions as p')
        .join('users as u', 'p.user_id', 'u.id')
        .whereIn('p.match_id', lockedIds)
        .select('p.match_id', 'p.user_id', 'p.home_score', 'p.away_score', 'p.points', 'u.name as user_name')
    : [];
  const lockedByMatch = {};
  for (const p of allLocked) {
    (lockedByMatch[p.match_id] ||= []).push(p);
  }

  const result = rows.map((r) => {
    const locked = moment(r.kickoff_at).isSameOrBefore(now);
    const mp = myByMatch[r.id];
    return {
      id: r.id,
      api_fixture_id: r.api_fixture_id,
      round: r.round,
      kickoff_at: r.kickoff_at,
      status: r.status,
      home_score: r.home_score,
      away_score: r.away_score,
      home_team: team(r, 'home'),
      away_team: team(r, 'away'),
      locked,
      my_prediction: mp
        ? { home_score: mp.home_score, away_score: mp.away_score, points: mp.points }
        : null,
      ...(locked ? { predictions: lockedByMatch[r.id] || [] } : {}),
    };
  });

  return res.json(result);
});
