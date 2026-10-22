/**
 * layout-facts-injector · 刀 53 确定性接管类豁免单测（2026-10-22 round-12 实锤）
 *
 * 病灶：注入器给 `c-{sem}-fg-{header|grid}-{idSlug}` 宿主 class 写
 * `display:flex; flex-direction:column; flex:1.548 1 0; height:100%; width:100%`。
 * 这些属性由 folded-grid-section-takeover **内联钉死**（`flex-direction:row`），
 * class 侧那份只靠「内联优先级更高」侥幸不生效 —— 微码全局注入下「后写者胜」不可证，
 * 一旦内联被剥离/降权即塌 ⇒ 整类跳过注入。
 */
import { injectLayoutFacts } from '../layout-facts-injector.js';

describe('injectLayoutFacts 刀 53 确定性接管类豁免', () => {
  it('fg-header 宿主类跳过注入（零改动、零 fixes）', () => {
    const css = '.c-x-fg-header-383137tailtext {\n  display: flex;\n}';
    const mapping = {
      '.c-x-fg-header-383137tailtext': { display: 'flex', flexDirection: 'column' },
    };
    const r = injectLayoutFacts(css, mapping, { forceOverride: true });
    expect(r.fixes.length).toBe(0);
    expect(r.content).toBe(css);
    expect(r.content).not.toContain('flex-direction: column');
  });

  it('fg-grid 宿主类跳过注入（含 grid 事实也不注入）', () => {
    const css = '.c-x-fg-grid-383140 {\n  display: grid;\n}';
    const mapping = {
      '.c-x-fg-grid-383140': { display: 'grid', gridColumns: 4 },
    };
    const r = injectLayoutFacts(css, mapping, { forceOverride: true });
    expect(r.fixes.length).toBe(0);
    expect(r.content).toBe(css);
  });

  it('阳性对照：非 fg- 类照常注入（豁免没有把注入器关掉）', () => {
    const css = '.c-demo-tabs {\n  display: flex;\n  gap: 4px;\n}';
    const mapping = { '.c-demo-tabs': { display: 'flex', flexDirection: 'column' } };
    const r = injectLayoutFacts(css, mapping, { forceOverride: true });
    expect(r.fixes.length).toBe(1);
    expect(r.content).toContain('flex-direction: column');
  });

  it('阳性对照：同一 mapping 里 fg- 跳过、非 fg- 照常注入（混合不互相污染）', () => {
    const css =
      '.c-x-fg-header-1 {\n  display: flex;\n}\n.c-demo-tabs {\n  display: flex;\n}';
    const mapping = {
      '.c-x-fg-header-1': { display: 'flex', flexDirection: 'column' },
      '.c-demo-tabs': { display: 'flex', flexDirection: 'column' },
    };
    const r = injectLayoutFacts(css, mapping, { forceOverride: true });
    expect(r.fixes.length).toBe(1);
    expect(r.fixes[0].className).toBe('.c-demo-tabs');
  });
});
