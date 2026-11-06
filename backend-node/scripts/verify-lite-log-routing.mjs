#!/usr/bin/env node
/**
 * verify-lite-log-routing —— Lite 并发日志路由真跑判据（2026-11-05 串台事故的回归闸）
 *
 * 为什么不是 jest 用例：判据依赖 `src/ai-engine/logger/*.js`（原生 ESM + `import.meta.url`），
 * 本项目 jest 跑 CJS 转换，动态 import 会抛
 * `A dynamic import callback was invoked without --experimental-vm-modules`
 * （这正是 `safe-logger.js` 被单独拆出来的原因）。⇒ 用真 node 跑，直接测运行时行为。
 *
 * 两组互为对照，缺一不可：
 *   ① 新实现形态（镜像 logger **不带** sessionId + ALS 路由）⇒ 三路并发各自为战，串台数 0；
 *   ② 旧实现形态（每次调用把单例 logger 包一层、每层绑死自己的 sessionId、且 `origLogger`
 *      取到上一层的 Proxy）⇒ 三路全落同一批 session，串台数必 > 0。
 *   ② 若也变成 0，说明本脚本的"串台"度量坏了（判据恒真）——那才是真正的假绿。
 *
 * 用法：node scripts/verify-lite-log-routing.mjs      （exit 0 = 通过）
 */
import { Logger } from '../src/ai-engine/logger/index.js'

const results = []
function check(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅ PASS' : '🔴 FAIL'}  ${name}\n         ${detail}`)
}

/** 收集器：记录（sessionId → 收到的日志条数） */
function makeCollector() {
  const hit = new Map()
  return {
    progressManager: {
      sendLog: (sessionId, _level, message) => {
        const key = `${sessionId}::${message}`
        hit.set(key, (hit.get(key) || 0) + 1)
      },
    },
    /** 某 session 收到了哪些 message */
    messagesOf(sessionId) {
      return [...hit.keys()]
        .filter((k) => k.startsWith(`${sessionId}::`))
        .map((k) => k.split('::')[1])
    },
    total: () => [...hit.values()].reduce((a, b) => a + b, 0),
    cross(sessionId, ownMessage) {
      return this.messagesOf(sessionId).filter((m) => m !== ownMessage).length
    },
  }
}

const SESSIONS = ['mc-lab-A', 'mc-lab-B', 'mc-lab-C']

// ───────────────────────────── ① 新实现形态 ─────────────────────────────
{
  const c = makeCollector()
  // 镜像 logger：**不带** sessionId（与 lite.service.ts#ensureLoggerBridge 同形态）
  const mirror = new Logger({ name: 'lite', progressManager: c.progressManager, enableConsole: false, enableFile: false })
  const fakeNestLogger = { log: () => {}, warn: () => {}, error: () => {}, debug: () => {} }

  // 只装一次：代理层恒为 1（与 ensureLoggerBridge 的幂等闸同形态）
  const bridged = new Proxy(fakeNestLogger, {
    get(target, prop) {
      switch (prop) {
        case 'log': return (msg) => { target.log(msg); mirror.info(String(msg)) }
        case 'warn': return (msg) => { target.warn(msg); mirror.warn(String(msg)) }
        case 'error': return (msg) => { target.error(msg); mirror.error(String(msg)) }
        case 'debug': return (msg) => { target.debug(msg); mirror.debug(String(msg)) }
        default: return target[prop]
      }
    },
  })

  await Promise.all(
    SESSIONS.map((sid, i) =>
      Logger.runInSessionContext(sid, c.progressManager, async () => {
        // 模拟 lite 管线里的 await 链（ALS 必须穿透 await）
        await new Promise((r) => setTimeout(r, 5 - i))
        bridged.log(`任务 ${sid} 自己的日志`)
      }),
    ),
  )

  const bad = SESSIONS.filter((sid) => c.cross(sid, `任务 ${sid} 自己的日志`)).length
  const missing = SESSIONS.filter((sid) => !c.messagesOf(sid).includes(`任务 ${sid} 自己的日志`)).length
  check(
    '① 新形态：3 路并发日志各归各位',
    bad === 0 && missing === 0,
    `串台 session 数=${bad}（要求 0）｜漏收=${missing}（要求 0）｜总投递=${c.total()}（要求 3）`,
  )
  check('① 新形态：每条日志只投递一次（代理未叠套）', c.total() === 3, `总投递=${c.total()}（要求 3）`)
}

// ─────────────────────── ② 旧实现形态（阳性对照） ───────────────────────
{
  const c = makeCollector()
  const fakeNestLogger = { log: () => {}, warn: () => {}, error: () => {}, debug: () => {} }

  // 还原旧实现：每次 startGeneration 都把"当前 logger"包一层，镜像 logger 绑死本次 sessionId
  let current = fakeNestLogger
  for (const sid of SESSIONS) {
    const sseLogger = new Logger({ name: 'lite', sessionId: sid, progressManager: c.progressManager, enableConsole: false, enableFile: false })
    const origLogger = current // ← 关键：第二层开始拿到的是上一层的 Proxy
    current = new Proxy(origLogger, {
      get(target, prop) {
        switch (prop) {
          case 'log': return (msg) => { target.log(msg); sseLogger.info(String(msg)) }
          case 'warn': return (msg) => { target.warn(msg); sseLogger.warn(String(msg)) }
          case 'error': return (msg) => { target.error(msg); sseLogger.error(String(msg)) }
          case 'debug': return (msg) => { target.debug(msg); sseLogger.debug(String(msg)) }
          default: return target[prop]
        }
      },
    })
  }

  // 此刻只有最后一个任务在跑，它发一条日志
  current.log('最后一条任务的日志')

  const hitSessions = SESSIONS.filter((sid) => c.messagesOf(sid).length > 0)
  check(
    '② 旧形态阳性对照：一条日志 fan-out 给全部历史 session（判据能红）',
    hitSessions.length === SESSIONS.length && c.total() === SESSIONS.length,
    `命中 session=${hitSessions.length}/${SESSIONS.length}｜总投递=${c.total()}（旧实现应 = 层数，正是真机 timestamp 逐位相同的成因）`,
  )
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${failed.length === 0 ? '🎉 全部通过' : '🔴 存在失败'}：${results.length - failed.length}/${results.length}`)
process.exit(failed.length === 0 ? 0 : 1)
