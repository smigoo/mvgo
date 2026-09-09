/**
 * Generator API 统一配置
 * LangGraph Server API 调用
 */
import axios from 'axios'
import { getAuthToken } from '@/utils/api-token'

// 创建 Generator API 实例
const generatorAPI = axios.create({
  baseURL: import.meta.env.VITE_LANGGRAPH_API || 'http://localhost:3000/api',
  timeout: 120000, // 2分钟超时（生成任务可能较长）
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器
generatorAPI.interceptors.request.use(
  (config) => {
    const token = getAuthToken()
    if (token) config.headers['Token'] = token
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
generatorAPI.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    console.error('Generator API Error:', error)
    return Promise.reject(error)
  }
)

export default generatorAPI

// 重新导出 generator.ts 中的方法
export {
  generateComponent,
  generateVue3Component,
  createProgressStream,
  generateDocConfigs,
  cancelTask,
  pauseTask,
  resumeTask,
  startQueuedTask,
  analyzePage,
  generatePage,
  fetchTaskStatus,
  fetchAllTasks,
  fetchTaskTree,
  deleteTask,
  fetchFigmaPreview
} from './generator'
