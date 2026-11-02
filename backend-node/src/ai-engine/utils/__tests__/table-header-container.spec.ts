/**
 * 🛡️ 形态⑤（单个 `table-header` 容器声明）专项判据 —— e7da39ca，2026-11-02。
 *
 * 事故链（真机 `mc-max-1793582610570-e7da39ca` / section 43:4791「设备数据表格」）：
 *   vision 把整行表头收成 `body.children[].{role:'table-header', children:[{type:'label',text}]}`，
 *   数据行另由 `{role:'table-body', items:[{role:'table-row',…}]}` 承载
 *   → 旧 `declaredTableHeaders` 只认四形态（顶层 headers / body.headers /
 *     body.children[].headers / body.children[].table-column+header）⇒ 返 null
 *   → `resolveDeclaredTableLca` 拿不到表头文本 ⇒ 无法回查整表锚点
 *   → 真机退化 `table:notTableColumn`（logs/app-2026-11-02.log:451 逐字）。
 *
 * 分工（与 `vision-form-regression.spec.ts` 不重叠）：
 *   - 跨形态不变量 + 标签扰动一致性 → vision-form-regression（形态⑤ 已登记进 6 形态列表）
 *   - 本 spec 只断言形态⑤ **自身**的单形态行为：契约读取口径、列数口径、fail-closed 闸门
 */

import { declaredTableHeaderContainerTexts, declaredTableRowArity } from '../vision-facts.js';
import { declaredTableHeaders } from '../section-type-derive.js';
import { detectTableLeaf } from '../folded-grid-section-takeover.js';

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

/** 形态⑤ 最小骨架：4 列表头 + N 列数据行（columns 控制每行非图标单元格数） */
function makeSection(opts: {
  headers?: string[];
  columns?: Array<'value' | 'label' | 'icon' | 'row-icon-label'>;
  withBody?: boolean;
} = {}) {
  const headers = opts.headers ?? ['设备名称', '电量', '速度(m/s)', '启用状态'];
  const columns = opts.columns ?? ['row-icon-label', 'value', 'value', 'label'];
  const cell = (kind: string) => {
    switch (kind) {
      case 'icon':
        return { type: 'icon', width: 28, height: 28 };
      case 'row-icon-label':
        // 真机首列：图标 + 文本复合单元格 ⇒ 仍算**一列**
        return { type: 'row', children: [{ type: 'icon', width: 28, height: 28 }, { type: 'label', text: '服务区巡检狗K1' }] };
      case 'value':
        return { type: 'value', text: '92' };
      default:
        return { type: 'label', text: '启用' };
    }
  };
  const body: any = {
    children: [
      { id: 'table-header', role: 'table-header', children: headers.map((t) => ({ type: 'label', text: t })) },
    ],
  };
  if (opts.withBody !== false) {
    body.children.push({
      id: 'table-rows',
      role: 'table-body',
      items: [{ role: 'table-row', children: columns.map(cell) }],
    });
  }
  return { id: '43:4791', name: '设备数据表格', body };
}

/** 空 figma 环境：让 detectTableLeaf 停在 direct 判据（不进入几何路径） */
const EMPTY_INDEX = new Map();
const EMPTY_PARENT = new Map();

describe('declaredTableHeaderContainerTexts · 形态⑤ 读取口径（宁漏不误）', () => {
  test('⭐ 阳性：单个 table-header 容器 ⇒ 逐项表头文本', () => {
    expect(declaredTableHeaderContainerTexts(makeSection())).toEqual([
      '设备名称', '电量', '速度(m/s)', '启用状态',
    ]);
  });

  test('容器不唯一（2 个 table-header）⇒ null，绝不拼两份', () => {
    const sec: any = makeSection();
    sec.body.children.push({ id: 'h2', role: 'table-header', children: [{ type: 'label', text: '多余表头' }] });
    expect(declaredTableHeaderContainerTexts(sec)).toBeNull();
  });

  test('子项 < 2 ⇒ null（单文本不足以声明整行表头）', () => {
    expect(declaredTableHeaderContainerTexts(makeSection({ headers: ['设备名称'] }))).toBeNull();
  });

  test('任一子项文本为空 ⇒ null（不跳过空列拼出残缺表头）', () => {
    expect(declaredTableHeaderContainerTexts(makeSection({ headers: ['设备名称', ''] }))).toBeNull();
  });

  test('无 body.children / 无 table-header 容器 ⇒ null（形态①-④ 走各自路径）', () => {
    expect(declaredTableHeaderContainerTexts({ id: 'x' })).toBeNull();
    expect(declaredTableHeaderContainerTexts({ id: 'x', body: { children: [{ role: 'table-column', header: 'A' }] } })).toBeNull();
    // 形态④ 不得被形态⑤ 误吃
    expect(declaredTableHeaders({ id: 'x', body: { children: [{ role: 'table-column', header: 'A' }, { role: 'table-column', header: 'B' }] } }))
      .toEqual(['A', 'B']);
  });
});

describe('declaredTableRowArity · 列数口径', () => {
  test('复合首列（icon + label）算一列，纯 icon 单元格剔除', () => {
    // ['row-icon-label','value','value','label'] ⇒ 4 列
    expect(declaredTableRowArity(makeSection())).toBe(4);
    // ['icon','value','value','label'] ⇒ 纯 icon 剔除 ⇒ 3 列
    expect(declaredTableRowArity(makeSection({ columns: ['icon', 'value', 'value', 'label'] }))).toBe(3);
    // 唯一子项是 icon 的容器单元格也剔除
    expect(declaredTableRowArity(makeSection({
      columns: ['value', 'value', 'label', 'icon'],
    }))).toBe(3);
  });

  test('无 table-body / 无行 / 空单元格 ⇒ null（= 不校验，不误报）', () => {
    expect(declaredTableRowArity(makeSection({ withBody: false }))).toBeNull();
    expect(declaredTableRowArity({ id: 'x' })).toBeNull();
    expect(declaredTableRowArity(makeSection({ columns: [] }))).toBeNull();
  });

  test('body 用 children 承载行（items→children 键漂移）同样可数', () => {
    const sec: any = clone(makeSection());
    const body = sec.body.children.find((c: any) => c.role === 'table-body');
    body.children = body.items;
    delete body.items;
    expect(declaredTableRowArity(sec)).toBe(4);
  });
});

describe('detectTableLeaf · 形态⑤ 形态自洽 fail-closed 闸门', () => {
  test('⭐ 阳性：表头数 == 首行列数 ⇒ 不返回 contractShapeMismatch', () => {
    const r: any = detectTableLeaf(makeSection(), EMPTY_INDEX, EMPTY_PARENT);
    expect(r.reason).not.toBe('contractShapeMismatch');
    // 空 figma 环境停在 direct 判据（无锚点）；本断言只锁定「闸门不误伤自洽契约」
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('noAnchorNode');
  });

  test('⭐ 阴性：4 表头 vs 3 列 ⇒ 显式 contractShapeMismatch（不静默并回 notTableColumn）', () => {
    const r: any = detectTableLeaf(
      makeSection({ columns: ['icon', 'value', 'value', 'label'] }), // 非图标列 = 3
      EMPTY_INDEX,
      EMPTY_PARENT,
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('contractShapeMismatch');
  });

  test('零副作用：形态④（table-column 逐列声明）列数不匹配也不触发本闸门', () => {
    const sec = {
      id: '43:4788',
      body: {
        children: [
          { role: 'table-column', header: 'A' },
          { role: 'table-column', header: 'B' },
          { role: 'table-column', header: 'C' },
        ],
        // 只有 1 列的 body：与表头数(3) 不一致，但形态④ 不走形态⑤ 闸门
        items: [{ role: 'table-row', children: [{ type: 'value', text: '1' }] }],
      },
    };
    const r: any = detectTableLeaf(sec, EMPTY_INDEX, EMPTY_PARENT);
    expect(r.reason).not.toBe('contractShapeMismatch');
  });

  test('零副作用：缺 table-body（arity=null）时闸门跳过，不误报不自洽', () => {
    const r: any = detectTableLeaf(makeSection({ withBody: false }), EMPTY_INDEX, EMPTY_PARENT);
    expect(r.reason).not.toBe('contractShapeMismatch');
  });
});