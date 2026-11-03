/**
 * 刀 7（2026-10-27 · 8bbcf027 `36:1695` 实锤）：容器吸收背景层判据单测。
 *
 * 病灶：`36:1695`（547×193 `#E1EBFF` r12 RECTANGLE）被吸收进容器 `801:3` 的
 * sourceNodeIds，但无任何叶子认领它 ⇒ 描述卡底在产物里 0 次出现。
 * 判据全走 Figma 真值（bbox/fills/cornerRadius），逐事实缺失即 fail-open。
 */
import { resolveAbsorbedBgLayers , claimCollapsedLeafContainedIds, expandCandidateIdsWithDirectChildren } from '../container-absorbed-bg.js'
import { indexFigmaNodes } from '../section-tree.js'

// 真值几何（8bbcf027 checkpoint 逐字段抄录）
const CONTAINER_BOX = { x: 24745, y: 51499, width: 547, height: 493 }
const BG_BOX = { x: 24745, y: 51799, width: 547, height: 193 }
const BG_FILL = {
  type: 'SOLID',
  visible: true,
  color: { r: 0.8811598420143127, g: 0.9216160774230957, b: 1, a: 1 },
}

function rect(id, box, extra = {}) {
  return { id, type: 'RECTANGLE', absoluteBoundingBox: box, fills: [BG_FILL], ...extra }
}
function text(id, x, y, w, h) {
  return { id, type: 'TEXT', characters: 'x', absoluteBoundingBox: { x, y, width: w, height: h } }
}
function container(children, box = CONTAINER_BOX) {
  return { id: '801:3', type: 'GROUP', absoluteBoundingBox: box, children }
}
function figmaOf(root) {
  // ⚠️ indexFigmaNodes 不解包 {document}（解包是调用方职责）⇒ 直接传根节点
  return indexFigmaNodes(root)
}

describe('resolveAbsorbedBgLayers — 刀 7 容器吸收背景层', () => {
  it('⭐ 真值复刻：未被认领的 SOLID RECTANGLE（描述卡底）→ 1 层，rgba/r12/三边锚定', () => {
    // 容器内：bg(36:1695) + 两段描述文本（分别被 orphan-text-2/3 认领）
    const root = container([
      rect('36:1695', BG_BOX, { cornerRadius: 12 }),
      text('36:1708', 24772, 51824, 64, 16),
      text('36:1719', 24772, 51849, 496, 90),
    ])
    const sec = { id: '801:3', sourceNodeIds: ['801:3', '36:1695', '36:1708', '36:1719'] }
    const claimed = new Set(['36:1708', '36:1719']) // 叶子认领集
    const r = resolveAbsorbedBgLayers(sec, figmaOf(root), claimed)
    expect(r.layers.length).toBe(1)
    const l = r.layers[0]
    expect(l.id).toBe('36:1695')
    expect(l.background).toBe('rgba(225,235,255,1)')
    expect(l.borderRadius).toBe(12)
    // 左/右/底三边与容器对齐 ⇒ 边锚定；顶部不触 ⇒ 真值高度
    expect(l.edgeCss).toBe('left:0;right:0;bottom:0;height:193px;')
    expect(l.top).toBe(300) // 51799-51499，仅作审计字段
  })

  it('反向：矩形已被叶子认领 ⇒ 不出层', () => {
    const root = container([rect('36:1695', BG_BOX, { cornerRadius: 12 })])
    const sec = { id: '801:3', sourceNodeIds: ['801:3', '36:1695'] }
    const claimed = new Set(['36:1695'])
    const r = resolveAbsorbedBgLayers(sec, figmaOf(root), claimed)
    expect(r.layers).toEqual([])
  })

  it('反向：IMAGE fill ⇒ 不出层（图片走资源通道，不是本判据职责）', () => {
    const imgFill = { type: 'IMAGE', visible: true }
    const root = container([rect('9:1', BG_BOX, { fills: [imgFill] })])
    const sec = { id: '801:3', sourceNodeIds: ['801:3', '9:1'] }
    const r = resolveAbsorbedBgLayers(sec, figmaOf(root), new Set())
    expect(r.layers).toEqual([])
  })

  it('反向：fill 不可见 / 无 fill ⇒ 不出层', () => {
    const root = container([
      rect('9:2', BG_BOX, { fills: [{ ...BG_FILL, visible: false }] }),
      rect('9:3', BG_BOX, { fills: [] }),
    ])
    const sec = { id: '801:3', sourceNodeIds: ['801:3', '9:2', '9:3'] }
    const r = resolveAbsorbedBgLayers(sec, figmaOf(root), new Set())
    expect(r.layers).toEqual([])
  })

  it('反向：矩形越出容器 bbox ⇒ 不出层（归属语义不同，绝不用部分重叠猜）', () => {
    const root = container([rect('9:4', { ...BG_BOX, y: 51990 })]) // 底边越出 51992
    const sec = { id: '801:3', sourceNodeIds: ['801:3', '9:4'] }
    const r = resolveAbsorbedBgLayers(sec, figmaOf(root), new Set())
    expect(r.layers).toEqual([])
  })

  it('反向：非 RECTANGLE（ELLIPSE/FRAME）⇒ 不出层（窄判据，不泛化）', () => {
    const root = container([
      { id: '9:5', type: 'ELLIPSE', absoluteBoundingBox: BG_BOX, fills: [BG_FILL] },
      { id: '9:6', type: 'FRAME', absoluteBoundingBox: BG_BOX, fills: [BG_FILL], children: [] },
    ])
    const sec = { id: '801:3', sourceNodeIds: ['801:3', '9:5', '9:6'] }
    const r = resolveAbsorbedBgLayers(sec, figmaOf(root), new Set())
    expect(r.layers).toEqual([])
  })

  it('反向：容器自身 id 不会出层', () => {
    const root = {
      id: '801:3', type: 'GROUP', absoluteBoundingBox: CONTAINER_BOX, fills: [BG_FILL],
      children: [text('1:1', 24772, 51824, 64, 16)],
    }
    const sec = { id: '801:3', sourceNodeIds: ['801:3', '1:1'] }
    const r = resolveAbsorbedBgLayers(sec, figmaOf(root), new Set(['1:1']))
    expect(r.layers).toEqual([])
  })

  it('边锚定变体：整罩容器（bbox 全等）⇒ 四边 0', () => {
    const root = container([rect('9:7', CONTAINER_BOX)])
    const sec = { id: '801:3', sourceNodeIds: ['801:3', '9:7'] }
    const r = resolveAbsorbedBgLayers(sec, figmaOf(root), new Set())
    expect(r.layers.length).toBe(1)
    expect(r.layers[0].edgeCss).toBe('left:0;right:0;top:0;bottom:0;')
  })

  it('边锚定变体：仅顶边贴合 ⇒ top:0 + 真值高度', () => {
    const box = { x: 24745, y: 51499, width: 547, height: 100 }
    const root = container([rect('9:8', box)])
    const sec = { id: '801:3', sourceNodeIds: ['801:3', '9:8'] }
    const r = resolveAbsorbedBgLayers(sec, figmaOf(root), new Set())
    expect(r.layers[0].edgeCss).toBe('left:0;right:0;top:0;height:100px;')
  })

  it('边锚定变体：四边都不贴合 ⇒ 真值偏移 + 真值尺寸', () => {
    const box = { x: 24765, y: 51809, width: 500, height: 150 }
    const root = container([rect('9:9', box)])
    const sec = { id: '801:3', sourceNodeIds: ['801:3', '9:9'] }
    const r = resolveAbsorbedBgLayers(sec, figmaOf(root), new Set())
    expect(r.layers[0].edgeCss).toBe('left:20px;width:500px;top:310px;height:150px;')
  })

  it('fail-open：figmaIndex 为空 / 容器 bbox 缺失 / sourceNodeIds 缺失 ⇒ 空层不抛错', () => {
    expect(resolveAbsorbedBgLayers({ id: '801:3' }, null, new Set()).layers).toEqual([])
    const root = { id: '801:3', type: 'GROUP', children: [] } // 无 bbox
    const sec = { id: '801:3', sourceNodeIds: ['801:3', '9:9'] }
    expect(resolveAbsorbedBgLayers(sec, figmaOf(root), new Set()).layers).toEqual([])
  })

  // ── 刀 20c（2026-10-28 · 657661ca 实锤）：滚动条滑块不吸收 ─────────────
  it('刀20c：细长贴右缘 rect（滚动条滑块 6×218）⇒ 跳过，不画假滚动条', () => {
    // 真值复刻：48:5904 name='滚动条' {x: 容器右缘-6, w:6, h:218} rgba(55,149,221,0.37)
    const bar = rect('48:5904', {
      x: CONTAINER_BOX.x + CONTAINER_BOX.width - 6,
      y: CONTAINER_BOX.y + 100,
      width: 6,
      height: 218,
    }, { cornerRadius: 3, name: '滚动条' })
    const root = container([bar])
    const sec = { id: '801:3', sourceNodeIds: ['801:3', '48:5904'] }
    const r = resolveAbsorbedBgLayers(sec, figmaOf(root), new Set())
    expect(r.layers).toEqual([])
    expect(r.scrollbarExempted).toBe(1) // 计数行必须非 0 ⇒ 证明「豁免判据真的跑到了」
  })

  it('刀20c 反向：同尺寸但**不贴右缘**的细长 rect ⇒ 仍吸收（不误伤装饰条）', () => {
    const deco = rect('9:10', {
      x: CONTAINER_BOX.x + 40,
      y: CONTAINER_BOX.y + 100,
      width: 6,
      height: 218,
    })
    const root = container([deco])
    const sec = { id: '801:3', sourceNodeIds: ['801:3', '9:10'] }
    const r = resolveAbsorbedBgLayers(sec, figmaOf(root), new Set())
    expect(r.layers.length).toBe(1)
    expect(r.layers[0].id).toBe('9:10')
  })

  // ── 刀 20c-R（2026-11-02 · `43:5688` 实锤）：几何不足以判别滚动条 ────────
  // 铁证：装饰条 43:5688（name='Rectangle 346242323'，6×218 r3）与真滚动条
  // 48:5904（name='滚动条'，6×218 r3）**几何逐字段同构**（含右缘精确贴容器边），
  // 容器内容溢出量均为 0 ⇒ 旧纯几何判据把装饰条一并豁免（实测 c-device-34fa6237 /
  // c-device-486cc6b6 两目录竖条消失，而同构的 c-device-5665901a 正常渲染）。
  it('⭐ 刀20c-R：贴右缘 + 条状 + **自动名**（Rectangle 346242323）⇒ 仍吸收（真值复刻 43:5688）', () => {
    // 容器 807:2 {x:29636,y:51637,w:483,h:515}，右缘 29636+483=30119
    const host = { x: 29636, y: 51637, width: 483, height: 515 }
    // 43:5688 {x:30113,y:51815,w:6,h:218,r:3}，右缘 30113+6=30119 ⇒ **精确贴合**
    const deco = rect('43:5688', { x: 30113, y: 51815, width: 6, height: 218 }, {
      cornerRadius: 3,
      name: 'Rectangle 346242323',
    })
    const root = { id: '807:2', type: 'GROUP', absoluteBoundingBox: host, children: [deco] }
    const sec = { id: '807:2', sourceNodeIds: ['807:2', '43:5688'] }
    const r = resolveAbsorbedBgLayers(sec, figmaOf(root), new Set())
    expect(r.layers.length).toBe(1)
    expect(r.layers[0].id).toBe('43:5688')
    expect(r.layers[0].borderRadius).toBe(3)
    expect(r.scrollbarExempted).toBe(0)
    // 右缘与容器精确贴合 ⇒ right:0 + 真值宽；左/上/下不贴 ⇒ 真值偏移 + 真值尺寸
    expect(r.layers[0].edgeCss).toBe('right:0;width:6px;top:178px;height:218px;')
  })

  it('刀20c-R：同几何但名确指滚动条（scrollbar）⇒ 仍豁免（英文命名同源）', () => {
    const bar = rect('48:5904', {
      x: CONTAINER_BOX.x + CONTAINER_BOX.width - 6,
      y: CONTAINER_BOX.y + 100,
      width: 6,
      height: 218,
    }, { cornerRadius: 3, name: 'scrollbar-thumb' })
    const root = container([bar])
    const sec = { id: '801:3', sourceNodeIds: ['801:3', '48:5904'] }
    const r = resolveAbsorbedBgLayers(sec, figmaOf(root), new Set())
    expect(r.layers).toEqual([])
    expect(r.scrollbarExempted).toBe(1)
  })

  it('刀20c-R：缺 name（undefined）⇒ 不豁免（未知即不豁免，fail-open 到吸收）', () => {
    const bar = rect('9:11', {
      x: CONTAINER_BOX.x + CONTAINER_BOX.width - 6,
      y: CONTAINER_BOX.y + 100,
      width: 6,
      height: 218,
    })
    const root = container([bar])
    const sec = { id: '801:3', sourceNodeIds: ['801:3', '9:11'] }
    const r = resolveAbsorbedBgLayers(sec, figmaOf(root), new Set())
    expect(r.layers.length).toBe(1)
    expect(r.scrollbarExempted).toBe(0)
  })
})

describe('刀29c — claimCollapsedLeafContainedIds 几何包含认领（mc-max-1793255115028-7ec263c9 实锤）', () => {
  // 病灶：vision item id 是卡内层 GROUP（48:5816 真身是 card2 48:5813 的内部组）
  // ⇒ sourceNodeIds 闭包拿不到兄弟卡真实面 rect（48:5814/5829/…）⇒ 刀7 判未认领
  // ⇒ absorbed-bg 空壳色带。判据：collapsed 叶的渲染盒内 ⇒ 全部 figma 节点入认领集。
  const mkIndex = () => {
    const entries = [
      ['565:3', { x: 20831, y: 51606, width: 470, height: 571 }],
      ['48:5798', { x: 20831, y: 51606, width: 470, height: 72 }],
      ['48:5813', { x: 20831, y: 51698, width: 470, height: 72 }],
      ['48:5814', { x: 20831, y: 51698, width: 470, height: 72 }], // 卡2 面 rect（真实 id 不在 sourceNodeIds）
      ['48:5829', { x: 20831, y: 51790, width: 470, height: 72 }], // 卡3 面 rect
      ['48:5890', { x: 21289, y: 51700, width: 6, height: 218 }],  // 滚动条（叶盒内 ⇒ 被列表渲染）
      ['565:3-tail', { x: 20831, y: 52140, width: 470, height: 16 }], // 尾部（叶盒外）
    ];
    return new Map(entries.map(([id, bbox]) => [id, { id, bbox, rawNode: { id, absoluteBoundingBox: bbox } }]));
  };
  const box = { x: 20831, y: 51606, w: 470, h: 517 }; // 整列并集（不含尾部）
  const resolveBox = () => box;
  const leaf = { id: '48:5798-list', collapsed: true, renderHint: 'v-for', sourceNodeIds: ['48:5816'] };

  it('⭐ 阳性：叶盒内卡面 rect/滚动条全部入认领集，盒外尾部不入', () => {
    const claimed = claimCollapsedLeafContainedIds(new Set(['48:5798-list']), [leaf], mkIndex(), resolveBox);
    expect(claimed.has('48:5814')).toBe(true);
    expect(claimed.has('48:5829')).toBe(true);
    expect(claimed.has('48:5890')).toBe(true);
    expect(claimed.has('48:5813')).toBe(true);
    expect(claimed.has('565:3-tail')).toBe(false);
  });

  it('反向：非折叠叶不参与包含认领', () => {
    const plain = { id: '565:2', sourceNodeIds: ['565:2'] };
    const claimed = claimCollapsedLeafContainedIds(new Set(), [plain], mkIndex(), resolveBox);
    expect(claimed.has('48:5814')).toBe(false);
  });

  it('反向：叶盒缺失（resolveBox 返回 null）⇒ 原样返回，fail-open', () => {
    const claimed = claimCollapsedLeafContainedIds(new Set(['x']), [leaf], mkIndex(), () => null);
    expect(claimed.has('x')).toBe(true);
    expect(claimed.has('48:5814')).toBe(false);
  });
});

// ── 刀 7c（2026-11-03 · `807:2`/`43:5688` 实锤）：候选集扩充（纯枚举，无裁决） ────────
describe('刀 7c — expandCandidateIdsWithDirectChildren 直系子枚举', () => {
  const HOST = { x: 29636, y: 51637, width: 483, height: 515 };
  const figma = () => {
    const deco = rect('43:5688', { x: 30113, y: 51815, width: 6, height: 218 }, {
      cornerRadius: 3,
      name: 'Rectangle 346242323',
    });
    const root = {
      id: '807:2',
      name: 'slot-con',
      type: 'GROUP',
      absoluteBoundingBox: HOST,
      children: [
        { id: '43:4784', type: 'GROUP', absoluteBoundingBox: { x: 29636, y: 51637, width: 470, height: 60 } },
        { id: '43:4878', type: 'TEXT', characters: 'x', absoluteBoundingBox: { x: 29636, y: 51700, width: 100, height: 16 } },
        deco,
      ],
    };
    return figmaOf(root);
  };

  it('⭐ 阳性：sourceNodeIds 只有自身 ⇒ 直系子按图序追加（真值复刻 807:2）', () => {
    const sec = { id: '807:2', sourceNodeIds: ['807:2'] };
    expect(expandCandidateIdsWithDirectChildren(sec, figma())).toEqual([
      '807:2', '43:4784', '43:4878', '43:5688',
    ]);
  });

  it('已声明的 id 不重复追加（保原序，只追加缺的）', () => {
    const sec = { id: '807:2', sourceNodeIds: ['807:2', '43:5688'] };
    expect(expandCandidateIdsWithDirectChildren(sec, figma())).toEqual([
      '807:2', '43:5688', '43:4784', '43:4878',
    ]);
  });

  it('fail-open：figmaIndex 缺失 / 节点无 children / sec 无 sourceNodeIds ⇒ 不抛错', () => {
    expect(expandCandidateIdsWithDirectChildren({ id: '807:2', sourceNodeIds: ['807:2'] }, null)).toEqual(['807:2']);
    const lone = { id: '9:1', type: 'RECTANGLE', absoluteBoundingBox: { x: 0, y: 0, width: 1, height: 1 } };
    expect(expandCandidateIdsWithDirectChildren({ id: '9:1', sourceNodeIds: ['9:1'] }, figmaOf(lone))).toEqual(['9:1']);
    expect(expandCandidateIdsWithDirectChildren({ id: '807:2' }, figma())).toEqual([
      '43:4784', '43:4878', '43:5688',
    ]);
  });

  it('⭐ 端到端：扩充候选集后喂判据 ⇒ 43:5688 出层（仅枚举、裁决仍在判据单点）', () => {
    const sec = { id: '807:2', sourceNodeIds: ['807:2'] };
    const idx = figma();
    const eff = expandCandidateIdsWithDirectChildren(sec, idx);
    const r = resolveAbsorbedBgLayers({ ...sec, sourceNodeIds: eff }, idx, new Set());
    expect(r.layers.map((l) => l.id)).toEqual(['43:5688']);
    expect(r.layers[0].borderRadius).toBe(3);
    expect(r.layers[0].edgeCss).toBe('right:0;width:6px;top:178px;height:218px;');
    expect(r.scrollbarExempted).toBe(0); // 自动名 ⇒ 不豁免
  });
});
