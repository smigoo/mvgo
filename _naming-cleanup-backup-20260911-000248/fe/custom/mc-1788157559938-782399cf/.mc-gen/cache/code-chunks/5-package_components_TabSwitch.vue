<template>
  <div class="c-env-monitor-tab-switch">
    <div class="c-env-monitor-tabs-list">
      <div
        v-for="tab in tabs"
        :key="tab.value"
        class="c-env-monitor-tab-item"
        :class="{ 'c-env-monitor-tab-item-active': activeTab === tab.value }"
        :style="activeTab === tab.value ? { backgroundImage: `url(${bgtabActive})` } : {}"
        @click="handleTabChange(tab.value)"
      >
        {{ tab.label }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 指标切换标签（文字取自设计稿文字清单：一氧化碳/洞内照明/洞外光强/能见度）
const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' },
  { label: '能见度', value: 'visibility' }
])

// 当前激活标签（默认选中第一个）
const activeTab = ref('co')

// 向外发布切换事件，供图表区响应数据更新
const emit = defineEmits(['tab-change'])

const handleTabChange = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
  emit('tab-change', value)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
// === 指标切换 tabs 区 ===
.c-env-monitor-tab-switch {
  width: 100%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

// tabs 列表容器：Figma 渐变填充 #b5deff → #d1ecff（GRADIENT_LINEAR → CSS 渐变）
.c-env-monitor-tabs-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  height: 27px;
  padding: 3px;
  box-sizing: border-box;
  background: linear-gradient(90deg, #b5deff 0%, #d1ecff 100%);
  border-radius: 4px;
}

// 单个 tab：均分宽度，禁止换行挤压
.c-env-monitor-tab-item {
  flex: 1;
  flex-shrink: 0;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  font-size: @fontSize; // Figma 14px（基准字号变量）
  font-weight: 500;
  line-height: 21px;
  color: #2c9bea; // Figma fills 未激活态文字色
  border-radius: 3px;
  transition: color 0.2s;
}

// 激活态：使用下载的激活背景图（bg-tab-active），白色文字 + 蓝色投影
.c-env-monitor-tab-item-active {
  color: #ffffff; // Figma fills #ffffff
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1); // Figma DROP_SHADOW
}
</style>
