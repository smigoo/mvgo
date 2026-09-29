/**
 * A 的因果实证（只读，不写产物）：
 * 用真实 less 编译器验证「SFC 顶层是否有 @color-text-base: 字面量重声明」
 * 对 .dark 覆盖层编译结果的影响。
 *
 * 探针用产物里**真实存在**的类（common.less 会带进 .dark 覆盖层）。
 *
 * 用法：env -i PATH=... HOME=... node .tmp-less-theme-proof.js
 */
const fs = require('fs');
const path = require('path');
const less = require('less');

const STYLES = path.resolve(
  __dirname,
  'workspace/custom-components/c-device-monitor-2469e3a0/resources/styles',
);

async function compile(prefixDecl) {
  const src = `${prefixDecl || ''}@import '${path.join(STYLES, 'index.less')}';\n`;
  const out = await less.render(src, { filename: path.join(STYLES, '__probe.less') });
  return out.css;
}

/** 抓某个 class 在「根作用域」与「.dark 作用域」内的 color 值 */
function colorOf(css, cls) {
  const root = new RegExp(`^\\${cls}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm').exec(css);
  const dark = new RegExp(`\\.dark\\s+\\${cls}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm').exec(css);
  const read = (m) => {
    if (!m) return '(未命中)';
    const c = /color\s*:\s*([^;]+);/.exec(m[1]);
    return c ? c[1].trim() : '(无 color)';
  };
  return { root: read(root), dark: read(dark) };
}

const CLS = '.c-device-monitor-default-name'; // common.less 中 color: @color-text-base

(async () => {
  const withDecl = await compile('@color-text-base: #333333;\n');
  const without = await compile('');

  console.log('=== 探针类 %s（common.less 里 color: @color-text-base） ===', CLS);
  const a = colorOf(withDecl, CLS);
  const b = colorOf(without, CLS);
  console.log('【现状】顶层有 `@color-text-base: #333333;`  → 根作用域 %s | .dark 作用域 %s', a.root, a.dark);
  console.log('【修复】顶层无该重声明                → 根作用域 %s | .dark 作用域 %s', b.root, b.dark);
  console.log('');
  console.log('判据：修复前 .dark 作用域 = #333333（dark 失效）；修复后应为 #ffffff（dark 生效）');
  console.log('结论：', b.dark !== a.dark ? '✅ 重声明确为 dark 失效的充分原因' : '❌ 未观察到差异，结论待复核');
})().catch((e) => {
  console.error('编译失败：', e.message);
  process.exit(1);
});
