import { getComponent, updateComponent, publishComponent } from '@/api/component'

/**
 * 公共组件池发布共用逻辑。
 * - 弹窗默认值口径（类型）单一事实源，PublishToPoolModal 与各页面共用；
 * - publishToPublicPool：发布前若名称有改动，先拉全量记录做「增量」更新
 *   （updateComponent 会整体替换 metadata，必须先取全量再展开，否则丢 figma 等字段），再发布。
 */

/** 组件类型展示标签（只读带入） */
export function resolveComponentTypeLabel(record: any): { label: string; key: 'vue3' | 'microcode' } {
  const target = record?.target || record?.metadata?.target
  const metaType = record?.metadata?.type
  if (target === 'vue3' || metaType === 'vue3') return { label: 'Vue3 组件', key: 'vue3' }
  return { label: '微码组件', key: 'microcode' }
}

/**
 * 推送前增量更新（名称有变化才调 updateComponent），随后发布到公共池。
 * @returns { updated: boolean } 是否发生了元数据更新
 */
export async function publishToPublicPool(
  record: any,
  payload: { name: string },
): Promise<{ updated: boolean }> {
  // 拉全量记录：列表项/详情只带裁剪后的 metadata，整体替换前必须拿到全量字段
  let full: any = record
  try {
    const fresh = await getComponent(record._id || record.componentId)
    if (fresh) full = fresh
  } catch {
    // 拉取失败用入参记录，风险：metadata 可能非全量（调用方应尽量传全量）
  }

  const nameChanged = Boolean(payload.name) && payload.name !== (full.name || '')

  if (nameChanged) {
    await updateComponent(String(full._id), {
      name: payload.name,
      description: full.description || '',
      metadata: { ...(full.metadata || {}) },
    })
  }

  await publishComponent(String(full._id))
  return { updated: nameChanged }
}
