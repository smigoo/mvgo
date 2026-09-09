// ============================================================
// 大屏页面骨架生成器 — API 函数
// 后端：/api/page-skeleton（NestJS，统一信封 { success, code, message, data, source }）
// 说明：本模块为独立功能，仅复用 @/core/http 请求封装，不依赖组件生成 / 任务管理前端代码。
// ============================================================

import http from '@/core/http'

const BASE = '/api/page-skeleton'

/** 列表项 */
export interface PageSkeletonItem {
  id: string
  name: string
  groupId: string
  source: string
  createdAt?: string
  updatedAt?: string
}

/** 生成结果结构（后端 structure 字段子集） */
export interface SkeletonStructure {
  title?: string
  width?: number
  height?: number
  theme?: {
    bg?: string
    accent?: string
    header?: string
    text?: string
    [k: string]: any
  }
  components?: Array<{
    name?: string
    region?: string
    type?: string
    heightRatio?: number
    placeholder?: boolean
    note?: string
  }>
  [k: string]: any
}

/** 详情 */
export interface PageSkeletonDetail {
  id: string
  meta: any
  structure: SkeletonStructure
  files: {
    'index.vue': string
    components: Array<{ name: string; content: string }>
    '组件清单.md': string
  }
}

/** 创建返回 */
export interface PageSkeletonCreated {
  id: string
  name: string
  groupId: string
  userId: string
  path: string
  downloadUrl: string
  status?: string
}

/** 列表 */
export async function listPageSkeletons(groupId?: string): Promise<PageSkeletonItem[]> {
  const json = await http.get(BASE, groupId ? { groupId } : undefined)
  if (!json?.success) throw new Error(json?.message || '获取列表失败')
  return (json.data as PageSkeletonItem[]) || []
}

/** 创建：截图（multipart/form-data，字段 file / groupId / name） */
export async function createPageSkeletonByScreenshot(payload: {
  name: string
  groupId: string
  file: File
}): Promise<PageSkeletonCreated> {
  const fd = new FormData()
  fd.append('file', payload.file)
  fd.append('groupId', payload.groupId)
  fd.append('name', payload.name || '')
  const json = await http.upload(BASE, fd)
  if (!json?.success) throw new Error(json?.message || '生成失败')
  return json.data as PageSkeletonCreated
}

/** 创建：Figma 链接（JSON body，字段 figmaUrl / groupId / name） */
export async function createPageSkeletonByFigma(payload: {
  name: string
  groupId: string
  figmaUrl: string
}): Promise<PageSkeletonCreated> {
  const json = await http.post(BASE, payload)
  if (!json?.success) throw new Error(json?.message || '生成失败')
  return json.data as PageSkeletonCreated
}

/** 详情 */
export async function getPageSkeleton(groupId: string, id: string): Promise<PageSkeletonDetail> {
  const json = await http.get(`${BASE}/${groupId}/${id}`)
  if (!json?.success) throw new Error(json?.message || '获取详情失败')
  return json.data as PageSkeletonDetail
}

/** 下载 ZIP（触发浏览器下载） */
export async function downloadPageSkeletonZip(groupId: string, id: string): Promise<void> {
  const blob = await http.download(`${BASE}/${groupId}/${id}/download`)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${id}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** 删除 */
export async function removePageSkeleton(groupId: string, id: string): Promise<void> {
  const json = await http.post(`${BASE}/${groupId}/${id}/delete`)
  if (!json?.success) throw new Error(json?.message || '删除失败')
}

/** 失败重试：基于已保存截图重新生成（后端异步执行，复用同一 pageId） */
export async function retryPageSkeleton(groupId: string, id: string): Promise<any> {
  const json = await http.post(`${BASE}/${groupId}/${id}/retry`, {})
  if (!json?.success) throw new Error(json?.message || '重试失败')
  return json.data
}

/** 构造页面骨架预览 URL（走 /preview 沙盒运行时） */
export function getPagePreviewUrl(groupId: string, id: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const path = `/preview/${id}?groupId=${encodeURIComponent(groupId)}&type=page`
  return base + path.replace(/^\//, '')
}
