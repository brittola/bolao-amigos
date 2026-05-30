import axios from 'axios';
import moment from 'moment';
import { db } from '../config/db.js';
import { env } from '../config/env.js';

function todayStr() {
  return moment().format('YYYY-MM-DD');
}

/**
 * Reserva uma chamada à API-Football respeitando o teto diário.
 * Incrementa o contador do dia de forma atômica; lança se o teto foi atingido.
 */
export async function reserveRequest() {
  const date = todayStr();
  const row = await db('api_usage').where({ date }).first();
  const current = row ? row.count : 0;
  if (current >= env.apiFootball.dailyCap) {
    throw new Error(
      `Limite diário de requests da API-Football atingido (${env.apiFootball.dailyCap})`,
    );
  }
  await db('api_usage')
    .insert({ date, count: 1 })
    .onConflict('date')
    .merge({ count: db.raw('api_usage.count + 1') });
}

function defaultHttp() {
  return axios.create({
    baseURL: env.apiFootball.baseUrl,
    headers: { 'x-apisports-key': env.apiFootball.key },
    timeout: 15000,
  });
}

/**
 * Cliente da API-Football. Toda chamada reserva uma request antes de ir à rede.
 * `http` e `reserve` são injetáveis para teste.
 */
export function createApiFootball({ http = defaultHttp(), reserve = reserveRequest } = {}) {
  const { league } = env.apiFootball;

  async function call(params) {
    await reserve();
    const { data } = await http.get('/fixtures', { params });
    return data.response;
  }

  return {
    // O plano free bloqueia `season` explícito mas permite buscar por data (janela ~hoje±1).
    // Buscamos todos os jogos da data e filtramos a Copa pela league.id no nosso lado.
    async getFixturesByDate(date) {
      const all = await call({ date });
      return all.filter((f) => f.league?.id === league);
    },
    getFixturesByIds(ids) {
      return call({ ids: ids.join('-') });
    },
  };
}

export const apiFootball = createApiFootball();
