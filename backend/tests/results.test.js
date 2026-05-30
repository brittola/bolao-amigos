import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { db } from '../src/config/db.js';
import { RULES } from '../src/config/scoring.js';
import { recomputeMatchPoints, recomputeBonusPoints } from '../src/services/points.js';
import { findPendingMatches, pollResults } from '../src/services/resultPoller.js';
import { resetDb, createPlayer, createMatch } from './helpers/db.js';

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await db.destroy();
});

function hoursAgo(h) {
  return new Date(Date.now() - h * 3600 * 1000).toISOString();
}

describe('recomputeMatchPoints', () => {
  it('calcula pontos de todos os palpites do jogo finalizado', async () => {
    const p1 = await createPlayer({ email: 'a@bolao.local' });
    const p2 = await createPlayer({ email: 'b@bolao.local' });
    const match = await createMatch({ api_fixture_id: 1, kickoff_at: hoursAgo(3), status: 'FT', home_score: 2, away_score: 1 });

    await db('predictions').insert([
      { user_id: p1.id, match_id: match.id, home_score: 2, away_score: 1 }, // exato
      { user_id: p2.id, match_id: match.id, home_score: 0, away_score: 3 }, // errou tudo
    ]);

    await recomputeMatchPoints(match.id);

    const preds = await db('predictions').where({ match_id: match.id }).orderBy('user_id');
    expect(preds[0].points).toBe(RULES.exactScore);
    expect(preds[0].is_exact).toBe(true);
    expect(preds[1].points).toBe(0);
    expect(preds[1].is_exact).toBe(false);
  });
});

describe('recomputeBonusPoints', () => {
  it('calcula pontos dos palpites bonus de um tipo', async () => {
    const p1 = await createPlayer({ email: 'a@bolao.local' });
    const p2 = await createPlayer({ email: 'b@bolao.local' });
    await db('bonus_predictions').insert([
      { user_id: p1.id, type: 'champion', value: 'Brasil' },
      { user_id: p2.id, type: 'champion', value: 'Argentina' },
    ]);
    await db('bonus_results').insert({ type: 'champion', value: 'Brasil' });

    await recomputeBonusPoints('champion');

    const rows = await db('bonus_predictions').where({ type: 'champion' }).orderBy('user_id');
    expect(rows[0].points).toBe(RULES.bonusChampion);
    expect(rows[1].points).toBe(0);
  });
});

describe('findPendingMatches', () => {
  it('seleciona apenas jogos antigos e ainda sem status final', async () => {
    const now = new Date();
    const antigoPendente = await createMatch({ api_fixture_id: 1, kickoff_at: hoursAgo(3), status: '1H' });
    await createMatch({ api_fixture_id: 2, kickoff_at: hoursAgo(3), status: 'FT' }); // já final
    await createMatch({ api_fixture_id: 3, kickoff_at: hoursAgo(1), status: 'NS' }); // recente demais

    const pending = await findPendingMatches({ now });
    expect(pending.map((m) => m.id)).toEqual([antigoPendente.id]);
  });
});

describe('pollResults', () => {
  it('nao chama a API quando nao ha jogo pendente', async () => {
    const client = { getFixturesByIds: vi.fn() };
    const res = await pollResults({ client, now: new Date() });
    expect(client.getFixturesByIds).not.toHaveBeenCalled();
    expect(res.polled).toBe(0);
  });

  it('atualiza placar e computa pontos de jogo finalizado', async () => {
    const player = await createPlayer({ email: 'a@bolao.local' });
    const match = await createMatch({ api_fixture_id: 555, kickoff_at: hoursAgo(3), status: '2H' });
    await db('predictions').insert({ user_id: player.id, match_id: match.id, home_score: 1, away_score: 0 });

    const client = {
      getFixturesByIds: vi.fn().mockResolvedValue([
        { fixture: { id: 555, date: hoursAgo(3), status: { short: 'FT' } }, league: { round: 'x' }, teams: { home: { id: null }, away: { id: null } }, goals: { home: 1, away: 0 } },
      ]),
    };

    const res = await pollResults({ client, now: new Date() });

    expect(client.getFixturesByIds).toHaveBeenCalledOnce();
    const updated = await db('matches').where({ id: match.id }).first();
    expect(updated.status).toBe('FT');
    expect(updated.home_score).toBe(1);
    expect(updated.score_source).toBe('api');

    const pred = await db('predictions').where({ match_id: match.id }).first();
    expect(pred.points).toBe(RULES.exactScore);
    expect(res.finalized).toBe(1);
  });

  it('nao computa pontos se o jogo ainda nao terminou', async () => {
    await createMatch({ api_fixture_id: 777, kickoff_at: hoursAgo(3), status: '2H' });
    const client = {
      getFixturesByIds: vi.fn().mockResolvedValue([
        { fixture: { id: 777, date: hoursAgo(3), status: { short: '2H' } }, league: { round: 'x' }, teams: { home: { id: null }, away: { id: null } }, goals: { home: 1, away: 1 } },
      ]),
    };
    const res = await pollResults({ client, now: new Date() });
    expect(res.finalized).toBe(0);
  });
});
