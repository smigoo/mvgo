/**
 * 🎯 2026-09-14 治本（mc-max-1789390853889-4bda6d13 真机实锤）：
 * .less 文件残留 SFC 标签剥离。
 *
 * 事故：LLM 输出样式块时把闭合标签一起带出 → common.less:306 残留孤立 `</style>`
 * → LESS 编译 Unrecognised input → 最终 LESS 门禁 BLOCK、任务失败；
 * 且 index.less @import common.less，一个污染点连锁成「几乎所有文件都报 LESS-COMPILE-001」。
 * 治本：sanitizeFileContent 是全文件写盘统一收口，样式文件里 SFC 标签永远不合法 → 剥离。
 */
import { sanitizeFileContent } from './file-writer.js';

describe('sanitizeFileContent · 样式文件 SFC 标签剥离（2026-09-14 治本）', () => {
  const pollutedLess = [
    '.c-device-monitor-device-count {',
    '  font-size: 14px;',
    '}',
    '</style>',
    '',
    '/* [自动修复] 后续追加段 */',
    '.c-device-monitor-tab-item--active {',
    '  display: flex;',
    '}',
  ].join('\n');

  it('⭐ .less 中孤立 </style>（4bda6d13 实锤形态）被剥离，其后内容完整保留', () => {
    const out = sanitizeFileContent(pollutedLess, 'resources/styles/common.less');
    expect(out).not.toContain('</style>');
    // 关键：剥离不截断——标签之后的 [自动修复] 段必须保留（旧事故里它跟在污染标签后）
    expect(out).toContain('.c-device-monitor-tab-item--active');
    expect(out).toContain('font-size: 14px');
  });

  it('.less 中 <style lang="less"> 开标签同样剥离', () => {
    const out = sanitizeFileContent('<style lang="less">\n.a { color: red; }\n', 'a.less');
    expect(out).not.toContain('<style');
    expect(out).toContain('color: red');
  });

  it('.css/.scss 同样生效；<template>/<script> 标签也剥离', () => {
    for (const p of ['a.css', 'a.scss']) {
      const out = sanitizeFileContent('</template>\n.a{color:red}\n<script>\n', p);
      expect(out).not.toContain('template');
      expect(out).not.toContain('script');
      expect(out).toContain('color:red');
    }
  });

  it('幂等：对已剥离内容再跑一遍不变', () => {
    const once = sanitizeFileContent(pollutedLess, 'common.less');
    expect(sanitizeFileContent(once, 'common.less')).toBe(once);
  });

  it('非样式文件不受影响：.vue 的 SFC 标签语义保持原样（既有行为）', () => {
    const vue = '<template><div/></template>\n<style lang="less" scoped>\n.a{color:red}\n</style>';
    const out = sanitizeFileContent(vue, 'package/index.vue');
    // .vue 里 </style> 是合法结构，且其后文本截断逻辑依赖它存在 —— 不得剥离
    expect(out).toContain('</style>');
    expect(out).toContain('</template>');
  });
});
