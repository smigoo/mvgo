/**
 * `:style` 绑定残留归一器 spec（2026-11-12 · mc-1794463362140-8fa6d6f3 实锤，根治②）
 *
 * 阳性：`:style="{...};display:flex;..."`（对象字面量后被拼 CSS 声明）⇒ 归位静态 style。
 * 阴性：合法三元 `:style="cond ? { a } : null"`、纯对象、无 :style 均不动；幂等。
 */
import { healStyleBindingResidue } from '../style-binding-residue-healer.js';

const BAD_TAG =
  '<div style="display:flex;flex-direction:column" data-section-id="2:3446" ' +
  ":style=\"{ backgroundImage: 'url(' + bg4 + ')', backgroundPosition: '1px 31px', " +
  "backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' };" +
  'display:flex;flex-direction:row;align-items:center" class="x">A</div>';

describe('healStyleBindingResidue', () => {
  it('阳性：8fa6d6f3 实锤形态 → 残留归位静态 style，:style 恢复纯对象', () => {
    const r = healStyleBindingResidue(BAD_TAG);
    expect(r.healed).toBe(true);
    expect(r.fixes).toHaveLength(1);
    expect(r.content).toContain(
      'style="display:flex;flex-direction:column;display:flex;flex-direction:row;align-items:center"',
    );
    expect(r.content).toContain("backgroundRepeat: 'no-repeat' }\"");
    // 残留不再出现在 :style 引号内
    const m = r.content.match(/:style="([^"]*)"/);
    expect(m[1].startsWith('{')).toBe(true);
    expect(m[1].endsWith('}')).toBe(true);
    // 归一结果必须过表达式编译
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { validateVueSfcExpressions } = require('../../../utils/sfc-syntax-validation.js');
    const vue = `<template>\n  ${r.content}\n</template>\n\n<script setup>\nimport bg4 from '../resources/images/bg-36.png'\n</script>\n`;
    expect(validateVueSfcExpressions(vue, 'x.vue').valid).toBe(true);
  });

  it('阳性：无静态 style 的残留 → 新增静态 style 属性', () => {
    const bad =
      '<div :style="{ backgroundImage: \'url(\' + bg1 + \')\' };display:flex" class="y">B</div>';
    const r = healStyleBindingResidue(bad);
    expect(r.healed).toBe(true);
    expect(r.content).toContain('style="display:flex"');
    expect(r.content).toContain(':style="{ backgroundImage: \'url(\' + bg1 + \')\' }"');
  });

  it('阴性①：合法三元 `cond ? { a } : null` 不动', () => {
    const ok = '<div :style="cond ? { opacity: 1 } : null" class="z">C</div>';
    const r = healStyleBindingResidue(ok);
    expect(r.healed).toBe(false);
    expect(r.content).toBe(ok);
  });

  it('阴性②：纯对象 / 无 :style 不动', () => {
    const ok1 = '<div :style="{ backgroundImage: \'url(\' + bg3 + \')\' }" class="y">B</div>';
    expect(healStyleBindingResidue(ok1).content).toBe(ok1);
    const ok2 = '<div style="display:flex" class="w">D</div>';
    expect(healStyleBindingResidue(ok2).content).toBe(ok2);
  });

  it('幂等：修复后再跑零改动', () => {
    const once = healStyleBindingResidue(BAD_TAG);
    const twice = healStyleBindingResidue(once.content);
    expect(twice.healed).toBe(false);
    expect(twice.content).toBe(once.content);
  });
});
