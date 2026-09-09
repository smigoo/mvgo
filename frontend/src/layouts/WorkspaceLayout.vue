<template>
  <div class="workspace-layout" :class="{ 'workspace-layout--immersive': isImmersivePage }">
    <!-- 左侧导航 -->
    <aside v-if="!isImmersivePage" class="aw-sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">WorkSpace</span>
      </div>
      <nav class="sidebar-nav">
        <template v-for="item in navItems" :key="item.path">
          <router-link
            v-if="item.enabled"
            :to="item.path"
            class="nav-item"
            active-class="nav-item--active"
          >
            <span class="nav-label">{{ item.label }}</span>
          </router-link>
          <div
            v-else
            class="nav-item nav-item-disabled"
            @click="showDisabledHint(item.label)"
          >
            <span class="nav-label">{{ item.label }}</span>
          </div>
        </template>
      </nav>
      <div class="sidebar-footer">
        <span class="version-text">v0.1.0</span>
      </div>
    </aside>

    <!-- 右侧内容区 -->
    <main class="aw-content">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import { useFeatureFlagsStore } from '@/stores/feature-flags'

const route = useRoute()
const featureStore = useFeatureFlagsStore()
// 仅一项导航时隐藏侧边栏，全屏展示深度研究
const isImmersivePage = computed(() => true)

// 侧边栏菜单 — 仅保留深度研究
const navItemsConfig = [
  { path: '/workspace', label: '深度研究', feature: 'workspace.deep-research' },
]

// 根据功能开关标记是否可用（不过滤，保留显示但置灰）
const navItems = computed(() =>
  navItemsConfig.map((item) => ({ ...item, enabled: featureStore.isEnabled(item.feature) }))
)

function showDisabledHint(label) {
  message.warning(`「${label}」暂不开放`)
}
</script>

<style lang="less" scoped>
.workspace-layout {
  display: flex;
  min-height: calc(100vh - 120px);
}

.workspace-layout--immersive {
  height: calc(100vh - 120px);
  min-height: 0;
}

.aw-sidebar {
  width: 220px;
  min-width: 220px;
  background: var(--bg-card);
  border-right: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.sidebar-header {
  padding: 20px 16px 12px;
  border-bottom: 1px solid var(--border-light);
}

.sidebar-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.3px;
}

.sidebar-nav {
  flex: 1;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  font-size: 14px;
  color: var(--text-primary);
  text-decoration: none;
  transition: all 0.15s;
  cursor: pointer;
}

.nav-item:hover {
  background: var(--brand-bg-hover);
  color: var(--text-primary);
}

.nav-item--active {
  background: var(--brand-bg);
  color: var(--text-primary);
  font-weight: 600;
}

/* 禁用态 */
.nav-item-disabled {
  color: var(--text-tertiary);
  cursor: not-allowed;
  opacity: 0.7;
}

.nav-item-disabled:hover {
  background: transparent;
  color: var(--text-tertiary);
}

.nav-label {
  flex: 1;
}

.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border-light);
}

.version-text {
  font-size: 12px;
  color: var(--text-secondary);
}

.aw-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  background: var(--bg-card);
  padding: 0;
  height: 100%;
  overflow: hidden;
}

.workspace-layout--immersive .aw-content {
  overflow: hidden;
}
</style>
