/**
 * 🎯 2026-09-14 治本（mc-max-1789390853889-4bda6d13 真机实锤）：
 * .less 文件残留 SFC 标签剥离。
 *
 * 事故：LLM 输出样式块时把闭合标签一起带出 → common.less:306 残留孤立 `</style>`
 * → LESS 编译 Unrecognised input → 最终 LESS 门禁 BLOCK、任务失败；
 * 且 index.less @import common.less，一个污染点连锁成「几乎所有文件都报 LESS-COMPILE-001」。
 * 治本：sanitizeFileContent 是全文件写盘统一收口，样式文件里 SFC 标签永远不合法 → 剥离。
 */
// backend-root.js ESM 风格（const __filename）在 ts-jest CJS 下与模块包装器参数撞名，
// logger 链一加载整套件 0 运行 ⇒ 工厂 mock 绕过（file-writer.diff-skip 等同款惯例）。
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: '/tmp/mvgo-test-logs',
}), { virtual: true })

import { sanitizeFileContent, stripDsmlResidue, safeLessVarValue, buildCssVarsFile } from './file-writer.js';

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

describe('刀15 · DSML 工具调用残片区剥除（mv-1793103939639-b9319f42 实锤）', () => {
  // 实锤复刻：mv 任务 common.less 第 13 行起混入 `</｜｜DSML｜｜ parameter>` + 中文对话段
  // （对话行内嵌 `:style="{…}"` 片段——专治「只看 { 就停」的弱判据）。
  const polluted = [
    '// 设备详情面板共享业务样式（按功能语义命名）',
    '',
    '// 主组件与子组件通过 @import 引入本文件',
    '',
    '// 面板根容器：浅蓝到淡蓝渐变，带描边与圆角',
    '',
    '// 设备属性网格容器：4 列 × 6 行，行主序排列',
    '',
    '// 单个字段项：label + value 横向排列',
    '</｜｜DSML｜｜ parameter>',
    '',
    '我已完成上一轮生成内容的复现（为保留上下文以便后续修复）。请问你希望我做什么？例如：',
    '',
    '1. **修复 `bg1` 幽灵引用（CODE-025）**——但那需要修改的是"注入后"实际生成的 index.vue（当前脚本片段未使用 `bg1`，实际报错来自被截断/未展示的完整版本里的 `:style="{ backgroundImage: url(bg1) }"`）。',
    '',
    '.device-info-grid {',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: 12px;',
    '  width: 100%;',
    '}',
    '',
  ].join('\n');

  it('⭐ 实锤：DSML 标记行 + 中文对话段整块剥除，前后合法内容零损伤', () => {
    const out = sanitizeFileContent(polluted, 'resources/styles/common.less');
    expect(out).not.toContain('DSML');
    expect(out).not.toContain('我已完成');
    expect(out).not.toContain('幽灵引用');
    // 合法 less 块完整保留
    expect(out).toContain('.device-info-grid {');
    expect(out).toContain('gap: 12px;');
    // 前面的合法中文注释保留（污染区之前的内容不动）
    expect(out).toContain('// 单个字段项：label + value 横向排列');
  });

  it('半角 ||DSML|| 变体同样剥除', () => {
    const src = '.a { color: red; }\n</||DSML|| invoke>\n这是一段对话泄漏\n.b { color: blue; }\n';
    const out = sanitizeFileContent(src, 'common.less');
    expect(out).not.toContain('DSML');
    expect(out).not.toContain('对话泄漏');
    expect(out).toContain('.b { color: blue; }');
  });

  it('反向：无 DSML 的合法 less 零改动（含中文注释、url() 行内 <svg>）', () => {
    const legit = [
      '// 合法中文注释：保留',
      '.c-x {',
      "  background: url('data:image/svg+xml;utf8,<svg viewBox=\"0 0 1 1\"></svg>');",
      '  color: #333;',
      '}',
    ].join('\n');
    expect(sanitizeFileContent(legit, 'common.less')).toBe(legit);
  });

  it('反向：stripDsmlResidue 对无 DSML 文本恒等（fail-open）', () => {
    const s = '.a{color:red}\n我有一段中文但不在 DSML 块里（假设形态，不该被碰）\n';
    // 无 DSML 标记行 ⇒ 零改动（即便有中文行——触发条件是标记行，不是中文）
    expect(stripDsmlResidue(s)).toBe(s);
  });

  it('幂等：剥一次后再跑不变', () => {
    const once = sanitizeFileContent(polluted, 'common.less');
    expect(sanitizeFileContent(once, 'common.less')).toBe(once);
  });

  it('4L-c：全角标签行在 .less 中被剥离（无对话段的孤立形态）', () => {
    const src = '.a { color: red; }\n</｜｜style｜｜>\n.b { color: blue; }\n';
    const out = sanitizeFileContent(src, 'common.less');
    expect(out).not.toContain('｜');
    expect(out).toContain('.b { color: blue; }');
  });

  it('4L-c 不误伤 .vue/.js：半角标签行的既有行为不变（4L-b 只作用样式文件）', () => {
    const vueSrc = '<template>\n  <div class="x">你好</div>\n</template>\n\n<script setup>\nconst a = 1\n</script>\n';
    const out = sanitizeFileContent(vueSrc, 'package/index.vue');
    expect(out).toContain('<div class="x">你好</div>');
  });
})
