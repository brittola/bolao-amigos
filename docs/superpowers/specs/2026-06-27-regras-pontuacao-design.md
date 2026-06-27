# Novas regras de pontuação + recálculo retroativo — design

Data: 2026-06-27
Sub-projeto **C** (de 3: C = regras de pontuação, B = regra mata-mata, A = correção de placar no Admin).

## Objetivo

Atualizar os valores de pontuação do bolão e introduzir um tier novo (saldo de gols),
e oferecer uma rota administrativa que reaplica as regras a todo o histórico já pontuado
(recálculo retroativo).

## Regras novas

Tiers de palpite de placar — **exclusivos**, retorna o maior aplicável (não soma):

| Situação | Pontos |
|---|---|
| Placar exato (cravada) | **25** |
| Mesmo vencedor **e** mesmo saldo de gols (não exato) | **15** |
| Mesmo resultado (vencedor/empate), saldo diferente | **12** |
| Errou o resultado | 0 |

Palpites bônus:

| Bônus | Pontos |
|---|---|
| Campeão | **30** |
| Artilheiro | **30** |

Valores antigos (para referência): exato 5, resultado 3, bônus 10/10.

### Definição precisa dos tiers

Dado `prediction {home_score, away_score}` e `result {home_score, away_score}`:

- **exato:** `prediction.home_score === result.home_score && prediction.away_score === result.away_score` → 25
- **saldo:** `(prediction.home_score - prediction.away_score) === (result.home_score - result.away_score)` e não exato → 15
- **resultado:** `sign(prediction.home - prediction.away) === sign(result.home - result.away)` e saldo diferente → 12
- senão → 0

Como saldo igual implica mesmo sinal, a ordem de avaliação é: exato → saldo → resultado → 0.

**Empates:** todo empate tem saldo 0, então um palpite de empate correto para um jogo
empatado sempre casa o saldo → cai em 15 (ou 25 se cravou). O tier de 12 só ocorre em
jogos com vencedor. Comportamento esperado.

## Exemplos (resultado real 2 a 0)

- palpite 2-0 → 25 (cravou)
- palpite 3-1 → 15 (mesmo vencedor, saldo +2 igual)
- palpite 1-0 → 12 (mesmo vencedor, saldo +1 ≠ +2)
- palpite 0-1 → 0

## Arquitetura

### `backend/src/config/scoring.js`

- Atualizar `RULES`:
  - `exactScore: 25`
  - novo `goalDifference: 15`
  - `correctWinner: 12`
  - `bonusChampion: 30`
  - `bonusTopScorer: 30`
- `computeMatchPoints` ganha o tier de saldo entre o exato e o de resultado:
  ```
  if (exact) return RULES.exactScore;          // 25
  if (sameGoalDiff) return RULES.goalDifference; // 15
  if (sameOutcome) return RULES.correctWinner;   // 12
  return 0;
  ```
  Reaproveita o helper `outcome(home, away)`; adiciona a comparação de saldo
  (`home - away`).
- `computeBonusPoints` continua igual em estrutura; só os valores em `RULES` mudam.

### `backend/src/services/points.js`

- Novo `recomputeAllPoints()`:
  - busca todas as partidas com `home_score` e `away_score` não nulos →
    `recomputeMatchPoints(id)` em cada;
  - `recomputeBonusPoints('champion')` e `recomputeBonusPoints('top_scorer')`;
  - retorna `{ matches: <n partidas reprocessadas>, bonus: <n tipos de bônus> }`.
  - Idempotente. Reaproveita os recompute existentes (nada de duplicar a lógica de
    cálculo).
- `is_exact` continua sendo `points === RULES.exactScore` (agora 25). Sem mudança de
  código além do valor da constante.

### `backend/src/routes/admin.js`

- Nova rota `POST /admin/recompute` (herda `authenticate, requireAdmin`):
  - chama `recomputeAllPoints()` e devolve o resumo em JSON.

## Testes (Vitest + Supertest)

- `backend/tests/scoring.test.js`: ajustar os casos existentes ao novo modelo e cobrir
  o tier de saldo:
  - real 2-0, palpite 2-0 → `exactScore` (25)
  - real 2-0, palpite 3-1 → `goalDifference` (15)
  - real 2-0, palpite 1-0 → `correctWinner` (12)
  - real 1-1, palpite 2-2 → `goalDifference` (15) (empate com saldo certo)
  - real 1-1, palpite 1-1 → `exactScore` (25)
  - real 2-0, palpite 0-1 → 0
  - bônus campeão/artilheiro → 30 (via `RULES.bonusChampion`/`bonusTopScorer`)
  - Os testes usam as constantes `RULES.*` (não números crus), então comparações
    simbólicas seguem válidas; ajustar apenas os casos cujo tier muda (ex.: empate
    "2-2 para 1-1" que antes era `correctWinner` agora é `goalDifference`).
- Novo `backend/tests/recompute.test.js` para a rota:
  - exige admin: 401 sem token, 403 para player;
  - cria partidas finalizadas + palpites com `points` desatualizados (valores antigos);
    cria bônus com `points` antigo + um `bonus_results`;
  - `POST /admin/recompute` → 200 com resumo;
  - confere que os `points`/`is_exact` dos palpites foram regravados conforme as regras
    novas e os bônus acertados viraram 30.

## Não-objetivos (YAGNI)

- Nenhuma mudança de UI: os valores de pontos não aparecem em texto no frontend (o front
  exibe `{points} pts` dinâmico). Confirmado por busca.
- Regra de mata-mata (tempo regular) é o sub-projeto **B**; fica de fora daqui. A rota
  `POST /admin/recompute` criada aqui será reaproveitada por B (ao rodar de novo depois
  que B entrar, o recálculo já aplica a lógica de 90').
- Sem versionar/auditar histórico de mudanças de regra. Sem agendamento — recálculo é
  manual via rota.

## Arquivos afetados

- `backend/src/config/scoring.js` — valores + tier de saldo.
- `backend/src/services/points.js` — `recomputeAllPoints()`.
- `backend/src/routes/admin.js` — rota `POST /admin/recompute`.
- `backend/tests/scoring.test.js` — casos ajustados + tier novo.
- `backend/tests/recompute.test.js` — novo, rota de recálculo.
