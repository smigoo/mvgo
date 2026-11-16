/**
 * 🛡️ S1-a（2026-11-16 · mc-max-1794759571672-75d5786e 实锤）：面板级 header 不得当段头渲染。
 *
 * 病灶：段锚点是折叠列表的**首卡**（`48:5798`），P0-8b 把**面板级 header 组**（`565:2`，
 *   图根 `48:5796` 的直接子级、与段所属容器 `565:3 slot-con` 同级、内含 panel headerSlot
 *   「全国」）并进 `sourceNodeIds` ⇒ 段内又画一遍面板标题（30 + gap 25 = 55px），
 *   段高真值 532 只覆盖 6 张卡 ⇒ `532 − 55 = 477`，第 6 卡被 `overflow-y:auto` 裁出可视区，
 *   渲染端按未裁剪的 `getBoundingClientRect` 判成 RUNTIME-016（ratio 0.89），
 *   D2 回灌 3 轮恒不清零（`2→2→1`，最后一对是恒存项）。
 *
 * 判据（纯几何/层级，零命名）：三条件同时成立才拒 ——
 *   ① 条是图根直接子级；② 条与段锚点所属容器同级或更高（祖先链位置 ≥ 2）；
 *   ③ 段盒不覆盖条。
 * 🔴 只有在**双闸同开**时才拒：单用条件③ 在 2178 个历史产物上会误杀 128 例合法副标题
 *   （`4sub-header`/`6sub-header`/`@antd/tab`/`tit`，盒未抬升或容器内兄弟条）。
 */
import { resolveSectionHeaderFacts } from './folded-grid-section-takeover.js';

const stripText = (text = '部署节点概览') => ({
  id: '2:51',
  type: 'TEXT',
  characters: text,
  absoluteBoundingBox: { x: 26, y: 50, width: 64, height: 18 },
  style: { fontSize: 18, fontWeight: 500 },
  fills: [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2, a: 1 } }],
});

/**
 * 谱系（与真机同形）：
 *   2:900 (root)
 *     ├─ 2:50  header 条 (y 45..75)
 *     └─ 2:90  slot-con
 *          └─ 2:100 首卡 (y 100, h 72)
 */
const buildIndex = ({ stripParent = '2:900', anchorParent = '2:90' } = {}) => {
  const strip = {
    id: '2:50',
    type: 'GROUP',
    name: 'header',
    absoluteBoundingBox: { x: 0, y: 45, width: 470, height: 30 },
    children: [stripText()],
  };
  const card = {
    id: '2:100',
    type: 'GROUP',
    absoluteBoundingBox: { x: 0, y: 100, width: 470, height: 72 },
    children: [],
  };
  const container = { id: '2:90', type: 'GROUP', case: anchorParent };
  return new Map([
    ['2:900', { rawNode: { id: '2:900', type: 'FRAME', name: 'root' }, bbox: { x: 0, y: 0, width: 510, height: 665 } }],
    ['2:50', { rawNode: strip, bbox: strip.absoluteBoundingBox, parentId: stripParent }],
    ['2:100', { rawNode: card, bbox: card.absoluteBoundingBox, parentId: anchorParent }],
    ['2:90', { rawNode: container, bbox: { x: 0, y: 100, width: 470, height: 532 }, parentId: '2:900' }],
  ]);
};

const sec = (over = {}) => ({
  id: '2:100',
  header: { title: '部署节点概览' },
  sourceNodeIds: ['2:50'],
  absoluteBoundingBox: { x: 0, y: 100, width: 470, height: 532 },
  styles: { figmaHeightPx: 532 },
  ...over,
});

describe('S1-a 面板级 header 排他', () => {
  it('阴性对照（本单形态：条是图根直接子级 + 与容器同级 + 盒不覆盖）⇒ 不渲染，计 outOfBox', () => {
    const stats = { evaluated: 0, outOfBox: 0 };
    const hdr = resolveSectionHeaderFacts(sec(), buildIndex(), stats);
    expect(hdr).toBeNull();
    expect(stats).toEqual({ evaluated: 1, outOfBox: 1 });
  });

  it('阳性对照①（同父兄弟副标题 4sub-header 形态：条父=段锚点父）⇒ 仍渲染', () => {
    // 历史 46 例合法副标题的形态：条与段锚点同一父容器（容器内），父节点不是图根
    const stats = { evaluated: 0, outOfBox: 0 };
    const hdr = resolveSectionHeaderFacts(
      sec({ sourceNodeIds: ['2:50'] }),
      buildIndex({ stripParent: '2:90' }),
      stats,
    );
    expect(hdr).not.toBeNull();
    expect(stats).toEqual({ evaluated: 1, outOfBox: 0 });
  });

  it('阳性对照②（盒已抬升覆盖条：y=45、h=127）⇒ 仍渲染，真值逐项取自条', () => {
    const hdr = resolveSectionHeaderFacts(
      sec({
        absoluteBoundingBox: { x: 0, y: 45, width: 470, height: 127 },
        styles: { figmaHeightPx: 127 },
      }),
      buildIndex(),
    );
    expect(hdr).toMatchObject({
      title: '部署节点概览',
      height: 30,
      gap: 25,
      fontSize: 18,
      fontWeight: 500,
      paddingLeft: 26,
      stripId: '2:50',
    });
  });

  it('缺段盒真值 ⇒ 不参与判定（fail-open，保持 S1 旧行为）', () => {
    const stats = { evaluated: 0, outOfBox: 0 };
    const hdr = resolveSectionHeaderFacts(
      sec({ absoluteBoundingBox: undefined, styles: undefined }),
      buildIndex(),
      stats,
    );
    expect(hdr).not.toBeNull();
    // 没有盒证据 ⇒ 不进比对（evaluated=0 表示「没证据」，不是「比对通过」）
    expect(stats).toEqual({ evaluated: 0, outOfBox: 0 });
  });

  it('亚像素误差（条顶 45、盒顶 45.8）⇒ 容差内视为覆盖，仍渲染（防 Figma 小数盒误判）', () => {
    const hdr = resolveSectionHeaderFacts(
      sec({
        absoluteBoundingBox: { x: 0, y: 45.8, width: 470, height: 126.2 },
        styles: { figmaHeightPx: 126.2 },
      }),
      buildIndex(),
    );
    expect(hdr).not.toBeNull();
  });

  it('条在图根直接子级但段锚点也是图根直接子级（容器=根，位置 <2）⇒ 不拒（fail-open）', () => {
    // 段锚点直接挂在图根下：内容容器就是根，"容器外"这一层不存在，按旧行为渲染
    const idx = buildIndex({ stripParent: '2:900', anchorParent: '2:900' });
    const hdr = resolveSectionHeaderFacts(sec(), idx);
    expect(hdr).not.toBeNull();
  });
});
