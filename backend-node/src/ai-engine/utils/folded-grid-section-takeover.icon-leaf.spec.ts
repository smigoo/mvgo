/**
 * detectIconLeaf「兄弟行文本」守卫回归。
 *
 * 真机语料（mc-max-1794460832686-7b016640 · 合作厂商弹窗 · 节点 38:3134）：
 *   796:3 slot-icon
 *     ├─ 38:3260 Group  ← vision 声明的段锚（背景矩形 + 187:262 icon，子树 0 TEXT）
 *     ├─ 38:3262 TEXT "33"        x=26997.0  y=51521.9  28×28
 *     ├─ 38:3263 TEXT "合作厂商"   x=26997.7  y=51496.0  64×24
 *     ├─ 38:3284 TEXT "66"
 *     └─ 38:3285 TEXT "在线设备"
 *   锚点子树确实 0 TEXT，但 label/value 是**平级兄弟** ⇒ 旧判据整段接管为单 <img>，
 *   兄弟文本被抹掉（产物统计区只剩一个图标）。
 *
 * 本 spec 锁两件事：
 *   ① 阳性：同父同行右侧有 TEXT ⇒ 拒绝接管（reason=siblingRowText）；
 *   ② 阴性：文本在左 / 在下一行 / 无兄弟文本 ⇒ 仍按原逻辑接管（不得误伤真纯 icon 叶）。
 */
import { detectIconLeaf } from './folded-grid-section-takeover';

const ICON_BOX = { x: 26929, y: 51496, width: 53, height: 55 };

function textNode(id: string, characters: string, box: any) {
  return { id, type: 'TEXT', characters, absoluteBoundingBox: box };
}

/**
 * 构建真值形态的 figmaIndex：parent(796:3) 直接持有锚点与若干文本兄弟。
 * `texts` 为 undefined ⇒ 不加任何文本兄弟（阴性对照）。
 */
function buildIndex(texts?: Array<{ id: string; characters: string; box: any }>) {
  const children: any[] = [
    {
      id: '38:3260',
      type: 'GROUP',
      name: 'Group 2136638431',
      absoluteBoundingBox: ICON_BOX,
      children: [
        { id: '38:3261', type: 'VECTOR', absoluteBoundingBox: ICON_BOX },
        { id: '187:262', type: 'GROUP', name: 'icon', absoluteBoundingBox: ICON_BOX },
      ],
    },
    ...(texts || []).map((t) => textNode(t.id, t.characters, t.box)),
  ];
  const parent = {
    id: '796:3',
    type: 'FRAME',
    name: 'slot-icon',
    absoluteBoundingBox: { x: 26929, y: 51496, width: 662, height: 76 },
    children,
  };
  const index = new Map<string, any>();
  index.set('796:3', { rawNode: parent, parentId: '38:3134' });
  for (const c of children) {
    index.set(String(c.id), { rawNode: c, parentId: '796:3' });
    for (const gc of c.children || []) {
      index.set(String(gc.id), { rawNode: gc, parentId: String(c.id) });
    }
  }
  return index;
}

const SEC = { id: '38:3260', name: '合作厂商统计卡片', role: 'stat-card' };

const MAPPING = [
  {
    figmaNodeId: '38:3260',
    resourceFile: 'images/icon-262.png',
    downloadStatus: 'success',
    assignedVarName: 'icon2',
  },
];

describe('detectIconLeaf · 兄弟行文本守卫', () => {
  it('阳性：同行右侧存在 TEXT（33 / 合作厂商）⇒ 拒绝接管', () => {
    const index = buildIndex([
      { id: '38:3262', characters: '33', box: { x: 26997, y: 51521.9, width: 28, height: 28 } },
      { id: '38:3263', characters: '合作厂商', box: { x: 26997.7, y: 51496, width: 64, height: 24 } },
    ]);
    const r: any = detectIconLeaf(SEC, index, MAPPING);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('siblingRowText');
  });

  it('阴性：文本在图标左侧 ⇒ 仍按纯 icon 叶接管', () => {
    const index = buildIndex([
      { id: '38:3263', characters: '合作厂商', box: { x: 26800, y: 51496, width: 64, height: 24 } },
    ]);
    const r: any = detectIconLeaf(SEC, index, MAPPING);
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('icon');
  });

  it('阴性：文本在下一行（y 不重叠）⇒ 仍按纯 icon 叶接管', () => {
    const index = buildIndex([
      { id: '38:3290', characters: '备注说明', box: { x: 26997, y: 51640, width: 64, height: 24 } },
    ]);
    const r: any = detectIconLeaf(SEC, index, MAPPING);
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('icon');
  });

  it('阴性：没有任何兄弟文本 ⇒ 仍按纯 icon 叶接管', () => {
    const index = buildIndex();
    const r: any = detectIconLeaf(SEC, index, MAPPING);
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('icon');
    expect(r.iconFile).toBe('icon-262.png');
    expect(r.iconW).toBe(53);
    expect(r.iconH).toBe(55);
  });
});
