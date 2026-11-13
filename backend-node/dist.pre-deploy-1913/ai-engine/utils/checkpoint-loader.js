/**
 * Checkpoint 加载器 — 断点续跑公共工具
 *
 * 从组件输出目录的 `.checkpoint/` 读取已保存的中间产物，构建断点续跑所需的
 * `resumeData`（跳过已完成的分析阶段）与 `uiCache`（跳过 Figma/视觉重复调用）。
 *
 * 来源：从 page-generator.service.ts 的 checkpoint 检测逻辑抽取（2026-08-04），
 * 供 phase2 组件单生成、页面生成重试等多处复用。
 *
 * ⚠️ 本文件是纯 JS（ESM），不要使用 TS 类型注解 —— 由 node 直接执行。
 *
 * 三级 checkpoint 语义：
 *   - code-generated（Level 3）: package/index.vue 已存在 → 无需再生成
 *   - full（Level 1）         : .checkpoint 有 figma/visual/analysis → 从 analysis 后续跑
 *   - figma-cached（Level 2） : 仅 figma.json → 从 visual 后续跑
 *   - none                    : 无 checkpoint → 全量执行
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * 检测并加载组件的断点续跑数据。
 * @param {string|null|undefined} outputPath 组件输出目录（temp-components/<gid>/<cid>）
 * @returns {{ stage: string, resumeData: object|null, uiCache: object|null, detectedOutputPath: string|null }}
 */
export function loadCheckpoint(outputPath) {
  if (!outputPath || !existsSync(outputPath)) {
    return { stage: 'none', resumeData: null, uiCache: null, detectedOutputPath: outputPath || null }
  }

  const cpDir = join(outputPath, '.checkpoint')

  const loadJson = (name) => {
    const p = join(cpDir, `${name}.json`)
    if (!existsSync(p)) return null
    try {
      return JSON.parse(readFileSync(p, 'utf-8'))
    } catch {
      return null
    }
  }

  const figmaCp = loadJson('figma')
  const visualCp = loadJson('visual')
  const analysisCp = loadJson('analysis')
  const hasAnyCheckpoint = !!(figmaCp || visualCp || analysisCp)

  if (!hasAnyCheckpoint) {
    return { stage: 'none', resumeData: null, uiCache: null, detectedOutputPath: outputPath }
  }

  const cachedReviewResult = analysisCp?.reviewResult ?? null
  const cachedStyleMappings = analysisCp?.styleMappings ?? null

  // Level 3: 代码已生成
  if (existsSync(join(outputPath, 'package', 'index.vue'))) {
    return {
      stage: 'code-generated',
      resumeData: { stage: 'code-generated', cachedReviewResult, cachedStyleMappings },
      uiCache: { figmaNodeData: figmaCp, previewAnalysis: visualCp },
      detectedOutputPath: outputPath,
    }
  }

  // Level 2 / Level 1: 至少 figma 已缓存 → 从 analysis 后续跑（figma/visual 由 uiCache 短路）
  // 有 analysis → 从并行分析后继续；否则从视觉分析后继续
  // 🛡️ low-coverage 保护（2026-09-03，mc-max-1788369858014 实锤）：视觉分析覆盖率 <40% 属
  // 「严重不足」，若仍判 full（跳过视觉分析直接代码生成），会绕过 low-coverage 保护、复用
  // 低覆盖缓存生成可能缺失元素的产物。此时降级为 figma-cached（重新走视觉分析），让
  // visual-parser 节点重新评估并触发「定向重分析」补全覆盖率。
  const coverageRate =
    visualCp?.layoutStructure?.coverageReport?.coverageRate ??
    visualCp?.coverageReport?.coverageRate;
  const isLowCoverage = typeof coverageRate === 'number' && coverageRate < 40;
  const stage =
    cachedReviewResult && cachedStyleMappings && !isLowCoverage ? 'full' : 'figma-cached'
  return {
    stage,
    resumeData: { stage, cachedReviewResult, cachedStyleMappings },
    uiCache: {
      figmaNodeData: figmaCp,
      // 🛡️ low-coverage 时不携带 previewAnalysis → visual-parser 节点不短路、重新分析
      // （触发「定向重分析」补全覆盖率）。否则即便 stage 降为 figma-cached，uiCache 命中
      // 仍会跳过 Vision AI 直接复用低覆盖缓存（绕过 low-coverage 保护）。
      previewAnalysis: isLowCoverage ? undefined : visualCp,
    },
    detectedOutputPath: outputPath,
  }
}

export default loadCheckpoint
