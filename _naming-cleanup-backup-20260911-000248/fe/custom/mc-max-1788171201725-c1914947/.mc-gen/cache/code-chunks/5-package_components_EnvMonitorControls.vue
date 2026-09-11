<template>
  <div class="c-env-monitor-controls">
    <!-- 监测指标 Tab（渐变底容器 + 4 个可切换标签，激活态使用状态背景图 bg2） -->
    <div class="c-env-monitor-tabs">
      <div
        v-for="tab in tabs"
        :key="tab.value"
        class="c-env-monitor-tab-item"
        :class="{ 'c-env-monitor-tab-item-active': tab.value === activeTab }"
        :style="
          tab.value === activeTab
            ? {
                backgroundImage: `url(${bg2})`,
                backgroundSize: '100% 100%',
                backgroundPosition: 'center center',
                backgroundRepeat: 'no-repeat'
              }
            : null
        "
        @click="handleTabClick(tab.value)"
      >
        {{ tab.label }}
      </div>
    </div>

    <!-- 视图切换图标：图表视图 / 列表视图（列表视图带角标） -->
    <div class="c-env-monitor-view-icons">
      <div
        class="c-env-monitor-view-icon"
        :class="{ 'c-env-monitor-view-icon-active': activeView === 'chart' }"
        title="图表视图"
        @click="handleViewClick('chart')"
      >
        <img :src="icon1" alt="图表视图" class="c-env-monitor-view-icon-img" />
      </div>
      <div
        class="c-env-monitor-view-icon"
        :class="{ 'c-env-monitor-view-icon-active': activeView === 'list' }"
        title="列表视图"
        @click="handleViewClick('list')"
      >
        <img :src="icon2" alt="列表视图" class="c-env-monitor-view-icon-img" />
        <span v-if="Number(viewBadge) > 0" class="c-env-monitor-view-badge">{{ viewBadge }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
// === 子组件：指标切换与工具栏（监测指标 Tab + 视图切换图标） ===
const props = defineProps({
  // 监测指标 Tab 列表
  tabs: { type: Array, default: () => [] },
  // 当前激活的监测指标
  activeTab: { type: String, default: '' },
  // 当前激活的视图（chart / list）
  activeView: { type: String, default: 'chart' },
  // 列表视图角标数字
  viewBadge: { type: [Number, String], default: 0 }
})

const emit = defineEmits(['tab-change', 'view-change'])

// Tab 点击 → 通知父组件切换指标（父组件负责联动图表数据）
const handleTabClick = (value) => {
  emit('tab-change', value)
}

// 视图图标点击 → 通知父组件切换视图
const handleViewClick = (view) => {
  emit('view-change', view)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
// === 控件区根容器：横向排列，左侧 Tab 弹性、右侧图标固定 ===
.c-env-monitor-controls {
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
}
// === 监测指标 Tab 容器（渐变底，取自 Figma tabs-list 填充 #b5deff → #d1ecff） ===
.c-env-monitor-tabs {
  flex: 1;
  min-width: 0;
  height: 27px;
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 3px;
  box-sizing: border-box;
  border-radius: 4px;
  background: linear-gradient(90deg, #b5deff 0%, #d1ecff 100%);
  overflow: hidden;
}
// === 单个 Tab（等宽均分，防挤压换行） ===
.c-env-monitor-tab-item {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  flex-shrink: 0;
  cursor: pointer;
  font-size: @fontSize;
  font-weight: 500;
  color: #2c9bea; // Figma 非激活态文字色
  border-radius: 4px;
  transition: color 0.3s;
}
// === 激活态 Tab（白字 + 蓝色投影，背景图由 :style 绑定 bg2） ===
.c-env-monitor-tab-item-active {
  color: #ffffff;
  // Figma DROP_SHADOW offset(0,0.6) radius0 rgba(0,111,227,1)
  text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
}
// === 视图切换图标组（固定宽度，不参与弹性分配） ===
.c-env-monitor-view-icons {
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
}
// === 图标按钮容器（Figma icon 24×24） ===
.c-env-monitor-view-icon {
  position: relative;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
// === 图标图片（Figma 内部矢量 18×18） ===
.c-env-monitor-view-icon-img {
  width: 18px;
  height: 18px;
  display: block;
}
// === 列表视图角标（Figma num 14×14，圆角 29，红底白字） ===
.c-env-monitor-view-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 14px;
  height: 14px;
  padding: 0 2px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 29px;
  background: #f53f3f;
  color: #ffffff;
  font-size: calc(@fontSize * 0.86);
  font-weight: 500;
  line-height: 1;
}
</style>