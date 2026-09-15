/**
 * 离线验证 isRenderableRevision 的 import 闭包判据（不调 LLM、不起服务）：
 * 直接对真机 revision 目录做与 service 同口径的判定，确认：
 *   · 悬空 import 的生成中间态（r-e0d991fb / r-bfd9af71 / r-7aca1cd8）→ 不可渲染（应回退 last-good）
 *   · 完整 last-good（r-71ee855d）→ 可渲染
 *
 * 依赖 dist 产物（先 npm run build）。
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  extractRelativeVueImports,
  resolveRelativeModulePath,
} from '../dist/tasks/task-code-snapshot.service.js'

const SNAP = join(
  process.cwd(),
  '..',
  'temp-components',
  '.task-code-snapshots',
  'mc-max-1789446564243-f64ecbed',
  'revisions',
)

function renderable(dir) {
  const manifestPath = join(dir, 'manifest.json')
  if (!existsSync(manifestPath)) return { ok: false, why: 'no manifest' }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  const known = new Set((manifest.files || []).map((f) => f.path))
  const entry = join(dir, 'package', 'index.vue')
  if (!existsSync(entry)) return { ok: false, why: 'no index.vue' }
  const content = readFileSync(entry, 'utf-8')
  if (!/<template[\s>]/.test(content)) return { ok: false, why: 'no <template>' }
  const visited = new Set()
  const queue = ['package/index.vue']
  while (queue.length) {
    const cur = queue.shift()
    if (visited.has(cur)) continue
    visited.add(cur)
    const abs = join(dir, ...cur.split('/'))
    if (!existsSync(abs)) return { ok: false, why: `unreadable ${cur}` }
    for (const spec of extractRelativeVueImports(readFileSync(abs, 'utf-8'))) {
      const target = resolveRelativeModulePath(cur, spec)
      if (!target) return { ok: false, why: `escape ${spec}` }
      if (!known.has(target)) return { ok: false, why: `悬空: ${target}` }
      if (!existsSync(join(dir, ...target.split('/')))) {
        return { ok: false, why: `索引有磁盘无: ${target}` }
      }
      queue.push(target)
    }
  }
  return { ok: true, why: `闭包完整(${visited.size} 文件)` }
}

const expectUnrenderable = [
  'r-e0d991fb-3e73-486c-903c-cea0f789e3f5',
  'r-bfd9af71-1883-42c7-895a-14cb989b7eed',
  'r-7aca1cd8-5ff8-4692-bae2-17d13a985ee2',
]
const expectRenderable = ['r-71ee855d-45cf-4e1a-a1b3-17dd9a9bd3d1']

let fail = 0
for (const r of readdirSync(SNAP).filter((d) => d.startsWith('r-'))) {
  const res = renderable(join(SNAP, r))
  const tag = expectUnrenderable.includes(r)
    ? '期望❌'
    : expectRenderable.includes(r)
      ? '期望✅'
      : ''
  if (tag) {
    console.log(`${tag} ${r.slice(0, 12)} → ${res.ok ? '✅可渲染' : '❌不可渲染'} (${res.why})`)
  }
  if (tag === '期望❌' && res.ok) fail += 1
  if (tag === '期望✅' && !res.ok) fail += 1
}
console.log(fail === 0 ? '\n✅ 全部断言通过' : `\n❌ ${fail} 条断言失败`)
process.exitCode = fail === 0 ? 0 : 1
