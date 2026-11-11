/**
 * 🛡️ 组合图标内层位图让位 spec（2026-11-11 · 根治① · c-vehicle-monitor-dd5791ba 实锤）
 *
 * 病灶：卡片图标是 Figma 组合容器（136:123 "icon" FRAME 48×52 = 橙色 Mask group +
 * jimeng 原始底图）。容器整体导出 1 张组合图（橙色）后，内部铺满的 IMAGE fill
 * 原始位图（jimeng 灰白底图）仍被「IMAGE fill 优先」规则独立分类成 icon 入清单
 * ⇒ 与组合图竞争挂载位，绑定错位后 2/3 号卡图标渲染成灰白底图。
 *
 * 修复：_identifyNodeType 增加第 3 参 ancestors + _isCoveredIconLayer 判据——
 * 祖先链中存在「会被整体导出（分类 ∈ icon/bg/image，icon ≤96px）且铺满 node」
 * 的 GROUP/FRAME 祖先 ⇒ node 判 unknown（不入下载清单、不进映射，两侧同判据）。
 * 下载侧 extractResourceNodes 与映射侧 _buildResourceDomMapping 均贯穿祖先链。
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

import { FigmaConnector } from './figma-connector.js';

const fc = new FigmaConnector({ figmaToken: 'spec-dummy' });
const bb = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h });
const imgFill = (visible = true) => [{ type: 'IMAGE', visible, imageRef: 'spec' }];

/** dd5791ba 真实形态复刻：icon FRAME(136:123) ⊃ [jimeng RECT(2:8060), Mask group(2:8061) ⊃ jimeng RECT(2:8062)] */
const mkComposite = () => ({
  id: '136:123', name: 'icon', type: 'FRAME',
  absoluteBoundingBox: bb(302.5, 999.2, 47.5, 52.3),
  children: [
    { id: '2:8060', name: 'jimeng-2026-03-17-5193-超高客车图标_1', type: 'RECTANGLE',
      absoluteBoundingBox: bb(302.5, 999.2, 47.5, 47.5), fills: imgFill() },
    { id: '2:8061', name: 'Mask group', type: 'GROUP',
      absoluteBoundingBox: bb(302.5, 1003.2, 47.5, 47.5),
      children: [
        { id: '2:8062', name: 'jimeng-2026-03-17-5193-超高客车图标_2', type: 'RECTANGLE',
          absoluteBoundingBox: bb(302.5, 1003.2, 47.5, 47.5), fills: imgFill() },
      ] },
  ],
});

describe('_isCoveredIconLayer / _identifyNodeType 组合图标内层位图让位', () => {
  it('① 阳性实锤：jimeng 底图（父 icon FRAME 铺满）⇒ unknown 不入候选', () => {
    const composite = mkComposite();
    const inner = composite.children[0];
    const t = fc._identifyNodeType(inner.name, inner, [composite]);
    expect(t).toBe('unknown');
  });

  it('② 阳性上溯：父 Mask group 分类 unknown ⇒ 沿祖先链命中 icon FRAME', () => {
    const composite = mkComposite();
    const mask = composite.children[1];
    const inner = mask.children[0];
    const t = fc._identifyNodeType(inner.name, inner, [mask, composite]);
    expect(t).toBe('unknown');
  });

  it('③ 阴性保护：bg(140×74) 内 18×18 独立小 icon（不铺满）⇒ 保持 icon', () => {
    const bgFrame = { id: '136:125', name: 'bg', type: 'FRAME',
      absoluteBoundingBox: bb(37, 984, 140, 74), children: [] };
    const icon = { id: '2:8100', name: 'Frame', type: 'RECTANGLE',
      absoluteBoundingBox: bb(40, 987, 18, 18), fills: imgFill() };
    expect(fc._identifyNodeType(icon.name, icon, [bgFrame])).toBe('icon');
  });

  it('④ 阴性保护：无祖先链（根节点/旧调用方）⇒ 行为不变判 icon', () => {
    const inner = mkComposite().children[0];
    expect(fc._identifyNodeType(inner.name, inner)).toBe('icon');
    expect(fc._identifyNodeType(inner.name, inner, [])).toBe('icon');
  });

  it('⑤ 阴性保护：icon 命名但 >96px（伪 icon 大容器不整体导出）⇒ 不让位（按自身几何判 bg）', () => {
    const big = { id: 'x:1', name: 'slot-icon', type: 'GROUP',
      absoluteBoundingBox: bb(0, 0, 604, 787), children: [] };
    const inner = { id: 'x:2', name: 'jimeng-xx', type: 'RECTANGLE',
      absoluteBoundingBox: bb(0, 0, 600, 780), fills: imgFill() };
    // 覆盖者不存在 ⇒ 不让位；位图按自身几何（>200px）独立判 bg，资源不丢
    expect(fc._identifyNodeType(inner.name, inner, [big])).toBe('bg');
  });

  it('⑥ 阴性保护：bg 命名祖先（合法整体导出大图）铺满 ⇒ 让位（bg 帧渲染已含子图）', () => {
    const bgFrame = { id: 'b:1', name: 'bg', type: 'FRAME',
      absoluteBoundingBox: bb(0, 0, 390, 200), children: [] };
    const inner = { id: 'b:2', name: 'jimeng-bg-photo', type: 'RECTANGLE',
      absoluteBoundingBox: bb(0, 0, 390, 198), fills: imgFill() };
    expect(fc._identifyNodeType(inner.name, inner, [bgFrame])).toBe('unknown');
  });

  it('⑦ 集成（下载侧）：extractResourceNodes 收集清单含组合容器、不含内层位图', () => {
    const tree = {
      id: '0:0', name: 'root', type: 'FRAME', absoluteBoundingBox: bb(0, 0, 400, 1100),
      children: [
        mkComposite(),
        // 同卡区域内独立小 icon（必须保留）
        { id: 'keep:1', name: 'icon', type: 'GROUP',
          absoluteBoundingBox: bb(310, 1070, 16, 16),
          children: [{ id: 'keep:2', name: 'Vector', type: 'VECTOR',
            absoluteBoundingBox: bb(310, 1070, 16, 16) }] },
      ],
    };
    const collected = fc.extractResourceNodes(JSON.parse(JSON.stringify(tree)));
    const ids = collected.map((n: any) => n.id);
    expect(ids).toContain('136:123');      // 组合容器整体导出
    expect(ids).toContain('keep:1');       // 独立小 icon 保留
    expect(ids).not.toContain('2:8060');   // 内层位图让位
    expect(ids).not.toContain('2:8062');
  });

  it('⑧ 集成（映射侧）：_buildResourceDomMapping 无内层位图条目（两侧同判据，无幻影 missing）', () => {
    const tree = {
      id: '0:0', name: 'root', type: 'FRAME', absoluteBoundingBox: bb(0, 0, 400, 1100),
      children: [mkComposite()],
    };
    const mapping = fc._buildResourceDomMapping(JSON.parse(JSON.stringify(tree)), []);
    const ids = mapping.map((m: any) => m.figmaNodeId || m.nodeId || m.id);
    expect(ids).toContain('136:123');
    expect(ids).not.toContain('2:8060');
    expect(ids).not.toContain('2:8062');
  });
});
