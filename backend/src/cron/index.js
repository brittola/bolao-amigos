import cron from 'node-cron';
import { syncUpcoming } from '../services/fixtureSync.js';
import { pollResults } from '../services/resultPoller.js';

/**
 * Agenda as tarefas em background:
 *  - Sync de jogos (hoje + amanhã): 1x/dia às 06:00. Captura confrontos do mata-mata.
 *  - Busca de resultados: a cada 30 min (só chama a API se houver jogo pendente).
 */
export function startCron() {
  cron.schedule('0 6 * * *', async () => {
    try {
      const synced = await syncUpcoming();
      console.log(`[cron] sync de jogos concluído: ${synced} jogos`);
    } catch (err) {
      console.error('[cron] erro no sync de jogos:', err.message);
    }
  });

  cron.schedule('*/30 * * * *', async () => {
    try {
      const { polled, finalized } = await pollResults();
      if (polled > 0) {
        console.log(`[cron] resultados: ${polled} pendentes, ${finalized} finalizados`);
      }
    } catch (err) {
      console.error('[cron] erro na busca de resultados:', err.message);
    }
  });

  console.log('[cron] tarefas agendadas');
}
