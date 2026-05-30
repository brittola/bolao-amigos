import { Router } from 'express';
import moment from 'moment';
import { db } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

export const matchesRouter = Router();

matchesRouter.use(authenticate);

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
  const start = moment().startOf('day');
  const end = moment(start).add(2, 'days');

  const rows = await db('matches as m')
    .leftJoin('teams as ht', 'm.home_team_id', 'ht.id')
    .leftJoin('teams as at', 'm.away_team_id', 'at.id')
    .where('m.kickoff_at', '>=', start.toISOString())
    .andWhere('m.kickoff_at', '<', end.toISOString())
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
