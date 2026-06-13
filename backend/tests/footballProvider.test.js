import { describe, it, expect } from 'vitest';
import { resolveProvider } from '../src/services/footballProvider.js';
import { apiFootball } from '../src/services/apiFootball.js';
import { footballData } from '../src/services/footballData.js';

describe('resolveProvider', () => {
  it("retorna o cliente da API-Football para 'api-football'", () => {
    expect(resolveProvider('api-football')).toBe(apiFootball);
  });

  it("retorna o cliente do football-data para 'football-data'", () => {
    expect(resolveProvider('football-data')).toBe(footballData);
  });

  it('lanca erro claro para provider desconhecido', () => {
    expect(() => resolveProvider('bogus')).toThrow(/FOOTBALL_PROVIDER/);
    expect(() => resolveProvider(null)).toThrow(/FOOTBALL_PROVIDER/);
  });
});
