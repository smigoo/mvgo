/**
 * Phase 3 L10：定宽/定高区块归一化测试
 */
import { normalizeFixedSizeFlex } from '../fixed-size-normalizer.js';

describe('Phase 3 L10 - normalizeFixedSizeFlex', () => {
  test('显式 width 的区块注入 flex: 0 0 auto', () => {
    const input = `.sidebar {
  width: 200px;
  flex: 1 1 0;
}`;
    const result = normalizeFixedSizeFlex(input);
    expect(result.content).toContain('flex: 0 0 auto');
    expect(result.content).not.toContain('flex: 1 1 0');
    expect(result.normalized).toHaveLength(1);
    expect(result.normalized[0]).toContain('.sidebar');
  });

  test('显式 height 的区块注入 flex: 0 0 auto', () => {
    const input = `.header {
  height: 60px;
  flex-grow: 1;
}`;
    const result = normalizeFixedSizeFlex(input);
    expect(result.content).toContain('flex: 0 0 auto');
    expect(result.content).not.toContain('flex-grow: 1');
    expect(result.normalized).toHaveLength(1);
  });

  test('无显式尺寸的区块不处理', () => {
    const input = `.content {
  flex: 1 1 0;
  padding: 10px;
}`;
    const result = normalizeFixedSizeFlex(input);
    expect(result.content).toBe(input);
    expect(result.normalized).toHaveLength(0);
  });

  test('已有 flex: 0 0 auto 的区块不重复处理', () => {
    const input = `.icon {
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
}`;
    const result = normalizeFixedSizeFlex(input);
    expect(result.content).toBe(input);
    expect(result.normalized).toHaveLength(0);
  });

  test('豁免根容器（componentPrefix-root）', () => {
    const input = `.c-monitor-root {
  width: 100%;
  height: 100%;
  flex: 1 1 0;
}`;
    const result = normalizeFixedSizeFlex(input, 'c-monitor');
    expect(result.content).toBe(input);
    expect(result.normalized).toHaveLength(0);
  });

  test('豁免内容主区（componentPrefix-content）', () => {
    const input = `.c-monitor-content {
  width: 800px;
  flex: 1 1 0;
}`;
    const result = normalizeFixedSizeFlex(input, 'c-monitor');
    expect(result.content).toBe(input);
    expect(result.normalized).toHaveLength(0);
  });

  test('多区块批量处理', () => {
    const input = `.sidebar {
  width: 200px;
  flex: 1;
}
.header {
  height: 60px;
  flex-grow: 1;
}
.content {
  flex: 1;
}`;
    const result = normalizeFixedSizeFlex(input);
    expect(result.normalized).toHaveLength(2);
    expect(result.content).toMatch(/\.sidebar[\s\S]*flex: 0 0 auto/);
    expect(result.content).toMatch(/\.header[\s\S]*flex: 0 0 auto/);
  });

  test('空输入返回原值', () => {
    expect(normalizeFixedSizeFlex('')).toEqual({ content: '', normalized: [] });
    expect(normalizeFixedSizeFlex(null)).toEqual({ content: null, normalized: [] });
    expect(normalizeFixedSizeFlex(undefined)).toEqual({ content: undefined, normalized: [] });
  });

  test('移除 flex-grow/flex-shrink/flex-basis 后注入', () => {
    const input = `.tab-bar {
  height: 40px;
  flex-grow: 1;
  flex-shrink: 1;
  flex-basis: 0;
}`;
    const result = normalizeFixedSizeFlex(input);
    expect(result.content).toContain('flex: 0 0 auto');
    expect(result.content).not.toContain('flex-grow');
    expect(result.content).not.toContain('flex-shrink');
    expect(result.content).not.toContain('flex-basis');
  });
});
