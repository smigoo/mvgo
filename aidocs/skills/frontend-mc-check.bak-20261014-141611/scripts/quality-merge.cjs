#!/usr/bin/env node
/**
 * AI 质量评分合并脚本
 * 将 AI 生成的 quality-scores.json 合并到 check-result.json
 * 用法：node quality-merge.cjs <quality-scores.json路径>
 */

const fs = require('fs')
const path = require('path')

function main() {
  const args = process.argv.slice(2)
  const qualityScoresPath = args.find((a) => !a.startsWith('--'))

  if (!qualityScoresPath) {
    console.error('用法：node quality-merge.cjs <quality-scores.json路径>')
    process.exit(1)
  }

  const absPath = path.isAbsolute(qualityScoresPath)
    ? qualityScoresPath
    : path.resolve(process.cwd(), qualityScoresPath)

  if (!fs.existsSync(absPath)) {
    console.error(`❌ 文件不存在：${absPath}`)
    process.exit(1)
  }

  let qualityScores
  try {
    qualityScores = JSON.parse(fs.readFileSync(absPath, 'utf-8'))
  } catch (e) {
    console.error(`❌ 解析失败：${e.message}`)
    process.exit(1)
  }

  if (!qualityScores.components || typeof qualityScores.components !== 'object') {
    console.error('❌ quality-scores.json 缺少 components 字段')
    process.exit(1)
  }

  // 从同目录查找 check-result.json
  const dir = path.dirname(absPath)
  const checkResultPath = path.join(dir, 'check-result.json')

  if (!fs.existsSync(checkResultPath)) {
    console.error(`❌ 同目录未找到 check-result.json：${dir}`)
    process.exit(1)
  }

  const checkResult = JSON.parse(fs.readFileSync(checkResultPath, 'utf-8'))
  let mergedCount = 0

  for (const [dirName, scoreData] of Object.entries(qualityScores.components)) {
    const comp = checkResult.components.find((c) => c.dirName === dirName)
    if (comp) {
      comp.aiReview = {
        totalScore: scoreData.totalScore,
        grade: scoreData.grade,
        scores: scoreData.scores,
        suggestions: scoreData.suggestions || []
      }
      mergedCount++
    } else {
      console.warn(`⚠️ 未匹配：${dirName}`)
    }
  }

  fs.writeFileSync(checkResultPath, JSON.stringify(checkResult, null, 2))
  console.log(`✅ 已合并 ${mergedCount} 个组件的质量评分到：${checkResultPath}`)
}

main()
