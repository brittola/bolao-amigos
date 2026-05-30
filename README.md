# Bolão dos Amigos ⚽

Bolão da Copa para um grupo de amigos. Palpite nos placares, ganhe pontos, dispute o ranking.
Backend Node + Express + PostgreSQL, frontend React + Vite. Dados via API-Football (free, 100 req/dia),
com cache em banco e busca de resultados por cron.

## Stack

- **Backend:** Node + Express, PostgreSQL (Knex), JWT, node-cron, Vitest.
- **Frontend:** React + Vite (tema "placar/LED").
- **Infra:** PostgreSQL via Docker Compose.

## Pré-requisitos

- Node 20+
- Docker (para o Postgres)

## Como rodar

### 1. Banco de dados

```bash
docker compose up -d        # sobe Postgres (bancos: bolao e bolao_test)
```

### 2. Backend

```bash
cd backend
cp .env.example .env        # ajuste as variáveis (a API key já deve estar lá)
npm install
npm run migrate             # cria as tabelas
npm run seed                # cria o usuário admin (ADMIN_EMAIL/ADMIN_PASSWORD do .env)
npm run dev                 # http://localhost:3001
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

Em produção, defina `VITE_API_URL` apontando para a origem da API.

## Testes

```bash
cd backend
npm test                    # 45 testes (scoring, auth/convites, trava de palpite,
                            # apiFootball, fixtureSync, resultPoller, ranking, admin)
```

## Como funciona

### Uso da API-Football (limite de 100 req/dia)

- Toda chamada passa por `apiFootball.js`, que **checa e incrementa `api_usage` do dia** e recusa
  ao atingir o teto (`API_FOOTBALL_DAILY_CAP`).
- **Sync de jogos** (cron 06:00): busca `fixtures?date=` de hoje + amanhã (1 req/data) e faz upsert.
  Re-buscar datas futuras captura confrontos do mata-mata quando definidos.
- **Resultados** (cron a cada 30 min): pega jogos que já passaram de ~2h30 e ainda sem status final,
  busca em **lote** (1 request) e, ao confirmar `FT/AET/PEN`, recalcula os pontos. Não chama a API
  se não houver jogo pendente.

### Pontuação (`backend/src/config/scoring.js`)

| Acerto | Pontos |
| --- | --- |
| Placar exato | `exactScore` (5) |
| Resultado certo (vencedor/empate), placar errado | `correctWinner` (3) |
| Campeão (bônus) | `bonusChampion` (10) |
| Artilheiro (bônus) | `bonusTopScorer` (10) |

Ajuste os valores no módulo. Desempate do ranking: **quantidade de placares exatos** (`predictions.is_exact`).

### Regras importantes

- **Trava:** palpites bloqueiam no horário de início do jogo (validado no backend).
- **Cadastro:** admin (criado no seed) gera convites; amigos se cadastram com o código.
- **Correção manual:** admin pode sobrepor o placar (`score_source = manual`) e recalcular.

## Estrutura

```
backend/   src/{config,db,middleware,services,routes,cron}, tests/
frontend/  src/{styles,api,context,components,pages}
docker-compose.yml, db-init/
PRODUCT.md, DESIGN.md   # contexto de design (impeccable)
```
