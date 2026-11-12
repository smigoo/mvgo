/**
 * 🛡️ 2026-11-07（tmp 泄漏治理·启动自愈 + 周期清扫）：
 *
 * 背景：沙箱异常态下 rename 100% EPERM（见 rename-with-copy-fallback.js），
 * 持久化走「写唯一 .tmp → rename 失败 → 降级直写」路径。该路径的 tmp 尽力清理
 * （fs.unlink）在沙箱态下同样 EPERM 静默失败 → 残留 tmp 无限堆积。
 * 实测（2026-11-05 ~ 11-07，PID 80473）：data/ 下堆积 7146 个
 * `tasks.json.<pid>.<ts>.<rand>.tmp`（单个 120MB），累计 522GB。
 *
 * 本模块提供确定性清扫：
 *   - 匹配 `<base>.json[.prev].<pid>.<ts>.<hex>.tmp` 命名模式的遗留 tmp；
 *   - 仅清理 mtime 早于 maxAgeMs（默认 1 小时）的文件——避开可能在途的写入；
 *   - unlink 逐个 try/catch（沙箱态失败仅计数，不抛出、不阻断主流程）；
 *   - 返回 { scanned, matched, deleted, failed, freedBytes } 供调用方落日志。
 *
 * 覆盖范围：data/ 目录下 tasks.service / batch.service / config.service /
 * task-manager 四个写入点的全部 tmp 变体（含 .prev 中间态）。
 * 不触碰 .rename-probe / .restart-probe 等非 .json 探针文件。
 */
import fs from 'fs'
import path from 'path'

// 形如 tasks.json.80473.1793958142529.a948893867f81.tmp
// 或   tasks.json.prev.80473.1793953268737.edfd95ad9d873.tmp
const STALE_TMP_PATTERN = /^.+\.(?:prev\.)?\d+\.\d+\.[0-9a-f]+\.tmp$/i

export function isStalePersistTmpName(name) {
  return STALE_TMP_PATTERN.test(name)
}

export function sweepStalePersistTmp(
  dataDir,
  {
    maxAgeMs = 60 * 60 * 1000,
    label = 'PersistTmpSweeper',
    logger = console,
    fsImpl = fs, // 测试注入点：jest 下 ESM/CJS interop 会使 fs 模块 spy 失效，故允许注入 fake
  } = {},
) {
  const result = { scanned: 0, matched: 0, deleted: 0, failed: 0, freedBytes: 0 }
  try {
    if (!fsImpl.existsSync(dataDir)) return result
    const now = Date.now()
    const entries = fsImpl.readdirSync(dataDir)
    for (const name of entries) {
      result.scanned++
      if (!isStalePersistTmpName(name)) continue
      result.matched++
      const full = path.join(dataDir, name)
      try {
        const st = fsImpl.statSync(full)
        if (!st.isFile()) continue
        if (now - st.mtimeMs < maxAgeMs) continue // 在途保护：只清超龄文件
        fsImpl.unlinkSync(full)
        result.deleted++
        result.freedBytes += st.size
      } catch (err) {
        result.failed++
        if (result.failed === 1) {
          logger?.warn?.(
            `[${label}] tmp 清扫：首个删除失败（后续同类失败静默计数）: ${err?.code || ''} ${err?.message} file=${name}`,
          )
        }
      }
    }
    if (result.deleted > 0) {
      logger?.log?.(
        `[${label}] tmp 清扫：删除 ${result.deleted} 个遗留 tmp，释放 ${(result.freedBytes / 1073741824).toFixed(2)} GB` +
          (result.failed > 0 ? `（${result.failed} 个删除失败，残留待下轮）` : ''),
      )
    } else if (result.matched > 0 && result.failed > 0) {
      logger?.warn?.(`[${label}] tmp 清扫：${result.matched} 个 tmp 全部删除失败（疑似沙箱态，残留 ${result.matched} 个）`)
    }
    return result
  } catch (err) {
    logger?.warn?.(`[${label}] tmp 清扫失败（不阻断主流程）: ${err?.message}`)
    return result
  }
}
