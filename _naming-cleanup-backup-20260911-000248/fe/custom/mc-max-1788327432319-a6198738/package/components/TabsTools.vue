<template>
  <div class="c-env-monitor-tabs-tools">
    <!-- 监测指标 Tab 组 -->
    <div class="c-env-monitor-tabs-list" :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
      <span
        v-for="tab in tabs"
        :key="tab.key"
        class="c-env-monitor-tab-item"
        :class="{ 'c-env-monitor-tab-item--active': activeTab === tab.label }"
        :style="activeTab === tab.label
          ? {
              backgroundImage: `url(${bg2})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat'
            }
          : null"
        @click="handleTabChange(tab)"
      >
        {{ tab.label }}
      </span>
    </div>

    <!-- 右上角视图切换图标 -->
    <div class="c-env-monitor-tool-icons">
      <button
        class="c-env-monitor-icon-btn"
        type="button"
        title="柱状图视图"
        aria-label="柱状图视图"
        @click="handleViewChange('chart')"
      >
        <img :src="icon1" alt="柱状图视图" class="c-env-monitor-icon-img" />
      </button>

      <button
        class="c-env-monitor-icon-btn"
        type="button"
        title="列表视图"
        aria-label="列表视图"
        @click="handleViewChange('list')"
      >
        <img :src="icon2" alt="列表视图" class="c-env-monitor-icon-img" />
        <span class="c-env-monitor-icon-badge">6</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-7890.png'
import bg2 from '../../resources/images/bg-tab-active-7891.png'
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'


const props = defineProps({
  activeTab: {
    type: String,
    default: '一氧化碳'
  }
})

const emit = defineEmits(['tab-change', 'view-change'])

// Tab 选项：文字必须与 Figma 设计稿保持一致
const tabs = ref([
  { label: '一氧化碳', key: 'co' },
  { label: '能见度', key: 'visibility' },
  { label: '洞内照明', key: 'lighting' },
  { label: '洞外光强', key: 'outdoor' }
])

const activeTab = ref(props.activeTab)
const currentView = ref('chart')

watch(activeTab, (newTab) => {
  // Tab 切换时发布事件，供图表区联动更新数据
  emit('tab-change', newTab)
})

watch(
  () => props.activeTab,
  (newVal) => {
    if (newVal && newVal !== activeTab.value) {
      activeTab.value = newVal
    }
  }
)

const handleTabChange = (tab) => {
  if (activeTab.value === tab.label) return
  activeTab.value = tab.label
}

const handleViewChange = (type) => {
  currentView.value = type
  emit('view-change', type)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-env-monitor-tabs-tools {
flex: 1 1 0;

  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-width: 0;
  gap: 8px;
}

.c-env-monitor-tabs-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 2px;
  min-width: 0;
  padding: 3px 4px;
  flex-shrink: 0;
}

.c-env-monitor-tab-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-width: 42px;
  height: 21px;
  padding: 0 9px;
  color: #2c9bea;
  font-family: 'Source Han Sans CN', 'Roboto', sans-serif;
  font-size: var(--fontSize, 14px);
  font-weight: 500;
  line-height: 1;
  text-align: center;
  white-space: nowrap;
  flex-shrink: 0;
  cursor: pointer;
  transition: color 0.2s;
}

/* 激活态：背景由 bg2 图片提供，不使用 CSS 背景 */
.c-env-monitor-tab-item--active {
  flex-grow: 0;
  flex-shrink: 0;
  width: 78px;
  height: 21px;
  padding: 0;
  color: #ffffff;
  text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
}

.c-env-monitor-tool-icons {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.c-env-monitor-icon-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
}

.c-env-monitor-icon-img {
  display: block;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.c-env-monitor-icon-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  background: #f53f3f;
  color: #ffffff;
  font-family: 'PingFang SC', 'Source Han Sans CN', sans-serif;
  font-size: calc(var(--fontSize, 14px) * 0.857);
  font-weight: 500;
  line-height: 14px;
  border-radius: 29px;
}
</style>