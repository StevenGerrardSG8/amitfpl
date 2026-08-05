// Snapshot the model's next-GW predictions so accuracy can be measured
// against real results after each gameweek. Runs in CI (Node 18+):
//   node scripts/predict.mjs
// Writes data/predictions/gw<N>.json  { playerId: xP } - only once per
// GW (the file is not overwritten, so the pre-deadline forecast stands).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const { initState } = await import('../js/state.js');
const { setBaseline, buildModel } = await import('../js/model.js');
const stateMod = await import('../js/state.js');

const bootstrap = read('data/bootstrap.json');
const fixtures = read('data/fixtures.json');
initState(bootstrap, fixtures);
try {
  stateMod.state.elo = read('data/elo.json');
} catch { /* FDR fallback */ }
setBaseline(read('data/baseline.json'));

const model = buildModel(1);
const gw = model.gws[0];
const outDir = join(ROOT, 'data', 'predictions');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `gw${gw}.json`);
if (existsSync(outPath)) {
  console.log(`predictions for GW${gw} already captured`);
  process.exit(0);
}
const predictions = {};
for (const p of bootstrap.elements) {
  const xp = model.xp(p.id, gw);
  if (xp > 0.05) predictions[p.id] = +xp.toFixed(2);
}
writeFileSync(outPath, JSON.stringify(predictions));
console.log(`captured ${Object.keys(predictions).length} predictions for GW${gw}`);
