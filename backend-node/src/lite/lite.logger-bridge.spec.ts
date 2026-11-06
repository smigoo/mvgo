/**
 * 🛡️ Lite 并发日志路由 —— 接线契约（本 spec 是「串台不再复发」的唯一判据）
 *
 * 真实缺口（2026-11-05 真机实锤，data/tasks.json）：
 *   三条并发 lab 任务的 progress **逐字相同**，连 timestamp 都逐位一致
 *   （1793896305583/84/85），而三者 fileKey 各不相同：
 *     mc-lab-…280074-a2919b5d  fileKey=GTcJm0DK…/48:5796
 *     mc-lab-…292339-2ea39450  fileKey=GTcJm0DK…/36:1693
 *     mc-lab-…302793-3e120489  fileKey=1t7Dmm…/2:8417   ← 后两条的日志里混进了 48:5796
 *
 *   根因（`lite.service.ts#logger` 字段注释有完整链条）：
 *   `startGeneration` 每次调用都把**单例**的 `this.logger` 改写成绑定当次 sessionId 的
 *   Proxy，且**从不还原** ⇒ 并发时 `origLogger` 取到的已是上一轮 Proxy，代理层层叠套，
 *   一条日志 fan-out 给所有在跑的 session。
 *
 * 判据设计（为什么是「结构计数」而不是逐个 if）：
 *   ① 代理**安装点**必须恰好 1 处（只装一次是治本的全部内容）；
 *   ② 镜像 logger 的 createLogger 参数里**不得出现 sessionId**（传了就退化成绑死一次调用）；
 *   ③ sessionId 必须由 `runInSessionContext`（ALS）提供；
 *   ④ 业务体必须与 ALS 包裹**同一函数边界**（包裹外面再写业务 ⇒ 那段日志掉到 ALS 之外）。
 *   ①② 任一被破坏，串台立刻复发且**不报错**（静默污染历史链接）——所以必须钉死在源码上。
 *
 * ⚠️ 运行时行为（ALS 是否真的隔离、代理是否真的只投递一次）**不在本文件判**：
 *   本仓库 jest 走 CJS 转换，动态 import `src/ai-engine/logger/*.js`（原生 ESM）会抛
 *   `A dynamic import callback was invoked without --experimental-vm-modules`。
 *   ⇒ 真跑判据在 `scripts/verify-lite-log-routing.mjs`（`npm run verify:lite-log-routing`）：
 *     它以旧实现的「代理叠套」做阳性对照，保证判据能红。
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const SRC = readFileSync(join(__dirname, 'lite.service.ts'), 'utf-8')

/** 统计 needle 在源码中出现的次数（字面量计数，避免正则转义歧义） */
function count(src: string, needle: string): number {
  let n = 0
  let i = 0
  while ((i = src.indexOf(needle, i)) !== -1) {
    n++
    i += needle.length
  }
  return n
}

describe('Lite 日志桥接接线契约', () => {
  it('核心判据①：logger 代理安装点恰好 1 处（禁止在并发入口改写单例）', () => {
    // 旧实现形态必须彻底消失
    expect(SRC).not.toContain('(this as any).logger = new Proxy')
    // 唯一安装点：ensureLoggerBridge 内部
    expect(count(SRC, 'this.logger = new Proxy(')).toBe(1)
    // 底座恒为 baseLogger（若写成 origLogger/this.logger，代理就会叠套）
    expect(SRC).toContain('const target = this.baseLogger;')
    expect(SRC).not.toContain('const origLogger = this.logger;')
  })

  it('核心判据②：镜像 logger 不带 sessionId（否则 ALF 变成「绑死某次调用」）', () => {
    const call = /createLogger\(\{[^}]*\}\)/g
    const calls = SRC.match(call) || []
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain("name: 'lite'")
    expect(calls[0]).toContain('progressManager: this.progressService')
    expect(calls[0]).not.toContain('sessionId')
  })

  it('核心判据③④：ALS 包裹单一入口，三个带 sessionId 的公开入口全部经过它', () => {
    // ③ ALS 单一来源：`runInSessionContext` 全文件只允许出现在 helper 里
    expect(count(SRC, 'runInSessionContext(')).toBe(1)
    // helper 唯一实现（定义处带泛型，故用 <T> 定位，不与该 helper 的调用点混淆）
    expect(count(SRC, 'withSessionLogContext<T>(')).toBe(1)
    // ④ 恰 3 个入口经 helper：startGeneration / upgradeAssets / resumeFromCheckpoint
    //    少一个 ⇒ 那个入口的日志只进控制台、不进面板（静默丢）；
    //    多一个 ⇒ 有人绕过 helper 自建上下文（就等于把「单一来源」又拆散了）
    expect(count(SRC, 'withSessionLogContext(')).toBe(3)
    expect(SRC).toContain('this.withSessionLogContext(sessionId, () =>\n      this.startGenerationInSession(')
    // 业务体确实搬到了独立方法里（并且是 async）
    expect(count(SRC, 'private async startGenerationInSession(')).toBe(1)
    // 桥接只装一次：调用点恰 1 处
    expect(count(SRC, 'await this.ensureLoggerBridge();')).toBe(1)
    // 幂等闸必须是 Promise 型（boolean 在并发首调有竞态窗口，正是本 bug 的成因形态）
    expect(SRC).toContain('private loggerBridgePromise?: Promise<void>;')
    expect(SRC).toContain('if (!this.loggerBridgePromise) {')
  })
})
