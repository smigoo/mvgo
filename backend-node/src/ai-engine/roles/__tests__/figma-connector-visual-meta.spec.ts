/**
 * `_extractVisualMeta` 的 fillsSummary 修复回归（2026-09-15 · mc-max-1789452271404-7e0e19d2 实锤）。
 *
 * 缺陷：生成 `visualMeta.fillsSummary` 时对渐变**只取每个 stop 的 `s.opacity`**
 * （Figma 里通常缺省 → 1），**丢掉填充级 `g.opacity`**，且**不带方向**。
 * 后果（真机）：
 *  · 设计稿 tabs-list 底图 `2:7890` = `GRADIENT_LINEAR`，`fill.opacity = 0.6`，方向**水平**
 *    （handlePositions 同 y、x 递增 → 90deg）；
 *  · 旧实现输出 `linear-gradient(#b5deff 0%, #d1ecff 100%)` —— **不透明 + 无方向**；
 *  · 该值经 prompt 进模型 → 产物里出现在 `.c-env-monitor-tab-item` 上，模型还自己编了 `180deg`
 *    （把横向渐变写成了纵向），且因不透明盖住了本该显示的图片。
 *
 * 修法：`s.opacity ?? fill.opacity ?? 1`（_rgbaToHex 在 opacity<1 时输出 #rrggbbaa）
 *      + 方向由 `_gradientAngleDeg(gradientHandlePositions)` 推导（与「可复现 CSS」路径同口径）。
 */
import { FigmaConnector } from '../figma-connector.js';

// backend-root.js 用 import.meta.url（ESM），jest CJS 下无法加载 → 与既有 spec 同款 mock
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

describe('_extractVisualMeta · fillsSummary 透明度与方向', () => {
  const conn = new FigmaConnector({ figmaToken: 'fake-token-for-test' });
  const meta = (node: any) => (conn as any)._extractVisualMeta(node);

  /** 真机形态：2:7890（tabs-list/bg）—— 半透明横向渐变 */
  const realNode = {
    id: '2:7890',
    name: 'bg',
    type: 'VECTOR',
    absoluteBoundingBox: { x: 1495, y: 903, width: 295, height: 27 },
    fills: [
      {
        type: 'GRADIENT_LINEAR',
        opacity: 0.6,
        gradientHandlePositions: [
          { x: 0.23459953461005056, y: 0.5575227331187858 },
          { x: 1.0305352800008925, y: 0.5575224044428122 },
          { x: 0.28547364389353747, y: 16.88245642363296 },
        ],
        gradientStops: [
          { color: { r: 0.7094744443893433, g: 0.8699745535850525, b: 1, a: 1 }, position: 0 },
          { color: { r: 0.8196078538894653, g: 0.9254902005195618, b: 1, a: 1 }, position: 1 },
        ],
      },
    ],
  };

  it('真机形态：输出带填充透明度(#rrggbbaa)与真实方向(90deg，横向)', () => {
    expect(meta(realNode).fillsSummary).toBe(
      'linear-gradient(90deg, #b5deff99 0%, #d1ecff99 100%)',
    );
  });

  it('回归保护：旧行为（不透明、无方向）不得再现', () => {
    const s = meta(realNode).fillsSummary;
    expect(s).not.toBe('linear-gradient(#b5deff 0%, #d1ecff 100%)');
    expect(s).toContain('deg');
    expect(s).toContain('99'); // 0.6 → alpha 153 = 0x99
  });

  it('方向推导：垂直向下 → 180deg；水平向右 → 90deg；无 handle → 180deg', () => {
    const withHandles = (p0: any, p1: any) => ({
      ...realNode,
      fills: [
        {
          ...realNode.fills[0],
          opacity: undefined,
          gradientHandlePositions: [p0, p1],
        },
      ],
    });
    expect(meta(withHandles({ x: 0, y: 0 }, { x: 0, y: 1 })).fillsSummary).toContain('180deg');
    expect(meta(withHandles({ x: 0, y: 0 }, { x: 1, y: 0 })).fillsSummary).toContain('90deg');
    const noHandle = { ...realNode, fills: [{ ...realNode.fills[0], opacity: undefined, gradientHandlePositions: undefined }] };
    expect(meta(noHandle).fillsSummary).toContain('180deg');
  });

  it('stop 级不透明度优先于填充级（两者都存在时取 stop）', () => {
    const node = {
      ...realNode,
      fills: [
        {
          ...realNode.fills[0],
          opacity: 0.6,
          gradientStops: [
            { color: { r: 1, g: 0, b: 0, a: 1 }, position: 0, opacity: 1 },
            { color: { r: 0, g: 0, b: 1, a: 1 }, position: 1, opacity: 0.5 },
          ],
        },
      ],
    };
    const s = meta(node).fillsSummary;
    expect(s).toContain('#ff0000 '); // stop opacity=1 → 不带 alpha
    expect(s).toContain('#0000ff80'); // stop opacity=0.5 → alpha 0x80
  });

  it('SOLID + 填充透明度：仍输出带 alpha 的色值（既有行为不回归）', () => {
    const node = {
      id: 'x',
      name: 'bg',
      type: 'RECTANGLE',
      fills: [{ type: 'SOLID', opacity: 0.5, color: { r: 1, g: 0, b: 0 } }],
    };
    expect(meta(node).fillsSummary).toBe('#ff000080');
  });
});
