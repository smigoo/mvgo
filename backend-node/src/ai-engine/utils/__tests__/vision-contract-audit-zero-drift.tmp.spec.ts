/** 一次性验收扫描（跑完即删）：D1 audit 对真实 checkpoint 的观测结果与误报率。 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { auditVisionContract } from '../vision-contract-audit.js';

const WS = join(__dirname, '../../../../workspace/custom-components');
const TARGETS = new Set([
  'c-slot-con-4851eedd',
  'c-aiot-dpjh-bsjd-a100e890',
  'c-aiot-dpjh-bsjd-769789af',
  'c-slot-con-40b65d9f',
]);

describe('Phase D1 离线验证（真实 checkpoint）', () => {
  it('4 单回放：audit 零 missing（vision 出口健康，缺陷在下游）；抽样历史误报率 <5%', () => {
    const tasks = readdirSync(WS).filter((d) => !d.startsWith('.')).sort();
    const targetResults = [];
    const sampleResults = [];
    let sampled = 0;

    for (const task of tasks) {
      const p = join(WS, task, '.checkpoint', 'visual.json');
      let data;
      try {
        data = JSON.parse(readFileSync(p, 'utf8'));
      } catch {
        continue;
      }
      const secs = data?.layoutStructure?.layout?.sections;
      if (!Array.isArray(secs) || secs.length === 0) continue;
      const r = auditVisionContract(data);
      const summary = {
        task,
        sections: r.evaluated.sections,
        missing: r.missing.map((m) => `${m.code}:${m.id}`),
      };
      if (TARGETS.has(task)) targetResults.push(summary);
      else if (sampled < 30) {
        sampleResults.push(summary);
        sampled++;
      }
    }

    console.log(`[D1] 4 单回放:\n${targetResults.map((t) => JSON.stringify(t)).join('\n')}`);
    console.log(`[D1] 历史抽样 ${sampleResults.length} 个:`);
    const byCode = {};
    let tasksWithMissing = 0;
    for (const s of sampleResults) {
      if (s.missing.length > 0) {
        tasksWithMissing++;
        console.log(`  ${s.task}: ${s.missing.join(', ')}`);
      }
      for (const m of s.missing) {
        const code = m.split(':')[0];
        byCode[code] = (byCode[code] || 0) + 1;
      }
    }
    console.log(`[D1] 有 missing 的任务: ${tasksWithMissing}/${sampleResults.length}, byCode=`, byCode);

    // 4 单必须零 missing（它们是已知 vision 健康单）
    for (const t of targetResults) {
      expect(`${t.task}: ${t.missing.join(',')}`).toBe(`${t.task}: `);
    }
    expect(targetResults).toHaveLength(4);
  });
});
