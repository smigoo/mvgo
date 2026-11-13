/**
 * R1 派工规格下发 + fail-loud 单测对照（2026-11-13 · mc-1794532970423-0062020b 实锤）
 * 阳性：0062020b 真实 vision pie 条目 → chart-component 携带 chartSpec
 * 阴性1（fail-loud）：vision 有池但匹配不上 → R1 拒派并回宿主（return []）
 * 阴性2（fail-open）：无 visionCharts → 行为与旧版一致（拆分但无 chartSpec）
 * 阴性3：系列膨胀判据修正 —— 双系列 vision 不再误判，单系列 vision 仍拦
 */
import { subcomponentPlanner } from './src/ai-engine/roles/subcomponent-planner.js';
import { validateDoNotInvent } from './src/ai-engine/validators/do-not-invent-validator.js';

let pass = 0, fail = 0;
function assert(cond, label, detail = '') {
  if (cond) { pass += 1; console.log(`  ✅ ${label}`); }
  else { fail += 1; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

// ── 0062020b 真实 vision pie 条目（debug-ai-response.txt 节选）──
const VISION_PIE_LEFT = {
  section: '2:3448', type: 'pie', series: ['客车', '货车'],
  seriesTypes: ['pie', 'pie'], legend: ['客车', '货车'],
  legendPosition: 'top-right', seriesColors: ['#fac858', '#ee6666'],
  innerRadius: 0.55, legendType: 'horizontal',
  tooltip: '显示客车1234辆，货车567辆',
};
const VISION_PIE_RIGHT = { ...VISION_PIE_LEFT, section: '2:3498', tooltip: '显示客车890辆，货车432辆' };
const VISION_BAR_UNRELATED = {
  section: '2:7625', type: 'bar', series: ['北京方向', '上海方向'], seriesColors: ['#1890ff', '#52c41a'],
};

// 构造与 0062020b 同构的 section：双环形图 + 若干文本节点
function makeDonutSection() {
  return {
    id: '2:3400', name: '车辆分布', type: 'frame', layout: 'horizontal',
    children: [
      { id: '2:3446', name: '标题左', type: 'TEXT', text: '客车构成' },
      { id: '2:3448', name: 'chart-donut-left', type: 'INSTANCE' },
      { id: '2:3496', name: '标题右', type: 'TEXT', text: '货车构成' },
      { id: '2:3498', name: 'chart-donut-right', type: 'INSTANCE' },
    ],
  };
}
const LAYOUT = { sections: [makeDonutSection()] };

// ════ 阳性 ════
console.log('\n■ 阳性：vision pie 规格应完整下发到 chart-component');
{
  const plan = subcomponentPlanner.plan(
    JSON.parse(JSON.stringify(LAYOUT)),
    { visionCharts: [VISION_BAR_UNRELATED, VISION_PIE_LEFT, VISION_PIE_RIGHT] },
  );
  const subs = plan.internalSubcomponents || [];
  assert(subs.length === 2, `拆出 2 个 chart-component（实际 ${subs.length}）`, JSON.stringify(subs.map(s => s.id)));
  const left = subs.find((s) => String(s.id) === '2:3448');
  const right = subs.find((s) => String(s.id) === '2:3498');
  assert(!!left && !!right, '子组件 id 命中 2:3448 / 2:3498');
  assert(left?.chartSpec?.type === 'pie', `left chartSpec.type=pie（实际 ${left?.chartSpec?.type}）`);
  assert(
    JSON.stringify(left?.chartSpec?.series) === JSON.stringify(['客车', '货车']),
    `left series=[客车,货车]（实际 ${JSON.stringify(left?.chartSpec?.series)}）`,
  );
  assert(left?.chartSpec?.innerRadius === 0.55, `left innerRadius=0.55（实际 ${left?.chartSpec?.innerRadius}）`);
  assert(right?.chartSpec?.section === undefined && right?.chartSpec?.type === 'pie', 'right chartSpec 同步下发');
  assert(left?.parentSectionId === '2:3400', `parentSectionId=2:3400（实际 ${left?.parentSectionId}）`);
}

// ════ 阴性1：fail-loud 拒派并回宿主 ════
console.log('\n■ 阴性1（fail-loud）：vision 有池但图表匹配不上 → 拒派并回宿主');
{
  const plan = subcomponentPlanner.plan(
    JSON.parse(JSON.stringify(LAYOUT)),
    { visionCharts: [VISION_BAR_UNRELATED] }, // 池里只有不相干 bar
  );
  const subs = plan.internalSubcomponents || [];
  assert(subs.length === 0, `零裸派（实际 ${subs.length} 个子组件）`);
  const host = (plan.effectiveSections || []).find((s) => String(s.id) === '2:3400');
  assert(!!host, '宿主 section 仍在 effectiveSections（并回宿主而非丢失）');
}

// ════ 阴性2：fail-open（无 vision 数据路径不拦截）════
console.log('\n■ 阴性2（fail-open）：不传 visionCharts → 与旧版行为一致');
{
  const plan = subcomponentPlanner.plan(JSON.parse(JSON.stringify(LAYOUT)), {});
  const subs = plan.internalSubcomponents || [];
  assert(subs.length === 2, `仍拆 2 个（实际 ${subs.length}）`);
  assert(subs.every((s) => s.chartSpec === undefined), '均无 chartSpec 键（不产假规格）');
}

// ════ 阴性3：系列膨胀判据修正 ════
console.log('\n■ 阴性3：系列膨胀 WARN 域误伤修正');
{
  const files = {
    'package/components/ChartVehicleDonut.vue': `
<script setup>
const option = { series: [{ type: 'pie', name: '客车' }, { type: 'pie', name: '货车' }] };
</script>`,
  };
  // 3a：vision 双系列但漏写 multiSeries（0062020b 实况）→ 不应 WARN
  const r1 = validateDoNotInvent({ files, analysis: { charts: [{ section: '2:3448', type: 'pie', series: ['客车', '货车'], seriesColors: ['#a', '#b'] }] } });
  assert(
    !r1.issues.some((i) => i.id === 'DO-NOT-INVENT-CHART'),
    '3a 双系列 vision（无 multiSeries 声明）不再误报系列膨胀',
    JSON.stringify(r1.issues),
  );
  // 3b：vision 真单系列 → WARN 仍保留（阳性对照，门禁不死）
  const r2 = validateDoNotInvent({ files, analysis: { charts: [{ section: '2:3448', type: 'line', series: ['实际流量'] }] } });
  assert(
    r2.issues.some((i) => i.id === 'DO-NOT-INVENT-CHART'),
    '3b 真单系列 vision 仍拦系列膨胀（门禁保留）',
  );
}

console.log(`\n═══ 结果：${pass} pass / ${fail} fail ═══`);
process.exit(fail > 0 ? 1 : 0);
