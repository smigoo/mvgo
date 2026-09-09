import { existsSync } from 'fs';
import { resolveFrontendWorkspacePath } from './backend-root';

/**
 * 解析前端 workspace 路径。
 *
 * 委托给 backend-root.ts 的 resolveFrontendWorkspacePath()，
 * 统一使用 backendRoot 解析路径，避免 process.cwd() 在不同启动目录下解析不一致。
 *
 * 优先级：
 *   1. 环境变量 FRONTEND_WORKSPACE（生产部署可指向任意绝对路径）
 *   2. 默认回退：projectRoot/frontend/workspace（基于 backendRoot 计算）
 */
export function resolveFrontendWorkspace(): string {
  return resolveFrontendWorkspacePath();
}

/**
 * 判断前端 workspace 是否可用（目录存在）。
 * 用于启动时诊断 / 降级。
 */
export function isFrontendWorkspaceAvailable(): boolean {
  try {
    return existsSync(resolveFrontendWorkspace());
  } catch {
    return false;
  }
}
