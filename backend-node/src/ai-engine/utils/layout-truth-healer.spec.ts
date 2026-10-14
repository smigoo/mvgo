import {
  normalizeSectionFlexTruth,
  normalizeTextSlotOrder,
  normalizeStatGroupLayout,
  ensureSlotConBackground,
  healZebraStripeMisread,
  collectFigmaIndex,
} from './layout-truth-healer.js';

// Figma 真值最小树（按 mc-max-1791942831818-0397a327 实锤裁剪）：
// 组件 510×665；slot-con(565:3, h571) 下两张 72px 卡片组 + footer 文本。
const figmaRoot = {
  document: {
    id: '48:5796',
    name: 'cp-aiot-dpjh-bsjd',
    children: [
      {
        id: '565:3',
        name: 'slot-con',
        absoluteBoundingBox: { height: 571, width: 483 },
        children: [
          {
            id: '48:5798',
            name: 'Group 2136638415',
            absoluteBoundingBox: { height: 72, width: 470 },
            children: [],
          },
          {
            id: '48:5813',
            name: 'Group 2136638416',
            absoluteBoundingBox: { height: 72, width: 470 },
            children: [],
          },
          {
            id: '48:5888',
            name: '共 6 个节点',
            type: 'TEXT',
            characters: '共 6 个节点',
            style: { fontSize: 14 },
            absoluteBoundingBox: { height: 16 },
          },
        ],
      },
      // 文本真值（全局可命中）：地址 14px / 名称 18px / 在线值 18px / 标签 14px
      {
        id: '48:5804',
        type: 'TEXT',
        characters: '江苏省南京市建邺区江东中路',
        style: { fontSize: 14 },
      },
      {
        id: '48:5806',
        type: 'TEXT',
        characters: '江苏联网节点',
        style: { fontSize: 18 },
      },
      {
        id: '48:5802',
        type: 'TEXT',
        characters: '3,792',
        style: { fontSize: 18 },
      },
      {
        id: '48:5805',
        type: 'TEXT',
        characters: '在线',
        style: { fontSize: 14 },
      },
      {
        id: '48:5807',
        type: 'TEXT',
        characters: '离线',
        style: { fontSize: 14 },
      },
      {
        id: '48:5803',
        type: 'TEXT',
        characters: '28',
        style: { fontSize: 14 },
      },
    ],
  },
};

const indexVue = `<template>
  <base-panel panelKey="default-panel">
    <template #header-right>
      <HeaderSection />
    </template>
    <div class="c-x-slot-con" style="display:flex;flex-direction:column;">
      <div class="c-x-con-con" data-section-id="565:3" style="flex:1;min-height:0;display:flex;flex-direction:column;">
        <div class="c-x-list-con" data-section-id="48:5798" style="flex:0.500;min-height:0;display:flex;flex-direction:column;">
          <ContentSection style="flex:1.000;min-height:0;" />
        </div>
        <div class="c-x-group-con" data-section-id="48:5813-list" style="flex:0.500;min-height:0;display:flex;flex-direction:column;">
          <ContentSection3 style="flex:1.000;min-height:0;" />
        </div>
      </div>
    </div>
  </base-panel>
</template>
<script setup>
import HeaderSection from './components/HeaderSection.vue'
import ContentSection from './components/ContentSection.vue'
import ContentSection3 from './components/ContentSection3.vue'
</script>
`;

const contentSection3Vue = `<template>
  <div data-section-id="48:5816" class="c-x-group" v-bind="$attrs">
    <div v-for="(node, index) in nodeList" :key="index" class="c-x-card">
      <div class="c-x-title">{{ node.name }}</div>
    </div>
  </div>
</template>
<script setup>
const nodeList = []
</script>
`;

// 首卡实锤形态：标题/地址互换 + 离线数值/标签互换（CSS 字号 a>b）
const contentSectionVue = `<template>
  <div data-section-id="48:5801" class="c-x-node-item" v-bind="$attrs">
    <div class="c-x-node-info">
      <div class="c-x-node-title">江苏省南京市建邺区江东中路</div>
      <div class="c-x-node-addr">江苏联网节点</div>
    </div>
    <div class="c-x-node-stats">
      <div class="c-x-node-stat">
        <span class="c-x-stat-value-online">3,792</span>
        <span class="c-x-stat-label">在线</span>
      </div>
      <div class="c-x-node-stat">
        <span class="c-x-stat-value-offline">离线</span>
        <span class="c-x-stat-label">28</span>
      </div>
    </div>
  </div>
</template>
<style lang="less" scoped>
@fontSize: var(--fontSize, 14px);
.c-x-node-title { font-size: calc(@fontSize * 1.286); }
.c-x-node-addr { font-size: calc(@fontSize * 1); }
.c-x-stat-value-online { font-size: calc(@fontSize * 1.286); }
.c-x-stat-value-offline { font-size: calc(@fontSize * 1.286); }
.c-x-stat-label { font-size: calc(@fontSize * 1); }
</style>
`;

describe('刀 28 normalizeSectionFlexTruth（兄弟 section 等分臆造 → 真值）', () => {
  const files = {
    'package/index.vue': indexVue,
    'package/components/ContentSection.vue': '<template><div>fixed</div></template>',
    'package/components/ContentSection3.vue': contentSection3Vue,
  };

  test('阳性：固定段 → flex:0 0 auto + 真值 72px，v-for 段 → flex:1 1 0', () => {
    const r = normalizeSectionFlexTruth(JSON.parse(JSON.stringify(files)), { figmaRoot });
    expect(r.changes).toHaveLength(1);
    const out = r.files['package/index.vue'];
    expect(out).toMatch(/flex:0 0 auto; height:72px/);
    expect(out).toMatch(/flex:1 1 0/);
    // con-con 的 flex:1 不受影响（非分数 flex）
    expect(out).toMatch(/data-section-id="565:3" style="flex:1;/);
    // 分数臆造全部消失（幂等前提）
    expect(out).not.toMatch(/flex:0\.500/);
  });

  test('幂等：修复后二次调用零改动', () => {
    const once = normalizeSectionFlexTruth(JSON.parse(JSON.stringify(files)), { figmaRoot });
    const twice = normalizeSectionFlexTruth(once.files, { figmaRoot });
    expect(twice.changes).toHaveLength(0);
  });

  test('阴性：无 figmaRoot 零改动', () => {
    const r = normalizeSectionFlexTruth(JSON.parse(JSON.stringify(files)), {});
    expect(r.changes).toHaveLength(0);
  });

  test('阴性：v-for/非 v-for 不成对（全是固定段）零改动', () => {
    const onlyFixed = {
      'package/index.vue': indexVue,
      'package/components/ContentSection.vue': '<template><div>a</div></template>',
      'package/components/ContentSection3.vue': '<template><div>b</div></template>',
    };
    const r = normalizeSectionFlexTruth(onlyFixed, { figmaRoot });
    expect(r.changes).toHaveLength(0);
  });
});

describe('刀 29 normalizeTextSlotOrder（文案槽位互换）', () => {
  const files = {
    'package/components/ContentSection.vue': contentSectionVue,
  };

  test('阳性：标题⇄地址（truth）+ 离线⇄28（shape）双双对调', () => {
    const r = normalizeTextSlotOrder(JSON.parse(JSON.stringify(files)), { figmaRoot });
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0].count).toBe(2);
    const out = r.files['package/components/ContentSection.vue'];
    // 标题槽拿到 18px 名称，地址槽拿到 14px 地址
    expect(out).toMatch(/c-x-node-title">江苏联网节点</);
    expect(out).toMatch(/c-x-node-addr">江苏省南京市建邺区江东中路</);
    // 数值槽拿到数字，标签槽拿到「离线」
    expect(out).toMatch(/c-x-stat-value-offline">28</);
    expect(out).toMatch(/c-x-stat-label">离线</);
    // 在线对（大字槽=数字）不被误调
    expect(out).toMatch(/c-x-stat-value-online">3,792</);
    expect(out).toMatch(/c-x-stat-label">在线</);
  });

  test('幂等：对调后二次调用零改动', () => {
    const once = normalizeTextSlotOrder(JSON.parse(JSON.stringify(files)), { figmaRoot });
    const twice = normalizeTextSlotOrder(once.files, { figmaRoot });
    expect(twice.changes).toHaveLength(0);
  });

  test('阴性：字号序与真值一致的健康版式零改动', () => {
    const healthy = contentSectionVue
      .replace(
        '>江苏省南京市建邺区江东中路</div>\n      <div class="c-x-node-addr">江苏联网节点<',
        '>江苏联网节点</div>\n      <div class="c-x-node-addr">江苏省南京市建邺区江东中路<',
      )
      .replace(
        '>离线</span>\n        <span class="c-x-stat-label">28<',
        '>28</span>\n        <span class="c-x-stat-label">离线<',
      );
    const r = normalizeTextSlotOrder(
      { 'package/components/ContentSection.vue': healthy },
      { figmaRoot },
    );
    expect(r.changes).toHaveLength(0);
  });

  test('阴性：无 figmaRoot 零改动', () => {
    const r = normalizeTextSlotOrder(JSON.parse(JSON.stringify(files)), {});
    expect(r.changes).toHaveLength(0);
  });

  test('阴性：大字槽 CJK 长名 + 小字槽数字（合法版式）零改动（shape 短标签约束）', () => {
    const legit = `<template>
  <div class="c-x-row">
    <span class="c-x-big">江苏沿江公司节点</span>
    <span class="c-x-small">2,138</span>
  </div>
</template>
<style lang="less" scoped>
@fontSize: var(--fontSize, 14px);
.c-x-big { font-size: calc(@fontSize * 1.286); }
.c-x-small { font-size: calc(@fontSize * 1); }
</style>
`;
    const r = normalizeTextSlotOrder(
      { 'package/components/Row.vue': legit },
      { figmaRoot },
    );
    expect(r.changes).toHaveLength(0);
  });

  test('collectFigmaIndex：文本索引可命中', () => {
    const idx = collectFigmaIndex(figmaRoot);
    expect(idx.textByChars.get('江苏联网节点').fontSize).toBe(18);
    expect(idx.textByChars.get('江苏省南京市建邺区江东中路').fontSize).toBe(14);
  });

  // 2026-10-14 · 0397a327 实锤：LLM 把 value-offline 与 label 同写 font-size:@fontSize，
  // 本对 CSS 大小序丢失（fa≈fb），且 Figma 真值 离线=14/28=14 不交叉 ⇒ 两级旧门槛全失明。
  // 修复：文件级「大槽在上」版式多数表决兜底（名称/地址、在线两对提供大序证据）。
  const equalSizeOfflineVue = `<template>
  <div data-section-id="48:5801" class="c-x-node-item" v-bind="$attrs">
    <div class="c-x-node-info">
      <span class="c-x-node-name">江苏联网节点</span>
      <span class="c-x-node-addr">江苏省南京市建邺区江东中路</span>
    </div>
    <div class="c-x-node-stats">
      <div class="c-x-node-stat">
        <span class="c-x-stat-value-online">3,792</span>
        <span class="c-x-stat-label">在线</span>
      </div>
      <div class="c-x-node-stat">
        <span class="c-x-stat-value-offline">离线</span>
        <span class="c-x-stat-label">28</span>
      </div>
    </div>
  </div>
</template>
<style lang="less" scoped>
@fontSize: var(--fontSize, 14px);
.c-x-node-name { font-size: calc(@fontSize * 1.286); }
.c-x-node-addr { font-size: @fontSize; }
.c-x-stat-value-online { font-size: calc(@fontSize * 1.286); }
.c-x-stat-value-offline { font-size: @fontSize; }
.c-x-stat-label { font-size: @fontSize; }
</style>
`;

  test('阳性：等宽 CSS 离线对 → 文件级大序兜底对调，健康对不动', () => {
    const r = normalizeTextSlotOrder(
      { 'package/components/ContentSection.vue': equalSizeOfflineVue },
      { figmaRoot },
    );
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0].count).toBe(1);
    const out = r.files['package/components/ContentSection.vue'];
    expect(out).toMatch(/c-x-stat-value-offline">28</);
    expect(out).toMatch(/c-x-stat-label">离线</);
    // 健康对不动
    expect(out).toMatch(/c-x-stat-value-online">3,792</);
    expect(out).toMatch(/c-x-node-name">江苏联网节点</);
    expect(out).toMatch(/c-x-node-addr">江苏省南京市建邺区江东中路</);
  });

  test('幂等：等宽兜底对调后二次调用零改动', () => {
    const once = normalizeTextSlotOrder(
      { 'package/components/ContentSection.vue': equalSizeOfflineVue },
      { figmaRoot },
    );
    const twice = normalizeTextSlotOrder(once.files, { figmaRoot });
    expect(twice.changes).toHaveLength(0);
  });

  // 裸写 @fontSize（无 calc 乘数）必须提取为基准 14px：t1(14) vs t2(0.714×14≈10)
  // 构成唯一大序证据；若裸写提取为 0，t2 反成「小槽在上」反证 ⇒ 兜底不成立、零改动。
  test('阳性：裸写 @fontSize 提取为 14 参与大序表决', () => {
    const bareVarVue = `<template>
  <div>
    <div class="c-x-hd">
      <span class="c-x-t1">标题</span>
      <span class="c-x-t2">副标</span>
    </div>
    <div class="c-x-stat">
      <span class="c-x-v">离线</span>
      <span class="c-x-l">28</span>
    </div>
  </div>
</template>
<style lang="less" scoped>
@fontSize: var(--fontSize, 14px);
.c-x-t1 { font-size: @fontSize; }
.c-x-t2 { font-size: calc(@fontSize * 0.714); }
.c-x-v { font-size: @fontSize; }
.c-x-l { font-size: @fontSize; }
</style>
`;
    const r = normalizeTextSlotOrder(
      { 'package/components/BareVar.vue': bareVarVue },
      { figmaRoot },
    );
    expect(r.changes).toHaveLength(1);
    const out = r.files['package/components/BareVar.vue'];
    expect(out).toMatch(/c-x-v">28</);
    expect(out).toMatch(/c-x-l">离线</);
  });

  test('阴性：文件级小槽在上版式（兜底反证）零改动', () => {
    // 唯一其他对是「小槽在上」⇒ fileBigOrder 不成立 ⇒ 等宽形态交叉也不动
    const smallFirstVue = `<template>
  <div>
    <div class="c-x-hd">
      <span class="c-x-t1">标题</span>
      <span class="c-x-t2">副标题加长</span>
    </div>
    <div class="c-x-stat">
      <span class="c-x-v">离线</span>
      <span class="c-x-l">28</span>
    </div>
  </div>
</template>
<style lang="less" scoped>
@fontSize: var(--fontSize, 14px);
.c-x-t1 { font-size: calc(@fontSize * 0.714); }
.c-x-t2 { font-size: calc(@fontSize * 1.286); }
.c-x-v { font-size: @fontSize; }
.c-x-l { font-size: @fontSize; }
</style>
`;
    const r = normalizeTextSlotOrder(
      { 'package/components/SmallFirst.vue': smallFirstVue },
      { figmaRoot },
    );
    expect(r.changes).toHaveLength(0);
  });
});

describe('刀 30 normalizeStatGroupLayout（stat 组横排 → 分组堆叠）', () => {
  // cd63d1c5 ContentSection3 实锤形态：v-for 卡内四 span 横排
  const statRowVue = `<template>
  <div data-section-id="48:5816" class="c-x-group" v-bind="$attrs">
    <div class="c-x-card" v-for="(node, index) in nodeList" :key="index">
      <div class="c-x-content">
        <div class="c-x-title">{{ node.name }}</div>
        <div class="c-x-stats">
          <span class="c-x-node-value c-x-node-value--online">{{ node.online }}</span>
          <span class="c-x-node-label">在线</span>
          <span class="c-x-node-value c-x-node-value--offline">{{ node.offline }}</span>
          <span class="c-x-node-label">离线</span>
        </div>
      </div>
    </div>
  </div>
</template>
`;
  const commonLess = '.c-x-stats { display: flex; flex-direction: row; gap: 24px; }\n';

  test('阳性：两对 value/label 横排 → 各包 div.c-x-node-stat + CSS 注入', () => {
    const r = normalizeStatGroupLayout({
      'package/components/ContentSection3.vue': statRowVue,
      'resources/styles/common.less': commonLess,
    });
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0].count).toBe(2);
    expect(r.changes[0].groups).toBe('c-x-node-stat');
    const out = r.files['package/components/ContentSection3.vue'];
    expect(out).toMatch(/<div class="c-x-node-stat"><span class="c-x-node-value c-x-node-value--online">\{\{ node.online \}\}<\/span>\s*<span class="c-x-node-label">在线<\/span><\/div>/);
    expect(out).toMatch(/<div class="c-x-node-stat"><span class="c-x-node-value c-x-node-value--offline">\{\{ node.offline \}\}<\/span>\s*<span class="c-x-node-label">离线<\/span><\/div>/);
    // CSS 堆叠规则注入 common.less
    const less = r.files['resources/styles/common.less'];
    expect(less).toMatch(/\.c-x-node-stat \{\s*\n\s*display: flex;\s*\n\s*flex-direction: column;/);
  });

  test('幂等：分组后二次调用零改动（无 CSS 重复注入）', () => {
    const once = normalizeStatGroupLayout({
      'package/components/ContentSection3.vue': statRowVue,
      'resources/styles/common.less': commonLess,
    });
    const twice = normalizeStatGroupLayout(once.files);
    expect(twice.changes).toHaveLength(0);
    expect(twice.files['resources/styles/common.less']).toBe(
      once.files['resources/styles/common.less'],
    );
  });

  test('阴性：单对（值+单位，如 10810 台）不触发', () => {
    const singlePair = `<template>
  <div class="c-x-footer">
    <span class="c-x-num">10810</span>
    <span class="c-x-unit">台</span>
  </div>
</template>
`;
    const r = normalizeStatGroupLayout({
      'package/components/Footer.vue': singlePair,
      'resources/styles/common.less': commonLess,
    });
    expect(r.changes).toHaveLength(0);
  });

  test('阴性：label 超 4 字（长文本交替）不触发', () => {
    const longLabel = `<template>
  <div class="c-x-row">
    <span class="c-x-v">2,138</span>
    <span class="c-x-l">在线设备总数</span>
    <span class="c-x-v">12</span>
    <span class="c-x-l">离线设备总数</span>
  </div>
</template>
`;
    const r = normalizeStatGroupLayout({
      'package/components/Row.vue': longLabel,
      'resources/styles/common.less': commonLess,
    });
    expect(r.changes).toHaveLength(0);
  });

  test('阴性：已分组的健康结构（div 包裹）不触发', () => {
    const grouped = `<template>
  <div class="c-x-stats">
    <div class="c-x-stat">
      <span class="c-x-v">2,138</span>
      <span class="c-x-l">在线</span>
    </div>
    <div class="c-x-stat">
      <span class="c-x-v">12</span>
      <span class="c-x-l">离线</span>
    </div>
  </div>
</template>
`;
    const r = normalizeStatGroupLayout({
      'package/components/Row.vue': grouped,
      'resources/styles/common.less': commonLess,
    });
    expect(r.changes).toHaveLength(0);
  });
});

describe("刀 31 ensureSlotConBackground（R8 容器底色契约）", () => {
  const themeVars = [
    "// 主题变量",
    ".theme-light() {",
    "  @color-bg-container: #f5f8fc;",
    "  @color-primary: #3965ff;",
    "}",
    ".theme-dark() {",
    "  @color-bg-container: #1a2332;",
    "  @color-primary: #44e4ff;",
    "}",
    "",
  ].join("\n");
  const files = (less, theme = themeVars) => ({
    "resources/styles/common.less": less,
    "resources/styles/themes/theme-vars.less": theme,
  });

  test("阳性：slot-con 无 background + 有 bg-container 槽位 → 注入", () => {
    const less = ".c-x-slot-con {\n  display: flex;\n  flex-direction: column;\n}\n";
    const r = ensureSlotConBackground(files(less));
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0].variable).toBe("@color-bg-container");
    expect(r.files["resources/styles/common.less"]).toContain(
      "background: @color-bg-container;"
    );
    // 注入位置在规则块内（闭合括号前）
    expect(r.files["resources/styles/common.less"]).toMatch(
      /\.c-x-slot-con \{[\s\S]*background: @color-bg-container;\s*\}/
    );
  });

  test("幂等：已有 background 不触发", () => {
    const less = ".c-x-slot-con {\n  background: @color-bg-page;\n  display: flex;\n}\n";
    const r = ensureSlotConBackground(files(less));
    expect(r.changes).toHaveLength(0);
    expect(r.files["resources/styles/common.less"]).toBe(less);
  });

  test("优先级链：无 bg-container 时取 bg-base（产物既有定义，零臆造）", () => {
    const theme = ".theme-dark() {\n  @color-bg-base: #071f3d;\n}\n";
    const less = ".c-x-slot-con {\n  padding: 8px;\n}\n";
    const r = ensureSlotConBackground(files(less, theme));
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0].variable).toBe("@color-bg-base");
  });

  test("跳过：无任何 bg 系变量 → 零臆造留痕 skipped", () => {
    const theme = ".theme-dark() {\n  @color-primary: #44e4ff;\n}\n";
    const less = ".c-x-slot-con {\n  padding: 8px;\n}\n";
    const r = ensureSlotConBackground(files(less, theme));
    expect(r.changes).toHaveLength(0);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].reason).toBe("no-bg-var-defined");
    expect(r.files["resources/styles/common.less"]).toBe(less);
  });

  test("阴性：复合选择器不动（只修单类根容器）", () => {
    const less = ".c-x-slot-con .c-x-card {\n  padding: 8px;\n}\n";
    const r = ensureSlotConBackground(files(less));
    expect(r.changes).toHaveLength(0);
    expect(r.files["resources/styles/common.less"]).toBe(less);
  });

  test("二次调用幂等：注入后再跑零改动", () => {
    const less = ".c-x-slot-con {\n  display: flex;\n}\n";
    const once = ensureSlotConBackground(files(less));
    const twice = ensureSlotConBackground(once.files);
    expect(once.changes).toHaveLength(1);
    expect(twice.changes).toHaveLength(0);
    expect(twice.files["resources/styles/common.less"]).toBe(
      once.files["resources/styles/common.less"]
    );
  });
});

describe("刀 32 healZebraStripeMisread（臆造斑马纹 → 激活态）", () => {
  // 2238359a 实锤 Figma 形态：Rectangle 346242317 470x72 ×6，首卡 #a6ceff 其余 #ffffff
  const hexToRgb = (hex) => ({
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  });
  const mkFigma = (hexes) => ({
    document: {
      name: "root",
      children: hexes.map((h, i) => ({
        name: "Rectangle 346242317",
        type: "RECTANGLE",
        absoluteBoundingBox: { width: 470, height: 72, y: 51606 + i * 92 },
        fills: [{ type: "SOLID", color: hexToRgb(h) }],
      })),
    },
  });
  const figmaActive = mkFigma([
    "#a6ceff",
    "#ffffff",
    "#ffffff",
    "#ffffff",
    "#ffffff",
    "#ffffff",
  ]);
  const zebraLess = [
    ".c-x-node-card {",
    "  display: flex;",
    "  background: @color-bg-container;",
    "",
    "  &:nth-child(odd) {",
    "    background: @color-primary;",
    "  }",
    "}",
    "",
  ].join("\n");

  test("阳性：1 异 5 同 + &:nth-child(odd) 背景 → :first-child, :hover + cursor/transition", () => {
    const r = healZebraStripeMisread(
      { "resources/styles/common.less": zebraLess },
      { figmaRoot: figmaActive }
    );
    expect(r.truth.kind).toBe("active");
    expect(r.changes).toHaveLength(1);
    const less = r.files["resources/styles/common.less"];
    expect(less).toContain("&:first-child, &:hover {");
    expect(less).toContain("background: @color-primary;");
    expect(less).toContain("cursor: pointer;");
    expect(less).toContain("transition: background 0.2s ease;");
    expect(less).not.toContain(":nth-child(odd)");
    // 宿主基础规则不动
    expect(less).toContain("background: @color-bg-container;");
  });

  test("阳性·扁平选择器：.c-x-card:nth-child(even) → 保留宿主前缀两伪类", () => {
    const less = ".c-x-card:nth-child(even) {\n  background: #fff;\n}\n";
    const r = healZebraStripeMisread(
      { "resources/styles/common.less": less },
      { figmaRoot: figmaActive }
    );
    expect(r.changes).toHaveLength(1);
    expect(r.files["resources/styles/common.less"]).toContain(
      ".c-x-card:first-child, .c-x-card:hover {"
    );
  });

  test("uniform：6 卡全同色 → 剥除整个斑马规则块", () => {
    const figmaUniform = mkFigma(Array(6).fill("#ffffff"));
    const r = healZebraStripeMisread(
      { "resources/styles/common.less": zebraLess },
      { figmaRoot: figmaUniform }
    );
    expect(r.truth.kind).toBe("uniform");
    expect(r.changes[0].action).toBe("strip");
    const less = r.files["resources/styles/common.less"];
    expect(less).not.toContain(":nth-child(odd)");
    expect(less).toContain("background: @color-bg-container;");
  });

  test("zebra：≥4 张严格交替 → 合法保留不动", () => {
    const figmaZebra = mkFigma(["#a6ceff", "#ffffff", "#a6ceff", "#ffffff"]);
    const r = healZebraStripeMisread(
      { "resources/styles/common.less": zebraLess },
      { figmaRoot: figmaZebra }
    );
    expect(r.truth.kind).toBe("zebra");
    expect(r.changes).toHaveLength(0);
    expect(r.files["resources/styles/common.less"]).toBe(zebraLess);
  });

  test("fail-open：无 figmaRoot → 不动", () => {
    const r = healZebraStripeMisread({
      "resources/styles/common.less": zebraLess,
    });
    expect(r.changes).toHaveLength(0);
    expect(r.files["resources/styles/common.less"]).toBe(zebraLess);
  });

  test("阴性：非交替 nth-child(3) / 无 background 的 odd 块 → 不动", () => {
    const less =
      ".c-x-card:nth-child(3) {\n  background: #fff;\n}\n" +
      ".c-x-row {\n  &:nth-child(odd) {\n    margin-top: 4px;\n  }\n}\n";
    const r = healZebraStripeMisread(
      { "resources/styles/common.less": less },
      { figmaRoot: figmaActive }
    );
    expect(r.changes).toHaveLength(0);
    expect(r.files["resources/styles/common.less"]).toBe(less);
  });

  test("幂等：改写后二次调用零改动", () => {
    const once = healZebraStripeMisread(
      { "resources/styles/common.less": zebraLess },
      { figmaRoot: figmaActive }
    );
    const twice = healZebraStripeMisread(once.files, {
      figmaRoot: figmaActive,
    });
    expect(once.changes).toHaveLength(1);
    expect(twice.changes).toHaveLength(0);
    expect(twice.files["resources/styles/common.less"]).toBe(
      once.files["resources/styles/common.less"]
    );
  });
});
