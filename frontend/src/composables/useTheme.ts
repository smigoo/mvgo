import { ref, computed, watch, type Ref } from 'vue'
import { theme as antTheme } from 'ant-design-vue'

export type ThemeName = 'light' | 'dark'

const STORAGE_KEY = 'app-theme'
const DEFAULT_THEME: ThemeName = 'light'
const themeRef: Ref<ThemeName> = ref(DEFAULT_THEME)
let initialized = false

function applyTheme(theme: ThemeName) {
  const html = document.documentElement
  html.setAttribute('data-theme', theme)
}

function initTheme() {
  if (initialized) return
  initialized = true

  // localStorage 优先；未设置时默认使用浅色主题
  const saved = localStorage.getItem(STORAGE_KEY) as ThemeName | null
  const initial = saved || DEFAULT_THEME
  themeRef.value = initial
  applyTheme(initial)
}

/**
 * 主题管理 composable
 *
 * 用法：
 *   const { currentTheme, isDark, toggleTheme, setTheme } = useTheme()
 *
 * 在 App.vue setup 顶层调用 initTheme() 以确保尽早初始化
 */
export function useTheme() {
  initTheme()

  const currentTheme = computed(() => themeRef.value)
  const isDark = computed(() => themeRef.value === 'dark')

  /** Ant Design Vue 4.x 主题配置，直接传给 <a-config-provider :theme="antThemeConfig"> */
  const antThemeConfig = computed(() => ({
    algorithm: isDark.value
      ? antTheme.darkAlgorithm
      : antTheme.defaultAlgorithm,
    token: {
      colorPrimary: isDark.value ? '#3b82f6' : '#2563eb',
    },
  }))

  function setTheme(theme: ThemeName) {
    themeRef.value = theme
    applyTheme(theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }

  function toggleTheme() {
    setTheme(themeRef.value === 'light' ? 'dark' : 'light')
  }

  // 自动同步到 DOM
  watch(themeRef, (val) => {
    applyTheme(val)
  })

  return {
    currentTheme,
    isDark,
    antThemeConfig,
    toggleTheme,
    setTheme,
  }
}
