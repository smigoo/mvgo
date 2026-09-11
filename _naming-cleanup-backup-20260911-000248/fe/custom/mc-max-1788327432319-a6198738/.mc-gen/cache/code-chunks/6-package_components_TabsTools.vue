<template>
  <div class="c-env-monitor-tabs-tools">
    <div class="c-env-monitor-tab-list">
      <div 
        class="c-env-monitor-tab-active-bg" 
        :style="{ 
          backgroundImage: `url(${bg2})`,
          backgroundSize: '100% 100%',
          backgroundPosition: 'center center',
          backgroundRepeat: 'no-repeat',
          left: activeTabLeft + 'px',
          width: activeTabWidth + 'px'
        }"
      ></div>
      <div 
        v-for="(tab, index) in tabs" 
        :key="tab.value"
        :ref="el => setTabRef(el, index)"
        :class="['c-env-monitor-tab-item', { 'is-active': activeTab === tab.value }]"
        @click="handleTabClick(tab.value)"
      >
        {{ tab.label }}
      </div>
    </div>

    <div class="c-env-monitor-tool-icons">
      <div class="c-env-monitor-icon-wrapper">
        <img :src="icon1" class="c-env-monitor-icon" alt="柱状图视图" />
      </div>
      <div class="c-env-monitor-icon-wrapper">
        <img :src="icon2" class="c-env-monitor-icon" alt="列表视图" />
        <span class="c-env-monitor-badge">6</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, onBeforeUnmount } from 'vue'

const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

const emit = defineEmits(['tab-change'])

const tabs = ref([
  { label: '一氧化碳', value: 'co' },
  { label: '能见度', value: 'visibility' },
  { label: '洞内照明', value: 'lighting' },
  { label: '洞外光强', value: 'outdoor' }
])

const activeTab = ref('co')
const tabRefs = ref([])
const activeTabLeft = ref(0)
const activeTabWidth = ref(0)

const setTabRef = (el, index) => {
  if (el) {
    tabRefs.value[index] = el
  }
}

const updateActiveBg = () => {
  const index = tabs.value.findIndex(t => t.value === activeTab.value)
  if (index !== -1 && tabRefs.value[index]) {
    const el = tabRefs.value[index]
    activeTabLeft.value = el.offsetLeft
    activeTabWidth.value = el.offsetWidth
  }
}

const handleTabClick = (value) => {
  if (activeTab.value === value) return
  activeTab.value = value
  emit('tab-change', value)
  nextTick(updateActiveBg)
}

let resizeObserver = null

onMounted(() => {
  updateActiveBg()
  resizeObserver = new ResizeObserver(() => {
    updateActiveBg()
  })
  if (tabRefs.value[0] && tabRefs.value[0].parentElement) {
    resizeObserver.observe(tabRefs.value[0].parentElement)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-tabs-tools {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 32px;
  flex-shrink: 0;
}

.c-env-monitor-tab-list {
  position: relative;
  display: flex;
  align-items: center;
  height: 27px;
  padding: 3px;
  background: linear-gradient(180deg, #b5deff 0%, #d1ecff 100%);
  border: 0.72px solid rgba(255, 255, 255, 1);
  border-radius: 4px;
  box-sizing: border-box;
}

.c-env-monitor-tab-active-bg {
  position: absolute;
  top: 3px;
  height: 21px;
  border-radius: 2px;
  transition: left 0.3s ease, width 0.3s ease;
  z-index: 1;
}

.c-env-monitor-tab-item {
  position: relative;
  z-index: 2;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 21px;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: @fontSize;
  font-weight: 500;
  color: #2c9bea;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.3s;

  &.is-active {
    color: #ffffff;
    text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
  }
}

.c-env-monitor-tool-icons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.c-env-monitor-icon-wrapper {
  position: relative;
  width: 24px;
  height: 24px;
  cursor: pointer;
}

.c-env-monitor-icon {
  width: 24px;
  height: 24px;
  display: block;
}

.c-env-monitor-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 14px;
  height: 14px;
  background: #f53f3f;
  border-radius: 29px;
  color: #ffffff;
  font-size: calc(@fontSize * 0.857);
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
</style>