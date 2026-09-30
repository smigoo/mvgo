// ============================================================
// 大屏布局 · 持久化 & 可分享链接
// ------------------------------------------------------------
// 两个朴素但决定「能不能干活」的能力：
//   ① 自动存档：刷新页面不丢正在编辑的布局（localStorage，debounce 写入）
//   ② 可分享 URL：把布局编码进 query，发给同事就能复现同一张图
//
// 读取优先级：URL 参数 > localStorage > 内置默认预设。
// URL 读完即从地址栏抹掉 —— 否则用户继续改布局后，地址栏还挂着一份旧快照，
// 刷新就"穿越"回去，比不支持分享更让人困惑。
// ============================================================

import { watch, type Ref } from 'vue'
import type { ScreenLayout } from '@/types/screen-layout'

const STORAGE_KEY = 'mvgo:screen-layout:last'
const SHARE_PARAM = 'layout'
/** 超过这个长度就不往 URL 里塞：部分网关会截断超长 URL，宁可明确失败也别给半截链接 */
const SHARE_MAX = 8000

// ============================================================
// base64url 编解码（UTF-8 安全 —— btoa 只吃 latin1，中文布局名会炸）
// ============================================================

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : ''
  const bin = atob(b64 + pad)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/** 结构校验：链接是老版本/被手改过时不至于把编辑器搞崩 */
function isValidLayout(v: unknown): v is ScreenLayout {
  const o = v as ScreenLayout
  return (
    !!o &&
    typeof o === 'object' &&
    !!o.canvas &&
    typeof o.canvas.width === 'number' &&
    typeof o.canvas.height === 'number' &&
    !!o.body &&
    Array.isArray(o.body.columns) &&
    Array.isArray(o.body.zones)
  )
}

export interface PersistenceApi {
  /** 从 URL 或本地存档恢复；返回来源，null 表示没有可恢复内容 */
  restore: () => 'url' | 'storage' | null
  /** 生成分享链接 */
  buildShareUrl: () => { url: string; tooLong: boolean }
  /** 手动立即存档 */
  saveNow: () => void
  /** 清掉本地存档 */
  clearStored: () => void
}

export function useLayoutPersistence(layoutData: Ref<ScreenLayout>): PersistenceApi {
  let timer: ReturnType<typeof setTimeout> | null = null

  function saveNow() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layoutData.value))
    } catch (_) {
      /* 隐私模式 / 配额满：静默降级，不影响编辑 */
    }
  }

  watch(
    layoutData,
    () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(saveNow, 800)
    },
    { deep: true },
  )

  function readStored(): ScreenLayout | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return isValidLayout(parsed) ? parsed : null
    } catch (_) {
      return null
    }
  }

  function readFromUrl(): ScreenLayout | null {
    try {
      const raw = new URL(window.location.href).searchParams.get(SHARE_PARAM)
      if (!raw) return null
      const parsed = JSON.parse(fromBase64Url(raw))
      return isValidLayout(parsed) ? parsed : null
    } catch (_) {
      return null
    }
  }

  /** 读完就把参数抹掉，避免地址栏与编辑器状态长期不一致 */
  function stripUrlParam() {
    try {
      const u = new URL(window.location.href)
      if (!u.searchParams.has(SHARE_PARAM)) return
      u.searchParams.delete(SHARE_PARAM)
      window.history.replaceState({}, '', u.toString())
    } catch (_) {
      /* 忽略：非浏览器环境/受限上下文 */
    }
  }

  function restore(): 'url' | 'storage' | null {
    const fromUrl = readFromUrl()
    if (fromUrl) {
      layoutData.value = fromUrl
      stripUrlParam()
      return 'url'
    }
    const stored = readStored()
    if (stored) {
      layoutData.value = stored
      return 'storage'
    }
    return null
  }

  function buildShareUrl(): { url: string; tooLong: boolean } {
    const encoded = toBase64Url(JSON.stringify(layoutData.value))
    const u = new URL(window.location.href)
    u.searchParams.set(SHARE_PARAM, encoded)
    const url = u.toString()
    return { url, tooLong: url.length > SHARE_MAX }
  }

  function clearStored() {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (_) {
      /* 忽略 */
    }
  }

  return { restore, buildShareUrl, saveNow, clearStored }
}
