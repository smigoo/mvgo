/**
 * hardcoded-text-gate · 刀 54 单测（2026-10-23 · mc-max-1792718704810-f98f7463 实锤）
 *
 * 病灶：`CardGrid.vue` 状态列写死英文 `status:'disabled'`（真值「禁用」）并用作判色键；
 * `ContentSection3.vue`（无 data-section-id）写死 `ref('运行中')` / `ref('2')`。
 * 既有 do-not-invent / section-content-guard / business-text-rules 全不覆盖「文本来源」。
 *
 * 对照纪律：每条阳性都必须配阴性（证明判据没有「全放行」或「全拦」）。
 */
import {
  collectFigmaTruthTexts,
  extractArtifactTextLiterals,
  detectHardcodedText,
  healHardcodedText,
  editDistance,
  pickUniqueTruthCandidate,
  pickSiblingTruthCandidate,
} from '../hardcoded-text-gate.js';

/** 构造最小 figma 树（TEXT 节点可嵌套） */
function figmaWithTexts(texts) {
  return {
    document: {
      id: 'root',
      type: 'FRAME',
      children: texts.map((t, i) => ({
        id: `n${i}`,
        type: 'TEXT',
        characters: t,
      })),
    },
  };
}

describe('collectFigmaTruthTexts 真值全集', () => {
  it('递归取整树 TEXT（含嵌套），非 TEXT 节点不进集合', () => {
    const root = {
      document: {
        type: 'FRAME',
        children: [
          { type: 'FRAME', children: [{ type: 'TEXT', characters: '嵌套文本' }] },
          { type: 'TEXT', characters: '顶层文本' },
          { type: 'VECTOR' },
        ],
      },
    };
    const s = collectFigmaTruthTexts(root);
    expect(s.has('嵌套文本')).toBe(true);
    expect(s.has('顶层文本')).toBe(true);
    expect(s.size).toBe(2);
  });

  it('无 figmaRoot / 空树 ⇒ 空集（fail-open 前提）', () => {
    expect(collectFigmaTruthTexts(null).size).toBe(0);
    expect(collectFigmaTruthTexts({}).size).toBe(0);
  });
});

describe('extractArtifactTextLiterals 字面量抽取', () => {
  it('抽取 template 静态文本，跳过插值节点', () => {
    const sfc = `<template>
  <span>运行中</span>
  <span>{{ dynText }}</span>
</template>`;
    const lits = extractArtifactTextLiterals(sfc);
    const texts = lits.map((l) => l.text);
    expect(texts).toContain('运行中');
    expect(texts).not.toContain('dynText');
    expect(lits.find((l) => l.text === '运行中').kind).toBe('static-text');
  });

  it('抽取 ref / const 字面量', () => {
    const sfc = `<template><span>x</span></template>
<script setup>
const statLabel = ref('运行中')
const title = "具身机器人设备列表"
</script>`;
    const lits = extractArtifactTextLiterals(sfc);
    const kinds = lits.map((l) => `${l.kind}:${l.text}`);
    expect(kinds).toContain('ref:运行中');
    expect(kinds).toContain('const:具身机器人设备列表');
  });

  it('抽取 v-for 数据源数组字段值', () => {
    const sfc = `<template>
  <div v-for="(row, i) in tableRows" :key="i">{{ row.name }}</div>
</template>
<script setup>
const tableRows = [
  { name: '服务区巡检狗K1', status: '启用' },
  { name: '服务区巡检狗K2', status: 'disabled' }
]
</script>`;
    const lits = extractArtifactTextLiterals(sfc);
    const vals = lits.filter((l) => l.kind === 'array-value').map((l) => l.text);
    expect(vals).toContain('服务区巡检狗K1');
    expect(vals).toContain('disabled');
  });

  it('阴性：echarts option 里的 type:"bar" 不抽（不是 v-for 数据源）', () => {
    const sfc = `<template><div ref="chartRef"></div></template>
<script setup>
const option = { series: [{ type: 'bar', data: [1, 2] }] }
</script>`;
    const lits = extractArtifactTextLiterals(sfc);
    expect(lits.map((l) => l.text)).not.toContain('bar');
  });

  it('阴性：style 块 / import 路径 / console / publishEvent 实参一律不抽', () => {
    const sfc = `<template><span>真值文本</span></template>
<script setup>
import icon1 from '../../resources/images/image_473938-37.png'
console.log('[debug] 这是一条日志')
runtimeBuilder.publishEvent('c-device-onload', { componentId: 'device' })
</script>
<style lang="less" scoped>
.a { content: "样式里的文字"; }
</style>`;
    const texts = extractArtifactTextLiterals(sfc).map((l) => l.text);
    expect(texts).toContain('真值文本');
    expect(texts).not.toContain('这是一条日志');
    expect(texts).not.toContain('c-device-onload');
    expect(texts).not.toContain('device');
    expect(texts).not.toContain('样式里的文字');
  });
});

describe('detectHardcodedText 判据', () => {
  const figma = figmaWithTexts(['总设备', '运行中', '离线', '启用', '禁用', '8', '2', '1']);

  it('阳性：真值集外的英文枚举 disabled ⇒ 命中', () => {
    const sfc = `<template>
  <div v-for="(row, i) in rows" :key="i">{{ row.status }}</div>
</template>
<script setup>
const rows = [
  { status: '启用' },
  { status: 'disabled' }
]
</script>`;
    const r = detectHardcodedText({ files: [{ path: 'package/components/C.vue', content: sfc }], figmaRoot: figma });
    expect(r.hits).toBe(1);
    expect(r.issues[0].text).toBe('disabled');
    expect(r.issues[0].kind).toBe('array-value');
    expect(r.issues[0].field).toBe('status');
  });

  it('阴性：真值文本不报（含无 section-id 的编造组件也按真值放行）', () => {
    const sfc = `<template><span>运行中</span></template>
<script setup>
const statLabel = ref('运行中')
</script>`;
    const r = detectHardcodedText({ files: [{ path: 'package/components/C.vue', content: sfc }], figmaRoot: figma });
    expect(r.hits).toBe(0);
    expect(r.evaluated).toBeGreaterThan(0); // 证明确实扫到了，只是放行
  });

  it('阴性：纯符号 / 空态文案 / 单个数字字符走白名单，不报', () => {
    const sfc = `<template>
  <span>—</span><span>暂无数据</span><span>加载中...</span><span>8</span>
</template>`;
    const r = detectHardcodedText({ files: [{ path: 'package/components/C.vue', content: sfc }], figmaRoot: figma });
    expect(r.hits).toBe(0);
  });

  it('阳性：真值外的**多位数字**同样判硬编码（数字臆造不放行 —— N1 只诊断不改）', () => {
    const sfc = `<template><span>999</span><span>3.14</span></template>`;
    const r = detectHardcodedText({ files: [{ path: 'package/components/C.vue', content: sfc }], figmaRoot: figma });
    expect(r.hits).toBe(2);
    expect(r.issues.map((i) => i.text).sort()).toEqual(['3.14', '999']);
  });

  it('fail-open：无 figmaRoot ⇒ 不判不改（零命中且带理由）', () => {
    const sfc = `<template><span>凭空文本</span></template>`;
    const r = detectHardcodedText({ files: [{ path: 'package/components/C.vue', content: sfc }], figmaRoot: null });
    expect(r.hits).toBe(0);
    expect(r.evaluated).toBe(0);
    expect(r.skippedReason).toBe('no-figma-truth');
  });
});

describe('healHardcodedText 处置', () => {
  it('heal：唯一编辑距离候选 ⇒ 替换为真值文本（纯形式相似度，不猜语义）', () => {
    expect(editDistance('运行', '运行中')).toBe(1);
    const truth = new Set(['运行中', '总设备', '离线']);
    expect(pickUniqueTruthCandidate('运行', truth)).toBe('运行中');
    expect(pickUniqueTruthCandidate('disabled', truth)).toBe(null);

    const figma = figmaWithTexts(['运行中', '总设备', '离线']);
    const sfc = `<template><span>运行中</span><span>总设备</span><span>{{ label }}</span></template>
<script setup>
const label = ref('运行')
</script>`;
    const r = healHardcodedText({ files: [{ path: 'package/components/C.vue', content: sfc }], figmaRoot: figma });
    expect(r.healed.length).toBe(1);
    expect(r.healed[0].to).toBe('运行中');
    expect(r.files[0].content).toContain("ref('运行中')");
  });

  it('strip：无候选 ⇒ 剥离（产物里不留非真值内容文本）+ 复检幂等归零', () => {
    // ⚠️ 刀 56 后本 fixture 的 truth **不含**「禁用」：否则「disabled」会被兄弟配对
    //    heal 成「禁用」（升级行为，见刀 56 describe）；要测 strip 路径本身须让
    //    兄弟配对不成立（truth 无可配的缺失 CJK 真值）。
    const figma = figmaWithTexts(['启用', 'K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8']);
    const sfc = `<template>
  <div v-for="(row, i) in rows" :key="i">{{ row.status }}</div>
</template>
<script setup>
const rows = [
  { status: '启用' }, { status: '启用' }, { status: '启用' },
  { status: 'disabled' },
  { status: '启用' }, { status: '启用' }, { status: '启用' }, { status: '启用' }
]
</script>`;
    const r = healHardcodedText({ files: [{ path: 'package/components/C.vue', content: sfc }], figmaRoot: figma });
    expect(r.stripped.length).toBe(1);
    expect(r.stripped[0].text).toBe('disabled');
    expect(r.files[0].content).not.toContain('disabled');
    const recheck = detectHardcodedText({ files: r.files, figmaRoot: figma });
    expect(recheck.hits).toBe(0);
  });

  it('保险：同字段多数值都非真值 ⇒ 不剥（宁漏不误删），转 residual', () => {
    const figma = figmaWithTexts(['启用', '禁用', '总设备', '运行中']);
    // 文件级多数仍属真值（4 真值 / 3 非真值 ⇒ 不触发文件级安全阀），只有 status 字段整列非真值
    const sfc = `<template>
  <span>启用</span><span>禁用</span><span>总设备</span><span>运行中</span>
  <div v-for="(row, i) in rows" :key="i">{{ row.status }}</div>
</template>
<script setup>
const rows = [{ status: 'aaa' }, { status: 'bbb' }, { status: 'ccc' }]
</script>`;
    const r = healHardcodedText({ files: [{ path: 'package/components/C.vue', content: sfc }], figmaRoot: figma });
    expect(r.stripped.length).toBe(0);
    expect(r.residual.length).toBe(3);
    expect(r.residual[0].reason).toBe('group-majority-untruth');
    expect(r.files[0].content).toContain('aaa');
  });

  it('文件级安全阀：某文件多数应判字面量都非真值 ⇒ 整文件不处置，只留痕', () => {
    const figma = figmaWithTexts(['启用']);
    const sfc = `<template>
  <span>凭空标题</span><span>凭空副标题</span><span>启用</span>
</template>`;
    const r = healHardcodedText({ files: [{ path: 'package/components/C.vue', content: sfc }], figmaRoot: figma });
    expect(r.stripped.length).toBe(0);
    expect(r.healed.length).toBe(0);
    expect(r.residual.length).toBe(2);
    expect(r.residual[0].reason).toBe('file-majority-untruth');
    // 原文一字不动
    expect(r.files[0].content).toContain('凭空标题');
    expect(r.files[0].content).toContain('凭空副标题');
  });

  it('validateSfc 拒绝 ⇒ 回退（沿用既有「引入新错误即回退」铁律）', () => {
    const figma = figmaWithTexts(['启用', '禁用', '总设备']);
    // 文件级多数属真值（3 真值 / 1 非真值），确保走到 validateSfc 而非被文件级安全阀拦下
    const sfc = `<template><span>启用</span><span>禁用</span><span>总设备</span><span>{{ label }}</span></template>
<script setup>
const label = ref('凭空')
</script>`;
    const r = healHardcodedText({
      files: [{ path: 'package/components/C.vue', content: sfc }],
      figmaRoot: figma,
      validateSfc: () => ({ valid: false, errors: ['模拟拒绝'] }),
    });
    expect(r.stripped.length).toBe(0);
    expect(r.residual.length).toBe(1);
    expect(r.files[0].content).toContain("ref('凭空')");
  });
});

/**
 * 🛡️ 刀 56 / 方案 D（2026-10-23 · mc-max-1792718704810-f98f7463 实锤）：同字段兄弟值配对。
 *
 * 病灶：LLM 把真值枚举「禁用」写成英文 `disabled`。刀 54 detect 能抓到（kind=array-value），
 * 但 heal 的 `pickUniqueTruthCandidate` 是「字面量↔真值」编辑距离 ⇒ `disabled↔禁用` 距离 8+
 * 恒无候选 ⇒ 走 strip ⇒ `status:''` + `=== 'disabled'` 比较键原样留着
 * ⇒ 文字消失 + 橙色判分支永假，**比不处置更糟**（离线探针实锤）。
 *
 * 刀 56：同字段 CJK 真值兄弟 {启用} + 唯一最小编辑距离缺失真值 {禁用(距1)} ⇒
 * **全文**把 `'disabled'` 字符串字面量替换为 `'禁用'`（数组值 + 判色键一并改）。
 */
describe('刀 56 · pickSiblingTruthCandidate / healHardcodedText 兄弟值配对', () => {
  const CARD = `<template>
  <div v-for="row in rows" :key="row.name">
    <span :class="row.status === 'disabled' ? 'c-x-text--disabled' : 'c-x-text--enabled'">{{ row.status }}</span>
  </div>
</template>

<script setup>
const rows = [
  { name: 'K1', status: '启用' },
  { name: 'K2', status: '启用' },
  { name: 'K5', status: 'disabled' },
]
</script>
`;
  // ⚠️ file-majority-untruth 阀：name 值 K1/K2/K5 ∉ truth 时非真值占 4/6>50% ⇒ 整文件
  //    residual、heal 永不发生 ⇒ fixture 须把 name 值一并放进 truth（真实语料中设备名
  //    本就是 Figma TEXT，这样构造与真实形态一致）。
  const TRUTH = figmaWithTexts(['启用', '启用', '启用', '启用', '启用', '启用', '启用', '禁用', 'K1', 'K2', 'K5']);

  it('阳性①：disabled 与兄弟 CJK 值「启用」配出唯一缺失真值「禁用」（编辑距离 1）', () => {
    const truth = collectFigmaTruthTexts(TRUTH);
    const lits = extractArtifactTextLiterals(CARD);
    const bad = lits.find((l) => l.text === 'disabled');
    expect(bad).toBeTruthy();
    const cand = pickSiblingTruthCandidate(CARD, bad, truth, lits, undefined);
    expect(cand).toBe('禁用');
  });

  it('阳性②：healHardcodedText 全文替换 —— 数组值与 === 判色键一并改，CSS class 名不动', () => {
    const r = healHardcodedText({ files: [{ path: 'package/components/CardGrid.vue', content: CARD }], figmaRoot: TRUTH });
    expect(r.healed).toEqual([{ path: 'package/components/CardGrid.vue', from: 'disabled', to: '禁用', kind: 'array-value' }]);
    expect(r.stripped).toEqual([]);
    const out = r.files[0].content;
    expect(out).toContain(`status: '禁用'`);
    expect(out).toContain(`row.status === '禁用'`);
    expect(out).not.toContain(`'disabled'`);
    // CSS class 名后缀 --disabled/--enabled 是样式引用，不参与文本渲染 ⇒ 必须保留
    expect(out).toContain('c-x-text--disabled');
    expect(out).toContain('c-x-text--enabled');
  });

  it('阳性③：既有 pickUniqueTruthCandidate 路径不受影响（直接编辑距离命中优先）', () => {
    // 「启用x」与真值「启用」距 1 且唯一 ⇒ 走老路径精确替换
    // ⚠️ 抽取器只认「模板 v-for 引用的数组」为数据源 ⇒ fixture 必须带 v-for 行
    const sfc = `<template>
  <div v-for="row in rows" :key="row.name">{{ row.status }}</div>
</template>
<script setup>
const rows = [
  { name: 'K1', status: '启用x' },
  { name: 'K2', status: '启用' },
]
</script>`;
    const r = healHardcodedText({ files: [{ path: 'a.vue', content: sfc }], figmaRoot: figmaWithTexts(['启用', '禁用', 'K1', 'K2']) });
    expect(r.healed[0]?.to).toBe('启用');
    expect(r.stripped).toEqual([]);
  });

  it('阴性①：同字段无 CJK 真值兄弟 ⇒ 不配对（fail-open）', () => {
    const sfc = `<template>
  <div v-for="row in rows" :key="row.a">{{ row.a }}</div>
</template>
<script setup>
const rows = [
  { a: 'xx' },
  { a: 'disabled' },
]
</script>`;
    const truth = collectFigmaTruthTexts(figmaWithTexts(['禁用']));
    const lits = extractArtifactTextLiterals(sfc);
    const bad = lits.find((l) => l.text === 'disabled');
    expect(pickSiblingTruthCandidate(sfc, bad, truth, lits, undefined)).toBeNull();
  });

  it('阴性②：缺失真值候选不唯一（两个距 1）⇒ 不配对（宁漏不误换）', () => {
    // 兄弟「启用」；truth 里「禁用」和「停用」都与「启用」距 1 ⇒ 歧义
    const truth = collectFigmaTruthTexts(figmaWithTexts(['启用', '禁用', '停用']));
    const lits = extractArtifactTextLiterals(CARD);
    const bad = lits.find((l) => l.text === 'disabled');
    expect(pickSiblingTruthCandidate(CARD, bad, truth, lits, undefined)).toBeNull();
  });

  it('阴性③：配对目标已在本文件出现 ⇒ 不配对（不能把已有值换掉语义）', () => {
    const sfc = CARD.replace(`status: 'disabled'`, `status: '停用'`).replace(`=== 'disabled'`, `=== '停用'`);
    const truth = collectFigmaTruthTexts(figmaWithTexts(['启用', '禁用', '停用']));
    const lits = extractArtifactTextLiterals(sfc);
    const bad = lits.find((l) => l.text === '停用');
    // 「停用」已 present ⇒ 禁用 不得被配对到它
    expect(pickSiblingTruthCandidate(sfc, bad, truth, lits, undefined)).toBeNull();
  });

  it('阴性④：无 field 的形态（static-text 等）⇒ 兄弟配对不参与，走原路径', () => {
    // ⚠️ file-majority-untruth 阀：单非真值文本的文件 1/1>50% 会整文件 residual ⇒
    //    fixture 需带足量真值文本让该文件「多数为真值」
    const sfc = `<template><div><span>标题</span><span>运行中</span><span>disabled</span></div></template>`;
    const r = healHardcodedText({ files: [{ path: 'a.vue', content: sfc }], figmaRoot: figmaWithTexts(['标题', '运行中', '启用', '禁用']) });
    expect(r.healed).toEqual([]);
    expect(r.stripped.length).toBe(1);
    expect(r.stripped[0].text).toBe('disabled');
  });
});
