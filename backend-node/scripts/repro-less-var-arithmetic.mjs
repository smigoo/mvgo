/**
 * 复现：Less 变量为 var() 时无法参与算术运算（2026-10-12）
 *
 * 用途：给微码方的沟通材料做附件。这是 M5-6 冲突（判据要求 var() 透传，
 * 但裸乘法编译失败）的**最小可复现证据**。
 *
 * 结论（本文件即证据）：
 *   @fontSize: var(--fontSize)      + 裸乘法 @fontSize * 1.5  → ❌ invalid type
 *   @fontSize: var(--fontSize, 12px) + 裸乘法                  → ❌ invalid type（fallback 不参与求值）
 *   @fontSize: 12px                 + 裸乘法                  → ✅ 18px
 *   任一形态                        + calc(@fontSize * 1.5)   → ✅ 均可编译
 *
 * 运行：node scripts/repro-less-var-arithmetic.mjs
 */
import less from 'less';

const DEFINITIONS = [
  ['var(--fontSize)', '.common() {\n  @fontSize: var(--fontSize);\n}'],
  ['var(--fontSize, 12px)', '.common() {\n  @fontSize: var(--fontSize, 12px);\n}'],
  ['12px（字面量）', '.common() {\n  @fontSize: 12px;\n}'],
];

const USAGES = [
  ['裸乘法   @fontSize * 1.5', '.c { font-size: @fontSize * 1.5; }'],
  ['calc 包装 calc(@fontSize * 1.5)', '.c { font-size: calc(@fontSize * 1.5); }'],
];

let ok = 0;
let total = 0;
const results = [];

for (const [defLabel, defSrc] of DEFINITIONS) {
  for (const [useLabel, useSrc] of USAGES) {
    total++;
    try {
      const out = await less.render(`${defSrc}\n.common();\n${useSrc}`);
      const got = (out.css.match(/font-size:[^;]*/) || [''])[0];
      results.push({ def: defLabel, use: useLabel, ok: true, got });
      ok++;
    } catch (e) {
      results.push({ def: defLabel, use: useLabel, ok: false, got: e.message.trim() });
    }
  }
}

console.log('变量定义'.padEnd(26), '|', '业务写法'.padEnd(36), '| 结果');
console.log('-'.repeat(100));
for (const r of results) {
  console.log(
    r.def.padEnd(26),
    '|',
    r.use.padEnd(36),
    '|',
    r.ok ? `✅ ${r.got}` : `❌ ${r.got}`,
  );
}

console.log(`\n汇总：${ok}/${total} 通过`);
console.log('\n结论：');
console.log('  1) 只有「裸乘法 + var() 定义」会失败 —— 这正是线上编译阻断的原因');
console.log('  2) calc() 包装后，两种定义形式都能编译 ⇒ 规范应要求业务写 calc(@fontSize * N)');
console.log('  3) 判据 M5-6 要求 var(--fontSize) 映射，可与 calc() 写法并存（不冲突）');
