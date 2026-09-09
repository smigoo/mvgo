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
  if (candidate) return { snapshot: candidate, source: sourceOfSnapshot(candidate) }
  if (partial) return { snapshot: partial, source: 'partial' }
  if (lastGood) return { snapshot: lastGood, source: 'last-good' }
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
  options: { width?: number; height?: number; cacheKey?: string | number } = {},
): string {
  const params = new URLSearchParams({
    type: descriptor.target,
    groupId: descriptor.groupId,
  })
  if (descriptor.snapshot) {
    params.set('sessionId', descriptor.sessionId)
    params.set('revision', descriptor.snapshot.revision)
    params.set('source', descriptor.source)
  }
  if (options.width && options.width > 0) params.set('w', String(options.width))
  if (options.height && options.height > 0) params.set('h', String(options.height))
  if (options.cacheKey !== undefined) params.set('_t', String(options.cacheKey))
  const token = getAuthToken()
  if (token) params.set('token', token)
  return `/preview/${encodeURIComponent(descriptor.componentId)}?${params.toString()}`
}

export function buildSnapshotFileUrl(sessionId: string, revision: string, path: string, preview = false): string {
  const query = new URLSearchParams({ path })
  if (preview) query.set('preview', '1')
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
