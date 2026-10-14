#!/usr/bin/env node
/**
 * 逐个组件追加 AI 质量评分
 *
 * 用法1（命令行参数）：
 *   node add-score.cjs <报告目录> <组件名> '<JSON评分数据>'
 *
 * 用法2（heredoc/stdin，推荐，避免命令行过长）：
 *   node add-score.cjs <报告目录> <组件名> <<'EOF'
 *   {"totalScore":75,...}
 *   EOF
 *
 * 初始化模式：
 *   node add-score.cjs <报告目录> --init
 */

const fs = require('fs')
const path = require('path')

// 简化版数据校验（无需外部依赖）
function validateScore(data) {
  const errors = []

  // 必需字段
  if (typeof data.totalScore !== 'number') errors.push('totalScore 必须是数字')
  else if (data.totalScore < 0 || data.totalScore > 100) errors.push('totalScore 必须在 0-100 之间')

  if (typeof data.grade !== 'string') errors.push('grade 必须是字符串')
  else if (!['优秀', '良好', '合格', '待改进'].includes(data.grade)) {
    errors.push('grade 必须是：优秀、良好、合格、待改进 之一')
  }

  if (typeof data.scores !== 'object' || data.scores === null) {
    errors.push('scores 必须是对象')
    return errors
  }

  // 检查维度数量（至少 Q1-Q5）
  const qKeys = Object.keys(data.scores).filter(k => /^Q\d+$/.test(k))
  if (qKeys.length < 5) {
    errors.push(`至少需要 Q1-Q5 五个维度，当前只有 ${qKeys.length} 个：${qKeys.join(', ')}`)
    return errors
  }

  // 检查每个维度
  qKeys.forEach(key => {
    const dim = data.scores[key]
    if (!dim) return

    if (typeof dim.name !== 'string' || dim.name.length === 0) {
      errors.push(`${key}.name 必须是非空字符串`)
    }
    if (typeof dim.score !== 'number' || dim.score < 0) {
      errors.push(`${key}.score 必须是非负数`)
    }
    if (typeof dim.max !== 'number' || dim.max < 0) {
      errors.push(`${key}.max 必须是非负数`)
    }

    // 关键：details 数组必需
    if (!Array.isArray(dim.details)) {
      errors.push(`${key}.details 必须是数组（必需！）`)
      return
    }
    if (dim.details.length === 0) {
      errors.push(`${key}.details 不能为空数组`)
      return
    }

    // 检查每个 detail 子项
    dim.details.forEach((detail, idx) => {
      const prefix = `${key}.details[${idx}]`
      if (!detail.id || typeof detail.id !== 'string') {
        errors.push(`${prefix}.id 必须是非空字符串`)
      } else if (!/^Q\d+-\d+$/.test(detail.id)) {
        errors.push(`${prefix}.id 格式错误，应为 Q1-1 / Q2-3 等`)
      }
      if (!detail.name || typeof detail.name !== 'string') {
        errors.push(`${prefix}.name 必须是非空字符串`)
      }
      if (typeof detail.score !== 'number' || detail.score < 0) {
        errors.push(`${prefix}.score 必须是非负数`)
      }
      if (typeof detail.max !== 'number' || detail.max < 0) {
        errors.push(`${prefix}.max 必须是非负数`)
      }
      if (!detail.comment || typeof detail.comment !== 'string') {
        errors.push(`${prefix}.comment 必须是非空字符串`)
      } else if (detail.comment.length > 20) {
        errors.push(`${prefix}.comment 过长（${detail.comment.length} 字符，建议 ≤20）`)
      }
    })
  })

  // 新增：总分一致性校验
  if (typeof data.totalScore === 'number') {
    const actualSum = qKeys
      .map(key => data.scores[key])
      .filter(dim => typeof dim.score === 'number')
      .reduce((sum, dim) => sum + dim.score, 0)

    const tolerance = 0.1 // 允许浮点误差
    if (Math.abs(data.totalScore - actualSum) > tolerance) {
      errors.push(
        `totalScore (${data.totalScore}) 与各维度得分之和 (${actualSum}) 不一致，差值 ${Math.abs(data.totalScore - actualSum).toFixed(1)}`
      )
    }
  }

  return errors
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('')
      return
    }
    let data = ''
    process.stdin.setEncoding('utf-8')
    process.stdin.on('data', (chunk) => { data += chunk })
    process.stdin.on('end', () => resolve(data.trim()))
  })
}

async function main() {
  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.error('用法：node add-score.cjs <报告目录> <组件名> <JSON>')
    console.error('  或：node add-score.cjs <报告目录> <组件名> <<\'EOF\'')
    console.error('  或：node add-score.cjs <报告目录> --init')
    process.exit(1)
  }

  const reportDir = path.isAbsolute(args[0]) ? args[0] : path.resolve(process.cwd(), args[0])
  const scorePath = path.join(reportDir, 'quality-scores.json')

  if (args[1] === '--init') {
    // 确保目录存在
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true })
    }
    const initData = { scoredAt: new Date().toISOString(), components: {} }
    fs.writeFileSync(scorePath, JSON.stringify(initData, null, 2))
    console.log(`✅ 已初始化：${scorePath}`)
    return
  }

  const componentName = args[1]
  let scoreJson = args.slice(2).join(' ')

  // 如果命令行没有 JSON 参数，从 stdin 读取
  if (!scoreJson) {
    scoreJson = await readStdin()
  }

  if (!scoreJson) {
    console.error(`❌ 缺少评分 JSON 数据（通过参数或 stdin 传入）`)
    process.exit(1)
  }

  let scoreData
  try {
    scoreData = JSON.parse(scoreJson)
  } catch (e) {
    console.error(`❌ JSON 解析失败：${e.message}`)
    console.error(`   输入前100字符：${scoreJson.substring(0, 100)}`)
    process.exit(1)
  }

  // Schema 校验
  const validationErrors = validateScore(scoreData)
  if (validationErrors.length > 0) {
    console.error(`❌ 评分数据格式错误：`)
    validationErrors.forEach((err, i) => {
      console.error(`   ${i + 1}. ${err}`)
    })
    process.exit(1)
  }

  let data
  if (fs.existsSync(scorePath)) {
    data = JSON.parse(fs.readFileSync(scorePath, 'utf-8'))
  } else {
    data = { scoredAt: new Date().toISOString(), components: {} }
  }

  data.components[componentName] = scoreData
  fs.writeFileSync(scorePath, JSON.stringify(data, null, 2))

  const count = Object.keys(data.components).length
  console.log(`✅ [${count}] ${componentName} 评分已写入（${scoreData.totalScore}分 ${scoreData.grade}）`)
}

main()
