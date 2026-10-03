import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  validateVueSfc,
  validateVueSfcDirectory,
  extractLessGlobalVars,
  findEntrypointCircularImports,
} from './sfc-syntax-validation.js';

describe('SFC validation gate', () => {
  it('rejects the comma-semicolon regression', () => {
    const source = `<script setup>\nconst option = {\n  trigger: 'axis',;\n}\n</script>\n<template><div /></template>`;
    const result = validateVueSfc(source, 'MonitorTrend.vue');

    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('script');
  });

  it('accepts a valid script, template, and style', () => {
    const source = `<script setup>\nconst option = { trigger: 'axis' }\n</script>\n<template><div class="panel" /></template>\n<style lang="less">\n.panel { color: red; }\n</style>`;
    const result = validateVueSfc(source, 'Valid.vue');

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('defers local Less imports while validating an in-memory SFC', () => {
    const source = `<template><div class="panel" /></template>
<style scoped lang="less">
@import '../resources/styles/index.less';
.panel { color: red; }
</style>`;

    expect(validateVueSfc(source, 'package/index.vue')).toEqual({ valid: true, errors: [] });
  });

  // 🛡️ mc-max-1788258252381-9168ed08 实锤（2026-09-01）：剥离相对 @import 连带剥掉
  // theme-vars.less 的变量定义 → 子组件合法引用 calc(@fontSize * 1.14) 报
  // `variable @fontSize is undefined` → STYLE_SYNTAX → P1-4 误杀 4/5 个健康子组件，
  // 任务却「成功」完成（只剩 FlowPrediction，因为它不引用主题变量）。
  describe('in-memory theme variable passthrough (lessGlobalVars)', () => {
    const THEME_VARS_LESS = `// 微码组件主题变量定义
.common() {
  @fontSize: 14px;
  @border-radius-base: 8px;
}
.theme-light() {
  @color-primary: rgba(24,144,255,1);
}
.theme-dark() {
  @color-primary: rgba(24,144,255,1);
}`;
    const SUB_COMPONENT = (expr: string) => `<template><div class="c-sub-title" /></template>
<style scoped lang="less">
@import '../../resources/styles/index.less';
.c-sub-title { font-size: ${expr}; }
</style>`;

    it('事故复刻：不传 lessGlobalVars → 剥离 @import 后 @fontSize undefined（既有假阳性）', () => {
      const result = validateVueSfc(
        SUB_COMPONENT('calc(@fontSize * 1.14)'),
        'package/components/DailyTotalFlow.vue',
      );
      expect(result.valid).toBe(false);
      expect(result.errors.join('\n')).toContain('@fontSize is undefined');
    });

    it('治本：传 lessGlobalVars → 主题变量引用正常编译（产物零改写）', () => {
      const files = {
        'resources/styles/themes/theme-vars.less': THEME_VARS_LESS,
        'resources/styles/index.less':
          "@import './themes/theme-vars.less';\n.common();\n.theme-light();\n@import (multiple) './common.less';",
        'resources/styles/common.less': '.c-root { color: red; }',
      };
      const vars = extractLessGlobalVars(files);
      // 顶层 mixin 定义体内的变量（.common()/.theme-light()）必须被收集：
      // 标准 index.less 在根作用域调用这些 mixin，mixin 闭包变量对根作用域可见
      expect(vars).toMatchObject({ fontSize: '14px', 'border-radius-base': '8px', 'color-primary': 'rgba(24,144,255,1)' });

      const result = validateVueSfc(
        SUB_COMPONENT('calc(@fontSize * 1.14)'),
        'package/components/DailyTotalFlow.vue',
        { lessGlobalVars: vars },
      );
      expect(result).toEqual({ valid: true, errors: [] });
    });

    it('extractLessGlobalVars：只收顶层声明与顶层 mixin 体，嵌套选择器内变量不收', () => {
      const files = {
        'resources/styles/common.less': `@rootVar: 1px;
.topMixin() {
  @mixinVar: 2px;
}
.c-nested {
  @nestedOnly: 3px;
  color: red;
}`,
      };
      expect(extractLessGlobalVars(files)).toEqual({ rootVar: '1px', mixinVar: '2px' });
    });

    it('extractLessGlobalVars：数组形态文件集 / 非 less 文件忽略 / 注释行不误收', () => {
      const vars = extractLessGlobalVars([
        { path: 'resources/styles/themes/theme-vars.less', content: '.common() {\n  @a: 1px; // trailing comment\n}' },
        { path: 'package/index.vue', content: '<template><div/></template>' },
      ]);
      expect(vars).toEqual({ a: '1px' });
    });

    it('负面对照：真臆造变量（文件集没定义过）传 globalVars 后仍报 undefined', () => {
      const result = validateVueSfc(
        SUB_COMPONENT('calc(@inventedVar * 2)'),
        'package/components/X.vue',
        { lessGlobalVars: extractLessGlobalVars({ 'resources/styles/themes/theme-vars.less': THEME_VARS_LESS }) },
      );
      expect(result.valid).toBe(false);
      expect(result.errors.join('\n')).toContain('@inventedVar is undefined');
    });

    it('绝对路径（已落盘）模式不受 lessGlobalVars 影响：完整编译真实 import 链', async () => {
      const root = await mkdtemp(join(tmpdir(), 'mvgo-sfc-globalvars-'));
      try {
        await mkdir(join(root, 'package', 'components'), { recursive: true });
        await mkdir(join(root, 'resources', 'styles', 'themes'), { recursive: true });
        await writeFile(join(root, 'resources', 'styles', 'themes', 'theme-vars.less'), THEME_VARS_LESS, 'utf8');
        await writeFile(
          join(root, 'resources', 'styles', 'index.less'),
          "@import './themes/theme-vars.less';\n.common();\n.theme-light();",
          'utf8',
        );
        const file = join(root, 'package', 'components', 'Sub.vue');
        await writeFile(
          file,
          `<template><div class="c-sub-title" /></template>
<style scoped lang="less">
@import '../../resources/styles/index.less';
.c-sub-title { font-size: calc(@fontSize * 1.14); }
</style>`,
          'utf8',
        );
        // 绝对路径模式走真实 import 链（.common() 根作用域调用 → mixin 变量可见）→ 天然通过
        expect(validateVueSfcDirectory(join(root, 'package'))).toEqual([]);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  });

  it('resolves local Less imports when validating written files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mvgo-sfc-less-import-'));
    try {
      await mkdir(join(root, 'package'), { recursive: true });
      await mkdir(join(root, 'resources', 'styles'), { recursive: true });
      await writeFile(join(root, 'resources', 'styles', 'index.less'), '.panel { color: red; }', 'utf8');
      const file = join(root, 'package', 'index.vue');
      await writeFile(
        file,
        `<template><div class="panel" /></template><style scoped lang="less">@import '../resources/styles/index.less';</style>`,
        'utf8',
      );

      expect(validateVueSfcDirectory(join(root, 'package'))).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('recursively validates every Vue file in a package directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mvgo-sfc-gate-'));
    try {
      await mkdir(join(root, 'components'), { recursive: true });
      await writeFile(
        join(root, 'index.vue'),
        '<template><div /></template>',
        'utf8',
      );
      await writeFile(
        join(root, 'components', 'Broken.vue'),
        `<script setup>const x = { value: 1,; }</script><template><div /></template>`,
        'utf8',
      );

      const errors = validateVueSfcDirectory(root);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.join('\n')).toContain('Broken.vue');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

// 🛡️ 2026-10-03：子组件 import 入口 index.vue（mc-max-1790946087204-fbb7781f 实锤，
// 预览「正在加载组件...」永卡 + console 零报错，vue3-sfc-loader 模块悬挂不 throw）。
describe('findEntrypointCircularImports', () => {
  const BAD_SFC = [
    '<template>',
    '  <a-button @click="handleSave">保存</a-button>',
    '</template>',
    '',
    '<script setup>',
    "import { runtimeBuilder } from '../index.vue'",
    '',
    'const handleSave = () => {};',
    '</script>',
  ].join('\n');

  it('rejects the fbb7781f circular-entrypoint regression (named import)', () => {
    const result = validateVueSfc(BAD_SFC, 'package/components/HeaderSection2.vue');

    expect(result.valid).toBe(false);
    const hit = result.errors.find((e) => e.includes('禁止 import 组件入口'));
    expect(hit).toBeDefined();
    expect(hit).toContain("'../index.vue'");
    expect(hit).toContain(':6:1');
  });

  it('reports the hit with line number via the standalone probe', () => {
    const probe = findEntrypointCircularImports(BAD_SFC, 'package/components/HeaderSection2.vue');

    expect(probe.hits).toEqual([{ spec: '../index.vue', line: 6 }]);
    expect(probe.errors).toHaveLength(1);
    expect(probe.errors[0]).toContain('$mcComponentBuilder()');
  });

  it('rejects bare and deep-relative entrypoint imports', () => {
    const bare = `<script setup>\nimport '../index.vue'\n</script>\n<template><div /></template>`;
    const deep = `<script setup>\nimport x from '../../index.vue'\n</script>\n<template><div /></template>`;

    expect(findEntrypointCircularImports(bare, 'A.vue').hits).toEqual([
      { spec: '../index.vue', line: 2 },
    ]);
    expect(findEntrypointCircularImports(deep, 'A.vue').hits).toEqual([
      { spec: '../../index.vue', line: 2 },
    ]);
  });

  it('accepts the healthy $mcComponentBuilder pattern (c-b-83885ba4 style)', () => {
    const healthy = `<script setup>
const { runtimeBuilder } = $mcComponentBuilder();
const handleSave = () => {};
</script>
<template><div /></template>`;
    const probe = findEntrypointCircularImports(healthy, 'package/components/HeaderSection2.vue');
    const result = validateVueSfc(healthy, 'package/components/HeaderSection2.vue');

    expect(probe.hits).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('does not flag subdirectory barrels or normal relative imports', () => {
    const barrel = `<script setup>\nimport { x } from './components/index.vue'\n</script>\n<template><div /></template>`;
    const normal = `<script setup>\nimport X from '../components/X.vue'\nimport { ref } from 'vue'\n</script>\n<template><div /></template>`;

    expect(findEntrypointCircularImports(barrel, 'A.vue').hits).toEqual([]);
    expect(findEntrypointCircularImports(normal, 'A.vue').hits).toEqual([]);
  });
});
