# Histórico do usuário — design

Data: 2026-06-27

## Objetivo

Tela privada onde o usuário logado vê o histórico das partidas **encerradas**, com o
palpite que ele fez em cada uma e a pontuação obtida.

## Escopo (decisões tomadas no brainstorming)

- **Quais partidas:** apenas partidas encerradas (`status IN ('FT','AET','PEN')`).
  Placar final e pontuação sempre definidos.
- **Sem palpite:** partidas encerradas em que o usuário não palpitou também aparecem,
  marcadas como "Sem palpite" / 0 pts.
- **Organização:** agrupada por dia (horário de Brasília, BRT fixo UTC-3), mais recente
  primeiro — consistente com a tela de Jogos.
- **Resumo/estatísticas:** nenhum. Apenas a lista.
- **Palpites bônus (campeão/artilheiro):** fora de escopo nesta tela.
- **Formato do item:** card no estilo do `MatchCard` existente (logos, placar, palpite,
  pontos).

## Não-objetivos (YAGNI)

- Sem paginação (Copa tem ~64 jogos; volume pequeno).
- Sem filtros por rodada/status.
- Sem estatísticas agregadas.
- Sem exibir palpites de outros usuários (tela é privada).

## Arquitetura

### Backend — `GET /matches/history`

Novo handler no `matchesRouter` (`backend/src/routes/matches.js`), que já aplica
`authenticate`, então `req.user.id` está disponível.

Comportamento:

1. Query em `matches as m` com `leftJoin` em `teams` (home/away), filtrando
   `m.status IN ('FT','AET','PEN')`, ordenado por `m.kickoff_at` **desc**.
2. Buscar os palpites do usuário (`predictions` where `user_id = req.user.id` e
   `match_id in (...)`) e indexar por `match_id`.
3. Montar a resposta no **mesmo formato** do `GET /matches`:
   - `id, api_fixture_id, round, kickoff_at, status, home_score, away_score,
     home_penalties, away_penalties, home_team, away_team`
   - `locked: true` (sempre — são partidas encerradas)
   - `my_prediction: { home_score, away_score, points }` ou `null`
   - **Sem** o campo `predictions` (não vaza palpites alheios numa tela privada).

A constante `FINAL = ['FT','AET','PEN']` já existe no front (`MatchCard.jsx`); no backend
o filtro usa a mesma lista de status.

#### Teste (Vitest + Supertest)

Cenário:

- 2 partidas encerradas (uma `FT`, com palpite do usuário; outra `FT`, sem palpite) e
  1 partida não encerrada (`NS`).
- Outro usuário com palpite numa das partidas encerradas.

Asserções:

- Só as 2 encerradas voltam (a `NS` não aparece).
- Ordem por `kickoff_at` desc.
- `my_prediction` correto na que tem palpite; `null` na que não tem.
- Resposta **não** contém o campo `predictions` (palpite do outro usuário não vaza).

### Frontend

#### Página `Historico.jsx`

`frontend/src/pages/Historico.jsx`, seguindo o padrão de `Matches.jsx`:

- `useEffect` → `api.get("/matches/history")` → estados `historico` / `error`.
- Estados de UI:
  - **carregando:** skeleton (mesmo shimmer de Matches);
  - **erro:** `notice error` com `errorMessage(...)`;
  - **vazio:** "Nenhuma partida encerrada ainda.";
  - **dados:** lista agrupada.
- **Agrupamento por dia (BRT), mais recente primeiro**, reaproveitando a mesma lógica de
  formatação de dia da tela de Jogos (cabeçalho de grupo tipo "DOM · 22/06").
- Cada partida → `<MatchCard match={...} variant="history" />`.

#### Ajuste em `MatchCard.jsx`

Adicionar prop `variant` (default `"matches"`), sem alterar o comportamento atual:

- No branch travado (`LockedDetails`), quando `variant === "history"`:
  - não renderiza a lista de palpites de outros usuários;
  - mostra apenas `Seu palpite: X–Y  +N pts`;
  - se `my_prediction == null`, mostra `Sem palpite` com `0 pts` em estilo apagado.
- Com `variant` default, o comportamento em `/matches` permanece idêntico.

#### Rota e navegação

- `App.jsx`: nova rota protegida `/historico` → `Historico`.
- `Layout.jsx`: novo link "Histórico" na nav, entre "Jogos" e "Ranking".

#### Testes de frontend

O projeto não tem testes de componente hoje. Não introduzir um framework de teste de UI
só para esta tela; seguir o padrão existente. (Pode ser adicionado depois se desejado.)

## Fluxo de dados

```
Historico.jsx --GET /matches/history--> matchesRouter
   <-- [ { ...match, locked:true, my_prediction } ]  (sem predictions alheios)
agrupa por dia (BRT, desc) --> MatchCard variant="history"
```

## Arquivos afetados

- `backend/src/routes/matches.js` — novo handler `GET /history`.
- `backend/tests/history.test.js` — teste do endpoint (Vitest + Supertest, seguindo o
  padrão dos testes existentes em `backend/tests/`).
- `frontend/src/pages/Historico.jsx` — novo.
- `frontend/src/pages/Historico.module.css` — novo (ou reuso de `Matches.module.css`).
- `frontend/src/components/MatchCard.jsx` — prop `variant`.
- `frontend/src/App.jsx` — rota `/historico`.
- `frontend/src/components/Layout.jsx` — link de nav.
