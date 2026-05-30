import { Router } from 'express';
import moment from 'moment';
import { db } from '../config/db.js';
import { authenticate } from '../middleware/auth.js';

export const predictionsRouter = Router();

predictionsRouter.use(authenticate);

function isValidScore(n) {
  return Number.isInteger(n) && n >= 0;
}

/** Cria ou atualiza o palpite do usuário para um jogo (trava no início). */
predictionsRouter.post('/', async (req, res) => {
  const { match_id, home_score, away_score } = req.body || {};
  if (!isValidScore(home_score) || !isValidScore(away_score)) {
    return res.status(400).json({ error: 'Placar inválido' });
  }

  const match = await db('matches').where({ id: match_id }).first();
  if (!match) {
    return res.status(404).json({ error: 'Jogo não encontrado' });
  }
  if (moment(match.kickoff_at).isSameOrBefore(moment())) {
    return res.status(422).json({ error: 'Palpites encerrados: o jogo já começou' });
  }

  const [row] = await db('predictions')
    .insert({ user_id: req.user.id, match_id, home_score, away_score })
    .onConflict(['user_id', 'match_id'])
    .merge({ home_score, away_score, updated_at: db.fn.now() })
    .returning('*');

  return res.status(201).json(row);
});

/** Lista os palpites do usuário autenticado. */
predictionsRouter.get('/me', async (req, res) => {
  const rows = await db('predictions').where({ user_id: req.user.id });
  return res.json(rows);
});

const BONUS_TYPES = ['champion', 'top_scorer'];

/** Cria ou atualiza um palpite bônus (campeão/artilheiro). Trava quando o resultado é publicado. */
predictionsRouter.post('/bonus', async (req, res) => {
  const { type, value } = req.body || {};
  if (!BONUS_TYPES.includes(type) || !value) {
    return res.status(400).json({ error: 'Palpite bônus inválido' });
  }

  // Bônus travam no início da primeira partida da Copa (menor kickoff no banco).
  const first = await db('matches').min({ k: 'kickoff_at' }).first();
  if (first?.k && moment(first.k).isSameOrBefore(moment())) {
    return res.status(422).json({ error: 'Palpites bônus encerrados: a Copa já começou' });
  }

  const result = await db('bonus_results').where({ type }).first();
  if (result) {
    return res.status(422).json({ error: 'Palpites bônus encerrados para este tipo' });
  }

  const [row] = await db('bonus_predictions')
    .insert({ user_id: req.user.id, type, value })
    .onConflict(['user_id', 'type'])
    .merge({ value, updated_at: db.fn.now() })
    .returning('*');

  return res.status(201).json(row);
});

/** Lista os palpites bônus do usuário autenticado. */
predictionsRouter.get('/bonus', async (req, res) => {
  const rows = await db('bonus_predictions').where({ user_id: req.user.id });
  return res.json(rows);
});
