/**
 * Phase 3 L9：类名同源治理测试
 */
import { genClassKey, genClassKeyBatch } from '../class-name-generator.js';

describe('Phase 3 L9 - genClassKey', () => {
  const prefix = 'c-monitor';

  test('语义角色映射：tab', () => {
    const node = { name: 'TabContainer', type: 'FRAME' };
    expect(genClassKey(node, prefix)).toBe('c-monitor-tab');
  });

  test('语义角色映射：header（中文）', () => {
    const node = { name: '标题区域', type: 'FRAME' };
    expect(genClassKey(node, prefix)).toBe('c-monitor-header');
  });

  test('语义角色映射：chart', () => {
    const node = { name: 'ChartArea', type: 'FRAME' };
    expect(genClassKey(node, prefix)).toBe('c-monitor-chart');
  });

  test('语义角色映射：stats（数字）', () => {
    const node = { name: '统计数字', type: 'TEXT' };
    expect(genClassKey(node, prefix)).toBe('c-monitor-stats');
  });

  test('语义角色映射：icon', () => {
    const node = { name: '功能图标', type: 'GROUP' };
    expect(genClassKey(node, prefix)).toBe('c-monitor-icon');
  });

  test('语义角色映射：badge', () => {
    const node = { name: '角标', type: 'FRAME' };
    expect(genClassKey(node, prefix)).toBe('c-monitor-badge');
  });

  test('Figma 节点名清洗：kebab-case（无角色匹配时）', () => {
    const node = { name: 'Device Panel', type: 'FRAME' };
    expect(genClassKey(node, prefix)).toBe('c-monitor-device-panel');
  });

  test('Figma 节点名清洗：去特殊字符（无角色匹配时）', () => {
    const node = { name: 'custom--container', type: 'FRAME' };
    // 连续特殊字符折叠为单个 -（kebab-case 标准行为）
    expect(genClassKey(node, prefix)).toBe('c-monitor-custom-container');
  });

  test('兜底：按节点类型', () => {
    const node = { name: '', type: 'RECTANGLE' };
    expect(genClassKey(node, prefix)).toBe('c-monitor-rect');
  });

  test('兜底：未知节点类型', () => {
    const node = { name: '', type: 'UNKNOWN' };
    expect(genClassKey(node, prefix)).toBe('c-monitor-node');
  });

  test('空节点返回 unknown', () => {
    expect(genClassKey(null, prefix)).toBe('c-monitor-unknown');
    expect(genClassKey(undefined, prefix)).toBe('c-monitor-unknown');
  });

  test('空前缀兜底', () => {
    const node = { name: 'Tab', type: 'FRAME' };
    expect(genClassKey(node, '')).toBe('c-component-tab');
  });
});

describe('Phase 3 L9 - genClassKeyBatch', () => {
  const prefix = 'c-monitor';

  test('批量生成类名映射', () => {
    const nodes = [
      { id: '1:1', name: 'TabContainer', type: 'FRAME' },
      { id: '1:2', name: 'ChartArea', type: 'FRAME' },
      { id: '1:3', name: '统计数字', type: 'TEXT' },
    ];
    const mapping = genClassKeyBatch(nodes, prefix);
    expect(mapping.size).toBe(3);
    expect(mapping.get('1:1')).toBe('c-monitor-tab');
    expect(mapping.get('1:2')).toBe('c-monitor-chart');
    expect(mapping.get('1:3')).toBe('c-monitor-stats');
  });

  test('空数组返回空映射', () => {
    expect(genClassKeyBatch([], prefix).size).toBe(0);
    expect(genClassKeyBatch(null, prefix).size).toBe(0);
  });

  test('跳过无 id 的节点', () => {
    const nodes = [
      { id: '1:1', name: 'Tab', type: 'FRAME' },
      { name: 'NoId', type: 'FRAME' },
    ];
    const mapping = genClassKeyBatch(nodes, prefix);
    expect(mapping.size).toBe(1);
  });
});
