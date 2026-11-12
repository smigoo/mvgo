/**
 * @file lite-truncation-telemetry.js — Lite 代码生成「同图同模型不同果」的可归因埋点
 *
 * 背景（2026-11-11 真机 mc-lite-1794382414032-bff01bf7）：同一张图、同一个模型，
 * 有人生成成功、有人预览报「组件样式 (LESS) 渲染失败 Unrecognised input」。根因不是模型能力
 * 差异，而是**本次输出有没有断在语法中间**：Lite 单次整体输出 SFC，maxTokens 到顶时可能在
 * `color: ` 中间切断；`visionTemperature` 又按账号/请求可配 ⇒ 断点随机。
 * 事故复盘时日志里只有「生成代码不完整，自动重试一次」，查不出是哪次、哪个账号、
 * 什么温度、输出多长 ⇒ 无法归因，也无法统计命中率。
 *
 * 本模块做**观测 + 择优判据**，自身不发起任何模型调用：
 *  · `[lite-codegen]` 每次 codegen 一行「生成画像」（账号、实际生效的温度/token 上限、输出长度）；
 *  · `[truncation-detected]` 命中截断信号时额外一行，真机可直接 `grep -c` 得到计数；
 *  · `pickLessTruncatedAttempt` — 截断重试的**择优判据唯一来源**（缺失块更少者胜，打平取更长者），
 *    供 lite.service 决定「是否采纳重试产物」，禁止调用侧另写一套比较（2026-11-12：旧实现盲覆盖）。
 *  · 判据单一来源：结构缺失复用 `missingSfcBlocks`（与 validateLiteSfc 同一实现），
 *    LESS 残片复用 `healStrayLessArtifacts`（与写盘门禁同一实现），**不另写正则**。
 *
 * 🔴 温度/token 上限一律从 **VisionAgent 实例**读，不读 dto/配置文件。
 *    但**必须读 `_lastRequestTemperature` 而不是 `temperature`**：完整性自愈会临时抬高
 *    `temperature` 并在 finally 还原 ⇒ 事后读 `temperature` 恒得「配置值」，日志会谎报
 *    （2026-11-12 生产日志 `[lite-codegen] temperature=0`，而那一轮真正采样温度是 0.5）。
 */

import { healStrayLessArtifacts } from '../ai-engine/validators/less-compile-gate.js'

/** SFC 三块闭合标签判据（validateLiteSfc 与截断守卫共用，唯一来源） */
export function missingSfcBlocks(vueCode = '') {
  const src = String(vueCode || '')
  const requiredBlocks = [
    ['<template', '</template>'],
    ['<script setup', '</script>'],
    ['<style', '</style>'],
  ]
  return requiredBlocks
    .filter(([openTag, closeTag]) => !src.includes(openTag) || !src.includes(closeTag))
    .map(([, closeTag]) => closeTag)
}

/**
 * 抽取 SFC 的 `<style>` 内容。
 * 🔴 用 `(?:<\/style>|$)` 而非必须闭合：输出正好断在样式中间时 `</style>` 不存在，
 *    此时残片恰好最需要被看见（结构信号 missing-block 也会同时命中）。
 */
export function extractSfcStyleSource(vueCode = '') {
  const m = /<style\b[^>]*>([\s\S]*?)(?:<\/style>|$)/i.exec(String(vueCode || ''))
  return m ? m[1] : ''
}

/**
 * 检测一次 codegen 输出是否带「截断痕迹」。
 * 两类信号互补：
 *  ① missing-block：缺闭合标签（强信号，2026-11-03 既有守卫口径）；
 *  ② stray-artifact：标签闭合但样式里有横幅残片 / 混入标签 / 悬空声明 / 根级裸属性
 *     （上一轮 LESS 红卡真机形态）——复用 `healStrayLessArtifacts` 的 removedLines 计数。
 *
 * 🔴 `retryTriggered` 严格保持 2026-11-03 既有守卫口径（仅 missing-block 触发重试）：
 *    stray 只观测、不新增模型调用；确定性修复由发布前 `repairLessDirectory` /
 *    `compileIndexCssStrict` 那条链负责，本模块不重复干预。
 */
export function detectLiteCodegenTruncation({ vueCode = '', genText = '' } = {}) {
  const code = String(vueCode || '')
  const output = String(genText || '')
  const missingBlocks = missingSfcBlocks(code)
  const styleSource = extractSfcStyleSource(code)
  const heal = styleSource
    ? healStrayLessArtifacts(styleSource, { sourceType: 'style' })
    : { removedLines: 0 }
  const strayArtifacts = Number(heal.removedLines || 0)
  const parseFailed = code.trim().length < 30

  const signals = []
  if (missingBlocks.length > 0) signals.push('missing-block')
  if (strayArtifacts > 0) signals.push('stray-artifact')
  if (parseFailed) signals.push('parse-failed')

  return {
    // parseFailed 是「输出解析失败」，不等价于截断，不能混进截断计数（假绿）
    truncated: !parseFailed && signals.length > 0,
    parseFailed,
    signals,
    missingBlocks,
    strayArtifacts,
    codeLength: code.length,
    outputLength: output.length,
    retryTriggered: !parseFailed && missingBlocks.length > 0,
  }
}

/**
 * 截断重试**择优保留**判据（唯一来源，2026-11-12 根治）。
 *
 * 背景：`callCodegenWithTruncationRetry` 原实现是 `guarded = await call(...)` —— 无条件用第二轮
 * 覆盖第一轮。第二轮的缺失块可能更多（更差），于是「重试」变成「劣化」。同文件 `control-guard`
 * 早已是「改善才采纳」的正确范式，此处把同一口径铺到截断重试上。
 *
 * 判据（确定性、可辩驳，只用 detectLiteCodegenTruncation 已有字段，不引入新信号）：
 *   ① 缺失闭合块更少者胜（`missingBlocks.length` 小 ⇒ 更完整）；
 *   ② 打平则代码更长者胜（真截断产物必然更短）；
 *   ③ 仍打平 ⇒ 不采纳（保留首轮，避免无依据的替换）。
 * @param {object} candidate 重试轮 event（detectLiteCodegenTruncation 返回值）
 * @param {object} incumbent 首轮 event
 * @returns {boolean} 是否应采纳 candidate
 */
export function pickLessTruncatedAttempt(candidate = {}, incumbent = {}) {
  const cMissing = Array.isArray(candidate.missingBlocks) ? candidate.missingBlocks.length : Infinity
  const iMissing = Array.isArray(incumbent.missingBlocks) ? incumbent.missingBlocks.length : Infinity
  if (cMissing !== iMissing) return cMissing < iMissing
  return Number(candidate.codeLength || 0) > Number(incumbent.codeLength || 0)
}

/** 只从 agent 实例取真实生效值；baseURL 只留 host，绝不把完整端点/密钥写进日志 */
export function collectVisionAgentMeta(agent = {}, extra = {}) {
  let baseURLHost = '(none)'
  try {
    baseURLHost = new URL(String(agent.baseURL || '')).host || '(none)'
  } catch {
    /* 非法/缺省 URL 保留 (none) */
  }
  return {
    userId: extra.userId ?? '(unknown)',
    model: agent.model ?? '(unknown)',
    baseURLHost,
    providerType: agent.providerType ?? 'auto',
    // 🔴 优先取「最后一次真正发出去的采样温度」：`temperature` 会被自愈临时抬高 + finally 还原，
    //    单读它会谎报（见文件头注）。`_lastRequestTemperature` 缺失时（老实例）才退回配置值。
    temperature: agent._lastRequestTemperature ?? agent.temperature ?? '(unset)',
    // 自愈次数：>0 说明该轮发生过抬温重采样 ⇒ 「同图不同果」可归因
    selfHeal: Number(agent._selfHealCount || 0),
    maxTokens: agent.maxTokens ?? '(unset)',
    tier: extra.tier ?? 'lite',
    target: extra.target ?? '(unknown)',
  }
}

const field = (v) => String(v ?? '').replace(/\s+/g, '_') || '-'

/**
 * 单行、可 grep 的结构化日志（禁止换行与空格分隔歧义）。
 * tag 用 `[lite-codegen]` / `[truncation-detected]`；计数以日志行为准，
 * 进程内计数器一律不引入（重启清零 ⇒ 与真机日志对不上）。
 */
export function formatLiteTelemetryLog({
  tag,
  sessionId,
  meta,
  event,
  attempt = 1,
  extra = {},
}) {
  const pairs = [
    ['sessionId', sessionId],
    ['userId', meta.userId],
    ['model', meta.model],
    ['temperature', meta.temperature],
    ['selfHeal', meta.selfHeal ?? 0],
    ['maxTokens', meta.maxTokens],
    ['provider', meta.providerType],
    ['endpoint', meta.baseURLHost],
    ['tier', meta.tier],
    ['target', meta.target],
    ['outputLen', event.outputLength],
    ['codeLen', event.codeLength],
    ['missing', event.missingBlocks.length ? event.missingBlocks.join(',') : 'none'],
    ['stray', event.strayArtifacts],
    ['signals', event.signals.length ? event.signals.join(',') : 'none'],
    ['truncated', event.truncated],
    ['attempt', attempt],
    ...Object.entries(extra),
  ]
  return `[${tag}] ${pairs.map(([k, v]) => `${k}=${field(v)}`).join(' ')}`
}
