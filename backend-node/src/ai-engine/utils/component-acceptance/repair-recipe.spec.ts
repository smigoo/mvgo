/**
 * 🛡️ 修复轮配方契约（2026-11-12 · mc-max-1794419314972-fbd77192 实锤）
 *
 * 真实缺口：初检 C1-DUP「在线设备」+ C1b「15 个厂商标签缺席」⇒ 定向修复轮 1 轮空转 ⇒ 拒交付。
 *   - C1-DUP：旧 keeper 只认「接管类名」；本例两个文件都带 data-section-id 段锚、都无接管类名
 *     ⇒ 旧规则③「保留带段锚的那份」不可判定 ⇒ LLM 只能猜。
 *   - C1b：旧 fail 只有 detail + files，没有「照抄什么 / 落在哪个数组」⇒ LLM 把真值改成
 *     defineProps 空默认（父组件零传参）⇒ 复检仍缺 15 条。
 *
 * 本 spec 钉两件事（每条都带阳性对照，防「零命中假绿」）：
 *   ① C1-DUP keeper 有几何归属时给出**确定性**保留/删除行；
 *   ② C1b fail 携带结构化真值条目，guidance 给出可照抄 rows 字面量 + 拆空 props 规则。
 */
import { runAcceptanceChecks, formatAcceptanceGuidance, needsCarrierRebuild } from './index.js';

const box = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

describe('C1-DUP keeper 几何归属（无需接管类名也可判定）', () => {
  // 真值：两个并列段落（A、B）+ 一个落在 B 里的文本节点（父容器不是任何段，照抄 796:3 实锤形态）
  const figWithBox = {
    document: {
      id: 'root',
      type: 'GROUP',
      children: [
        { id: 'secA', type: 'GROUP', name: 'Group A', absoluteBoundingBox: box(0, 0, 200, 100), children: [] },
        { id: 'secB', type: 'GROUP', name: 'Group B', absoluteBoundingBox: box(220, 0, 200, 100), children: [] },
        { id: 't1', type: 'TEXT', characters: '在线设备', absoluteBoundingBox: box(300, 40, 60, 20) },
      ],
    },
  };
  // 阳性对照：同一棵树但真值节点没有 bbox ⇒ 无法几何归属，必须退回「none」
  const figNoBox = {
    document: {
      id: 'root',
      type: 'GROUP',
      children: [
        { id: 'secA', type: 'GROUP', name: 'Group A', absoluteBoundingBox: box(0, 0, 200, 100), children: [] },
        { id: 'secB', type: 'GROUP', name: 'Group B', absoluteBoundingBox: box(220, 0, 200, 100), children: [] },
        { id: 't1', type: 'TEXT', characters: '在线设备' },
      ],
    },
  };
  const files = {
    'package/components/SectionA.vue':
      '<template><div data-section-id="secA"><span>在线设备</span></div></template>',
    'package/components/SectionB.vue':
      '<template><div data-section-id="secB"><span>在线设备</span></div></template>',
  };

  it('① 文本中心落在 B 段 ⇒ keeper=SectionB，files 只列 SectionA，配方写明删哪份', () => {
    const r = runAcceptanceChecks({ files, figmaNodeData: figWithBox });
    const dup = r.fails.find((f) => f.code === 'C1-DUP');
    expect(dup).toBeTruthy();
    expect(dup.files).toEqual(['package/components/SectionA.vue']);
    const d0 = dup.dupRenders[0];
    expect(d0.keeper).toBe('package/components/SectionB.vue');
    expect(d0.keeperBy).toBe('geometry');
    expect(d0.ownerSectionId).toBe('secB');
    const g = formatAcceptanceGuidance([dup]);
    expect(g).toContain('逐条归属');
    expect(g).toContain('保留 package/components/SectionB.vue');
    expect(g).toContain('从 package/components/SectionA.vue 中删除');
  });

  it('② 阳性对照：真值节点无 bbox ⇒ keeperBy=none、不产出逐条归属行（退回规则③）', () => {
    const r = runAcceptanceChecks({ files, figmaNodeData: figNoBox });
    const dup = r.fails.find((f) => f.code === 'C1-DUP');
    expect(dup).toBeTruthy();
    expect(dup.dupRenders[0].keeperBy).toBe('none');
    expect(dup.dupRenders[0].keeper).toBe('');
    const g = formatAcceptanceGuidance([dup]);
    expect(g).not.toContain('逐条归属');
    expect(g).toContain('保留带 data-section-id 段锚的组件中的那份');
  });
});

describe('C1b 配方：真值条目结构化 + 拆空 props 规则', () => {
  const fig = {
    document: {
      id: 'root',
      type: 'GROUP',
      children: [
        {
          id: '38:3206',
          type: 'GROUP',
          name: '普通厂商',
          absoluteBoundingBox: box(0, 0, 240, 120),
          children: [
            { id: 'n1', type: 'TEXT', characters: '普通厂商' },
            { id: 'n2', type: 'TEXT', characters: '特来电' },
            { id: 'n3', type: 'TEXT', characters: '8台' },
            { id: 'n4', type: 'TEXT', characters: '金溢科技' },
            { id: 'n5', type: 'TEXT', characters: '8台' },
          ],
        },
      ],
    },
  };
  // 实锤形态：段锚在、标题在、数据走 defineProps 空默认（父组件零传参）⇒ 标签全缺席
  const emptyPropsFile =
    '<template><div data-section-id="38:3206"><span>普通厂商</span>' +
    '<div v-for="(it, i) in rows" :key="i"><span>{{ it.name }}</span><span>{{ it.count }}</span></div>' +
    '</div></template>\n<script setup>\nconst props = defineProps({ rows: { type: Array, default: () => [] } })\nconst rows = props.rows\n</script>';

  it('① 缺席标签带 file/sectionId/count，guidance 给出可照抄 rows 与拆空 props 规则', () => {
    const r = runAcceptanceChecks({
      files: { 'package/components/Sec5.vue': emptyPropsFile },
      figmaNodeData: fig,
    });
    const c1b = r.fails.find((f) => f.code === 'C1b');
    expect(c1b).toBeTruthy();
    expect(c1b.files).toEqual(['package/components/Sec5.vue']);
    const items = c1b.missingLabels;
    const 特来电 = items.find((x: any) => x.text === '特来电');
    expect(特来电).toBeTruthy();
    expect(特来电.sectionId).toBe('38:3206');
    expect(特来电.file).toBe('package/components/Sec5.vue');
    expect(特来电.count).toBe('8台');

    const g = formatAcceptanceGuidance([c1b]);
    expect(g).toContain('C1b 真值标签缺席修复配方');
    expect(g).toContain('[data-section-id="38:3206"]');
    expect(g).toContain("{ name: '特来电', count: '8台' },");
    expect(g).toContain("{ name: '金溢科技', count: '8台' },");
    expect(g).toContain('空默认数组');
  });

  it('② 阳性对照：标签真实渲染 ⇒ 不判 C1b（判据不是「有 props 就红」）', () => {
    const ok =
      '<template><div data-section-id="38:3206"><span>普通厂商</span>' +
      '<div v-for="(it, i) in rows" :key="i"><span>{{ it.name }}</span></div></div></template>\n' +
      "<script setup>\nconst rows = [{ name: '特来电' }, { name: '金溢科技' }]\n</script>";
    const r = runAcceptanceChecks({
      files: { 'package/components/Sec5.vue': ok },
      figmaNodeData: fig,
    });
    // 「8台」在真值里出现 2 次且产物未渲染，仍可能计入缺席；只断言厂商名不再缺席
    const c1b = r.fails.find((f) => f.code === 'C1b');
    if (c1b) {
      const texts = (c1b.missingLabels || []).map((x: any) => x.text);
      expect(texts).not.toContain('特来电');
      expect(texts).not.toContain('金溢科技');
    }
  });
});

/**
 * 🛡️ 防线2 配方契约（2026-11-12 · mc-max-1794452025496-3d081117 实锤）
 *
 * 真实缺口：tabs 段**整块漏生成**（产物连段锚都没有）⇒ 初检 E2-v3/G-SLOT/C1b 三连拒。
 *   旧配方只到「C1b：把这几条标签补进已有容器」一级；承载根本不存在时，修复轮无处可落
 *   ⇒ 1 轮空转、复检仍 FAIL。防线2 把指令升级为「按真值补建承载组件/承载容器」：
 *   先建承载（含新建文件 + index.vue 注册），再按真值顺序落全量条目。
 *
 * 判据（单一来源、可辩驳）：① C1b 缺席标签合计 ≥3 条；② 任一段 A1-v2 真值文本命中率 <50%。
 * 本 spec 钉四件事（阴阳对照，防「零命中假绿」）：
 *   阳性① A1-v2 段整块未生成 ⇒ 配方给出「未定位到承载文件」+ 全量真值条目 + 新建承载三步；
 *   阳性② C1b 缺席 ≥3 ⇒ 触发防线2（配方与 C1b 配方并存）；
 *   阴性① C1b 缺席恰 2 条（<3）⇒ 只出 C1b 配方，**不出**防线2；
 *   阴性② tabs 段全量渲染 ⇒ 不判 A1-v2，**不出**防线2。
 */
describe('防线2 配方：大面积缺席 ⇒ 补建承载组件（非只补标签）', () => {
  // ── 阳性①：真值 tabs 段整块未生成（产物连段锚都没有）
  const figTabs = {
    document: {
      id: 'root',
      type: 'GROUP',
      children: [
        {
          id: '89:39',
          type: 'GROUP',
          name: 'tabs',
          children: [
            { id: 't1', type: 'TEXT', characters: '监控' },
            { id: 't2', type: 'TEXT', characters: '照明' },
            { id: 't3', type: 'TEXT', characters: '通风' },
            { id: 't4', type: 'TEXT', characters: '供配电' },
          ],
        },
      ],
    },
  };
  const filesNoTabs = {
    'package/components/Content.vue':
      '<template><div class="c"><span>别的内容</span></div></template>',
  };
  // ── 阴性②：同真值但 tabs 段全量渲染
  const filesTabsOk = {
    'package/components/Tabs.vue':
      '<template><div data-section-id="89:39"><span>监控</span><span>照明</span><span>通风</span><span>供配电</span></div></template>',
  };

  it('阳性① A1-v2 段整块未生成 ⇒ 配方含「整块未生成」+ 全量真值条目 + 新建承载三步', () => {
    const r = runAcceptanceChecks({ files: filesNoTabs, figmaNodeData: figTabs });
    const a1 = r.fails.find((f) => f.code === 'A1-v2');
    expect(a1).toBeTruthy();
    expect(a1.sectionId).toBe('89:39');
    expect(a1.sectionName).toBe('tabs');
    expect(a1.hitRate).toBe(0);
    expect(a1.file).toBeNull();
    expect(a1.truthTexts).toEqual(['监控', '照明', '通风', '供配电']);

    const g = formatAcceptanceGuidance([a1]);
    expect(g).toContain('承载组件补建配方');
    expect(g).toContain('整块未生成');
    expect(g).toContain('[data-section-id="89:39"]');
    expect(g).toContain("'监控'");
    expect(g).toContain("'供配电'");
    expect(g).toContain('新建承载');
    expect(g).toContain('① 承载不存在');
  });

  it('阴性② tabs 段全量渲染 ⇒ 不判 A1-v2、不出防线2', () => {
    const r = runAcceptanceChecks({ files: filesTabsOk, figmaNodeData: figTabs });
    expect(r.fails.some((f) => f.code === 'A1-v2')).toBe(false);
    const g = formatAcceptanceGuidance(r.fails);
    expect(g).not.toContain('承载组件补建配方');
  });

  // ── 阳性②：C1b 缺席恰 3 条
  const figVendors = {
    document: {
      id: 'root',
      type: 'GROUP',
      children: [
        {
          id: '38:3206',
          type: 'GROUP',
          name: '普通厂商',
          children: [
            { id: 'n1', type: 'TEXT', characters: '特来电' },
            { id: 'n2', type: 'TEXT', characters: '金溢科技' },
            { id: 'n3', type: 'TEXT', characters: '万集科技' },
          ],
        },
      ],
    },
  };
  const filesEmpty = {
    'package/components/Sec5.vue':
      '<template><div data-section-id="38:3206"><span>普通厂商</span></div></template>',
  };
  // ── 阴性①：C1b 缺席恰 2 条（<3）
  const figTwo = {
    document: {
      id: 'root',
      type: 'GROUP',
      children: [
        {
          id: '2:1',
          type: 'GROUP',
          name: '面板',
          children: [
            { id: 'a1', type: 'TEXT', characters: '甲标签' },
            { id: 'a2', type: 'TEXT', characters: '乙标签' },
            { id: 'a3', type: 'TEXT', characters: '丙标签' },
          ],
        },
      ],
    },
  };
  const filesTwo = {
    'package/components/P.vue':
      '<template><div data-section-id="2:1"><span>面板</span><span>丙标签</span></div></template>',
  };

  it('阳性② C1b 缺席 ≥3 ⇒ 触发防线2（与 C1b 配方并存）', () => {
    const r = runAcceptanceChecks({ files: filesEmpty, figmaNodeData: figVendors });
    const c1b = r.fails.find((f) => f.code === 'C1b');
    expect(c1b).toBeTruthy();
    expect((c1b.missingLabels || []).length).toBeGreaterThanOrEqual(3);

    const g = formatAcceptanceGuidance(r.fails);
    expect(g).toContain('C1b 真值标签缺席修复配方');
    expect(g).toContain('承载组件补建配方');
    expect(g).toContain('C1b 缺席 3 条');
    expect(g).toContain("'特来电'");
    expect(g).toContain('[data-section-id="38:3206"]');
  });

  it('阴性① C1b 缺席恰 2 条（<3）⇒ 只出 C1b 配方，不出防线2', () => {
    const r = runAcceptanceChecks({ files: filesTwo, figmaNodeData: figTwo });
    const c1b = r.fails.find((f) => f.code === 'C1b');
    expect(c1b).toBeTruthy();
    expect((c1b.missingLabels || []).length).toBe(2);
    expect(r.fails.some((f) => f.code === 'A1-v2')).toBe(false);

    const g = formatAcceptanceGuidance(r.fails);
    expect(g).toContain('C1b 真值标签缺席修复配方');
    expect(g).not.toContain('承载组件补建配方');
  });

  it('判据单一来源：needsCarrierRebuild 阈值边界（C1b≥3 / 有 A1-v2；二者与配方触发同源）', () => {
    expect(needsCarrierRebuild([])).toBe(false);
    expect(needsCarrierRebuild([{ code: 'E2-v3' }])).toBe(false);
    // C1b 恰 2 条 ⇒ 不触发
    expect(needsCarrierRebuild([{ code: 'C1b', missingLabels: [{}, {}] }])).toBe(false);
    // C1b 累计 ≥3（可跨段累加）⇒ 触发
    expect(needsCarrierRebuild([{ code: 'C1b', missingLabels: [{}, {}] }, { code: 'C1b', missingLabels: [{}] }])).toBe(true);
    // 任一 A1-v2（命中率<50%）⇒ 触发
    expect(needsCarrierRebuild([{ code: 'A1-v2' }])).toBe(true);
  });
});

/**
 * D-GRID 配方 · 列数声明位置（2026-11-12 · mc-max-1794461199581-253def62 实锤）
 *
 * 真机：统计段（真值 2 列）产物写成
 *   `<div style="display:grid;grid-template-columns:repeat(2,1fr)" v-for=...>`
 * —— grid 写在**被重复的卡**上，宿主容器反而没有网格 ⇒ D-GRID「数不出列数」。
 * 旧配方只有「分组卡 v-for」形态，未点名这个错法 ⇒ 修复轮照抄形态①仍把 grid 放卡上。
 * 本 spec 钉：配方必须显式给出「grid 只写宿主 / 卡内禁止 grid」+ 统计卡行形态。
 */
describe('D-GRID 配方 · v-for 列数声明位置', () => {
  it('阳性：D-GRID FAIL ⇒ 配方点名宿主容器写法并给统计卡形态', () => {
    const g = formatAcceptanceGuidance([
      {
        code: 'D-GRID',
        file: 'package/components/StatsSection.vue',
        detail: '段 38:3260 真值 2 列网格，但承载元素数不出列数',
      } as any,
    ]);
    expect(g).toContain('D1/D3/D-GRID 分组结构修复配方');
    expect(g).toContain('grid-template-columns 只能写在 **v-for 的宿主容器**上');
    expect(g).toContain('禁止再声明 display:grid');
    expect(g).toContain('形态③（统计卡行');
    expect(g).toContain('.stat-row  { display: grid;');
  });

  it('阴性：无分组结构类 FAIL ⇒ 不出该配方（防无条件灌配方）', () => {
    const g = formatAcceptanceGuidance([{ code: 'E2-v3', detail: '前景资源零消费' } as any]);
    expect(g).not.toContain('D1/D3/D-GRID 分组结构修复配方');
  });
});
