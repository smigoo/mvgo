/**
 * 🎯 2026-09-14 治本（mc-max-1789390853889-4bda6d13 真机实锤）：
 * .less 文件残留 SFC 标签剥离。
 *
 * 事故：LLM 输出样式块时把闭合标签一起带出 → common.less:306 残留孤立 `</style>`
 * → LESS 编译 Unrecognised input → 最终 LESS 门禁 BLOCK、任务失败；
 * 且 index.less @import common.less，一个污染点连锁成「几乎所有文件都报 LESS-COMPILE-001」。
 * 治本：sanitizeFileContent 是全文件写盘统一收口，样式文件里 SFC 标签永远不合法 → 剥离。
 */
import { sanitizeFileContent, safeLessVarValue, buildCssVarsFile } from './file-writer.js';

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

  /**
   * 🎯 2026-10-05 治本（mc-max-1791132079721-6b655282 真机实锤）：
   * 4L 只认 style/template/script 三个固定标签名 —— 模型换成 `</a-table>` 即穿透。
   * 事故：common.less:91 残留 `</a-table>` → LESS Unrecognised input
   *   → index.less 根作用域 @import 连锁 6 文件全部 LESS-COMPILE-001 → 任务失败。
   * 治本：泛化为「整行裸标签」剥离（行级匹配，豁免 url(data:...<svg>) 行内数据 URI）。
   */
  it('⭐ .less 中整行裸组件标签 `</a-table>`（6b655282 实锤形态）被剥离', () => {
    const polluted = [
      '.c-component-table-wrap {',
      '  padding: 16px;',
      '}',
      '</a-table>',
      '',
      '.c-6b6552-header-bg {',
      '  inset: 0;',
      '}',
    ].join('\n');
    const out = sanitizeFileContent(polluted, 'resources/styles/common.less');
    expect(out).not.toContain('</a-table>');
    // 关键：只删标签那一行，前后规则必须完整保留（此处标签在文件中部）
    expect(out).toContain('.c-component-table-wrap');
    expect(out).toContain('padding: 16px');
    expect(out).toContain('.c-6b6552-header-bg');
    expect(out).toContain('inset: 0');
  });

  it('整行裸开标签（带属性）同样剥离：`<a-table :columns="c" bordered>`', () => {
    const out = sanitizeFileContent('<a-table :columns="c" bordered>\n.a{color:red}\n', 'x.less');
    expect(out).not.toContain('<a-table');
    expect(out).toContain('color:red');
  });

  it('⭐ 阴性对照：url() 内联 data-uri SVG 不得被误伤（锁死误伤率 0）', () => {
    const svgLine =
      "  mask: url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M8 2L2 8z\"/></svg>') no-repeat center;";
    const src = ['.c-x {', svgLine, '}'].join('\n');
    const out = sanitizeFileContent(src, 'resources/styles/common.less');
    // 行内数据 URI 必须原样保留（若被剥掉，SVG 图标内容会永久丢失）
    expect(out).toContain('</svg>');
    expect(out).toContain('<svg');
    expect(out).toBe(src);
  });

  it('a-table 剥离后幂等，且与 </style> 混合污染可一次清净', () => {
    const mixed = '.a{color:red}\n</style>\n</a-table>\n.b{color:blue}\n';
    const once = sanitizeFileContent(mixed, 'common.less');
    expect(once).not.toContain('</style>');
    expect(once).not.toContain('</a-table>');
    expect(once).toContain('.a{color:red}');
    expect(once).toContain('.b{color:blue}');
    expect(sanitizeFileContent(once, 'common.less')).toBe(once);
  });
});

/**
 * 🛡️ 2026-09-28（c-device-monitor-aa799337 实锤）：告警语义槽位兜底色。
 * 设计真值 `d-3`/`d-5`（异常数）fills 顶层 SOLID = #E03434（红），但 LLM 写的
 * `@color-alert` 此前**不在语义表**里 → 含 "color" 落到通用 text/color 分支 → 灰 #333333。
 */
describe('safeLessVarValue · alert/notice 归入 danger 族（2026-09-28）', () => {
  it('@color-alert / @colorAlert / @noticeColor → danger 红（不再兜底成 #333333）', () => {
    expect(safeLessVarValue('@color-alert')).toBe('#f5222d');
    expect(safeLessVarValue('@colorAlert')).toBe('#f5222d');
    expect(safeLessVarValue('@noticeColor')).toBe('#f5222d');
  });

  it('既有语义不回归：error/danger/fail 仍为红；warning/success/primary 不变', () => {
    expect(safeLessVarValue('@color-danger')).toBe('#f5222d');
    expect(safeLessVarValue('@color-error')).toBe('#f5222d');
    expect(safeLessVarValue('@color-warning')).toBe('#faad14');
    expect(safeLessVarValue('@color-success')).toBe('#52c41a');
    expect(safeLessVarValue('@color-primary')).toBe('#409EFF');
  });

  it('数值型分支优先：@alertZIndex 不被误判成颜色', () => {
    expect(safeLessVarValue('@alertZIndex')).toBe('1');
    expect(safeLessVarValue('@alertGap')).toBe('0px');
  });

  it('@color-alert-bg 仍走 bg 分支（bg 是更强的信号）', () => {
    expect(safeLessVarValue('@color-alert-bg')).toBe('#ffffff');
  });
});

/**
 * 🛡️ 2026-09-28（c-device-monitor-aa799337 实锤 · 删硬编码）：
 * `buildCssVarsFile` 曾用 `options.fontSize || '12'` → 463/463 组件 `--fontSize` 都算成 12/16rem，
 * 而设计基准是 14（`@font-size-base: 14px` 命中 421/422）→ 全组件字号系统性 0.857×。
 * 现在缺省留空 → 输出无参 `getCssSize()`（框架 baseFontSize）。
 */
describe('buildCssVarsFile · fontSize 不再有魔法数 12（2026-09-28）', () => {
  it('未传 fontSize → 输出无参 getCssSize()（框架 baseFontSize 决定）', () => {
    const out = buildCssVarsFile({});
    expect(out).toContain('fontSize: $mcCssBuilder.getCssSize()');
    expect(out).not.toContain('getCssSize(12)');
  });

  it('显式传 fontSize → 原样使用（保留设计基准通道）', () => {
    expect(buildCssVarsFile({ fontSize: '14' })).toContain('fontSize: $mcCssBuilder.getCssSize(14)');
    expect(buildCssVarsFile({ fontSize: 16 })).toContain('fontSize: $mcCssBuilder.getCssSize(16)');
  });
});
