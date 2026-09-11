/**
 * 🛡️ R2-2：artifact-invariants 六条产物不变量单测（2026-09-11）
 * 用例直接复刻历史事故形态：46859f40 悬空标签 / cfb53488 双 tabs+defineAsyncComponent /
 * 2aa25837 内容根塌陷 / base-panel 任务指纹类。
 */
import { runArtifactInvariants } from '../artifact-invariants.js';

const idx = (body: string, script = '') =>
  `<template>\n  <base-panel panelKey="default-panel">\n${body}\n  </base-panel>\n</template>\n<script setup>\n${script}\n</script>\n`;

const ROOT_CLS = 'c-env-monitor-xh8jdcpy-c-env-monitor-slot-con';

describe('I1/I4 内容根高度与形态锚定', () => {
  it('内容根仅 flex 填充 → I1 error（2aa25837 塌陷形态）', () => {
    const files = {
      'package/index.vue': idx(`    <div class="${ROOT_CLS}">\n      <Main />\n    </div>`),
      'resources/styles/common.less': `.${ROOT_CLS} { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; }`,
    };
    const r = runArtifactInvariants(files);
    expect(r.passed).toBe(false);
    expect(r.violations.find((v) => v.id === 'I1')?.severity).toBe('error');
  });

  it('height:100% 但缺 width 且无 aspect-ratio → 仅 I4 error', () => {
    const files = {
      'package/index.vue': idx(`    <div class="${ROOT_CLS}">\n      <Main />\n    </div>`),
      'resources/styles/common.less': `.${ROOT_CLS} { display: flex; height: 100%; }`,
    };
    const r = runArtifactInvariants(files);
    expect(r.violations.find((v) => v.id === 'I1')).toBeUndefined();
    expect(r.violations.find((v) => v.id === 'I4')?.severity).toBe('error');
  });

  it('height:100% + aspect-ratio → I1/I4 全过', () => {
    const files = {
      'package/index.vue': idx(`    <div class="${ROOT_CLS}">\n      <Main />\n    </div>`),
      'resources/styles/common.less': `.${ROOT_CLS} { height: 100%; aspect-ratio: 425 / 807; }`,
    };
    const r = runArtifactInvariants(files);
    expect(r.violations.filter((v) => v.id === 'I1' || v.id === 'I4')).toEqual([]);
  });
});

describe('I2 标签↔绑定↔文件三向对齐', () => {
  const LESS = `.${ROOT_CLS} { height: 100%; aspect-ratio: 4 / 8; }`;

  it('defineAsyncComponent 动态形态 → 正常引用不算违规（cfb53488 形态）', () => {
    const files = {
      'package/index.vue': idx(
        `    <div class="${ROOT_CLS}">\n      <TabsSection />\n    </div>`,
        `import { defineAsyncComponent } from 'vue'\nconst TabsSection = defineAsyncComponent(() => import('./components/TabsSection.vue'))`,
      ),
      'package/components/TabsSection.vue': '<template><div/></template>',
      'resources/styles/common.less': LESS,
    };
    const r = runArtifactInvariants(files);
    expect(r.violations.filter((v) => v.id === 'I2' && v.severity === 'error')).toEqual([]);
  });

  it('模板标签无绑定无文件 → I2 error（46859f40 悬空标签形态）', () => {
    const files = {
      'package/index.vue': idx(`    <div class="${ROOT_CLS}">\n      <GhostSection />\n    </div>`),
      'resources/styles/common.less': LESS,
    };
    const r = runArtifactInvariants(files);
    const v = r.violations.find((x) => x.id === 'I2' && x.severity === 'error');
    expect(v?.message).toContain('GhostSection');
  });

  it('插槽内标签同样是真实引用（HeaderSection 在 #header-right 内不算死代码）', () => {
    const files = {
      'package/index.vue':
        `<template>\n  <base-panel panelKey="p">\n    <template #header-right>\n      <HeaderSection />\n    </template>\n    <div class="${ROOT_CLS}"></div>\n  </base-panel>\n</template>\n<script setup>\nconst HeaderSection = defineAsyncComponent(() => import('./components/HeaderSection.vue'))\n</script>\n`,
      'package/components/HeaderSection.vue': '<template><div/></template>',
      'resources/styles/common.less': LESS,
    };
    const r = runArtifactInvariants(files);
    expect(r.violations.filter((v) => v.id === 'I2')).toEqual([]);
  });

  it('文件存在但无任何 .vue 引用 → I2 warn（死代码）', () => {
    const files = {
      'package/index.vue': idx(`    <div class="${ROOT_CLS}"></div>`),
      'package/components/DeadSection.vue': '<template><div/></template>',
      'resources/styles/common.less': LESS,
    };
    const r = runArtifactInvariants(files);
    const v = r.violations.find((x) => x.id === 'I2' && x.file?.includes('DeadSection'));
    expect(v?.severity).toBe('warn');
  });
});

describe('I3 tabs 唯一性', () => {
  const LESS = `.${ROOT_CLS} { height: 100%; aspect-ratio: 4 / 8; }`;

  it('两个 tabs 类标签 → error（cfb53488 双 tabs 形态）', () => {
    const script = `import { defineAsyncComponent } from 'vue'\nconst TabsSection = defineAsyncComponent(() => import('./components/TabsSection.vue'))\nconst TabsSection2 = defineAsyncComponent(() => import('./components/TabsSection2.vue'))`;
    const files = {
      'package/index.vue': idx(
        `    <div class="${ROOT_CLS}">\n      <TabsSection />\n      <TabsSection2 />\n    </div>`,
        script,
      ),
      'package/components/TabsSection.vue': '<template><div/></template>',
      'package/components/TabsSection2.vue': '<template><div/></template>',
      'resources/styles/common.less': LESS,
    };
    const r = runArtifactInvariants(files);
    expect(r.violations.find((v) => v.id === 'I3')?.severity).toBe('error');
  });

  it('单个 tabs 标签 → 不违规', () => {
    const script = `import { defineAsyncComponent } from 'vue'\nconst TabsSection = defineAsyncComponent(() => import('./components/TabsSection.vue'))`;
    const files = {
      'package/index.vue': idx(
        `    <div class="${ROOT_CLS}">\n      <TabsSection />\n    </div>`,
        script,
      ),
      'package/components/TabsSection.vue': '<template><div/></template>',
      'resources/styles/common.less': LESS,
    };
    const r = runArtifactInvariants(files);
    expect(r.violations.find((v) => v.id === 'I3')).toBeUndefined();
  });
});

describe('I5 类名对齐 / I6 资源挂载', () => {
  it('base-panel 任务指纹类不报违规', () => {
    const files = {
      'package/index.vue':
        `<template>\n  <base-panel class="c-mc-max-1789066823799-cfb53488" panelKey="p">\n    <div class="${ROOT_CLS}"></div>\n  </base-panel>\n</template>\n<script setup></script>\n`,
      'resources/styles/common.less': `.${ROOT_CLS} { height: 100%; aspect-ratio: 4 / 8; }`,
    };
    const r = runArtifactInvariants(files);
    expect(r.violations.find((v) => v.id === 'I5')).toBeUndefined();
  });

  it('模板类无任何样式源声明 → I5 warn', () => {
    const files = {
      'package/index.vue': idx(`    <div class="${ROOT_CLS} totally-missing"></div>`),
      'resources/styles/common.less': `.${ROOT_CLS} { height: 100%; aspect-ratio: 4 / 8; }`,
    };
    const r = runArtifactInvariants(files);
    const v = r.violations.find((x) => x.id === 'I5');
    expect(v?.severity).toBe('warn');
    expect(v?.message).toContain('totally-missing');
  });

  it('url() 引用不存在的图片 → I6 error；存在则过', () => {
    const less1 = `.${ROOT_CLS} { height: 100%; aspect-ratio: 4 / 8; background: url('../images/nope.png'); }`;
    const r1 = runArtifactInvariants({
      'package/index.vue': idx(`    <div class="${ROOT_CLS}"></div>`),
      'resources/styles/common.less': less1,
      'resources/images/exists.png': 'binary',
    });
    expect(r1.violations.find((v) => v.id === 'I6')?.severity).toBe('error');

    const r2 = runArtifactInvariants({
      'package/index.vue': idx(`    <div class="${ROOT_CLS}"></div>`),
      'resources/styles/common.less': less1,
      'resources/images/exists.png': 'binary',
      'resources/images/nope.png': 'binary',
    });
    expect(r2.violations.find((v) => v.id === 'I6')).toBeUndefined();
  });

  it('P1.6 口径：快照不含任何 images/assets 条目时 I6 fail-open 跳过（防生成期系统性误报）', () => {
    const r = runArtifactInvariants({
      'package/index.vue': idx(`    <div class="${ROOT_CLS}"></div>`),
      'resources/styles/common.less': `.${ROOT_CLS} { height: 100%; aspect-ratio: 4 / 8; background: url('../images/not-downloaded-yet.png'); }`,
    });
    expect(r.violations.find((v) => v.id === 'I6')).toBeUndefined();
  });
});

/**
 * 🛡️ I7 修饰符类双向一致（P1.4，2026-09-11）
 * 260ff122 实锤：激活态样式规则被 base 化 → 污染全部元素；I7 方向② 应能捕获该形态。
 */
describe('I7 修饰符类双向一致', () => {
  const LESS_BASE = `.${ROOT_CLS} { height: 100%; aspect-ratio: 4 / 8; }`;

  it('模板有 --active 但样式无对应规则 → I7 error（激活态必然失效）', () => {
    const files = {
      'package/index.vue': idx(`    <div class="${ROOT_CLS}"></div>`),
      'package/components/Tabs.vue':
        `<template><div class="c-x-item" :class="{ 'c-x-item--active': on }">t</div></template>`,
      'resources/styles/common.less': `${LESS_BASE}\n.c-x-item { color: #2c9bea; }`,
    };
    const r = runArtifactInvariants(files);
    const v = r.violations.find((x) => x.id === 'I7' && x.severity === 'error');
    expect(v?.message).toContain('c-x-item--active');
  });

  it('模板与样式都有 --active → I7 无 error', () => {
    const files = {
      'package/index.vue': idx(`    <div class="${ROOT_CLS}"></div>`),
      'package/components/Tabs.vue':
        `<template><div class="c-x-item" :class="{ 'c-x-item--active': on }">t</div></template>`,
      'resources/styles/common.less': `${LESS_BASE}\n.c-x-item { color: #2c9bea; }\n.c-x-item--active { color: #fff; }`,
    };
    const r = runArtifactInvariants(files);
    expect(r.violations.filter((x) => x.id === 'I7' && x.severity === 'error')).toEqual([]);
  });

  it('样式里有 --active 规则但模板未使用 → I7 warn（疑似 base 化/死规则）', () => {
    const files = {
      'package/index.vue': idx(`    <div class="${ROOT_CLS}"></div>`),
      'package/components/Tabs.vue': `<template><div class="c-x-item">t</div></template>`,
      'resources/styles/common.less': `${LESS_BASE}\n.c-x-item--active { color: #fff; }`,
    };
    const r = runArtifactInvariants(files);
    const v = r.violations.find((x) => x.id === 'I7' && x.severity === 'warn');
    expect(v?.message).toContain('c-x-item--active');
  });

  it('C1 契约：模板出现布尔方言 is-active → I7 error（必须在写盘前归一）', () => {
    const files = {
      'package/index.vue': idx(`    <div class="${ROOT_CLS}"></div>`),
      'package/components/Tabs.vue':
        `<template><div class="c-x-item" :class="{ 'is-active': on }">t</div></template>`,
      'resources/styles/common.less': `${LESS_BASE}\n.c-x-item--active { color: #fff; }`,
    };
    const r = runArtifactInvariants(files);
    const v = r.violations.find((x) => x.id === 'I7' && x.severity === 'error');
    expect(v?.message).toContain('C1');
    expect(v?.message).toContain('is-active');
  });

  it('归一后（--active 形态）模板与样式一致 → I7 无 error', () => {
    const files = {
      'package/index.vue': idx(`    <div class="${ROOT_CLS}"></div>`),
      'package/components/Tabs.vue':
        `<template><div class="c-x-item" :class="{ 'c-x-item--active': on }">t</div></template>`,
      'resources/styles/common.less': `${LESS_BASE}\n.c-x-item--active { color: #fff; }`,
    };
    const r = runArtifactInvariants(files);
    expect(r.violations.filter((x) => x.id === 'I7' && x.severity === 'error')).toEqual([]);
  });

  it('C2 契约：修饰符规则基类与 DOM 形态不一致（无前缀 vs 有前缀）→ I7 error', () => {
    const files = {
      'package/index.vue': idx(`    <div class="${ROOT_CLS}"></div>`),
      // DOM：基类带实例前缀，修饰符类为无前缀布尔方言形态之一（.base.is-active 复合）
      'package/components/Tabs.vue':
        `<template><div class="c-demo-784zn8qx-c-x-item" :class="{ 'is-active': on }">t</div></template>`,
      'resources/styles/common.less': `${LESS_BASE}\n.c-x-item.is-active { color: #fff; }`,
    };
    const r = runArtifactInvariants(files);
    const errs = r.violations.filter((x) => x.id === 'I7' && x.severity === 'error');
    expect(errs.some((e) => e.message.includes('C2'))).toBe(true);
  });
});
