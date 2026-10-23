/**
 * vue3-prompt · 刀 53 vue3 接线单测（2026-10-23，含 A/B 开关）
 *
 * 病灶：vue3 子组件清单是从 LLM 生成的 index.vue 反解的（`_detectSubComponents` + 模板标签），
 * 而 prompt 从不约束命名（规划期 `requiredSubComps` 是死变量、新 planner 已不产出 `items`）
 * ⇒ 名字与 plan 派生名对不上 ⇒ 刀 53 家族（按 plan 派生名定位子组件）在 vue3 恒零命中 = 假绿。
 *
 * 设计要点（离线 A/B 实测 15 组件，scripts/ab-vue3-prompt.mjs）：
 *   - **只下发「会被确定性接管」的名字**（平均 0.47 个/组件），不下发全部叶子名
 *     （全量下发平均 7.3 个、最多 20 个，会强行改写 LLM 的拆分粒度）；
 *   - **区段锚点与命名解耦**：锚点是资源挂载/内容守卫的公共锚，不能因「本单零接管」而丢掉；
 *   - 两臂由 `MVGO_VUE3_NAMING_CONTRACT` 控制 ⇒ 真机 A/B 可归因。
 */
import { buildVue3CodePrompt } from './vue3-prompt.js';
import { assignSectionComponentNames } from '../../utils/section-tree.js';
import { collectFoldedGridTakeover } from '../../utils/folded-grid-section-takeover.js';

const solid = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return {
    type: 'SOLID',
    visible: true,
    opacity: 1,
    color: { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 },
  };
};

/** 真值形态：header 叶 = icon 16×16 最左 + 1 个 TEXT 同行 */
const FIGMA = {
  id: 'root',
  type: 'FRAME',
  absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 20 },
  children: [
    {
      id: 'h1',
      type: 'FRAME',
      name: 'header',
      absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 20 },
      children: [
        {
          id: 'ic',
          type: 'FRAME',
          name: 'icon',
          absoluteBoundingBox: { x: 0, y: 2, width: 16, height: 16 },
          children: [
            { id: 'icv', type: 'VECTOR', absoluteBoundingBox: { x: 0, y: 2, width: 16, height: 16 } },
          ],
        },
        {
          id: 't1',
          type: 'TEXT',
          characters: '标题',
          absoluteBoundingBox: { x: 24, y: 2, width: 100, height: 16 },
          fills: [solid('#000000')],
          style: { fontSize: 16, fontWeight: 500 },
        },
      ],
    },
  ],
};

const SECTIONS = [{ id: 'h1', type: 'header', sourceNodeIds: ['h1'] }];
const RESOURCE = [
  { figmaNodeId: 'ic', resourceFile: 'icon-x.png', variableName: 'iconX', downloadStatus: 'ok' },
];

/** 期望的接管名（动态取，不硬编码：命名规则由 assignSectionComponentNames 决定） */
const NAME = assignSectionComponentNames(SECTIONS).get('h1');

const baseInput = {
  componentName: 'c-demo-abcdef12',
  layoutStructure: {},
  visualElements: [],
  charts: [],
  interactions: [],
  figmaNodeData: null,
  figmaStyleTree: null,
  styleMappings: {},
  assets: [],
  headerSlots: {},
  elementStyleMap: {},
  resourceDomMapping: [],
};

// 🔴 断言必须用「下发块特有字面量」，不能用通配 `package/components/`：
//    prompt 的「产物形态段 / 质量红线段」本来就写有 `package/components/*.vue`（模板文字），
//    用通配做阴性断言 ⇒ 恒失败（2026-10-23 实测踩过）。下发块的唯一标识是它的标题串。
const NAMING_BLOCK = '🧩 **子组件文件名（强制）**';
const ANCHOR_BLOCK = '📌 **区段锚点（强制）**';

const build = (effectiveSections, figmaNodeData = null, mapping = []) =>
  buildVue3CodePrompt(
    { ...baseInput, figmaNodeData, resourceDomMapping: mapping },
    { files: ['package/index.vue'], title: '主组件', index: 1, total: 1 },
    {
      vue3Specs: {},
      resolveSubComponentPlan: () => ({
        subPlan: { effectiveSections, items: [], isForced: false, minFiles: 0, reason: 'test' },
        effectiveSections,
        requiredSubComps: [],
        internalSubcomponents: [],
      }),
    },
  );

describe('buildVue3CodePrompt · 确定性子组件命名下发（刀 53 vue3 接线）', () => {
  const OLD = process.env.MVGO_VUE3_NAMING_CONTRACT;
  afterEach(() => {
    if (OLD === undefined) delete process.env.MVGO_VUE3_NAMING_CONTRACT;
    else process.env.MVGO_VUE3_NAMING_CONTRACT = OLD;
  });

  it('前置：fixture 确实会被刀 53 接管（否则后续断言无意义）', () => {
    expect(NAME).toBeTruthy();
    const out = collectFoldedGridTakeover({
      treeSections: SECTIONS,
      figmaNodeData: FIGMA,
      resourceMapping: RESOURCE,
      componentName: 'c-demo-abcdef12',
    });
    expect(out.map.size).toBeGreaterThan(0);
    expect(out.map.has(NAME)).toBe(true);
  });

  it('阳性①：A 臂下发接管名对应的确定性文件名与标签名', () => {
    delete process.env.MVGO_VUE3_NAMING_CONTRACT;
    const p = build(SECTIONS, FIGMA, RESOURCE);
    expect(p).toContain(NAMING_BLOCK);
    expect(p).toContain(`package/components/${NAME}.vue`);
    expect(p).toContain(`<${NAME} />`);
    expect(p).toContain(ANCHOR_BLOCK);
    expect(p).toContain('data-section-id');
  });

  it('阳性②：区段锚点与命名解耦 ⇒ 即使零接管也下发（公共锚，非刀 53 专属）', () => {
    delete process.env.MVGO_VUE3_NAMING_CONTRACT;
    // 无 figmaNodeData ⇒ 接管必然零命中 ⇒ 命名块应缺席，但锚点块必须仍在
    const p = build([{ id: 's1', type: 'body', sourceNodeIds: ['s1'] }], null, []);
    expect(p).toContain(ANCHOR_BLOCK);
    expect(p).toContain('data-section-id');
    expect(p).not.toContain(NAMING_BLOCK);
  });

  it('阴性①：B 臂（MVGO_VUE3_NAMING_CONTRACT=0）⇒ 命名与锚点都不下发（A/B 两臂唯一差异）', () => {
    process.env.MVGO_VUE3_NAMING_CONTRACT = '0';
    const p = build(SECTIONS, FIGMA, RESOURCE);
    expect(p).not.toContain(NAMING_BLOCK);
    expect(p).not.toContain(`package/components/${NAME}.vue`);
    expect(p).not.toContain(ANCHOR_BLOCK);
    expect(p).not.toContain('data-section-id');
  });

  it('阴性②：无 effectiveSections ⇒ 命名与锚点都不下发（不得无中生有）', () => {
    delete process.env.MVGO_VUE3_NAMING_CONTRACT;
    const p = build([]);
    expect(p).not.toContain(NAMING_BLOCK);
    expect(p).not.toContain(ANCHOR_BLOCK);
    expect(p).not.toContain('data-section-id');
  });
});
