/**
 * layout-facts-injector 后缀变体匹配单测（2026-09-22 · R2 命名后缀实锤）
 * 病灶：buildLayoutMapping 由 Figma name='tabs' 推断 .c-x-tabs，
 * 但产物实际 class 是 .c-x-tabs-section（R2 语义后缀）→ 精确匹配空转。
 */
import { injectLayoutFacts } from '../layout-facts-injector.js';

describe('injectLayoutFacts R2 后缀变体匹配', () => {
  it('精确 class 命中时行为不变', () => {
    const css = '.c-device-monitor-tabs {\n  display: flex;\n  gap: 4px;\n}';
    const mapping = {
      '.c-device-monitor-tabs': { display: 'flex', flexDirection: 'column' },
    };
    const r = injectLayoutFacts(css, mapping, { forceOverride: true });
    expect(r.content).toContain('flex-direction: column');
    expect(r.fixes.length).toBe(1);
    expect(r.fixes[0].className).toBe('.c-device-monitor-tabs');
  });

  it('精确 class 未命中时命中 -section 后缀变体并注入方向', () => {
    const css =
      '.c-device-monitor-tabs-section {\n  width: 100%;\n  display: flex;\n  align-items: center;\n  gap: 4px;\n}';
    const mapping = {
      '.c-device-monitor-tabs': { display: 'flex', flexDirection: 'column' },
    };
    const r = injectLayoutFacts(css, mapping, { forceOverride: true });
    expect(r.fixes.length).toBe(1);
    expect(r.fixes[0].className).toBe('.c-device-monitor-tabs-section');
    expect(r.fixes[0].detail).toContain('R2 后缀变体');
    expect(r.content).toContain('flex-direction: column');
    // 原有属性保留
    expect(r.content).toContain('align-items: center');
  });

  it('映射与产物都不存在时零改动', () => {
    const css = '.a { color: red; }';
    const mapping = {
      '.c-device-monitor-tabs': { display: 'flex', flexDirection: 'column' },
    };
    const r = injectLayoutFacts(css, mapping, { forceOverride: true });
    expect(r.fixes.length).toBe(0);
    expect(r.content).toBe(css);
  });

  it('方向已正确时幂等零改动', () => {
    const css =
      '.c-device-monitor-tabs-section {\n  display: flex;\n  flex-direction: column;\n}';
    const mapping = {
      '.c-device-monitor-tabs': { display: 'flex', flexDirection: 'column' },
    };
    const r = injectLayoutFacts(css, mapping, { forceOverride: true });
    expect(r.fixes.length).toBe(0);
  });
});
