import { repairScopedThirdPartySelectors, ensureFlexDirection, ensureFlexDirectionInVueSfc, ensureGridDisplay, ensureGridDisplayInVueSfc, sanitizeCssContent } from './css-sanitizer.js';

describe('Loop 0.C sanitizeCssContent 粘合行', () => {
  it('}==== 粘合分隔符时保留右括号并换行，less 可继续解析后续规则', () => {
    const raw = `.a {\n  color: red;\n}==== package/index.vue ===\n.b {\n  color: blue;\n}`;
    const out = sanitizeCssContent(raw, { isLessFile: true });
    expect(out).toMatch(/\.a \{[\s\S]*color: red;[\s\S]*\}/);
    expect(out).not.toMatch(/\}={3,}/);
    expect(out).toContain('.b');
    expect(out).toContain('color: blue;');
    expect(out.indexOf('}')).toBeGreaterThan(-1);
    const braceLine = out.split('\n').find((l) => l.trim() === '}');
    expect(braceLine).toBeDefined();
  });

  it('}//=*{3,} 粘合注释分隔符时同样保留 } 并换行', () => {
    const raw = `.root { display: flex; }// ===== chunk =====\n.child { flex: 1; }`;
    const out = sanitizeCssContent(raw);
    expect(out).not.toMatch(/\}\/\/[ \t]*={3,}/);
    expect(out).toContain('display: flex;');
    expect(out).toContain('.child');
  });
});

describe('repairScopedThirdPartySelectors', () => {
  it('wraps bare Ant Design selectors inside scoped styles', () => {
    const source = `<template><a-table /></template>
<style scoped>
.panel .ant-table-thead > tr > th,
.panel .ant-table-tbody > tr > td {
  color: white;
}
</style>`;

    const result = repairScopedThirdPartySelectors(source);

    expect(result).toContain(
      ':deep(.panel .ant-table-thead > tr > th,\n.panel .ant-table-tbody > tr > td)',
    );
  });

  it('keeps existing deep selectors unchanged', () => {
    const source = `<template><a-table /></template>
<style scoped>
:deep(.panel .ant-table) { color: white; }
</style>`;

    expect(repairScopedThirdPartySelectors(source)).toBe(source);
  });

  it('does not modify non-scoped styles or business selectors', () => {
    const source = `<template><div /></template>
<style>
.ant-table { color: white; }
.business-panel { display: flex; }
</style>`;

    expect(repairScopedThirdPartySelectors(source)).toBe(source);
  });

  it('repairs nested Less selectors without changing declarations', () => {
    const source = `<template><a-table /></template>
<style scoped lang="less">
.wrapper {
  color: white;
  .ant-table-row:hover > td {
    background: transparent;
  }
}
</style>`;

    const result = repairScopedThirdPartySelectors(source);

    expect(result).toContain(':deep(.ant-table-row:hover > td)');
    expect(result).toContain('color: white;');
  });

  it('adds Ant Table internal transparent layers for a scoped transparent table', () => {
    const source = `<template><a-table class="custom-table" /></template>
<style scoped>
:deep(.custom-table) {
  background: transparent;
  color: white;
}
:deep(.custom-table .ant-table-tbody > tr > td) {
  background: transparent;
}
:deep(.custom-table .ant-table-tbody > tr:hover > td) {
  background: rgba(0, 255, 255, 0.05);
}
</style>`;

    const result = repairScopedThirdPartySelectors(source);

    expect(result).toContain(':deep(.custom-table .ant-table)');
    expect(result).toContain(':deep(.custom-table .ant-table-container)');
    expect(result).toContain(':deep(.custom-table .ant-table-content)');
    expect(result).toContain(':deep(.custom-table table)');
    expect(result).toContain(
      ':deep(.custom-table .ant-table-tbody > tr > td.ant-table-cell-row-hover)',
    );
  });

  it('does not force transparent Ant Table layers without explicit transparent intent', () => {
    const source = `<template><a-table class="custom-table" /></template>
<style scoped>
:deep(.custom-table) { color: #222; }
</style>`;

    const result = repairScopedThirdPartySelectors(source);

    expect(result).toBe(source);
    expect(result).not.toContain('.ant-table-container');
  });
});

describe('ensureFlexDirection', () => {
  it('无方向证据（默认 none）时不改动任何 flex 规则', () => {
    const css = `.a { display: flex; gap: 12px; }\n.b { display: flex; flex-direction: row; }`;
    const result = ensureFlexDirection(css);
    // 默认 none：不臆测方向，保留浏览器默认 row，不插入 column
    expect(result).toBe(css);
  });

  it('证据给定 column 时补全 display:flex 缺 flex-direction 的规则', () => {
    const css = `.a { display: flex; gap: 12px; }\n.b { display: flex; flex-direction: row; }`;
    const result = ensureFlexDirection(css, undefined, { flexDirectionDefault: 'column' });
    expect(result).toContain('.a');
    expect(result).toMatch(/\.a \{[^}]*flex-direction: column;/s);
    // .b 已显式 row，不动
    expect(result).toContain('flex-direction: row;');
  });

  it('证据给定 row 时补全为 row（不误改成 column）', () => {
    const css = `.tab { display: flex; gap: 8px; }`;
    const result = ensureFlexDirection(css, undefined, { flexDirectionDefault: 'row' });
    expect(result).toMatch(/\.tab \{[^}]*flex-direction: row;/s);
  });

  it('不动 display:grid 的规则', () => {
    const css = `.c { display: grid; grid-template-columns: 1fr 1fr; }`;
    const result = ensureFlexDirection(css, undefined, { flexDirectionDefault: 'column' });
    expect(result).toBe(css);
  });

  it('幂等：补全后再次执行不重复插入', () => {
    const css = `.a { display: flex; }`;
    const once = ensureFlexDirection(css, undefined, { flexDirectionDefault: 'column' });
    const twice = ensureFlexDirection(once, undefined, { flexDirectionDefault: 'column' });
    expect(twice).toBe(once);
  });

  it('跳过含嵌套 LESS 子块的父块，只处理叶子声明块', () => {
    const css = `.parent { display: flex; .child { color: red; } }`;
    const result = ensureFlexDirection(css, undefined, { flexDirectionDefault: 'column' });
    // 父块含嵌套 { 无法可靠判定，跳过（不补 column）
    expect(result).toBe(css);
  });

  it('处理叶子声明块内的 flex 缺失', () => {
    const css = `.parent { .child { display: flex; } }`;
    const result = ensureFlexDirection(css, undefined, { flexDirectionDefault: 'column' });
    expect(result).toMatch(/\.child \{[^}]*flex-direction: column;/s);
  });
});

describe('ensureFlexDirectionInVueSfc', () => {
  it('只对 <style> 块补全，不影响 template/script', () => {
    const sfc = `<template><div class="a">x</div></template>
<script setup>const a = 1</script>
<style scoped>
.a { display: flex; }
</style>`;
    const result = ensureFlexDirectionInVueSfc(sfc, undefined, { flexDirectionDefault: 'column' });
    expect(result).toContain('const a = 1');
    expect(result).toMatch(/\.a \{[^}]*flex-direction: column;/s);
  });

  it('无证据时不改动 SFC 内任何 flex 规则', () => {
    const sfc = `<template><div class="a">x</div></template>
<style scoped>
.a { display: flex; }
</style>`;
    const result = ensureFlexDirectionInVueSfc(sfc);
    expect(result).toBe(sfc);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
/**
 * 刀 17（2026-09-14）：`grid-template-*` 漏写 `display: grid` → 多列网格塌成一列，
 * 内容溢出被宿主外壳裁掉 = **整块内容凭空消失**，而 L0-B 等代码门禁完全看不见
 * （CSS 合法、DOM 存在）。实锤产物 c-device-monitor-021848cc 的 .c-device-monitor-device-grid。
 */
describe('ensureGridDisplay —— grid 布局确定性补全', () => {
  it('事故形态：只有 grid-template-columns 无 display → 补 display: grid', () => {
    const css = `.c-x-device-grid {grid-template-columns: repeat(3, 1fr)}`;
    const result = ensureGridDisplay(css);
    expect(result).toMatch(/\.c-x-device-grid \{[^}]*display: grid;/s);
    // 单行压缩写法：前一条声明缺 `;` 必须自动补上，否则两条声明会粘在一起
    expect(result).toContain('repeat(3, 1fr);\n  display: grid;');
  });

  it('多行写法（末尾有分号）不重复加分号', () => {
    const css = `.grid {\n  grid-template-columns: 1fr 1fr;\n  gap: 12px;\n}`;
    const result = ensureGridDisplay(css);
    expect(result).toMatch(/gap: 12px;\s*display: grid;/);
    expect(result).not.toContain(';;');
    // 插入不产生多余空行
    expect(result).toMatch(/gap: 12px;\n {2}display: grid;\}/);
  });

  it('grid-template-rows / grid-auto-flow 同样识别', () => {
    expect(ensureGridDisplay('.a { grid-template-rows: auto 1fr; }')).toContain('display: grid;');
    expect(ensureGridDisplay('.b { grid-auto-flow: column; }')).toContain('display: grid;');
    expect(ensureGridDisplay('.c { grid-template-areas: "a b"; }')).toContain('display: grid;');
  });

  it('已有 display 一律不覆盖作者意图（grid / flex 都不动）', () => {
    const g = `.a { display: grid; grid-template-columns: 1fr 1fr; }`;
    expect(ensureGridDisplay(g)).toBe(g);
    // display:flex + grid-template-* 属作者显式意图，绝不改成 grid
    const f = `.b { display: flex; grid-template-columns: 1fr 1fr; }`;
    expect(ensureGridDisplay(f)).toBe(f);
  });

  it('只有 gap 不算 grid 意图（flex 也用 gap，宁可不改）', () => {
    const css = `.a { display: flex; gap: 12px; }`;
    expect(ensureGridDisplay(css)).toBe(css);
    const css2 = `.b { gap: 12px; }`;
    expect(ensureGridDisplay(css2)).toBe(css2);
  });

  it('幂等：补全后再次执行不重复插入', () => {
    const once = ensureGridDisplay('.a { grid-template-columns: 1fr 1fr; }');
    const twice = ensureGridDisplay(once);
    expect(twice).toBe(once);
    expect(twice.match(/display: grid;/g)).toHaveLength(1);
  });

  it('嵌套 LESS：只补全叶子声明块，父块不动', () => {
    const css = `.parent { .child { grid-template-columns: 1fr 1fr; } }`;
    const result = ensureGridDisplay(css);
    expect(result).toMatch(/\.child \{[^}]*display: grid;/s);
    // 只补一次（父块含嵌套 {，不产出）
    expect(result.match(/display: grid;/g)).toHaveLength(1);
    // 父块自身未被插入 display（父块结构原样保留）
    expect(result.startsWith('.parent { .child {')).toBe(true);
  });

  it('注释 / url() 里的花括号不被误判为结构', () => {
    const css = `/* } trap { */\n.a { grid-template-columns: 1fr 1fr; }`;
    const result = ensureGridDisplay(css);
    expect(result).toMatch(/\.a \{[^}]*display: grid;/s);
    expect(result).toContain('/* } trap { */');
  });

  it('多条规则一次全部补全', () => {
    const css = `.a { grid-template-columns: 1fr; }\n.b { color: red; }\n.c { grid-template-columns: repeat(2, 1fr); }`;
    const result = ensureGridDisplay(css);
    expect(result.match(/display: grid;/g)).toHaveLength(2);
    expect(result).toContain('.b { color: red; }');
  });

  it('无 grid 属性 / 空输入原样返回', () => {
    const css = `.a { color: red; }`;
    expect(ensureGridDisplay(css)).toBe(css);
    expect(ensureGridDisplay('')).toBe('');
    expect(ensureGridDisplay(undefined as any)).toBeUndefined();
  });
});

describe('ensureGridDisplayInVueSfc', () => {
  it('补全 <style> 块内的 grid，不影响 template/script', () => {
    const sfc = `<template><div class="g"><i/></div></template>
<script setup>const a = 1</script>
<style lang="less" scoped>
.c-x-device-grid {grid-template-columns: repeat(3, 1fr)}
</style>`;
    const result = ensureGridDisplayInVueSfc(sfc);
    expect(result).toContain('const a = 1');
    expect(result).toMatch(/\.c-x-device-grid \{[^}]*display: grid;/s);
  });

  it('无 grid 意图时 SFC 原样返回', () => {
    const sfc = `<style scoped>\n.a { color: red; }\n</style>`;
    expect(ensureGridDisplayInVueSfc(sfc)).toBe(sfc);
  });
});
