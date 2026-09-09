/**
 * 组件路径解析器 — 公共工具
 *
 * 从 component.service.ts 的 resolveComponentBaseDirs 提取为独立 ESM 模块，
 * 供 playground-tools.js / snapshot-manager.js 等 ai-engine 纯 JS 模块共用。
 *
 * 正式 workspace 始终优先于 temp-components，避免 Playground 修改落到管线中间产物。
 */

import { readdir, stat } from 'fs/promises'
import { join, resolve, sep } from 'path'
import { createLogger } from '../logger/index.js'
import {
  customComponentsDir,
  vue3ComponentsDir,
  frontendCustomComponentsDir,
  frontendVue3ComponentsDir,
  tempComponentsDir,
} from '../../config/backend-root.js'

const logger = createLogger('component-resolver')

function isTempComponentDir(dir) {
  const normalized = resolve(dir)
  return normalized.includes(sep + 'temp-components' + sep)
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
  const dirs = await resolveComponentBaseDirs(componentId)
  const writableDirs = []
  for (const dir of dirs) {
    if (isTempComponentDir(dir)) continue
    try {
      const componentStat = await stat(dir)
      if (componentStat.isDirectory()) writableDirs.push(dir)
    } catch {}
  }
  return writableDirs
}

export default {
  resolveComponentBaseDirs,
  resolveComponentDir,
  resolveWritableComponentDirs,
}
