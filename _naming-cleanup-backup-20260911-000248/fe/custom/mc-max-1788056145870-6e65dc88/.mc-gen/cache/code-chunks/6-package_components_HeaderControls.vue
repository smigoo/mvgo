<template>
  <div class="c-env-monitor-header-controls">
    <!-- 图表类型切换按钮组 -->
    <div class="c-env-monitor-chart-toggle">
      <div
        class="c-env-monitor-toggle-btn"
        :class="{ active: chartType === 'bar' }"
        @click="handleToggle('bar')"
      >
        <img :src="icon1" class="c-env-monitor-toggle-icon" alt="柱状图" />
      </div>
      <div
        class="c-env-monitor-toggle-btn"
        :class="{ active: chartType === 'area' }"
        @click="handleToggle('area')"
      >
        <img :src="icon2" class="c-env-monitor-toggle-icon" alt="列表" />
      </div>
    </div>

    <!-- 通知图标（带角标） -->
    <div class="c-env-monitor-notify-wrapper" @click="handleNotifyClick">
      <div class="c-env-monitor-notify-icon">
        <span class="c-env-monitor-notify-badge">{{ notifyCount }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue'
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'

const props = defineProps({
  chartType: {
    type: String,
    default: 'area'
  },
  notifyCount: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['toggle-chart-type', 'click-notify'])

const handleToggle = (type) => {
  if (props.chartType !== type) {
    emit('toggle-chart-type', type)
  }
}

const handleNotifyClick = () => {
  emit('click-notify')
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>
