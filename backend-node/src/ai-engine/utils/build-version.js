/**
 * @file build-version.js — 🛡️ R3-B（2026-09-11）版本一致性护栏的运行时读取侧。
 *
 * 提供「本次运行的是哪个 dist、哪个 git 版本」的单一事实，供生成任务 meta 记录 codeVersion，
 * 与 start-node.js 启动护栏（dist 构建时间 vs src mtime 比对）形成闭环：
 *   - 启动护栏：启动时 WARN「dist 落后于 src」（防旧代码被误当成新代码效果）；
 *   - meta 记录：每个产物落盘 component-meta.json.codeVersion，TaskDetail 可回查
 *     「这份产物是哪个 dist 生成的」（cfb53488 即「旧 dist 产物被当成新代码效果」的实锤）。
 *
 * 结果内存缓存：git hash 与 dist 构建时间在一次进程生命周期内不变，只读一次。
 * 全部 try/catch，任何失败降级为 unknown/null —— 绝不因版本读取失败阻断生成。
 */

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { backendRoot } from '../../config/backend-root.js';

let _cache = null;

/**
 * @returns {{ gitHash: string, distBuildTime: number|null, distBuildAt: string|null }}
 */
export function getBuildVersion() {
  if (_cache) return _cache;
  const distMain = join(backendRoot, 'dist', 'main.js');
  let distBuildTime = null;
  try {
    if (existsSync(distMain)) distBuildTime = statSync(distMain).mtimeMs;
  } catch { /* 读不到则 null */ }
  let gitHash = 'unknown';
  try {
    gitHash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: backendRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch { /* 非 git 环境 / git 不可用 → unknown */ }
  _cache = {
    gitHash: gitHash || 'unknown',
    distBuildTime,
    distBuildAt: distBuildTime ? new Date(distBuildTime).toISOString() : null,
  };
  return _cache;
}
