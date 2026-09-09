<template>
  <div class="mc-generator-page">
    <!-- Tab切换 -->
    <div class="mc-generator-tabs">
      <button
        class="tab-button"
        :class="{ active: activeTab === 'page' }"
        @click="activeTab = 'page'"
      >
        微码页面开发
      </button>
    </div>

    <!-- 内容区域 -->
    <div class="mc-generator-content">
      <component :is="currentComponent" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import PageGenerate from '../generate/page.vue'

// 当前激活的tab，默认为页面开发
const activeTab = ref<'page'>('page')

// 根据activeTab返回对应的组件
const currentComponent = computed(() => {
  return PageGenerate
})
</script>

<style scoped>
.mc-generator-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.mc-generator-tabs {
  display: flex;
  gap: 0;
  background: var(--bg-card);
  border-bottom: 2px solid var(--border-default);
  padding: 0 40px;
  padding-top: 100px;
}

.tab-button {
  padding: 16px 32px;
  background: transparent;
  border: none;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
}

.tab-button:hover {
  color: var(--brand-light);
  background: rgba(59, 130, 246, 0.05);
}

.tab-button.active {
  color: var(--brand-light);
  border-bottom-color: var(--brand-light);
}

.mc-generator-content {
  flex: 1;
  overflow: auto;
}
</style>
