/**
 * 后端根路径解析工具（JavaScript 版本）
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
 *   - workspace:      /home/mvbt/mvgo/backend-node/workspace（🆕 S5：统一到后端副本根）
 *   - tempComponents: /home/mvbt/mvgo/temp-components
 *   - frontendWorkspace: /home/mvbt/mvgo/frontend/workspace
 */

import { dirname, isAbsolute, join, resolve } from 'path'
import { fileURLToPath } from 'url'

// ES Module 中获取 __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// backendRoot = backend-node/
// 本文件在源码态位于 backend-node/src/config/，编译后位于 backend-node/dist/config/，
// 两种形态都恰好在 backend-node 下第 2 层，因此统一向上回溯两级。
export const backendRoot = dirname(dirname(__dirname))

// projectRoot = backend-node/ 的父目录 = 部署根（如 /home/mvbt/mvgo）
export const projectRoot = dirname(backendRoot)

// ========== workspace 路径 ==========

/**
 * 🆕 S5（2026-09-10）：统一到**后端副本根** backend-node/workspace，消除读写分叉。
 *
 * 分叉根因：写入侧有两套路径 ——
 *   - `workspace-preview-publisher.js` 硬编码 `join(backendRoot, 'workspace')`
 *   - 本文件的 `workspaceRoot` 原为 `projectRoot/workspace`
 * 而读取侧 `componentSearchRoots()` 只扫 `projectRoot/workspace` + `frontend/workspace`，
 * 于是 `backend-node/workspace` 里写进去的产物「写了但解析读不到」（曾实测：该根有 116 个
 * 规范 c- 目录，全部读不到，直接造成 285 条「残留任务号目录」假象）。
 *
 * 现在 workspaceRoot 指向 backend-node/workspace：
 *   - 读（componentSearchRoots / resolveComponentBaseDirs）与
 *     写（publisher / phase2.copyToWorkspace / tasks.service）**共用同一个根**；
 *   - `projectRoot/workspace` 退役（其 9 个目录 100% 是任务号名，属脏数据）；
 *   - `frontend/workspace` 作为前端侧镜像副本保留（dev/生产前端要读它）。
 */
export const workspaceRoot = join(backendRoot, 'workspace')
export const customComponentsDir = join(workspaceRoot, 'custom-components')
export const vue3ComponentsDir = join(workspaceRoot, 'vue3-components')

/** 前端 workspace（FRONTEND_WORKSPACE 环境变量优先，否则 ../frontend/workspace） */
export function resolveFrontendWorkspacePath() {
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
