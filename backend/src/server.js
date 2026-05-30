import { app } from './app.js';
import { env } from './config/env.js';
import { startCron } from './cron/index.js';

app.listen(env.port, () => {
  console.log(`API do bolão rodando em http://localhost:${env.port}`);
  if (env.enableCron) {
    startCron();
  } else {
    console.log('[cron] node-cron desligado (ENABLE_CRON=false) — use os endpoints /cron/*');
  }
});
