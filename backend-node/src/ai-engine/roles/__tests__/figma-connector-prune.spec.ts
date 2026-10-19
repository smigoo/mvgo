/**
 * R5-visible（2026-09-15）：pruneRedundantFields 过滤 Figma 隐藏节点（visible:false）。
 * 事故：「*数据实时更新」是设计师放的隐藏注释节点（* 前缀 + visible:false），在 Figma 界面
 * 不可见，但 Figma API 仍返回 name/characters。旧过滤只清 characters 不清 name →
 * extractFigmaHints 用 name 提取结构摘要 → 泄漏进 vision prompt → LLM 当 UI 文本照抄。
 * 治本：visible:false 节点清 name+characters（保留 bbox 供布局）。
 */
import { FigmaConnector } from '../figma-connector.js';

// backend-root.js 用 import.meta.url（ESM），jest CJS 下无法加载 → mock 掉路径解析
jest.mock('../../../config/backend-root.js', () => {
  const root = '/Users/smigoo/工作/mvgo/backend-node';
  return {
    backendRoot: root,
    projectRoot: '/Users/smigoo/工作/mvgo',
    workspaceRoot: `${root}/workspace`,
    customComponentsDir: `${root}/workspace/custom-components`,
    vue3ComponentsDir: `${root}/workspace/vue3-components`,
    resolveFrontendWorkspacePath: () => '/Users/smigoo/工作/mvgo/frontend/workspace',
    frontendCustomComponentsDir: () => '/Users/smigoo/工作/mvgo/frontend/workspace/custom-components',
    frontendVue3ComponentsDir: () => '/Users/smigoo/工作/mvgo/frontend/workspace/vue3-components',
    tempComponentsDir: '/Users/smigoo/工作/mvgo/temp-components',
    dataDir: `${root}/data`,
    logsDir: `${root}/logs`,
    configDir: `${root}/config`,
    chatAttachmentsDir: `${root}/temp-chat-attachments`,
    apifoxZipsDir: `${root}/data/apifox-zips`,
    apiCatalogsDir: `${root}/data/api-catalogs`,
  };
});

describe('pruneRedundantFields · visible:false 隐藏节点过滤', () => {
  const conn = new FigmaConnector({ figmaToken: 'fake-token-for-test' });

  const mkText = (id, name, visible) => ({
    id,
    name,
    type: 'TEXT',
    visible,
    absoluteBoundingBox: { x: 10, y: 10, width: 91, height: 21 },
    characters: name,
  });

  it('visible:false 节点：清 name + 不保留 characters，但保留 bbox/type', () => {
    const pruned = conn.pruneRedundantFields(
      mkText('2:1', '*数据实时更新', false),
    );
    expect(pruned.name).toBe('');
    expect(pruned.characters).toBeUndefined();
    expect(pruned.type).toBe('TEXT');
    expect(pruned.absoluteBoundingBox).toEqual({
      x: 10,
      y: 10,
      width: 91,
      height: 21,
    });
  });

  it('visible:true / visible 缺失节点：name + characters 正常保留', () => {
    const visibleTrue = conn.pruneRedundantFields(
      mkText('2:2', '设备监测', true),
    );
    expect(visibleTrue.name).toBe('设备监测');
    expect(visibleTrue.characters).toBe('设备监测');

    // 兼容旧数据：visible 字段缺失（undefined）≠ false，不受影响
    const noVisible = conn.pruneRedundantFields({
      id: '2:3',
      name: '设备总数',
      type: 'TEXT',
      characters: '设备总数',
    });
    expect(noVisible.name).toBe('设备总数');
    expect(noVisible.characters).toBe('设备总数');
  });

  it('嵌套子树：隐藏节点过滤，可见兄弟节点保留', () => {
    const tree = {
      id: '0:1',
      name: 'header',
      type: 'FRAME',
      children: [
        mkText('2:1', '*数据实时更新', false),
        mkText('2:2', '设备监测', true),
      ],
    };
    const pruned = conn.pruneRedundantFields(tree);
    expect(pruned.children[0].name).toBe('');
    expect(pruned.children[0].characters).toBeUndefined();
    expect(pruned.children[1].name).toBe('设备监测');
    expect(pruned.children[1].characters).toBe('设备监测');
  });
});

/**
 * Auto Layout 属性保留（布局保真回归门禁）
 * 背景：曾有误判「pruneRedundantFields 误删 layoutMode 致布局错误」。git blame 证实 layoutMode 等
 * Auto Layout 属性自 2026-08-28(e05cab41) 起即被显式保留。本组用例固化该行为，防止重构时
 * 误删或凭空注入，导致 Figma→Vue3 / 微码组件 flex 映射失真。
 */
describe('pruneRedundantFields · Auto Layout 属性保留（布局保真）', () => {
  const conn = new FigmaConnector({ figmaToken: 'fake-token-for-test' });

  const mkFrame = (overrides: Record<string, unknown> = {}) => ({
    id: '1:1',
    name: 'root',
    type: 'FRAME',
    layoutMode: 'HORIZONTAL',
    primaryAxisAlignItems: 'SPACE_BETWEEN',
    counterAxisAlignItems: 'CENTER',
    itemSpacing: 12,
    layoutWrap: 'WRAP',
    primaryAxisSizingMode: 'FIXED',
    counterAxisSizingMode: 'AUTO',
    clipsContent: true,
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 4,
    paddingBottom: 4,
    absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 40 },
    children: [],
    ...overrides,
  });

  it('FRAME 的 Auto Layout 属性全部保留（不误删 layoutMode 等）', () => {
    const pruned = conn.pruneRedundantFields(mkFrame() as any);
    expect(pruned.layoutMode).toBe('HORIZONTAL');
    expect(pruned.primaryAxisAlignItems).toBe('SPACE_BETWEEN');
    expect(pruned.counterAxisAlignItems).toBe('CENTER');
    expect(pruned.itemSpacing).toBe(12);
    expect(pruned.layoutWrap).toBe('WRAP');
    expect(pruned.primaryAxisSizingMode).toBe('FIXED');
    expect(pruned.counterAxisSizingMode).toBe('AUTO');
    expect(pruned.clipsContent).toBe(true);
    expect(pruned.paddingLeft).toBe(8);
    expect(pruned.paddingRight).toBe(8);
    expect(pruned.paddingTop).toBe(4);
    expect(pruned.paddingBottom).toBe(4);
  });

  it('嵌套子 FRAME 各自保留自身 Auto Layout（不向上/向下污染）', () => {
    const tree = mkFrame({
      children: [
        mkFrame({ id: '2:1', name: 'child', layoutMode: 'VERTICAL', itemSpacing: 6 }),
      ],
    });
    const pruned = conn.pruneRedundantFields(tree as any);
    expect(pruned.layoutMode).toBe('HORIZONTAL');
    expect(pruned.children[0].layoutMode).toBe('VERTICAL');
    expect(pruned.children[0].itemSpacing).toBe(6);
  });

  it('无 Auto Layout 的节点不凭空注入 layoutMode', () => {
    const pruned = conn.pruneRedundantFields({
      id: '3:1',
      name: 'plain',
      type: 'RECTANGLE',
      absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 },
    } as any);
    expect(pruned.layoutMode).toBeUndefined();
  });
});

describe('pruneRedundantFields · fill/stroke 透明度保留（2026-10-19，c-aiot-dpjh-bsjd-44268ffe 实锤）', () => {
  const conn = new FigmaConnector({ figmaToken: 'fake-token-for-test' });

  it('SOLID fill.opacity=0.43 必须保留（卡片「白 43% 叠蓝底」不能退化成不透明白）', () => {
    const pruned = conn.pruneRedundantFields({
      id: '48:5814',
      name: 'Rectangle 346242317',
      type: 'RECTANGLE',
      absoluteBoundingBox: { x: 0, y: 0, width: 470, height: 72 },
      fills: [
        {
          type: 'SOLID',
          blendMode: 'NORMAL',
          opacity: 0.4300000071525574,
          color: { r: 1, g: 1, b: 1, a: 1 },
        },
      ],
    } as any);
    expect(pruned.fills[0].opacity).toBeCloseTo(0.43, 5);
    expect(pruned.fills[0].color).toEqual({ r: 1, g: 1, b: 1, a: 1 });
  });

  it('fill.opacity=1 同样保留（不误删合法实底）', () => {
    const pruned = conn.pruneRedundantFields({
      id: '48:5799',
      name: 'rect',
      type: 'RECTANGLE',
      fills: [{ type: 'SOLID', opacity: 1, color: { r: 0.65, g: 0.81, b: 1, a: 1 } }],
    } as any);
    expect(pruned.fills[0].opacity).toBe(1);
  });

  it('stroke.opacity 保留（半透明描边不退化为实色）', () => {
    const pruned = conn.pruneRedundantFields({
      id: '9:1',
      name: 'bar',
      type: 'RECTANGLE',
      fills: [],
      strokes: [{ type: 'SOLID', opacity: 0.1, color: { r: 1, g: 0, b: 0, a: 1 } }],
      strokeWeight: 1,
    } as any);
    expect(pruned.strokes[0].opacity).toBe(0.1);
  });

  it('opacity 缺省时不凭空注入（保持旧字段形状）', () => {
    const pruned = conn.pruneRedundantFields({
      id: '9:2',
      name: 'rect',
      type: 'RECTANGLE',
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 0.5 } }],
    } as any);
    expect('opacity' in pruned.fills[0]).toBe(false);
    expect(pruned.fills[0].color.a).toBe(0.5);
  });
});
