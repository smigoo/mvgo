/**
 * 🛡️ P1.5 类名规范化器 · 单测（2026-09-11）
 *
 * 规范化器是「类名单一写入者」，必须运行在 classFacts 采集之前，保证：
 *   ① 布尔方言（is-active）→ `${元素基类}--active`
 *   ② 修饰符类形态与元素基类一致（前缀不混搭）
 *   ③ 保守边界：无基类可依据时**不动**（交门禁报警，不臆造基名）
 */
import {
  pickElementBaseToken,
  normalizeTemplateModifierDialect,
  normalizeStyleModifierDialect,
  normalizeClassNameDialect,
  buildStyleClassIndex,
  planCrossSideBaseAlignment,
  stripAutoFixSection,
} from '../class-dialect-normalizer.js';
import { extractModifierRules } from '../classname-contract.js';

describe('pickElementBaseToken', () => {
  it('优先带实例前缀的长形基类', () => {
    expect(pickElementBaseToken(['c-env-monitor-tab-item', 'c-env-monitor-x5-c-env-monitor-tab-item'])).toBe(
      'c-env-monitor-x5-c-env-monitor-tab-item',
    );
  });

  it('无修饰符候选时返回空（不臆造）', () => {
    expect(pickElementBaseToken(['c-x-item--active', 'is-active'])).toBe('');
  });
});

describe('normalizeTemplateModifierDialect', () => {
  it('R1：布尔方言 is-active → 元素基类 + --active（260ff122/0b95f5cf 形态）', () => {
    const tpl = `<div class="c-demo-784zn8qx-c-demo-tab-item" :class="{ 'is-active': on }">t</div>`;
    const { text, changes } = normalizeTemplateModifierDialect(tpl);
    expect(text).toContain(`'c-demo-784zn8qx-c-demo-tab-item--active'`);
    expect(text).not.toContain('is-active');
    expect(changes.length).toBe(1);
  });

  it('R2：修饰符类形态与基类不一致 → 对齐基类形态（1afdb842 形态）', () => {
    const tpl = `<div class="c-env-x5-c-env-tab-item" :class="{ 'c-env-monitor-tab-item--active': on }">t</div>`;
    const { text } = normalizeTemplateModifierDialect(tpl);
    expect(text).toContain(`'c-env-x5-c-env-tab-item--active'`);
    expect(text).not.toContain(`'c-env-monitor-tab-item--active'`);
  });

  it('静态 class 上的别名同样归一，且原 token 被替换（不残留悬空类）', () => {
    const tpl = `<span class="c-x-item is-active"></span>`;
    const { text } = normalizeTemplateModifierDialect(tpl);
    expect(text).toContain('c-x-item--active');
    expect(text).not.toContain('is-active');
  });

  it('保守：元素上无 c-* 基类 → 不动', () => {
    const tpl = `<div :class="{ 'is-active': on }"></div>`;
    const { text, changes } = normalizeTemplateModifierDialect(tpl);
    expect(text).toBe(tpl);
    expect(changes.length).toBe(0);
  });

  it('已规范的元素零改动（幂等）', () => {
    const tpl = `<div class="c-x-item" :class="{ 'c-x-item--active': on }">t</div>`;
    const { text, changes } = normalizeTemplateModifierDialect(tpl);
    expect(text).toBe(tpl);
    expect(changes.length).toBe(0);
  });
});

describe('normalizeStyleModifierDialect', () => {
  it('R3：.base.is-active → .base--active', () => {
    const css = `.c-device-tab-item.is-active {\n  color: #fff;\n}`;
    const { text } = normalizeStyleModifierDialect(css);
    expect(text).toContain('.c-device-tab-item--active {');
    expect(text).not.toContain('.is-active');
  });

  it('无基类的 .is-active 选择器不动（交门禁 C1）', () => {
    const css = `.is-active {\n  color: #fff;\n}`;
    const { text } = normalizeStyleModifierDialect(css);
    expect(text).toBe(css);
  });

  it('声明行里的 active 字样不被误改', () => {
    const css = `.c-x-item {\n  transition: color 0.2s; /* active state */\n}`;
    const { text } = normalizeStyleModifierDialect(css);
    expect(text).toBe(css);
  });
});

describe('normalizeClassNameDialect（产物级）', () => {
  it('模板 + 样式一起归一；不触碰其它文件', () => {
    const files = {
      'package/components/Tabs.vue': `<template>
  <div class="c-x-item" :class="{ 'is-active': on }">t</div>
</template>
<style lang="less" scoped>
.c-x-item.is-active { color: #fff; }
</style>
`,
      'resources/images/a.png': 'binary',
    };
    const { files: out, changes } = normalizeClassNameDialect(files);
    expect(out['package/components/Tabs.vue']).toContain('c-x-item--active');
    expect(out['package/components/Tabs.vue']).not.toContain('is-active');
    expect(out['resources/images/a.png']).toBe('binary');
    expect(changes.length).toBeGreaterThanOrEqual(2);
  });

  it('带属性 <template class="..."> 也能定位（486ec46 教训）', () => {
    const files = {
      'package/index.vue': `<template class="c-mc-max-1-x">
  <div class="c-x-item" :class="{ 'is-active': on }">t</div>
</template>
<script setup></script>
`,
    };
    const { files: out } = normalizeClassNameDialect(files);
    expect(out['package/index.vue']).toContain('c-x-item--active');
  });
});

/**
 * 🛡️ 刀 12（2026-09-13）：模板基名 ↔ 样式基名跨侧对齐（R4）。
 *
 * 事故 mc-1789305950498-6a45b6f2：模板 `c-device-monitor-tab`(+`--active`)、
 * 样式 `.c-device-monitor-tab-item`(+`--active`) → 门禁 C3（模板修饰符无规则）+
 * C4×7（真实激活态规则无模板使用）+ 兜底 stub 遮告警但设计样式永不生效。
 */
describe('刀 12 · R4 跨侧基名对齐', () => {
  const STYLES = `resources/styles/common.less`;
  const TAB_VUE = `package/components/Tabs.vue`;

  it('主用例：模板 tab(+--active) → 样式 tab-item(+--active)，且不碰表达式/其它属性', () => {
    const files = {
      [TAB_VUE]: `<template>
  <div v-for="item in tabs" :key="item.label" :class="[ 'c-x-tab', { 'c-x-tab--active': activeTab === item.label } ]" @click="activeTab = item.label">
    <span class="c-x-tab-label">{{ item.label }}</span>
  </div>
</template>
`,
      [STYLES]: `.c-x-tab-item {\n  min-height: 40px;\n}\n\n.c-x-tab-item--active {\n  background: rgba(25, 144, 255, 0.15);\n}\n`,
    };
    const { files: out, changes } = normalizeClassNameDialect(files);
    const vue = out[TAB_VUE];
    expect(vue).toContain(`'c-x-tab-item'`);
    expect(vue).toContain(`'c-x-tab-item--active'`);
    expect(vue).not.toContain(`'c-x-tab'`);
    // 表达式与其它属性一字未动
    expect(vue).toContain(`activeTab === item.label`);
    expect(vue).toContain(`:key="item.label"`);
    expect(vue).toContain(`@click="activeTab = item.label"`);
    // 无锚点的兄弟元素（c-x-tab-label）不动 —— 不臆造对应关系
    expect(vue).toContain(`c-x-tab-label`);
    expect(changes.filter((c) => c.rule === 'R4').length).toBe(2);
    // 样式侧不改写
    expect(out[STYLES]).toContain('.c-x-tab-item--active {');
  });

  it('已对齐（样式侧已有同名基类）→ 零改动（幂等）', () => {
    const files = {
      [TAB_VUE]: `<template>\n  <div class="c-x-tab-item" :class="{ 'c-x-tab-item--active': on }">t</div>\n</template>\n`,
      [STYLES]: `.c-x-tab-item {}\n.c-x-tab-item--active {}\n`,
    };
    const { files: out, changes } = normalizeClassNameDialect(files);
    expect(out[TAB_VUE]).toBe(files[TAB_VUE]);
    expect(changes.length).toBe(0);
  });

  it('无修饰符锚点 → 不动（裸基类缺失交门禁，不臆造）', () => {
    const files = {
      [TAB_VUE]: `<template>\n  <div class="c-x-tab">t</div>\n</template>\n`,
      [STYLES]: `.c-x-tab-item {}\n`,
    };
    const { files: out } = normalizeClassNameDialect(files);
    expect(out[TAB_VUE]).toContain(`class="c-x-tab"`);
  });

  it('候选歧义（多个前缀扩展基名都带该修饰符）→ 不动', () => {
    const files = {
      [TAB_VUE]: `<template>\n  <div class="c-x-tab" :class="{ 'c-x-tab--active': on }">t</div>\n</template>\n`,
      [STYLES]: `.c-x-tab-item {}\n.c-x-tab-item--active {}\n.c-x-tab-row {}\n.c-x-tab-row--active {}\n`,
    };
    const { files: out, changes } = normalizeClassNameDialect(files);
    expect(out[TAB_VUE]).toBe(files[TAB_VUE]);
    expect(changes.length).toBe(0);
  });

  it('🔴 [自动修复] 兜底段不得当作设计意图（否则对齐永不触发）', () => {
    const files = {
      [TAB_VUE]: `<template>\n  <div class="c-x-tab" :class="{ 'c-x-tab--active': on }">t</div>\n</template>\n`,
      [STYLES]:
        `.c-x-tab-item {\n  min-height: 40px;\n}\n\n.c-x-tab-item--active {\n  background: #123;\n}\n\n` +
        `/* === [自动修复] v3.5 模板驱动 fallback 规则 === */\n\n` +
        `/* [自动修复] 模板 class .c-x-tab → 匹配元素 section-tabs */\n\n` +
        `.c-x-tab {\n  display: flex;\n}\n\n` +
        `.c-x-tab--active {\n  display: flex;\n}\n`,
    };
    const { files: out, changes } = normalizeClassNameDialect(files);
    expect(out[TAB_VUE]).toContain(`'c-x-tab-item--active'`);
    expect(changes.filter((c) => c.rule === 'R4').length).toBe(2);
  });

  it('stripAutoFixSection / buildStyleClassIndex：兜底 stub 按规则块剔除，不整段截断', () => {
    const css = `.c-x-real {\n  min-height: 40px;\n}\n\n/* === [自动修复] v3.5 模板驱动 fallback 规则 === */\n\n/* [自动修复] 模板 class .c-x-stub → 匹配元素 n1 */\n.c-x-stub {\n  display: flex;\n}\n\n.c-x-after {\n  color: #fff;\n}\n`;
    const stripped = stripAutoFixSection(css);
    expect(stripped).toContain('.c-x-real');
    expect(stripped).not.toContain('.c-x-stub');
    // 兜底段之后的合法规则必须保留（编译产物 index.css 里兜底段是分散展开的）
    expect(stripped).toContain('.c-x-after');
    const idx = buildStyleClassIndex({ [STYLES]: css });
    expect(idx.exact.has('c-x-real')).toBe(true);
    expect(idx.exact.has('c-x-after')).toBe(true);
    expect(idx.exact.has('c-x-stub')).toBe(false);
    expect(idx.bases.has('c-x-real')).toBe(true);
  });

  it('stripAutoFixSection：标记后没有自身规则块时只删标记，不吞后面的规则', () => {
    // 现实形态：某条标记的 stub 未生成，紧随其后的是**下一条标记**（不是规则块）
    const css = `.c-x-a { color: red; }\n/* [自动修复] 模板 class .c-x-b → 匹配元素 n9 */\n\n/* [自动修复] 模板 class .c-x-c → 匹配元素 n9 */\n.c-x-c { display: flex; }\n`;
    const stripped = stripAutoFixSection(css);
    expect(stripped).toContain('.c-x-a { color: red; }');
    expect(stripped).not.toContain('[自动修复]');
    expect(stripped).not.toContain('.c-x-c');
  });

  it('buildStyleClassIndex：同名 .less 存在时，编译产物 .css 不入索引（stub 剔除不可靠）', () => {
    const files = {
      [TAB_VUE]: `<template>\n  <div class="c-x-tab" :class="{ 'c-x-tab--active': on }">t</div>\n</template>\n`,
      'resources/styles/common.less': `.c-x-tab-item {}\n.c-x-tab-item--active {}\n`,
      'resources/styles/index.less': `@import './common.less';\n`,
      // 编译产物：兜底 stub 经 LESS 展开后带不上标记 → 若入索引会误判「已对齐」
      'resources/styles/index.css': `.c-x-tab-item {}\n.c-x-tab-item--active {}\n.c-x-tab { display: flex; }\n`,
    };
    const idx = buildStyleClassIndex(files);
    expect(idx.exact.has('c-x-tab')).toBe(false);
    const { files: out } = normalizeClassNameDialect(files);
    expect(out[TAB_VUE]).toContain(`'c-x-tab-item--active'`);
  });

  it('planCrossSideBaseAlignment：无样式索引时 fail-open（不改）', () => {
    expect(planCrossSideBaseAlignment(['c-x-tab', 'c-x-tab--active'], null)).toEqual([]);
  });

  it('🔴 刀 12b：对象字面量的「值位置字面量」不得被当类名改写（旧实现改坏表达式）', () => {
    const tpl = `<template>\n  <div class="c-x-a" :class="{ 'c-x-a--selected': cur === 'active' }">t</div>\n</template>\n`;
    const { text, changes } = normalizeTemplateModifierDialect(tpl);
    expect(text).toBe(tpl); // `'active'` 是比较值，必须原样保留
    expect(changes.length).toBe(0);
  });
});

/**
 * 🛡️ 刀 13（2026-09-13）：样式侧伪类函数参数隔离。
 *
 * 事故 mc-1789308308127-356073d1（设备监测）：
 *   `.c-device-monitor-switch-item:not(.is-active) { … }`
 * 旧 R3 把 `:not(…)` 里的 `is-active` 当「本元素布尔别名」→ `__DROP__` 掏空参数 →
 * 产出 `.c-device-monitor-switch-item--active:not() {` —— **非法 LESS**
 * （less: `Missing closing ')'`）→ STYLE_SYNTAX → P1-4 坏文件隔离降级 →
 * `SwitchSection.vue` 从产物消失 → COMP-001「模块组装缺失」BLOCK ×3 轮不收敛。
 */
describe('刀 13 · 伪类函数参数隔离（:not() 不得被掏空）', () => {
  const SWITCH_CSS = [
    '.c-x-switch-item.is-active {',
    '  color: #fff;',
    '}',
    '',
    '.c-x-switch-item:not(.is-active) {',
    '  color: #333;',
    '}',
  ].join('\n');

  it('🔴 `:not(.is-active)` 整行不动（参数内类名不是本元素的类）', () => {
    const { text } = normalizeStyleModifierDialect(SWITCH_CSS);
    expect(text).toContain('.c-x-switch-item:not(.is-active) {');
    expect(text).not.toContain(':not()');
  });

  it('同文件里的 `.base.is-active`（主体）仍正常归一', () => {
    const { text, changes } = normalizeStyleModifierDialect(SWITCH_CSS);
    expect(text).toContain('.c-x-switch-item--active {');
    expect(text).not.toContain('.c-x-switch-item.is-active');
    expect(changes.map((c) => c.to)).toEqual(['c-x-switch-item--active']);
  });

  it(':is() / :where() / :has() 参数同样受保护', () => {
    for (const fn of ['is', 'where', 'has']) {
      const css = `.c-x-a:${fn}(.is-active) { color: red; }`;
      expect(normalizeStyleModifierDialect(css).text).toBe(css);
    }
  });

  it('主体与参数同名别名并存 → 整行跳过（逐 token 替换无法区分位置）', () => {
    const css = '.c-x-a.is-active:not(.is-active) { color: red; }';
    const { text, changes } = normalizeStyleModifierDialect(css);
    expect(text).toBe(css);
    expect(changes.length).toBe(0);
  });

  it('端到端：归一前后括号计数不变（永不产出非法 LESS）', () => {
    const { text } = normalizeStyleModifierDialect(SWITCH_CSS);
    const leftParen = (s: string) => s.split('(').length - 1;
    const rightParen = (s: string) => s.split(')').length - 1;
    expect(leftParen(text)).toBe(leftParen(SWITCH_CSS));
    expect(rightParen(text)).toBe(rightParen(SWITCH_CSS));
  });

  it('产物级：`.vue` scoped 样式块走同一保护（复测产物形态回归）', () => {
    const vue = [
      '<template>',
      '  <div class="c-x-switch-item" :class="{ \'c-x-switch-item--active\': on }">s</div>',
      '</template>',
      '<style lang="less" scoped>',
      "@import '../../resources/styles/index.less';",
      '.c-x-switch-item:not(.is-active) {',
      '  color: #333;',
      '}',
      '</style>',
    ].join('\n');
    const { files: out } = normalizeClassNameDialect({ 'package/components/SwitchSection.vue': vue });
    const style = out['package/components/SwitchSection.vue'];
    expect(style).toContain('.c-x-switch-item:not(.is-active) {');
    expect(style).not.toContain(':not()');
  });
});

/**
 * 🛡️ 刀 13b（2026-09-13）：嵌套 `&` 形态的样式侧归一。
 *
 * 事故 mc-1789308308127-356073d1 的 `common.less`：
 *   `.c-device-monitor-switch-item { … &.is-active { … } &:not(.is-active) { … } }`
 * 行内只有 `&` + 别名，基类在**父块** → 平铺逻辑看不见 → 模板已归一为 `--active`、
 * 样式仍 `&.is-active` → 规则永不命中（主题变量版激活态成死样式）+ C4 报 12 项。
 */
describe('刀 13b · 嵌套 & 形态归一（父选择器栈）', () => {
  const NESTED_LESS = [
    '.c-x-switch {',
    '  display: flex;',
    '}',
    '',
    '.c-x-switch-item {',
    '  flex: 1;',
    '',
    '  &:hover {',
    '    transform: translateY(-2px);',
    '  }',
    '',
    '  &.is-active {',
    '    .c-x-switch-title {',
    '      color: var(--colorCardBg, #ffffff);',
    '    }',
    '  }',
    '',
    '  &:not(.is-active) {',
    '    .c-x-switch-title {',
    '      color: #333333;',
    '    }',
    '  }',
    '}',
  ].join('\n');

  it('🔴 `&.is-active` → `&--active`（规则重新命中模板）', () => {
    const { text, changes } = normalizeStyleModifierDialect(NESTED_LESS);
    expect(text).toContain('&--active {');
    expect(text).not.toContain('&.is-active');
    expect(changes).toContainEqual({ from: 'is-active', to: 'c-x-switch-item--active' });
  });

  it('🔴 `&:not(.is-active)` → `&:not(.c-x-switch-item--active)`（参数用绝对类名）', () => {
    const { text } = normalizeStyleModifierDialect(NESTED_LESS);
    expect(text).toContain('&:not(.c-x-switch-item--active) {');
    expect(text).not.toContain(':not(.is-active)');
  });

  it('`&:hover` 等非修饰符伪类不受影响（零误伤）', () => {
    const { text } = normalizeStyleModifierDialect(NESTED_LESS);
    expect(text).toContain('&:hover {');
  });

  it('端到端：括号计数不变 + 无 c-* 父基类时不动', () => {
    const { text } = normalizeStyleModifierDialect(NESTED_LESS);
    const lp = (s: string) => s.split('(').length - 1;
    expect(lp(text)).toBe(lp(NESTED_LESS));
    // 父块没有 c-* 基类 → 保守不动（不臆造基名）
    const noBase = '.wrapper {\n  &.is-active { color: red; }\n}';
    expect(normalizeStyleModifierDialect(noBase).text).toBe(noBase);
    expect(normalizeStyleModifierDialect(noBase).changes.length).toBe(0);
  });

  it('契约层：嵌套归一后仍能被提取为「已对齐」规则（不制造新盲区）', () => {
    // `&--active` 选择器里没有 `.` token —— 契约层必须靠父选择器栈还原才看得见
    const { text } = normalizeStyleModifierDialect(NESTED_LESS);
    const rules = extractModifierRules(text);
    const active = rules.find((r) => r.baseToken === 'c-x-switch-item');
    expect(active).toBeTruthy();
    expect(active!.modKey).toContain('--active');
  });
});
