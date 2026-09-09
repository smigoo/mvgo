<template>
  <div class="workspace-page-layout" :class="{ 'has-sidebar': $slots.sidebar }">
    <!-- 页面页头 -->
    <div class="wpl-header">
      <div class="wpl-header-content">
        <div class="wpl-header-main">
          <slot name="header-back" />
          <div class="wpl-header-icon" v-if="$slots['header-icon']">
            <slot name="header-icon" />
          </div>
          <div class="wpl-header-text">
            <h1 class="wpl-title"><slot name="title" /></h1>
            <p class="wpl-desc" v-if="$slots.desc"><slot name="desc" /></p>
          </div>
        </div>
        <div class="wpl-header-actions">
          <slot name="header-actions" />
        </div>
      </div>
    </div>

    <!-- 主体区域 -->
    <div class="wpl-body">
      <!-- 左侧栏（可选） -->
      <aside class="wpl-sidebar" v-if="$slots.sidebar">
        <slot name="sidebar" />
      </aside>

      <!-- 内容区 -->
      <main class="wpl-content">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 统一工作台页面布局框架
 * 提供一致的页头、侧栏、内容区视觉规范
 */
defineOptions({ name: 'WorkspacePageLayout' })
</script>

<style scoped>
.workspace-page-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-page);
}

/* ── 页头 ── */
.wpl-header {
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-default);
  background: var(--bg-card);
  z-index: 10;
}
.wpl-header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 20px;
  min-height: 48px;
}
.wpl-header-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}
.wpl-header-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background: var(--bg-alt);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
  border: 1px solid var(--border-light);
}
.wpl-header-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.wpl-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.3;
}
.wpl-desc {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 0;
  line-height: 1.4;
}
.wpl-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* ── 主体 ── */
.wpl-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

/* ── 左侧栏 ── */
.wpl-sidebar {
  width: 300px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-default);
  background: var(--bg-card);
  overflow-y: auto;
  overflow-x: hidden;
}

/* ── 内容区 ── */
.wpl-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--bg-page);
}

/* ── 无侧栏时内容区占满 ── */
.workspace-page-layout:not(.has-sidebar) .wpl-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px 24px;
}

/* ── 有侧栏时内容区 ── */
.workspace-page-layout.has-sidebar .wpl-content {
  padding: 0;
}
</style>
