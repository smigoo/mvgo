import { getAuthToken } from '@/utils/api-token'

export type PreviewTarget = 'microcode' | 'vue3' | 'page'

export interface PreviewSnapshotLike {
  revision: string
  status?: string
}

export interface PreviewTaskLike {
  sessionId?: string
  componentId?: string
  groupId?: string
  target?: string
  taskType?: string
  status?: string
  artifactReady?: boolean
}

export interface PreviewDescriptor {
  componentId: string
  sessionId: string
  groupId: string
  target: PreviewTarget
  snapshot: PreviewSnapshotLike | null
  source: 'candidate' | 'partial' | 'last-good' | 'workspace'
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function resolvePreviewTarget(task: PreviewTaskLike = {}, explicitTarget?: string | null): PreviewTarget {
  const target = explicitTarget || task.target
  if (target === 'page' || task.taskType === 'page' || task.taskType === 'page-skeleton') return 'page'
  if (target === 'vue3') return 'vue3'
  if (target === 'microcode') return 'microcode'
  const id = asString(task.componentId || task.sessionId)
  return id.startsWith('mv-') ? 'vue3' : 'microcode'
}

function sourceOfSnapshot(snapshot: PreviewSnapshotLike): PreviewDescriptor['source'] {
  if (snapshot.status === 'partial') return 'partial'
  if (snapshot.status === 'last-good') return 'last-good'
  return 'candidate'
}

export function selectPreviewSnapshot(
  candidate?: PreviewSnapshotLike | null,
  partial?: PreviewSnapshotLike | null,
  lastGood?: PreviewSnapshotLike | null,
): { snapshot: PreviewSnapshotLike | null; source: PreviewDescriptor['source'] } {
  // 🛡️ 2026-09-11 治本（双保险）：有 last-good 时优先用它，而非早期"validating"候选快照。
  // 否则生成完成后立即跳转预览，可能选中修复器补齐变量前的坏候选（首次编译失败、刷新才好）。
  if (lastGood) return { snapshot: lastGood, source: 'last-good' }
  if (candidate) return { snapshot: candidate, source: sourceOfSnapshot(candidate) }
  if (partial) return { snapshot: partial, source: 'partial' }
  return { snapshot: null, source: 'workspace' }
}

export function resolvePreviewDescriptor(
  task: PreviewTaskLike = {},
  snapshots: {
    candidate?: PreviewSnapshotLike | null
    partial?: PreviewSnapshotLike | null
    lastGood?: PreviewSnapshotLike | null
  } = {},
  explicitTarget?: string | null,
): PreviewDescriptor | null {
  const componentId = asString(task.componentId || task.sessionId)
  if (!componentId) return null
  const sessionId = asString(task.sessionId || componentId)
  const { snapshot, source } = selectPreviewSnapshot(
    snapshots.candidate,
    snapshots.partial,
    snapshots.lastGood,
  )
  return {
    componentId,
    sessionId,
    groupId: asString(task.groupId) || 'default-group',
    target: resolvePreviewTarget(task, explicitTarget),
    snapshot,
    source,
  }
}

export function buildPreviewUrl(
  descriptor: PreviewDescriptor,
  options: {
    width?: number
    height?: number
    cacheKey?: string | number
    /**
     * 传 '0' 时预览强制走 workspace 源（跳过快照）。
     * Playground / 编辑态用：代码与 AI 修复都写 workspace，走快照会看到旧内容。
     */
    snapshot?: string | number
  } = {},
): string {
  const params = new URLSearchParams({
    type: descriptor.target,
    groupId: descriptor.groupId,
  })
  // snapshot=0 = 强制 workspace。必须同时丢掉 revision，否则 preview 页
  // hasExplicitSource = sessionId && revision 仍走快照 → 保存后预览不变。
  const forceWorkspace = options.snapshot !== undefined && String(options.snapshot) === '0'
  if (descriptor.snapshot && !forceWorkspace) {
    params.set('sessionId', descriptor.sessionId)
    params.set('revision', descriptor.snapshot.revision)
    params.set('source', descriptor.source)
  }
  if (options.width && options.width > 0) params.set('w', String(options.width))
  if (options.height && options.height > 0) params.set('h', String(options.height))
  if (options.cacheKey !== undefined) params.set('_t', String(options.cacheKey))
  if (options.snapshot !== undefined) params.set('snapshot', String(options.snapshot))
  const token = getAuthToken()
  if (token) params.set('token', token)
  return `/preview/${encodeURIComponent(descriptor.componentId)}?${params.toString()}`
}

/**
 * 快照内单个文件的 URL。
 * 🔧 cacheKey（2026-09-10）：预览刷新时外层 iframe URL 带 _t，但内层文件 URL 若一成不变，
 * 浏览器可能直接命中 HTTP 缓存返回旧代码 → 表现为「保存成功但预览还是旧的」。
 * 传入 _t 让文件 URL 随刷新一起变化。
 */
export function buildSnapshotFileUrl(
  sessionId: string,
  revision: string,
  path: string,
  preview = false,
  cacheKey?: string | number,
): string {
  const query = new URLSearchParams({ path })
  if (preview) query.set('preview', '1')
  if (cacheKey !== undefined && cacheKey !== null && cacheKey !== '') {
    query.set('_t', String(cacheKey))
  }
  const token = getAuthToken()
  if (token) query.set('token', token)
  return `/api/tasks/${encodeURIComponent(sessionId)}/code-snapshots/${encodeURIComponent(revision)}/file?${query.toString()}`
}

export function hasPreviewEntry(snapshot: { files?: Array<{ path?: string }> } | null | undefined): boolean {
  return !!snapshot?.files?.some((file) => file.path === 'package/index.vue' || file.path === 'index.vue')
}

export function canPreviewTask(task: PreviewTaskLike = {}, snapshot?: { files?: Array<{ path?: string }> } | null): boolean {
  return !!snapshot && hasPreviewEntry(snapshot) || task.artifactReady === true
}
