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
 * 本模块只做**观测**，不改变生成/重试行为：
 *  · `[lite-codegen]` 每次 codegen 一行「生成画像」（账号、实际生效的温度/token 上限、输出长度）；
 *  · `[truncation-detected]` 命中截断信号时额外一行，真机可直接 `grep -c` 得到计数；
 *  · 判据单一来源：结构缺失复用 `missingSfcBlocks`（与 validateLiteSfc 同一实现），
 *    LESS 残片复用 `healStrayLessArtifacts`（与写盘门禁同一实现），**不另写正则**。
 *
 * 🔴 温度/token 上限一律从 **VisionAgent 实例**读，不读 dto/配置文件：
 *    `normalizeRequestTemperature` / `getMaxTokens` 会按模型改写请求值，
 *    只有实例上的是真正发出去的值（推理模型温度被强制为 1、按模型封顶 token）。
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
    temperature: agent.temperature ?? '(unset)',
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
