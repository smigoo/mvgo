<template>
  <div class="flow-node" :class="'node-' + data.nodeType" :style="{ borderColor: data.color }">
    <!-- 入口节点：只有出口 -->
    <Handle
      v-if="data.nodeType !== 'start'"
      type="target"
      position="left"
      :style="{ background: data.color, width: '10px', height: '10px' }"
    />
    <!-- 结束节点：只有入口 -->
    <Handle
      v-if="data.nodeType !== 'end'"
      type="source"
      position="right"
      :style="{ background: data.color, width: '10px', height: '10px' }"
    />
    <div class="flow-node-header" :style="{ background: data.color }">
      <span class="flow-node-icon">
        <svg v-if="data.nodeType === 'start'" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
        <svg v-else-if="data.nodeType === 'end'" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="8 12 11 15 16 9"/></svg>
        <svg v-else-if="data.nodeType === 'condition'" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
        <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/></svg>
      </span>
      <span>{{ data.label }}</span>
    </div>
    <div class="flow-node-body" v-if="data.handler">
      <span class="flow-handler">{{ data.handler }}</span>
    </div>
  </div>
</template>

<script setup>
import { Handle } from '@vue-flow/core'

defineProps({
  data: {
    type: Object,
    required: true
  }
})
</script>

<style scoped>
/* 节点样式已在 WorkflowEditor.vue 中通过 :deep() 定义 */
.flow-node-icon {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}
</style>
