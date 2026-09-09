export type RunnableTaskTarget = 'microcode' | 'vue3'

const NON_COMPONENT_TASK_TYPES = new Set([
  'page',
  'page-skeleton',
  'page-generation',
  'html-split',
  'html-split-batch',
  'requirements-package'
])

export function resolveTaskTarget(task: any): RunnableTaskTarget | '' {
  const target = task?.target ?? task?.componentType ?? task?.result?.target ?? task?.metadata?.target
  if (target === 'vue3' || target === 'microcode') return target

  const id = String(task?.componentId || task?.sessionId || '')
  return resolveComponentType(id)
}

/**
 * 组件类型判断单一真相源（按 ID 前缀）。
 * 🎯 收敛此前 6 处重复的 `id.startsWith('mv-')` 内联判断——改一处漏五处的隐患。
 * @param componentId 组件/任务 ID（如 mc-max-xxx / mv-max-xxx）
 * @param explicitType 显式类型（可选，优先于前缀推断）
 */
export function resolveComponentType(
  componentId: string | null | undefined,
  explicitType?: string | null
): RunnableTaskTarget | '' {
  if (explicitType === 'vue3' || explicitType === 'microcode') return explicitType
  const id = String(componentId || '')
  if (id.startsWith('mv-')) return 'vue3'
  if (id.startsWith('mc-')) return 'microcode'
  return ''
}

export function resolveTaskComponentId(task: any): string {
  return String(task?.componentId || task?.result?.componentId || '')
}

export function isComponentTask(task: any): boolean {
  const taskType = String(task?.taskType || task?.metadata?.taskType || 'component')
  return !NON_COMPONENT_TASK_TYPES.has(taskType) && !!resolveTaskTarget(task)
}

export function isPageTask(task: any): boolean {
  if (!task) return false
  const taskType = String(task.taskType || task.metadata?.taskType || '')
  return taskType === 'page' || taskType === 'page-skeleton' || (task.sessionId || '').startsWith('page-')
}

export function canOpenPagePlayground(task: any): boolean {
  if (!isPageTask(task)) return false
  // 页面骨架只要写盘完成即可进入 Playground 编辑
  return task.artifactReady === true || task.status === 'completed'
}

export function buildPagePlaygroundLocation(task: any) {
  const pageId = String(task?.sessionId || task?.componentId || '')
  return {
    path: `/demo/${encodeURIComponent(pageId)}`,
    query: {
      type: 'page',
      groupId: String(task?.groupId || 'default-group'),
      taskId: pageId,
      taskStatus: String(task?.status || '')
    }
  }
}

/**
 * Playground 面向“已经写出可运行组件骨架的任务”，与 Figma/截图/HTML、Lite/Max 无关。
 * 后端 artifactReady 是唯一判定依据，避免把预览图、Figma 缓存或代码分块误当成可编辑组件。
 */
export function canOpenTaskPlayground(task: any): boolean {
  if (!task || !isComponentTask(task)) return false
  // artifactReady 是后端在组件骨架写盘后抛出的标记（无论 running / completed / failed 都会置 true）
  // 只要骨架就绪就放行，不卡在终态 status 上——否则生成中的任务按钮永远不显示
  const componentId = resolveTaskComponentId(task)
  if (!componentId) return false
  return task.artifactReady === true
}

export function buildTaskPlaygroundLocation(task: any) {
  const componentId = resolveTaskComponentId(task)
  const target = resolveTaskTarget(task)
  const query: Record<string, string> = {
    taskId: String(task?.sessionId || componentId),
    taskStatus: String(task?.status || '')
  }
  if (target) query.type = target
  if (task?.groupId) query.groupId = String(task.groupId)

  return {
    path: `/demo/${encodeURIComponent(componentId)}`,
    query
  }
}
