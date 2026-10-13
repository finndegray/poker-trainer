import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { getPushFoldData } from '../src/app/data';
import { MAX_RETRAINING_ENTRIES } from '../src/game/retraining';
import { analyzeHand } from '../src/review/analysis';
import { extractTexts, planImport } from '../src/review/import';
import { UNRATED_TEXT } from '../src/review/preflop';
import { retrainingCandidates } from '../src/review/retraining';
import { detectTournamentKind } from '../src/review/tournament-kind';

// Measures the full analysis of real hand histories and prints how the postflop decisions were rated.
// Usage: npm run review:bench -- <file.zip|file.txt> [...]
const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error('Aufruf: npm run review:bench -- <Datei.zip|Datei.txt> …');
  process.exit(2);
}
const missing = paths.filter((p) => !existsSync(p));
if (missing.length > 0) {
  console.error(`Datei nicht gefunden: ${missing.join(', ')} (die Beispieldaten liegen nicht im Repository).`);
  process.exit(2);
}
const data = getPushFoldData();
const started = performance.now();
const { texts } = extractTexts(paths.map((p) => ({ name: basename(p), bytes: new Uint8Array(readFileSync(p)) })));
const plan = planImport(texts, new Set());
const hands = [...plan.tournaments.values()].flat();
const analyses = hands.map((hand) => ({ hand, analysis: analyzeHand(hand, data) }));
const ms = performance.now() - started;

const counts = new Map<string, number>();
const add = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
let postflop = 0;
for (const { analysis } of analyses) {
  for (const d of analysis.decisions) {
    if (d.street === 'preflop') continue;
    postflop++;
    if (d.rating.model === 'postflop') add(`${d.rating.verdict} (${d.rating.reason})`);
    else if (d.rating.model === 'unrated') add(`nicht bewertet: ${UNRATED_TEXT[d.rating.reason]}`);
  }
}
console.log(`${hands.length} Hände analysiert in ${(ms / 1000).toFixed(2)} s`);
console.log(`${postflop} Postflop-Entscheidungen:`);
for (const [key, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${key}`);

// What the retraining queue would take from these hands (spec 10): preflop errors of normal tournaments.
const analysisOf = new Map(analyses.map(({ hand, analysis }) => [hand.id, analysis]));
const queue = [...plan.tournaments.values()].flatMap((list) =>
  retrainingCandidates(
    detectTournamentKind(list[0].tournamentName),
    list.map((hand) => ({ id: hand.id, playedAt: hand.playedAt, analysis: analysisOf.get(hand.id)! })),
  ),
);
const pushfold = queue.filter((c) => c.game === 'pushfold').length;
console.log(
  `Nachtraining: ${queue.length} Spots (${pushfold} Push/Fold, ${queue.length - pushfold} Starthand), höchstens ${MAX_RETRAINING_ENTRIES} in der Warteschlange`,
);
