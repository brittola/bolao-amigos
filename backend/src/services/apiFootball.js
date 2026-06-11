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
    // A API responde 200 mesmo em falha lógica (plano/parâmetro/cota), sinalizando
    // só via `errors` (objeto/array não-vazio). Sem isso, falhas passavam caladas
    // e o poll voltava "0 finalizados" como se tudo estivesse ok.
    const errors = data?.errors;
    const hasErrors = Array.isArray(errors) ? errors.length > 0 : errors && Object.keys(errors).length > 0;
    if (hasErrors) {
      throw new Error(`API-Football retornou erro: ${JSON.stringify(errors)}`);
    }
    return data.response;
  }

  return {
    // O plano free bloqueia `season` explícito mas permite buscar por data (janela ~hoje±1).
    // `timezone` alinha o filtro de data ao horário de Brasília: sem ele a API filtra por
    // data UTC e perde jogos noturnos (ex.: 23h BRT = 02h UTC do dia seguinte).
    // Buscamos todos os jogos da data e filtramos a Copa pela league.id no nosso lado.
    async getFixturesByDate(date) {
      const all = await call({ date, timezone: 'America/Sao_Paulo' });
      return all.filter((f) => f.league?.id === league);
    },
  };
}

export const apiFootball = createApiFootball();
