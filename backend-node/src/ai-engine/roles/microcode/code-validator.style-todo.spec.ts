/**
 * 样式 TODO 占位收口规格（2026-09-30 · 确定性收回清单 §七 Bug1 / 评审四 bug §8.2、§8.4 步骤 4）
 *
 * 三条收敛（删减法）：
 *   ① **削源**：P-12a `post-process#validateDynamicClassStyles` 已删除 —— 它是
 *      `/* TODO: 补充样式 *\/` 占位的**唯一生产者**（全语料制造 1464 条永远填不满的债，
 *      内层 1351 条即 92.3% 结构上不可填）。本 spec 同时**防其以新名字复活**。
 *   ② **收缩**：清扫职责由 `code-validator#stripStyleTodoPlaceholders` 承担，取代原「从
 *      `nodeLayoutFacts` 填充样式」的职责，改为只清占位 —— 因为布局注入已统一归 2.11
 *      （LAYOUT-FACTS-INJECT）。
 *   ③ **P1-1 口径统一（2026-09-30）**：旧 `stripStyleTodoPlaceholders` 已删除，`.vue` 侧改由
 *      `stripEmptyTodoRulesInSfc`（= `stripEmptyTodoRules` 的 SFC 适配器）接管，与 `common.less`
 *      侧共用同一套判定，消除「只取第一块 `<style>`、只认 `.class{}`、无文案护栏、计数虚增」四个缺陷。
 */
import { stripEmptyTodoRules, stripEmptyTodoRulesInSfc } from './code-validator.js';
import * as codeValidatorModule from './code-validator.js';
import { BUILTIN_RULE_IDS } from '../../validators/code-fix-rules.js';
import * as postProcess from '../../utils/post-process.js';

const sfc = (style: string, tpl = '<template><div class="c-x-wrap" /></template>') =>
  `${tpl}\n\n<style scoped>\n${style}\n</style>\n`;

describe('stripEmptyTodoRulesInSfc（§七 Bug1 收缩 + P1-1 口径统一：只清占位、不再注入布局）', () => {
  it('⭐ 主形态：占位块已有真实声明 → 只去注释、保留声明（不重复注入布局）', () => {
    const code = sfc(`.c-x-card {
  display: flex;
  flex-direction: column;
  /* TODO: 补充样式 */
}`);
    const r = stripEmptyTodoRulesInSfc(code);
    expect(r.strippedComments).toBe(1);
    expect(r.removedRules).toBe(0);
    expect(r.code).toContain('display: flex');
    expect(r.code).toContain('flex-direction: column');
    expect(r.code).not.toContain('TODO');
  });

  it('纯空壳占位 → 整条规则删除，其它规则零改动', () => {
    const code = sfc(`.c-x-empty {
  /* TODO: 补充样式 */
}
.c-x-keep {
  color: red;
}`);
    const r = stripEmptyTodoRulesInSfc(code);
    expect(r.removedRules).toBe(1);
    expect(r.strippedComments).toBe(0);
    expect(r.code).not.toContain('.c-x-empty');
    expect(r.code).not.toContain('TODO');
    expect(r.code).toContain('.c-x-keep');
    expect(r.code).toContain('color: red');
  });

  it('混合：空壳删除 + 有声明留存，计数各自独立', () => {
    const code = sfc(`.a {
  /* TODO: 补充样式 */
}
.b {
  display: flex;
  /* TODO: 补充样式 */
}
.c {
  color: blue;
}`);
    const r = stripEmptyTodoRulesInSfc(code);
    expect(r.removedRules).toBe(1);
    expect(r.strippedComments).toBe(1);
    expect(r.code).not.toContain('TODO');
    expect(r.code).not.toContain('.a {');
    expect(r.code).toContain('display: flex');
    expect(r.code).toContain('.c {');
  });

  it('非占位规则零改动（不误伤）', () => {
    const code = sfc(`.c-x-root {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}`);
    const r = stripEmptyTodoRulesInSfc(code);
    expect(r.removedRules + r.strippedComments).toBe(0);
    expect(r.code).toBe(code);
  });

  it('幂等：对已清扫结果再跑 → 零计数、代码不变', () => {
    const code = sfc(`.c-x-card {
  display: flex;
  /* TODO: 补充样式 */
}`);
    const once = stripEmptyTodoRulesInSfc(code);
    expect(once.strippedComments).toBe(1);
    const twice = stripEmptyTodoRulesInSfc(once.code);
    expect(twice.removedRules + twice.strippedComments).toBe(0);
    expect(twice.code).toBe(once.code);
  });

  it('无 TODO / 无 style 段 / 非法入参 → 原样返回（fail-open）', () => {
    const noTodo = sfc('.c-x-root { color: red; }');
    expect(stripEmptyTodoRulesInSfc(noTodo)).toEqual({
      code: noTodo,
      removedRules: 0,
      strippedComments: 0,
    });

    const noStyle = '<template><div /></template>';
    expect(stripEmptyTodoRulesInSfc(noStyle)).toEqual({
      code: noStyle,
      removedRules: 0,
      strippedComments: 0,
    });

    expect(stripEmptyTodoRulesInSfc('')).toEqual({
      code: '',
      removedRules: 0,
      strippedComments: 0,
    });
    expect(stripEmptyTodoRulesInSfc(null as unknown as string)).toEqual({
      code: null,
      removedRules: 0,
      strippedComments: 0,
    });
  });

  it('style 段之外的内容（模板 / script）逐字保留', () => {
    const tpl =
      '<template>\n  <div class="c-x-root">{{ n }}</div>\n</template>\n' +
      '<script setup>\nconst n = 1\n</script>';
    const code = `${tpl}\n<style scoped>\n.c-x-root {\n  /* TODO: 补充样式 */\n}\n</style>\n`;
    const r = stripEmptyTodoRulesInSfc(code);
    expect(r.removedRules).toBe(1);
    expect(r.code.startsWith(tpl)).toBe(true);
    expect(r.code).toContain('const n = 1');
  });

  // ── P1-1 缺陷修复回归锁（旧 stripStyleTodoPlaceholders 在这四类上均有误）──

  it('⭐ P1-1-①：遍历**全部** `<style>` 块（旧实现只取第一块 ⇒ 第二块占位永不清）', () => {
    const code =
      '<template><div class="c-x-root" /></template>\n' +
      '<style scoped>\n.c-x-a {\n  /* TODO: 补充样式 */\n}\n</style>\n' +
      '<style lang="less">\n.c-x-b {\n  /* TODO: 请根据设计稿补充样式 */\n}\n</style>\n';
    const r = stripEmptyTodoRulesInSfc(code);
    expect(r.removedRules).toBe(2);
    expect(r.code).not.toContain('c-x-a');
    expect(r.code).not.toContain('c-x-b');
    expect(r.code).not.toContain('TODO');
    expect(r.code).toContain('<style scoped>');
    expect(r.code).toContain('<style lang="less">');
  });

  it('P1-1-②：多选择器 `.a, .b {}` 空壳 → 整条删除，不留悬挂逗号', () => {
    const code = sfc(`.c-x-a,
.c-x-b {
  /* TODO: 补充样式 */
}
.c-x-c {
  color: red;
}`);
    const r = stripEmptyTodoRulesInSfc(code);
    expect(r.removedRules).toBe(1);
    expect(r.code).not.toContain('c-x-a');
    expect(r.code).not.toContain('c-x-b');
    expect(r.code).toContain('.c-x-c {');
    expect(r.code).not.toMatch(/c-x-a\s*,/);
  });

  it('P1-1-②：`::v-deep .a {}` 与元素选择器 `div {}` 空壳 → 整条删除', () => {
    const code = sfc(`::v-deep .c-x-a {
  /* TODO: 补充样式 */
}
div {
  /* TODO: 补充样式 */
}
.c-x-c {
  color: red;
}`);
    const r = stripEmptyTodoRulesInSfc(code);
    expect(r.removedRules).toBe(2);
    expect(r.code).not.toContain('v-deep');
    expect(r.code).not.toContain('div {');
    expect(r.code).toContain('.c-x-c {');
  });

  it('P1-1-②：中文类名不再漏清（判定不依赖类名字符集）', () => {
    const code = sfc(`.c-x-默认 {
  /* TODO: 补充样式 */
}
.c-x-keep {
  color: red;
}`);
    const r = stripEmptyTodoRulesInSfc(code);
    expect(r.removedRules).toBe(1);
    expect(r.code).not.toContain('默认');
    expect(r.code).toContain('.c-x-keep');
  });

  it('P1-1-④：业务性 TODO 注释不误伤（文案护栏：只认两种已知占位文案）', () => {
    const code = sfc(`.c-x-a {
  /* TODO: 待产品确认 */
}`);
    const r = stripEmptyTodoRulesInSfc(code);
    expect(r.removedRules + r.strippedComments).toBe(0);
    expect(r.code).toBe(code);
  });

  it('P1-1-③：多块同轮清扫 + 收敛幂等（不虚增计数）', () => {
    const code = sfc(`.a {
  /* TODO: 补充样式 */
}
.b {
  /* TODO: 补充样式 */
}
.c {
  display: flex;
  /* TODO: 补充样式 */
}`);
    const once = stripEmptyTodoRulesInSfc(code);
    expect(once.removedRules).toBe(2);
    expect(once.strippedComments).toBe(1);
    const twice = stripEmptyTodoRulesInSfc(once.code);
    expect(twice.removedRules + twice.strippedComments).toBe(0);
    expect(twice.code).toBe(once.code);
  });
});

describe('削源断言：P-12a 不得复活（评审 §8.2 削源 / §8.4 步骤 4）', () => {
  it('post-process 不再导出 validateDynamicClassStyles', () => {
    expect((postProcess as Record<string, unknown>).validateDynamicClassStyles).toBeUndefined();
  });

  it('BUILTIN_RULE_IDS 不含 validate-dynamic-class-styles', () => {
    expect(BUILTIN_RULE_IDS).not.toContain('validate-dynamic-class-styles');
  });

  it('旧函数 stripStyleTodoPlaceholders 不得复活（P1-1 已删除，统一走 stripEmptyTodoRulesInSfc）', () => {
    expect(
      (codeValidatorModule as unknown as Record<string, unknown>).stripStyleTodoPlaceholders,
    ).toBeUndefined();
  });
});

/**
 * P0-2 削源彻底化：`common.less` 侧的空壳占位清扫（复审 §2 P0-2 / §7 第 2 项）。
 * 与 `.vue` 侧的分工：`stripEmptyTodoRulesInSfc` 负责从 SFC 里切出 `<style>` 体再调本函数；
 * 本函数面向任意 CSS/LESS 文本，按花括号平衡取最内层块 ⇒ 多选择器/中文类名/嵌套都不再漏清或误伤。
 */
describe('stripEmptyTodoRules（P0-2：common.less 侧空壳占位后置清扫）', () => {
  const FB = '/* TODO: 请根据设计稿补充样式 */';

  it('零声明空壳 → 整条规则删除（含选择器），其它规则零改动', () => {
    const css = `.c-x-empty {\n  ${FB}\n}\n\n.c-x-keep {\n  color: red;\n}\n`;
    const r = stripEmptyTodoRules(css);
    expect(r.removedRules).toBe(1);
    expect(r.code).not.toContain('c-x-empty');
    expect(r.code).toContain('.c-x-keep');
    expect(r.code).toContain('color: red');
  });

  it('⭐ 多选择器 `.a, .b {}` → 整条删除，不留悬挂逗号、不吞并后续规则', () => {
    const css = `.c-x-a,\n.c-x-b {\n  ${FB}\n}\n\n.c-x-c {\n  color: red;\n}\n`;
    const r = stripEmptyTodoRules(css);
    expect(r.removedRules).toBe(1);
    expect(r.code).not.toContain('c-x-a');
    expect(r.code).not.toContain('c-x-b');
    expect(r.code).toContain('.c-x-c {');
    // 后续规则不得被并入上一选择器表（旧实现在此会产出 `.c-x-a,\n.c-x-c {`）
    expect(r.code).not.toMatch(/c-x-a\s*,/);
  });

  it('`::v-deep .a {}` → 整条删除，不留悬挂组合符', () => {
    const css = `::v-deep .c-x-a {\n  ${FB}\n}\n\n.c-x-c {\n  color: red;\n}\n`;
    const r = stripEmptyTodoRules(css);
    expect(r.removedRules).toBe(1);
    expect(r.code).not.toContain('v-deep');
    expect(r.code).toContain('.c-x-c {');
  });

  it('中文类名不再漏清（判定不依赖类名字符集）', () => {
    const css = `.c-x-默认 {\n  ${FB}\n}\n`;
    const r = stripEmptyTodoRules(css);
    expect(r.removedRules).toBe(1);
    expect(r.code).not.toContain('默认');
  });

  it('已被事实填上的块 → 只去注释、保留声明（rule⑤ 注入成果不得丢）', () => {
    const css = `.c-x-card {\n  ${FB}\n  display: flex;\n  flex-direction: row;\n}\n`;
    const r = stripEmptyTodoRules(css);
    expect(r.removedRules).toBe(0);
    expect(r.strippedComments).toBe(1);
    expect(r.code).toContain('display: flex');
    expect(r.code).toContain('flex-direction: row');
    expect(r.code).not.toContain('TODO');
  });

  it('嵌套 @media：只删内层空壳，父级与兄弟规则保留', () => {
    const css = `@media (max-width: 750px) {\n  .c-x-in {\n    ${FB}\n  }\n  .c-x-sib {\n    color: red;\n  }\n}\n`;
    const r = stripEmptyTodoRules(css);
    expect(r.removedRules).toBe(1);
    expect(r.code).not.toContain('c-x-in');
    expect(r.code).toContain('@media (max-width: 750px)');
    expect(r.code).toContain('.c-x-sib');
  });

  it('含子块 + 自身占位注释 → 只去注释、保留结构', () => {
    const css = `.c-x-parent {\n  ${FB}\n  .c-x-child {\n    color: red;\n  }\n}\n`;
    const r = stripEmptyTodoRules(css);
    expect(r.removedRules).toBe(0);
    expect(r.strippedComments).toBe(1);
    expect(r.code).toContain('.c-x-parent');
    expect(r.code).toContain('.c-x-child');
  });

  it('业务性 TODO 注释不误伤（文案护栏：只认两种已知占位文案）', () => {
    const css = `.c-x-a {\n  /* TODO: 待产品确认 */\n}\n`;
    expect(stripEmptyTodoRules(css)).toEqual({
      code: css,
      removedRules: 0,
      strippedComments: 0,
    });
  });

  it('幂等 + fail-open（空串 / null / 无命中均原样返回）', () => {
    const css = `.c-x-empty {\n  ${FB}\n}\n\n.c-x-card {\n  ${FB}\n  display: flex;\n}\n`;
    const once = stripEmptyTodoRules(css);
    expect(once.removedRules).toBe(1);
    expect(once.strippedComments).toBe(1);

    const twice = stripEmptyTodoRules(once.code);
    expect(twice.removedRules + twice.strippedComments).toBe(0);
    expect(twice.code).toBe(once.code);

    expect(stripEmptyTodoRules('')).toEqual({ code: '', removedRules: 0, strippedComments: 0 });
    expect(stripEmptyTodoRules(null as unknown as string)).toEqual({
      code: null,
      removedRules: 0,
      strippedComments: 0,
    });
    const plain = '.c-x-a { color: red; }';
    expect(stripEmptyTodoRules(plain)).toEqual({
      code: plain,
      removedRules: 0,
      strippedComments: 0,
    });
  });
});
