<template>
  <div class="c-total-traffic-root">
    <div class="c-sub-header">
      <div class="c-sub-header-title-group">
        <img :src="icon3" class="c-sub-header-icon" />
        <span class="c-sub-header-title">当日总流量</span>
      </div>
      <a-select 
        v-model:value="timeValue" 
        class="c-total-traffic-select"
        :options="timeOptions"
      />
    </div>

    <div 
      class="c-total-traffic-body"
      :style="{ backgroundImage: `url(${bgm_2})` }"
    >
      <div class="c-total-traffic-stat">
        <span class="c-total-traffic-label">江阴靖江长江隧道</span>
        <span class="c-total-traffic-value c-total-traffic-value-tunnel">{{ tunnelValue }}</span>
      </div>

      <img :src="carIcon" class="c-total-traffic-center-icon" />

      <div class="c-total-traffic-stat c-total-traffic-stat-right">
        <span class="c-total-traffic-label">江阴大桥</span>
        <span class="c-total-traffic-value c-total-traffic-value-bridge">{{ bridgeValue }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon3 from '../../resources/images/icon-3561.png'
import bgm_2 from '../../resources/images/bg-_m-34.png'
import carIcon from '../../resources/images/g-3552.png'
import { ref } from 'vue'

const timeValue = ref('24h')
const timeOptions = ref([
  { label: '24小时', value: '24h' }
])

/* [Data Refine] 使用 Figma 中的真实数据，禁止 Math.random */
const tunnelValue = ref('34,620')
const bridgeValue = ref('82,379')
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-total-traffic-root {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.c-total-traffic-select {
  width: 100px;
}
</style>