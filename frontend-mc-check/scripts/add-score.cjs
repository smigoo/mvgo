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
