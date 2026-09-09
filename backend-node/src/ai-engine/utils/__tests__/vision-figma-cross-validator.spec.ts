import { crossValidateVisionTexts, buildVisionFigmaCrossSection } from '../vision-figma-cross-validator';

describe('L12 Vision-Figma 交叉验证', () => {
  const figmaNodeData = {
    type: 'FRAME',
    name: 'root',
    children: [
      {
        type: 'TEXT',
        id: '1:1',
        name: 't-title',
        characters: '监控',
        absoluteBoundingBox: { x: 100, y: 100, width: 80, height: 20 },
      },
      {
        type: 'TEXT',
        id: '1:2',
        name: 't-label',
        characters: '烟道机器人',
        absoluteBoundingBox: { x: 200, y: 150, width: 120, height: 24 },
      },
      {
        type: 'FRAME',
        name: 'nested',
        children: [
          {
            type: 'TEXT',
            id: '1:3',
            name: 't-stat',
            characters: '3/3740',
            absoluteBoundingBox: { x: 300, y: 200, width: 60, height: 18 },
          },
        ],
      },
    ],
  };

  describe('crossValidateVisionTexts', () => {
    it('L12a: 空 vision elements 返回空映射', () => {
      const result = crossValidateVisionTexts([], figmaNodeData);
      expect(result.visionToFigma.size).toBe(0);
      expect(result.unmatchedVision).toEqual([]);
    });

    it('L12b: 无 Figma TEXT 节点时全部 unmatched', () => {
      const emptyFigma = { type: 'FRAME', name: 'root', children: [] };
      const visionElements = [
        { text: '监控', bbox: { x: 100, y: 100, width: 80, height: 20 } },
      ];
      const result = crossValidateVisionTexts(visionElements, emptyFigma);
      expect(result.visionToFigma.size).toBe(0);
      expect(result.unmatchedVision).toEqual(['监控']);
    });

    it('L12c: IoU 重叠匹配正确配对', () => {
      const visionElements = [
        { text: '挖掘机', bbox: { x: 100, y: 100, width: 80, height: 20 } }, // 与「监控」重叠
      ];
      const result = crossValidateVisionTexts(visionElements, figmaNodeData);
      expect(result.visionToFigma.get('挖掘机')).toBe('监控');
      expect(result.unmatchedVision).toEqual([]);
    });

    it('L12d: 无重叠时 unmatched', () => {
      const visionElements = [
        { text: '控制', bbox: { x: 500, y: 500, width: 80, height: 20 } }, // 无重叠
      ];
      const result = crossValidateVisionTexts(visionElements, figmaNodeData);
      expect(result.visionToFigma.size).toBe(0);
      expect(result.unmatchedVision).toEqual(['控制']);
    });

    it('L12e: 多个 vision elements 混合匹配', () => {
      const visionElements = [
        { text: '烟雾机器人', bbox: { x: 200, y: 150, width: 120, height: 24 } }, // 与「烟道机器人」重叠
        { text: '3/740', bbox: { x: 300, y: 200, width: 60, height: 18 } }, // 与「3/3740」重叠
        { text: '臆造文字', bbox: { x: 999, y: 999, width: 80, height: 20 } }, // 无重叠
      ];
      const result = crossValidateVisionTexts(visionElements, figmaNodeData);
      expect(result.visionToFigma.get('烟雾机器人')).toBe('烟道机器人');
      expect(result.visionToFigma.get('3/740')).toBe('3/3740');
      expect(result.unmatchedVision).toEqual(['臆造文字']);
    });

    it('L12f: 嵌套 Figma TEXT 节点正确收集', () => {
      const visionElements = [
        { text: '测试', bbox: { x: 300, y: 200, width: 60, height: 18 } }, // 与嵌套的「3/3740」重叠
      ];
      const result = crossValidateVisionTexts(visionElements, figmaNodeData);
      expect(result.visionToFigma.get('测试')).toBe('3/3740');
    });

    it('L12g: 空 bbox 或无效尺寸返回 0 IoU', () => {
      const visionElements = [
        { text: '监控', bbox: { x: 100, y: 100, width: 0, height: 20 } }, // width=0
      ];
      const result = crossValidateVisionTexts(visionElements, figmaNodeData);
      expect(result.visionToFigma.size).toBe(0);
      expect(result.unmatchedVision).toEqual(['监控']);
    });
  });

  describe('buildVisionFigmaCrossSection', () => {
    it('L12h: 无交叉验证结果返回空串', () => {
      const result = buildVisionFigmaCrossSection([], figmaNodeData);
      expect(result).toBe('');
    });

    it('L12i: 生成 Markdown 表格', () => {
      const visionElements = [
        { text: '挖掘机', bbox: { x: 100, y: 100, width: 80, height: 20 } },
        { text: '臆造', bbox: { x: 999, y: 999, width: 80, height: 20 } },
      ];
      const result = buildVisionFigmaCrossSection(visionElements, figmaNodeData);
      expect(result).toContain('✅ Vision-Figma 交叉验证');
      expect(result).toContain('| `挖掘机` | `监控` |');
      expect(result).toContain('⚠️ 未配对的 Vision 文字');
      expect(result).toContain('- `臆造`');
    });
  });
});
