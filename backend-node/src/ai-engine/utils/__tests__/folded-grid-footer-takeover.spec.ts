/**
 * 刀 53h（2026-11-02 · mc-max-1793582674250-3b0689c9 实锤）：footer 汇总条接管单测。
 *
 * 病灶：vision/planner 给出**独立 footer 段**（`type:'footer'` / id 前缀 `footer-*`，
 * `body.items` = N 组 label+value，**无 Figma 锚点**），刀53 全家族因「noAnchorNode /
 * kvPairs=0 / notCollapsedList」逐条 skip ⇒ 该段落入 LLM chunk 自由生成：
 *   ① chunk 的 scopedInput 裁剪 fail-open 回退全量 ⇒ prompt 含整片内容区；
 *   ② prompt 未声明「本 chunk 唯一负责段 = footer-summary」；
 *   ⇒ LLM 把内容区 6 节点列表整份复刻进 footer 组件（`data-section-id="footer-summary"`
 *     但内容是 node-card），footer 本体真值（共 6 个节点 / 接入设备 10810）全丢；
 *   ⇒ `index.vue` 把两块各给 `flex:1` 上下排 ⇒ 用户看到「上下重复 + 样式不同」。
 *
 * 治本：footer 段以 **planner 段契约**（`declaredSectionType==='footer'`）为锚，
 * 不依赖 Figma 锚点，确定性渲染汇总条；判据全来自段真值，零硬编码、缺事实不猜。
 */
import {
  detectFooterSummaryLeaf,
  renderFoldedGridLeafVue,
  collectFoldedGridTakeover,
} from '../folded-grid-section-takeover.js';
import { indexFigmaNodes } from '../section-tree.js';
import { validateVueSfc } from '../sfc-syntax-validation.js';

/** 3b0689c9 真机形态（planner 段，逐字取自 .checkpoint/analysis.json）。 */
const FOOTER_SEC = {
  id: 'footer-summary',
  type: 'footer',
  title: '底部汇总',
  sourceNodeIds: [],
  body: {
    layout: 'horizontal-2-items',
    bgPlaceholder: true,
    items: [
      {
        layout: 'horizontal',
        content: {
          layout: 'horizontal',
          elements: [{ type: 'label', text: '共 6 个节点', styles: { fontSize: 12, color: '#88afdf' } }],
        },
      },
      {
        layout: 'horizontal',
        content: {
          layout: 'horizontal',
          elements: [
            { type: 'label', text: '接入设备 ', styles: { fontSize: 12, color: '#88afdf' } },
            { type: 'value', text: '10810', styles: { fontSize: 12, fontWeight: 'bold', color: '#0362a6' } },
          ],
        },
      },
    ],
    backgroundImage: { src: '../resources/images/image_313-5800.png', recommendedUsage: 'backgroundBlock' },
  },
};

/** 同单的列表段（不得被 footer 判据抢走）。 */
const LIST_SEC = {
  id: '48:5798',
  type: 'list',
  title: '节点列表',
  sourceNodeIds: ['48:5798'],
  body: { layout: 'vertical-6-items', items: [{ id: 'a' }, { id: 'b' }] },
};

const MAP = [
  {
    figmaNodeId: '48:5800',
    resourceFile: '../resources/images/image_313-5800.png',
    assignedVarName: 'bg1',
    recommendedUsage: 'backgroundBlock',
    downloadStatus: 'success',
  },
];

const FIGMA = {
  id: 'root',
  type: 'FRAME',
  absoluteBoundingBox: { x: 0, y: 0, width: 470, height: 300 },
  children: [],
};

describe('刀53h detectFooterSummaryLeaf — footer 段契约判据', () => {
  it('⭐ 阳性：declaredSectionType=footer + 2 组 label/value ⇒ ok，真值全解且零列表数据', () => {
    const r = detectFooterSummaryLeaf(FOOTER_SEC, MAP);
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('footer');
    expect(r.sectionId).toBe('footer-summary');
    expect(r.groups).toHaveLength(2);
    expect(r.groups[0].parts.map((p) => p.t)).toEqual(['共 6 个节点']);
    expect(r.groups[1].parts.map((p) => p.t)).toEqual(['接入设备 ', '10810']);
    // 样式真值逐项保留（label 12px 常规 / value 12px bold）
    expect(r.groups[1].parts[0]).toMatchObject({ c: '#88afdf', fs: 12 });
    expect(r.groups[1].parts[1]).toMatchObject({ c: '#0362a6', fs: 12, fw: 'bold' });
    // footer 段真值里**没有**任何列表内容
    const all = r.groups.flatMap((g) => g.parts.map((p) => p.t)).join('|');
    expect(all).not.toContain('江苏');
    expect(all).not.toContain('在线');
  });

  it('阳性：id 前缀 footer-* 但无 type 声明 ⇒ 仍命中（id 通道）', () => {
    const r = detectFooterSummaryLeaf({ ...FOOTER_SEC, type: undefined }, MAP);
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('footer');
  });

  it('反向：列表段（type=list / id 48:5798）⇒ notFooterSection，绝不抢 list 段', () => {
    const r = detectFooterSummaryLeaf(LIST_SEC, MAP);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('notFooterSection');
  });

  it('反向：有锚点但类型是 stats/table ⇒ 不接管（几何路径优先，不得被抢）', () => {
    for (const t of ['stats', 'table', 'grid', 'header']) {
      const r = detectFooterSummaryLeaf({ ...FOOTER_SEC, id: '48:5800', type: t }, MAP);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('notFooterSection');
    }
  });

  it('反向：footer 段无 body.items ⇒ footerNoItems fail-open', () => {
    const r = detectFooterSummaryLeaf({ ...FOOTER_SEC, body: { layout: 'horizontal' } }, MAP);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('footerNoItems');
  });

  it('反向：items 全为空文本 ⇒ footerNoText fail-open（不渲染空壳）', () => {
    const r = detectFooterSummaryLeaf({
      ...FOOTER_SEC,
      body: { items: [{ content: { elements: [{ type: 'label', text: '  ' }] } }] },
    }, MAP);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('footerNoText');
  });

  it('背景图：映射有 assignedVarName ⇒ 取既有变量名（不得自造命名空间）', () => {
    const r = detectFooterSummaryLeaf(FOOTER_SEC, MAP);
    expect(r.bg).toMatchObject({ varName: 'bg1', file: 'image_313-5800.png' });
  });

  it('背景图：映射未命中 ⇒ 不下发 bg（缺事实不猜，避免 fail-closed 诊断噪声）', () => {
    const r = detectFooterSummaryLeaf(FOOTER_SEC, []);
    expect(r.ok).toBe(true);
    expect(r.bg).toBeNull();
  });
});

describe('刀53h renderFoldedGridLeafVue — footer 渲染', () => {
  const tr = detectFooterSummaryLeaf(FOOTER_SEC, MAP);
  const vue = renderFoldedGridLeafVue(tr, 'c-aiot-dpjh-bsjd');

  it('⭐ 段身份锚定：data-section-id 原样写入根元素 + fg-footer 类名', () => {
    expect(vue).toContain('data-section-id="footer-summary"');
    expect(vue).toContain('-fg-footer-');
  });

  it('⭐ 真值内联且各出现一次（不复刻、不重复）：共 6 个节点 / 接入设备 / 10810', () => {
    expect(vue.match(/共 6 个节点/g)).toHaveLength(1);
    expect(vue.match(/接入设备/g)).toHaveLength(1);
    expect(vue.match(/10810/g)).toHaveLength(1);
  });

  it('反向断言：产物不含任何列表段内容（形态复刻的结构特征）', () => {
    for (const t of ['江苏', '在线', '离线', 'node-card', 'nodeList']) {
      expect(vue).not.toContain(t);
    }
  });

  it('产物过写盘语法闸（与 list kind 同一判据）', () => {
    const v = validateVueSfc(vue, 'ContentSection.vue');
    expect(v.errors).toEqual([]);
    expect(v.valid).toBe(true);
  });

  it('🔴 背景图 URL 只走 :style 绑定，绝不拼进静态 style（593cf7f 同族铁律）', () => {
    expect(vue).toContain("import bg1 from '../../resources/images/image_313-5800.png'");
    expect(vue).toContain('backgroundImage');
    // 静态 style 段（**非** `:style` 绑定段）不得出现 url( 求值形态。
    // 🔴 `(?<!:)` 必须写：绑定段前缀正是 `:style="`，不排除则绑定段自身命中 ⇒ 假红。
    expect(vue).not.toMatch(/(?<!:)style="[^"]*url\(/);
    // 阳性对照：绑定段必须**真的**带 url(（否则上面那条「不命中」是空断言 = 假绿）
    expect(vue).toMatch(/:style="[^"]*url\(/);
  });

  it('M5-7 安全：模板/style 无 font-size:NNpx 字面量（字号全走绑定）', () => {
    expect(/font-size\s*:\s*\d+px/.test(vue)).toBe(false);
  });
});

describe('刀53h collectFoldedGridTakeover 集成', () => {
  it('⭐ 阳性：footer 段 ⇒ footerHits=1，且不落 gridHits/listHits', () => {
    const out = collectFoldedGridTakeover({
      treeSections: [FOOTER_SEC],
      figmaNodeData: FIGMA,
      resourceMapping: MAP,
      componentName: 'c-aiot-dpjh-bsjd',
    });
    expect(out.footerHits).toBe(1);
    expect(out.gridHits).toBe(0);
    expect(out.listHits).toBe(0);
    const tr = [...out.map.values()].find((v) => v.kind === 'footer');
    expect(tr).toBeTruthy();
    expect(tr.vue).toContain('共 6 个节点');
  });

  it('⭐ 同单双段：list 走 list 接管、footer 走 footer 接管（互不抢）', () => {
    const out = collectFoldedGridTakeover({
      treeSections: [LIST_SEC, FOOTER_SEC],
      figmaNodeData: FIGMA,
      resourceMapping: MAP,
      componentName: 'c-aiot-dpjh-bsjd',
    });
    const kinds = [...out.map.values()].map((v) => v.kind).sort();
    expect(out.footerHits).toBe(1);
    const footerTr = [...out.map.values()].find((v) => v.kind === 'footer');
    expect(footerTr.sectionId).toBe('footer-summary');
    expect(kinds).toContain('footer');
  });

  it('阴性：非 footer 段零命中 footerHits（不影响既有检测链）', () => {
    const out = collectFoldedGridTakeover({
      treeSections: [{ id: '10:2', type: 'text' }],
      figmaNodeData: FIGMA,
      resourceMapping: [],
      componentName: 'c-demo',
    });
    expect(out.footerHits).toBe(0);
  });

  it('🔴 变异锁：摘掉 type=footer 与 footer-* 双判据 ⇒ 该段不再被接管（用例转红）', () => {
    const mutated = { ...FOOTER_SEC, id: '48:5899', type: 'summary' };
    const r = detectFooterSummaryLeaf(mutated, MAP);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('notFooterSection');
  });
});
