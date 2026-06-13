import { describe, it, expect, vi } from 'vitest';
import { createFootballData } from '../src/services/footballData.js';

/** Resposta crua do football-data.org (/competitions/WC/matches). */
const GROUP_MATCH = {
  id: 537001,
  utcDate: '2026-06-11T18:00:00Z',
  status: 'SCHEDULED',
  stage: 'GROUP_STAGE',
  group: 'GROUP_A',
  matchday: 1,
  homeTeam: { id: 759, name: 'Brazil', crest: 'https://crests/brazil.png' },
  awayTeam: { id: 773, name: 'Croatia', crest: 'https://crests/croatia.png' },
  score: { winner: null, duration: 'REGULAR', fullTime: { home: null, away: null } },
};

/** Monta um http fake que devolve `matches` com headers opcionais. */
function fakeHttp(matches, headers = { 'x-requests-available-minute': '9' }) {
  return { get: vi.fn().mockResolvedValue({ data: { matches }, headers }) };
}

describe('footballData.getFixturesByDate', () => {
  it('mapeia um jogo do football-data para o formato interno (utcDate→date, crest→logo, fullTime→goals)', async () => {
    const http = fakeHttp([GROUP_MATCH]);
    const api = createFootballData({ http, competition: 'WC', sleep: vi.fn() });

    const result = await api.getFixturesByDate('2026-06-11');

    expect(result).toEqual([
      {
        fixture: { id: 537001, date: '2026-06-11T18:00:00Z', status: { short: 'NS' } },
        league: { round: 'Group Stage - 1' },
        teams: {
          home: { id: 759, name: 'Brazil', logo: 'https://crests/brazil.png' },
          away: { id: 773, name: 'Croatia', logo: 'https://crests/croatia.png' },
        },
        goals: { home: null, away: null },
        score: { penalty: { home: null, away: null } },
      },
    ]);
  });

  it('mata-mata em pênaltis: status PEN, goals = placar do tempo normal/prorrogação, score.penalty = disputa', async () => {
    const penalty = {
      ...GROUP_MATCH,
      id: 537060,
      status: 'FINISHED',
      stage: 'LAST_16',
      group: null,
      matchday: null,
      score: { winner: 'AWAY_TEAM', duration: 'PENALTY_SHOOTOUT', fullTime: { home: 1, away: 1 }, penalties: { home: 4, away: 5 } },
    };
    const http = fakeHttp([penalty]);
    const api = createFootballData({ http, competition: 'WC', sleep: vi.fn() });

    const [fx] = await api.getFixturesByDate('2026-06-11');

    expect(fx.fixture.status.short).toBe('PEN');
    expect(fx.goals).toEqual({ home: 1, away: 1 });
    expect(fx.score.penalty).toEqual({ home: 4, away: 5 });
    expect(fx.league.round).toBe('Round of 16');
  });

  it('mata-mata na prorrogação (sem pênaltis): status AET', async () => {
    const aet = {
      ...GROUP_MATCH,
      id: 537061,
      status: 'FINISHED',
      stage: 'SEMI_FINALS',
      score: { winner: 'HOME_TEAM', duration: 'EXTRA_TIME', fullTime: { home: 2, away: 1 } },
    };
    const http = fakeHttp([aet]);
    const api = createFootballData({ http, competition: 'WC', sleep: vi.fn() });

    const [fx] = await api.getFixturesByDate('2026-06-11');

    expect(fx.fixture.status.short).toBe('AET');
    expect(fx.goals).toEqual({ home: 2, away: 1 });
    expect(fx.score.penalty).toEqual({ home: null, away: null });
  });

  it('mapeia FINISHED para FT e usa o placar de fullTime', async () => {
    const finished = {
      ...GROUP_MATCH,
      id: 537002,
      status: 'FINISHED',
      score: { winner: 'HOME_TEAM', duration: 'REGULAR', fullTime: { home: 3, away: 1 } },
    };
    const http = fakeHttp([finished]);
    const api = createFootballData({ http, competition: 'WC', sleep: vi.fn() });

    const [fx] = await api.getFixturesByDate('2026-06-11');

    expect(fx.fixture.status.short).toBe('FT');
    expect(fx.goals).toEqual({ home: 3, away: 1 });
  });

  it('trata confronto de mata-mata ainda sem times (TBD) com ids nulos', async () => {
    const tbd = {
      id: 537050,
      utcDate: '2026-07-09T19:00:00Z',
      status: 'TIMED',
      stage: 'QUARTER_FINALS',
      group: null,
      matchday: null,
      homeTeam: { id: null, name: null, crest: null },
      awayTeam: { id: null, name: null, crest: null },
      score: { fullTime: { home: null, away: null } },
    };
    const http = fakeHttp([tbd]);
    const api = createFootballData({ http, competition: 'WC', sleep: vi.fn() });

    const [fx] = await api.getFixturesByDate('2026-07-09');

    expect(fx.teams.home).toEqual({ id: null, name: null, logo: null });
    expect(fx.teams.away).toEqual({ id: null, name: null, logo: null });
    expect(fx.league.round).toBe('Quarter-finals');
  });

  it('busca a competição numa janela UTC que cobre o dia BRT e filtra pela data BRT', async () => {
    const onTime = { ...GROUP_MATCH, id: 1, utcDate: '2026-06-11T18:00:00Z' }; // 15h BRT do dia 11
    const lateNight = { ...GROUP_MATCH, id: 2, utcDate: '2026-06-12T02:00:00Z' }; // 23h BRT do dia 11
    const nextDay = { ...GROUP_MATCH, id: 3, utcDate: '2026-06-12T05:00:00Z' }; // 02h BRT do dia 12
    const http = fakeHttp([onTime, lateNight, nextDay]);
    const api = createFootballData({ http, competition: 'WC', sleep: vi.fn() });

    const result = await api.getFixturesByDate('2026-06-11');

    expect(http.get).toHaveBeenCalledWith('/competitions/WC/matches', {
      params: { dateFrom: '2026-06-11', dateTo: '2026-06-12' },
    });
    expect(result.map((f) => f.fixture.id)).toEqual([1, 2]);
  });

  it('propaga erro HTTP (ex.: 403 token inválido) em vez de engolir', async () => {
    const err = Object.assign(new Error('Forbidden'), { response: { status: 403, headers: {} } });
    const http = { get: vi.fn().mockRejectedValue(err) };
    const api = createFootballData({ http, competition: 'WC', sleep: vi.fn() });

    await expect(api.getFixturesByDate('2026-06-11')).rejects.toThrow();
  });

  it('respeita o reset do rate-limit em 429: espera e tenta de novo (header X-RequestCounter-Reset)', async () => {
    const err = Object.assign(new Error('Too Many Requests'), {
      response: { status: 429, headers: { 'x-requestcounter-reset': '7' } },
    });
    const http = {
      get: vi
        .fn()
        .mockRejectedValueOnce(err)
        .mockResolvedValueOnce({ data: { matches: [GROUP_MATCH] }, headers: {} }),
    };
    const sleep = vi.fn().mockResolvedValue();
    const api = createFootballData({ http, competition: 'WC', sleep });

    const result = await api.getFixturesByDate('2026-06-11');

    expect(sleep).toHaveBeenCalledWith(7000);
    expect(http.get).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
  });

  it('throttle proativo: ao zerar a cota do minuto, segura a próxima chamada até o reset', async () => {
    const http = {
      get: vi
        .fn()
        .mockResolvedValueOnce({
          data: { matches: [] },
          headers: { 'x-requests-available-minute': '0', 'x-requestcounter-reset': '12' },
        })
        .mockResolvedValueOnce({ data: { matches: [] }, headers: { 'x-requests-available-minute': '9' } }),
    };
    const sleep = vi.fn().mockResolvedValue();
    const api = createFootballData({ http, competition: 'WC', sleep });

    await api.getFixturesByDate('2026-06-11'); // resposta zera a cota → arma a espera
    expect(sleep).not.toHaveBeenCalled();

    await api.getFixturesByDate('2026-06-12'); // antes de chamar, deve aguardar o reset
    expect(sleep).toHaveBeenCalledWith(12000);
  });
});
