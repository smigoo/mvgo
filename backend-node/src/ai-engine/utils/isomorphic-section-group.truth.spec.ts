/**
 * 🧬 刀 66-P0 回归规格（2026-11-12 · mc-max-1794412722103-adbd1b3d 三厂商段实锤）
 *
 * 覆盖两层：
 *  L0 事实层 buildIsoSectionTruth / classifyIsoSectionTheme —— Figma 确定性配色，
 *     取不到一律留空（fail-open，绝不臆造颜色）；纯附加不改 sections 骨架。
 *  L1 判据层 collectIsomorphicSectionGroups —— 展平一层纯分组容器（默认关闭 ⇒ 零行为变更）、
 *     视觉声明只作候选、真值交叉校验；阴性对照逐条枚举「真错形态必须仍 0 组」。
 *
 * 🔴 对照纪律：阴性样本用**未过滤的原始输入**重建旧实现，不先 filter 掉边界样本。
 */
import {
  assessIsoEligibility,
  collectIsomorphicSectionGroups,
  flattenPureGroupEntries,
  isoBodyEntries,
  renderIsoWrapperSfc,
  validateIsoTemplateProps,
} from './isomorphic-section-group.js';
import {
  buildIsoSectionTruth,
  classifyIsoSectionTheme,
  injectIsomorphicSectionTruth,
} from './layout-truth-healer.js';
import {
  buildIsoTemplateContract,
  buildIsoTemplateContractText,
} from './iso-template-contract.js';
import { rewriteIndexRepeatGroups } from './index-repeat-group-rewrite.js';

const leaf = (n: number) => ({ name: `厂商${n}`, value: `${n}台`, type: 'stat-card' });
const group = (name: string, leaves: any[]) => ({ name, role: 'content-grid', children: leaves });
const mk = (id: string, children: any[], patch: any = {}) => ({
  id,
  type: 'content',
  header: { title: `段-${id}` },
  body: { layout: 'grid', gridColumns: 4, children },
  ...patch,
});
const trio = (kidsOf: (i: number) => any) => [
  mk('1:1', [kidsOf(1), kidsOf(2)]),
  mk('1:2', [kidsOf(3), kidsOf(4)]),
  mk('1:3', [kidsOf(5), kidsOf(6)]),
];
const plainTrio = () => trio((i) => group('厂商卡片组', [leaf(i), leaf(i + 1)]));

/** 合成 Figma 树：三段同一套 frame 复制，仅数值文本色/卡片底色不同。 */
const figmaTree = (bg: string, accent: string) => ({
  id: 'sec',
  type: 'FRAME',
  name: 'Group',
  children: [
    { id: 'f1', type: 'FRAME', name: 'Frame 2136639903', fills: [{ type: 'SOLID', visible: true, color: { r: parseInt(bg.slice(1, 3), 16) / 255, g: parseInt(bg.slice(3, 5), 16) / 255, b: parseInt(bg.slice(5, 7), 16) / 255 } }] },
    { id: 't1', type: 'TEXT', characters: '8台', fills: [{ type: 'SOLID', visible: true, color: { r: parseInt(accent.slice(1, 3), 16) / 255, g: parseInt(accent.slice(3, 5), 16) / 255, b: parseInt(accent.slice(5, 7), 16) / 255 } }] },
    { id: 't2', type: 'TEXT', characters: '0台', fills: [{ type: 'SOLID', visible: true, color: { r: 103 / 255, g: 155 / 255, b: 190 / 255 } }] },
    { id: 't3', type: 'TEXT', characters: '华为技术', fills: [{ type: 'SOLID', visible: true, color: { r: 0.2, g: 0.2, b: 0.2 } }] },
  ],
});

describe('刀66-P0 · L0 同构段 Figma 真值', () => {
  it('配色从 TEXT 填充确定性提取（非零→accent / 零值→zeroColor / 浅色 frame→bg）', () => {
    const { theme } = classifyIsoSectionTheme(figmaTree('#fffdf1', '#b9a000'));
    expect(theme).toEqual({ bg: '#fffdf1', accent: '#b9a000', zeroColor: '#679bbe' });
  });

  it('🔴 很淡的绿底 #f6fff7（通道差仅 9）不得被中性色过滤误丢', () => {
    const { theme } = classifyIsoSectionTheme(figmaTree('#f6fff7', '#00ac2e'));
    expect(theme.bg).toBe('#f6fff7');
    expect(theme.accent).toBe('#00ac2e');
  });

  it('正文灰 #333333 不得被当作 accent（数值文本才参与）', () => {
    const node = { id: 'x', type: 'FRAME', children: [{ id: 't', type: 'TEXT', characters: '标题', fills: [{ type: 'SOLID', visible: true, color: { r: 0.2, g: 0.2, b: 0.2 } }] }] };
    expect(classifyIsoSectionTheme(node).theme.accent).toBe('');
  });

  it('取不到 Figma 节点 ⇒ 全空 fail-open，绝不臆造颜色', () => {
    const truth = buildIsoSectionTruth({ layout: { sections: [mk('99:1', [leaf(1)])] } }, null);
    expect(truth!.sections[0].figmaNodeId).toBe('');
    expect(truth!.sections[0].theme).toEqual({ bg: '', accent: '', zeroColor: '' });
  });

  it('注入是纯附加：sections 骨架逐字节不变，字段挂在 parsed.isoSectionTruth', () => {
    const parsed: any = { layout: { sections: [mk('1:1', [leaf(1)])] }, figmaNodeData: null };
    const before = JSON.stringify(parsed.layout.sections);
    injectIsomorphicSectionTruth(parsed, null);
    expect(JSON.stringify(parsed.layout.sections)).toBe(before);
    expect(parsed.isoSectionTruth.source).toBe('figma-node-tree');
  });

  it('四形态 sections 都能枚举且按 id 去重', () => {
    const p: any = { layout: { sections: [mk('1:1', [leaf(1)])] }, sections: [mk('1:1', [leaf(1)]), mk('1:2', [leaf(2)])] };
    expect(buildIsoSectionTruth(p, null)!.sections.map((s) => s.id)).toEqual(['1:1', '1:2']);
  });
});

describe('刀66-P0 · L1 同构判据', () => {
  it('默认关闭展平 ⇒ 分组容器仍 entry-nested 全拒（零行为变更）', () => {
    const secs = plainTrio();
    for (const s of secs) expect(assessIsoEligibility(s as any).reason).toBe('entry-nested');
    expect(collectIsomorphicSectionGroups(secs as any).groups).toHaveLength(0);
  });

  it('🔴 资格否决必留因（reasons 可归因，禁止静默 rejected=0）', () => {
    const secs = plainTrio();
    const r = collectIsomorphicSectionGroups(secs as any);
    expect(r.groups).toHaveLength(0);
    const ineligible = (r.stats.reasons as string[]).filter((x) => x.startsWith('ineligible:entry-nested:'));
    expect(ineligible).toHaveLength(3);
  });

  it('展平只对「无文本/无媒体、children 全为叶子文本」的纯分组容器生效', () => {
    const raw = [group('厂商卡片组', [leaf(1), leaf(2)]), leaf(3)];
    expect(flattenPureGroupEntries(raw)).toHaveLength(3);
    expect(isoBodyEntries({ body: { children: raw } } as any, { flattenOneLevel: true })).toHaveLength(3);
  });

  it('阳性：三个同构段收敛为 1 组 / 3 成员 / 条目 2+2 展平', () => {
    const r = collectIsomorphicSectionGroups(plainTrio() as any, { flattenOneLevel: true });
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].members).toHaveLength(3);
    expect(r.groups[0].columns).toBe(4);
    expect(r.groups[0].members.map((m) => m.items.length)).toEqual([4, 4, 4]);
  });

  it('真值存在时把 theme 纯附加到 member；无真值时 member 无 theme 键', () => {
    const secs = plainTrio() as any;
    const truth = { source: 'figma-node-tree', sections: secs.map((s: any, i: number) => ({ id: s.id, columns: 4, theme: { bg: '#fff', accent: ['#b9a000', '#00ac2e', '#0099bb'][i], zeroColor: '#679bbe' } })), declaredGroups: [], counts: {} };
    const r = collectIsomorphicSectionGroups(secs, { flattenOneLevel: true, truth });
    expect(r.stats.withTruth).toBe(3);
    expect(r.groups[0].members.map((m: any) => m.theme.accent)).toEqual(['#b9a000', '#00ac2e', '#0099bb']);
    expect('theme' in collectIsomorphicSectionGroups(secs, { flattenOneLevel: true }).groups[0].members[0]).toBe(false);
  });

  it('阴性① 带图表的分组容器：开开关仍 0 组', () => {
    const secs = trio((i) => ({ name: '带图组', chart: { type: 'bar' }, children: [leaf(i), leaf(i + 1)] }));
    expect(collectIsomorphicSectionGroups(secs as any, { flattenOneLevel: true }).groups).toHaveLength(0);
  });

  it('阴性② 二层嵌套容器不展平：开开关仍 0 组', () => {
    const secs = trio((i) => ({ name: '外层', children: [{ name: '内层', children: [leaf(i), leaf(i + 1)] }] }));
    expect(collectIsomorphicSectionGroups(secs as any, { flattenOneLevel: true }).groups).toHaveLength(0);
  });

  it('阴性③ 视觉声明单独存在不创建组：declared=1 rejected=1', () => {
    const secs = trio((i) => ({ name: '带图组', chart: { type: 'bar' }, children: [leaf(i), leaf(i + 1)] }));
    const r = collectIsomorphicSectionGroups(secs as any, {
      flattenOneLevel: true,
      declaredGroups: [{ groupId: 'x', sectionIds: ['1:1', '1:2', '1:3'] }],
    });
    expect(r.groups).toHaveLength(0);
    expect(r.stats.declared).toBe(1);
    expect(r.stats.rejected).toBe(1);
  });

  it('阴性④ 声明混入不同签名段 ⇒ rejected（防模型误合并）', () => {
    const secs = plainTrio() as any;
    secs.push(mk('1:9', [leaf(9)]));
    secs[3].body.gridColumns = 2;
    const r = collectIsomorphicSectionGroups(secs, {
      flattenOneLevel: true,
      declaredGroups: [{ groupId: 'x', sectionIds: ['1:1', '1:9'] }],
    });
    expect(r.stats.rejected).toBe(1);
  });

  it('阴性⑤ 单段不成组（ISO_GROUP_MIN_MEMBERS=2）', () => {
    expect(collectIsomorphicSectionGroups([plainTrio()[0]] as any, { flattenOneLevel: true }).groups).toHaveLength(0);
  });

  it('阴性⑥ stats/chart/table/slotCandidate/纵向布局 逐条不命中', () => {
    const base: any = plainTrio()[0];
    const variants = [
      { ...base, type: 'stats' }, { ...base, type: 'chart' }, { ...base, type: 'table' },
      { ...base, slotCandidate: true },
      { ...base, body: { layout: 'vertical', children: [leaf(1)] } },
    ];
    for (const v of variants) expect(assessIsoEligibility(v, { flattenOneLevel: true }).eligible).toBe(false);
  });

  it('阴性⑦ 真值存在但某段 Figma 不可解析 ⇒ 剔除该段并留痕', () => {
    const secs = plainTrio() as any;
    const truth = { source: 'figma-node-tree', sections: [{ id: '1:1', columns: 4, theme: {} }, { id: '1:2', columns: 4, theme: {} }], declaredGroups: [], counts: {} };
    const r = collectIsomorphicSectionGroups(secs, { flattenOneLevel: true, truth });
    expect(r.stats.reasons).toContain('truth-missing:1:3');
    expect(r.groups[0].members).toHaveLength(2);
  });
});

/** P1：theme 参数化链路（契约 / 校验 / 薄包装 / index v-for），全部要求「无真值零漂移」。 */
describe('刀66-P1 · theme 参数化四象限共用链路', () => {
  const TPL = `<template>
  <div v-bind="$attrs" :style="{ '--iso-accent': theme?.accent || '' }">
    <h2>{{ title }}</h2>
    <div v-for="item in items" :key="item.name"><span>{{ item.name }}</span><b v-if="item.value">{{ item.value }}</b></div>
  </div>
</template>
<script setup>
defineProps({ title: String, icon: String, items: Array, theme: Object })
</script>`;
  const TPL_NO_THEME = TPL.replace('theme: Object', '');
  const chunk = { files: ['package/components/ContentSection.vue'], isoContract: { groupSize: 3, columns: 4, hasTheme: true } };

  it('契约文本单一来源：chunk 适配与 text 函数逐字一致', () => {
    expect(buildIsoTemplateContract(chunk)).toBe(buildIsoTemplateContractText(chunk.isoContract, chunk.files[0]));
  });

  it('hasTheme ⇒ 契约含 theme props / 2b 配色驱动 / 禁止硬编码', () => {
    const c = buildIsoTemplateContract(chunk);
    expect(c).toContain('`theme`（Object');
    expect(c).toContain('2b. **配色必须由');
    expect(c).toContain('禁止硬编码颜色');
    expect(c).toContain('theme.zeroColor');
  });

  it('无 hasTheme ⇒ 契约不含任何 theme 条款（旧形态零漂移）', () => {
    const c = buildIsoTemplateContract({ files: ['a.vue'], isoContract: { groupSize: 3, columns: 4 } });
    expect(c).not.toContain('`theme`');
    expect(c).not.toContain('2b.');
    expect(c).not.toContain('theme.');
  });

  it('无同构组 ⇒ 空串', () => {
    expect(buildIsoTemplateContract({ isoContract: undefined })).toBe('');
  });

  it('池后校验：requireTheme=false 旧模板仍通过（零回归）', () => {
    expect(validateIsoTemplateProps(TPL_NO_THEME).ok).toBe(true);
  });

  it('池后校验：requireTheme=true 且声明 theme ⇒ 通过；漏 theme ⇒ FAIL', () => {
    expect(validateIsoTemplateProps(TPL, { requireTheme: true }).ok).toBe(true);
    const v = validateIsoTemplateProps(TPL_NO_THEME, { requireTheme: true });
    expect(v.ok).toBe(false);
    expect(v.reasons).toContain('props-missing:theme');
  });

  const wrapperBase = { wrapperName: 'ContentSection3', templateName: 'ContentSection', member: { id: '38:3162', title: '优质厂商', icon: '', items: [{ name: '大华股份', value: '8台' }] } };

  it('薄包装：无 theme 不含 :theme（与旧版逐字节一致）', () => {
    const s = renderIsoWrapperSfc(wrapperBase as any);
    expect(s).not.toContain(':theme');
    expect(s).toContain(":items='");
  });

  it('薄包装：有 theme ⇒ 单引号 JSON 转发三配色', () => {
    const s = renderIsoWrapperSfc({ ...wrapperBase, member: { ...wrapperBase.member, theme: { bg: '#f6fff7', accent: '#00ac2e', zeroColor: '#679bbe' } } } as any);
    expect(s).toContain(':theme=\'{"bg":"#f6fff7","accent":"#00ac2e","zeroColor":"#679bbe"}\'');
    expect(s).toContain('data-section-id="38:3162"');
    expect(s).toContain('v-bind="$attrs"');
  });

  const IDX = `<template><div>
    <ContentSection data-section-id="1:1" title="A" :items="[]" />
    <ContentSection2 data-section-id="1:2" title="B" :items="[]" />
  </div></template>
<script setup>
import ContentSection from './components/ContentSection.vue'
import ContentSection2 from './components/ContentSection2.vue'
</script>`;
  const plan = [{ repName: 'ContentSection', members: [
    { id: '1:1', title: 'A', icon: '', items: [], compName: 'ContentSection' },
    { id: '1:2', title: 'B', icon: '', items: [], compName: 'ContentSection2' },
  ] }];

  it('index v-for：无 theme 改写成功且不含 theme（旧形态零漂移）', () => {
    const r = rewriteIndexRepeatGroups(IDX, plan);
    expect(r.applied).toHaveLength(1);
    expect(r.content).not.toContain(':theme');
  });

  it('index v-for：有 theme ⇒ :theme 下发 + 数据数组逐段配色', () => {
    const withTheme = [{ repName: 'ContentSection', members: plan[0].members.map((m, i) => ({ ...m, theme: { bg: '#fff', accent: ['#b9a000', '#00ac2e'][i], zeroColor: '#679bbe' } })) }];
    const r = rewriteIndexRepeatGroups(IDX, withTheme);
    expect(r.applied).toHaveLength(1);
    expect(r.content).toContain(':theme="isoItem.theme"');
    expect(r.content).toContain('"accent":"#b9a000"');
    expect(r.content).toContain('"accent":"#00ac2e"');
    expect((r.content.match(/<ContentSection\b/g) || []).length).toBe(1);
  });
});
