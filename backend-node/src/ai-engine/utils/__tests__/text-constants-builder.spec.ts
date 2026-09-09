/**
 * Phase 4 L11（2026-09-07）：文案白名单字面量注入测试
 *
 * 验证：
 * - L11a: buildTextConstantsManifest 从 Figma 节点树收集所有 TEXT.characters
 * - L11b: 去重（相同文案只保留一个）
 * - L11c: 按文本长度降序排列
 * - L11d: 空节点树返回空数组
 * - L11e: buildTextConstantsSection 生成 Markdown 表格
 * - L11f: 无文案时返回空串
 * - L11g: 限制深度（depth > 10 不收集）
 */

import { buildTextConstantsManifest, buildTextConstantsSection } from '../text-constants-builder';

describe('Phase 4 L11 - buildTextConstantsManifest', () => {
  it('L11a: 收集所有 TEXT.characters', () => {
    const figmaNodeData = {
      id: '1:1',
      name: 'root',
      type: 'FRAME',
      children: [
        { id: '1:2', name: 't-标题', type: 'TEXT', characters: '环境监测' },
        { id: '1:3', name: 't-标签', type: 'TEXT', characters: '一氧化碳' },
        { id: '1:4', name: 't-数值', type: 'TEXT', characters: '3/3740' },
      ],
    };
    const result = buildTextConstantsManifest(figmaNodeData);
    expect(result).toHaveLength(3);
    expect(result.map(r => r.text)).toEqual(['3/3740', '环境监测', '一氧化碳']);
  });

  it('L11b: 去重（相同文案只保留一个）', () => {
    const figmaNodeData = {
      id: '1:1',
      name: 'root',
      type: 'FRAME',
      children: [
        { id: '1:2', name: 't-标题1', type: 'TEXT', characters: '监控' },
        { id: '1:3', name: 't-标题2', type: 'TEXT', characters: '监控' }, // 重复
      ],
    };
    const result = buildTextConstantsManifest(figmaNodeData);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('监控');
  });

  it('L11c: 按文本长度降序排列', () => {
    const figmaNodeData = {
      id: '1:1',
      name: 'root',
      type: 'FRAME',
      children: [
        { id: '1:2', name: 't-短', type: 'TEXT', characters: '监控' },
        { id: '1:3', name: 't-长', type: 'TEXT', characters: '南北接线 设备' },
        { id: '1:4', name: 't-中', type: 'TEXT', characters: '一氧化碳' },
      ],
    };
    const result = buildTextConstantsManifest(figmaNodeData);
    expect(result.map(r => r.text)).toEqual(['南北接线 设备', '一氧化碳', '监控']);
  });

  it('L11d: 空节点树返回空数组', () => {
    expect(buildTextConstantsManifest(null)).toEqual([]);
    expect(buildTextConstantsManifest({})).toEqual([]);
    expect(buildTextConstantsManifest({ type: 'FRAME', children: [] })).toEqual([]);
  });

  it('L11e: 保留节点元数据（nodeId, nodeName）', () => {
    const figmaNodeData = {
      id: '1:1',
      name: 'root',
      type: 'FRAME',
      children: [
        { id: '2:8816', name: 't-南北接线 设备', type: 'TEXT', characters: '南北接线 设备' },
      ],
    };
    const result = buildTextConstantsManifest(figmaNodeData);
    expect(result[0]).toEqual({
      text: '南北接线 设备',
      nodeId: '2:8816',
      nodeName: 't-南北接线 设备',
    });
  });

  it('L11g: 限制深度（depth > 10 不收集）', () => {
    // 构造 depth=11 的嵌套
    let deep: any = { id: '1:99', name: 't-深层', type: 'TEXT', characters: '深层文案' };
    for (let i = 0; i < 11; i++) {
      deep = { id: `1:${i}`, name: `level-${i}`, type: 'FRAME', children: [deep] };
    }
    const result = buildTextConstantsManifest(deep);
    expect(result).toHaveLength(0); // depth > 10 被跳过
  });
});

describe('Phase 4 L11 - buildTextConstantsSection', () => {
  it('L11e: 生成 Markdown 表格', () => {
    const figmaNodeData = {
      id: '1:1',
      name: 'root',
      type: 'FRAME',
      children: [
        { id: '1:2', name: 't-标题', type: 'TEXT', characters: '环境监测' },
        { id: '1:3', name: 't-标签', type: 'TEXT', characters: '一氧化碳' },
      ],
    };
    const section = buildTextConstantsSection(figmaNodeData);
    expect(section).toContain('## 📝 文案白名单');
    expect(section).toContain('`环境监测`');
    expect(section).toContain('`一氧化碳`');
    expect(section).toContain('禁止臆造');
  });

  it('L11f: 无文案时返回空串', () => {
    expect(buildTextConstantsSection(null)).toBe('');
    expect(buildTextConstantsSection({})).toBe('');
  });
});
