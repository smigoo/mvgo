/**
 * TEXT 自重复折叠 spec（2026-11-18 · 监测预警 1:399 三连实锤）
 *
 * 判据双条件：整重复(unit≥4字) + bbox 宽度装不下整串 ⇒ 折叠到宽度容纳的最大份数。
 * 病根：Figma 设计稿 TEXT 源数据脏（1:399 chars=name=「枫港大桥温度到达55℃」×3，
 * bbox 253.89px 只装得下一份 154px）⇒ LLM 忠实转写 ⇒ 产物三连。
 */
import { foldTextRepeat, sanitizeTextRepeats } from '../text-repeat-fold.js';

const UNIT = '枫港大桥温度到达55℃'; // 11 字符，14px 下 ≈154px

describe('foldTextRepeat · 双条件判据', () => {
  test('P1 真机病灶：三连 + 253px 盒 ⇒ 折叠为 1 份', () => {
    const r = foldTextRepeat({ characters: UNIT.repeat(3), name: UNIT.repeat(3), width: 253.89, fontSize: 14 });
    expect(r.folded).toBe(true);
    expect(r.characters).toBe(UNIT);
    expect(r.name).toBe(UNIT);
    expect(r.count).toBe(3);
    expect(r.keep).toBe(1);
  });

  test('P2 宽度容纳两份 ⇒ keep=2（保真值上限，不是无脑折 1）', () => {
    // 2 份 ≈308px，盒 320px 装得下；3 份 462px 装不下
    const r = foldTextRepeat({ characters: UNIT.repeat(3), name: '', width: 320, fontSize: 14 });
    expect(r.folded).toBe(true);
    expect(r.keep).toBe(2);
    expect(r.characters).toBe(UNIT.repeat(2));
  });

  test('N1 无几何（无 bbox/fontSize）⇒ fail-open 不动', () => {
    const r = foldTextRepeat({ characters: UNIT.repeat(3), name: '', width: undefined, fontSize: undefined });
    expect(r.folded).toBe(false);
    expect(r.reason).toBe('no-geometry');
  });

  test('N2 宽度装得下（合法重复文案/跑马灯）⇒ 不动', () => {
    const r = foldTextRepeat({ characters: UNIT.repeat(2), name: '', width: 400, fontSize: 14 });
    expect(r.folded).toBe(false);
    expect(r.reason).toBe('fits-width');
  });

  test('N3 非整重复（部分重复/拼接）⇒ 不动', () => {
    const r = foldTextRepeat({ characters: UNIT + UNIT.slice(0, 5), name: '', width: 10, fontSize: 14 });
    expect(r.folded).toBe(false);
    expect(r.reason).toBe('no-repeat');
  });

  test('N4 单字符占位串（unit=1 的 xxxxxx）⇒ 不动（unit≥4 门槛）', () => {
    const r = foldTextRepeat({ characters: 'xxxxxx', name: '', width: 80, fontSize: 14 });
    expect(r.folded).toBe(false);
    expect(r.reason).toBe('no-repeat');
  });

  test('N5 单份文本 ⇒ no-repeat 不动', () => {
    const r = foldTextRepeat({ characters: UNIT, name: '', width: 100, fontSize: 14 });
    expect(r.folded).toBe(false);
    expect(r.count).toBe(1);
  });

  test('N6 空文本 ⇒ fail-open', () => {
    const r = foldTextRepeat({ characters: '  ', name: '', width: 100, fontSize: 14 });
    expect(r.folded).toBe(false);
    expect(r.reason).toBe('empty');
  });
});

describe('sanitizeTextRepeats · 树遍历消毒', () => {
  function treeWith(chars: string, width = 253.89) {
    return {
      document: {
        id: '0:0', type: 'FRAME',
        children: [
          {
            id: '1:399', name: chars, type: 'TEXT',
            characters: chars,
            absoluteBoundingBox: { x: 0, y: 0, width, height: 43 },
            style: { fontSize: 14 },
          },
          { id: '1:400', name: '正常文本', type: 'TEXT', characters: '正常文本', absoluteBoundingBox: { x: 0, y: 50, width: 200, height: 20 }, style: { fontSize: 14 } },
        ],
      },
    };
  }

  test('P4 树消毒：三连折叠 + 正常文本不动 + meta 计数', () => {
    const dirty = UNIT.repeat(3);
    const tree = treeWith(dirty);
    const meta = { folded: [] as any[] };
    const n = sanitizeTextRepeats(tree as any, meta);
    expect(n).toBe(1);
    expect(meta.folded[0]).toMatchObject({ id: '1:399', count: 3, keep: 1 });
    const node = tree.document.children[0];
    expect(node.characters).toBe(UNIT);
    expect(node.name).toBe(UNIT);
    expect(tree.document.children[1].characters).toBe('正常文本');
  });

  test('P5 幂等：折叠后再跑零折叠', () => {
    const tree = treeWith(UNIT.repeat(3));
    sanitizeTextRepeats(tree as any, { folded: [] });
    const meta2 = { folded: [] as any[] };
    const n2 = sanitizeTextRepeats(tree as any, meta2);
    expect(n2).toBe(0);
  });

  test('N7 无 document 壳（裸树）也能遍历', () => {
    const bare = treeWith(UNIT.repeat(3)).document;
    const n = sanitizeTextRepeats(bare as any, { folded: [] });
    expect(n).toBe(1);
  });
});
