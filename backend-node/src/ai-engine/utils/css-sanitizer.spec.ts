import { repairScopedThirdPartySelectors, ensureFlexDirection, ensureFlexDirectionInVueSfc } from './css-sanitizer.js';

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
