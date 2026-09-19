/**
 * 离线批量 v1 评分（仅管理员预览用，不调 LLM）
 *
 * 对两类组件执行 scoreComponentDir，把 specScore/styleScore merge 写入各组件
 * component-meta.json.quality。styleScore 无 Figma 节点树时为 null（不伪造）。
 *
 *   - custom-components/<componentId>/          （微码，一层）
 *   - vue3-components/<groupId>/<componentId>/ （Vue3，两层）
 *
 * ⚠️ 写盘契约（与管线写入方一致）：后端 resolveComponentDirStrict 优先读 backend-node/workspace，
 * 而同一组件在 frontend/workspace 也常有一份副本。所以评分结果必须同步写入
 * resolveWritableComponentDirs 返回的所有副本目录，否则后端读到的那份没有 quality。
 *
 * 备份目录（含 .binding-backup / .quality-backup / backup）自动跳过。
 *
 * 用法：
 *   node scripts/batch-quality-score.mjs                 # custom + vue3 回放并写盘
 *   node scripts/batch-quality-score.mjs --dry          # 只统计不写盘
 *   node scripts/batch-quality-score.mjs --only <id>    # 单组件
 *   node scripts/batch-quality-score.mjs --no-vue3      # 只回放 custom-components
 */
import { readdirSync, existsSync, statSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { join, resolve, basename } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const root = resolve(__dirname, '..')

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const onlyIdx = args.indexOf('--only')
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null
const noVue3 = args.includes('--no-vue3')

const { scoreComponentDir } = await import(
  join(root, 'dist', 'ai-engine', 'utils', 'quality-score-v1.js')
)
/** 备份目录名（如 mv-xxx.binding-backup-13216-... / .quality-backup-48487-...） */
const BACKUP_RE = /\.(binding-backup|quality-backup|backup)\b|-backup-\d+/i

/** 目录是否像真实组件产物（排除 group 层与备份目录） */
function isRealComponentDir(dir) {
  try {
    if (!statSync(dir).isDirectory()) return false
  } catch {
    return false
  }
  if (BACKUP_RE.test(basename(dir))) return false
  return (
    existsSync(join(dir, 'package', 'index.vue')) ||
    existsSync(join(dir, 'index.vue')) ||
    existsSync(join(dir, '.mc-gen', 'cache', 'figma-node-data.json')) ||
    existsSync(join(dir, 'component.json'))
  )
}

/** 顶层根（custom / vue3），返回 { root, isVue3 } */
function findRoots() {
  const roots = []
  for (const wsp of ['backend-node/workspace', 'frontend/workspace']) {
    const base = join(root, '..', wsp)
    roots.push({ root: join(base, 'custom-components'), isVue3: false })
    if (!noVue3) roots.push({ root: join(base, 'vue3-components'), isVue3: true })
  }
  return roots
}

/** 收集真实组件目录（处理一层 / 两层 / 嵌套），返回 [{ dir, isVue3 }] */
function collectComponentDirs() {
  const out = []
  for (const { root: base, isVue3 } of findRoots()) {
    if (!existsSync(base)) continue
    for (const top of readdirSync(base)) {
      const topDir = join(base, top)
      if (!statSync(topDir).isDirectory()) continue
      if (BACKUP_RE.test(top)) continue
      if (isRealComponentDir(topDir)) {
        out.push({ dir: topDir, isVue3 })
        continue
      }
      // 两层（vue3 group/<id>）或一层嵌套（mc 目录套 mc-max-<id>）
      for (const sub of readdirSync(topDir)) {
        const subDir = join(topDir, sub)
        if (isRealComponentDir(subDir)) out.push({ dir: subDir, isVue3 })
      }
    }
  }
  return out
}

const allDirs = collectComponentDirs()
// 同一组件在 backend-node/workspace 与 frontend/workspace 各有一份副本，且两边长期未同步、
// 内容不一致（backend 缺若干、frontend 也缺若干）。故按「组件名」去重，评分源优先 backend-node 侧；
// 写盘时把所有可写副本根（两个 workspace × custom/vue3）都尝试写入，保证后端读到的那份也有 quality。
const byName = new Map()
for (const item of allDirs) {
  const key = `${item.isVue3 ? 'vue3' : 'mc'}:${basename(item.dir)}`
  const isBackendCopy = item.dir.includes(join('backend-node', 'workspace'))
  if (!byName.has(key) || isBackendCopy) byName.set(key, item)
}
const dedup = [...byName.values()]
const targets = only ? dedup.filter((d) => basename(d.dir) === only) : dedup

let ok = 0
let styleNull = 0
const rows = []

// 两个 workspace 副本根（与 componentSearchRoots / resolveWritableComponentDirs 同源）
const replicaRoots = [
  join(root, '..', 'backend-node', 'workspace', 'custom-components'),
  join(root, '..', 'frontend', 'workspace', 'custom-components'),
  join(root, '..', 'backend-node', 'workspace', 'vue3-components'),
  join(root, '..', 'frontend', 'workspace', 'vue3-components'),
]

function writeQualityToReplicas(name, isVue3, q) {
  for (const replicaRoot of replicaRoots) {
    const candidates = []
    if (!isVue3) {
      candidates.push(join(replicaRoot, name))
    } else {
      try {
        for (const group of readdirSync(replicaRoot)) {
          const sd = join(replicaRoot, group, name)
          if (existsSync(sd)) candidates.push(sd)
        }
      } catch {
        /* 根不存在 */
      }
    }
    for (const wdir of candidates) {
      try {
        if (!existsSync(wdir)) mkdirSync(wdir, { recursive: true })
        const metaPath = join(wdir, 'component-meta.json')
        let prev = {}
        try {
          if (existsSync(metaPath)) prev = JSON.parse(readFileSync(metaPath, 'utf8'))
        } catch {
          prev = {}
        }
        const merged = {
          ...prev,
          quality: { ...(prev.quality || {}), ...q },
        }
        writeFileSync(metaPath, JSON.stringify(merged, null, 2), 'utf8')
      } catch {
        /* 单个副本写失败不影响其它副本 */
      }
    }
  }
}

for (const { dir, isVue3 } of targets) {
  const name = basename(dir)
  const scope = isVue3 ? 'vue3' : 'mc'
  try {
    const r = await scoreComponentDir(dir, { componentId: name, persist: false })
    const q = r.quality || {}
    if (q.styleScore == null) styleNull += 1

    if (!dry) writeQualityToReplicas(name, isVue3, q)

    rows.push({
      scope,
      name,
      spec: q.specScore ?? '-',
      style: q.styleScore ?? '-',
      files: q.fileCount ?? '-',
    })
    ok += 1
  } catch (e) {
    rows.push({ scope, name, spec: 'ERR', style: String(e?.message || e).slice(0, 60), files: '-' })
  }
}

console.log(
  `组件数: ${rows.length} | style=null: ${styleNull}${dry ? ' | DRY' : ' | persisted(含副本)'}`,
)
console.log('scope'.padEnd(6), 'component'.padEnd(46), 'spec', 'style', 'files')
for (const r of rows) {
  console.log(
    String(r.scope).padEnd(6),
    String(r.name).padEnd(46),
    String(r.spec).padEnd(5),
    String(r.style).padEnd(5),
    String(r.files),
  )
}
console.log('done:', ok, '/', rows.length)
