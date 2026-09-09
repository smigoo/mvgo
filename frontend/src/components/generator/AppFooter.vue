<template>
  <footer class="app-footer">
    <span class="af-copy">© 2026 感智晓界工坊 · 感动科技 | 智能体工作室</span>

    <!-- 低频入口放页脚：架构介绍（原在头部次导航）、页面开发、工作流编排（原在头部主导航）
         均受各自功能开关控制，关闭时置灰并给出提示。 -->
    <nav class="af-links">
      <template v-if="introEnabled">
        <router-link to="/generator/intro" class="af-link" active-class="active">
          架构介绍
        </router-link>
      </template>
      <span v-else class="af-link af-link-disabled" @click="showDisabledHint('架构介绍')"> 架构介绍 </span>

      <template v-if="pageSkeletonEnabled">
        <router-link to="/generator/page-skeleton" class="af-link" active-class="active">
          页面开发
        </router-link>
      </template>
      <span v-else class="af-link af-link-disabled" @click="showDisabledHint('页面开发')"> 页面开发 </span>

      <template v-if="workflowEnabled">
        <router-link to="/generator/workflow" class="af-link" active-class="active">
          工作流编排
        </router-link>
      </template>
      <span v-else class="af-link af-link-disabled" @click="showDisabledHint('工作流编排')"> 工作流编排 </span>
    </nav>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { message } from 'ant-design-vue'
import { useFeatureFlagsStore } from '@/stores/feature-flags'

const featureStore = useFeatureFlagsStore()
const introEnabled = computed(() => featureStore.isEnabled('generator.intro'))
const pageSkeletonEnabled = computed(() => featureStore.isEnabled('generator.pageSkeleton'))
const workflowEnabled = computed(() => featureStore.isEnabled('generator.workflow'))

function showDisabledHint(label: string) {
  message.warning(`「${label}」暂不开放`)
}
</script>

<style scoped>
.app-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 24px;
  background: var(--bg-elevated);
  border-top: 1px solid var(--border-default);
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 500;
  letter-spacing: 0.3px;
  flex-shrink: 0;
  height: 39px;
  box-sizing: border-box;
}

.af-copy {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.af-links {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}

.af-link {
  color: var(--text-secondary);
  text-decoration: none;
  padding: 3px 8px;
  border-radius: var(--radius-sm, 4px);
  transition: color 0.15s ease, background 0.15s ease;
  cursor: pointer;
}

.af-link:hover {
  color: var(--brand);
  background: var(--bg-hover, rgba(0, 0, 0, 0.04));
}

.af-link.active {
  color: var(--brand);
}

.af-link-disabled {
  color: var(--text-tertiary);
  cursor: not-allowed;
  opacity: 0.6;
}

.af-link-disabled:hover {
  background: transparent;
}

@media (max-width: 640px) {
  .app-footer {
    padding: 0 12px;
  }
  .af-copy {
    font-size: 11px;
  }
}
</style>
