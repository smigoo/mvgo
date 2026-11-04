/**
 * 🛡️ P1-5：chunk-meta.json 的 `files` 字段多段映射（2026-08-30）
 *
 * ## 问题（R10，组件二 mc-max-1788065992847-affbab38 实锤）
 *
 * `package/index.vue` 会被拆成多段生成：
 *   - 默认：template(index 2) + script(index 3)
 *   - 超大组件（scriptSplit）：template(2) + script状态(3) + script生命周期(4) + script图表(5)
 *
 * 但写侧是单值覆盖：
 * ```javascript
 * blockFiles[filePath] = `${chunk.index || 0}-${safeName}`;
 * Object.assign(meta.files, blockFiles);   // ← 后写覆盖前写
 * ```
 * → `meta.files['package/index.vue']` 只剩最后一段（脚本 / 图表段）。
 *
 * 读侧直接把这段当完整文件恢复：
 * ```javascript
 * allFiles[relPath] = cleaned;             // ← 只剩 <script>，没有 <template>
 * ```
 * → 断点续跑 / 部分修订后 index.vue 变成残片；后续 chunk 见 `allFiles[f] != null`
 *   判定「已生成」而跳过 → **template 永久丢失**。
 *
 * ## 改法
 * - 写侧：`files[relPath]` 改为**段数组**，按 index 升序维护（同 index 重跑覆盖，不重复追加）
 * - 读侧：按角色给合并计划 —— index.vue = template 段 + 各 script 段合并；
 *         其余文件 = 按 index 顺序拼接
 * - 兼容：旧的单值（string）格式归一化成长度 1 的段数组，行为与原来一致
 *
 * 纯函数、无副作用、可单测。
 */

/** 主入口相对路径（多段生成只发生在 index.vue 上） */
export function isIndexVuePath(relPath) {
  const p = String(relPath || '').replace(/\\/g, '/');
  return p === 'package/index.vue' || p.endsWith('/package/index.vue');
}

/**
 * 归一化 `meta.files[relPath]` 的取值 → 段数组（按 index 升序）
 *
 * 入参形态：
 *   - `null` / `undefined` → []
 *   - `string`（旧格式，单值）→ [{ index: 0, file, segmentType:'', scriptPart:'' }]
 *   - `string[]`（旧格式数组）→ 同上，index 取下标
 *   - `Array<{index,file,segmentType,scriptPart}>`（新格式）→ 原样规范化
 *
 * @returns {Array<{index:number, file:string, segmentType:string, scriptPart:string}>}
 */
export function normalizeFileSegments(entry) {
  if (entry == null) return [];
  const raw = Array.isArray(entry) ? entry : [entry];
  const out = [];
  raw.forEach((item, i) => {
    if (item == null) return;
    if (typeof item === 'string') {
      if (!item) return;
      out.push({ index: 0, file: item, segmentType: '', scriptPart: '' });
      return;
    }
    if (typeof item !== 'object') return;
    const file = String(item.file || '').trim();
    if (!file) return;
    const idx = Number.isFinite(Number(item.index)) ? Number(item.index) : i;
    out.push({
      index: idx,
      file,
      segmentType: String(item.segmentType || ''),
      scriptPart: String(item.scriptPart || ''),
    });
  });
  // 稳定升序（Array.prototype.sort 在 V8 ≥ 7.0 稳定，此处再以 file 兜底保证确定性）
  out.sort((a, b) => (a.index - b.index) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  return out;
}

/**
 * 写侧 upsert：把一段产物登记到 `files[relPath]`
 * - 同 index 视为同一段重跑 → 覆盖（不重复追加）
 * - 同 file 名也视为同一段 → 覆盖
 * - 结果按 index 升序
 *
 * 直接修改并返回 filesMap（便于链式落盘）。
 *
 * @param {Object} filesMap `meta.files`
 * @param {string} relPath 产物相对路径
 * @param {{index:number,file:string,segmentType?:string,scriptPart?:string}} seg
 * @returns {Object} filesMap
 */
export function upsertFileSegment(filesMap, relPath, seg) {
  if (!filesMap || typeof filesMap !== 'object' || !relPath || !seg || !seg.file) {
    return filesMap;
  }
  const index = Number.isFinite(Number(seg.index)) ? Number(seg.index) : 0;
  const next = {
    index,
    file: String(seg.file),
    segmentType: String(seg.segmentType || ''),
    scriptPart: String(seg.scriptPart || ''),
  };
  // 🛡️ 刀 6（2026-09-13）：非 index.vue 的文件（完整子组件/样式/声明）多段 = 同路径双写。
  // 根因：语义名一波（TotalFlowSection）+ 通用名一波（ContentSection）两波 chunk 各写一份
  // 完整 .vue，旧实现 append 两段 → 读侧 concat 拼出「两份完整 SFC 拼一起」+ total 虚高
  // （traffic 18 个 vue 实锤）。多段（template/script 分段）只发生在 index.vue 上
  // （见 isIndexVuePath 注释），故非 index.vue 一律「后写覆盖」，只保留最新一段。
  if (!isIndexVuePath(relPath)) {
    filesMap[relPath] = [next];
    return filesMap;
  }
  const existing = normalizeFileSegments(filesMap[relPath]).filter(
    (s) => s.index !== index && s.file !== next.file,
  );
  existing.push(next);
  existing.sort((a, b) => (a.index - b.index) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  filesMap[relPath] = existing;
  return filesMap;
}

/**
 * 读侧：给出多段文件的合并计划
 *
 * - 单段 → `{ kind:'single', order:[seg] }`
 * - `package/index.vue` 多段 → `{ kind:'index-vue', template, scriptParts, ok }`
 *   - template 缺失时 `ok:false`（缺 <template> 的 index.vue 不是合法 SFC，
 *     恢复它会让后续 chunk 误判「已生成」而跳过 → template 永久丢失）
 * - 其它文件多段 → `{ kind:'concat', order:[...] }`（按 index 顺序拼接）
 *
 * template 段判定优先级：
 *   ① 显式 `segmentType === 'template'`
 *   ② 兜底：index === 2（分块编排中 template 恒为 index 2）
 *   ③ 再兜底：内容含 `<template` 且不含 `<script`
 *
 * @param {string} relPath
 * @param {Array} segments 已加载内容（`{...seg, content}`）
 */
export function planSegmentMerge(relPath, segments) {
  const segs = Array.isArray(segments) ? segments.filter(Boolean) : [];
  if (segs.length === 0) return { kind: 'empty', order: [], ok: false };

  const byIndex = [...segs].sort(
    (a, b) => (Number(a.index) || 0) - (Number(b.index) || 0),
  );
  // 单段无需判角色（旧格式单值走这条）
  if (byIndex.length === 1) return { kind: 'single', order: byIndex, ok: true };

  if (!isIndexVuePath(relPath)) {
    return { kind: 'concat', order: byIndex, ok: true };
  }

  let template =
    byIndex.find((s) => s.segmentType === 'template') ||
    byIndex.find((s) => Number(s.index) === 2) ||
    null;
  if (!template) {
    template =
      byIndex.find(
        (s) =>
          typeof s.content === 'string' &&
          /<template[\s>]/i.test(s.content) &&
          !/<script[\s>]/i.test(s.content),
      ) || null;
  }
  const scriptParts = byIndex.filter((s) => s !== template);
  return {
    kind: 'index-vue',
    template,
    scriptParts,
    ok: !!template,
  };
}
