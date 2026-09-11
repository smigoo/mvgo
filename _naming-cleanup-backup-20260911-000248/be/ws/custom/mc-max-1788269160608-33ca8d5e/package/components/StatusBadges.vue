<template>
  <div class="c-monitor-status-badges">
    <div
      v-for="(badge, index) in badges"
      :key="index"
      class="c-monitor-badge-item"
      :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <div class="c-monitor-badge-icon" :style="{ backgroundImage: 'url(' + bg10 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
        <img :src="badge.icon" class="c-monitor-badge-icon-img"/>
      </div>
      <div class="c-monitor-badge-content">
        <div class="c-monitor-badge-row">
          <span class="c-monitor-badge-label" :style="{ backgroundImage: 'url(' + bg3 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">{{ badge.label }}</span>
        </div>
        <div class="c-monitor-badge-row">
          <span class="c-monitor-badge-value" :style="{ backgroundImage: 'url(' + bg4 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">{{ badge.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg11 from '../../resources/images/bg-8672.png'
import bg10 from '../../resources/images/bg-8643.png'
import bg8 from '../../resources/images/bg-8585.png'
import bg7 from '../../resources/images/bg-8556.png'
import bg4 from '../../resources/images/bg-8468.png'
import bg3 from '../../resources/images/bg-8439.png'
import bg2 from '../../resources/images/bg-8807.png'


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