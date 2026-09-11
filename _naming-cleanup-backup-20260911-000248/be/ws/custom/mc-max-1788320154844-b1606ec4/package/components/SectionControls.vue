<template>
  <div class="c-env-monitor-section-controls">
    <!-- Tab 切换区 -->
    <div class="c-env-monitor-tab-list" :style="{ backgroundImage: 'url(' + bg1 + ')', backgroundSize: '100% 100%', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
      <div
        v-for="tab in tabs"
        :key="tab.value"
        class="c-env-monitor-tab-item"
        :class="{'is-active': currentTab === tab.value }"
        :style="tabItemStyle(tab)"
        @click="handleTabClick(tab)"
      >
        <span class="c-env-monitor-tab-label">{{ tab.label }}</span>
      </div>
    </div>

    <!-- 工具图标区 -->
    <div class="c-env-monitor-tool-icons">
      <div class="c-env-monitor-icon-btn" title="图表视图" aria-label="图表视图">
        <img :src="icon1" alt="图表视图" class="c-env-monitor-icon-img" />
      </div>
      <div class="c-env-monitor-icon-btn c-env-monitor-icon-btn--badge" title="列表视图" aria-label="列表视图">
        <img :src="icon2" alt="列表视图" class="c-env-monitor-icon-img" />
        <span class="c-env-monitor-badge">6</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-7890.png'
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'
import bg2 from '../../resources/images/bg-tab-active-7891.png'


// 资源变量 icon1 / icon2 / bg2 由系统自动注入，禁止手写 import
// 父组件可通过 v-model:activeTab 或监听 tab-change 事件获取切换状态
const props = defineProps({
  activeTab: {
    type: String,
    default: '一氧化碳'
  }
})
const emit = defineEmits(['update:activeTab', 'tab-change'])

const tabs = [
  { label: '一氧化碳', value: '一氧化碳' },
  { label: '能见度', value: '能见度' },
  { label: '洞内照明', value: '洞内照明' },
  { label: '洞外光强', value: '洞外光强' }
]

// 当前激活 tab：优先使用 props.activeTab，若父组件未绑定则内部维护
const currentTab = ref(props.activeTab)

watch(() => props.activeTab, (newVal) => {
  if (newVal !== currentTab.value) {
    currentTab.value = newVal
  }
})

const handleTabClick = (tab) => {
  if (currentTab.value === tab.value) return
  currentTab.value = tab.value
  emit('update:activeTab', tab.value)
  emit('tab-change', tab.value)
}

// 激活项使用 bg2 背景图（Figma: 渐变 #1099b1 -> #038fff 的图片资源）
const tabItemStyle = (tab) => {
  if (tab.value !== currentTab.value) return {}
  return {
    backgroundImage: `url(${bg2})`,
    backgroundSize: '100% 100%',
    backgroundPosition: 'center center',
    backgroundRepeat: 'no-repeat'
  }
}
</script>

<style lang="less" scoped>
@fontSize: 0px;

@import '../../resources/styles/index.less';

.c-env-monitor-section-controls {
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
  flex-shrink: 0;
}

/* Tab 列表容器：Figma 尺寸 295 x 27，渐变背景 + 白色描边 */
.c-env-monitor-tab-list {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 27px;
  padding: 0 3px;
  flex-shrink: 0;
  max-width: 295px;
}

/* Tab 单项 */
.c-env-monitor-tab-item {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 21px;
  padding: 0 10px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  user-select: none;
  transition: all 0.2s;
}

/* 激活态的详情样式 */
.c-env-monitor-tab-item.is-active {
  /* 背景图由 :style 动态绑定（bg2） */
}

.c-env-monitor-tab-label {
  font-size: @fontSize; /* Figma: font-size 14px */;
  font-weight: 500;
  line-height: 1;
  color: #2c9bea; /* Figma: SOLID #2c9bea */;
  font-family: 'Source Han Sans CN', 'Noto Sans SC', sans-serif;
}

.c-env-monitor-tab-item.is-active .c-env-monitor-tab-label {
  color: #ffffff; /* Figma: 激活文字白色 */;
  text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1); /* Figma: DROP_SHADOW */;
}

/* 工具图标区 */
.c-env-monitor-tool-icons {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.c-env-monitor-icon-btn {
  position: relative;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.c-env-monitor-icon-img {
  width: 24px;
  height: 24px;
  display: block;
}

/* Badge 数字 6 */
.c-env-monitor-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  width: 14px;
  height: 14px;
  background: #f53f3f; /* Figma: SOLID #f53f3f */;
  border-radius: 50%;
  color: #ffffff;
  font-size: calc(@fontSize * 0.8571); /* Figma: font-size 12px */;
  font-weight: 500;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'PingFang SC', 'Source Han Sans CN', sans-serif;
  pointer-events: none;
}
</style>