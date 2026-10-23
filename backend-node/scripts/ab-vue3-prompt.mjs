/**
 * 🛡️ vue3 prompt A/B 离线评测台（2026-10-23 · 刀 53 vue3 接线）
 *
 * ## 为什么是「离线评测台」而不是 LLM A/B
 *
 * 本机 `data/ai-config.json` 的 `providers/models` 为空、`.env` 无 `MC_GEN_*` 密钥
 * ⇒ **发不出真实模型请求**，无法直接测「LLM 是否遵守命名约束」的依从率。
 * 本脚本把**两臂 prompt 本身**做成可重复、可断言的对照：两臂只有「确定性命名块」不同
 * （由 `MVGO_VUE3_NAMING_CONTRACT` 控制），其余逐字相同 ⇒ 命中率差异可归因。
 *
 * ## 离线可测的四个指标
 *   ① **体积代价**：A/B 两臂字符数差与占比（命名块会不会把 prompt 撑爆）。
 *   ② **命名清单质量**：是否全 PascalCase、是否唯一、是否混入 `index`（硬护栏相关）。
 *   ③ **命名一致性（参考值）**：下发的名字与「该组件既有产物里真实在用的子组件文件名」
 *      的重合率 —— 证明 A 臂下发的不是凭空新名字，而是系统已经在用的命名。
 *   ④ **差异纯净度**：B 臂必须**不出现**任何下发名（否则两臂差异不止一块，A/B 失效）。
 *
 * ## 用法
 *   node scripts/ab-vue3-prompt.mjs                 # 全量（精简输入，快）
 *   node scripts/ab-vue3-prompt.mjs --limit 20
 *   node scripts/ab-vue3-prompt.mjs --full          # 带真实 figmaNodeData（体积占比更真实）
 *   node scripts/ab-vue3-prompt.mjs --json
 *
 * 只读：不改产物、不写 dist、不部署。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/Users/smigoo/工作/mvgo/frontend/workspace/custom-components';
const BASE = '/Users/smigoo/工作/mvgo/backend-node/src/ai-engine';

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) || 0 : 0;
const FULL = args.includes('--full');
const AS_JSON = args.includes('--json');

const { SubcomponentPlanner } = await import(`${BASE}/roles/subcomponent-planner.js`);
const { buildVue3CodePrompt } = await import(`${BASE}/roles/microcode/vue3-prompt.js`);

/**
 * 🔴 下发名一律从 **A 臂 prompt 文本里解析**（而不是评测脚本自己再算一遍）
 *   ⇒ 评测口径与实现口径同一份，杜绝「评测算 A、实现算 B」的假绿闭环。
 */
function mandatedNamesOf(promptA) {
  const set = new Set();
  const re = /package\/components\/([A-Za-z0-9]+)\.vue/g;
  let m;
  while ((m = re.exec(promptA)) !== null) set.add(m[1]);
  return [...set];
}

/** 组件既有产物里真实在用的子组件文件名（basename，去 .vue） */
function artifactCompNames(mcRoot) {
  const dir = join(mcRoot, 'package', 'components');
  if (!existsSync(dir)) return new Set();
  return new Set(
    readdirSync(dir)
      .filter((f) => f.endsWith('.vue'))
      .map((f) => f.replace(/\.vue$/, '')),
  );
}

function buildPrompt(componentName, effectiveSections, figmaNodeData) {
  return buildVue3CodePrompt(
    {
      componentName,
      layoutStructure: {},
      visualElements: [],
      charts: [],
      interactions: [],
      figmaNodeData: figmaNodeData || null,
      figmaStyleTree: null,
      styleMappings: {},
      assets: [],
      headerSlots: {},
      elementStyleMap: {},
      resourceDomMapping: [],
    },
    { files: ['package/index.vue'], title: '主组件', index: 1, total: 1 },
    {
      vue3Specs: {},
      resolveSubComponentPlan: () => ({
        subPlan: { effectiveSections, items: [], isForced: false, minFiles: 0, reason: 'ab' },
        effectiveSections,
        requiredSubComps: [],
        internalSubcomponents: [],
      }),
    },
  );
}

const dirs = [];
for (const name of readdirSync(ROOT)) {
  const mc = join(ROOT, name, '.mc-gen');
  if (existsSync(join(mc, 'cache', 'figma-node-data.json'))) dirs.push({ name, mc });
}
const targets = LIMIT > 0 ? dirs.slice(0, LIMIT) : dirs;

const rows = [];
for (const { name, mc } of targets) {
  let figma = null;
  let layout = null;
  try { figma = JSON.parse(readFileSync(join(mc, 'cache', 'figma-node-data.json'), 'utf-8')); } catch { continue; }
  try { layout = JSON.parse(readFileSync(join(mc, 'config', 'preview-analysis.json'), 'utf-8')); } catch { continue; }
  let plan;
  try { plan = new SubcomponentPlanner().plan(layout, { figmaNodeData: figma }); } catch { continue; }
  const sections = plan?.effectiveSections;
  if (!Array.isArray(sections) || sections.length === 0) continue;

  const figmaIn = FULL ? figma : null;
  process.env.MVGO_VUE3_NAMING_CONTRACT = '1';
  const pA = buildPrompt(name, sections, figmaIn);
  process.env.MVGO_VUE3_NAMING_CONTRACT = '0';
  const pB = buildPrompt(name, sections, figmaIn);
  process.env.MVGO_VUE3_NAMING_CONTRACT = '1';
  const names = mandatedNamesOf(pA);

  const artifact = artifactCompNames(join(ROOT, name));
  const overlap = names.filter((n) => artifact.has(n));
  const leakInB = names.filter((n) => pB.includes(`package/components/${n}.vue`));
  const bad = names.filter((n) => !/^[A-Z][A-Za-z0-9]*$/.test(n) || n === 'Index' || n === 'index');

  rows.push({
    component: name,
    sections: sections.length,
    names: names.length,
    badNames: bad,
    dupNames: names.length - new Set(names).size,
    artifactComps: artifact.size,
    nameOverlap: overlap.length,
    nameOverlapPct: names.length ? Number((overlap.length / names.length).toFixed(3)) : 0,
    charsA: pA.length,
    charsB: pB.length,
    deltaChars: pA.length - pB.length,
    deltaPct: pB.length ? Number(((pA.length - pB.length) / pB.length).toFixed(4)) : 0,
    leakInB: leakInB.length,
    hasAnchorRule: pA.includes('data-section-id'),
    anchorInB: pB.includes('data-section-id'),
  });
}

const n = rows.length || 1;
const avg = (k) => Number((rows.reduce((s, r) => s + (r[k] || 0), 0) / n).toFixed(3));
const summary = {
  mode: FULL ? 'full(real figmaNodeData)' : 'slim(no figmaNodeData)',
  components: rows.length,
  totalNames: rows.reduce((s, r) => s + r.names, 0),
  avgNamesPerComponent: avg('names'),
  maxNames: Math.max(0, ...rows.map((r) => r.names)),
  badNamesTotal: rows.reduce((s, r) => s + r.badNames.length, 0),
  dupNamesTotal: rows.reduce((s, r) => s + r.dupNames, 0),
  avgNameOverlapPct: avg('nameOverlapPct'),
  avgDeltaChars: Math.round(avg('deltaChars')),
  avgDeltaPct: avg('deltaPct'),
  maxDeltaChars: Math.max(0, ...rows.map((r) => r.deltaChars)),
  leakInBTotal: rows.reduce((s, r) => s + r.leakInB, 0),
  anchorRuleInA: rows.filter((r) => r.hasAnchorRule).length,
  anchorRuleInB: rows.filter((r) => r.anchorInB).length,
};

if (AS_JSON) {
  console.log(JSON.stringify({ summary, rows }, null, 2));
} else {
  console.log('=== vue3 prompt A/B 离线评测（A=开命名契约 / B=关）===');
  console.log(summary);
  console.log('\n--- 命名清单最大的 5 个组件（体积代价 / 一致性）---');
  for (const r of [...rows].sort((a, b) => b.names - a.names).slice(0, 5)) {
    console.log(
      `${r.component}: names=${r.names} Δ=${r.deltaChars}字(${r.deltaPct}) 与产物命名重合=${r.nameOverlap}/${r.names}`,
    );
  }
  console.log('\n--- 与既有产物命名重合率为 0 的组件（A 臂下发了产物里没用过的名字）---');
  const zero = rows.filter((r) => r.names > 0 && r.nameOverlap === 0).slice(0, 5);
  for (const r of zero) console.log(`${r.component}: names=${r.names} artifactComps=${r.artifactComps}`);
  if (!zero.length) console.log('（无）');
}
