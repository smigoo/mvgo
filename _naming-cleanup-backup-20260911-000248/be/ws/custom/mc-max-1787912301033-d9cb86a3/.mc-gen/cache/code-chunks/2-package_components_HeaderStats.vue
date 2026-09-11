<template>
  <div class="c-monitor-header-stats">
    <div 
      v-for="(stat, index) in stats" 
      :key="index"
      class="c-monitor-stat-item"
    >
      <img v-if="stat.icon" :src="stat.icon" class="c-monitor-stat-icon" alt="" />
      <div class="c-monitor-stat-content">
        <span class="c-monitor-stat-label">{{ stat.label }}</span>
        <span 
          v-if="stat.value"
          :class="['c-monitor-stat-value', stat.color ? `c-monitor-stat-value-${stat.color}` : '']"
        >
          {{ stat.value }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  stats: {
    type: Array,
    default: () => []
  }
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-monitor-header-stats {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 16px;
  background: linear-gradient(90deg, rgba(25, 144, 255, 0.1) 0%, rgba(8, 163, 165, 0.08) 100%);
  border-radius: 8px;
}

.c-monitor-stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-monitor-stat-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.c-monitor-stat-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.c-monitor-stat-label {
  font-size: 12px;
  color: rgba(51, 51, 51, 1);
  line-height: 1.5;
}

.c-monitor-stat-value {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
}

.c-monitor-stat-value-primary {
  color: rgba(25, 144, 255, 1);
}

.c-monitor-stat-value-success {
  color: rgba(8, 163, 165, 1);
}
</style>
```

```vue