import { describe, it, expect } from 'vitest';
import { buildRelinkPlan } from '../src/services/relink.js';

const T = Date.parse('2026-06-12T02:00:00Z');

describe('buildRelinkPlan', () => {
  it('casa jogos pelo horário e deriva os times por posição (ignora divergência de nome)', () => {
    const local = [
      {
        matchId: 5,
        kickoffMs: T,
        homeTeamId: 17,
        homeName: 'South Korea',
        awayTeamId: 770,
        awayName: 'Czech Republic', // API-Football
      },
    ];
    const provider = [
      {
        fixtureId: 537328,
        kickoffMs: T,
        home: { id: 782, name: 'South Korea', crest: 'k.svg' },
        away: { id: 798, name: 'Czechia', crest: 'c.svg' }, // football-data
      },
    ];

    const plan = buildRelinkPlan(local, provider);

    expect(plan.matchUpdates).toEqual([{ matchId: 5, fixtureId: 537328 }]);
    expect(plan.teamUpdates).toEqual(
      expect.arrayContaining([
        { teamId: 17, providerId: 782, crest: 'k.svg' },
        { teamId: 770, providerId: 798, crest: 'c.svg' },
      ]),
    );
    expect(plan.unmatched).toEqual([]);
  });

  it('desempata jogos simultâneos pelo nome (normalizado) do mandante', () => {
    const local = [
      { matchId: 1, kickoffMs: T, homeTeamId: 10, homeName: 'Brazil', awayTeamId: 20, awayName: 'Serbia' },
      { matchId: 2, kickoffMs: T, homeTeamId: 30, homeName: 'Switzerland', awayTeamId: 40, awayName: 'Cameroon' },
    ];
    const provider = [
      { fixtureId: 100, kickoffMs: T, home: { id: 6, name: 'Brazil', crest: 'b' }, away: { id: 7, name: 'Serbia', crest: 's' } },
      { fixtureId: 101, kickoffMs: T, home: { id: 15, name: 'Switzerland', crest: 'sw' }, away: { id: 16, name: 'Cameroon', crest: 'c' } },
    ];

    const plan = buildRelinkPlan(local, provider);

    expect(plan.matchUpdates).toEqual(
      expect.arrayContaining([
        { matchId: 1, fixtureId: 100 },
        { matchId: 2, fixtureId: 101 },
      ]),
    );
    expect(plan.unmatched).toEqual([]);
  });

  it('reporta como unmatched o jogo local sem contraparte no provider', () => {
    const local = [
      { matchId: 9, kickoffMs: Date.parse('2026-07-01T00:00:00Z'), homeTeamId: null, homeName: null, awayTeamId: null, awayName: null },
    ];
    const plan = buildRelinkPlan(local, []);

    expect(plan.matchUpdates).toEqual([]);
    expect(plan.teamUpdates).toEqual([]);
    expect(plan.unmatched.map((m) => m.matchId)).toEqual([9]);
  });

  it('não duplica um time que aparece em mais de um jogo', () => {
    const local = [
      { matchId: 1, kickoffMs: T, homeTeamId: 10, homeName: 'Brazil', awayTeamId: 20, awayName: 'Serbia' },
      { matchId: 2, kickoffMs: T + 3600000, homeTeamId: 10, homeName: 'Brazil', awayTeamId: 30, awayName: 'Mexico' },
    ];
    const provider = [
      { fixtureId: 100, kickoffMs: T, home: { id: 6, name: 'Brazil', crest: 'b' }, away: { id: 7, name: 'Serbia', crest: 's' } },
      { fixtureId: 101, kickoffMs: T + 3600000, home: { id: 6, name: 'Brazil', crest: 'b' }, away: { id: 8, name: 'Mexico', crest: 'm' } },
    ];

    const plan = buildRelinkPlan(local, provider);

    const brazil = plan.teamUpdates.filter((u) => u.teamId === 10);
    expect(brazil).toEqual([{ teamId: 10, providerId: 6, crest: 'b' }]);
  });
});
