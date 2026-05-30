/**
 * Regras de pontuação do bolão — módulo isolado e ajustável.
 *
 * Os valores abaixo são placeholders. Ajuste conforme as regras finais
 * que você definir; toda a lógica de cálculo depende apenas destas constantes.
 */
export const RULES = {
  exactScore: 5, // acertou o placar exato
  correctWinner: 3, // acertou o resultado (vencedor ou empate), mas não o placar
  bonusChampion: 10, // acertou o campeão do torneio
  bonusTopScorer: 10, // acertou o artilheiro do torneio
};

/** Sinal do confronto: 1 mandante vence, 0 empate, -1 visitante vence. */
function outcome(home, away) {
  return Math.sign(home - away);
}

/**
 * Pontos de um palpite de placar dado o resultado final.
 * Tiers são exclusivos — retorna o maior aplicável, sem somar.
 *
 * @param {{home_score:number, away_score:number}} prediction
 * @param {{home_score:number, away_score:number}} result
 * @returns {number}
 */
export function computeMatchPoints(prediction, result) {
  const exact =
    prediction.home_score === result.home_score &&
    prediction.away_score === result.away_score;
  if (exact) return RULES.exactScore;

  const sameOutcome =
    outcome(prediction.home_score, prediction.away_score) ===
    outcome(result.home_score, result.away_score);
  if (sameOutcome) return RULES.correctWinner;

  return 0;
}

/** Normaliza para comparação: sem acento, minúsculo, sem pontuação, espaços colapsados. */
function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // remove pontuação
    .trim()
    .replace(/\s+/g, ' ');
}

function tokenSet(value) {
  const n = normalize(value);
  return new Set(n ? n.split(' ') : []);
}

/**
 * Comparação tolerante de palpites bônus manuais. Aceita variações de acento/caixa e
 * nome parcial: um conjunto de palavras sendo subconjunto do outro casa
 * (ex.: "mbappe" ≡ "Kylian Mbappé", "Messi" ≡ "Lionel Messi").
 */
export function bonusValuesMatch(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const ta = tokenSet(a);
  const tb = tokenSet(b);
  const subset = (x, y) => [...x].every((t) => y.has(t));
  return subset(ta, tb) || subset(tb, ta);
}

/**
 * Pontos de um palpite bônus (campeão/artilheiro) dado o resultado real.
 *
 * @param {{type:string, value:string}} bonusPrediction
 * @param {{type:string, value:string}} bonusResult
 * @returns {number}
 */
export function computeBonusPoints(bonusPrediction, bonusResult) {
  if (!bonusResult || bonusPrediction.type !== bonusResult.type) return 0;
  if (!bonusValuesMatch(bonusPrediction.value, bonusResult.value)) return 0;

  return bonusPrediction.type === 'champion'
    ? RULES.bonusChampion
    : RULES.bonusTopScorer;
}
