import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { RULES } from '../config/scoring.js';

export const rulesRouter = Router();

rulesRouter.use(authenticate);

/** Regras de pontuação (valores de RULES) para exibição no app. */
rulesRouter.get('/', (_req, res) => {
  return res.json(RULES);
});
