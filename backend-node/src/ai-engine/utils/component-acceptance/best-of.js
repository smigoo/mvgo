/**
 * 修复轮「单调不劣」守卫（best-of 保留）。
 *
 * 🔴 2026-11-12（mc-max-1794461199581-253def62 实锤）：定向修复轮把 FAIL 从 **1 涨到 4**
 *   （`effective=false`，日志 `FAIL=4 prev=1`）——为消一条 D-GRID，LLM 重写 index.vue 时
 *   把「普通厂商」整组删掉（D1 分组塌陷 / C1b 16 条文本缺席 / E2-v3 图标零消费）。
 *   既有逻辑只判「收敛与否」（`converged = fails < prev`），不收敛就直接按**当前**（更坏）
 *   的产物走降级/拒交付 ⇒ 用户拿到的是修复轮破坏后的版本，比不修还差。
 *
 * 本模块只做一件确定性的事：**每轮验收后保留 FAIL 最少的产物快照；若下一轮更差，
 * 把产物（内存 + 磁盘）恢复到该快照再重新判定**。判据本身不动（FAIL 照旧全跑全计数），
 * 放宽的只是「用哪一版产物交付」。零语义猜测、零硬编码：好坏只由 FAIL 条数定义。
 *
 * 🛡️ 根治⑭-A（2026-11-13 · mc-1794530400449-1fc2485d 实锤）：回滚直写点此前**零语法校验**
 *   —— 统一终态落盘刚把好版 StatsSection.vue(3232B) 写盘，acceptance-rollback 随即把
 *   内存快照里的坏版(3515B，`:style` 注入)直接 writeFileSync 盖回去，绕过全部门禁；
 *   终局扫描检出后无缓存可回退 ⇒ 坏版交付、预览「组件加载失败」。治本：恢复 .vue 前
 *   跑 `validateVueSfcExpressions`（与终局扫描/产物终验同一判据，单一来源）——
 *   坏文件不写盘、不回写内存（保留磁盘/内存现状），登记 skippedBad 留痕。
 */

import { validateVueSfcExpressions } from '../sfc-syntax-validation.js';

/**
 * 生成产物快照。只收字符串内容（文件路径 → 源码），非字符串键（结构体/buffer）不参与，
 * 避免把深层可变对象拷进 state 后被后续轮次原地改写。
 *
 * @param {Record<string, any>} files 产物全集（path → content）
 * @param {{fails: Array<{code: string}>}} acc 该轮的验收结果
 * @returns {{failCount:number, codes:string[], files:Record<string,string>} | null}
 */
export function snapshotAcceptanceFiles(files, acc) {
  if (!files || typeof files !== 'object') return null;
  if (!acc || !Array.isArray(acc.fails)) return null;
  const snapFiles = {};
  for (const [rel, content] of Object.entries(files)) {
    if (typeof content === 'string') snapFiles[rel] = content;
  }
  return {
    failCount: acc.fails.length,
    codes: acc.fails.map((f) => String(f?.code || '')),
    files: snapFiles,
  };
}

/**
 * 是否应当更新快照：新快照严格更优（FAIL 更少）才覆盖，等值不覆盖
 * （等值时保留更早的版本，避免把「同样坏但改动更多」的产物当成最优）。
 */
export function isBetterSnapshot(prev, next) {
  if (!next) return false;
  if (!prev) return true;
  return next.failCount < prev.failCount;
}

/** 下一轮是否劣化（FAIL 数上升）到必须回滚。 */
export function shouldRollback(snap, nextFailCount) {
  if (!snap || !Number.isFinite(nextFailCount)) return false;
  return nextFailCount > snap.failCount;
}

/**
 * 恢复快照：内存 map 与磁盘同时回写（下游交付与预览分别读这两处，缺一会不一致）。
 * 🛡️ 根治⑭-A（2026-11-13 · 1fc2485d 实锤）：`.vue` 内容恢复前过 `validateVueSfcExpressions`
 *   （判据与终局扫描同源）——坏文件**不写盘、不回写内存**（保留磁盘/内存现状，绝不把
 *   好版盖成坏版），登记 `skippedBad` 供调用方留痕。
 *
 * @param {{files:Record<string,string>}} snap
 * @param {Record<string, any>} files 目标内存 map（原地改写，调用方持有同一引用）
 * @param {string|null} outputPath 产物根目录；缺省则只恢复内存
 * @param {{mkdirSync:Function, writeFileSync:Function, join:Function, dirname:Function}} io
 *        注入式 IO（生产传 node:fs / node:path，测试传桩，避免在 util 里硬绑模块）
 * @returns {{restored:string[], writeFailed:string[], skippedBad:string[]}}
 */
export function restoreAcceptanceSnapshot(snap, files, outputPath, io) {
  const restored = [];
  const writeFailed = [];
  const skippedBad = [];
  if (!snap || !snap.files) return { restored, writeFailed, skippedBad };
  const { mkdirSync, writeFileSync, join, dirname } = io || {};
  for (const [rel, content] of Object.entries(snap.files)) {
    // 🛡️ 根治⑭-A：坏 .vue 拒绝恢复（内存与磁盘都不动，保留当前好版）
    if (rel.endsWith('.vue') && typeof content === 'string') {
      const _chk = validateVueSfcExpressions(content, rel);
      if (!_chk.valid) {
        skippedBad.push(rel);
        continue;
      }
    }
    if (files && typeof files === 'object') files[rel] = content;
    if (!outputPath || typeof writeFileSync !== 'function') continue;
    try {
      const abs = join(outputPath, rel);
      if (typeof mkdirSync === 'function') mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content, 'utf-8');
      restored.push(rel);
    } catch (_e) {
      // 单文件写盘失败不阻断：内存已恢复，交付以内存为准；留痕供日志核对
      writeFailed.push(rel);
    }
  }
  return { restored, writeFailed, skippedBad };
}
