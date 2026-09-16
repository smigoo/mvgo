/**
 * 类名/槽位门禁规格（2026-09-16）：
 *   - CLASS-PAIR-001        状态类「选择器级配对」（M1.2）
 *   - CLASS-STATE-VISUAL-001 状态类「视觉属性下限」（M1.3）
 *   - COLOR-SLOT-001        色值槽位「用途一致性」（M2.2）+ 确定性自愈
 *
 * 真机来源：c-vehicle-monitor-e6b2864e（bare `active` 与 `&--active` 零交集、卡片发白）、
 *          c-device-monitor-b75436da（`--active` 规则体只有 display/flex-direction）。
 */
import {
  extractTemplateClassNames,
  validateClassSelectorPairs,
  detectColorSlotPurpose,
  fixColorSlotPurpose,
} from './code-validator.js';

const files = (over: Record<string, string> = {}) => ({
  'package/index.vue': `<template>
  <div class="c-monitor-root"><TabsSection /></div>
</template>`,
  'resources/styles/common.less': '',
  ...over,
});

describe('extractTemplateClassNames（M1.1 补全动态类名）', () => {
  it('对象裸键进入清单（旧实现漏提取），表达式标识符不冒充类名', () => {
    const all = files({
      'package/components/TabsSection.vue': `<template>
  <div :class="['c-monitor-tab-item', { active: activeTab === index }]">{{ tab }}</div>
</template>`,
    });
    const { fullList } = extractTemplateClassNames(all, 'c-monitor', {});
    expect(fullList).toContain('active');
    expect(fullList).toContain('c-monitor-tab-item');
    // 旧实现在绑定表达式上按空格切分，会把变量名当类名
    expect(fullList).not.toContain('activeTab');
    expect(fullList).not.toContain('index');
  });
});

describe('CLASS-PAIR-001（M1.2 选择器级配对）', () => {
  it('模板挂裸状态类 active、样式只有 &--active → BLOCK', () => {
    const all = files({
      'package/components/TabsSection.vue': `<template>
  <div :class="['c-monitor-tab-item', { active: isOn }]">x</div>
</template>`,
      'package/components/TabsSection.less': `
.c-monitor-tab-item {
  &--active { background: #1990ff; }
}`,
      'resources/styles/common.less': `
.c-monitor-tab-item {
  &--active { background: #1990ff; }
}`,
    });
    const { mismatches } = validateClassSelectorPairs(all, ['active', 'c-monitor-tab-item'], {});
    const hit = mismatches.find((m: any) => m.gate === 'CLASS-PAIR-001');
    expect(hit).toBeTruthy();
    expect(hit.className).toBe('active');
  });

  it('模板用带基类修饰符形态 → 不报（正常写法零误杀）', () => {
    const all = files({
      'resources/styles/common.less': `
.c-monitor-tab-item {
  &--active { background: #1990ff; }
}`,
    });
    const { mismatches } = validateClassSelectorPairs(
      all,
      ['c-monitor-tab-item', 'c-monitor-tab-item--active'],
      {},
    );
    expect(mismatches.filter((m: any) => m.gate === 'CLASS-PAIR-001')).toHaveLength(0);
  });
});

describe('CLASS-STATE-VISUAL-001（M1.3 状态类视觉下限）', () => {
  it('状态类规则体只有结构属性 → BLOCK', () => {
    const all = files({
      'resources/styles/common.less': `
.c-monitor-switch-item--active {
  display: flex;
  flex-direction: row;
}`,
    });
    const { mismatches } = validateClassSelectorPairs(all, ['c-monitor-switch-item--active'], {});
    const hit = mismatches.find((m: any) => m.gate === 'CLASS-STATE-VISUAL-001');
    expect(hit).toBeTruthy();
    expect(hit.className).toBe('c-monitor-switch-item--active');
  });

  it('状态类有视觉属性 → 不报', () => {
    const all = files({
      'resources/styles/common.less': `
.c-monitor-switch-item--active {
  display: flex;
  background: linear-gradient(135deg, #318aff 0%, #70bfff 100%);
  border-color: #f0f5ff;
}`,
    });
    const { mismatches } = validateClassSelectorPairs(all, ['c-monitor-switch-item--active'], {});
    expect(mismatches.filter((m: any) => m.gate === 'CLASS-STATE-VISUAL-001')).toHaveLength(0);
  });

  it('border-radius / border-width 不算视觉属性（不产生状态间视觉差异）', () => {
    const all = files({
      'resources/styles/common.less': `
.c-monitor-card--active {
  display: flex;
  border-radius: 8px;
  border-width: 1px;
}`,
    });
    const { mismatches } = validateClassSelectorPairs(all, ['c-monitor-card--active'], {});
    expect(
      mismatches.filter((m: any) => m.gate === 'CLASS-STATE-VISUAL-001'),
    ).toHaveLength(1);
  });

  it('非状态类不看视觉属性（本门禁只管状态词形）', () => {
    const all = files({
      'resources/styles/common.less': `
.c-monitor-card {
  display: flex;
  flex-direction: column;
}`,
    });
    const { mismatches } = validateClassSelectorPairs(all, ['c-monitor-card'], {});
    expect(mismatches.filter((m: any) => m.gate === 'CLASS-STATE-VISUAL-001')).toHaveLength(0);
  });
});

describe('COLOR-SLOT-001（M2.2 槽位用途一致性）', () => {
  const LESS = `/* 激活态文字颜色 */
.c-monitor-tab-item--active {
  color: var(--colorTabActiveText, #ffffff);
}
.c-monitor-card {
  background: var(--colorTabActiveText, #ffffff);
}
`;

  it('文字槽位用于 background → 检出；用于 color → 不报', () => {
    const { mismatches } = detectColorSlotPurpose(files({
      'resources/styles/common.less': LESS,
    }));
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0].gate).toBe('COLOR-SLOT-001');
    expect(mismatches[0].prop).toBe('background');
    expect(mismatches[0].slot).toBe('--colorTabActiveText');
  });

  it('通用槽位（primary/info/gradient）不判，避免误杀', () => {
    const { mismatches } = detectColorSlotPurpose(files({
      'resources/styles/common.less': `
.c-monitor-card { background: var(--colorPrimary, #1990ff); }
.c-monitor-title { color: var(--colorInfo, #08a3a5); }
.c-monitor-bar { background: linear-gradient(90deg, var(--colorGradientStart, #1990ff) 0%, #fff 100%); }
`,
    }));
    expect(mismatches).toHaveLength(0);
  });

  it('自愈：只改 background 那处、保留 fallback、幂等', () => {
    const input = files({ 'resources/styles/common.less': LESS });
    const { files: out, fixes } = fixColorSlotPurpose(input);

    expect(fixes).toHaveLength(1);
    const less = out['resources/styles/common.less'];
    // 只替换槽位名，fallback 原样保留
    expect(less).toContain('background: var(--colorBgCard, #ffffff);');
    // color 那处必须原封不动
    expect(less).toContain('color: var(--colorTabActiveText, #ffffff);');
    expect((less.match(/--colorTabActiveText/g) || [])).toHaveLength(1);
    // 不产生残串（曾因 absIndex 指向 var( 起点而截断成 --colorBgCardxt）
    expect(less).not.toMatch(/--colorBgCard[a-z]/i);
    // 幂等：再跑一次无改动
    expect(fixColorSlotPurpose(out).fixes).toHaveLength(0);
    // 不改入参
    expect(input['resources/styles/common.less']).toBe(LESS);
  });

  it('背景槽位用于文字属性 → 检出但不自愈（方向可能是有意强调，只报不改）', () => {
    const input = files({
      'resources/styles/common.less': `.c-monitor-label { color: var(--colorBgCard, #ffffff); }`,
    });
    expect(detectColorSlotPurpose(input).mismatches).toHaveLength(1);
    expect(fixColorSlotPurpose(input).fixes).toHaveLength(0);
  });
});
