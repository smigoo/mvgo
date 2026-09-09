<template>
  <div class="status-bar">
    <span class="status-bar__dot" :class="dotClass"></span>
    <span class="status-bar__text">{{ text }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  state: { type: String, default: 'idle' }, // idle | running | done
  percent: { type: Number, default: 0 },
  eta: { type: String, default: '' },
})

const dotClass = computed(() =>
  props.state === 'idle' ? 'is-gray' : props.state === 'running' ? 'is-running' : 'is-done'
)
const text = computed(() => {
  if (props.state === 'idle') return '当前状态：等待输入 / 空闲'
  if (props.state === 'running') return `当前状态：生成中 · ${Math.round(props.percent)}%`
  return '当前状态：已完成'
})
</script>

<style scoped>
.status-bar {
  height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 24px;
  background: var(--bg-secondary, #f0f0f0);
  border-bottom: 1px solid var(--border-light, #e5e5e5);
  font-size: 12px;
  color: var(--text-secondary, #666);
  flex-shrink: 0;
}
.status-bar__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-bar__dot.is-gray { background: #9ca3af; }
.status-bar__dot.is-running { background: var(--task-running, #22c55e); animation: status-pulse 1.6s ease-in-out infinite; }
.status-bar__dot.is-done { background: var(--task-success, #16a34a); }
.status-bar__text { font-weight: 500; }
</style>
