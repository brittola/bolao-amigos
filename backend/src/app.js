import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { matchesRouter } from './routes/matches.js';
import { predictionsRouter } from './routes/predictions.js';
import { rankingRouter } from './routes/ranking.js';
import { cronRouter } from './routes/cron.js';

export const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/auth', authRouter);
app.use('/admin', adminRouter);
app.use('/matches', matchesRouter);
app.use('/predictions', predictionsRouter);
app.use('/ranking', rankingRouter);
app.use('/cron', cronRouter);

// Tratador de erros final
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno' });
});

export default app;
