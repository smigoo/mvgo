/**
 * 🔴 P0-3（2026-11-11 交接文档 L2）：table 接管结构签名否决。
 * 病灶：vision type=null ⇒ T-CONTRACT fail-open ⇒ 纯几何把「图表卡」判成表格
 * ⇒ kind=table 确定性接管（整文件不进 LLM chunk）⇒ 车型分布 2:3438 子树含
 * `246:30 @echarts` + `bg-[m]` 被渲染成 `<a-table>`（交接文档 §2 实锤）。
 */
import {
  detectTableLeaf,
  memberSubtreeBlockedSignature,
  buildParentMap,
} from './folded-grid-section-takeover.js';
import { indexFigmaNodes } from './section-tree.js';

const mkIndex = (kids) => indexFigmaNodes(mkTree(kids).document);

const mkTree = (kids) => ({
  document: {
    id: '0:0',
    children: [{ id: '2:3438', name: '车型分布', type: 'FRAME', children: kids }],
  },
});

describe('P0-3 memberSubtreeBlockedSignature（结构签名扫描）', () => {
  const figmaIndex = mkIndex([
    { id: '246:30', name: '@echarts/柱状图', type: 'FRAME' },
    { id: 'bgx', name: 'bg-[m]', type: 'RECTANGLE' },
  ]);
  const anchorNode = figmaIndex.get('2:3438').rawNode;

  it('① 命中 @echarts 图表标记', () => {
    expect(memberSubtreeBlockedSignature([anchorNode])).toBe('chart:@echarts/柱状图');
  });

  it('② 无签名子树返回 null', () => {
    const idx2 = mkIndex([
      { id: 'c1', name: '客车', type: 'TEXT' },
      { id: 'c2', name: 'img-1', type: 'RECTANGLE' },
    ]);
    expect(memberSubtreeBlockedSignature([idx2.get('2:3438').rawNode])).toBeNull();
  });

  it('③ 非法入参不抛', () => {
    expect(memberSubtreeBlockedSignature(null)).toBeNull();
    expect(memberSubtreeBlockedSignature([null, {}])).toBeNull();
  });
});

describe('P0-3 detectTableLeaf 结构否决（T-CONTRACT fail-open 补口）', () => {
  const sec = { id: '2:3438', type: null, sourceNodeIds: ['2:3438'] };

  it('① 阳性：type=null + 子树含 @echarts ⇒ 拒绝接管（memberSubtreeBlocked）', () => {
    const figmaIndex = mkIndex([
      { id: '246:30', name: '@echarts/环形图', type: 'FRAME' },
      { id: 'h1', type: 'TEXT', characters: '客车' },
      { id: 'h2', type: 'TEXT', characters: '货车' },
    ]);
    const r = detectTableLeaf(sec, figmaIndex, buildParentMap(figmaIndex), undefined);
    expect(r.ok).toBe(false);
    expect(String(r.reason).startsWith('memberSubtreeBlocked:chart:')).toBe(true);
  });

  it('② 阳性：子树含 bg-[m] 背景层 ⇒ 同样否决', () => {
    const figmaIndex = mkIndex([
      { id: 'bgx', name: 'bg-[m]', type: 'RECTANGLE' },
      { id: 'h1', type: 'TEXT', characters: '客车' },
    ]);
    const r = detectTableLeaf(sec, figmaIndex, buildParentMap(figmaIndex), undefined);
    expect(r.ok).toBe(false);
    expect(String(r.reason).startsWith('memberSubtreeBlocked:bgLayer:')).toBe(true);
  });

  it('③ 阴性：无签名子树不否决（回落既有几何判据，理由非 memberSubtreeBlocked）', () => {
    const figmaIndex = mkIndex([
      { id: 'h1', type: 'TEXT', characters: '客车' },
      { id: 'h2', type: 'TEXT', characters: '货车' },
    ]);
    const r = detectTableLeaf(sec, figmaIndex, buildParentMap(figmaIndex), undefined);
    expect(r.ok).toBe(false);
    expect(String(r.reason).startsWith('memberSubtreeBlocked')).toBe(false);
  });
});
