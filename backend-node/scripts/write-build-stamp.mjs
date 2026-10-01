#!/usr/bin/env node
/**
 * 在构建成功结尾写入 `dist/.build-stamp`。
 *
 * 为什么需要它：
 *   `nest build` 是**增量编译**，只会重写「本次真正变更的文件」——
 *   `dist/main.js` 往往原封不动，mtime 停留在很久以前。
 *   而 `start-node.js` 的 R3-B 版本护栏原本只比 `dist/main.js` 的 mtime，
 *   于是每次启动都误报「dist 落后于源码」= 狼来了，真的落后时反而没人信。
 *
 * 本文件由 `npm run build` 在 `nest build` 之后、复制 references 之前调用，
 * 把「本次构建确实成功」这件事落成一个显式的时间戳证据。
 * 护栏优先读它（详见 start-node.js 的 R3-B 段）。
 *
 * 注意：只在构建**成功后**才会执行到这里（`nest build` 非 0 退出时 `&&` 短路），
 *      所以「戳存在且新」= 「上一次 build 成功」是可信的。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const beDir = path.resolve(__dirname, '..')
const distDir = path.join(beDir, 'dist')
const stampFile = path.join(distDir, '.build-stamp')

if (!fs.existsSync(distDir)) {
  console.warn('[build-stamp] ⚠️ dist 不存在，跳过写入（构建可能未产出）')
  process.exit(0)
}

let git = 'unknown'
try {
  git = (await import('node:child_process')).execSync('git rev-parse --short HEAD', {
    cwd: beDir,
    encoding: 'utf8',
  }).trim()
} catch {
  /* 非 git 环境不致命 */
}

const payload = {
  at: new Date().toISOString(),
  epochMs: Date.now(),
  git,
  node: process.version,
}

fs.writeFileSync(stampFile, JSON.stringify(payload, null, 2) + '\n', 'utf8')
console.log(`[build-stamp] ✅ 已写入 dist/.build-stamp（${payload.at} git=${git}）`)
