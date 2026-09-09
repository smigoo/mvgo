<template>
  <div class="hero-card" :style="heroStyle">
    <!-- 用户头像 -->
    <div v-if="type === 'user'" class="hero-avatar" :style="{ background: avatarColor || 'var(--brand)' }">
      {{ avatarLetter }}
    </div>
    <!-- 群组/模型图标 -->
    <div v-else class="hero-icon" :style="{ background: theme.bg, color: theme.primary }">
      {{ icon }}
    </div>

    <!-- 信息区 -->
    <div class="hero-info">
      <div class="hero-name">{{ label }}</div>
      <div v-if="subtitle" class="hero-subtitle">{{ subtitle }}</div>
    </div>

    <!-- 指标区 -->
    <div class="hero-metrics">
      <div
        v-for="(m, idx) in metrics"
        :key="idx"
        class="hero-metric"
        :class="{ 'hero-metric-divider': idx > 0 }"
      >
        <div class="metric-value">{{ m.value }}</div>
        <div class="metric-label">{{ m.label }}</div>
        <div v-if="m.sub" class="metric-sub">{{ m.sub }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface MetricItem {
  label: string
  value: string
  sub?: string
}

interface Theme {
  primary: string
  light: string
  bg: string
}

const props = defineProps<{
  type: 'user' | 'group' | 'model'
  icon: string
  label: string
  theme: Theme
  metrics: MetricItem[]
  avatarColor?: string
  subtitle?: string
}>()

const heroStyle = computed(() => ({
  borderColor: props.theme.light,
  background: props.theme.bg,
}))

const avatarLetter = computed(() => {
  if (!props.label) return '?'
  // 中文名取最后一位，英文名取首字母
  const name = props.label.trim()
  if (/^[\u4e00-\u9fa5]/.test(name)) return name[name.length - 1]
  return name[0].toUpperCase()
})
</script>

<style scoped>
.hero-card {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 24px 28px;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  margin-bottom: 20px;
  transition: border-color 0.3s ease, background 0.3s ease;
}

.hero-avatar {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-inverse);
  font-size: 22px;
  font-weight: 700;
  flex-shrink: 0;
  letter-spacing: 0.5px;
}

.hero-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  flex-shrink: 0;
}

.hero-info {
  flex-shrink: 0;
  min-width: 100px;
  padding-right: 16px;
  border-right: 1px solid var(--border-light);
}

.hero-name {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.3;
}

.hero-subtitle {
  font-size: 13px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.hero-metrics {
  display: flex;
  align-items: center;
  gap: 28px;
  flex: 1;
  flex-wrap: wrap;
}

.hero-metric {
  text-align: center;
  padding: 0 20px;
}

.hero-metric-divider {
  border-left: 1px solid var(--border-light);
}

.metric-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.metric-label {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.metric-sub {
  font-size: 11px;
  color: var(--scrollbar-thumb);
  margin-top: 1px;
}

@media (max-width: 768px) {
  .hero-card {
    flex-wrap: wrap;
    gap: 12px;
    padding: 18px 20px;
  }
  .hero-info {
    border-right: none;
    padding-right: 0;
  }
  .hero-metrics {
    gap: 16px;
  }
  .hero-metric {
    padding: 0 12px;
  }
  .hero-metric-divider {
    border-left: none;
  }
}
</style>
