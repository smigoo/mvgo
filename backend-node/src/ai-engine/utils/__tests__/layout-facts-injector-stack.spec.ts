/**
 * layout-facts-injector · 刀 6 同 bbox 叠层事实（display:'stack'）单测（2026-10-27）
 *
 * 病灶（8bbcf027 `36:1726` Mask group）：子项 bbox 完全相等的层叠容器被事实层判成
 * flex/column/high，注入器把 `flex-direction:column` 写进宿主类 ⇒ 层叠子项被拉成纵流。
 * 容器级 CSS 单独表达不了「子项全部叠放」（需要子项 grid-area:1/1 配合），
 * 故注入器对 stack 事实**整类跳过**方向注入（去除毒药），层叠写法由 prompt 侧下发。
 */
import { injectLayoutFacts } from '../layout-facts-injector.js';

describe('injectLayoutFacts 刀 6 同 bbox 叠层跳过', () => {
  it('⭐ stack 事实 ⇒ 不注入 display/flex-direction，产物逐字不变 + 打跳过日志', () => {
    const css = '.c-x-mask {\n  width: 98px;\n  height: 98px;\n}';
    const mapping = {
      '.c-x-mask': { display: 'stack', source: 'geometric-stack-inference', confidence: 'high' },
    };
    const logs = [];
    const r = injectLayoutFacts(css, mapping, {
      forceOverride: true,
      logger: { info: (m) => logs.push(String(m)) },
    });
    expect(r.content).toBe(css);
    expect(r.fixes).toEqual([]);
    expect(r.content).not.toContain('display: stack');
    expect(logs.join('\n')).toContain('LAYOUT-FACTS-STACK');
  });

  it('⭐ stack 事实即使块内已有 flex-direction 也不改写（forceOverride 也不动）', () => {
    const css = '.c-x-mask {\n  display: flex;\n  flex-direction: column;\n}';
    const mapping = {
      '.c-x-mask': { display: 'stack', source: 'geometric-stack-inference', confidence: 'high' },
    };
    const r = injectLayoutFacts(css, mapping, { forceOverride: true });
    expect(r.content).toBe(css);
    expect(r.fixes).toEqual([]);
  });

  it('阳性对照：同一 mapping 里 stack 跳过、flex 事实照常注入（不互相污染）', () => {
    const css =
      '.c-x-mask {\n  display: flex;\n}\n.c-demo-list {\n  display: flex;\n}';
    const mapping = {
      '.c-x-mask': { display: 'stack', source: 'geometric-stack-inference', confidence: 'high' },
      '.c-demo-list': { display: 'flex', flexDirection: 'column' },
    };
    const r = injectLayoutFacts(css, mapping, { forceOverride: true });
    expect(r.fixes.length).toBe(1);
    expect(r.fixes[0].className).toBe('.c-demo-list');
    expect(r.content).toContain('flex-direction: column');
  });
});
