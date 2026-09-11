<template>
  <div class="c-mc-max-1788056145870-6e65dc88-c-env-monitor-header-tabs" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '295px 27px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
    <!-- Tab 容器，带背景图 -->
    <div
      class="c-mc-max-1788056145870-6e65dc88-c-env-monitor-tabs-container"
      :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
    >
      <!-- Tab 项列表 -->
      <div
        v-for="tab in tabs"
        :key="tab.value"
        class="c-mc-max-1788056145870-6e65dc88-c-env-monitor-tab-item"
        :class="{ 'c-env-monitor-tab-item-active': activeTab === tab.value }"
        @click="handleTabClick(tab.value)"
      >
        <!-- Tab 激活态背景 -->
        <div
          v-if="activeTab === tab.value"
          class="c-mc-max-1788056145870-6e65dc88-c-env-monitor-tab-bg"
          :style="{ backgroundImage: `url(${bgtabActive})`, backgroundSize: '100% 100%', backgroundPosition: 'center center', backgroundRepeat: 'no-repeat' }"
        />
        <!-- Tab 文字 -->
        <span class="c-mc-max-1788056145870-6e65dc88-c-env-monitor-tab-text">{{ tab.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg2 from '../../resources/images/bg-7890.png'
import bgtabActive from '../../resources/images/bg-tab-active-7891.png'

import { defineProps, defineEmits} from 'vue'

// 资源变量（系统自动注入）

// Props
const props = defineProps({
  tabs: {
    type: Array,
    required: true,
    default: () => []
  },
  activeTab: {
    type: String,
    required: true,
    default: ''
  }
})

// Emits
const emit = defineEmits(['change'])

// Tab 点击处理
const handleTabClick = (value) => {
  if (value === props.activeTab) return
  emit('change', value)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>