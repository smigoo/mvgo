/**
 * SelfOptimizer - Loop 自优化器
 *
 * 核心职责：
 * 1. 持久化每次运行的 metrics / quality 数据
 * 2. 分析历史数据，检测重复出现的错误模式
 * 3. 根据模式自动调整 prompt 参数（prompt augmentation）
 * 4. 输出优化建议给下一次运行
 *
 * 数据存储: data/metrics-history.json (JSON Lines 格式，每行一次运行)
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createLogger } from '../logger/index.js'
import { dataDir } from '../../config/backend-root.js'

const logger = createLogger({ name: 'self-optimizer' })

// 存储路径
const DATA_DIR = dataDir
const METRICS_FILE = join(DATA_DIR, 'metrics-history.jsonl')
const PATTERN_FILE = join(DATA_DIR, 'error-patterns.json')
const OPTIMIZATION_FILE = join(DATA_DIR, 'optimization-state.json')

// ============================================
// 初始化
// ============================================

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
}

// ============================================
// 核心 API
// ============================================

/**
 * 记录一次完整的运行 metrics
 * @param {Object} runData - 单次运行的全部数据
 */
export function recordRun(runData) {
  ensureDataDir()

  const record = {
    timestamp: Date.now(),
    date: new Date().toISOString(),
    ...runData,
    // 自动提取关键摘要字段
    _summary: {
      totalDuration: runData.totalDuration || 0,
      finalScore: runData.finalQualityScore || 0,
      iterationCount: runData.iterationCount || 1,
      routingEvents: runData.routingEvents || [],
      l0Result: runData.l0Result || null,
      issueCategories: runData.issueCategories || {},
      v3Mode: runData.v3Mode || 'full'
    }
  }

  // 追加写入 JSONL（append-only，高效且安全）
  try {
    appendFileSync(METRICS_FILE, JSON.stringify(record) + '\n', 'utf-8')
    logger.info(`📝 SelfOptimizer: 已记录本次运行`, { score: record._summary.finalScore })
  } catch (e) {
    logger.error('SelfOptimizer: 写入 metrics 失败', e.message)
  }
}

/**
 * 分析最近 N 次运行，检测错误模式
 * @param {number} [windowSize=10] - 窗口大小（最近 N 次）
 * @returns {Object} 模式分析结果
 */
export function analyzePatterns(windowSize = 10) {
  ensureDataDir()

  if (!existsSync(METRICS_FILE)) {
    return { patterns: [], suggestions: [], sampleSize: 0 }
  }

  try {
    const raw = readFileSync(METRICS_FILE, 'utf-8').trim()
    if (!raw) return { patterns: [], suggestions: [], sampleSize: 0 }

    const runs = raw.split('\n').map(line => {
      try { return JSON.parse(line) } catch { return null }
    }).filter(Boolean)

    // 取最近 N 次
    const recent = runs.slice(-windowSize)

    // === 1. 错误频率统计 ===
    const errorFreq = {}       // { "stylistic:颜色偏差": 5, "layout:flex方向": 3 }
    const categoryFreq = {}     // { stylistic: 12, layout: 8, structural: 2 }
    const scoreTrend = []      // 时间序列
    const routeTrend = []      // 路由决策时间序列

    for (const run of recent) {
      const s = run._summary || {}

      // 分数趋势
      scoreTrend.push({ ts: s.date, score: s.finalScore })

      // 分类统计
      if (s.issueCategories) {
        for (const [cat, issues] of Object.entries(s.issueCategories)) {
          categoryFreq[cat] = (categoryFreq[cat] || 0) + (Array.isArray(issues) ? issues.length : 1)
          if (Array.isArray(issues)) {
            for (const issue of issues) {
              const key = `${cat}:${typeof issue === 'string' ? issue : JSON.stringify(issue)}`
              errorFreq[key] = (errorFreq[key] || 0) + 1
            }
          }
        }
      }

      // 路由事件
      if (s.routingEvents && Array.isArray(s.routingEvents)) {
        routeTrend.push(...s.routingEvents.map(r => ({ ...r, ts: s.date })))
      }
    }

    // === 2. 检测高频错误（阈值: 出现率 > 50%） ===
    const threshold = Math.ceil(recent.length * 0.5)
    const frequentErrors = Object.entries(errorFreq)
      .filter(([, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])

    // === 3. 检测分数趋势 ===
    const avgScore = scoreTrend.reduce((s, x) => s + x.score, 0) / (scoreTrend.length || 1)
    const last5 = scoreTrend.slice(-5).map(x => x.score)
    const trendDirection = last5.length >= 3
      ? (last5[last5.length - 1] > last5[0] ? 'improving' : last5[last5.length - 1] < last5[0] ? 'declining' : 'stable')
      : 'insufficient_data'

    // === 4. 检测路由回环（同一组件被反复路由到同一节点） ===
    const loopDetections = detectRoutingLoops(routeTrend)

    // === 5. 生成优化建议 ===
    const suggestions = generateSuggestions({
      frequentErrors,
      categoryFreq,
      avgScore,
      trendDirection,
      loopDetections,
      sampleSize: recent.length
    })

    const result = {
      patterns: frequentErrors.map(([error, count]) => ({ error, count, rate: count / recent.length })),
      categoryBreakdown: categoryFreq,
      scoreAnalysis: {
        average: Math.round(avgScore * 10) / 10,
        trend: trendDirection,
        recentScores: last5
      },
      loopDetections,
      suggestions,
      sampleSize: recent.length,
      windowSize,
      analyzedAt: new Date().toISOString()
    }

    // 缓存分析结果
    writeFileSync(PATTERN_FILE, JSON.stringify(result, null, 2), 'utf-8')

    return result
  } catch (e) {
    logger.error('SelfOptimizer: 模式分析失败', e.message)
    return { patterns: [], suggestions: [], error: e.message, sampleSize: 0 }
  }
}

/**
 * 根据历史模式，为下次运行生成 prompt 增强指令
 * @returns {Object} { promptAugmentation, parameterAdjustments, warnings }
 */
export function getOptimizationForNextRun() {
  const analysis = analyzePatterns()
  if (!analysis.suggestions || analysis.suggestions.length === 0) {
    return { promptAugmentation: '', parameterAdjustments: {}, warnings: [] }
  }

  const augmentations = []
  const warnings = []
  const params = {}

  for (const suggestion of analysis.suggestions) {
    switch (suggestion.type) {
      case 'color_drift':
        augmentations.push(
          `\n⚠️ [自动增强-基于${analysis.sampleSize}次历史] 颜色值必须从 Figma fills.color 精确转换，禁止估算或近似。`
        )
        params.temperature = Math.max(0, (params.temperature || 0.1) - 0.05) // 降低温度提高精度
        break

      case 'style_coverage':
        augmentations.push(
          `\n⚠️ [自动增强-基于${analysis.sampleSize}次历史] 内容区背景图必须覆盖到对应容器（backgroundImage），per-element 样式属性（阴影/圆角/边框）必须逐一在 CSS 中体现，不可遗漏。`
        )
        break

      case 'layout_error':
        augmentations.push(
          `\n⚠️ [自动增强-基于${analysis.sampleSize}次历史] flex-direction 和 justify-content 必须与预览图视觉布局一致。先判断主轴方向再写 CSS。`
        )
        break

      case 'scoped_missing':
        augmentations.push(
          `\n⚠️ [自动增强] 每个 .vue 文件 <style> 块必须包含 lang="less" scoped，并 @import index.less。这是硬性要求。`
        )
        break

      case 'chart_init':
        augmentations.push(
          `\n⚠️ [自动增强] ECharts 图表初始化必须遵循以下顺序：watch(chartRef) → nextTick → ResizeObserver → echarts.init()。$mcComponentBuilder() 必须用 try-catch 包裹。`
        )
        break

      case 'routing_loop':
        warnings.push(
          `⚠️ 检测到路由循环: ${suggestion.detail} (${suggestion.count}次)。建议检查对应节点的输出逻辑。`
        )
        // 降低最大迭代次数避免死循环
        if (!params.maxIterations) params.maxIterations = 1
        break

      case 'score_declining':
        warnings.push(
          `⚠️ 最近5次平均分呈下降趋势 (${analysis.scoreAnalysis.recentScores.join('→')})，建议检查 AI model 配置或 prompt 规则是否有退化。`
        )
        params.temperature = Math.min(0.3, (params.temperature || 0.1) + 0.05) // 稍微提高创造性
        break
    }
  }

  const result = {
    promptAugmentation: augmentations.join('\n'),
    parameterAdjustments: params,
    warnings,
    _meta: {
      sourceAnalysis: analysis.sampleSize > 0 ? 'real_data' : 'empty',
      suggestionCount: analysis.suggestions.length,
      generatedAt: new Date().toISOString()
    }
  }

  // 写入优化状态文件（供前端展示）
  ensureDataDir()
  writeFileSync(OPTIMIZATION_FILE, JSON.stringify(result, null, 2), 'utf-8')

  return result
}

// ============================================
// 内部工具函数
// ============================================

/**
 * 检测路由回环
 *
 * 🛡️ 2026-09-04 修复误报：部分节点在设计上会「多次进入」——典型如 microcode-engineer
 * 是分块代码生成节点（一个组件拆 N 个 chunk，每个 chunk 一次节点进入 = 一条 routingEvent）。
 * 这些节点的连续多次进入是正常分块，不是路由循环。若误判为循环，会连带触发
 * getOptimizationForNextRun 把 maxIterations 强制降为 1（self-optimizer.js:229），
 * 反而削弱后续精修迭代质量。
 * 真死循环由图层面 retryCountByTarget（同目标连续失败 2 次 → 强制全量重做）兜底，
 * 历史统计层排除分块节点是安全的。
 */
const CHUNK_MULTI_ENTRY_NODES = new Set(['microcode-engineer'])

function detectRoutingLoops(routeEvents) {
  const loops = []
  // 按 target 分组，看同一 target 是否连续出现 ≥3 次（排除已知分块多入节点）
  const targetSequence = routeEvents.map(r => r.target).filter(Boolean)

  for (let i = 2; i < targetSequence.length; i++) {
    if (targetSequence[i] === targetSequence[i-1] && targetSequence[i] === targetSequence[i-2]) {
      const target = targetSequence[i]
      // 分块多入节点：跳过，不计入循环（避免误报 + 误压 maxIterations）
      if (CHUNK_MULTI_ENTRY_NODES.has(target)) continue
      // 避免重复记录同一个循环
      const existing = loops.find(l => l.target === target)
      if (!existing) {
        loops.push({ target, detectedAt: routeEvents[i]?.ts, count: 3 })
      } else {
        existing.count++
      }
    }
  }

  return loops
}

/** 根据分析数据生成建议
 *
 * issue 字符串有两种来源：
 * 1. 程序化检测 → 大写枚举（CONTENT_BG_MISSING, STYLE_COVERAGE, MIXED_LAYOUT ...）
 * 2. LLM 返回   → 中文描述（颜色偏差, 阴影缺失, 间距错误 ...）
 * 匹配时需同时覆盖两种格式。
 */
function generateSuggestions({ frequentErrors, categoryFreq, avgScore, trendDirection, loopDetections, sampleSize }) {
  const suggestions = []

  // 高频颜色问题 — 只匹配颜色相关，不再用 startsWith('stylistic') 一网打尽
  const colorErrors = frequentErrors.filter(([k]) => {
    const lower = k.toLowerCase()
    return lower.includes('颜色') || lower.includes('color') || lower.includes('色值') || lower.includes('色彩')
  })
  if (colorErrors.length > 0) {
    suggestions.push({ type: 'color_drift', priority: 'high', detail: colorErrors.map(([k,c]) => `${k}(${c}次)`).join(', ') })
  }

  // 高频样式覆盖问题 — CONTENT_BG_MISSING / STYLE_COVERAGE / 阴影缺失 / 圆角
  const styleErrors = frequentErrors.filter(([k]) => {
    const lower = k.toLowerCase()
    return lower.includes('content_bg') || lower.includes('style_coverage') ||
           lower.includes('阴影') || lower.includes('shadow') ||
           lower.includes('圆角') || lower.includes('border-radius') ||
           lower.includes('边框') || lower.includes('border')
  })
  if (styleErrors.length > 0) {
    suggestions.push({ type: 'style_coverage', priority: 'high', detail: styleErrors.map(([k,c]) => `${k}(${c}次)`).join(', ') })
  }

  // 高频布局问题 — layout 分类 + flex/对齐/间距关键词 + 程序化枚举
  const layoutErrors = frequentErrors.filter(([k]) => {
    const lower = k.toLowerCase()
    return lower.includes('layout') || lower.includes('flex') || lower.includes('对齐') ||
           lower.includes('间距') || lower.includes('padding') || lower.includes('margin') ||
           lower.includes('mixed_layout') || lower.includes('base_panel_chrome')
  })
  if (layoutErrors.length > 0) {
    suggestions.push({ type: 'layout_error', priority: 'high', detail: layoutErrors.map(([k,c]) => `${k}(${c}次)`).join(', ') })
  }

  // scoped-less 问题
  const scopedErrors = frequentErrors.filter(([k]) => {
    const lower = k.toLowerCase()
    return lower.includes('scoped') || lower.includes('less')
  })
  if (scopedErrors.length > 0) {
    suggestions.push({ type: 'scoped_missing', priority: 'medium', detail: scopedErrors.map(([k,c]) => `${k}(${c}次)`).join(', ') })
  }

  // 图表初始化问题
  const chartErrors = frequentErrors.filter(([k]) => {
    const lower = k.toLowerCase()
    return lower.includes('echarts') || lower.includes('chart') || lower.includes('init')
  })
  if (chartErrors.length > 0) {
    suggestions.push({ type: 'chart_init', priority: 'high', detail: chartErrors.map(([k,c]) => `${k}(${c}次)`).join(', ') })
  }

  // 路由循环
  if (loopDetections.length > 0) {
    suggestions.push({ type: 'routing_loop', priority: 'critical', detail: loopDetections.map(l => `${l.target}(${l.count}次)`).join(', '), count: loopDetections[0].count })
  }

  // 分数趋势
  if (trendDirection === 'declining' && avgScore < 80) {
    suggestions.push({ type: 'score_declining', priority: 'medium', detail: `平均分 ${avgScore.toFixed(1)}, 趋势下降` })
  }

  return suggestions.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 }
    return (order[a.priority] || 9) - (order[b.priority] || 9)
  })
}

// ============================================
// CLI 工具函数（供调试/手动触发）
// ============================================

/**
 * 获取最近 N 条 metrics 记录
 */
export function getRecentRuns(n = 20) {
  ensureDataDir()
  if (!existsSync(METRICS_FILE)) return []
  const raw = readFileSync(METRICS_FILE, 'utf-8').trim()
  if (!raw) return []
  return raw.split('\n').slice(-n).map(line => {
    try { return JSON.parse(line) } catch { return null }
  }).filter(Boolean)
}

/**
 * 获取优化状态快照
 */
export function getOptimizationState() {
  ensureDataDir()
  if (!existsSync(OPTIMIZATION_FILE)) return null
  try {
    return JSON.parse(readFileSync(OPTIMIZATION_FILE, 'utf-8'))
  } catch {
    return null
  }
}
