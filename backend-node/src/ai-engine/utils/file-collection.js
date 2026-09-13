/**
 * 🛡️ 产物文件集形态归一（单一事实源，2026-09-13，刀 13-C 治本）
 *
 * 平台里「产物文件集」存在两种形态，两套子系统各用一种：
 *   A) 对象 map  `Object<string,string>`（路径 → 内容）
 *      —— CodeFixPipeline.apply / writeFiles / standardFiles / L0-B 的 generatedFiles 上游
 *   B) 数组      `Array<{path, content}>`
 *      —— 各 utils 纯函数 API（class-facts / root-container-normalizer / flex-sibling-guard …）
 *         + spec + 离线诊断脚本
 *
 * 由于「互转表达式」此前在 5+ 个模块里**各写一遍**
 * （class-facts.js:369 / root-container-normalizer.js:114 / text-order-guard.js:282 /
 *  resource-facts.js:98 / resource-attribution-validator.js:170），
 * 漏写者就会在另一形态下**静默早退**。
 *
 * 实锤（2026-09-13，FLEX-003 真机 0 命中）：`style-dedup-guard#pruneDuplicateStyleDecls`
 * 只写 `if (!Array.isArray(files) || files.length < 2) return { files, changes: [] }`，
 * 而管线传入的是对象 map → 恒早退、恒 `changes: []`、日志永不打印、修复永不生效，
 * 且**无任何告警**（返回原引用，调用方检测不到改动）。单测全绿是因为 spec 直接用数组调用，
 * 绕过了管线契约 —— 契约错位类 bug 的典型盲区。
 *
 * 本模块是「形态互转」的唯一实现；新增跨文件自愈工具一律从这里取，不要再手搓表达式。
 */

/** 输入是否已是数组形态 */
export function isFileArray(files) {
  return Array.isArray(files);
}

/**
 * 任意形态 → 数组形态 `[{path, content}]`。
 * 与既有 5 处内联实现语义完全一致：对象 map 用 `Object.entries` 展开，非对象返回空数组。
 *
 * @param {Array<{path:string,content:string}>|Object<string,string>|null|undefined} files
 * @returns {Array<{path:string, content:string}>}
 */
export function toFileArray(files) {
  if (Array.isArray(files)) return files;
  if (!files || typeof files !== 'object') return [];
  return Object.entries(files).map(([path, content]) => ({ path, content }));
}

/**
 * 把「数组形态的处理结果」回写成**与基准同形态**的产物。
 *
 * - 基准是数组 → 直接返回处理后的数组（离线脚本 / spec 路径）；
 * - 基准是对象 map → 返回只含变更项的新 map；**无变更时返回基准原引用**
 *   （这是契约要点：CodeFixPipeline 靠「返回引用是否变化 / 值是否不同」判定 applied，
 *    返回等值新对象不会产生误报，但返回原引用更省一次全量浅拷贝）。
 *
 * @param {Array|Object} baseFiles 基准产物（形态决定返回值形态）
 * @param {Array<{path:string,content:string}>} list 处理后的数组形态产物
 * @returns {Array|Object} 同形态产物
 */
export function mergeFileArray(baseFiles, list = []) {
  if (Array.isArray(baseFiles)) return Array.isArray(list) ? list : baseFiles;
  if (!baseFiles || typeof baseFiles !== 'object') return baseFiles;

  let changed = false;
  const out = { ...baseFiles };
  for (const f of Array.isArray(list) ? list : []) {
    const p = String(f?.path || '');
    if (!p || typeof f?.content !== 'string') continue;
    if (out[p] !== f.content) {
      out[p] = f.content;
      changed = true;
    }
  }
  return changed ? out : baseFiles;
}

export default { isFileArray, toFileArray, mergeFileArray };
