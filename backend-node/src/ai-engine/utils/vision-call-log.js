/**
 * @file vision-call-log.js — `[vision-call]` 单行埋点格式化（唯一来源）
 *
 * 背景（2026-11-17 真机三连跑）：同一张图（`mc-preview.png` md5 全等）、同一 prompt（逐字节相同）、
 * 同一模型，三次运行切出的段数 / 段身份 / headerRelation / 颜色数都不同。要判「到底是不是温度
 * 在捣鬼」，却发现 mc/max 管线日志里**一条 temperature 都没有** —— 只有 Lite 层的 `[lite-codegen]`
 * 有（`collectVisionAgentMeta` 只接了 `lite.service.ts`）。即：mc/max 的实发温度此前只能**推导**
 * （读代码逐跳算出来的 0），拿不到实证行。
 *
 * 本模块把「这一次请求真正发出去的采样参数」压成一行，供 `grep '\[vision-call\]'` 直接计数/比对。
 *
 * 🔴 只做格式化，不读配置、不参与任何判定：入参必须来自**请求现场**
 *    （agent 内已归一化的 `_lastRequestTemperature`、真正进 body 的 `max_tokens`、池 pick 出的
 *    provider 与 baseURL）。禁止在别处读 dto/config 拼这行日志 —— 那会记成「配置值」而非
 *    「实发值」，2026-11-12 的 `[lite-codegen] temperature=0` 失真（实际采样 0.5）就是这么来的。
 * 🔴 端点只留 host：绝不把完整 URL / 密钥写进日志。
 * 🔴 单行、空格分隔、`k=v` 无歧义，禁止换行（与 `[lite-codegen]` 同口径，便于 grep -c）。
 */

/** 只留 host；非法/缺省 URL 落 '-'（与 `collectVisionAgentMeta` 同口径） */
function hostOf(baseURL) {
  try {
    return new URL(String(baseURL || '')).host || '-'
  } catch {
    return '-'
  }
}

/** 值内空格压成下划线，保证单行 + `k=v` 分词不歧义；空值落 '-' */
function field(v) {
  const s = v === undefined || v === null || v === '' ? '-' : String(v)
  return s.replace(/\s+/g, '_')
}

/**
 * 生成一行 `[vision-call] model=… temperature=… maxTokens=… …`
 *
 * @param {object} p
 * @param {string} p.model        本次实际请求的模型 id（池 pick 后的，不是配置里的）
 * @param {number} p.temperature  本次实际进 body 的采样温度（0 必须原样保留，不可被 `||` 吞成默认）
 * @param {number} p.maxTokens    本次实际进 body 的 max_tokens（截断升档后应是 32000）
 * @param {string} [p.providerId] 池 pick 出的 provider id（`__primary_vision__` 等）
 * @param {string} [p.baseURL]    仅取 host
 * @param {number} [p.attempt]    当前重试轮次（从 1 起）
 * @param {number} [p.selfHeal]   本实例已触发的完整性自愈次数（>0 说明抬过温）
 * @param {string} [p.context]    调用上下文（如 `vision-agent.analyzeImage`）
 * @param {string} [p.protocol]   `openai-compatible` / `anthropic`
 * @param {string} [p.outputKind] 调用方声明的输出类型（判别「这一次是什么调用」）：
 *   `brief`=Lite 视觉分析 / `sfc`=Lite codegen / `json`=mc·max 视觉分析（visual-parser）/
 *   未声明落 `-`。**必带**：VisionAgent.analyzeImage 同时服务「看图」与「写码」，两者温度本就
 *   分属不同旋钮（视觉温度 vs codegen 基线 0）—— 少了本字段，同一 session 里两条
 *   `[vision-call]` 温度不同会被误读成「温度分叉」，实为两次不同性质的调用。
 * @returns {string} 单行日志
 */
export function formatVisionCallLog({
  model,
  temperature,
  maxTokens,
  providerId,
  baseURL,
  attempt = 1,
  selfHeal = 0,
  context,
  protocol,
  outputKind,
} = {}) {
  const pairs = [
    ['model', model],
    ['temperature', temperature],
    ['maxTokens', maxTokens],
    ['protocol', protocol || 'openai-compatible'],
    ['provider', providerId],
    ['endpoint', hostOf(baseURL)],
    ['attempt', attempt],
    ['selfHeal', selfHeal],
    ['outputKind', outputKind],
    ['context', context],
  ]
  return `[vision-call] ${pairs.map(([k, v]) => `${k}=${field(v)}`).join(' ')}`
}
