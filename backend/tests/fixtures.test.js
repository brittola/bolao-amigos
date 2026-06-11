import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { db } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { reserveRequest, createApiFootball } from '../src/services/apiFootball.js';
import { syncFixtures } from '../src/services/fixtureSync.js';
import { resetDb } from './helpers/db.js';

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await db.destroy();
});

const WC = env.apiFootball.league;

const SAMPLE = [
  {
    fixture: { id: 1001, date: '2026-06-11T16:00:00+00:00', status: { short: 'NS' } },
    league: { id: WC, round: 'Group Stage - 1' },
    teams: {
      home: { id: 10, name: 'Brasil', logo: 'brasil.png' },
      away: { id: 20, name: 'Croácia', logo: 'croacia.png' },
    },
    goals: { home: null, away: null },
  },
  {
    // jogo de mata-mata ainda sem adversários definidos (TBD)
    fixture: { id: 2002, date: '2026-07-09T20:00:00+00:00', status: { short: 'NS' } },
    league: { id: WC, round: 'Quarter-finals' },
    teams: {
      home: { id: null, name: null, logo: null },
      away: { id: null, name: null, logo: null },
    },
    goals: { home: null, away: null },
  },
];

describe('reserveRequest (trava de uso da API)', () => {
  it('incrementa o contador do dia', async () => {
    await reserveRequest();
    await reserveRequest();
    const row = await db('api_usage').first();
    expect(row.count).toBe(2);
  });

  it('lanca erro quando atinge o teto diário e nao incrementa', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await db('api_usage').insert({ date: today, count: env.apiFootball.dailyCap });
    await expect(reserveRequest()).rejects.toThrow();
    const row = await db('api_usage').where({ date: today }).first();
    expect(row.count).toBe(env.apiFootball.dailyCap);
  });
});

describe('createApiFootball', () => {
  it('busca por data no fuso de Brasília sem enviar season (restrição do plano free)', async () => {
    const http = { get: vi.fn().mockResolvedValue({ data: { response: SAMPLE } }) };
    const api = createApiFootball({ http });
    const result = await api.getFixturesByDate('2026-06-11');
    expect(http.get).toHaveBeenCalledOnce();
    const params = http.get.mock.calls[0][1].params;
    // sem timezone a API filtra por data em UTC e perde jogos noturnos de BRT
    // (ex.: 23h BRT = 02h UTC do dia seguinte); fixamos America/Sao_Paulo
    expect(params).toEqual({ date: '2026-06-11', timezone: 'America/Sao_Paulo' });
    expect(params.season).toBeUndefined();
    expect(result).toEqual(SAMPLE);
    const row = await db('api_usage').first();
    expect(row.count).toBe(1);
  });

  it('filtra apenas os jogos da liga configurada (Copa)', async () => {
    const outros = [
      ...SAMPLE,
      {
        fixture: { id: 9999, date: '2026-06-11T18:00:00+00:00', status: { short: 'NS' } },
        league: { id: WC + 777, round: 'Outra liga' },
        teams: { home: { id: 50, name: 'X' }, away: { id: 60, name: 'Y' } },
        goals: { home: null, away: null },
      },
    ];
    const http = { get: vi.fn().mockResolvedValue({ data: { response: outros } }) };
    const api = createApiFootball({ http });
    const result = await api.getFixturesByDate('2026-06-11');
    expect(result.map((f) => f.fixture.id)).toEqual([1001, 2002]);
  });

  it('lanca erro quando a API responde com errors (ex.: restrição de plano)', async () => {
    const http = {
      get: vi.fn().mockResolvedValue({
        data: { response: [], errors: { plan: 'Free plans do not have access to the Ids parameter.' } },
      }),
    };
    const api = createApiFootball({ http });
    await expect(api.getFixturesByDate('2026-06-11')).rejects.toThrow(/plan/i);
  });

  it('nao chama o http se a reserva falhar (teto atingido)', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await db('api_usage').insert({ date: today, count: env.apiFootball.dailyCap });
    const http = { get: vi.fn() };
    const api = createApiFootball({ http });
    await expect(api.getFixturesByDate('2026-06-11')).rejects.toThrow();
    expect(http.get).not.toHaveBeenCalled();
  });
});

describe('syncFixtures', () => {
  it('faz upsert de times e jogos', async () => {
    const client = { getFixturesByDate: vi.fn().mockResolvedValue(SAMPLE) };
    await syncFixtures('2026-06-11', { client });

    const teams = await db('teams').orderBy('api_team_id');
    expect(teams).toHaveLength(2);
    expect(teams[0]).toMatchObject({ api_team_id: 10, name: 'Brasil' });

    const matches = await db('matches').orderBy('api_fixture_id');
    expect(matches).toHaveLength(2);

    const grupo = matches.find((m) => m.api_fixture_id === 1001);
    expect(grupo.home_team_id).toBe(teams.find((t) => t.api_team_id === 10).id);
    expect(grupo.status).toBe('NS');

    const mataMata = matches.find((m) => m.api_fixture_id === 2002);
    expect(mataMata.home_team_id).toBeNull();
    expect(mataMata.away_team_id).toBeNull();
  });

  it('atualiza confronto TBD do mata-mata quando os times sao definidos', async () => {
    const client1 = { getFixturesByDate: vi.fn().mockResolvedValue(SAMPLE) };
    await syncFixtures('2026-07-09', { client: client1 });

    const updated = JSON.parse(JSON.stringify(SAMPLE));
    updated[1].teams.home = { id: 10, name: 'Brasil', logo: 'brasil.png' };
    updated[1].teams.away = { id: 30, name: 'França', logo: 'franca.png' };
    const client2 = { getFixturesByDate: vi.fn().mockResolvedValue(updated) };
    await syncFixtures('2026-07-09', { client: client2 });

    const matches = await db('matches').where({ api_fixture_id: 2002 }).first();
    const teams = await db('teams');
    expect(matches.home_team_id).toBe(teams.find((t) => t.api_team_id === 10).id);
    expect(matches.away_team_id).toBe(teams.find((t) => t.api_team_id === 30).id);
    // nao deve duplicar o jogo
    const count = await db('matches').count({ c: '*' }).first();
    expect(Number(count.c)).toBe(2);
  });
});
