#!/usr/bin/env node
/**
 * R3-B 版本护栏判据回归（mvgo 根仓）。
 *
 * 背景：`start-node.js` 的 R3-B 护栏原本只比 `dist/main.js` 的 mtime，
 * 而 `nest build` 是增量编译、常常不动 `main.js` ⇒ **每次启动都误报 STALE**（狼来了）。
 * 2026-09-30 改为读「构建时间证据」（`dist/.build-stamp` > `tsconfig.build.tsbuildinfo` > `dist/main.js`）。
 *
 * 本脚本**逐字提取** `start-node.js` 里的真实代码来跑（不是另写一份副本），
 * 保证「测的」就是「跑的」。合成的临时目录树用于精确控制 mtime。
 *
 * 跑法：`node scripts/check-r3b-guard.mjs`（或根 package.json 的 `npm run check:r3b`）
 *
 * ⚠️ 改 `start-node.js` 的 R3-B 段落时，若改了变量名，本脚本的锚点会失配并**显式报错**
 *    （不会静默跳过），届时同步更新锚点即可。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'start-node.js')

const lines = fs.readFileSync(SRC, 'utf8').split('\n')

// ---- 逐字提取 latestSrcMtime ----
const fnStart = lines.findIndex((l) => l.startsWith('function latestSrcMtime('))
if (fnStart < 0) throw new Error('锚点失配：未找到 latestSrcMtime')
let fnEnd = -1
for (let i = fnStart + 1; i < lines.length; i++) {
  if (lines[i] === '}') { fnEnd = i; break }
}
if (fnEnd < 0) throw new Error('锚点失配：未找到 latestSrcMtime 结尾')
const fnText = lines.slice(fnStart, fnEnd + 1).join('\n')

// ---- 逐字提取护栏块 const DIST_MAIN ... console.log(R3B_STATUS); ----
const blkStart = lines.findIndex((l) => l.startsWith('const DIST_MAIN'))
if (blkStart < 0) throw new Error('锚点失配：未找到护栏块起点')
let blkEnd = -1
for (let i = blkStart + 1; i < lines.length; i++) {
  if (lines[i].startsWith('console.log(R3B_STATUS)')) { blkEnd = i; break }
}
if (blkEnd < 0) throw new Error('锚点失配：未找到护栏块终点（期望 `console.log(R3B_STATUS)` 行）')
const blkText = lines.slice(blkStart, blkEnd + 1).join('\n')

if (!/^const DIST_MAIN = path\.join/.test(blkText)) throw new Error('锚点失配：护栏块头不对')
if (!/_distBasis/.test(blkText)) {
  throw new Error('护栏块不含新判据 _distBasis —— 判据可能被回退成「只看 dist/main.js」')
}
if (!/R3B_REPORT/.test(blkText)) {
  throw new Error('护栏块不含落盘变量 R3B_REPORT —— 判定可能不再写入 server.log')
}
console.log(`[提取] latestSrcMtime = 第 ${fnStart + 1}~${fnEnd + 1} 行`)
console.log(`[提取] 护栏块       = 第 ${blkStart + 1}~${blkEnd + 1} 行 ✅ 含新判据\n`)

const runGuard = new Function(
  'fs', 'path', 'BE_DIR', 'gitHeadShort', 'console',
  `${fnText}\n${blkText}\nreturn { STALE, _distTime, _distBasis, R3B_STATUS, R3B_REPORT };`,
)

const NOW = Date.now()
const SEC = 1000

function mkTree({ srcAge, mainAge, stampAge, tsbiAge }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r3b-'))
  const be = path.join(root, 'BE')
  fs.mkdirSync(path.join(be, 'src', 'sub'), { recursive: true })
  fs.mkdirSync(path.join(be, 'dist'), { recursive: true })
  const put = (p, age) => {
    fs.writeFileSync(p, 'x')
    const t = (NOW - age) / 1000
    fs.utimesSync(p, t, t)
  }
  put(path.join(be, 'src', 'sub', 'a.ts'), srcAge)
  put(path.join(be, 'dist', 'main.js'), mainAge)
  if (stampAge != null) put(path.join(be, 'dist', '.build-stamp'), stampAge)
  if (tsbiAge != null) put(path.join(be, 'tsconfig.build.tsbuildinfo'), tsbiAge)
  return be
}

const cases = [
  { name: 'A 有构建戳 & 戳最新        ', args: { srcAge: 10 * SEC, mainAge: 3600 * SEC, stampAge: 1 * SEC, tsbiAge: null }, expStale: false, expBasis: 'dist/.build-stamp' },
  { name: 'B 有构建戳 & src 更新（阳性对照）', args: { srcAge: 1 * SEC, mainAge: 3600 * SEC, stampAge: 10 * SEC, tsbiAge: null }, expStale: true, expBasis: 'dist/.build-stamp' },
  { name: 'C 无戳无 tsbi & main.js 最新', args: { srcAge: 10 * SEC, mainAge: 1 * SEC, stampAge: null, tsbiAge: null }, expStale: false, expBasis: 'dist/main.js' },
  { name: 'D 无戳无 tsbi & src 更新（历史语义）', args: { srcAge: 1 * SEC, mainAge: 3600 * SEC, stampAge: null, tsbiAge: null }, expStale: true, expBasis: 'dist/main.js' },
  { name: 'E 无戳 & tsbuildinfo 最新（直接 nest build）', args: { srcAge: 10 * SEC, mainAge: 3600 * SEC, stampAge: null, tsbiAge: 1 * SEC }, expStale: false, expBasis: 'tsconfig.build.tsbuildinfo' },
]

let pass = 0
let fail = 0
for (const c of cases) {
  const be = mkTree(c.args)
  const silence = { warn() {}, log() {} }
  let r
  try {
    r = runGuard(fs, path, be, () => 'testhash', silence)
  } catch (e) {
    console.log(`  ❌ ${c.name} → 抛异常: ${e.message}`)
    fail++
    fs.rmSync(be, { recursive: true, force: true })
    continue
  }
  // 落盘载荷校验：STALE 时须含 ⚠️，健康时须含 ✅（这是写进 server.log 的内容）
  const reportOk = c.expStale
    ? /⚠️ STALE/.test(r.R3B_REPORT)
    : /✅ 与源码一致/.test(r.R3B_REPORT)
  const ok = r.STALE === c.expStale && r._distBasis === c.expBasis && reportOk
  if (ok) {
    console.log(`  ✅ ${c.name} → STALE=${r.STALE} basis=${r._distBasis}`)
    pass++
  } else {
    console.log(
      `  ❌ ${c.name} → STALE=${r.STALE}(期望 ${c.expStale}) basis=${r._distBasis}(期望 ${c.expBasis}) 落盘留痕=${reportOk ? 'ok' : '缺失'}`,
    )
    fail++
  }
  fs.rmSync(be, { recursive: true, force: true })
}

console.log(`\n断言结果: ${pass} 通过 / ${fail} 失败`)

// ---- `--real`：直接对真实仓库跑一遍护栏，看启动时会打印什么（不改动任何东西）----
if (process.argv.includes('--real')) {
  const BE_REAL = path.join(ROOT, 'backend-node')
  const captured = []
  const cap = {
    warn: (...a) => captured.push(['WARN', a.join(' ')]),
    log: (...a) => captured.push(['LOG', a.join(' ')]),
  }
  const r = runGuard(fs, path, BE_REAL, (cwd) => {
    try {
      return require('node:child_process').execSync('git rev-parse --short HEAD', { cwd, encoding: 'utf8' }).trim()
    } catch { return 'unknown' }
  }, cap)
  console.log('\n---- 真实环境 dry-run（backend-node）----')
  for (const [lvl, msg] of captured) console.log(`  [${lvl}] ${msg}`)
  console.log(`  → STALE=${r.STALE}  基准=${r._distBasis}`)
  console.log('  → 将落盘进 server.log 的内容：')
  for (const l of r.R3B_REPORT.split('\n')) console.log(`      ${l}`)
}

process.exit(fail === 0 ? 0 : 1)
