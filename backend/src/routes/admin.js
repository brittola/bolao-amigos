import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { db } from '../config/db.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { recomputeMatchPoints, recomputeBonusPoints } from '../services/points.js';
import { syncUpcoming, syncFixtures } from '../services/fixtureSync.js';

export const adminRouter = Router();

adminRouter.use(authenticate, requireAdmin);

/** Gera um código de convite. Aceita expires_at opcional (ISO). */
adminRouter.post('/invites', async (req, res) => {
  const { expires_at } = req.body || {};
  const code = randomBytes(6).toString('hex');

  const [invite] = await db('invites')
    .insert({
      code,
      created_by: req.user.id,
      expires_at: expires_at || null,
    })
    .returning('*');

  return res.status(201).json(invite);
});

const FINAL_STATUSES = ['FT', 'AET', 'PEN'];

/** Correção manual do placar de um jogo → marca origem 'manual' e recomputa pontos. */
adminRouter.patch('/matches/:id/score', async (req, res) => {
  const { home_score, away_score, status, home_penalties, away_penalties } = req.body || {};
  if (!Number.isInteger(home_score) || !Number.isInteger(away_score)) {
    return res.status(400).json({ error: 'Placar inválido' });
  }
  const finalStatus = FINAL_STATUSES.includes(status) ? status : 'FT';

  const updated = await db('matches')
    .where({ id: req.params.id })
    .update({
      home_score,
      away_score,
      status: finalStatus,
      // pênaltis só fazem sentido no mata-mata; aceitos como inteiros, senão zerados
      home_penalties: Number.isInteger(home_penalties) ? home_penalties : null,
      away_penalties: Number.isInteger(away_penalties) ? away_penalties : null,
      score_source: 'manual',
      updated_at: db.fn.now(),
    })
    .returning('*');

  if (updated.length === 0) {
    return res.status(404).json({ error: 'Jogo não encontrado' });
  }

  await recomputeMatchPoints(Number(req.params.id));
  return res.json(updated[0]);
});

const BONUS_TYPES = ['champion', 'top_scorer'];

/** Define o resultado bônus (campeão/artilheiro) → recomputa os palpites bônus. */
adminRouter.put('/bonus-results', async (req, res) => {
  const { type, value } = req.body || {};
  if (!BONUS_TYPES.includes(type) || !value) {
    return res.status(400).json({ error: 'Resultado bônus inválido' });
  }

  await db('bonus_results')
    .insert({ type, value, set_by: req.user.id, updated_at: db.fn.now() })
    .onConflict('type')
    .merge({ value, set_by: req.user.id, updated_at: db.fn.now() });

  await recomputeBonusPoints(type);
  return res.json({ type, value });
});

/**
 * Dispara a sincronização de jogos sob demanda.
 * - Sem body: hoje + amanhã.
 * - { date: 'YYYY-MM-DD' }: sincroniza uma data específica (útil para testar/pré-carregar).
 */
adminRouter.post('/sync', async (req, res) => {
  const { date } = req.body || {};
  const count = date ? await syncFixtures(date) : await syncUpcoming();
  return res.json({ synced: count, date: date || null });
});
