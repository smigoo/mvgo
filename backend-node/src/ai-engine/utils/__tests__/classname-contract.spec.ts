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

// ============================================================================
// 🛡️ 刀 11（2026-09-13）：CODE-024 假阳性根治——事故形态端到端回归
//    事故 `mc-1789284222821-075b13a4`：`:class="{ 'c-x-active--selected': cur === 'active' }"`
//    → 旧实现提取出伪造 token `active` → C1(方言) + C3(无规则) 误报；
//      且 `c-x-active` 被单横线规则拆走 → bases.bare 空 → C2「基类不在 DOM」误报。
// ============================================================================
describe('刀 11：`:class` 表达式字面量 / 单横线语义类名 不再产生 C1/C2/C3', () => {
  const ACCIDENT_VUE = `<template>
  <div class="c-x-active" :class="{ 'c-x-active--selected': cur === 'active' }">t</div>
</template>
<script setup>
const cur = 'active'
</script>
<style scoped>.c-x-active { color: #fff; }</style>
`;
  const LESS = [
    '.c-x-active { color: #fff; }',
    '.c-x-active--selected { color: #f00; }',
  ].join('\n');
  const f = {
    'package/components/Switch.vue': ACCIDENT_VUE,
    'resources/styles/common.less': LESS,
  };

  it('template/样式齐备 → error 级违规为 0（C1/C2/C3 全消）', () => {
    const v = checkClassNameContract(f, collectClassFacts(f));
    const errs = v.filter((x) => x.severity === 'error');
    expect(errs.map((x) => `${x.code}:${x.message.slice(0, 40)}`)).toEqual([]);
  });

  it('回归护栏：C2 不得因单横线语义类名误报', () => {
    const v = checkClassNameContract(f, collectClassFacts(f));
    expect(v.find((x) => x.code === 'C2')).toBeUndefined();
  });
});

// ============================================================================
// 🛡️ 刀 14（2026-09-13）：C3 可修 / 不可修二分
//    事故 `mc-1789310631072-8fb4f52f`：模板两张卡片写作 `.c-device-monitor-active` /
//    `.c-device-monitor-default`（状态类 `--on` / `--active`），而样式侧的设计基名是
//    `.c-device-monitor-switch-item{&--active{…}}` —— **完全换名**（非前缀扩展，R4 够不到）。
//    C3 报错是**真**的，但「补样式」**不可达成**（样式侧没有该状态的设计真值，补出来是臆造）
//    → 每轮 BLOCK 各不相同（LESS-COMPILE-001 → CODE-015 → CODE-024 C3 = 打地鼠）→ 3 轮软失败。
//    二分：基类在设计样式里存在 → 可修（error）；不存在（只有 stub / 缺失）→ 不可修（warn + 候选基名）。
// ============================================================================
describe('刀 14：C3 可修 / 不可修二分（模板基名与样式基名体系脱节）', () => {
  const STUB =
    '\n/* === [自动修复] v3.5 模板驱动 fallback 规则 === */\n.c-device-monitor-active {\n  display: flex;\n  flex-direction: row;\n}\n';

  it('不可修：基类在设计样式里不存在（仅兜底 stub）→ warn，不再 BLOCK', () => {
    const f = {
      'package/components/Switch.vue': `<template><div class="c-device-monitor-active" :class="{ 'c-device-monitor-active--on': on }">t</div></template>`,
      'resources/styles/common.less': `${STUB}\n.c-device-monitor-switch-item { flex: 1; }\n.c-device-monitor-switch-item--active { color: #fff; }\n`,
    };
    const v = checkClassNameContract(f, collectClassFacts(f));
    const c3 = v.find((x) => x.code === 'C3');
    expect(c3?.severity).toBe('warn');
    expect(c3?.message).toContain('无设计规则');
    // `--on` 与 `--active` 同族（布尔别名归一）→ 正确给出 switch-item 候选
    expect(c3?.message).toContain('c-device-monitor-switch-item');
    expect(v.filter((x) => x.severity === 'error')).toEqual([]);
  });

  it('不可修且样式侧无同族修饰符 → 建议删除该状态类', () => {
    const f = {
      'package/components/Switch.vue': `<template><div class="c-x-active" :class="{ 'c-x-active--disabled': off }">t</div></template>`,
      'resources/styles/common.less': `${STUB}\n.c-x-active-title { color: #333; }\n`,
    };
    const v = checkClassNameContract(f, collectClassFacts(f));
    const c3 = v.find((x) => x.code === 'C3');
    expect(c3?.severity).toBe('warn');
    expect(c3?.message).toContain('建议删除该状态类');
  });

  it('不可修时给出候选基名：样式侧存在同修饰符的设计基名', () => {
    const f = {
      'package/components/Switch.vue': `<template><div class="c-device-monitor-default" :class="{ 'c-device-monitor-default--active': on }">t</div></template>`,
      'resources/styles/common.less': `${STUB}\n.c-device-monitor-switch-item--active { color: #fff; }\n`,
    };
    const v = checkClassNameContract(f, collectClassFacts(f));
    const c3 = v.find((x) => x.code === 'C3');
    expect(c3?.severity).toBe('warn');
    expect(c3?.message).toContain('c-device-monitor-switch-item');
    expect(c3?.message).toContain('--active');
  });

  it('可修：基类在设计样式里存在、只是缺该修饰符规则 → 保持 error', () => {
    const f = {
      'package/components/Switch.vue': `<template><div class="c-x-item" :class="{ 'c-x-item--active': on }">t</div></template>`,
      'resources/styles/common.less': '\n.c-x-item { color: #2c9bea; }\n',
    };
    const v = checkClassNameContract(f, collectClassFacts(f));
    expect(v.find((x) => x.code === 'C3')?.severity).toBe('error');
  });

  it('stub 不得充当「样式侧存在」的证据（刀 12 铁律在 C3 上的落实）', () => {
    const f = {
      'package/components/Switch.vue': `<template><div class="c-x-active" :class="{ 'c-x-active--on': on }">t</div></template>`,
      'resources/styles/common.less': `\n/* === [自动修复] v3.5 模板驱动 fallback 规则 === */\n.c-x-active { display: flex; flex-direction: row; }\n`,
    };
    const v = checkClassNameContract(f, collectClassFacts(f));
    // 未剥 stub 时 baseInDesign=true → error（被兜底遮罩掩盖）；剥后 → warn
    expect(v.find((x) => x.code === 'C3')?.severity).toBe('warn');
  });
});
