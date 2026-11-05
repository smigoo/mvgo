/**
 * 刀 53h · 孤儿样式规则护栏单测（2026-11-05）
 *
 * 覆盖「零证据护栏」：产物集中没有任何 DOM 源文件（domFiles===0）时，
 * 不得把独立 .less 的样式块判为孤儿删除——「全零引用」是证据缺失，不是孤儿事实。
 * 实锤：file-writer.diff-skip / file-writer.less-heal 两个 spec 的单文件 less fixture
 * 被 dropOrphanStyleRules 清成空串落盘。
 */
import { dropOrphanStyleRules } from './orphan-style-rule-guard.js';

describe('dropOrphanStyleRules · 零证据护栏（domFiles===0 fail-open）', () => {
  it('只有独立 .less（无任何 .vue）→ 不删除任何样式块（fail-open）', () => {
    const r = dropOrphanStyleRules([
      { path: 'resources/styles/probe.less', content: '.a { color: red; }' },
    ]);
    expect(r.map.size).toBe(0);
    expect(r.stats.domFiles).toBe(0);
    expect(
      r.stats.skipped.some((s: any) => s.reason === 'no-dom-evidence'),
    ).toBe(true);
  });

  it('产物含 .vue 时护栏不触发：被引用的类保留、零引用的类照常判孤儿（防护栏恒放行）', () => {
    const r = dropOrphanStyleRules([
      {
        path: 'package/index.vue',
        content: '<template><div class="a">x</div></template>',
      },
      {
        path: 'resources/styles/common.less',
        content: '.a { color: red; }\n.orphan-dead { color: blue; }\n',
      },
    ]);
    expect(r.stats.domFiles).toBeGreaterThan(0);
    const lessAfter = r.map.get('resources/styles/common.less');
    expect(lessAfter).toBeDefined();
    // 被引用的 .a 必须保留
    expect(lessAfter).toContain('.a');
    // 零引用的孤儿照常删除（护栏没有退化成「永不判定」）
    expect(lessAfter).not.toContain('.orphan-dead');
    expect(
      r.stats.removed.some((x: any) => x.selector === '.orphan-dead'),
    ).toBe(true);
  });
});
