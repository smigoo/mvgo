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

/**
 * 🛡️ bg 整体下载契约（2026-11-13 · 用户指令「只要是 bg/bg-xxx 的都作为整体下载 不循环内部」）
 * 病灶（0669e091 统计卡实锤）：bg-[m] 完整子树下发 LLM ⇒ CSS 手绘 deco 三层重复渲染；
 * 资源侧 11-10 容器壳双轨下钻 ⇒ 内部车徽章/光晕组又下载挂 <img> ⇒ 车图叠字。
 * 契约：命名即契约——bg/bg-xxx/bg_xxx/bg 空格/背景/background 命名的节点：
 *   ① 结构侧 children 剪除 + wholeImageResource 标记；② 资源侧 push 后不再下钻。
 *   不区分节点类型（FRAME/GROUP 皆同判）。
 */
describe('pruneRedundantFields · bg 命名整体下载契约（剪子树 + wholeImageResource 标记）', () => {
  const conn = new FigmaConnector({ figmaToken: 'fake-token-for-test' });

  const mkBgNode = (name: string) => ({
    id: '88:34',
    name,
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 426, height: 91 },
    fills: [],
    children: [
      {
        id: '2:3662',
        name: 'Vector',
        type: 'VECTOR',
        strokes: [{ type: 'GRADIENT_LINEAR' }],
      },
      {
        id: '2:3670',
        name: 'Group 1321318547',
        type: 'GROUP',
        children: [
          {
            id: '2:7458',
            name: 'image 2136639306',
            type: 'RECTANGLE',
            fills: [
              { type: 'IMAGE', visible: true, imageRef: 'hash-abc' },
            ],
          },
        ],
      },
    ],
  });

  it.each(['bg-[m]', 'bg', 'bg-header', 'bg_x', 'bg main', '顶部背景', 'background-layer'])(
    'bg 命名变体 %s：children 剪除 + wholeImageResource 标记 + 自身字段保留',
    (name) => {
      const pruned = conn.pruneRedundantFields(mkBgNode(name) as any);
      expect(pruned.children).toEqual([]);
      expect(pruned.wholeImageResource).toBe(true);
      expect(pruned.id).toBe('88:34');
      expect(pruned.absoluteBoundingBox).toEqual({
        x: 0,
        y: 0,
        width: 426,
        height: 91,
      });
    },
  );

  it('非 bg 命名节点：children 正常递归（不受契约误伤）', () => {
    const pruned = conn.pruneRedundantFields({
      id: '1744:126',
      name: 'cards',
      type: 'FRAME',
      children: [
        { id: '2:3683', name: 'Group 1321318553', type: 'GROUP', children: [] },
      ],
    } as any);
    expect(pruned.wholeImageResource).toBeUndefined();
    expect(pruned.children).toHaveLength(1);
    expect(pruned.children[0].id).toBe('2:3683');
  });

  it('bg 命名嵌套在深层时同样生效（逐节点判定，非仅根）', () => {
    const pruned = conn.pruneRedundantFields({
      id: '2:3660',
      name: '1统计',
      type: 'FRAME',
      children: [mkBgNode('bg-[m]') as any],
    } as any);
    expect(pruned.children[0].wholeImageResource).toBe(true);
    expect(pruned.children[0].children).toEqual([]);
  });
});

describe('extractResourceNodes · bg 命名禁下钻（11-10 容器壳双轨在 bg 命名上关闭）', () => {
  const conn = new FigmaConnector({ figmaToken: 'fake-token-for-test' });

  const mkCarBg = () => ({
    id: '88:34',
    name: 'bg-[m]',
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width: 426, height: 91 },
    fills: [],
    children: [
      { id: '2:3664', name: 'Group', type: 'GROUP', children: [{ id: '2:3665', name: 'Vector', type: 'VECTOR' }] },
      {
        id: '2:3670',
        name: 'Group 1321318547',
        type: 'GROUP',
        absoluteBoundingBox: { x: 164, y: 0, width: 90, height: 86 },
        children: [
          {
            id: '2:7458',
            name: 'image 2136639306',
            type: 'RECTANGLE',
            absoluteBoundingBox: { x: 179, y: 13, width: 62, height: 62 },
            fills: [{ type: 'IMAGE', visible: true, imageRef: 'hash-abc' }],
          },
        ],
      },
    ],
  });

  it('bg-[m] 整体入清单，内部子组（含 IMAGE fill 叶子）不再下钻收集', () => {
    // ⚠️ bg 必须嵌在根的**非直接子**层：根的直接子 bg 命中「透明底要求」跳过分支
    //    （M6-3a/3b，与整体下载契约无关）。真实管线 0669e091 中 bg-[m] 在 1统计 下两层。
    const root = {
      id: '2:9778',
      name: '流量监测',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 426, height: 720 },
      children: [
        {
          id: '2:3660',
          name: '1统计',
          type: 'FRAME',
          absoluteBoundingBox: { x: 0, y: 0, width: 426, height: 91 },
          children: [mkCarBg() as any],
        },
      ],
    };
    const collected = conn.extractResourceNodes(root as any, [], true, []);
    const ids = collected.map((n: any) => String(n.id));
    expect(ids).toContain('88:34'); // bg 整体导出
    expect(ids).not.toContain('2:7458'); // 子 IMAGE 叶子不再收集
    expect(ids).not.toContain('2:3670'); // 子矢量组不再收集
  });

  it('阴性（11-10 保真）：icon 命名容器壳仍下钻收集子图（不铺满包含，让位不命中）', () => {
    // ⚠️ 内图须**不被壳铺满**（宽高差 >8px）：铺满包含会命中 11-11「组合图标内层位图让位」
    //    （dd5791ba，独立根治，语义正确），那不是 11-10 下钻的管辖区。
    const iconShell = {
      id: '136:123',
      name: 'icon',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 90, height: 90 },
      fills: [],
      children: [
        {
          id: '2:8060',
          name: 'jimeng-base',
          type: 'RECTANGLE',
          absoluteBoundingBox: { x: 4, y: 4, width: 47.5, height: 47.5 },
          fills: [{ type: 'IMAGE', visible: true, imageRef: 'hash-jimeng' }],
        },
      ],
    };
    const root = {
      id: 'card',
      name: 'card',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 200 },
      children: [iconShell],
    };
    const collected = conn.extractResourceNodes(root as any, [], true, []);
    const ids = collected.map((n: any) => String(n.id));
    expect(ids).toContain('136:123'); // 壳整体导出
    expect(ids).toContain('2:8060'); // 子 IMAGE 叶子仍被收集（11-10 根治保真）
  });
});
