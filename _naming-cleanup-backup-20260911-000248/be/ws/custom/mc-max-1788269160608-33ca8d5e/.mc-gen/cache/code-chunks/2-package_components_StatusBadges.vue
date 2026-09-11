<template>
  <div class="c-monitor-status-badges">
    <div 
      v-for="badge in badges" 
      :key="badge.id"
      class="c-monitor-badge-item"
      :style="{ backgroundImage: `url(${bg1})` }"
    >
      <img v-if="badge.icon" :src="badge.icon" class="c-monitor-badge-icon" />
      <div class="c-monitor-badge-content">
        <span class="c-monitor-badge-label">{{ badge.label }}</span>
        <span class="c-monitor-badge-value">{{ badge.value }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import bg1 from '../../resources/images/bg-8788.png'

const badges = ref([
  { id: 1, label: '总', value: '56302', icon: null },
  { id: 2, label: '总 数:', value: '1280', icon: null },
  { id: 3, label: '随图设置 异常数:', value: '3', icon: null },
  { id: 4, label: '雨水井链接 异常数:', value: '3', icon: null }
])
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>
