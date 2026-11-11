/**
 * 🛡️ C1/C2/D1 内容性缺陷判据（2026-11-11 · a3d97188 / 4e881233 / e3ea6ac8 三实案锁定）
 *
 * 契约：
 *   - C2 假数据禁令：Math.random() 出现在任何 .vue ⇒ FAIL（含 guidance 指向数据接入）；
 *   - C1 内容真值：模板静态展示文本 ≥2 条不在 Figma 真值 TEXT 集合 ⇒ FAIL
 *     （纯数字/单字符/标识符豁免；真值包含关系豁免；插值 {{}} 不扫）；
 *   - D1 DSML 剥离：`｜｜DSML｜｜`/`<parameter name=`/`</parameter>` 标记行被移除，
 *     周边代码保留；先 DSML 后尾部剥离顺序固定。
 * 阳性样本全部来自真机产物逐字摘录。
 */
import { runAcceptanceChecks, formatAcceptanceGuidance } from '../component-acceptance/index.js';
import { stripDsmlToolMarkersFromFiles } from '../llm-tail-garbage.js';

const TRUTH_DOC = {
  document: {
    children: [
      {
        id: '136:127',
        name: '3',
        type: 'FRAME',
        children: [
          { id: 't1', type: 'TEXT', characters: '超高车辆' },
          { id: 't2', type: 'TEXT', characters: '19' },
          { id: 't3', type: 'TEXT', characters: '次' },
        ],
      },
      {
        id: '2:7954',
        name: 'tabs',
        type: 'FRAME',
        children: [{ id: 't4', type: 'TEXT', characters: '江阴大桥' }],
      },
    ],
  },
};

describe('C2 假数据禁令', () => {
  it('阳性：Math.random() 出现 ⇒ C2 FAIL（a3d97188 refreshStats 形态）', () => {
    const r = runAcceptanceChecks({
      files: {
        'package/index.vue': '<template><div /></template>\n<script setup>const v = Math.floor(Math.random() * 100)</script>',
      },
    });
    const c2 = r.fails.find((f) => f.code === 'C2');
    expect(c2).toBeTruthy();
    expect(c2.detail).toContain('Math.random');
  });

  it('阴性：无随机生成 ⇒ 不报 C2', () => {
    const r = runAcceptanceChecks({
      files: { 'package/index.vue': '<template><div>{{ v }}</div></template>\n<script setup>const v = 1</script>' },
    });
    expect(r.fails.find((f) => f.code === 'C2')).toBeUndefined();
  });
});

describe('C1 内容真值', () => {
  it('阳性：AntD 演示占位「标签一/二/三」不在真值 ⇒ C1 FAIL（4e881233 形态）', () => {
    const r = runAcceptanceChecks({
      files: {
        'package/components/TabsSection.vue':
          '<template>\n  <div>\n    <span>标签一</span>\n    <span>标签二</span>\n    <span>标签三</span>\n  </div>\n</template>',
      },
      figmaNodeData: TRUTH_DOC,
    });
    const c1 = r.fails.find((f) => f.code === 'C1');
    expect(c1).toBeTruthy();
    expect(c1.detail).toContain('真值中不存在');
  });

  it('阴性：真值文本命中（含包含关系豁免）⇒ 不报 C1', () => {
    const r = runAcceptanceChecks({
      files: {
        'package/components/A.vue':
          '<template>\n  <div>\n    <span>超高车辆</span>\n    <span>江阴大桥</span>\n    <span>{{ dynamic }}</span>\n    <span>19</span>\n  </div>\n</template>',
      },
      figmaNodeData: TRUTH_DOC,
    });
    expect(r.fails.find((f) => f.code === 'C1')).toBeUndefined();
  });

  it('豁免：纯数字/标识符/单字符不计入臆造', () => {
    const r = runAcceptanceChecks({
      files: {
        'package/components/A.vue':
          '<template>\n  <div>\n    <span>12345</span>\n    <span>onClickHandler</span>\n    <span>x</span>\n    <span>超高车辆</span>\n  </div>\n</template>',
      },
      figmaNodeData: TRUTH_DOC,
    });
    expect(r.fails.find((f) => f.code === 'C1')).toBeUndefined();
  });
});

describe('D1 DSML 工具标记剥离', () => {
  it('阳性：e3ea6ac8 真机形态标记行被剥离、代码行保留', () => {
    const src = [
      '<script setup>',
      '// === 布局类型（默认 one） ===',
      '</｜｜DSML｜｜ parameter>',
      '<parameter name="new_string">// === package/index.vue ===',
      'const layout = "one"',
      '</script>',
    ].join('\n');
    const r = stripDsmlToolMarkersFromFiles({ 'package/index.vue': src }, () => {});
    const out = r.files['package/index.vue'];
    expect(r.cleanedFiles).toHaveLength(1);
    expect(r.cleanedFiles[0].lines).toBe(2);
    expect(out).not.toContain('DSML');
    expect(out).not.toContain('<parameter');
    expect(out).toContain('const layout = "one"');
    expect(out).toContain("// === 布局类型（默认 one） ===");
  });

  it('阴性：干净文件零改动', () => {
    const src = '<template><div>x</div></template>';
    const r = stripDsmlToolMarkersFromFiles({ 'package/index.vue': src }, () => {});
    expect(r.cleanedFiles).toHaveLength(0);
    expect(r.files['package/index.vue']).toBe(src);
  });
});

describe('A6 FAIL 文件结构化字段（判据 → 续跑剔除契约）', () => {
  const TRUTH_TAB = {
    document: {
      children: [
        { id: '2:7954', name: 'tabs', type: 'FRAME', children: [{ id: 't1', type: 'TEXT', characters: '江阴大桥' }] },
        { id: '2:9000', name: 'sub-header', type: 'FRAME', children: [{ id: 't2', type: 'TEXT', characters: '车型分布' }] },
      ],
    },
  };

  it('G1-v2 命中时带结构化 file 字段（graph 据此剔除续跑白名单）', () => {
    const r = runAcceptanceChecks({
      files: {
        // tab 段承载文件：无 @click ⇒ G1-v2 命中
        'package/components/TabsSection.vue':
          '<template>\n  <div data-section-id="2:7954">\n    <span>江阴大桥</span>\n  </div>\n</template>',
        // 另一个文件含 2:9000 段锚但缺「车型分布」文本 ⇒ A1-v2 命中并定位到该文件
        'package/components/Dist.vue':
          '<template>\n  <div data-section-id="2:9000"><span>其它文案</span></div>\n</template>',
      },
      figmaNodeData: TRUTH_TAB,
    });
    const g1 = r.fails.find((f) => f.code === 'G1-v2');
    expect(g1).toBeTruthy();
    expect(g1.file).toBe('package/components/TabsSection.vue');
    const a1 = r.fails.find((f) => f.code === 'A1-v2');
    expect(a1).toBeTruthy();
    expect(a1.file).toBe('package/components/Dist.vue');
  });

  it('E3-v2 双 bg 声明带结构化 file 字段', () => {
    const r = runAcceptanceChecks({
      files: {
        'package/components/Bad.vue':
          '<template>\n  <div :style="{ backgroundImage: \'url(\' + b + \')\' }" style="background-image:url(\'../a.png\')" />\n</template>',
      },
    });
    const e3 = r.fails.find((f) => f.code === 'E3-v2');
    expect(e3).toBeTruthy();
    expect(e3.file).toBe('package/components/Bad.vue');
  });

  it('产物中无承载的 tab 段（G1-v2 无 file 形态）不误报 file 字段', () => {
    const r = runAcceptanceChecks({
      files: { 'package/index.vue': '<template><div>其它</div></template>' },
      figmaNodeData: TRUTH_TAB,
    });
    const g1 = r.fails.find((f) => f.code === 'G1-v2');
    expect(g1).toBeTruthy();
    expect(g1.file).toBeUndefined();
  });
});

describe('E3-v4 硬约束配方（b7d38dc3/c4b057c9 两连败治本）', () => {
  const TRUTH_BG = {
    document: {
      children: [
        {
          id: '2:3660',
          name: 'Frame',
          type: 'FRAME',
          absoluteBoundingBox: { x: 10, y: 196, width: 426, height: 91 },
          children: [],
        },
      ],
    },
  };
  const MAPPING = [
    {
      resourceFile: '../resources/images/bg-_m-34.png',
      figmaNodeId: '88:34',
      ownerSectionId: '2:3660',
      targetDomSelector: '[data-section-id="2:3660"]',
      figmaBox: { x: 10, y: 196, width: 426, height: 91 },
      previewAnalysisRole: 'bg',
      downloadStatus: 'success',
      name: 'bg-[m]',
    },
  ];

  it('E3-v4 fails 携带 hardConstraints（可照抄配方）', () => {
    const r = runAcceptanceChecks({
      files: {
        // bg 被挂到祖先段 88:33（非归属段 2:3660）
        'package/components/Flow.vue':
          '<script setup>\nimport bg1 from \'../../resources/images/bg-_m-34.png\'\n</script>\n<template>\n  <div data-section-id="88:33" :style="{ backgroundImage: \'url(\' + bg1 + \')\' }" />\n</template>',
      },
      figmaNodeData: TRUTH_BG,
      resourceDomMapping: MAPPING,
    });
    const e3 = r.fails.find((f) => f.code === 'E3-v4');
    expect(e3).toBeTruthy();
    expect(Array.isArray(e3.hardConstraints)).toBe(true);
    expect(e3.hardConstraints[0].fname).toBe('bg-_m-34.png');
    expect(e3.hardConstraints[0].targetDomSelector).toBe('[data-section-id="2:3660"]');
    expect(e3.hardConstraints[0].width).toBe(426);
    expect(e3.hardConstraints[0].height).toBe(91);
    expect(Array.isArray(e3.files)).toBe(true);
  });

  it('formatAcceptanceGuidance 输出可照抄的硬约束行（含 id/尺寸/import 路径）', () => {
    const g = formatAcceptanceGuidance([
      {
        code: 'E3-v4',
        detail: '1 张背景未挂到归属段',
        hardConstraints: [
          {
            fname: 'bg-_m-34.png',
            targetDomSelector: '[data-section-id="2:3660"]',
            width: 426,
            height: 91,
            importPath: '../resources/images/bg-_m-34.png',
          },
        ],
      },
    ]);
    expect(g).toContain('必须存在容器：<div data-section-id="2:3660" style="width:426px;height:91px;"');
    expect(g).toContain("import bgX from '../resources/images/bg-_m-34.png'");
    expect(g).toContain('硬约束');
  });
});

describe('A7 S2 兜底文本与 A1-v2 验收解耦（查重发现 S2 与判据打架）', () => {
  const TRUTH_SUB = {
    document: {
      children: [
        {
          id: '2:9000',
          name: 'sub-header',
          type: 'FRAME',
          children: [
            { id: 't1', type: 'TEXT', characters: '车型分布' },
            { id: 't2', type: 'TEXT', characters: '客车' },
          ],
        },
      ],
    },
  };

  it('阳性：真值文本只存在于 S2 兜底块 ⇒ 不计入命中率，A1-v2 照常 FAIL（假绿消除）', () => {
    const r = runAcceptanceChecks({
      files: {
        'package/components/Dist.vue':
          '<template>\n  <div data-section-id="2:9000">\n    <span>无关占位</span>\n    <div class="mc-truth-fallback" data-section-id="2:9000"><span>车型分布</span><span>客车</span></div>\n  </div>\n</template>',
      },
      figmaNodeData: TRUTH_SUB,
    });
    const a1 = r.fails.find((f) => f.code === 'A1-v2');
    expect(a1).toBeTruthy();
    expect(a1.detail).toContain('已按 A7 剔除');
  });

  it('阴性：真值文本在真实承载结构中 ⇒ A1-v2 不报（S2 剔除不误伤正常产物）', () => {
    const r = runAcceptanceChecks({
      files: {
        'package/components/Dist.vue':
          '<template>\n  <div data-section-id="2:9000">\n    <span>车型分布</span>\n    <span>客车</span>\n  </div>\n</template>',
      },
      figmaNodeData: TRUTH_SUB,
    });
    expect(r.fails.find((f) => f.code === 'A1-v2')).toBeUndefined();
  });

  it('阴性：无 S2 兜底块的旧产物形态判据行为不变', () => {
    const r = runAcceptanceChecks({
      files: {
        'package/components/Dist.vue':
          '<template>\n  <div data-section-id="2:9000">\n    <span>无关占位</span>\n  </div>\n</template>',
      },
      figmaNodeData: TRUTH_SUB,
    });
    const a1 = r.fails.find((f) => f.code === 'A1-v2');
    expect(a1).toBeTruthy();
    expect(a1.detail).not.toContain('A7');
  });
});

/**
 * E3-v4 v2 消费取证升级 + 层级分流（2026-11-11 · b598c432 实锤）
 *   缺陷① 只在 data-section-id 开标签内字面匹配变量名 ⇒ 数据驱动消费（数组/对象索引）全漏判；
 *   缺陷② card 级 owner 要求 per-card 持有 data-section-id，与「段级容器 + v-for 卡片」模型冲突。
 * 放行边界：仅「wantId 非产物段级容器 + 未挂任何段级容器 + 未挂祖先 + 已被数据驱动消费」。
 */
describe('E3-v4 v2 卡片级 owner 分流（b598c432 形态）', () => {
  const MAPPING = (wantId) => [
    {
      resourceFile: '../resources/images/bg-126.png',
      figmaNodeId: '136:129',
      ownerSectionId: wantId,
      targetDomSelector: `[data-section-id="${wantId}"]`,
      ancestorIds: ['136:129', '2:8023', '136:121'],
      figmaBox: { x: 0, y: 0, width: 141, height: 74 },
      previewAnalysisRole: 'bg',
      downloadStatus: 'success',
    },
  ];

  // 数据驱动消费的真实形态（b598c432 逐字）：容器数组 + 模板索引
  const DATA_DRIVEN = `<template>
  <div data-section-id="2:8023" style="grid-template-columns:repeat(3, 141px);grid-auto-rows:74px">
    <div v-for="(it, i) in items" :key="i" :style="{ backgroundImage: 'url(' + FG_GRID_BGS[it.bgImg] + ')' }" />
  </div>
</template>
<script setup>
import bg3 from '../../resources/images/bg-126.png'
const FG_GRID_BGS = [bg3];
const items = [{ bgImg: 0 }];
</script>`;

  it('阳性：wantId 非段级容器 + 数据驱动消费 ⇒ 不报 FAIL，并打计数行', () => {
    const r = runAcceptanceChecks({
      files: { 'package/components/ListSection.vue': DATA_DRIVEN },
      resourceDomMapping: MAPPING('136:127'),
    });
    expect(r.fails.find((f) => f.code === 'E3-v4')).toBeUndefined();
    expect((r.warns || []).some((w) => w.includes('卡片级 owner 放行 1 张'))).toBe(true);
  });

  it('阴性（防放水）：wantId 是产物段级容器但未消费 ⇒ 仍 FAIL', () => {
    const code = DATA_DRIVEN.replace(/<div data-section-id="2:8023"/, '<div data-section-id="136:127"');
    // 变体：把段级容器建出来（136:127），但背景仍走数据驱动、未落在该标签上
    const r = runAcceptanceChecks({
      files: { 'package/components/ListSection.vue': code },
      resourceDomMapping: MAPPING('136:127'),
    });
    const e3 = r.fails.find((f) => f.code === 'E3-v4');
    expect(e3).toBeTruthy();
    expect(e3.detail).toContain('归属段存在但未消费');
  });

  it('阴性（拉伸保护）：背景挂到祖先段 ⇒ 仍 FAIL（5b978794 巨图形态不回退）', () => {
    // 祖先段 2:8023 的开标签内直接消费 bg3（未挂 card 级归属）
    const code = `<template>
  <div data-section-id="2:8023" :style="{ backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%' }">
    <div v-for="(it, i) in items" :key="i" class="card" />
  </div>
</template>
<script setup>
import bg3 from '../../resources/images/bg-126.png'
const items = [{ bgImg: 0 }];
</script>`;
    const r = runAcceptanceChecks({
      files: { 'package/components/ListSection.vue': code },
      resourceDomMapping: MAPPING('136:127'),
    });
    const e3 = r.fails.find((f) => f.code === 'E3-v4');
    expect(e3).toBeTruthy();
    expect(e3.detail).toContain('祖先段，被拉伸铺满');
  });

  it('阴性（防假消费）：容器名未在模板引用 ⇒ 不算数据驱动消费，仍 FAIL', () => {
    const code = DATA_DRIVEN.replace(
      'FG_GRID_BGS[it.bgImg]',
      "'none.png'",
    );
    const r = runAcceptanceChecks({
      files: { 'package/components/ListSection.vue': code },
      resourceDomMapping: MAPPING('136:127'),
    });
    const e3 = r.fails.find((f) => f.code === 'E3-v4');
    expect(e3).toBeTruthy();
    expect(e3.detail).toContain('无任何消费形态');
  });
});
