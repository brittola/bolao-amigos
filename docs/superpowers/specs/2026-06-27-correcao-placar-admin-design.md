# Correção de placar — listar finalizados de ontem+hoje (Admin) — design

Data: 2026-06-27
Sub-projeto **A** (último dos quatro: C = regras, B = mata-mata, D = painel, A = correção).

## Objetivo

A seção de "corrigir placar" do Admin deve listar os **jogos já finalizados dos últimos
dois dias** (ontem + hoje, horário de Brasília), em vez da janela atual (hoje + amanhã,
que inclui jogos não finalizados).

## Contexto técnico
- Hoje a seção carrega `GET /matches` (janela hoje+amanhã via `brtDayWindow`), trazendo
  também jogos não iniciados/em andamento.
- O objeto de `GET /matches` **não** inclui `score_source`, então o selo "manual" do
  `ScoreFixRow` nunca aparece (bug latente que este endpoint novo corrige).

## Decisões (brainstorm)
- **Janela:** ontem + hoje (BRT, dia começando às 01:00, igual ao resto do app).
- **Filtro:** só finalizados (`FT`/`AET`/`PEN`).
- **Ordem:** mais recente primeiro (kickoff desc).

## Arquitetura

### Backend
- Helper `brtRecentDaysWindow(now)` em `backend/src/routes/matches.js` (exportado),
  reusando `BRT_OFFSET_MIN`/`DAY_START_HOUR`. Retorna `{ start, end }` (ISO em UTC) da
  janela **ontem + hoje**: `start` = início do dia de ontem (01:00 BRT); `end` = início do
  dia de amanhã (01:00 BRT). Mesma estrutura do `brtDayWindow`, deslocada um dia para trás.
- Para reaproveitar o builder de time sem duplicar, **exportar** o helper `team(row, prefix)`
  de `matches.js`.
- Novo `GET /admin/matches/finished` em `backend/src/routes/admin.js` (herda
  `authenticate, requireAdmin` do router):
  - query `matches` + `leftJoin teams` (home/away), `where status IN ('FT','AET','PEN')`
    e `kickoff_at >= start AND kickoff_at < end`, `orderBy kickoff_at desc`;
  - importa `brtRecentDaysWindow` e `team` de `../routes/matches.js`;
  - resposta por jogo: `id, round, kickoff_at, status, home_score, away_score,
    home_penalties, away_penalties, score_source, home_team, away_team`.
- Teste (`backend/tests/adminFinished.test.js`): exige admin (401 sem token, 403 player);
  cria um finalizado dentro da janela (com `score_source`), um finalizado fora da janela
  (ex.: 3 dias atrás) → excluído, e um não-finalizado dentro da janela → excluído; confere
  ordem desc e a presença de `score_source`.

### Frontend
- `frontend/src/pages/Admin.jsx`, seção de corrigir placar:
  - `load()` passa a chamar `api.get("/admin/matches/finished")` (em vez de `/matches`);
  - texto de lista vazia: "Nenhum jogo finalizado nos últimos dois dias.";
  - `ScoreFixRow` permanece igual — o selo "manual" passa a aparecer porque o novo endpoint
    inclui `score_source`.
- Verificação por `npm run build` (sem framework de teste de UI).

## Não-objetivos (YAGNI)
- Não alterar `GET /matches` (a tela de Jogos continua hoje+amanhã).
- Sem editar pênaltis/status na UI de correção (continua só home/away score).
- Sem paginação; sem re-busca na API.

## Coordenação
- Independente de C e B/D em comportamento. Toca `admin.js` (como o C, em rotas/linhas
  distintas) e `matches.js` (novo helper + export) — merge limpo esperado.

## Arquivos afetados
- `backend/src/routes/matches.js` — exporta `team`; novo `brtRecentDaysWindow`.
- `backend/src/routes/admin.js` — `GET /matches/finished`.
- `backend/tests/adminFinished.test.js` — novo.
- `frontend/src/pages/Admin.jsx` — endpoint + texto de vazio.
