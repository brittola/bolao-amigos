import { env } from '../config/env.js';
import { apiFootball } from './apiFootball.js';
import { footballData } from './footballData.js';

/** Clientes de dados de jogos disponíveis, indexados pelo valor de FOOTBALL_PROVIDER. */
const PROVIDERS = {
  'api-football': apiFootball,
  'football-data': footballData,
};

/**
 * Resolve o cliente de dados de jogos pelo nome (default: env FOOTBALL_PROVIDER).
 * Lança se o provider for desconhecido/ausente — config explícita, sem fallback silencioso.
 */
export function resolveProvider(name = env.provider) {
  const client = PROVIDERS[name];
  if (!client) {
    throw new Error(
      `FOOTBALL_PROVIDER inválido: ${JSON.stringify(name)}. Use 'api-football' ou 'football-data'.`,
    );
  }
  return client;
}
