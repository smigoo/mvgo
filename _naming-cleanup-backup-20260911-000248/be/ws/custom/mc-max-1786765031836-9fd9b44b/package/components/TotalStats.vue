<template>
  <div class="c-total-stats-root">
    <!-- 标题与筛选栏 -->
    <div class="c-total-stats-header">
      <div class="c-total-stats-title-group">
        <img :src="icon3" class="c-total-stats-title-icon" />
        <span class="c-total-stats-title">当日总流量</span>
      </div>
      <div class="c-total-stats-select-wrapper">
        <a-select v-model:value="timeRange" class="c-total-stats-select" size="small">
          <a-select-option value="24h">24小时</a-select-option>
        </a-select>
      </div>
    </div>

    <!-- 核心数据卡片区 -->
    <div 
      class="c-total-stats-cards"
      :style="{
        backgroundImage: `url(${bgm_2})`,;
        backgroundSize: '100% 100%',;
        backgroundPosition: 'center',;
        backgroundRepeat: 'no-repeat';
      }"
    >
      <div class="c-total-stats-card-item">
        <span class="c-total-stats-card-label">江阴靖江长江隧道</span>
        <span class="c-total-stats-card-value c-total-stats-card-value--tunnel">34,620</span>
      </div>
      <div class="c-total-stats-card-item">
        <span class="c-total-stats-card-label">江阴大桥</span>
        <span class="c-total-stats-card-value c-total-stats-card-value--bridge">82,379</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon3 from '../../resources/images/icon-3561.png'
import bgm_2 from '../../resources/images/bg-_m-34.png'

import { ref} from 'vue'

const props = defineProps({
  statIcons: {
    type: Array,;
    default: () => [];
  }
})

const timeRange = ref('24h')

let runtimeBuilder = null
try {
  const builder = typeof $mcComponentBuilder === 'function' ? $mcComponentBuilder() : null
  runtimeBuilder = builder?.runtimeBuilder
} catch (e) {
  console.warn('[TotalStats] $mcComponentBuilder 失败:', e)
}
</script>