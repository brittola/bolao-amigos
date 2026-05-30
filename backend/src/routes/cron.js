import { Router } from 'express';
import { env } from '../config/env.js';
import { syncUpcoming } from '../services/fixtureSync.js';
import { pollResults } from '../services/resultPoller.js';

export const cronRouter = Router();

/** Protege os gatilhos de cron com um secret compartilhado (header x-cron-secret). */
cronRouter.use((req, res, next) => {
  const secret = req.get('x-cron-secret');
  if (!env.cronSecret || secret !== env.cronSecret) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  next();
});

/** Sincroniza jogos (hoje + amanhã). Agende 1x/dia. */
cronRouter.post('/sync', async (_req, res) => {
  const synced = await syncUpcoming();
  res.json({ synced });
});

/** Busca resultados dos jogos pendentes. Agende a cada 30 min. */
cronRouter.post('/poll', async (_req, res) => {
  const result = await pollResults();
  res.json(result);
});
