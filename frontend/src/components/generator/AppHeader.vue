<template>
  <header class="app-header" :class="{ scrolled: isScrolled }">
    <div class="header-left">
      <div class="company-logo-wrapper">
        <img :src="companyLogoSrc" alt="company" class="company-logo" />
        <span class="logo-separator"></span>
      </div>
      <div class="logo-wrapper">
        <div class="logo-mark">
          <img :src="logoSrc" alt="logo" class="logo" />
          <span class="logo-sparkle" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none">
              <path
                d="M12 1.5L14.9 9.1L22.5 12L14.9 14.9L12 22.5L9.1 14.9L1.5 12L9.1 9.1L12 1.5Z"
                fill="#eff6ff"
                stroke="#2563eb"
                stroke-width="1.1"
              />
              <path
                d="M12 5L13.9 10.1L19 12L13.9 13.9L12 19L10.1 13.9L5 12L10.1 10.1L12 5Z"
                fill="#60a5fa"
                opacity="0.9"
              />
            </svg>
          </span>
        </div>
        <div class="brand-text">
          <h1 class="brand-name">感智｜晓界工坊</h1>
          <span class="brand-typing" :style="{ color: terminalGreen }">
            {{ typingText }}
            <span class="brand-cursor" :style="{ background: terminalGreen }"></span>
          </span>
        </div>
      </div>
    </div>

    <!-- 主导航 -->
    <nav class="main-nav">
      <template v-for="tab in mainTabs" :key="tab.path">
        <router-link v-if="tab.enabled" :to="tab.path" class="nav-tab" active-class="active">
          {{ tab.label }}
        </router-link>
        <span v-else class="nav-tab nav-tab-disabled" @click="showDisabledHint(tab.label)">
          {{ tab.label }}
        </span>
      </template>
    </nav>

    <!-- 次导航 + 用户区 -->
    <div class="header-right">
      <!-- 无次导航项时不渲染 nav：避免空的 flex 容器在 .header-right 的 gap 下挤出多余间距 -->
      <nav v-if="subTabs.length" class="sub-nav">
        <template v-for="tab in subTabs" :key="tab.path">
          <router-link v-if="tab.enabled" :to="tab.path" class="sub-tab" active-class="active">
            <span class="sub-dot"></span>
            {{ tab.label }}
          </router-link>
          <span v-else class="sub-tab sub-tab-disabled" @click="showDisabledHint(tab.label)">
            <span class="sub-dot"></span>
            {{ tab.label }}
          </span>
        </template>
      </nav>

      <button class="config-btn" @click="$emit('openConfig')">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="3" />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
          />
        </svg>
        设置
      </button>

      <!-- 主题切换按钮
           头部是 fixed 在视口顶部、高 64px 的栏，按钮垂直居中后上方只剩约 14px；
           默认向上弹的 tooltip（需约 34px）会被视口上边缘裁掉。
           故加 tooltip-below 让气泡改为向下弹出。 -->
      <button
        v-feature="'theme.toggle'"
        class="theme-toggle-btn icon-tooltip tooltip-below"
        @click="toggleTheme"
        :data-tooltip="isDark ? '切换到浅色' : '切换到深色'"
        :aria-label="isDark ? '切换到浅色' : '切换到深色'"
      >
        <!-- 太阳图标（深色模式下显示，点击切回浅色） -->
        <svg
          v-if="isDark"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
        <!-- 月亮图标（浅色模式下显示，点击切到深色） -->
        <svg
          v-else
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </button>

      <!-- 用户菜单 -->
      <div class="user-menu" @mouseenter="handleMenuEnter" @mouseleave="handleMenuLeave">
        <div class="user-trigger">
          <span class="user-avatar">{{ currentUser.charAt(0).toUpperCase() }}</span>
          <span class="user-name">{{ currentUser }}</span>
        </div>
        <div
          v-show="showMenu"
          class="user-dropdown"
          @mouseenter="handleMenuEnter"
          @mouseleave="handleMenuLeave"
        >
          <div class="menu-item group-item">
            <span class="menu-icon">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <span class="menu-text">{{ currentGroup }}</span>
          </div>
          <div class="menu-divider"></div>
          <div class="menu-item logout-item" @click="handleLogout">
            <span class="menu-icon">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </span>
            <span class="menu-text">登出</span>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { useTheme } from '@/composables/useTheme'
import { useFeatureFlagsStore } from '@/stores/feature-flags'
import { useUserStore } from '@/store/modules/user'
import http from '@/core/http'

const router = useRouter()
const { isDark, toggleTheme } = useTheme()
const featureStore = useFeatureFlagsStore()

defineEmits<{ openConfig: [] }>()

const withBaseAsset = (assetPath: string) => `${import.meta.env.BASE_URL}${assetPath}`

const logoSrc = computed(() => withBaseAsset(isDark.value ? 'logo-dark.png' : 'logo.png'))
const companyLogoSrc = withBaseAsset('favicon.png')

// 终端文字颜色：深色模式用荧光绿，浅色模式用品牌深蓝（白底清晰可读）
const terminalGreen = computed(() => (isDark.value ? '#00ff00' : '#0073e6'))

// 管理后台入口（操作日志 / 用户管理）：系统管理员可见
const userStore = useUserStore()
const isAdmin = computed(() => userStore.isAdmin())

// 主导航（设计稿中间的5个标签）— 每项关联功能开关 key
const mainTabsConfig = [
  { path: '/generator/components', label: '组件开发', feature: 'generator.component' },
  { path: '/components', label: '组件库', feature: 'component.library' },
  // { path: '/generator/page',      label: '页面',    feature: 'generator.page' },
  { path: '/generator/api', label: '接口开发', feature: 'generator.api' },
  { path: '/tasks', label: '任务中心', feature: 'tasks' }
  // { path: '/screen', label: '大屏布局', feature: 'screen' },
  // 「页面开发」「工作流编排」已移至页脚 AppFooter
]

// 管理后台导航项：仅 admin 角色可见（不参与功能开关）
const adminTab = { path: '/management', label: '操作日志', adminOnly: true }
const usersTab = { path: '/users', label: '用户管理', adminOnly: true }

// 主导航最终列表：admin 角色额外追加「操作日志」「用户管理」
const mainTabs = computed(() => {
  const base = mainTabsConfig.map((tab) => ({
    ...tab,
    enabled: featureStore.isEnabled(tab.feature)
  }))
  if (isAdmin.value) {
    base.push({ ...adminTab, enabled: true })
    base.push({ ...usersTab, enabled: true })
  }
  return base
})

// 次导航（设计稿右侧的3个标签）— 每项关联功能开关 key
// 「架构介绍」已于 2026-08-30 移至页脚 AppFooter，头部分区不再承载低频入口。
const subTabsConfig = [
  // { path: '/demo/c-mc-demo',            label: 'Playground',  feature: 'demo' },
  // { path: '/workspace', label: 'WorkSpace', feature: 'workspace' },
  // { path: '/generator/intro', label: '架构介绍', feature: 'generator.intro' },  ← 已移到 AppFooter
  // { path: '/generator/token-dashboard', label: 'Token监控',    feature: 'generator.token-dashboard' },
  // 实验性工具：仅 dev 环境可见（生产构建 import.meta.env.DEV 为 false）
  // { path: '/pipeline-lab', label: '管线实验室', devOnly: true }
]

// 根据功能开关标记每项是否可用（不过滤，保留显示但置灰）
const subTabs = computed(() =>
  subTabsConfig
    .filter((tab) => !tab.devOnly || import.meta.env.DEV)
    .map((tab) => ({
      ...tab,
      // devOnly 项无功能开关，默认始终可用；其余按 feature 开关判定
      enabled: tab.devOnly ? true : featureStore.isEnabled(tab.feature)
    }))
)

// 暂不开放提示
function showDisabledHint(label: string) {
  message.warning(`「${label}」暂不开放`)
}

// 主题切换是否可用
const canToggleTheme = computed(() => featureStore.isEnabled('theme.toggle'))

const isScrolled = ref(false)
const currentUser = ref('用户')
const currentGroup = ref('加载中...')
const showMenu = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | null = null

// 终端打字机动效
const typingPhrases = [
  '$ AI 驱动  ·  一键生成  ',
  '$ <h1>Hello, World!</h1> ',
  '$ Figma  →  Vue3组件  ',
  '$ Figma  →  微码组件  ',
  '$ 需求文档  →  交互生成  ',
  '$ Apifox  →  数据对接  '
]
const typingText = ref('')
let typingIndex = 0
let charIndex = 0
let isDeleting = false
let typingTimer: ReturnType<typeof setTimeout> | null = null

function startTyping() {
  const current = typingPhrases[typingIndex]
  if (!isDeleting) {
    typingText.value = current.slice(0, charIndex + 1)
    charIndex++
    if (charIndex === current.length) {
      isDeleting = true
      typingTimer = setTimeout(startTyping, 2000)
      return
    }
    typingTimer = setTimeout(startTyping, 60 + Math.random() * 40)
  } else {
    typingText.value = current.slice(0, charIndex - 1)
    charIndex--
    if (charIndex === 0) {
      isDeleting = false
      typingIndex = (typingIndex + 1) % typingPhrases.length
      typingTimer = setTimeout(startTyping, 400)
      return
    }
    typingTimer = setTimeout(startTyping, 30 + Math.random() * 20)
  }
}

function handleMenuEnter() {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
  showMenu.value = true
}

function handleMenuLeave() {
  hideTimer = setTimeout(() => {
    showMenu.value = false
  }, 200)
}

async function loadUserInfo() {
  try {
    // 复用 userStore（含并发/缓存去重），不再单独请求 /api/auth/current
    const data = await userStore.fetchCurrentUser()
    // 缓存命中（cached:true）或无 user 时回退读 store 已加载的数据
    const u = data?.user || userStore.userInfo
    const g = data?.group || userStore.group
    currentUser.value = u?.username || '用户'
    currentGroup.value = g?.name || '未分配群组'
    if (g?.id) {
      localStorage.setItem('currentGroupId', g.id)
    }
  } catch (error) {
    currentUser.value = '用户'
    currentGroup.value = '未登录'
  }
}

async function handleLogout() {
  try {
    await http.post('/api/auth/logout')
    localStorage.removeItem('user')
    localStorage.removeItem('currentGroupId')
    message.success('已登出')
    // 生产环境（门户 iframe 内）：调用门户统一登出
    if (
      import.meta.env.PROD &&
      window.parent !== window &&
      typeof window.parent.logout === 'function'
    ) {
      window.parent.logout()
    } else if (window.parent !== window && typeof window.parent.getToken === 'function') {
      // 门户内：刷新父页面由门户重新注入 token 完成鉴权（登录页已移除，门户鉴权模式）
      window.parent.location.reload()
    } else {
      // 非门户场景：登录页已移除，直接刷新当前页以反映登出状态
      window.location.reload()
    }
  } catch (error) {
    message.error('登出失败')
  }
}

function handleScroll() {
  isScrolled.value = window.scrollY > 8
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll, { passive: true })
  handleScroll()
  loadUserInfo()
  startTyping()
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
  if (typingTimer) clearTimeout(typingTimer)
})
</script>

<style scoped>
.app-header {
  background: var(--bg-header);
  padding: 0 32px;
  height: 64px;
  display: flex;
  align-items: center;
  gap: 24px;
  border-bottom: 1px solid var(--border-light);
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  transition:
    background 0.25s ease,
    backdrop-filter 0.25s ease,
    box-shadow 0.25s ease;
}

.app-header.scrolled {
  background: var(--bg-header-scrolled);
  border-bottom-color: var(--border-light);
  box-shadow: var(--shadow-sm);
}

/* ===== 左侧 Logo ===== */
.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 0 1 auto;
  min-width: 0;
  max-width: min(360px, 32vw);
}

.company-logo-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.company-logo {
  width: 36px;
  height: 36px;
  object-fit: contain;
  flex-shrink: 0;
}

.logo-separator {
  width: 1.5px;
  height: 20px;
  background: var(--text-tertiary);
  display: block;
}

.logo-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.logo-mark {
  position: relative;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
}

.logo {
  width: 30px;
  height: 30px;
  object-fit: contain;
  border-radius: var(--radius-md);
}

.logo-sparkle {
  display: none;
  position: absolute;
  top: -7px;
  right: -8px;
  width: 14px;
  height: 14px;
  pointer-events: none;
  transform-origin: center;
  animation: logo-sparkle-pulse 1.8s ease-in-out infinite;
}

@keyframes logo-sparkle-pulse {
  0%,
  100% {
    transform: scale(0.82);
    opacity: 0.45;
  }
  45% {
    transform: scale(1.08);
    opacity: 1;
  }
  70% {
    transform: scale(0.96);
    opacity: 0.78;
  }
}

@media (prefers-reduced-motion: reduce) {
  .logo-sparkle {
    animation: none;
    opacity: 0.85;
  }
}

.brand-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.brand-name {
  line-height: 1.3;
}

.brand-typing {
  font-family: 'SFMono-Regular', 'Consolas', 'Liberation Mono', 'Menlo', monospace;
  font-size: 12px;
  font-weight: 200;
  letter-spacing: 0.5px;
  line-height: 1.4;
  white-space: nowrap;
  /* 固定宽度防止打字机文字变化导致布局抖动 */
  width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.brand-cursor {
  display: inline-block;
  width: 7px;
  height: 10px;
  margin-left: 2px;
  vertical-align: middle;
  animation: brand-cursor-blink 1s step-end infinite;
}

@keyframes brand-cursor-blink {
  50% {
    opacity: 0;
  }
}

.brand-name {
  font-family: 'Ali';
  font-size: 20px;
  font-weight: 900;
  line-height: 1.1;
  color: var(--text-primary);
  margin: 0;
  white-space: nowrap;
}

/* ===== 主导航 ===== */
.main-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
  justify-content: center;
  position: relative;
}

.nav-tab {
  padding: 8px 16px;
  font-size: 14px;
  color: var(--text-secondary);
  text-decoration: none;
  white-space: nowrap;
  font-weight: 500;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  transition:
    color 0.2s ease,
    background 0.2s ease,
    border-color 0.2s ease;
}

.nav-tab:hover {
  color: var(--brand);
  background: var(--brand-bg-hover);
  border-color: color-mix(in srgb, var(--brand) 20%, transparent);
}

.nav-tab.active {
  color: var(--brand);
  font-weight: 600;
  background: var(--brand-bg-hover);
  border-color: color-mix(in srgb, var(--brand) 18%, transparent);
}

/* 禁用态导航 */
.nav-tab-disabled {
  color: var(--text-quaternary);
  cursor: not-allowed;
  opacity: 0.5;
}

.nav-tab-disabled:hover {
  color: var(--text-quaternary);
  background: transparent;
}

/* ===== 右侧区域 ===== */
.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 0 0 auto;
  min-width: 0;
}

/* 次导航 */
.sub-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.sub-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--text-tertiary);
  text-decoration: none;
  transition:
    color 0.2s ease,
    background 0.2s ease,
    border-color 0.2s ease;
  white-space: nowrap;
  border-radius: var(--radius-sm);
  font-weight: 500;
  border: 1px solid transparent;
}

.sub-tab:hover {
  color: var(--brand);
  background: var(--brand-bg-hover);
  border-color: color-mix(in srgb, var(--brand) 14%, transparent);
}

.sub-tab.active {
  color: var(--brand);
  font-weight: 600;
  background: var(--brand-bg-hover);
  border-color: color-mix(in srgb, var(--brand) 16%, transparent);
}

/* 禁用态次导航 */
.sub-tab-disabled {
  color: var(--text-quaternary);
  cursor: not-allowed;
  opacity: 0.5;
}

.sub-tab-disabled:hover {
  color: var(--text-quaternary);
  background: transparent;
}

.sub-tab-disabled .sub-dot {
  background: var(--text-quaternary);
}

.sub-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--brand-light);
  flex-shrink: 0;
}

/* 设置按钮 */
.config-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background: transparent;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
  transition:
    border-color 0.2s ease,
    color 0.2s ease,
    background 0.2s ease;
}

.config-btn:hover {
  border-color: var(--brand);
  color: var(--brand);
  background: var(--brand-bg-hover);
}

/* 主题切换按钮 */
.theme-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--text-secondary);
  transition:
    border-color 0.2s ease,
    color 0.2s ease,
    background 0.2s ease;
  flex-shrink: 0;
}

.theme-toggle-btn:hover {
  border-color: var(--brand);
  color: var(--brand);
  background: var(--brand-bg-hover);
}

/* ===== 用户菜单 ===== */
.user-menu {
  position: relative;
}

.user-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px 5px 5px;
  background: var(--brand-bg-hover);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease;
  white-space: nowrap;
  border: 1px solid transparent;
}

.user-trigger:hover {
  background: var(--brand-bg-active);
  border-color: var(--brand-border);
}

.user-avatar {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  background: var(--brand);
  color: var(--text-on-brand);
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.user-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 180px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-dropdown);
  overflow: hidden;
  z-index: 1000;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  font-size: 13px;
  transition: background 0.2s;
}

.menu-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.menu-text {
  flex: 1;
}

.group-item {
  color: var(--text-secondary);
  cursor: default;
}

.logout-item {
  color: var(--text-secondary);
  cursor: pointer;
}

.logout-item:hover {
  background: var(--error-bg);
  color: var(--error);
}

.menu-divider {
  height: 1px;
  background: var(--border-light);
  margin: 0;
}

@media (max-width: 1280px) {
  .app-header {
    padding: 0 20px;
    gap: 16px;
  }

  .header-left {
    max-width: min(300px, 28vw);
  }

  .brand-typing {
    width: 150px;
  }

  .nav-tab {
    padding: 8px 12px;
  }

  .sub-tab {
    padding: 6px 10px;
  }
}

@media (max-width: 1100px) {
  .app-header {
    padding: 0 12px;
    gap: 12px;
  }

  .header-left {
    max-width: 220px;
    gap: 10px;
  }

  .company-logo {
    width: 30px;
    height: 30px;
  }

  .logo {
    width: 26px;
    height: 26px;
  }

  .brand-name {
    font-size: 18px;
  }

  .brand-typing {
    display: none;
  }

  .main-nav {
    justify-content: flex-start;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 2px;
  }

  .main-nav::-webkit-scrollbar {
    display: none;
  }

  .nav-tab {
    flex: 0 0 auto;
  }

  .header-right {
    gap: 8px;
  }

  .sub-nav {
    display: none;
  }

  .config-btn {
    padding: 7px 10px;
  }

  .user-name {
    display: none;
  }

  .user-trigger {
    padding-right: 5px;
  }
}

@media (max-width: 760px) {
  .app-header {
    height: 56px;
    gap: 10px;
    /* 去掉滚动时阴影，减少渲染负担 */
  }

  .app-header.scrolled {
    box-shadow: none;
  }

  .header-left {
    max-width: 170px;
    gap: 8px;
  }

  .logo-separator {
    height: 16px;
  }

  .brand-name {
    font-size: 16px;
  }

  .nav-tab {
    padding: 7px 10px;
    font-size: 13px;
    /* 精简 hover 效果 */
  }

  .nav-tab:hover {
    transform: none;
    box-shadow: none;
  }

  .config-btn {
    padding: 0;
    width: 34px;
    height: 34px;
    justify-content: center;
  }

  .config-btn svg {
    margin: 0;
  }

  .config-btn {
    font-size: 0;
  }

  .config-btn:hover {
    transform: none;
    box-shadow: none;
  }

  .theme-toggle-btn:hover {
    transform: none;
    box-shadow: none;
  }
}

@media (max-width: 560px) {
  .app-header {
    padding: 0 8px;
    gap: 8px;
  }

  /* 隐藏 logo 分隔线，节省 14px + 8px = 22px 横向空间 */
  .logo-separator {
    display: none;
  }

  .header-left {
    max-width: 132px;
    gap: 6px;
  }

  /* 进一步缩小 company logo，去除圆角 */
  .company-logo {
    width: 22px;
    height: 22px;
  }

  .logo {
    width: 20px;
    height: 20px;
    border-radius: var(--radius-xs);
  }

  .logo-wrapper {
    gap: 6px;
  }

  /* 品牌名再缩小，保持清晰可读 */
  .brand-name {
    font-size: 13px;
  }

  /* 主导航精简 */
  .main-nav {
    gap: 4px;
  }

  .nav-tab {
    padding: 5px 8px;
    font-size: 12px;
  }

  /* 移除所有装饰性动画与阴影，减少 GPU 压力 */
  .nav-tab,
  .nav-tab.active,
  .nav-tab:hover {
    transform: none !important;
    box-shadow: none !important;
  }

  .nav-tab::before,
  .nav-tab::after {
    display: none !important;
  }

  /* 按钮简化为图标 */
  .theme-toggle-btn {
    width: 30px;
    height: 30px;
  }

  .theme-toggle-btn:hover {
    transform: none !important;
    box-shadow: none !important;
  }

  /* 用户菜单只保留头像 */
  .user-trigger {
    padding: 0;
    background: transparent;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-full);
  }

  .user-avatar {
    width: 28px;
    height: 28px;
  }

  .user-name {
    display: none;
  }
}

@media (max-width: 420px) {
  .app-header {
    padding: 0 6px;
    gap: 6px;
  }

  .header-left {
    max-width: 110px;
    gap: 4px;
  }

  .company-logo {
    width: 18px;
    height: 18px;
  }

  .company-logo-wrapper {
    gap: 4px;
  }

  .logo-wrapper {
    gap: 4px;
  }

  .logo {
    width: 16px;
    height: 16px;
    border-radius: var(--radius-xs);
  }

  .brand-name {
    font-size: 12px;
  }

  .nav-tab {
    padding: 4px 6px;
    font-size: 11px;
  }

  .theme-toggle-btn {
    width: 28px;
    height: 28px;
  }
}
</style>
