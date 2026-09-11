/**
 * 组件路径解析器 — 公共工具
 *
 * 从 component.service.ts 的 resolveComponentBaseDirs 提取为独立 ESM 模块，
 * 供 playground-tools.js / snapshot-manager.js 等 ai-engine 纯 JS 模块共用。
 *
 * 正式 workspace 始终优先于 temp-components，避免 Playground 修改落到管线中间产物。
 */

import { readdir, stat } from 'fs/promises'
import fs from 'fs'
import { join, resolve, sep, basename } from 'path'
import { createLogger } from '../logger/index.js'
import {
  customComponentsDir,
  vue3ComponentsDir,
  frontendCustomComponentsDir,
  frontendVue3ComponentsDir,
  tempComponentsDir,
} from '../../config/backend-root.js'
import { isEncodedSessionId } from './component-naming.js'

const logger = createLogger('component-resolver')

function isTempComponentDir(dir) {
  const normalized = resolve(dir)
  return normalized.includes(sep + 'temp-components' + sep)
}

/**
 * 编码型（任务号派生）组件名 —— 单一事实源复用 component-naming.js#isEncodedSessionId。
 * 判定 `mc-lite-1789035969084-c298235f` / `mc-max-…` / `mv-lite-…` / `mv-…` 为「任务号名」。
 */
export function isEncodedComponentName(name) {
  return isEncodedSessionId(name)
}

/** 规范组件名：c-<语义段>[-<尾 8hex>] */
const CANONICAL_NAME_RE = /^c-[a-z]/

/**
 * 「伪规范名」指纹 —— 13 位毫秒时间戳只会出现在任务号里。
 * 规范名形态是 `c-<语义段>-<尾 8hex>`，**绝不会**含 13 位时间戳；
 * 而历史产物存在 `c-mc-lite-1788491849328-99e8660b` 这类「c- 前缀裹着任务号」的目录，
 * 它会被 CANONICAL_NAME_RE 误判为规范名（rank 0）从而在同尾缀多命中时胜出。故先按此指纹降级。
 */
const EMBEDDED_TASK_ID_RE = /\d{13}/

/**
 * 目录名「规范度」排序权重：0 = 规范 c- 名（最优），2 = 任务号名（垫底），1 = 其他。
 * 用于 S2 让规范目录在同尾缀多命中时胜出。
 */
export function namingRank(name) {
  const n = String(name ?? '')
  // 伪规范名（c- 前缀裹任务号）必须先降级，否则会盖过真规范名
  if (EMBEDDED_TASK_ID_RE.test(n)) return 2
  if (CANONICAL_NAME_RE.test(n)) return 0
  if (isEncodedComponentName(n)) return 2
  return 1
}

/** 按规范度稳定排序：同权重保持传入顺序（= roots 顺序），保证解析结果确定 */
export function rankDirsByNaming(dirs) {
  return dirs
    .map((dir, index) => ({ dir, index, rank: namingRank(basename(dir)) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((x) => x.dir)
}

/**
 * 读取目录 declare.json 的 componentId —— 组件规范 ID 的**事实源**。
 * 已被污染成任务号（4a 场景）时视为不可信，返回 null（由调用方回退目录名）。
 */
export function readDeclaredComponentId(dir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(join(dir, 'declare.json'), 'utf8'))
    const id = typeof parsed.componentId === 'string' ? parsed.componentId.trim() : ''
    if (!id) return null
    return isEncodedComponentName(id) ? null : id
  } catch {
    return null
  }
}

async function appendExistingComponentDirs(dirs, baseDir, componentId) {
  try {
    const groups = await readdir(baseDir, { withFileTypes: true })
    for (const group of groups) {
      if (!group.isDirectory()) continue
      const componentDir = join(baseDir, group.name, componentId)
      try {
        const componentStat = await stat(componentDir)
        if (componentStat.isDirectory()) dirs.push(componentDir)
      } catch {}
    }
  } catch {}
}

/**
 * 暴露组件搜索根目录，供需要自行遍历候选目录的上层（如 mc-spec 规范检查）使用
 * @returns {string[]}
 */
export function componentSearchRoots() {
  return [
    customComponentsDir,
    vue3ComponentsDir,
    frontendCustomComponentsDir(),
    frontendVue3ComponentsDir(),
  ]
}

/**
 * 解析组件所有可能的基础目录
 * @param {string} componentId - 组件 ID (sessionId)
 * @returns {Promise<string[]>} 按优先级排列的存在的目录列表
 */
export async function resolveComponentBaseDirs(componentId) {
  const dirs = []

  // 正式 workspace 优先：微码和 Vue3 目录都可能同时存在，后续按路径去重。
  dirs.push(join(customComponentsDir, componentId))
  await appendExistingComponentDirs(dirs, vue3ComponentsDir, componentId)

  dirs.push(join(frontendCustomComponentsDir(), componentId))
  await appendExistingComponentDirs(dirs, frontendVue3ComponentsDir(), componentId)

  // 临时组件仅作为读取兜底，不作为 Playground 的正式写入目标。
  await appendExistingComponentDirs(dirs, tempComponentsDir, componentId)

  return Array.from(new Set(dirs))
}

/**
 * 严格解析组件目录（2026-09-10）
 *
 * 背景：任务的 componentId 常直接存任务号（mc-lite-...-c298235f），
 * 而 workspace 真实目录名是 c-environment-monitor-c298235f（共享尾缀）。
 * 旧 resolveComponentDir 会退回到 temp 快照根目录（空壳，只有 last-good.json +
 * revisions/），导致：
 *   - 规范检查跑在空目录上 → 报出「未使用 <base-panel> 包裹」这类误导性失败；
 *   - AI 修复写文件到快照目录，而检查读的是 workspace 目录 → 修完重查仍失败。
 *
 * 解析顺序（与 mc-spec.service / playground-tools 共用，避免两套解析漂移）：
 *   1. 尾缀匹配正式 workspace（一层 root/<id> 与两层 root/<group>/<id> 都扫）
 *   2. 常规候选目录，命中 temp 快照根时下钻到最新 revision
 *   3. 都没有含产物的目录时，回退旧 resolveComponentDir（保持历史行为）
 *
 * @param {string} componentId
 * @returns {Promise<string|null>}
 */
export async function resolveComponentDirStrict(componentId) {
  const hasArtifact = (dir) => {
    try {
      return (
        fs.existsSync(join(dir, 'package', 'index.vue')) ||
        fs.existsSync(join(dir, 'declare.json'))
      )
    } catch {
      return false
    }
  }

  const drillSnapshotDir = (dir) => {
    if (!dir.includes(`${sep}.task-code-snapshots${sep}`)) return dir
    const revDir = join(dir, 'revisions')
    if (!fs.existsSync(revDir)) return dir
    try {
      const revs = fs
        .readdirSync(revDir)
        .map((n) => ({ n, p: join(revDir, n) }))
        .filter((x) => fs.statSync(x.p).isDirectory())
        .sort((a, b) => fs.statSync(b.p).mtimeMs - fs.statSync(a.p).mtimeMs)
      return revs.length ? revs[0].p : dir
    } catch {
      return dir
    }
  }

  // 1) 尾缀匹配：mc-lite-1789035969084-c298235f → c-environment-monitor-c298235f
  const tailMatch = String(componentId).match(/-([a-z0-9]{6,12})$/i)
  if (tailMatch) {
    const tail = tailMatch[1].toLowerCase()
    const hits = []
    for (const root of componentSearchRoots()) {
      try {
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue
          const d = join(root, entry.name)
          // 一层结构：root/<componentId>（customComponentsDir / frontendCustom）
          if (entry.name.toLowerCase().endsWith(tail) && hasArtifact(d)) hits.push(d)
          // 两层结构：root/<group>/<componentId>（vue3 目录）
          for (const sub of fs.readdirSync(d)) {
            if (!String(sub).toLowerCase().endsWith(tail)) continue
            const sd = join(d, sub)
            if (fs.statSync(sd).isDirectory() && hasArtifact(sd)) hits.push(sd)
          }
        }
      } catch {
        /* 根目录不存在时跳过 */
      }
    }
    // 多个副本命中时的选择规则（2026-09-10 修订，S2）：
    // 旧行为 = 严格按 roots 顺序取 hits[0]。但搜索根第 1 位 projectRoot/workspace 常残留
    // 「任务号命名目录」（mc-lite-…-c298235f），导致：
    //   - 用任务号查 → 命中残留目录（预期内）；
    //   - 用**规范 ID** 查 → 尾缀匹配忽略传入名、只看尾 8hex，**同样命中残留目录**（意外，最严重）。
    // 现改为：规范名（c-*）优先，任务号名垫底，同类保持 roots 顺序（稳定）。
    if (hits.length) {
      const ranked = rankDirsByNaming(hits)
      if (ranked.length > 1) {
        logger.warn('组件目录尾缀多命中，规范名优先', {
          componentId,
          tail: tailMatch[1],
          picked: ranked[0],
          candidates: ranked,
        })
      }
      return ranked[0]
    }
  }

  // 2) 常规候选（含快照下钻），取第一个真有产物的
  const bases = await resolveComponentBaseDirs(componentId)
  for (const base of bases) {
    const drilled = drillSnapshotDir(base)
    if (hasArtifact(drilled)) return drilled
  }

  // 3) 回退：保持历史行为（新组件初始化等「目录存在但尚无产物」场景）
  return await resolveComponentDir(componentId)
}

/**
 * 解析组件实际存在的第一个基础目录
 * @param {string} componentId
 * @returns {Promise<string|null>} 第一个存在的目录路径，都不存在则 null
 */
export async function resolveComponentDir(componentId) {
  const dirs = await resolveComponentBaseDirs(componentId)
  for (const dir of dirs) {
    try {
      await stat(dir)
      return dir
    } catch {
      // 继续尝试
    }
  }
  logger.warn('未找到组件目录', { componentId, checkedDirs: dirs.length })
  return null
}

export async function resolveWritableComponentDirs(componentId) {
  // ⚠️ 必须返回**所有**正式 workspace 副本（backend-node/workspace 与 frontend/workspace 各有一份），
  // 写入方会同步写入全部副本，从而保证「预览读 A 副本」与「AI 修复写 B 副本」不会分叉。
  // 曾改成只返回严格解析的单个目录 → 副本不再同步 → 预览读到旧代码（回归）。
  //
  // 同时支持任务号 → 真实组件目录名（mc-lite-...-c298235f → c-environment-monitor-c298235f），
  // 否则任务号匹配不到任何正式目录，AI 修复会被拒（"已拒绝修改临时管线产物"）。
  const strict = await resolveComponentDirStrict(componentId)
  // ⚠️ S1（2026-09-10）：realName 必须优先取 declare.json 的 componentId（规范 ID 的事实源），
  // 而不是 basename(strict)。旧实现用 basename(strict)，一旦 strict 落在任务号目录上
  // （见 S2 的根因），realName === componentId → candidateIds 退化成 [任务号]
  // → 规范目录被排除出可写集合 → AI 修复只写残留目录、并把 declare 写回任务号。
  const declared = strict ? readDeclaredComponentId(strict) : null
  const realName = declared || (strict ? basename(strict) : null)
  const candidateIds = Array.from(
    new Set([realName, componentId].filter((id) => typeof id === 'string' && id)),
  )

  // 候选 ID 外层、搜索根内层：保证「规范名副本」整体排在「任务号副本」之前
  // （写入方用 writableDirs[0] 兜底当主目录，故顺序即主目录优先级）。
  const writableDirs = []
  for (const id of candidateIds) {
    for (const root of componentSearchRoots()) {
      const dir = join(root, id)
      if (isTempComponentDir(dir)) continue
      try {
        if (fs.statSync(dir).isDirectory() && !writableDirs.includes(dir)) writableDirs.push(dir)
      } catch {
        /* 副本不存在 */
      }
    }
  }
  return writableDirs
}

export default {
  resolveComponentBaseDirs,
  resolveComponentDir,
  resolveComponentDirStrict,
  componentSearchRoots,
  resolveWritableComponentDirs,
  isEncodedComponentName,
  readDeclaredComponentId,
}
