import dotenv from 'dotenv';

dotenv.config();

const isTest = process.env.NODE_ENV === 'test';

export const env = {
  nodeEnv: process.env.NODE_ENV,
  isTest,
  port: Number(process.env.PORT),

  databaseUrl: isTest ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL,

  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN,

  // Cron: in-process (hosts always-on) e/ou endpoints disparados por cron externo
  enableCron: process.env.ENABLE_CRON === 'true',
  cronSecret: process.env.CRON_SECRET,

  admin: {
    name: process.env.ADMIN_NAME,
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  },

  apiFootball: {
    key: process.env.API_FOOTBALL_KEY,
    baseUrl: process.env.API_FOOTBALL_BASE_URL,
    league: Number(process.env.API_FOOTBALL_LEAGUE),
    season: Number(process.env.API_FOOTBALL_SEASON),
    dailyCap: Number(process.env.API_FOOTBALL_DAILY_CAP),
  },
};
