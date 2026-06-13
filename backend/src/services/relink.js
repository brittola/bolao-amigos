import moment from 'moment';
import { db } from '../config/db.js';
import { resolveProvider } from './footballProvider.js';

/** Brasil não observa horário de verão desde 2019: BRT é fixo em UTC-3. */
const BRT_OFFSET_MIN = -180;

function brtDate(instant) {
  return moment(instant).utcOffset(BRT_OFFSET_MIN).format('YYYY-MM-DD');
}

function toMs(value) {
  if (value == null) return null;
  const iso = value instanceof Date ? value.toISOString() : value;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Monta o plano de relink (API-Football → novo provider) sem tocar no banco.
 *
 * Casa cada jogo local com o do provider pelo **horário do kickoff** (idêntico entre
 * provedores). Jogos simultâneos são desempatados pelo nome normalizado do mandante.
 * O mapeamento de times é **derivado pela posição** (mandante↔mandante, visitante↔
 * visitante) do par casado — então divergências de nome (ex.: "Czech Republic" vs
 * "Czechia") não atrapalham.
 *
 * @param {Array<{matchId:number, kickoffMs:number|null, homeTeamId:number|null, homeName:string|null, awayTeamId:number|null, awayName:string|null}>} local
 * @param {Array<{fixtureId:number, kickoffMs:number, home:{id:number,name:string,crest:string}, away:{id:number,name:string,crest:string}}>} provider
 * @returns {{matchUpdates:Array<{matchId:number,fixtureId:number}>, teamUpdates:Array<{teamId:number,providerId:number,crest:string}>, unmatched:Array<object>}}
 */
export function buildRelinkPlan(local, provider) {
  const byKickoff = new Map();
  for (const p of provider) {
    if (!byKickoff.has(p.kickoffMs)) byKickoff.set(p.kickoffMs, []);
    byKickoff.get(p.kickoffMs).push(p);
  }

  const matchUpdates = [];
  const unmatched = [];
  const teamMap = new Map(); // teamId -> { teamId, providerId, crest }

  for (const m of local) {
    const candidates = m.kickoffMs == null ? [] : byKickoff.get(m.kickoffMs) ?? [];
    let pick = null;
    if (candidates.length === 1) {
      pick = candidates[0];
    } else if (candidates.length > 1) {
      pick = candidates.find((c) => normalize(c.home.name) === normalize(m.homeName)) ?? null;
    }

    if (!pick) {
      unmatched.push(m);
      continue;
    }

    matchUpdates.push({ matchId: m.matchId, fixtureId: pick.fixtureId });
    if (m.homeTeamId != null && !teamMap.has(m.homeTeamId)) {
      teamMap.set(m.homeTeamId, { teamId: m.homeTeamId, providerId: pick.home.id, crest: pick.home.crest });
    }
    if (m.awayTeamId != null && !teamMap.has(m.awayTeamId)) {
      teamMap.set(m.awayTeamId, { teamId: m.awayTeamId, providerId: pick.away.id, crest: pick.away.crest });
    }
  }

  return { matchUpdates, teamUpdates: [...teamMap.values()], unmatched };
}

/** Carrega jogos locais + jogos do provider (pelas datas BRT presentes localmente). */
export async function loadRelinkData({ client = resolveProvider() } = {}) {
  const rows = await db('matches as m')
    .leftJoin('teams as h', 'm.home_team_id', 'h.id')
    .leftJoin('teams as a', 'm.away_team_id', 'a.id')
    .select(
      'm.id as matchId',
      'm.api_fixture_id as apiFixtureId',
      'm.kickoff_at as kickoffAt',
      'm.home_team_id as homeTeamId',
      'm.away_team_id as awayTeamId',
      'h.name as homeName',
      'a.name as awayName',
    );

  const local = rows.map((r) => ({
    matchId: r.matchId,
    apiFixtureId: r.apiFixtureId,
    kickoffMs: toMs(r.kickoffAt),
    homeTeamId: r.homeTeamId,
    homeName: r.homeName,
    awayTeamId: r.awayTeamId,
    awayName: r.awayName,
  }));

  const dates = [...new Set(local.filter((m) => m.kickoffMs != null).map((m) => brtDate(m.kickoffMs)))].sort();
  const provider = [];
  for (const date of dates) {
    const fixtures = await client.getFixturesByDate(date);
    for (const f of fixtures) {
      provider.push({
        fixtureId: f.fixture.id,
        kickoffMs: toMs(f.fixture.date),
        home: { id: f.teams.home.id, name: f.teams.home.name, crest: f.teams.home.logo },
        away: { id: f.teams.away.id, name: f.teams.away.name, crest: f.teams.away.logo },
      });
    }
  }

  return { local, provider };
}

/** Aplica o plano numa transação: atualiza api_team_id/logo dos times e api_fixture_id dos jogos. */
export async function applyRelinkPlan(plan) {
  return db.transaction(async (trx) => {
    for (const u of plan.teamUpdates) {
      await trx('teams').where({ id: u.teamId }).update({ api_team_id: u.providerId, logo_url: u.crest ?? null });
    }
    for (const u of plan.matchUpdates) {
      await trx('matches').where({ id: u.matchId }).update({ api_fixture_id: u.fixtureId });
    }
    return { teams: plan.teamUpdates.length, matches: plan.matchUpdates.length };
  });
}
