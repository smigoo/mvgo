/**
 * P0 治本 spec（2026-10-26 · mc-max-1792934367321-ab7bb76c 实锤）：
 * `headerIsChromeOnly` 判据细化 —— 消灭「含装饰 FRAME 的纯标题栏逃过剥离」。
 *
 * 事故形态（807:3 真值子树）：
 *   GROUP header
 *   ├── FRAME 标题img → FRAME 标题-线(RECTANGLE×3+VECTOR) / GROUP Group 11(RECTANGLE×3)
 *   ├── TEXT  文字  "具身机器人设备列表"
 *   └── VECTOR icon-关闭
 * 旧判据两条路都判 business：① FRAME 一刀切进 BUSINESS_CONTAINER_TYPES；
 *   ② 裸 `VECTOR "icon-关闭"` 命中 BUSINESS_NAME_RE 的 `icon`。
 * ⇒ chromeOnly=false ⇒ 逃过 stripChromeOnly ⇒ HeaderSection 顶掉 componentName = 双标题。
 *
 * 本 spec 必须同时钉住两个方向（判据纪律：任何放宽都要配阳性 + 阴性对照）：
 *   阴性（该剥）= 装饰 FRAME + 单标题文本 + 裸装饰形状；
 *   阳性（该留）= 真业务 header（tabs / 组件实例 / 交互命名的 FRAME / 双文本 / 交互图标容器）。
 */
import { headerIsChromeOnly } from '../section-tree.js';

// ── Fixture 构造器（只认 type/name/children/characters，判据命名无关）──────────
const shape = (type, name) => ({ type, name });
const text = (name, characters) => ({ type: 'TEXT', name, characters });
const frame = (name, children) => ({ type: 'FRAME', name, children });
const group = (name, children) => ({ type: 'GROUP', name, children });
const header = (children) => group('header', children);

/** 事故件 807:3 的完整真值形态（含 FRAME 嵌套深度与裸 icon VECTOR） */
const accidentHeader = () =>
  header([
    frame('标题img', [
      frame('标题-线', [
        shape('RECTANGLE', 'Rectangle 23'),
        shape('RECTANGLE', 'Rectangle 24'),
        shape('RECTANGLE', 'Rectangle 25'),
        shape('VECTOR', 'Rectangle 22'),
      ]),
      group('Group 11', [
        shape('RECTANGLE', 'Rectangle 26'),
        shape('RECTANGLE', 'Rectangle 27'),
        shape('RECTANGLE', 'Rectangle 28'),
      ]),
    ]),
    text('文字', '具身机器人设备列表'),
    shape('VECTOR', 'icon-关闭'),
  ]);

describe('headerIsChromeOnly · 阴性对照（纯标题栏必须被剥离）', () => {
  it('事故件 807:3 形态：装饰 FRAME + 单标题文本 + 裸 icon VECTOR ⇒ chromeOnly', () => {
    expect(headerIsChromeOnly(accidentHeader())).toBe(true);
  });

  it('去掉装饰 FRAME（仅裸形状 + 单标题）⇒ chromeOnly（旧判据已覆盖，防回归）', () => {
    const node = header([
      shape('VECTOR', 'icon-关闭'),
      shape('RECTANGLE', 'Rectangle 1'),
      text('文字', '标题'),
    ]);
    expect(headerIsChromeOnly(node)).toBe(true);
  });

  it('装饰 FRAME 内嵌 GROUP 用中性图层名 + 形状名命中 icon ⇒ 不构成业务（形状名豁免）', () => {
    const node = header([
      frame('装饰', [
        group('Group 11', [shape('ELLIPSE', 'Ellipse 1')]),
        shape('VECTOR', 'icon-装饰'),
        shape('VECTOR', '标题-线'),
      ]),
      text('文字', '标题'),
    ]);
    expect(headerIsChromeOnly(node)).toBe(true);
  });

  it('🔴 边界：装饰 FRAME 内嵌 GROUP 名命中 icon（icon-bg）⇒ 仍判业务（容器名保守保留）', () => {
    // 保守方向：未知 GROUP 的图层名命中交互语义时不赌，宁可保留。
    // 事故件 807:3 的 GROUP 名是 `Group 11`（中性）⇒ 不受此条影响。
    const node = header([
      frame('装饰', [group('icon-bg', [shape('ELLIPSE', 'Ellipse 1')])]),
      text('文字', '标题'),
    ]);
    expect(headerIsChromeOnly(node)).toBe(false);
  });

  it('子节点为空数组 ⇒ 保守保留（不可判定，旧行为）', () => {
    expect(headerIsChromeOnly(header([]))).toBe(false);
  });

  it('非对象 / null ⇒ 保留', () => {
    expect(headerIsChromeOnly(null)).toBe(false);
    expect(headerIsChromeOnly(undefined)).toBe(false);
    expect(headerIsChromeOnly('header')).toBe(false);
  });
});

describe('headerIsChromeOnly · 阳性对照（真业务 header 绝不能被剥）', () => {
  it('内含组件实例（INSTANCE）⇒ 业务', () => {
    const node = header([text('标题', '监控'), { type: 'INSTANCE', name: 'Tag' }]);
    expect(headerIsChromeOnly(node)).toBe(false);
  });

  it('FRAME 内嵌 2 个文本（tabs：运行中/离线）⇒ 业务', () => {
    const node = header([
      text('标题', '监控'),
      frame('tabs', [text('tab1', '运行中'), text('tab2', '离线')]),
    ]);
    expect(headerIsChromeOnly(node)).toBe(false);
  });

  it('无文案的 FRAME 但名字是交互语义（操作按钮）⇒ 业务', () => {
    const node = header([text('标题', '监控'), frame('操作按钮', [shape('VECTOR', 'Vector')])]);
    expect(headerIsChromeOnly(node)).toBe(false);
  });

  it('无文案的 FRAME 内含交互命名的 GROUP（icon-操作）⇒ 业务', () => {
    const node = header([text('标题', '监控'), frame('装饰包', [group('icon-操作', [])])]);
    expect(headerIsChromeOnly(node)).toBe(false);
  });

  it('双文本（标题 + 副标题/单位）⇒ 业务', () => {
    const node = header([text('标题', '设备列表'), text('副标题', '单位：台')]);
    expect(headerIsChromeOnly(node)).toBe(false);
  });

  it('header 自身直接含 3 个文本 ⇒ 业务', () => {
    const node = header([text('a', 'A'), text('b', 'B'), text('c', 'C')]);
    expect(headerIsChromeOnly(node)).toBe(false);
  });

  it('装饰 FRAME 与业务 FRAME 并存 ⇒ 业务优先（不被装饰分支吞掉）', () => {
    const node = header([
      frame('标题img', [shape('VECTOR', 'Vector')]),
      text('标题', '监控'),
      frame('tabs', [text('t', '运行中')]),
    ]);
    expect(headerIsChromeOnly(node)).toBe(false);
  });
});
