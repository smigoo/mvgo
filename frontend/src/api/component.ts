import axios from 'axios'
import { router } from '@/router'
import { message } from 'ant-design-vue'
import { getAuthToken } from '@/utils/api-token'

const BASE_URL = import.meta.env.VITE_LANGGRAPH_API || 'http://localhost:13030/api'

let redirectingToLogin = false

function isPreviewRoute() {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash || ''
  const path = hash.startsWith('#') ? hash.slice(1) : window.location.pathname || ''
  return path.startsWith('/preview/')
}

// 组件接口统一携带登录 cookie，支持后端 session 校验（列表等接口必须登录才能查）
const authAxios = axios.create({ withCredentials: true })

authAxios.interceptors.request.use((config) => {
  const token = getAuthToken()
  if (token) config.headers['Token'] = token
  return config
})

authAxios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && !redirectingToLogin && !isPreviewRoute()) {
      redirectingToLogin = true
      localStorage.removeItem('user')
      localStorage.removeItem('currentGroupId')
      sessionStorage.removeItem('currentSessionId')
      // 门户内刷新父页面重新鉴权；非门户仅提示（登录页已移除，不再跳转）
      if (window.parent !== window && typeof window.parent.getToken === 'function') {
        window.parent.location.reload()
      } else {
        message.warning('登录已过期，请重新登录')
      }
      redirectingToLogin = false
    }
    return Promise.reject(error)
  },
)

// 组件数据类型
export interface Component {
  _id: string
  componentId?: string
  taskId?: string
  target?: 'microcode' | 'vue3'
  name: string
  description?: string
  groupId: string
  /** 所属群组名（后端列表 populate 后返回） */
  groupName?: string
  creatorId: {
    _id: string
    username?: string
    email?: string
  }
  qualityGate?: 'passed' | 'warned' | 'failed'
  qualityScore?: number
  runtimePass?: boolean
  visualPass?: boolean
  previewUrl?: string
  /** 可见性：private=仅自己可见（缺省），public=公共组件池 */
  visibility?: 'private' | 'public'
  /** 最近一次发布时间 */
  sharedAt?: string
  sharedBy?: string
  metadata?: any
  createdAt: string
  updatedAt: string
}

// 列表查询参数
export interface ListComponentsParams {
  groupId?: string
  search?: string
  creator?: 'all' | 'me'
  /** 可见范围：mine=仅我的（缺省）；public=公共组件池；all=我的+公共池 */
  scope?: 'mine' | 'public' | 'all'
  sortBy?: 'lastEdited' | 'created' | 'name' | 'shared'
  page?: number
  pageSize?: number
}

// 列表响应
export interface ListComponentsResponse {
  components: Component[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// 获取组件列表
export async function listComponents(params: ListComponentsParams = {}) {
  const response = await authAxios.get<{
    success: boolean
    data: ListComponentsResponse
  }>(`${BASE_URL}/component/list`, { params })
  return response.data.data
}

// 获取组件详情
export async function getComponent(componentId: string) {
  const response = await authAxios.get<{
    success: boolean
    data?: { component?: Component }
    component?: Component
  }>(`${BASE_URL}/component/${componentId}`)
  // 后端统一返回 { data: { component } }；兼容历史顶层 { component }
  return response.data?.data?.component ?? response.data?.component ?? null
}

// 按 sessionId 查找组件（历史记录 → 详情页跳转）
export async function getComponentBySessionId(sessionId: string) {
  const response = await authAxios.get<{
    success: boolean
    data?: { component?: Component }
    component?: Component
  }>(`${BASE_URL}/component/by-session/${sessionId}`)
  return response.data?.data?.component ?? response.data?.component ?? null
}

// 获取组件文件列表（支持已登记组件与失败任务的中间产物）
export async function getComponentFiles(componentId: string) {
  const response = await authAxios.get<{
    success: boolean
    files: Array<{ path: string; name: string; isDirectory: boolean }>
  }>(`${BASE_URL}/component/${componentId}/files`)
  return Array.isArray(response.data.files) ? response.data.files : []
}

export async function analyzeComponentVisual(componentId: string) {
  const response = await authAxios.post(`${BASE_URL}/component/${componentId}/analyze-visual`, {})
  return response.data
}

// 创建组件
export async function createComponent(data: {
  name: string
  description?: string
  groupId: string
  metadata?: any
}) {
  const response = await authAxios.post<{
    success: boolean
    component: Component
  }>(`${BASE_URL}/component`, data)
  return response.data?.component ?? null
}

// 更新组件（后端路由为 POST :componentId）
export async function updateComponent(
  componentId: string,
  data: {
    name: string
    description?: string
    metadata?: any
  }
) {
  const response = await authAxios.post<{
    success: boolean
    component: Component
  }>(`${BASE_URL}/component/${componentId}`, data)
  return response.data?.component ?? null
}

// 删除组件（后端路由为 POST :componentId/delete）
export async function deleteComponent(componentId: string) {
  const response = await authAxios.post<{
    success: boolean
    message: string
  }>(`${BASE_URL}/component/${componentId}/delete`)
  return response.data
}

// 批量删除组件
export async function batchDeleteComponents(componentIds: string[]) {
  const response = await authAxios.post<{
    success: boolean
    message: string
    deleted: number
    failed: number
  }>(`${BASE_URL}/component/batch-delete`, { componentIds })
  return response.data
}

// 发布到公共组件池（严格仅提供者）
export async function publishComponent(id: string) {
  const response = await authAxios.post<{
    success: boolean
    message: string
    data: { _id: string; visibility: 'private' | 'public'; sharedAt?: string }
  }>(`${BASE_URL}/component/${id}/publish`)
  return response.data
}

// 从公共组件池下架（严格仅提供者，个人副本保留）
export async function unpublishComponent(id: string) {
  const response = await authAxios.post<{
    success: boolean
    message: string
    data: { _id: string; visibility: 'private' | 'public' }
  }>(`${BASE_URL}/component/${id}/unpublish`)
  return response.data
}

// 构造预览URL（Phase2 微码组件，有编译好的 index.html）
export function getPreviewUrl(groupId: string, componentId: string, filePath = 'index.html') {
  return `${BASE_URL}/preview/${groupId}/${componentId}/${filePath}`
}

function withAppBase(path: string) {
  const base = import.meta.env.BASE_URL || '/'
  return base + path.replace(/^\//, '')
}

// 构造 Vue3 组件预览URL（走 Vite 前端路由，动态加载 .vue SFC）
export function getVue3PreviewUrl(groupId: string, sessionId: string) {
  return withAppBase(`/preview/${sessionId}?groupId=${groupId}&type=vue3`)
}

// 构造微码组件预览 URL：统一走 /preview 运行时。
// /mc-component 保留为旧链接兼容入口，但新调用全部收敛到同一套错误桥、尺寸与沙箱机制。
export function getMcPreviewUrl(sessionId: string) {
  return withAppBase(`/preview/${sessionId}?type=microcode`)
}

export function getRouteUrl(path: string) {
  return withAppBase(path)
}
