/**
 * 🛡️ P1.6 类名契约 · 单测（2026-09-11）
 *
 * 契约是门禁（CODE-024）与不变量（I7）的**同一实现**；本 spec 锁定四条条款与它们的边界：
 *   C1 方言标准（is-active → --mod 归一）
 *   C2 修饰符规则基类必须与 DOM 形态一致（真实事故形态：样式长形 / 模板短形）
 *   C3 模板修饰符类必须有样式规则
 *   C4 样式修饰符规则必须有模板使用
 * 反例边界：语义类名 `c-x-active`（"active 卡片"）**不得**被当作 `-active` 修饰符（误报源）
 */
import { isContractModifier, extractModifierRules, checkClassNameContract } from '../classname-contract.js';
import { collectClassFacts } from '../class-facts.js';

const IDX = `<template class="c-mc-max-1-x">
  <base-panel panelKey="default-panel">
    <div class="c-demo-784zn8qx-c-demo-slot-con"></div>
  </base-panel>
</template>
<script setup></script>
`;
const BASE_LESS = `.c-demo-784zn8qx-c-demo-slot-con { height: 100%; }\n`;

const files = (extra = {}) => ({
  'package/index.vue': IDX,
  'resources/styles/common.less': BASE_LESS + (extra.less || ''),
  ...extra.vue,
});

describe('isContractModifier（防语义类名误判）', () => {
  it('BEM 双横线与布尔别名算修饰符', () => {
    expect(isContractModifier('c-x-item--active')).toBe(true);
    expect(isContractModifier('is-active')).toBe(true);
    expect(isContractModifier('active')).toBe(true);
  });

  it('语义类名（c-x-active / c-x-default）不算修饰符', () => {
    expect(isContractModifier('c-device-monitor-active')).toBe(false);
    expect(isContractModifier('c-device-monitor-default')).toBe(false);
  });
});

describe('extractModifierRules', () => {
  it('BEM 形态与复合布尔形态都能提取', () => {
    const rules = extractModifierRules(
      `.c-x-item--active {\n  color: #fff;\n}\n.c-x-item.is-active {\n  color: #fff;\n}\n`,
    );
    expect(rules.some((r) => r.baseToken === 'c-x-item' && !r.aliasForm)).toBe(true);
    expect(rules.some((r) => r.aliasForm)).toBe(true);
  });

  it('语义类选择器不产出修饰符规则（-.c-x-active）', () => {
    const rules = extractModifierRules(`.c-x-active {\n  color: #fff;\n}\n`);
    expect(rules).toEqual([]);
  });
});

describe('checkClassNameContract', () => {
  it('C1：模板 is-active 未归一 → error', () => {
    const f = files({
      vue: {
        'package/components/Tabs.vue': `<template><div class="c-x-item" :class="{ 'is-active': on }">t</div></template>`,
      },
      less: '\n.c-x-item--active { color: #fff; }\n',
    });
    const v = checkClassNameContract(f, collectClassFacts(f));
    expect(v.find((x) => x.code === 'C1')?.severity).toBe('error');
  });

  it('C2：样式用长形基类、模板用短形 → error（1afdb842 事故形态）', () => {
    const f = {
      'package/index.vue': IDX,
      'package/components/Tabs.vue': `<template><div class="c-demo-784zn8qx-c-x-item" :class="{ 'c-x-item--active': on }">t</div></template>`,
      'resources/styles/common.less': `${BASE_LESS}\n.c-demo-784zn8qx-c-x-item--active { color: #fff; }\n`,
    };
    const v = checkClassNameContract(f, collectClassFacts(f));
    // 模板短形无样式规则（C3）+ 样式长形无模板使用（C4）——两面同源
    expect(v.some((x) => x.code === 'C3')).toBe(true);
    expect(v.some((x) => x.code === 'C4' && x.severity === 'warn')).toBe(true);
  });

  it('C3：模板修饰符类无样式规则 → error', () => {
    const f = files({
      vue: {
        'package/components/Tabs.vue': `<template><div class="c-x-item" :class="{ 'c-x-item--active': on }">t</div></template>`,
      },
      less: '\n.c-x-item { color: #2c9bea; }\n',
    });
    const v = checkClassNameContract(f, collectClassFacts(f));
    expect(v.find((x) => x.code === 'C3')?.severity).toBe('error');
  });

  it('契约满足时零违规（幂等基线）', () => {
    const f = files({
      vue: {
        'package/components/Tabs.vue': `<template><div class="c-x-item" :class="{ 'c-x-item--active': on }">t</div></template>`,
      },
      less: '\n.c-x-item { color: #2c9bea; }\n.c-x-item--active { color: #fff; }\n',
    });
    const v = checkClassNameContract(f, collectClassFacts(f));
    expect(v.filter((x) => x.severity === 'error')).toEqual([]);
  });

  it('C4：样式有修饰符规则但模板未用 → warn', () => {
    const f = files({
      vue: { 'package/components/Tabs.vue': `<template><div class="c-x-item">t</div></template>` },
      less: '\n.c-x-item--active { color: #fff; }\n',
    });
    const v = checkClassNameContract(f, collectClassFacts(f));
    expect(v.find((x) => x.code === 'C4')?.severity).toBe('warn');
  });
});
