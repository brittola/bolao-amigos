/**
 * Relink dos IDs de provider: re-aponta `matches.api_fixture_id` e
 * `teams.api_team_id`/`logo_url` dos valores antigos (API-Football) para os do
 * provider atual (football-data), preservando `matches.id` e, portanto, os palpites.
 *
 * Casa por horário de kickoff e deriva os times por posição (ver services/relink.js).
 *
 * Uso:
 *   NODE_ENV=production node src/scripts/relink.js          # dry-run (não grava)
 *   NODE_ENV=production node src/scripts/relink.js --apply  # aplica em transação
 */
import { db } from '../config/db.js';
import { loadRelinkData, buildRelinkPlan, applyRelinkPlan } from '../services/relink.js';

const APPLY = process.argv.includes('--apply');

function fixtureLabel(p) {
  return `${p.home.name ?? 'TBD'} vs ${p.away.name ?? 'TBD'}`;
}

async function main() {
  const { local, provider } = await loadRelinkData();
  const plan = buildRelinkPlan(local, provider);

  const localById = new Map(local.map((m) => [m.matchId, m]));
  const provById = new Map(provider.map((p) => [p.fixtureId, p]));

  console.log(`\n=== RELINK ${APPLY ? '(APLICANDO)' : '(DRY-RUN)'} ===`);
  console.log(`locais=${local.length} provider=${provider.length} | jogos casados=${plan.matchUpdates.length} times=${plan.teamUpdates.length} unmatched=${plan.unmatched.length}\n`);

  console.log('JOGOS:');
  for (const u of plan.matchUpdates) {
    const m = localById.get(u.matchId);
    const p = provById.get(u.fixtureId);
    console.log(`  matchId=${u.matchId}  fixture ${m.apiFixtureId} → ${u.fixtureId}  | local: ${m.homeName ?? 'TBD'} vs ${m.awayName ?? 'TBD'}  ↔  fd: ${fixtureLabel(p)}`);
  }

  console.log('\nTIMES (api_team_id → novo + logo):');
  for (const u of plan.teamUpdates) {
    console.log(`  teamId=${u.teamId}  → ${u.providerId}  (${u.crest ?? 'sem crest'})`);
  }

  if (plan.unmatched.length) {
    console.log('\n⚠️  UNMATCHED (não serão alterados):');
    for (const m of plan.unmatched) {
      console.log(`  matchId=${m.matchId}  fixture=${m.apiFixtureId}  ${m.homeName ?? 'TBD'} vs ${m.awayName ?? 'TBD'}  kickoffMs=${m.kickoffMs}`);
    }
  }

  if (!APPLY) {
    console.log('\n(dry-run) nada gravado. Rode com --apply para efetivar.');
    return;
  }

  if (plan.unmatched.length) {
    console.log('\n❌ Há jogos unmatched — abortando para não deixar dados inconsistentes. Resolva antes de aplicar.');
    process.exitCode = 1;
    return;
  }

  const res = await applyRelinkPlan(plan);
  console.log(`\n✅ Aplicado: ${res.matches} jogos e ${res.teams} times atualizados.`);
}

main()
  .catch((err) => {
    console.error('Erro no relink:', err);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
