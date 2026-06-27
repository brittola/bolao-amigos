import { describe, it, expect } from 'vitest';
import { RULES, computeMatchPoints, computeBonusPoints } from '../src/config/scoring.js';

describe('computeMatchPoints', () => {
  it('placar exato vale exactScore', () => {
    const points = computeMatchPoints({ home_score: 2, away_score: 1 }, { home_score: 2, away_score: 1 });
    expect(points).toBe(RULES.exactScore);
  });

  it('empate exato vale exactScore', () => {
    const points = computeMatchPoints({ home_score: 1, away_score: 1 }, { home_score: 1, away_score: 1 });
    expect(points).toBe(RULES.exactScore);
  });

  it('mesmo vencedor e mesmo saldo (nao exato) vale goalDifference', () => {
    // previu 3x1 (saldo +2), saiu 2x0 (saldo +2): mesmo vencedor e saldo, placar diferente
    const points = computeMatchPoints({ home_score: 3, away_score: 1 }, { home_score: 2, away_score: 0 });
    expect(points).toBe(RULES.goalDifference);
  });

  it('empate com saldo certo (nao exato) vale goalDifference', () => {
    // previu 2x2, saiu 1x1: empate, saldo 0 igual, placar diferente
    const points = computeMatchPoints({ home_score: 2, away_score: 2 }, { home_score: 1, away_score: 1 });
    expect(points).toBe(RULES.goalDifference);
  });

  it('acertou o vencedor mas com saldo diferente vale correctWinner', () => {
    // previu 1x0 (saldo +1), saiu 2x0 (saldo +2): mesmo vencedor, saldo diferente
    const points = computeMatchPoints({ home_score: 1, away_score: 0 }, { home_score: 2, away_score: 0 });
    expect(points).toBe(RULES.correctWinner);
  });

  it('errou o resultado vale 0, mesmo acertando os gols de um time', () => {
    // previu 2x3 (visitante vence), saiu 2x1 (mandante vence): resultado errado → 0
    const points = computeMatchPoints({ home_score: 2, away_score: 3 }, { home_score: 2, away_score: 1 });
    expect(points).toBe(0);
  });

  it('errou tudo vale 0', () => {
    const points = computeMatchPoints({ home_score: 0, away_score: 1 }, { home_score: 3, away_score: 0 });
    expect(points).toBe(0);
  });

  it('tiers sao exclusivos: exato retorna so exactScore (nao soma)', () => {
    const points = computeMatchPoints({ home_score: 2, away_score: 1 }, { home_score: 2, away_score: 1 });
    expect(points).toBe(RULES.exactScore);
    expect(points).toBeLessThan(RULES.exactScore + RULES.goalDifference);
  });
});

describe('computeBonusPoints', () => {
  it('acertar o campeao vale bonusChampion', () => {
    const points = computeBonusPoints(
      { type: 'champion', value: 'Brasil' },
      { type: 'champion', value: 'Brasil' },
    );
    expect(points).toBe(RULES.bonusChampion);
  });

  it('comparacao de valor ignora caixa e espacos', () => {
    const points = computeBonusPoints(
      { type: 'top_scorer', value: '  mbappe ' },
      { type: 'top_scorer', value: 'Mbappe' },
    );
    expect(points).toBe(RULES.bonusTopScorer);
  });

  it('aceita nome sem acento (mbappe ≡ Mbappé)', () => {
    const points = computeBonusPoints(
      { type: 'top_scorer', value: 'mbappe' },
      { type: 'top_scorer', value: 'Mbappé' },
    );
    expect(points).toBe(RULES.bonusTopScorer);
  });

  it('aceita nome parcial quando o resultado tem nome completo', () => {
    const points = computeBonusPoints(
      { type: 'top_scorer', value: 'mbappe' },
      { type: 'top_scorer', value: 'Kylian Mbappé' },
    );
    expect(points).toBe(RULES.bonusTopScorer);
  });

  it('aceita sobrenome quando o palpite tem nome completo', () => {
    const points = computeBonusPoints(
      { type: 'top_scorer', value: 'Lionel Messi' },
      { type: 'top_scorer', value: 'Messi' },
    );
    expect(points).toBe(RULES.bonusTopScorer);
  });

  it('nao casa jogadores diferentes que compartilham só o primeiro nome', () => {
    const points = computeBonusPoints(
      { type: 'top_scorer', value: 'Harry Maguire' },
      { type: 'top_scorer', value: 'Harry Kane' },
    );
    expect(points).toBe(0);
  });

  it('errar o palpite bonus vale 0', () => {
    const points = computeBonusPoints(
      { type: 'champion', value: 'Argentina' },
      { type: 'champion', value: 'Brasil' },
    );
    expect(points).toBe(0);
  });

  it('tipos diferentes valem 0', () => {
    const points = computeBonusPoints(
      { type: 'champion', value: 'Brasil' },
      { type: 'top_scorer', value: 'Brasil' },
    );
    expect(points).toBe(0);
  });
});
