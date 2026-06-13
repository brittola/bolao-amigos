import axios from 'axios';
import moment from 'moment';
import { env } from '../config/env.js';

/** Brasil não observa horário de verão desde 2019: BRT é fixo em UTC-3. */
const BRT_OFFSET_MIN = -180;

/**
 * Status não-finais do football-data.org → códigos internos (compatíveis com os da
 * API-Football, que o resto do app já entende). Os finais (FINISHED/AWARDED) são
 * resolvidos em `mapStatus` a partir de `score.duration` para distinguir
 * FT/AET/PEN (os FINAL_STATUSES que o poller reconhece).
 */
const STATUS_MAP = {
  SCHEDULED: 'NS',
  TIMED: 'NS',
  IN_PLAY: '2H',
  PAUSED: 'HT',
  SUSPENDED: 'SUSP',
  POSTPONED: 'PST',
  CANCELLED: 'CANC',
};

/**
 * Código de status interno. Jogo finalizado vira FT/AET/PEN conforme a duração
 * (`score.duration`): tempo normal → FT, prorrogação → AET, disputa de pênaltis → PEN.
 * Em todos, o placar que pontua o bolão é `score.fullTime` (normal + prorrogação).
 */
function mapStatus(match) {
  if (match.status === 'FINISHED' || match.status === 'AWARDED') {
    if (match.score?.duration === 'PENALTY_SHOOTOUT') return 'PEN';
    if (match.score?.duration === 'EXTRA_TIME') return 'AET';
    return 'FT';
  }
  return STATUS_MAP[match.status] ?? 'NS';
}

const STAGE_LABELS = {
  LAST_16: 'Round of 16',
  QUARTER_FINALS: 'Quarter-finals',
  SEMI_FINALS: 'Semi-finals',
  THIRD_PLACE: 'Third-place',
  FINAL: 'Final',
};

/** Data-calendário (YYYY-MM-DD) de um instante no fuso de Brasília. */
function brtDate(instant) {
  return moment(instant).utcOffset(BRT_OFFSET_MIN).format('YYYY-MM-DD');
}

/** Rótulo de fase no estilo da API-Football ("Group Stage - 1", "Quarter-finals"). */
function mapRound(match) {
  if (match.stage === 'GROUP_STAGE') {
    return match.matchday != null ? `Group Stage - ${match.matchday}` : 'Group Stage';
  }
  return STAGE_LABELS[match.stage] ?? match.stage ?? null;
}

/** Time no formato interno; mantém TBD (id nulo) para confrontos de mata-mata. */
function mapTeam(team) {
  if (!team || team.id == null) return { id: null, name: null, logo: null };
  return { id: team.id, name: team.name ?? null, logo: team.crest ?? null };
}

/** Converte um match do football-data no fixture que fixtureSync/resultPoller consomem. */
function toFixture(match) {
  return {
    fixture: {
      id: match.id,
      date: match.utcDate,
      status: { short: mapStatus(match) },
    },
    league: { round: mapRound(match) },
    teams: { home: mapTeam(match.homeTeam), away: mapTeam(match.awayTeam) },
    goals: {
      home: match.score?.fullTime?.home ?? null,
      away: match.score?.fullTime?.away ?? null,
    },
    // Disputa de pênaltis (null fora do mata-mata). Mesmo path do raw da API-Football
    // (`score.penalty`), então o poller lê de um único lugar nos dois providers.
    score: {
      penalty: {
        home: match.score?.penalties?.home ?? null,
        away: match.score?.penalties?.away ?? null,
      },
    },
  };
}

function defaultHttp() {
  return axios.create({
    baseURL: env.footballData.baseUrl,
    headers: { 'X-Auth-Token': env.footballData.token },
    timeout: 15000,
  });
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Cliente do football-data.org com a mesma interface da API-Football
 * (`getFixturesByDate`). `http`, `competition` e `sleep` são injetáveis para teste.
 *
 * O provedor (plano free = 10 req/min) pede que o cliente respeite os headers de
 * rate-limit: `X-Requests-Available-Minute` e `X-RequestCounter-Reset`. Quando a cota
 * do minuto zera, seguramos a próxima chamada; num 429 esperamos o reset e tentamos
 * de novo uma vez.
 */
export function createFootballData({
  http = defaultHttp(),
  competition = env.footballData.competition,
  sleep = defaultSleep,
} = {}) {
  let pendingWaitMs = 0;

  function noteThrottle(headers = {}) {
    if (Number(headers['x-requests-available-minute']) === 0) {
      const reset = Number(headers['x-requestcounter-reset']) || 60;
      pendingWaitMs = reset * 1000;
    }
  }

  async function get(path, params) {
    if (pendingWaitMs > 0) {
      await sleep(pendingWaitMs);
      pendingWaitMs = 0;
    }
    let res;
    try {
      res = await http.get(path, { params });
    } catch (err) {
      if (err.response?.status === 429) {
        const reset = Number(err.response.headers?.['x-requestcounter-reset']) || 60;
        await sleep(reset * 1000);
        res = await http.get(path, { params });
      } else {
        throw err;
      }
    }
    noteThrottle(res.headers);
    return res.data;
  }

  return {
    /**
     * Jogos de uma data-calendário BRT. football-data filtra por data UTC e não tem
     * parâmetro de fuso, então buscamos uma janela de 2 dias UTC (que cobre o dia BRT,
     * deslocado +3h) e filtramos pela data BRT — replicando o `timezone=America/Sao_Paulo`
     * da API-Football.
     */
    async getFixturesByDate(date) {
      const dateTo = moment.utc(date, 'YYYY-MM-DD').add(1, 'day').format('YYYY-MM-DD');
      const data = await get(`/competitions/${competition}/matches`, { dateFrom: date, dateTo });
      const matches = data?.matches ?? [];
      return matches.filter((m) => brtDate(m.utcDate) === date).map(toFixture);
    },
  };
}

export const footballData = createFootballData();
