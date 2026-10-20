/**
 * 🛡️ 伪 icon 容器守卫 spec（2026-10-20 · mc-max-1792481134178-477e185d 实锤）
 *
 * 根因：'slot-icon' 命名的 **604×787 内容区容器** 被 _isWholeResourceByName 的
 * icon 命名命中 → 整体导出一张大图、整棵子树不再递归 → 面板内全部 vector icon
 * （38:3160/3164/3208 小标题 icon、187:262/263 头部大 icon）提取全灭，LLM 只能臆造。
 *
 * 修复：_isOversizedIconNamedContainer —— icon/图标/arrow/箭头 命名 + 容器类型
 * + max(边) > 96px ⇒ 拒绝整体导出，且**跳过「原子资源节点」push**，直落递归下钻。
 */
jest.mock('../../config/backend-root.js', () => ({
  workspaceRoot: process.cwd(),
  logsDir: process.cwd() + '/logs',
  backendRoot: process.cwd(),
  projectRoot: process.cwd(),
  customComponentsDir: process.cwd(),
  vue3ComponentsDir: process.cwd(),
  tempComponentsDir: process.cwd(),
  dataDir: process.cwd(),
  configDir: process.cwd(),
  resolveFrontendWorkspacePath: () => process.cwd(),
}), { virtual: true })

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { FigmaConnector } from './figma-connector.js';

const fc = new FigmaConnector({ figmaToken: 'spec-dummy' });

/** 合成节点助手：复刻 477e185d 真实形态 */
const bb = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h });

describe('_isOversizedIconNamedContainer（伪 icon 容器守卫）', () => {
  it('slot-icon 形态：GROUP + icon 命名 + 604×787 ⇒ 拦截（实锤复刻）', () => {
    expect(
      fc._isOversizedIconNamedContainer({
        id: '796:3', name: 'slot-icon', type: 'GROUP',
        absoluteBoundingBox: bb(0, 0, 604, 787), children: [],
      }),
    ).toBe(true);
  });

  it('阳性对照：真 icon（53×55 GROUP）⇒ 不拦截，保持整体导出', () => {
    expect(
      fc._isOversizedIconNamedContainer({
        id: '187:262', name: 'icon', type: 'GROUP',
        absoluteBoundingBox: bb(0, 0, 53, 55), children: [],
      }),
    ).toBe(false);
  });

  it('阳性对照：96px 边界内不拦 / 97px 起拦', () => {
    const mk = (w: number) => ({ id: 'x', name: 'icon', type: 'FRAME', absoluteBoundingBox: bb(0, 0, w, w), children: [] });
    expect(fc._isOversizedIconNamedContainer(mk(96))).toBe(false);
    expect(fc._isOversizedIconNamedContainer(mk(97))).toBe(true);
  });

  it('阳性对照：叶子 VECTOR 大图不受守卫（大插画整体导出合法）', () => {
    expect(
      fc._isOversizedIconNamedContainer({
        id: 'x', name: 'icon-banner', type: 'VECTOR',
        absoluteBoundingBox: bb(0, 0, 800, 200), children: [],
      }),
    ).toBe(false);
  });

  it('阳性对照：img/image/bg 命名大容器不在守卫范围（业务大图合法）', () => {
    expect(
      fc._isOversizedIconNamedContainer({
        id: 'x', name: 'slot-img', type: 'GROUP',
        absoluteBoundingBox: bb(0, 0, 604, 787), children: [],
      }),
    ).toBe(false);
  });
});

describe('extractResourceNodes × 伪 icon 容器（端到端）', () => {
  it('slot-icon 容器不再整体导出，子树小 icon 全量进提取', () => {
    // 复刻 477e185d 子树骨架：slot-icon(604×787) → 面板 → [标题icon, chips...]
    const tree = {
      id: 'root', name: '合作厂商弹窗', type: 'FRAME',
      absoluteBoundingBox: bb(0, 0, 660, 868),
      children: [
        {
          id: '796:3', name: 'slot-icon', type: 'GROUP',
          absoluteBoundingBox: bb(0, 0, 604, 787),
          children: [
            {
              id: '38:3137', name: 'Group 2136638432', type: 'GROUP',
              absoluteBoundingBox: bb(28, 161, 604, 161),
              children: [
                { id: '38:3160', name: 'icon-战略厂商', type: 'FRAME', absoluteBoundingBox: bb(48, 186, 16, 16), children: [{ id: '38:3161', name: 'Vector', type: 'VECTOR', absoluteBoundingBox: bb(48, 186, 15, 15), fills: [] }] },
              ],
            },
          ],
        },
        {
          id: '38:3260', name: 'Group 2136638431', type: 'GROUP',
          absoluteBoundingBox: bb(34, 52, 265, 76),
          children: [
            { id: '187:262', name: 'icon', type: 'GROUP', absoluteBoundingBox: bb(54, 65, 53, 55), children: [{ id: '38:3267', name: 'Vector', type: 'VECTOR', absoluteBoundingBox: bb(54, 65, 32, 13), fills: [] }] },
          ],
        },
      ],
    };
    const out = fc.extractResourceNodes(tree as any);
    const ids = out.map((n: any) => String(n.id));
    expect(ids).not.toContain('796:3');          // 不再整体导出
    expect(ids).toContain('38:3160');            // 面板小标题 icon 进提取
    expect(ids).toContain('187:262');            // 头部大 icon 整体导出
  });

  it('阳性对照：tabs-icon 多 icon 容器拆分行为不回退', () => {
    const tree = {
      id: 'tabs-1', name: 'tabs-icon', type: 'FRAME',
      absoluteBoundingBox: bb(0, 0, 104, 48),
      children: [
        { id: 't1', name: 'icon', type: 'GROUP', absoluteBoundingBox: bb(0, 0, 24, 24), children: [] },
        { id: 't2', name: 'icon', type: 'GROUP', absoluteBoundingBox: bb(28, 0, 24, 24), children: [] },
      ],
    };
    const out = fc.extractResourceNodes(tree as any);
    const ids = out.map((n: any) => String(n.id));
    expect(ids).toEqual(expect.arrayContaining(['t1', 't2']));
  });
});

describe('真实缓存重放（38:3134，fixture 缺失时 SKIP）', () => {
  const REAL = join(process.cwd(), '..', 'temp-components', '_shared-cache', 'GTcJm0DKQvcJvcOZTh5n1l', '38:3134', 'figma.json');
  it((existsSync(REAL) ? '5 枚 vector icon 全量进提取（796:3 不再整体导出）' : 'SKIP：真实缓存缺失'), () => {
    if (!existsSync(REAL)) return;
    const raw = JSON.parse(readFileSync(REAL, 'utf-8'));
    const doc = raw.document || raw;
    const out = fc.extractResourceNodes(doc);
    const ids = out.map((n: any) => String(n.id));
    for (const id of ['187:262', '187:263', '38:3160', '38:3164', '38:3208']) {
      expect(ids).toContain(id);
    }
    expect(ids).not.toContain('796:3');
  });
});
