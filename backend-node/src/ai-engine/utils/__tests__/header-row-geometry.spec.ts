/**
 * 刀 51 —— 段内标题行几何契约（header-row-geometry）
 *
 * 真值数据全部来自第八轮真机（2026-10-22 · Figma `GTcJm0DKQvcJvcOZTh5n1l` 节点 38:3134，
 * api.figma.com 原始返回 1:1 照抄）。三个面板的标题行**完全同构**：icon 16×16 + gap 8 + 标题高 16。
 */
import {
  scanElementStack,
  resolveHeaderRowTruth,
  upsertInlineDecls,
  detectHeaderRowIssues,
  healHeaderRowGeometry,
  enforceHeaderRowGeometry,
} from '../header-row-geometry.js';

/** Figma 节点构造器（只保留几何/文本事实） */
function n(
  id: string,
  type: string,
  x?: number,
  y?: number,
  width?: number,
  height?: number,
  children?: any[],
  characters?: string,
) {
  return {
    id,
    type,
    name: id,
    characters,
    absoluteBoundingBox: x == null ? undefined : { x, y, width, height },
    children,
  };
}

/** 真实子树（结构与坐标照抄 Figma） */
const ROOT = n('38:3134', 'FRAME', 26866, 51431, 660, 868, [
  n('38:3135', 'RECTANGLE', 26866, 51431, 660, 868),
  n('38:3136', 'VECTOR', 27494, 51451, 9.86, 9.85), // 弹窗 header 箭头（不是标题图标）
  n('796:3', 'GROUP', 26894, 51483, 604, 787, [
    n('38:3137', 'GROUP', 26894, 51592, 604, 161, [
      n('38:3138', 'RECTANGLE', 26894, 51592, 604, 161), // 面板底色（与整段竖向重叠）
      n('38:3139', 'TEXT', 26938, 51617, 96, 16, undefined, '战略合作厂商'),
      n('38:3140', 'FRAME', 26914, 51649, 564, 30),
      n('38:3153', 'FRAME', 26914, 51699, 272, 30),
      n('38:3160', 'FRAME', 26914, 51617, 16, 16), // icon-战略厂商
    ]),
    n('38:3162', 'GROUP', 26894, 51773, 604, 212, [
      n('38:3163', 'RECTANGLE', 26894, 51773, 604, 212),
      n('38:3164', 'FRAME', 26914, 51798, 16, 16), // icon-优质厂商
      n('38:3166', 'TEXT', 26938, 51798, 64, 16, undefined, '优质厂商'),
      n('38:3167', 'FRAME', 26914, 51830, 564, 30),
    ]),
    n('38:3206', 'GROUP', 26894, 52005, 604, 265, [
      n('38:3207', 'RECTANGLE', 26894, 52005, 604, 265),
      n('38:3208', 'FRAME', 26914, 52030, 16, 16), // icon-普通厂商
      n('38:3210', 'TEXT', 26938, 52030, 64, 16, undefined, '普通厂商'),
      n('38:3211', 'FRAME', 26914, 52062, 564, 30),
    ]),
    n('38:3260', 'GROUP', 26900, 51483, 265, 76, [
      n('38:3261', 'VECTOR', 26900, 51483, 265, 76),
      n('187:262', 'GROUP', 26920, 51496, 53, 55.44972610473633), // 统计卡装饰图
    ]),
  ]),
  n('38:3263', 'TEXT', 26997.66015625, 51496, 64, 24, undefined, '合作厂商'),
]);

const FIGMA_ROOT = { document: ROOT };

/** 真机 8 条资源里与图标相关的 4 条（其余为 bg / 纯色块） */
const MAPPING = [
  { assignedVarName: 'icon1', figmaNodeId: '38:3136' },
  { assignedVarName: 'icon4', figmaNodeId: '38:3160' },
  { assignedVarName: 'icon5', figmaNodeId: '38:3164' },
  { assignedVarName: 'icon6', figmaNodeId: '38:3208' },
  { assignedVarName: 'icon2', figmaNodeId: '187:262' },
];

const { indexFigmaNodes } = require('../section-tree.js');
const IDX = indexFigmaNodes(ROOT);

// ───────────────────────────── 阳性对照 ─────────────────────────────

describe('刀 51 真值：三个面板标题行完全同构（gap 8 / 行高 16 / padding 0）', () => {
  test('① 战略 38:3160：icon 16×16 @26914 + 标题 @26938 ⇒ gap 8', () => {
    const t = resolveHeaderRowTruth('38:3160', IDX);
    expect(t.ok).toBe(true);
    expect(t.gap).toBe(8);
    expect(t.rowHeight).toBe(16);
    expect(t.text).toBe('战略合作厂商');
  });

  test('② 优质 38:3164：gap 8', () => {
    const t = resolveHeaderRowTruth('38:3164', IDX);
    expect([t.ok, t.gap, t.rowHeight, t.text]).toEqual([true, 8, 16, '优质厂商']);
  });

  test('③ 普通 38:3208：gap 8', () => {
    const t = resolveHeaderRowTruth('38:3208', IDX);
    expect([t.ok, t.gap, t.rowHeight, t.text]).toEqual([true, 8, 16, '普通厂商']);
  });

  test('④ 三段一致是核心断言：同一份判据必须给出同一个 gap', () => {
    const gaps = ['38:3160', '38:3164', '38:3208'].map((id) => resolveHeaderRowTruth(id, IDX).gap);
    expect(new Set(gaps)).toEqual(new Set([8]));
  });
});

// ───────────────────────────── 阴性对照 ─────────────────────────────

describe('刀 51 阴性：判不了就不改（不需要任何白名单）', () => {
  test('⑤ 弹窗 header 箭头 38:3136：父节点同行没有 TEXT 兄弟 ⇒ no-row-peers', () => {
    expect(resolveHeaderRowTruth('38:3136', IDX)).toEqual({ ok: false, reason: 'no-row-peers' });
  });

  test('⑥ 统计卡装饰图 187:262（53×56）：同行只有底色 Rect ⇒ no-row-peers', () => {
    expect(resolveHeaderRowTruth('187:262', IDX).ok).toBe(false);
    expect(resolveHeaderRowTruth('187:262', IDX).reason).toBe('no-row-peers');
  });

  test('⑦ 未知节点 / 无索引 ⇒ 静默不判', () => {
    expect(resolveHeaderRowTruth('zz:1', IDX)).toEqual({ ok: false, reason: 'icon-bbox-unknown' });
    expect(resolveHeaderRowTruth('38:3164', null as any)).toEqual({ ok: false, reason: 'no-index' });
    expect(resolveHeaderRowTruth('', IDX)).toEqual({ ok: false, reason: 'no-index' });
  });
});

// ───────────────────────────── 标签扫描 ─────────────────────────────

describe('刀 51 标签扫描（元素栈）', () => {
  test('⑧ 注释跳过 / 属性含 `>` 不误判 / void img 不入栈', () => {
    const tpl = `
      <!-- <div class="fake"> -->
      <div class="a" :title="x > y">
        <img :src="icon5" alt="a>b" />
        <span>优质厂商</span>
      </div>`;
    const ev = scanElementStack(tpl);
    const div = ev.find((e) => e.name === 'div');
    const img = ev.find((e) => e.name === 'img');
    expect(div).toBeTruthy();
    expect(img?.parent?.name).toBe('div');
    expect(ev.filter((e) => e.name === 'span')[0].parent?.name).toBe('div');
    expect(div!.closeStart).toBeGreaterThan(img!.end);
  });
});

// ───────────────────────────── 内联样式改写 ─────────────────────────────

describe('刀 51 upsertInlineDecls（先剥后写，不另写解析器）', () => {
  const decls = [{ prop: 'gap', value: '8px' }, { prop: 'padding', value: '0' }];

  test('⑨ 已存在 style：同属性剥掉，其余保留', () => {
    const out = upsertInlineDecls('<div style="gap:6px;padding-left:7.2px;color:red;">', decls);
    expect(out).toBe('<div style="color:red;gap:8px;padding:0">');
  });

  test('⑩ 无 style：插在 `>` 之前（自闭合插在 `/` 之前）', () => {
    expect(upsertInlineDecls('<div class="x">', decls)).toBe('<div class="x" style="gap:8px;padding:0">');
    expect(upsertInlineDecls('<img :src="a" />', decls)).toBe('<img :src="a" style="gap:8px;padding:0"/>');
  });

  test('⑪ `padding-left` 与其简写互相覆盖（否则残留 7.2px 把整行右推）', () => {
    const out = upsertInlineDecls('<div style="padding:0 7.2px;">', [{ prop: 'padding', value: '0' }]);
    expect(out).toBe('<div style="padding:0">');
  });
});

// ───────────────────────────── 端到端（三套真实形态） ─────────────────────────────

const FILE_ROOT_IS_ROW = `<template>
  <div data-section-id="38:3137-tail-text" class="c-db2d65-header-text" v-bind="$attrs">
    <img :src="icon4" alt="战略厂商" class="c-db2d65-header-icon" />
    <span class="c-db2d65-header-title">战略合作厂商</span>
  </div>
</template>`;

const FILE_NESTED_ROW = `<template>
  <div data-section-id="38:3162-tail-text" class="c-db2d65-header-block-quality" v-bind="$attrs">
    <div class="c-db2d65-header-title-row">
      <img :src="icon5" class="c-db2d65-icon" alt="" />
      <span class="c-db2d65-header-title-text">优质厂商</span>
    </div>
  </div>
</template>`;

const FILE_COMMENT_FIRST = `<template>
  <!-- 普通厂商 标题区（标题 + 图标） -->
  <div class="c-db2d65-normal-header" v-bind="$attrs">
    <img :src="icon6" class="c-db2d65-normal-header-icon" alt="普通厂商" />
    <span class="c-db2d65-normal-header-title">普通厂商</span>
  </div>
</template>`;

const FILES = {
  'package/components/HeaderText.vue': FILE_ROOT_IS_ROW,
  'package/components/HeaderText2.vue': FILE_NESTED_ROW,
  'package/components/HeaderText3.vue': FILE_COMMENT_FIRST,
};

describe('刀 51 端到端：三套形态都要收敛到同一组真值', () => {
  test('⑫ 根=行 形态：只改行元素（此时行就是根）', () => {
    const det = detectHeaderRowIssues(
      { 'package/components/HeaderText.vue': FILE_ROOT_IS_ROW },
      { figmaRoot: FIGMA_ROOT, resourceDomMapping: MAPPING },
    );
    expect(det.issues).toHaveLength(1);
    expect(det.issues[0].edits.map((e: any) => e.role)).toEqual(['row']);
    expect(det.issues[0].truth.gap).toBe(8);
  });

  test('⑬ 嵌套行 形态（HeaderText2）：行 + 根各一处（根上的 7.2px 必须一并清）', () => {
    const det = detectHeaderRowIssues(
      { 'package/components/HeaderText2.vue': FILE_NESTED_ROW },
      { figmaRoot: FIGMA_ROOT, resourceDomMapping: MAPPING },
    );
    expect(det.issues).toHaveLength(1);
    expect(det.issues[0].edits.map((e: any) => e.role).sort()).toEqual(['root', 'row']);
  });

  test('⑭ 首行是注释 形态（HeaderText3）：根元素解析必须跳过注释', () => {
    const det = detectHeaderRowIssues(
      { 'package/components/HeaderText3.vue': FILE_COMMENT_FIRST },
      { figmaRoot: FIGMA_ROOT, resourceDomMapping: MAPPING },
    );
    expect(det.issues).toHaveLength(1);
    expect(det.issues[0].edits.map((e: any) => e.role)).toEqual(['row']);
  });

  test('⑮ 自愈后三个文件都含 gap:8px;padding:0，且行高 16px', () => {
    const res = enforceHeaderRowGeometry(FILES, {
      figmaRoot: FIGMA_ROOT,
      resourceDomMapping: MAPPING,
    });
    expect(res.changed).toBe(true);
    expect(res.healed.map((h: any) => h.file.split('/').pop()).sort()).toEqual([
      'HeaderText.vue',
      'HeaderText2.vue',
      'HeaderText3.vue',
    ]);
    for (const f of Object.keys(FILES)) {
      const out = res.files[f];
      expect(out).toContain('display:flex');
      expect(out).toContain('gap:8px');
      expect(out).toContain('padding:0');
      expect(out).toMatch(/height:16px/);
    }
    // 根=行 的两处只出现一次 padding:0；嵌套行那处根与行都要有
    expect((res.files['package/components/HeaderText.vue'].match(/padding:0/g) || []).length).toBe(1);
    expect((res.files['package/components/HeaderText2.vue'].match(/padding:0/g) || []).length).toBe(2);
  });

  test('⑯ 幂等：自愈结果再跑一次必须 0 改动', () => {
    const once = enforceHeaderRowGeometry(FILES, {
      figmaRoot: FIGMA_ROOT,
      resourceDomMapping: MAPPING,
    });
    const twice = enforceHeaderRowGeometry(once.files, {
      figmaRoot: FIGMA_ROOT,
      resourceDomMapping: MAPPING,
    });
    expect(twice.changed).toBe(false);
    expect(twice.files).toEqual(once.files);
  });
});

// ───────────────────────────── 更多阴性 ─────────────────────────────

describe('刀 51 端到端阴性', () => {
  const opts = { figmaRoot: FIGMA_ROOT, resourceDomMapping: MAPPING };

  test('⑰ 行元素内不含标题文案 ⇒ textNotInRow（不猜「这个 img 就是图标」）', () => {
    const bad = `<template>
  <div class="c-db2d65-header-text">
    <img :src="icon4" />
    <span>别的文案</span>
  </div>
</template>`;
    const det = detectHeaderRowIssues({ 'package/components/X.vue': bad }, opts);
    expect(det.issues).toHaveLength(0);
    expect(det.stats.skipped.textNotInRow).toBe(1);
  });

  test('⑱ `:src` 变量未登记在资源映射 ⇒ varUnmapped', () => {
    const bad = `<template>
  <div class="x"><img :src="icon9" /><span>战略合作厂商</span></div>
</template>`;
    const det = detectHeaderRowIssues({ 'package/components/X.vue': bad }, opts);
    expect(det.stats.skipped.varUnmapped).toBe(1);
  });

  test('⑲ 多个 img ⇒ imgNotSingle（只处理「一个图标 + 一段标题」）', () => {
    const bad = `<template>
  <div class="x"><img :src="icon4" /><img :src="icon5" /><span>战略合作厂商</span></div>
</template>`;
    const det = detectHeaderRowIssues({ 'package/components/X.vue': bad }, opts);
    expect(det.stats.skipped.imgNotSingle).toBe(1);
  });

  test('⑳ 无 figmaRoot / 无 mapping ⇒ 整链静默跳过（不报错、不改文件）', () => {
    expect(detectHeaderRowIssues(FILES, {}).stats.skipped.noFigma).toBe(1);
    expect(detectHeaderRowIssues(FILES, { figmaRoot: FIGMA_ROOT }).stats.skipped.noMapping).toBe(1);
    const res = enforceHeaderRowGeometry(FILES, {});
    expect(res.changed).toBe(false);
    expect(res.files).toEqual(FILES);
  });

  test('㉑ 已是真值 ⇒ 0 issue（幂等前置判断，不产生假变更）', () => {
    const good = `<template>
  <div class="c-db2d65-header-text" style="display:flex;flex-direction:row;align-items:center;gap:8px;height:16px;padding:0">
    <img :src="icon4" />
    <span>战略合作厂商</span>
  </div>
</template>`;
    const det = detectHeaderRowIssues({ 'package/components/X.vue': good }, opts);
    expect(det.issues).toHaveLength(0);
    expect(det.stats.matched).toBe(1);
  });

  test('㉒ 模板用 {{ text }} 且 props.default === Figma 文案 ⇒ 同源，命中（真机 HeaderText 形态）', () => {
    const propDriven = `<template>
  <div class="c-db2d65-header-text">
    <img :src="icon4" />
    <span>{{ text }}</span>
  </div>
</template>
<script setup>
const props = defineProps({
  text: { type: String, default: '战略合作厂商' },
})
</script>`;
    const det = detectHeaderRowIssues({ 'package/components/X.vue': propDriven }, opts);
    expect(det.stats.matched).toBe(1);
    const res = enforceHeaderRowGeometry({ 'package/components/X.vue': propDriven }, opts);
    expect(res.changed).toBe(true);
    expect(res.files['package/components/X.vue']).toContain('gap:8px');
  });

  test('㉓ 插值存在但 props.default 与 Figma 文案不符 ⇒ 仍判 textNotInRow（不靠插值蒙）', () => {
    const propDriven = `<template>
  <div class="c-db2d65-header-text">
    <img :src="icon4" />
    <span>{{ text }}</span>
  </div>
</template>
<script setup>
const props = defineProps({
  text: { type: String, default: '别的文案' },
})
</script>`;
    const det = detectHeaderRowIssues({ 'package/components/X.vue': propDriven }, opts);
    expect(det.issues).toHaveLength(0);
    expect(det.stats.skipped.textNotInRow).toBe(1);
  });
});
