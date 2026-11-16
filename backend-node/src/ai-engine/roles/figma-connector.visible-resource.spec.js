/**
 * visible:false 资源导出收口（2026-11-16）。
 * 隐藏节点仍保留布局 bbox，但不得进入图片导出或 resource mapping。
 */
import { FigmaConnector } from './figma-connector.js';

const fc = new FigmaConnector({ figmaToken: 'spec-dummy' });
const box = { x: 0, y: 0, width: 28, height: 28 };
const visibleImage = () => [{ type: 'IMAGE', visible: true, imageRef: 'visible-image' }];
const hiddenImage = () => [{ type: 'IMAGE', visible: false, imageRef: 'hidden-image' }];

const hiddenIcon = (overrides = {}) => ({
  id: 'hidden:icon',
  name: 'icon-1-385',
  type: 'RECTANGLE',
  visible: false,
  absoluteBoundingBox: box,
  fills: visibleImage(),
  ...overrides,
});

describe('资源导出 visible:false 收口', () => {
  it('阳性：visible:false 的命名 icon 不进入导出清单', () => {
    const stats = { hiddenNodesSkipped: 0, noVisiblePaintSkipped: 0 };
    const root = {
      id: 'root',
      name: 'root',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
      children: [hiddenIcon(), { id: 'layout-text', name: 'label', type: 'TEXT', characters: 'label' }],
    };
    const collected = fc.extractResourceNodes(root, [], true, [], stats);
    expect(collected.map((node) => node.id)).not.toContain('hidden:icon');
    expect(stats.hiddenNodesSkipped).toBe(1);
  });

  it('阳性：可见节点但所有 paint 均 visible:false 时不导出透明 PNG', () => {
    const stats = { hiddenNodesSkipped: 0, noVisiblePaintSkipped: 0 };
    const root = {
      id: 'root',
      name: 'root',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
      children: [{
        id: 'transparent:icon',
        name: 'icon-1-385',
        type: 'RECTANGLE',
        absoluteBoundingBox: box,
        fills: hiddenImage(),
      }],
    };
    const collected = fc.extractResourceNodes(root, [], true, [], stats);
    expect(collected.map((node) => node.id)).not.toContain('transparent:icon');
    expect(stats.noVisiblePaintSkipped).toBe(1);
  });

  it('阴性：可见组合 icon 的容器仍保留，不能因自身 fills 为空而误删', () => {
    const root = {
      id: 'root',
      name: 'root',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
      children: [{
        id: 'composite:icon',
        name: 'icon',
        type: 'FRAME',
        absoluteBoundingBox: box,
        children: [{
          id: 'composite:paint',
          name: 'Vector',
          type: 'VECTOR',
          absoluteBoundingBox: box,
          fills: [{ type: 'SOLID', visible: true, color: { r: 1, g: 0, b: 0 } }],
        }],
      }],
    };
    const ids = fc.extractResourceNodes(root).map((node) => node.id);
    expect(ids).toContain('composite:icon');
  });

  it('阴性：隐藏节点的布局 bbox 仍由 pruneRedundantFields 保留', () => {
    const pruned = fc.pruneRedundantFields(hiddenIcon());
    expect(pruned.name).toBe('');
    expect(pruned.fills?.[0]?.visible).toBe(true);
    expect(pruned.absoluteBoundingBox).toEqual(box);
  });

  it('阳性：映射侧不产生隐藏/透明资源 phantom 条目', () => {
    const root = {
      id: 'root',
      name: 'root',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
      children: [hiddenIcon(), { id: 'layout-text', name: 'label', type: 'TEXT', characters: 'label' }, {
        id: 'transparent:icon',
        name: 'icon-1-385',
        type: 'RECTANGLE',
        absoluteBoundingBox: box,
        fills: hiddenImage(),
      }],
    };
    const mapping = fc._buildResourceDomMapping(root, []);
    expect(mapping.map((item) => item.figmaNodeId)).not.toEqual(
      expect.arrayContaining(['hidden:icon', 'transparent:icon']),
    );
  });
});
