/**
 * 组件交付 zip 打包过滤规则
 *
 * 背景（2026-09-10）：`archive.directory()` 会把组件目录下的**管线内部目录**一并打进交付包，
 * 实测 environment-monitor 的下载包里混进了 125KB 的截图与生成态快照：
 *   .snapshots/（含 initial/_upload/screenshot.png）、.backups/、.cache/、.checkpoint/
 * 这些是平台自身的版本/缓存产物，不是组件源码，交付给用户/推 GitLab 前必须剔除。
 *
 * 用法：
 *   archive.directory(workspacePath, componentId, packageEntryFilter());
 */

/**
 * 需要排除的目录名（匹配路径中的任意一级）
 *
 * - .snapshots / .backups：Playground 写文件快照与备份（平台内部，可回滚用）
 * - .cache / .checkpoint / .mc-gen：生成管线中间态
 * - node_modules / .git：不应出现在交付包里
 */
export const EXCLUDED_PACKAGE_DIRS: readonly string[] = [
  '.snapshots',
  '.backups',
  '.cache',
  '.checkpoint',
  '.mc-gen',
  'node_modules',
  '.git',
]

/**
 * 判断 zip 条目是否应被排除。
 * @param entryName archiver 传入的相对路径（正斜杠，如 `resources/styles/index.less`）
 */
export function isExcludedPackageEntry(entryName: string): boolean {
  const parts = String(entryName || '').split(/[\\/]/)
  return parts.some((part) => EXCLUDED_PACKAGE_DIRS.includes(part))
}

/**
 * 生成 archiver `directory(dir, dest, data)` 的 data 过滤器：
 * 返回 false 表示丢弃该条目，返回 entry 表示保留。
 */
export function packageEntryFilter() {
  return (entry: { name?: string }) => (isExcludedPackageEntry(entry?.name || '') ? false : entry)
}
