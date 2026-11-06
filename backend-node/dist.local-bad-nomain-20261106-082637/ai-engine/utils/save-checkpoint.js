/**
 * P2（快照机制统一）：Checkpoint 保存 —— 单一实现。
 *
 * ## 为什么收编
 * 此前 `saveCheckpoint` 在 `mc-component-graph-phase2.js:4264` 与
 * `mc-component-graph-vue3.js:3371` **各实现了一遍**，经逐行比对（去注释后）
 * **36 行完全一致**。两份拷贝意味着：改一处忘另一处 → 两个 graph 的断点续跑行为
 * 悄悄分叉，且分叉点极难发现（只在「换 graph 后断点续跑失效」时才暴露）。
 *
 * 本模块是这两处的**唯一权威实现**，行为与原实现逐条对齐（含所有 fallback）。
 *
 * ## 职责
 * 1. 本地：写 `{outputPath}/.checkpoint/{name}.json`（2 空格缩进），目录递归创建。
 * 2. 全局：仅当 `name` 为 `figma` / `visual` 时，按 `fileKey + nodeId` 写跨任务共享缓存
 *    （`analysis` 不写 —— 它是本轮特有结果，不具备跨任务复用价值）。
 *
 * ## 契约（重要）
 * - `outputPath` 为空 → 直接返回 `false`，**不写盘、不报 warn**（两个 graph 原实现都是这个语义）。
 * - 写盘抛错 → **不冒泡**，仅 `logger.warn` 后返回 `false`（Checkpoint 是加速手段，
 *   失败绝不能阻断生成主流程）。
 * - 共享缓存抛错 → **不影响**本地 checkpoint（内层独立 try/catch）。
 *
 * @param {object} p
 * @param {string} [p.outputPath] 组件产物目录；空则跳过
 * @param {string} p.name checkpoint 名（figma / visual / analysis）
 * @param {any} p.data 待持久化数据
 * @param {{info?:Function,warn?:Function}} [p.logger]
 * @param {string} [p.fileKey] Figma fileKey（写共享缓存需要）
 * @param {string} [p.nodeId] Figma nodeId（写共享缓存需要）
 * @returns {Promise<boolean>} 是否成功写入本地 checkpoint
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
// 静态 import 而非动态 `await import()`：
//  ① shared-cache.js 只依赖 fs/path，无循环依赖风险；
//  ② jest 在 CJS 模式下不支持动态 await import()，动态写法会导致无法 mock（测试恒假通过）。
import { saveSharedCache } from './shared-cache.js';

export async function saveCheckpoint({
  outputPath,
  name,
  data,
  logger,
  fileKey,
  nodeId,
} = {}) {
  if (!outputPath) return false;

  // ⚠️ 必须包一层箭头函数，不能直接取 `logger.info` / `logger.warn` 的裸引用。
  // 真实 logger（ai-engine/logger/logger.js）内部实现是 `this.log('warn', ...)`：
  // 裸引用调用时 this === undefined → TypeError: Cannot read properties of undefined
  // (reading 'log') → **整个 Node 进程崩溃**（2026-09-02 实锤：本文件收编后首次跑
  // 生成即在 phase2.js:586 `state._saveCheckpoint?.('figma', ...)` 处炸掉）。
  // 教训：mock 成 `{ info(){}, warn(){} }` 的普通对象不依赖 this，单元测试**测不出**这个 bug。
  const info =
    logger && typeof logger.info === 'function'
      ? (...args) => logger.info(...args)
      : null;
  const warn =
    logger && typeof logger.warn === 'function'
      ? (...args) => logger.warn(...args)
      : null;

  try {
    const cpDir = join(outputPath, '.checkpoint');
    mkdirSync(cpDir, { recursive: true });
    writeFileSync(join(cpDir, `${name}.json`), JSON.stringify(data, null, 2), 'utf-8');
    if (info) info(`💾 Checkpoint 已保存: ${name}`);

    // 🆕 S3 全局缓存：按 fileKey+nodeId 跨任务复用（figma 数据 / vision 结果 / 资源映射），
    // 使「重新提交 Figma URL / 换模型 / 换 sessionId」也能跳过最贵的 Figma 拉取 + Vision AI。
    if (name === 'figma' || name === 'visual') {
      try {
        if (name === 'figma') {
          saveSharedCache(outputPath, fileKey, nodeId, { figmaNodeData: data });
        } else if (name === 'visual') {
          saveSharedCache(outputPath, fileKey, nodeId, {
            previewAnalysis: data,
            resourceDomMapping:
              data?.resourceDomMapping ||
              data?.layoutStructure?.resourceDomMapping ||
              null,
          });
        }
      } catch {
        /* 全局缓存写失败不阻断 */
      }
    }
    return true;
  } catch (e) {
    if (warn) warn(`Checkpoint 保存失败 (${name}): ${e && e.message ? e.message : e}`);
    return false;
  }
}
