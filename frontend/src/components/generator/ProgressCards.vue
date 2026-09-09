<template>
  <div class="timeline-container">
    <div
      v-for="(card, index) in cards"
      :key="card.stage"
      class="timeline-item"
      :class="card.status"
    >
      <!-- 时间线节点 -->
      <div class="timeline-node">
        <div class="node-icon" :class="card.status">
          <span v-if="card.status === 'running'" class="spinner"></span>
          <span v-else>{{ getIcon(card.status) }}</span>
        </div>
        <div v-if="index < cards.length - 1" class="timeline-line"></div>
      </div>

      <!-- 内容区域 -->
      <div class="timeline-content">
        <div class="stage-name">{{ card.stage }}</div>
        <div class="stage-message">{{ card.message }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface ProgressCard {
  stage: string
  message: string
  status: 'running' | 'completed' | 'failed'
}

defineProps<{
  cards: ProgressCard[]
}>()

function getIcon(status: string): string {
  switch (status) {
    case 'running':
      return '▶'
    case 'completed':
      return '✓'
    case 'failed':
      return '✗'
    default:
      return '▶'
  }
}
</script>

<style scoped>
.timeline-container {
  margin-top: 30px;
  padding: 20px 0;
}

.timeline-item {
  display: flex;
  gap: 20px;
  position: relative;
  padding-bottom: 30px;
}

.timeline-item:last-child {
  padding-bottom: 0;
}

/* 时间线节点区域 */
.timeline-node {
  flex: 0 0 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.node-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  background: var(--border-default);
  color: var(--text-tertiary);
  border: 3px solid var(--border-default);
  position: relative;
  z-index: 2;
}

.node-icon.running {
  background: var(--task-running-bg);
  border-color: var(--task-running);
  color: var(--task-running);
}

.node-icon.completed {
  background: var(--task-success);
  border-color: var(--task-success);
  color: var(--task-success-text);
}

.node-icon.failed {
  background: var(--task-failed);
  border-color: var(--task-failed);
  color: var(--task-failed-text);
}

/* 时间线竖线 */
.timeline-line {
  width: 3px;
  flex: 1;
  background: var(--border-default);
  margin-top: 8px;
}

.timeline-item.running .timeline-line {
  background: var(--task-running-border);
}

.timeline-item.completed .timeline-line {
  background: var(--task-success-border);
}

/* 内容区域 */
.timeline-content {
  flex: 1;
  padding-top: 4px;
}

.stage-name {
  font-size: 1.1em;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.stage-message {
  color: var(--text-tertiary);
  font-size: 0.95em;
  line-height: 1.5;
}

/* Spinner动画（运行态绿） */
.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid color-mix(in srgb, var(--task-running) 30%, transparent);
  border-top-color: var(--task-running);
  border-radius: var(--radius-full);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
