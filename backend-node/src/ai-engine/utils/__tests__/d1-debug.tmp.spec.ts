import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditVisionContract } from '../vision-contract-audit.js';
const WS = join(__dirname, '../../../../workspace/custom-components');
it('spot-check pairing', () => {
  const tasks = readdirSyncSafe();
  function readdirSyncSafe() { return require('node:fs').readdirSync(WS).filter((d: string) => !d.startsWith('.')); }
  for (const t of tasks) {
    let d; try { d = JSON.parse(readFileSync(join(WS, t, '.checkpoint', 'visual.json'), 'utf8')); } catch { continue; }
    const r = auditVisionContract(d);
    const p = r.missing.filter((m: any) => m.code === 'stats-pairing-broken');
    if (p.length) console.log(t, JSON.stringify(p));
  }
});
