/**
 * 🎯 4J 分支：脚本文件残留 SFC 块标签剥离（2026-10-25 · mc-max-1792934332868-389dd460 实锤）
 *
 * 真机形态：LLM 把「某个 <script> 块」当**独立文件**输出，
 *   产物 `package/runtime.js`（7 行 / 466B）尾行残留孤立 `</script>`：
 *     ```
 *     5: }
 *     6: export { componentProps, businessProps, runtimeBuilder, componentApi }
 *     7: </script>
 *     ```
 *   · chunk 原文首行是 ```js 围栏（被 sanitizeFileContent 第 1 步剥掉）→ **尾标签无人管**；
 *   · 预览端 vue3-sfc-loader 对 `.js` 固定 script 模式 ⇒ 顶层 export 抛
 *     `'import' and 'export' may appear only with 'sourceType: "module"' (6:0)`
 *     ⇒「组件加载失败（组件自身问题）」。
 *
 * 契约：这类「机械可修」缺陷必须在校验前确定性修掉（与 4L/4L-b 同一纪律）。
 * 🔴 判据刻意比 4L-b（任意标签名）**更窄**——4J 只剥 template/script/style 三个 SFC 块名，
 *   因为 JS 里 `<div>` 是合法内容（模板字符串拼 HTML）。本 spec 用「误伤对照」钉住这条边界。
 */
// backend-root.js ESM 风格在 ts-jest CJS 下与模块包装器参数撞名 ⇒ 工厂 mock 绕过（既有惯例）。
jest.mock('../../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: '/tmp/mvgo-test-logs',
}), { virtual: true })

import { sanitizeFileContent } from './file-writer.js';

describe('sanitizeFileContent 4J：脚本文件残留 SFC 块标签', () => {
  it('阳性对照：事故件 runtime.js 的 tail </script> 被剥离（含首围栏的原样 chunk）', () => {
    // 完全复刻 `.mc-gen/cache/code-chunks/3-package_runtime.js` 原文
    const chunk = [
      '```js',
      "import { ref } from 'vue'",
      '',
      'export const componentProps = { a: 1 }',
      'export const businessProps = { b: 2 }',
      'export const runtimeBuilder = () => null',
      'export const componentApi = {}',
      'export { componentProps, businessProps, runtimeBuilder, componentApi }',
      '</script>',
      '',
    ].join('\n');

    const out = sanitizeFileContent(chunk, 'package/runtime.js');

    // 尾标签消失
    expect(out).not.toContain('</script>');
    // 首围栏（第 1 步）与尾标签（4J）都被清掉
    expect(out).not.toContain('```');
    // 正文逐字保留（4J 只剥标签，绝不碰 import/export）
    expect(out).toContain("import { ref } from 'vue'");
    expect(out).toContain('export const runtimeBuilder = () => null');
    expect(out.trimEnd().endsWith('}')).toBe(true);
  });

  it('阳性对照：head </script> 与 <script> 同样被剥离（不区分开闭）', () => {
    const src = '<script>\nconst a = 1\nmodule.exports = { a }\n';
    const out = sanitizeFileContent(src, 'package/helper.js');
    expect(out).not.toContain('<script>');
    expect(out).toContain('const a = 1');
  });

  it('典型脚本起始模型：脱离 LLM 输出后可直接被 script 模式 / module 模式解析', () => {
    // 剥标签后的产物不得再让 Function 编译失败（script 模式下 `export` 才允许报错）
    const out = sanitizeFileContent(
      "module.exports = { a: 1 }\n</script>\n",
      'package/legacy.js',
    );
    expect(out).toBe('module.exports = { a: 1 }');
  });

  it('误伤对照①：行内字面量 `const s = \'</script>\'` 不剥（行级匹配豁免）', () => {
    const src = [
      "const s = '</script>'",
      'const t = "</style>"',
      'module.exports = { s, t }',
    ].join('\n');
    const out = sanitizeFileContent(src, 'package/strs.js');
    expect(out).toBe(src);
  });

  it('误伤对照②：JS 里的 HTML 模板标签（<div> 等）不剥 —— 4J 只认 SFC 三个块名', () => {
    const src = [
      'const tpl = [',
      "  '<div class=\"box\">',",
      "  '<a-table :data=\"rows\" />',",
      "  '</div>',",
      '].join(\'\')',
      'module.exports = { tpl }',
    ].join('\n');
    const out = sanitizeFileContent(src, 'package/tpl.js');
    expect(out).toBe(src);
  });

  it('误伤对照③：无标签的 CJS .js 逐字节不变（零回归）', () => {
    const src = "const x = require('./a')\nmodule.exports = { x }\n";
    expect(sanitizeFileContent(src, 'package/a.js')).toBe(src.trim());
  });

  it('误伤对照④：真 ESM .js（无残留标签）内容不被改写，仅 trim', () => {
    const src = "import a from './a'\nexport default { a }\n";
    expect(sanitizeFileContent(src, 'package/esm.js')).toBe(src.trim());
  });

  it('扩展名覆盖：.mjs / .ts / .jsx 同样剥离', () => {
    expect(sanitizeFileContent('export const a = 1\n</script>\n', 'x/mod.mjs')).not.toContain('</script>');
    expect(sanitizeFileContent('export const a = 1\n</style>\n', 'x/mod.ts')).not.toContain('</style>');
    expect(sanitizeFileContent('export const a = 1\n</template>\n', 'x/mod.jsx')).not.toContain('</template>');
  });

  it('边界：.less 仍走 4L-b（更宽，剥任意标签行），4J 不介入其扩展名', () => {
    // 样式文件里裸标签行（含非 SFC 名）应仍被 4L-b 剥掉
    const out = sanitizeFileContent('.a { color: red; }\n</a-table>\n', 'package/common.less');
    expect(out).not.toContain('</a-table>');
    expect(out).toContain('.a { color: red; }');
  });

  it('幂等：重复调用结果稳定', () => {
    const chunk = 'const a = 1\nmodule.exports = { a }\n</script>\n';
    const once = sanitizeFileContent(chunk, 'package/i.js');
    const twice = sanitizeFileContent(once, 'package/i.js');
    expect(twice).toBe(once);
  });
});
