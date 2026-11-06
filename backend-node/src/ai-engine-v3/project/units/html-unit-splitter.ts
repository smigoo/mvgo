/**
 * HTML 单元拆分器（非 Figma 分支）—— 「一个原型页 = 一个 lite 单元」。
 *
 * 纯函数：**不读盘、不联网、不引 jsdom**。输入是调用方已归一/已扫到的原型页相对路径。
 *
 * 🔴 为什么是**页级**而不是元素级：
 *   · 元素级只能靠 `detectUiRegions`，其词汇只有 6 类
 *     （table / list / createButton / detailLink / link / form）——覆盖不了真实原型页；
 *   · 元素级的 selector 由 jsdom 的 `sel()` 产出，**不带 nth-of-type**，同类兄弟节点会撞锚点
 *     （两个 `table` 得到同一个 selector）——锚点不唯一 = 不知道该生成哪一块，宁缺勿假；
 *   · jsdom 没有布局引擎，元素级 `box` 恒为 null，量不出真实尺寸；
 *   · 页级有**唯一且真实**的锚点：原型页本身（`pagePath`）。
 *     真要细化到元素级，必须先补齐「唯一 selector」与「布局尺寸」两件事，届时另起一版。
 */

import { createHash } from 'crypto';
import {
  UNIT_CONTRACT_VERSION,
  computeUnitStats,
  deriveUnitTier,
  type ProjectUnit,
  type UnitContract,
} from './unit-contract';
// 🔴 命名与归属的单一来源：与 figma 拆分器共用，别在本文件再抄一份
import { attributeFeature, slug } from './unit-naming';

export interface HtmlUnitSplitParams {
  runId: string;
  /** 输入指纹，由调用方用 unitInputKeyHtml 算好后传入（单一来源在服务层） */
  inputKey: string;
  /** 原型页相对路径（调用方已归一；本函数内部仍 trim/dedupe/sort 兜底） */
  pages: string[];
  features: string[];
  onLog?: (payload: Record<string, any>) => void;
}

/** 去掉扩展名后的路径分段；若是 `html/...` 前缀则把首段 `html` 去掉 */
function pageTailSegs(rel: string): string[] {
  const noExt = String(rel ?? '').replace(/\.[^./\\]+$/, '');
  const segs = noExt.split(/[\\/]+/).filter(Boolean);
  return segs.length && /^html$/i.test(segs[0]) ? segs.slice(1) : segs;
}

/** 人可读名：末两段用 ` / ` 连接且去掉扩展名；只有一段时就是该段 */
function pageName(rel: string): string {
  const tail = pageTailSegs(rel);
  return tail.slice(-2).join(' / ') || String(rel ?? '');
}

/** 页所在目录（去掉 `html` 前缀与文件名），供功能点归属用 */
function pageFolder(rel: string): string {
  return pageTailSegs(rel).slice(0, -1).join('/');
}

/**
 * 原型页相对路径 → 稳定段（**单元 id 的唯一来源**）。
 *
 * 🔴 为什么必须带内容哈希：中文页名经 `slug()`（只留 `[a-z0-9]`）会**塌成同一段** ——
 *    `云资源监测` 与 `数据安全审计` 的 ascii 段都只剩数字残留。只靠 ascii 段会撞 id；
 *    靠「重名加序号」去重又让幂等依赖遍历顺序（教训见 `figma-unit-splitter.ts#idSlug`）。
 *    哈希让 id **只由锚点派生**，与顺序无关。
 */
function pageSlug(rel: string): string {
  const noExt = String(rel).replace(/\.[^./\\]+$/, '');
  const segs = noExt.split(/[\\/]+/).filter(Boolean);
  const tail = segs.length && /^html$/i.test(segs[0]) ? segs.slice(1) : segs;
  const ascii = slug(tail.join('-')) || 'p';
  const h = createHash('sha1').update(String(rel).replace(/\\/g, '/')).digest('hex').slice(0, 8);
  return `${ascii}-${h}`;
}

/**
 * 拆分主流程。**永不抛异常**：空 pages 只是「零单元」，不是降级
 * （与 `splitFigmaUnits` 同口径：`degraded` 只在真的取不到输入时才有值）。
 */
export function splitHtmlUnits(p: HtmlUnitSplitParams): UnitContract {
  const builtAt = new Date().toISOString();
  const features = Array.isArray(p?.features) ? p.features : [];

  // 归一：去空、dedupe、升序 ⇒ 同输入幂等且与传入顺序无关
  const pages = [...new Set((p?.pages ?? []).map((s) => String(s ?? '').trim()).filter(Boolean))].sort();

  const units: ProjectUnit[] = pages.map((rel) => {
    const name = pageName(rel);
    return {
      componentId: `u-html-${pageSlug(rel)}`,
      name,
      sourceType: 'html',
      // 🔴 只产页级锚点：shotPath 留给 screenshot 源类型；selector 因 jsdom 的 sel() 不唯一而宁缺勿假
      anchor: { pagePath: rel },
      // jsdom 无布局引擎，量不出尺寸 ⇒ 不臆造数字
      box: { width: null, height: null },
      // 🔴 档位只从 deriveUnitTier 来，这里绝不写字面量 'lite'
      tier: deriveUnitTier('html'),
      status: 'pending',
      feature: attributeFeature(name, pageFolder(rel), features),
      note: 'HTML 原型页整体（非 Figma 分支）',
    };
  });

  // 稳定排序 ⇒ 同输入逐字节幂等（不依赖调用方传参顺序）
  units.sort((a, b) => (a.componentId < b.componentId ? -1 : a.componentId > b.componentId ? 1 : 0));

  // 真机判据（0 也要打）：一眼看出这次 HTML 分支拆了几个页
  p?.onLog?.({ runId: p.runId, mode: 'html-split', pages: pages.length, units: units.length });

  return {
    version: UNIT_CONTRACT_VERSION,
    runId: p.runId,
    builtAt,
    source: {
      kind: 'html',
      figmaUrl: null,
      figmaFileKey: null,
      figmaNodeId: null,
      inputKey: p.inputKey,
    },
    degraded: null,
    units,
    stats: computeUnitStats(units, features),
  };
}
