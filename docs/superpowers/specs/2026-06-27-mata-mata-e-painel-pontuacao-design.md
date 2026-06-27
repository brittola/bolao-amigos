# Mata-mata (90') + Painel de pontuação — design

Data: 2026-06-27
Agrupa dois sub-projetos pequenos e relacionados às regras de pontuação:
**B** (resultado de mata-mata = tempo regular) e **D** (painel informativo de
pontuação no Ranking). O sub-projeto **A** (correção de placar no Admin) fica à parte.

Dependência: o **C** (novas regras de pontuação, PR #2) deve ser mergeado **antes**
deste — o painel (D) reflete os valores de `RULES` definidos em C. Em dev os testes usam
`RULES.*` simbólico, então não dependem da ordem; a coordenação é só de merge.

---

## Parte B — resultado de mata-mata = tempo regular (90')

### Objetivo
Para jogos de mata-mata, o "resultado final" que pontua o bolão deve ser o placar do
**tempo regular (90')**, sem prorrogação nem pênaltis.

### Contexto técnico
- Hoje `backend/src/services/footballData.js` (`toFixture`) mapeia `goals` de
  `score.fullTime`, que **inclui a prorrogação**. É o que vai para `home_score`/
  `away_score` e é o que `computeMatchPoints` usa.
- O football-data.org v4 expõe `score.regularTime` (gols após os 90'), além de
  `score.fullTime` (final, com prorrogação), `score.extraTime`/`score.penalties`
  (incrementais) e `score.duration` (`REGULAR`/`EXTRA_TIME`/`PENALTY_SHOOTOUT`).
  Fontes: docs.football-data.org/general/v4/overtime.html e .../match.html.

### Decisão (confirmada no brainstorm)
`home_score`/`away_score` passam a guardar o placar de **90'** (fonte única; pontua e
exibe o tempo regular). Sem colunas novas, sem detecção de mata-mata.

### Mudança
Em `backend/src/services/footballData.js`, no `toFixture`, mapear `goals` preferindo
`regularTime` com fallback para `fullTime`:

```js
goals: {
  home: match.score?.regularTime?.home ?? match.score?.fullTime?.home ?? null,
  away: match.score?.regularTime?.away ?? match.score?.fullTime?.away ?? null,
},
```

E atualizar o comentário da linha ~27 (hoje diz que o placar do bolão é `fullTime`).

### Por que resolve a regra
`regularTime` é o placar de 90', presente quando há prorrogação/pênaltis. Em jogos
normais (incl. todos os de fase de grupos) ele não vem → fallback `fullTime`, que já é o
de 90'. Como só mata-mata tem prorrogação, mapear de `regularTime` universalmente
implementa exatamente a regra, **sem detectar mata-mata**. `computeMatchPoints` continua
lendo `home_score`/`away_score` (agora sempre 90') → mata-mata pontua pelos 90'
automaticamente. Status (FT/AET/PEN) e pênaltis seguem como estão.

### Não-objetivos (B)
- Provider `api-football` (suspenso; modelo de score diferente — exigiria tratamento
  próprio se for reativado). Fora de escopo.
- Re-busca retroativa de mata-mata já finalizado (não aconteceu ainda).
- Guardar gols da prorrogação; exibir indicador de prorrogação/pênaltis.

### Testes (B) — `backend/tests/footballData.test.js`
- Jogo com prorrogação onde `regularTime` ≠ `fullTime` (ex.: `regularTime` 1-1,
  `fullTime` 2-1, `duration` `EXTRA_TIME`) → `goals` mapeado = **1-1** (regularTime).
- Jogo normal finalizado **sem** `regularTime` → `goals` cai no fallback `fullTime`.
- O teste de pênaltis existente continua passando (pênaltis de `score.penalties`).

---

## Parte D — painel de pontuação no Ranking

### Objetivo
Mostrar aos usuários, na tela de Ranking, um informativo das regras de pontuação,
incluindo as observações sobre empates e mata-mata. Os valores vêm do backend (fonte
única `RULES`), para nunca dessincronizar.

### Backend
- Novo `GET /rules` (autenticado, como `/ranking`), em `backend/src/routes/rules.js`
  (`rulesRouter` com `rulesRouter.use(authenticate)`), montado em `app.js`:
  `app.use('/rules', rulesRouter)`.
- Retorna o objeto `RULES` de `config/scoring.js`:
  `{ exactScore, goalDifference, correctWinner, bonusChampion, bonusTopScorer }`.
- Teste (`backend/tests/rules.test.js`): 401 sem token; com token autenticado, retorna os
  valores (asserção simbólica via `RULES.*`).

### Frontend
- Novo componente `frontend/src/components/ScoringPanel.jsx` (+ `ScoringPanel.module.css`),
  que busca `GET /rules` e renderiza um card **sempre visível** abaixo da legenda do
  Ranking. Conteúdo:
  - **Placar:** Cravada `{exactScore}` · Vencedor + saldo de gols `{goalDifference}` ·
    Resultado `{correctWinner}`
  - **Bônus:** Campeão `{bonusChampion}` · Artilheiro `{bonusTopScorer}`
  - **Empates:** "Todo empate tem saldo zero — acertar um empate sem cravar o placar cai
    sempre na faixa de saldo (`{goalDifference}` pts)."
  - **Mata-mata:** "Nos jogos de mata-mata vale o resultado do tempo regular (90'), sem
    prorrogação nem pênaltis."
  - Enquanto carrega: não renderiza nada (sem placeholder). Em erro de fetch: não
    renderiza nada (informativo é complementar, não deve quebrar o ranking).
- Integrar em `frontend/src/pages/Ranking.jsx`: renderizar `<ScoringPanel />` logo abaixo
  da legenda (`styles.legend`).
- Segue as convenções de CSS-module/design-tokens existentes.

### Testes de frontend
O projeto não tem testes de componente. Não introduzir framework de UI; verificar com
`npm run build` + checagem manual.

### Não-objetivos (D)
- Nenhuma config editável de regras via UI (continua tudo em `RULES`).
- Sem painel recolhível (decidido: sempre visível).

---

## Arquivos afetados

**B:**
- `backend/src/services/footballData.js` — mapeamento de `goals` + comentário.
- `backend/tests/footballData.test.js` — casos de regularTime/fallback.

**D:**
- `backend/src/routes/rules.js` — novo, `GET /rules`.
- `backend/src/app.js` — montar `rulesRouter`.
- `backend/tests/rules.test.js` — novo.
- `frontend/src/components/ScoringPanel.jsx` + `ScoringPanel.module.css` — novos.
- `frontend/src/pages/Ranking.jsx` — renderiza o painel.
