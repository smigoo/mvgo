#!/usr/bin/env node
// TTR + Loop —— 会议纪要开发的自动实施状态机
// TTR = Task → Test → Review：每个任务必须三态走完、全部 gate 通过才允许推进
// 用法：node .dev-loop/ttr-loop.mjs [status|gate|next|check <name>|fail <name>|advance|reset|help]

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const statePath = resolve(root, 'src/views/meeting/loop-state.json')
const dataPath = resolve(root, 'src/views/meeting/dev-data.js')

const readState = () => JSON.parse(readFileSync(statePath, 'utf8'))
const writeState = (state) => {
  state.updatedAt = new Date().toISOString()
  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n')
}
const taskIds = () =>
  [...readFileSync(dataPath, 'utf8').matchAll(/id: '(T-\d{3})'/g)].map((m) => m[1])

const CHECK_NAMES = Object.keys(readState().checks)
const pending = (state) => CHECK_NAMES.filter((k) => !state.checks[k])
const doneCount = (state) => CHECK_NAMES.length - pending(state).length

function statusLine(state) {
  const flags = CHECK_NAMES.map((k) => `${state.checks[k] ? 'v' : 'x'}${k}`).join(' ')
  const need = pending(state).length ? `NEED: ${pending(state).join(', ')}` : 'NEED: -'
  const guard =
    state.iteration >= state.maxIterations
      ? ' | HUMAN_CHECKPOINT (达到最大迭代)'
      : ''
  return `TTR-LOOP | Task: ${state.currentTask} | Phase: ${state.phase} | Iter: ${state.iteration} | ${doneCount(state)}/${CHECK_NAMES.length} [${flags}] | ${need}${guard}`
}

function print(state, extra) {
  if (extra) console.log(extra)
  console.log(statusLine(state))
}

const [, , cmd = 'status', arg, extra] = process.argv
let state = readState()

switch (cmd) {
  case 'status':
    print(state)
    break

  case 'gate':
    console.log(`gate for ${state.currentTask}: ${doneCount(state)}/${CHECK_NAMES.length}`)
    CHECK_NAMES.forEach((k) => console.log(`  [${state.checks[k] ? 'x' : ' '}] ${k}`))
    print(state)
    break

  case 'next': {
    const ids = taskIds()
    const idx = ids.indexOf(state.currentTask)
    const next = ids[idx + 1] ?? '(任务清单结束)'
    console.log(`current: ${state.currentTask}  →  next: ${next}`)
    console.log(`phase order: TASK → TEST → REVIEW → (advance)`)
    print(state)
    break
  }

  case 'check': {
    if (!arg || !CHECK_NAMES.includes(arg)) {
      console.error(`check 需要合法的 gate 名：${CHECK_NAMES.join(', ')}`)
      process.exit(2)
    }
    state.checks[arg] = true
    state.phase = pending(state).length ? 'TEST' : 'REVIEW'
    writeState(state)
    print(state, `gate '${arg}' 已通过`)
    break
  }

  case 'fail': {
    if (!arg || !CHECK_NAMES.includes(arg)) {
      console.error(`fail 需要合法的 gate 名：${CHECK_NAMES.join(', ')}`)
      process.exit(2)
    }
    state.checks[arg] = false
    state.iteration += 1
    state.phase = 'TEST'
    writeState(state)
    print(state, `gate '${arg}' 未通过，进入下一轮迭代`)
    if (state.iteration >= state.maxIterations) {
      console.log('STOP: 已达最大迭代，转人工检查点，不自动推进')
    }
    break
  }

  case 'advance': {
    // 治本守卫：外部依赖 Blocker 未解除时，即便 5 个 gate 全通过也禁止推进。
    // 避免「前端验证通过」被误当成「任务闭环」而虚报完成。
    const unresolved = (state.blocked || []).filter(
      (b) => b.task === state.currentTask && !b.resolved
    )
    if (unresolved.length) {
      print(
        state,
        `BLOCKED: 当前任务存在未解除的外部依赖 Blocker（${unresolved
          .map((b) => b.type)
          .join(', ')}），即使 gate 全通过也不得推进；需先补齐 unblockNeeds 并用 unblock 显式清除`
      )
      process.exit(1)
    }
    if (pending(state).length) {
      print(state, `BLOCKED: 还有未通过的 gate，禁止推进`)
      process.exit(1)
    }
    if (state.iteration >= state.maxIterations) {
      print(state, 'BLOCKED: 已达最大迭代，转人工检查点')
      process.exit(1)
    }
    const ids = taskIds()
    const idx = ids.indexOf(state.currentTask)
    if (idx === -1) {
      console.error(`当前任务 ${state.currentTask} 不在任务清单中`)
      process.exit(2)
    }
    const finished = state.currentTask
    state.completedTasks.push(finished)
    const next = ids[idx + 1]
    if (!next) {
      console.log('ALL TASKS DONE — 转人工检查点')
      writeState(state)
      break
    }
    state.currentTask = next
    state.phase = 'TASK'
    state.iteration = 1
    CHECK_NAMES.forEach((k) => (state.checks[k] = false))
    writeState(state)
    print(state, `ADVANCED: ${finished} 已完成 → 当前任务 ${next}`)
    break
  }

  case 'jump': {
    // WBS 在已有工程内重映射：跳到当前工程真正可实施的任务。
    // 关键：原任务不进入 completedTasks，只记入 remapLog，避免虚报完成。
    const ids = taskIds()
    if (!arg || !ids.includes(arg)) {
      console.error(`jump 需要清单内的任务 id（如 T-020），当前 ${state.currentTask}`)
      process.exit(2)
    }
    if (!Array.isArray(state.remapLog)) state.remapLog = []
    const from = state.currentTask
    state.remapLog.push({
      from,
      to: arg,
      reason: extra || 'WBS 在已有 mvgo/frontend 工程内重映射，原任务不在本工程实施',
      at: new Date().toISOString()
    })
    state.currentTask = arg
    state.phase = 'TASK'
    state.iteration = 1
    CHECK_NAMES.forEach((k) => (state.checks[k] = false))
    writeState(state)
    print(state, `JUMP: ${from} → ${arg}（原任务未标记完成，已记入 remapLog）`)
    break
  }

  case 'unblock': {
    // 显式解除 Blocker：只在人工确认云密钥 / 后端接口 / 法务协议全部就绪后调用
    const task = arg || state.currentTask
    const before = (state.blocked || []).length
    state.blocked = (state.blocked || []).filter((b) => b.task !== task)
    if (!Array.isArray(state.unblockLog)) state.unblockLog = []
    state.unblockLog.push({
      task,
      reason: extra || '外部依赖已就绪（人工确认）',
      removed: before - state.blocked.length,
      at: new Date().toISOString()
    })
    writeState(state)
    print(state, `UNBLOCK: ${task} 已显式清除 ${before - state.blocked.length} 项 Blocker`)
    break
  }

  case 'reset': {
    CHECK_NAMES.forEach((k) => (state.checks[k] = false))
    state.phase = 'TASK'
    state.iteration = 1
    writeState(state)
    print(state, 'checks 已重置')
    break
  }

  case 'help':
  default:
    console.log(`TTR = Task → Test → Review，loop 按 gate 结果自动推进，失败则重试。
命令：
  status             当前状态行（默认）
  gate               列出各 gate 通过情况
  next               下一个任务与阶段顺序
  check <gate>       标记某项验证通过（全通过 → Phase: REVIEW）
  fail <gate>        标记某项失败，迭代 +1
  advance            全 gate 通过后把当前任务归档并推进到下一任务
  unblock [task] [原因] 显式解除当前任务的外部依赖 Blocker（需人工确认依赖已就绪）
  jump <task> [原因]  WBS 重映射：跳到指定任务，原任务不标记完成，记入 remapLog
  reset              重置当前任务的 checks
gate 项：${CHECK_NAMES.join(', ')}
安全阀：iteration >= maxIterations(${state.maxIterations}) 时强制人工检查点。
安全阀：blocked 中存在当前任务的未解除 Blocker 时，advance 一律拒绝（gate 全通过也不例外）。
状态文件：src/views/meeting/loop-state.json（页面直接读取，单一事实源）
任务顺序：src/views/meeting/dev-data.js 的 tasks id（勿改 id 格式）`)
    break
}
