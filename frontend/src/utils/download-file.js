import http from '@/core/http'
import { message } from 'ant-design-vue'

/**
 * 带 Token 的 Blob 下载（治本 2026-09-04）。
 *
 * 背景：浏览器原生下载（<a :href> / window.open）发起的是导航请求，
 * 无法携带 `Token` 自定义请求头；生产 /api 走 Java 8080 门面，
 * SessionGuardInterceptor 从 header 读 Token 失败 → 401
 * → Chrome 弹「请先尝试登录相应网站，再重新下载」（dev 因 Vite 代理 + 宽松鉴权不复现）。
 *
 * 治本：统一改为 fetch(带 Token 头) → Blob → a[download] 触发本地保存。
 * 文件名优先取响应 Content-Disposition，缺失时用 fallbackName，再回退 URL 末段。
 *
 * @param {string} url 下载地址（相对 /api/... 或绝对）
 * @param {string} [fallbackName] 响应头无文件名时的兜底名（含扩展名）
 * @returns {Promise<void>}
 */
export async function downloadByUrl(url, fallbackName = 'download') {
  if (!url) {
    message.warning('下载地址为空')
    return
  }
  try {
    const response = await http.raw(url)
    if (!response.ok) {
      throw new Error(response.status === 401 ? '登录已过期，请刷新页面重试' : `下载失败 (HTTP ${response.status})`)
    }
    const blob = await response.blob()
    const cd = response.headers.get('content-disposition') || ''
    let name = ''
    const utf8Match = cd.match(/filename\*=(?:UTF-8'')?([^;]+)/i)
    const plainMatch = cd.match(/filename="?([^";]+)"?/i)
    if (utf8Match) {
      try {
        name = decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ''))
      } catch {
        name = utf8Match[1].trim().replace(/^"|"$/g, '')
      }
    } else if (plainMatch) {
      name = plainMatch[1].trim()
    }
    if (!name) {
      const lastSeg = decodeURIComponent(url.split('?')[0].split('/').pop() || '')
      name = lastSeg.includes('.') ? lastSeg : fallbackName
    }
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(objectUrl)
  } catch (err) {
    message.error(err?.message || '下载失败')
  }
}
