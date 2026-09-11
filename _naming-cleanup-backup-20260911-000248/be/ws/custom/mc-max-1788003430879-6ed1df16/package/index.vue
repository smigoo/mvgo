<template>
  <base-panel panelKey="default-panel">
    <!-- 顶部环境类型切换 Tab（放入 base-panel 头部右侧插槽） -->
    <template #header_right>
      <header-tabs
        :tabs="tabs"
        :active-key="activeTab"
        @tab-change="handleTabChange"
      />
    </template>

    <!-- 业务内容区：环境数据图表 -->
    <div class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-root">
      <chart-section
        class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-chart-section"
        :active-key="activeTab"
        :active-name="activeTabName"
        :business-config="config"
      />
    </div>
  </base-panel>
</template>

<script setup>
import { ref, computed, defineAsyncComponent, onMounted } from 'vue'
import declareJson from '../declare.json'
// === $mcComponentBuilder 初始化（直接解构，声明+赋值一体，只能调用一次） ===
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()
// === 异步加载 section 级子组件 ===
const HeaderTabs = defineAsyncComponent(() => import('./components/HeaderTabs.vue'))
const ChartSection = defineAsyncComponent(() => import('./components/ChartSection.vue'))
// === declare.json 默认值（同步加载，避免异步竞态） ===
const declareDefaults = {}
if (declareJson?.businessConfig && typeof declareJson.businessConfig === 'object') {
  Object.values(declareJson.businessConfig).forEach((item) => {
    if (item?.key && item.default !== undefined) {
      declareDefaults[item.key] = item.default
    }
  })
}
// === 配置读取工具 ===
function getConfig(key, defaultValue) {
  const value = businessProps?.[key]
  if (value !== undefined && value !== null) return value
  if (declareDefaults[key] !== undefined && declareDefaults[key] !== null) {
    return declareDefaults[key]
  }
  return defaultValue
}

const config = computed(() => ({
  title: getConfig('title', '环境监测'),
  showTitle: getConfig('showTitle', true),
  refreshInterval: getConfig('refreshInterval', 30)
}))
// === 环境类型 Tab（文案严格取自设计稿清单） ===
const tabs = ref([
  { key: 'co', name: '一氧化碳', unit: 'ppm' },
  { key: 'visibility', name: '能见度', unit: 'm' },
  { key: 'lighting', name: '洞内照明', unit: 'lx' },
  { key: 'outdoor', name: '洞外光强', unit: 'lx' }
])

const activeTab = ref('co')
const activeTabName = computed(
  () => tabs.value.find((t) => t.key === activeTab.value)?.name || ''
)
// === Tab 切换（切换后由子组件 watch activeKey 更新图表数据） ===
const handleTabChange = (key) => {
  if (activeTab.value === key) return
  activeTab.value = key
  const tab = tabs.value.find((t) => t.key === key)
  if (tab && runtimeBuilder) {
    runtimeBuilder.publishEvent('env-monitor-item-click', {
      itemKey: tab.key,
      itemName: tab.name
    })
  }
}
// === onload 事件 ===
const emitLoadEvent = () => {
  runtimeBuilder.publishEvent('env-monitor-onload', {
    componentId: 'env-monitor',
    timestamp: Date.now()
  })
}

onMounted(() => {
  emitLoadEvent()
})
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

// 根容器：无背景/边框/圆角/阴影（base-panel 已处理面板外壳，Figma 根容器无填充）
.c-env-monitor-root {
  width: 420px;
  height: 186px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;

  max-width: 100%;
  max-height: 100vh;
  box-sizing: border-box;}

.c-env-monitor-chart-section {
  flex: 1;
  min-height: 0;
  min-width: 0;
}
</style>