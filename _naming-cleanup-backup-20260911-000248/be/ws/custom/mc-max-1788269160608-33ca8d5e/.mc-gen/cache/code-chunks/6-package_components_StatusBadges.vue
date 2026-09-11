<template>
  <div class="c-monitor-status-badges">
    <div
      v-for="(badge, index) in badges"
      :key="index"
      class="c-monitor-badge-item"
      :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-monitor-badge-icon">
        <img :src="badge.icon" class="c-monitor-badge-icon-img" />
      </div>
      <div class="c-monitor-badge-content">
        <div class="c-monitor-badge-row">
          <span class="c-monitor-badge-label">{{ badge.label }}</span>
        </div>
        <div class="c-monitor-badge-row">
          <span class="c-monitor-badge-value">{{ badge.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 徽章数据（从 layoutStructure.sections[1].body.children 提取）
const badges = ref([
  { icon: null, label: '总', value: '56302' },
  { icon: null, label: '总 数:', value: '1280' },
  { label: '随图设置 异常数:', value: '3' },
  { label: '雨水井链接 异常数:', value: '3' }
])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>
