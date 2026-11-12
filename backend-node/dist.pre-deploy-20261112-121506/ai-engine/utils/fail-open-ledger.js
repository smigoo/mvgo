// 🛡️ fail-open 显性化台账（2026-10-20 · #128 流程四件套 ②/③ 共用载体）。
//
// 背景：管线里大量「降级/跳过/空串/只报不改」路径此前只打日志（甚至静默），
//   真机上「真值段没进 prompt」「图片下载了零引用」「自愈失败」无从察觉，
//   只能靠用户截图发现（84af4f8f/47647fae 实锤）。
//
// 治本：所有此类事件除 logger 外，必须带 reason 落进产物的 component-meta.json
//   `failOpenEvents[]`（任务 meta 可见、可聚合、可审计）。
//
// 纪律：
//   - 本函数自身 fail-open（返回 false），绝不允许台账写失败反过来弄挂主流程；
//   - 只写 component-meta.json（任务元数据），不写产物代码文件（写盘唯一出口原则）；
//   - 同 rule+reason 去重（幂等——重试轮次会反复触发同一事件）；
//   - 容量封顶 50 条（防爆），溢出保最新。

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MAX_EVENTS = 50

/**
 * 追加一条 fail-open/降级/审计事件到 component-meta.json。
 * @param {string} outputPath 产物输出目录（无 ⇒ 直接 false）
 * @param {{rule:string, severity?:string, reason:string, detail?:object}} event
 * @returns {boolean} 是否成功落账
 */
export function appendFailOpenEvent(outputPath, event) {
  try {
    if (!outputPath || typeof outputPath !== 'string') return false
    const rule = String(event?.rule || '').trim()
    const reason = String(event?.reason || '').trim()
    if (!rule || !reason) return false
    const metaPath = join(outputPath, 'component-meta.json')
    let meta = {}
    if (existsSync(metaPath)) {
      try {
        meta = JSON.parse(readFileSync(metaPath, 'utf-8')) || {}
      } catch {
        meta = {} // 元数据损坏不阻断：从空对象重建（原文件其它字段丢失风险 < 主流程被弄挂）
      }
    }
    if (!Array.isArray(meta.failOpenEvents)) meta.failOpenEvents = []
    // 幂等去重：同 rule+reason 只保留最新一条（重试会反复触发）
    meta.failOpenEvents = meta.failOpenEvents.filter(
      (e) => !(e?.rule === rule && e?.reason === reason),
    )
    meta.failOpenEvents.push({
      rule,
      severity: event.severity || 'WARN',
      reason,
      ...(event.detail ? { detail: event.detail } : {}),
      at: new Date().toISOString(),
    })
    if (meta.failOpenEvents.length > MAX_EVENTS) {
      meta.failOpenEvents = meta.failOpenEvents.slice(-MAX_EVENTS)
    }
    writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
    return true
  } catch {
    return false
  }
}

export default { appendFailOpenEvent }
