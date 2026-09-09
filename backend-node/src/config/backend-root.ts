/**
 * 后端根路径解析工具
 *
 * 解决 `process.cwd()` 在不同启动目录下解析不一致的问题。
 * 所有涉及 workspace / temp-components / data 等目录的模块，统一从这里获取路径。
 *
 * 原理：
 *   - 基于 `__dirname` 计算 backendRoot（backend-node/ 目录），不依赖 cwd
 *   - backendRoot = 本文件所在目录（src/config/ 或 dist/config/）向上两级
 *   - projectRoot = backendRoot 的父目录（部署根目录，如 /home/mvbt/mvgo）
 *
 * 路径对照（ECS 生产部署）：
 *   - backendRoot:     /home/mvbt/mvgo/backend-node
 *   - projectRoot:    /home/mvbt/mvgo
 *   - workspace:      /home/mvbt/mvgo/workspace（与 backend-node 同级，在 projectRoot 下）
 *   - tempComponents: /home/mvbt/mvgo/temp-components
 *   - frontendWorkspace: /home/mvbt/mvgo/frontend/workspace
 */

import { dirname, isAbsolute, join, resolve } from 'path'

// backendRoot = backend-node/
// 本文件在源码态位于 backend-node/src/config/，编译后位于 backend-node/dist/config/，
// 两种形态都恰好在 backend-node 下第 2 层，因此统一向上回溯两级。
// 注意：不能写成 dirname(__dirname)，那样会解析到 src/ 或 dist/，导致
// dataDir/logsDir 偏一级（dist/data 不存在 → 读不到 ai-config.json）。
export const backendRoot = dirname(dirname(__dirname))

// projectRoot = backend-node/ 的父目录 = 部署根（如 /home/mvbt/mvgo）
export const projectRoot = dirname(backendRoot)

// ========== workspace 路径 ==========

/** workspace 在 projectRoot 下（与 backend-node 同级，如 /home/mvbt/mvgo/workspace） */
export const workspaceRoot = join(projectRoot, 'workspace')
export const customComponentsDir = join(workspaceRoot, 'custom-components')
export const vue3ComponentsDir = join(workspaceRoot, 'vue3-components')

/** 前端 workspace（FRONTEND_WORKSPACE 环境变量优先，否则 ../frontend/workspace） */
export function resolveFrontendWorkspacePath(): string {
  const configured = process.env.FRONTEND_WORKSPACE?.trim()
  if (configured) {
    return isAbsolute(configured) ? configured : resolve(backendRoot, configured)
  }
  // 开发/生产默认：projectRoot/frontend/workspace
  return join(projectRoot, 'frontend', 'workspace')
}

/** 前端 workspace 下的 custom-components */
export const frontendCustomComponentsDir = () =>
  join(resolveFrontendWorkspacePath(), 'custom-components')

/** 前端 workspace 下的 vue3-components */
export const frontendVue3ComponentsDir = () =>
  join(resolveFrontendWorkspacePath(), 'vue3-components')

// ========== temp-components 路径 ==========

/** temp-components 在部署根目录下（projectRoot/temp-components） */
export const tempComponentsDir = join(projectRoot, 'temp-components')

// ========== data 目录 ==========
export const dataDir = join(backendRoot, 'data')
export const logsDir = join(backendRoot, 'logs')
export const configDir = join(backendRoot, 'config')

// ========== 其他 ==========
export const chatAttachmentsDir = join(backendRoot, 'temp-chat-attachments')
export const apifoxZipsDir = join(dataDir, 'apifox-zips')
export const apiCatalogsDir = join(dataDir, 'api-catalogs')
