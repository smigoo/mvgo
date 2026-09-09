/**
 * 🛡️ P1-4：坏文件隔离降级的**决策层**（纯函数，2026-08-30）
 *
 * ## 问题（R9，mc-max-1788067021808-b401bed4 实锤）
 * 5 个子组件全部生成成功，仅 `FlowPrediction.vue` 一个 SFC 编译失败
 * → 1436 字符主入口 + 4 个健康子组件**全部丢弃**，9 分钟成果清零。
 * SFC 语义门禁本意是「防坏文件写盘」，却承担了「一个坏 → 全盘否决」的连坐语义。
 *
 * ## 分级策略
 * | 失败文件 | 处理 |
 * |---|---|
 * | `package/index.vue` | **不可降级** → 重试（预算内）/ fail-closed |
 * | `package/components/*.vue` | **可降级**：剔除 + 摘引用 + 记入 degradedFiles |
 * | 其它 .vue | **不可降级**（位置未知，保守 fail-closed） |
 *
 * 本模块只做「能不能降级、降级哪些」的决策（可单测）；
 * 摘引用（`_pruneDanglingSubComponentImports`）与复检（`validateVueSfc`）
 * 由调用方执行 —— 它们依赖类方法与外部解析器，不属于纯逻辑。
 */

/**
 * 是否可降级：仅 `package/components/*.vue`（一层）允许剔除。
 * 嵌套更深的子组件位置语义不明，保守 fail-closed。
 */
export function isDegradableVuePath(relPath) {
  const p = String(relPath || '').replace(/\\/g, '/');
  return /^package\/components\/[^/]+\.vue$/.test(p);
}

/**
 * 决策：给定全部产物与坏文件清单，给出降级方案
 *
 * @param {Object<string,string>} allFiles 路径 → 内容（不会被修改，返回浅拷贝）
 * @param {string[]} badPaths SFC 编译失败的文件相对路径
 * @returns {{ok:boolean, reason?:string, files?:Object, removed?:string[]}}
 *   - `ok:false` → 含不可降级文件，调用方应维持原 fail-closed 行为
 *   - `ok:true`  → `files` 为剔除坏文件后的浅拷贝，`removed` 为被剔除清单
 */
export function planBadFileIsolation(allFiles, badPaths) {
  const files = { ...(allFiles || {}) };
  const bad = (Array.isArray(badPaths) ? badPaths : []).filter(Boolean);
  if (bad.length === 0) return { ok: false, reason: '无坏文件' };

  const undegradable = bad.filter((p) => !isDegradableVuePath(p));
  if (undegradable.length > 0) {
    return {
      ok: false,
      reason: `含不可降级文件（${undegradable.join('、')}），保持 fail-closed`,
    };
  }

  const removed = [];
  for (const p of bad) {
    if (!(p in files)) continue;
    delete files[p];
    removed.push(p);
  }
  if (removed.length === 0) return { ok: false, reason: '坏文件不在产物集中' };

  return { ok: true, files, removed };
}
