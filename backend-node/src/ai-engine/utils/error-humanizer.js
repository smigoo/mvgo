/**
 * 生成错误人话翻译（S1 体验优化）。
 *
 * 把**平台自身管线**抛出的技术错误（如「组件脚本分段拼装不完整」「生成代码未通过质量检查」）
 * 翻译成用户能看懂、且带「下一步动作」的友好提示，注入到进度流/任务 error。
 *
 * ⚠️ 2026-11-12 契约变更（用户指令）：「**上游模型（LLM provider）报错一律不做加工，原样透传**」。
 * 原因是历史实现会把 provider 原始报错正则改写成人话，产生两类问题：
 *   ① 归因错误 —— 典型「Figma 429」被 `/429/` 命中后译成「模型额度已用尽」，用户被误导去换模型；
 *   ② 信息丢失 —— 用户拿不到 provider 原文（含 error.type / 余额 / model 名），无法自行排查。
 * 现约定：**判定为上游模型报错 ⇒ 输出 `上游模型报错：<原始错误原文>`，不翻译、不改写、不归因**。
 * 仅「平台自身管线」错误（质量门禁 / 分块拼装 / 视觉降级 / 覆盖率 / 语义门禁）仍走人话翻译。
 *
 * 纯函数、零依赖、无副作用；未命中的错误原样返回（不吞掉技术细节，调试仍可见）。
 */

/**
 * 上游模型（LLM provider）报错特征 —— 全部取自 provider / HTTP 传输层，与平台管线错误互斥。
 *
 * ① OpenAI / new-api 兼容错误体（provider 原样返回的 JSON 片段）：
 *    `{"error":{...}}`、new_api_error、invalid_api_key、insufficient_quota、model_not_found、
 *    context_length_exceeded、rate_limit_exceeded、content_filter、invalid_request_error
 * ② axios / SDK 透传的 HTTP 失败：`Request failed with status code 4xx/5xx`
 * ③ provider 主机名直出（网络/证书/端点类报错常带 baseURL）：api.deepseek.com / dashscope.aliyuncs.com /
 *    api.openai.com / openrouter.ai / fenno.ai
 * ④ 中文额度 / 限流措辞：余额不足 / 额度已用尽 / 预扣费额度失败 / 配额耗尽 / 限流 / 频率限制
 *
 * ⚠️ 调用方必须先用 `/figma/i` 排除 Figma 链路：figma-connector 同样走 axios，会抛**同形**
 *    `Request failed with status code 429`，若不加排除会把设计稿限流说成「上游模型报错」。
 */
const UPSTREAM_MODEL_ERROR_RE =
  /"error"\s*:\s*\{|new_api_error|invalid_api_key|insufficient[_\- ]*(user[_\- ]+)?quota|quota[_\- ]*(exceeded|exhausted)|model_not_found|context_length_exceeded|rate_limit_exceeded|content_filter|invalid_request_error|Request failed with status code\s+\d{3}|api\.deepseek\.com|dashscope\.aliyuncs\.com|api\.openai\.com|openrouter\.ai|fenno\.ai|余额不足|额度已?用尽|额度不足|预扣费额度失败|配额[^。\n]{0,8}(耗尽|用尽|不足)|\b429\b|too many requests|rate.?limit|限流|请求过于频繁|频率限制/i

/**
 * 判定是否为「上游模型报错」（平台不得加工，须原样透传）。
 * Figma 链路错误一律不算 —— 见 UPSTREAM_MODEL_ERROR_RE 注释。
 * @param {string} m 已 trim 的原始错误信息
 * @returns {boolean}
 */
export function isUpstreamModelError(m) {
  const s = String(m || '')
  if (!s.trim()) return false
  if (/figma/i.test(s)) return false
  return UPSTREAM_MODEL_ERROR_RE.test(s)
}

/**
 * @param {string|Error|object|null|undefined} message 原始错误信息
 * @returns {string} 上游模型报错原样透传（带前缀）/ 平台错误的人话提示 / 未命中时原 message
 */
export function humanizeGenerationError(message) {
  const m = String(message || '').trim()
  if (!m) return '生成失败，请重试'

  // 🛡️ 2026-11-12 用户指令：上游模型报错不做任何处理，直接转给用户看（统一前缀 `上游模型报错：`）。
  // 必须排在所有分支【最前】——否则 provider 的 429/额度报文会先被下面的正则改写成人话，
  // 既丢掉原文又可能归因错误（这正是本轮要拔除的行为）。
  if (isUpstreamModelError(m)) {
    return `上游模型报错：${m}`
  }

  // 视觉模型超时 / 首 token 超时 / provider 挂起（慢模型首 token 60~97s 或额度不足）
  if (/first-token|首.?token|provider 挂起|无输出|响应超时/.test(m)) {
    return '视觉模型响应超时（可能额度不足或网络抖动）。已切换备用模型，或建议稍后重试'
  }
  // 节点/阶段执行超时
  if (/节点执行超时|执行超时|600000|node.*timeout|总超时/i.test(m)) {
    return '该组件较复杂，分析耗时超过上限。建议换更快的模型，或稍后重试'
  }
  // 🛡️ 2026-09-16 治本（da7d931c 实锤）：分块拼装缺失脚本段。
  // 必须排在下面「截断」分支【之前】——否则会被 `/截断/` 抢先命中，页面显示
  // 「超出单次生成上限，建议换上下文更长的模型」；而实测该任务全部 chunk 的
  // finishReason 均为 stop（输入 12.9~14.2 万 / 输出仅 1k~6.6k），与上下文长度无关，
  // 换模型解决不了，属 scriptSplit 分段合并产物残缺。
  if (/缺少 <script setup>|分块拼装|分段拼装|拼装后必然残缺/.test(m)) {
    return '组件脚本分段拼装不完整，系统已自动重试修正；若持续失败请简化组件（与模型上下文长度无关）'
  }
  // max_tokens 截断（仅确凿证据；「可能/疑似被截断」这类推测措辞不再命中）
  if (
    /\bmax_?tokens\b|maxTokens|finish_?reason\s*[:=]\s*['"]?length|输出被截断|超出.*上限/.test(
      m,
    )
  ) {
    return '组件内容较多，超出单次生成上限。建议换上下文更长的模型重试'
  }
  // 语义不完整 / 自由变量拦截
  if (/语义不完整|自由变量|拒绝产出坏文件|未声明/.test(m)) {
    return '模型生成代码存在缺陷（引用了未定义变量），系统已自动重试修正'
  }
  // 🛡️ 低覆盖率 fail-closed（2026-09-11 治本）：必须先于「臆造/盲生成」分支匹配。
  // 原逻辑把 low-coverage 也归入 /臆造/ → 页面显示「视觉识别未完成，重试会复用设计稿缓存」，
  // 与真实原因（覆盖率不足，且重试是 bypassCache 重新识图）不符，误导用户以为视觉模型没跑完。
  // 治本：带出真实 coverageRate，并说明重试会重新识别而非复用缓存。
  const lowCov = m.match(/(?:low-coverage|覆盖率严重不足)[^0-9]*(\d+)\s*%/i) || m.match(/覆盖率严重不足\s*\((\d+)%\)/)
  if (/low-coverage|覆盖率严重不足/.test(m)) {
    const pct = lowCov ? lowCov[1] : null
    // 🛡️ 2026-09-30 归因治本（诉求：让用户知道「问题出在模型分析本身」）：
    // 旧文案是「…必要时请**简化设计稿**或换视觉模型」——把"改设计稿"放在首位，
    // 用户会先去怀疑自己的稿子。实测这类低覆盖**几乎都是视觉模型召回不足**：
    // 图中明明有文字（coverageReport.missing[].characters 有值），模型没提取出来。
    // 改为：先明确归因到模型分析能力，再给行动项；并说明「模型不变时直接重试结果相近」，
    // 避免用户无意义地反复重试。
    return pct
      ? `当前视觉模型对该设计稿的识别能力不足（覆盖率仅 ${pct}%，低于 35% 阈值）：图中明确存在的内容未能被完整识别。这属于视觉模型的分析能力问题，与设计稿复杂度关系有限。建议更换识别能力更强的视觉模型后重新生成；直接重试会重新识图（不复用缓存），但模型不变时结果相近`
      : '当前视觉模型识别能力不足，图中部分内容未被识别——属模型分析能力问题，与设计稿无关。建议更换识别能力更强的视觉模型后重新生成'
  }
  // 视觉分析降级阻断（盲生成保护）
  // 🛡️ 2026-09-16 治本：去掉「臆造」——「禁止臆造校验未通过」（DO-NOT-INVENT 门禁）是
  // 代码质量门禁类错误，却被「臆造」误匹配到视觉降级分支，页面显示「视觉识别未完成」误导用户。
  if (/视觉分析失败或降级|盲生成/.test(m)) {
    return '视觉识别未完成，为避免盲生成已中止。重试会重新识别设计稿，更快完成'
  }
  // 🛡️ 2026-11-12（生产 7/7 实锤）：Figma 链路限流必须与「模型」彻底分家。
  // 实锤：tasks.json 中 error 含「模型额度已用尽」的 7 单，100% 含 figma 节点、底层真错均为
  // figma-connector 的 getImageUrl 撞 api.figma.com 429（裸串 "Request failed with status code 429"）。
  // 旧 regex 只因子串 `429` 就命中，把 Figma 限流的锅甩给「模型额度」，用户被误导去换模型。
  //
  // ⚠️ 2026-11-12 契约变更后本支的定位：模型侧的 429/额度已由函数开头的「上游模型报错」原样透传
  //    分支接管（provider 原文直出，不再翻译）。此处**只保留 Figma 一支**，用于明确告知
  //    「这不是模型问题」——它由 figma-connector 抛出、带 Figma/429/限流 标记。
  //    原第②③支（模型额度 / 上游频率限制）已成死代码：任何非 Figma 的 429/额度文案都会先命中
  //    开头分支，故删除，避免读者误以为仍有「模型额度」人话翻译。
  // ⚠️ `429` 必须带 \b 边界：生产实锤「Figma 节点逻辑尺寸: 414x158（scale=2 导出栅格 70429 bytes）」
  //    会因裸子串 `70429` 误命中本支（旧代码同样误命中过，只是译成了「模型额度」）。
  if (/figma/i.test(m) && /\b429\b|限流|rate.?limit|too many requests/i.test(m)) {
    return '设计稿数据获取被 Figma 限流（与模型额度无关），请稍后重试'
  }
  // 代码质量门禁
  if (/FLEX-\d|CODE-\d|LESS-COMPILE|结构校验|质量门禁|禁止臆造|DO-NOT-INVENT/.test(m)) {
    return '生成代码未通过质量检查，系统已自动重试修正'
  }

  // 默认：原样返回，保留技术细节供调试
  return m
}

export default humanizeGenerationError
