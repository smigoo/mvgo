/**
 * 🛡️ R3-legacy 续补（2026-11-05）：背景真值归属锚 `resourceDomMapping` 的三源解析。
 *
 * 为什么需要它（前提纠正）：精修角色读的是 `execute(params)` 的**入参**
 * （`layout-refiner.js:337` → `:446` → `:841` → `bg-redline-scale-mode-guard.js:23` 取
 * `params.resourceDomMapping`），**不是**构造入参（`roleCfg`）。mc 两张图用
 * `state.resourceDomMapping || state._uiCache?.resourceDomMapping` 兜住「缓存恢复」态；
 * 动态工作流图（`graphs/dynamic-workflow-graph.js`）此前**没有任何等价兜底**：
 * 从既有 `outputPath` 续跑时（图内没有 figma-connector），state 里没有该表，
 * 而映射早已被 `figma-connector.js:2016` 落盘到 `<outputPath>/.mc-gen/resource-dom-mapping.json`
 * ⇒ 精修白名单静默为空、退化为旧行为（改写会把 `FILL→cover` / `FIT→contain` 的真值推翻成 `100% 100%`）。
 *
 * 口径：state → `_uiCache` → 磁盘，全部「非空数组才算命中」；解析失败一律 null，
 * 调用方行为与改动前逐字一致（零回归）。命中即写回 `state.resourceDomMapping`：
 * 图节点拿到的是同一个 `this.state` 引用（`graph.js:149`），写回对下游节点立即可见，
 * 既免逐节点重复读盘，也不需要再浅拷贝一份 state（值完全相同，拷贝纯属开销）。
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** 落盘位置（唯一真源：figma-connector 写、本模块读） */
export const RESOURCE_MAPPING_RELATIVE_PATH = join('.mc-gen', 'resource-dom-mapping.json');

function nonEmptyArray(v) {
  return Array.isArray(v) && v.length > 0 ? v : null;
}

/**
 * 解析当前任务可用的资源映射表。
 * @param {object} state 图状态或精修入参
 * @returns {Array|null} 命中即返回（并写回 `state.resourceDomMapping` 供下游复用）；否则 null
 */
export function resolveResourceDomMapping(state) {
  if (!state || typeof state !== 'object') return null;

  const top = nonEmptyArray(state.resourceDomMapping);
  if (top) return top;

  const cached = nonEmptyArray(state._uiCache?.resourceDomMapping);
  if (cached) {
    state.resourceDomMapping = cached;
    return cached;
  }

  const outputPath = state.outputPath;
  if (!outputPath || typeof outputPath !== 'string') return null;

  const mappingPath = join(outputPath, RESOURCE_MAPPING_RELATIVE_PATH);
  if (!existsSync(mappingPath)) return null;

  try {
    const parsed = nonEmptyArray(JSON.parse(readFileSync(mappingPath, 'utf-8')));
    if (!parsed) return null;
    state.resourceDomMapping = parsed;
    return parsed;
  } catch {
    return null; // 坏 JSON / 读失败 ⇒ 与改动前一致（白名单为空）
  }
}
