/**
 * 🛡️ stripSurplusBlockClosers（2026-09-26 · mc-max-1790430709803-8d304bf9 实锤）
 *
 * 真机形态：ContentActive.vue 尾部重复 `</style>`
 *   ```
 *   106: }
 *   107: </style>
 *   108: </style>
 *   ```
 * → @vue/compiler-sfc `Invalid end tag.` → P1-4 坏文件隔离把整个子组件剔除 +
 *   摘掉 index.vue 里的引用 → 切换区从两张卡变一张卡。
 * 契约：这类「机械可修」缺陷必须在校验前确定性修掉，**不得**走整文件降级。
 */
import { stripSurplusBlockClosers } from './file-writer.js';

describe('stripSurplusBlockClosers：多余块闭合标签剔除', () => {
  it('重复 </style>（独占一行）→ 只留一个，且不留空行', () => {
    const src = `<template>
  <div class="c-x-active">总数:56302</div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-8788.png'
</script>

<style lang="less" scoped>
.c-x-active {
  color: @color-danger;
}
</style>
</style>
`;
    const r = stripSurplusBlockClosers(src);
    expect(r.removed).toEqual(['</style>']);
    expect((r.source.match(/<\/style>/g) || []).length).toBe(1);
    // 未留下空行：文件应以单个 </style>\n 收尾
    expect(r.source.trimEnd().endsWith('</style>')).toBe(true);
    expect(r.source).not.toMatch(/<\/style>\s*\n\s*<\/style>/);
    // 块内容与模板不受影响
    expect(r.source).toContain('color: @color-danger;');
    expect(r.source).toContain('<div class="c-x-active">总数:56302</div>');
  });

  it('合法多块（<style> + <style scoped>）→ 零改动', () => {
    const src = `<template>
  <div />
</template>
<style>
.a { color: red; }
</style>
<style scoped lang="less">
.b { color: blue; }
</style>
`;
    const r = stripSurplusBlockClosers(src);
    expect(r.removed).toEqual([]);
    expect(r.source).toBe(src);
  });

  it('重复 </script> / </template> 同样被剔除', () => {
    const src = `<template>\n  <div />\n</template>\n</template>\n<script setup>\nconst a = 1\n</script>\n</script>\n`;
    const r = stripSurplusBlockClosers(src);
    expect(r.removed.sort()).toEqual(['</script>', '</template>']);
    expect((r.source.match(/<\/template>/g) || []).length).toBe(1);
    expect((r.source.match(/<\/script>/g) || []).length).toBe(1);
  });

  it('幂等 + 空输入', () => {
    const src = `<template><div /></template>\n<style>.a{color:red}</style>\n</style>\n`;
    const once = stripSurplusBlockClosers(src).source;
    const twice = stripSurplusBlockClosers(once);
    expect(twice.removed).toEqual([]);
    expect(twice.source).toBe(once);
    expect(stripSurplusBlockClosers('').removed).toEqual([]);
  });
});
