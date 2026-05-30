import { Router } from 'express';
import { db } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

export const rankingRouter = Router();

rankingRouter.use(authenticate);

/** Tabela de classificação: soma de pontos (jogos + bônus) por usuário. */
rankingRouter.get('/', async (_req, res) => {
  const users = await db('users').select('id', 'name');

  const matchAgg = await db('predictions').select('user_id').sum({ pts: 'points' }).groupBy('user_id');
  const exactAgg = await db('predictions')
    .select('user_id')
    .count({ exact: '*' })
    .where('is_exact', true)
    .groupBy('user_id');
  const bonusAgg = await db('bonus_predictions').select('user_id').sum({ pts: 'points' }).groupBy('user_id');

  const matchPts = Object.fromEntries(matchAgg.map((r) => [r.user_id, Number(r.pts) || 0]));
  const bonusPts = Object.fromEntries(bonusAgg.map((r) => [r.user_id, Number(r.pts) || 0]));
  const exact = Object.fromEntries(exactAgg.map((r) => [r.user_id, Number(r.exact) || 0]));

  const table = users
    .map((u) => ({
      user_id: u.id,
      name: u.name,
      points: (matchPts[u.id] || 0) + (bonusPts[u.id] || 0),
      exact_count: exact[u.id] || 0,
    }))
    .sort((a, b) => b.points - a.points || b.exact_count - a.exact_count || a.name.localeCompare(b.name));

  return res.json(table);
});
