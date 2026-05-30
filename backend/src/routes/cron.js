import { Router } from 'express';
import moment from 'moment';
import { env } from '../config/env.js';
import { syncUpcoming } from '../services/fixtureSync.js';
import { pollResults } from '../services/resultPoller.js';

export const cronRouter = Router();

function log(...args) {
  console.log(`[cron ${moment().toISOString()}]`, ...args);
}

/** Protege os gatilhos de cron com um secret compartilhado (header x-cron-secret). */
cronRouter.use((req, res, next) => {
  const secret = req.get('x-cron-secret');
  if (!env.cronSecret || secret !== env.cronSecret) {
    log(`${req.method} ${req.path} -> 401 (secret inválido ou ausente)`);
    return res.status(401).json({ error: 'Não autorizado' });
  }
  next();
});

/** Sincroniza jogos (hoje + amanhã). Agende 1x/dia. */
cronRouter.post('/sync', async (_req, res) => {
  log('sync iniciado (hoje + amanhã)');
  try {
    const synced = await syncUpcoming();
    log(`sync concluído: ${synced} jogos sincronizados`);
    res.json({ synced });
  } catch (err) {
    log('sync FALHOU:', err.message);
    console.error(err);
    res.status(500).json({ error: 'Falha no sync', detail: err.message });
  }
});

/** Busca resultados dos jogos pendentes. Agende a cada 30 min. */
cronRouter.post('/poll', async (_req, res) => {
  log('poll iniciado');
  try {
    const result = await pollResults();
    log(`poll concluído: ${result.polled} pendentes, ${result.finalized} finalizados`);
    res.json(result);
  } catch (err) {
    log('poll FALHOU:', err.message);
    console.error(err);
    res.status(500).json({ error: 'Falha no poll', detail: err.message });
  }
});
