<template>
  <div class="c-ff0ff1-metrics-wrapper">
    <!-- Tab 列表区域 -->
    <div class="c-ff0ff1-tabs-list">
      <!-- 列表背景 -->
      <div class="c-ff0ff1-tabs-bg"></div>
      <!-- 激活态背景 -->
      <div 
        class="c-ff0ff1-tab-active-bg" 
        :style="{ 
          left: activeTabLeft + 'px', 
          width: activeTabWidth + 'px' 
        }"
      ></div>
      <!-- Tab 项 -->
      <div 
        v-for="(tab, index) in tabs" 
        :key="tab.key"
        :ref="el => { if (el) tabRefs[index] = el }"
        :class="['c-ff0ff1-tab-item', { 'c-ff0ff1-tab-item--active': activeTab === tab.key }]"
        @click="handleTabChange(tab.key, index)"
      >
        {{ tab.label }}
      </div>
    </div>

    <!-- 右侧操作图标与角标 -->
    <div class="c-ff0ff1-tabs-actions">
      <img :src="icontabsIcon" class="c-ff0ff1-tabs-icon-img" alt="操作图标" />
      <!-- 角标 -->
      <div class="c-ff0ff1-tabs-badge">
        <span>6</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'

// --- 事件定义 ---
const emit = defineEmits(['tabChange'])

// --- 响应式状态 ---
const tabs = ref([
  { key: 'co', label: '一氧化碳' },
  { key: 'visibility', label: '能见度' },
  { key: 'indoor', label: '洞内照明' },
  { key: 'outdoor', label: '洞外光强' }
])

const activeTab = ref('co')
const activeTabLeft = ref(0)
const activeTabWidth = ref(0)
const tabRefs = ref([])

// --- 交互逻辑 ---
const handleTabChange = (key, index) => {
  if (activeTab.value === key) return
  activeTab.value = key
  updateActiveTabPosition(index)
  emit('tabChange', key)
}

const updateActiveTabPosition = (index) => {
  const el = tabRefs.value[index]
  if (el) {
    activeTabLeft.value = el.offsetLeft
    activeTabWidth.value = el.offsetWidth
  }
}

// --- 生命周期 ---
onMounted(() => {
  nextTick(() => {
    updateActiveTabPosition(0)
  })
})
</script>