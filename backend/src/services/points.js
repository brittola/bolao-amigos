import { db } from '../config/db.js';
import { RULES, computeMatchPoints, computeBonusPoints } from '../config/scoring.js';

/**
 * Recalcula e salva os pontos de todos os palpites de um jogo finalizado.
 * Idempotente: pode ser chamado novamente (ex.: após correção manual de placar).
 */
export async function recomputeMatchPoints(matchId) {
  const match = await db('matches').where({ id: matchId }).first();
  if (!match || match.home_score == null || match.away_score == null) return;

  const result = { home_score: match.home_score, away_score: match.away_score };
  const predictions = await db('predictions').where({ match_id: matchId });

  for (const p of predictions) {
    const points = computeMatchPoints(p, result);
    const is_exact = points === RULES.exactScore;
    await db('predictions').where({ id: p.id }).update({ points, is_exact });
  }
}

/** Recalcula e salva os pontos dos palpites bônus de um tipo (champion/top_scorer). */
export async function recomputeBonusPoints(type) {
  const result = await db('bonus_results').where({ type }).first();
  const predictions = await db('bonus_predictions').where({ type });

  for (const p of predictions) {
    const points = computeBonusPoints(p, result);
    await db('bonus_predictions').where({ id: p.id }).update({ points });
  }
}
