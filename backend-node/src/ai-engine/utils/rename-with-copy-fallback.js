/**
 * 🛡️ 2026-11-03（EPERM rename 风暴根治·降级路径）：
 *
 * 背景：WorkBuddy 沙箱态 shell spawn 的 Node 进程会对工作区路径的 `rename/unlink/rmdir`
 * 100% 抛 EPERM（spawn 时定型、终身不愈），导致「写 tmp → rename 落名」的所有原子提交
 * 全部失败，生成链路整单报废。环境侧无法从应用内修复，故提供确定性降级：
 *
 *   renameSync(src, dst) 失败（EPERM/EBUSY/EPERM 类）→
 *     cpSync(src, dst, { recursive: true, force: true }) 全量复制落名 →
 *     尽力 rmSync(src)（失败仅 warn，残留交给启动自愈/延迟清理）
 *
 * 契约：
 *   - 返回 { mode: 'rename' | 'copy', srcRemoved: boolean }，调用方据此决定清理策略。
 *   - 复制本身失败时抛原 rename 错误之外的复制错误（带上下文），由调用方走原有回滚。
 *   - 仅对 EPERM/EBUSY/ENOTEMPTY 之外的错误不降级？——不：EPERM/EBUSY 才降级，
 *     其余错误（ENOENT/ENOTDIR/EXDEV 语义错误等）原样抛出，避免掩盖真 bug。
 *     EXDEV（跨设备）也降级，复制是合法兜底。
 */
import fs from 'fs'

const FALLBACK_CODES = new Set(['EPERM', 'EBUSY', 'EXDEV'])

// ─── 🛡️ 2026-11-09 熔断器（tmp 泄漏根治）───
//
// 背景（实测 522GB 事故）：沙箱异常态下 rename 100% EPERM → 降级直写虽保住数据，
// 但每次原子写都会：writeFile(tmp) 残留 + unlink(tmp) 同被拦截失败 →
// 每次持久化泄漏 1-2 个 tmp（30s 一轮 → 两天堆出 7146 个 / 522GB）。
//
// 熔断语义：进程内一旦观测到 EPERM/EBUSY（环境拦截、终身不愈），置位后
// 调用方经 isRenameBroken() 跳过「写 tmp」步骤、直接覆写目标文件——
// 不再产生 tmp，泄漏从源头归零（数据安全性由既有 .prev 备份机制兜底）。
// 仅 EPERM/EBUSY 触发；EXDEV（跨设备）是合法降级场景，不视为环境损坏。
let renameBroken = false

export function isRenameBroken() {
  return renameBroken
}

export function markRenameBroken(reason = '', logger = null) {
  if (renameBroken) return
  renameBroken = true
  logger?.warn?.(
    `[rename-fallback] 熔断置位：rename 已被环境拦截${reason}，后续原子写转直写（不再产生 tmp）`,
  )
}

export function renameWithCopyFallback(src, dst, { logger = null, label = 'rename' } = {}) {
  try {
    fs.renameSync(src, dst)
    return { mode: 'rename', srcRemoved: true }
  } catch (error) {
    if (!FALLBACK_CODES.has(error?.code)) throw error
    // 🛡️ 2026-11-09：EPERM/EBUSY = 环境拦截（终身不愈），同步置位熔断器，
    // 让所有调用方后续跳过「写 tmp」直接覆写目标，从源头停止 tmp 泄漏。
    if (error.code === 'EPERM' || error.code === 'EBUSY') {
      markRenameBroken(`（${label} ${error.code}）`, logger)
    }
    // 降级：复制落名。
    // 🛡️ 2026-11-03 二次实锤（任务 mc-1793717694558-ca91718c）：沙箱异常态下
    // cpSync(文件 → 已存在文件, force) 内部会先 unlink 目标 → 仍 EPERM。
    // 故文件走 copyFileSync（O_TRUNC 直覆，不 unlink），目录才走 cpSync 递归。
    const srcStat = fs.statSync(src)
    if (srcStat.isFile()) {
      fs.copyFileSync(src, dst)
    } else {
      fs.cpSync(src, dst, { recursive: true, force: true, verbatimSymlinks: true })
    }
    let srcRemoved = false
    try {
      fs.rmSync(src, { recursive: true, force: true })
      srcRemoved = true
    } catch (cleanupError) {
      // 沙箱异常态下 unlink/rmdir 同样 EPERM：残留留给启动自愈，不阻断主流程。
      logger?.warn?.(`${label}：降级复制落名成功，源路径清理失败（保留待自愈）`, {
        src,
        error: cleanupError.message,
      })
    }
    logger?.warn?.(`${label}：rename ${error.code}，已降级为复制落名`, { src, dst, srcRemoved })
    return { mode: 'copy', srcRemoved }
  }
}
