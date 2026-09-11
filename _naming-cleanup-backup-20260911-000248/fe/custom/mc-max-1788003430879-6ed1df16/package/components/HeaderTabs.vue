<template>
  <div class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-header-tabs" :style="{ backgroundImage: `url(${bg2})`, backgroundSize: '295px 27px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
    <!-- Tab 列表容器（背景图已下载为 bg2） -->
    <div class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-tabs-list" :style="{ backgroundImage: `url(${bg2})` }">
      <!-- Tab 激活态背景块（背景图已下载为 bg3） -->
      <div
        class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-tab-active-bg"
        :style="{
          backgroundImage: `url(${bg3})`,
          transform: `translateX(${activeTabIndex * 100}%)`
        }"
      />
      <!-- Tab 项（文字逐字还原设计稿清单） -->
      <div
        v-for="(tab, index) in tabs"
        :key="tab.key"
        :class="['c-env-monitor-tab-item', { active: activeKey === tab.key }]"
        @click="handleTabClick(tab.key)"
      >
        {{ tab.name }}
      </div>
    </div>

    <!-- 右侧图标按钮组 -->
    <div class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-tabs-icon">
      <!-- 图标按钮 1（柱状图视图） -->
      <div class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-icon-btn">
        <img :src="icon1" class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-icon-img" alt="柱状图视图" />
      </div>
      <!-- 图标按钮 2（列表视图） -->
      <div class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-icon-btn">
        <img :src="icon2" class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-icon-img" alt="列表视图" />
      </div>
    </div>

    <!-- 角标数字（红色圆形徽章） -->
    <div class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-badge">
      <span class="c-mc-max-1788003430879-6ed1df16-c-env-monitor-badge-num" :style="{ background: '#f53f3f' }">6</span>
    </div>
  </div>
</template>

<script setup>
import bg2 from '../../resources/images/bg-7890.png'
import bg3 from '../../resources/images/bg-tab-active-7891.png'
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'

import { ref, computed} from 'vue'

// 接收父组件传入的 tabs / activeKey
const props = defineProps({
  tabs: {
    type: Array,
    default: () => []
  },
  activeKey: {
    type: String,
    default: ''
  }
})

// 向父组件发射 tab 切换事件
const emit = defineEmits(['tab-change'])

// 当前激活 tab 的索引（用于激活态背景块平移动画）
const activeTabIndex = computed(() => {
  return props.tabs.findIndex((t) => t.key === props.activeKey)
})

// 点击 tab 项
const handleTabClick = (key) => {
  if (key === props.activeKey) return
  emit('tab-change', key)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
// === HeaderTabs 根容器 ===
.c-env-monitor-header-tabs {
height: 100%;
  width: 100%;

  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
// === Tab 列表容器（Figma 节点：tabs-list，背景图 bg2） ===
.c-env-monitor-tabs-list {
  position: relative;
  display: flex;
  align-items: center;
  height: 27px;
  padding: 0 4px;
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  overflow: hidden;
}
// === Tab 激活态背景块（Figma 节点：bg-tab-active，背景图 bg3，位置动画） ===
.c-env-monitor-tab-active-bg {
  position: absolute;
  top: 50%;
  left: 4px;
  width: 78px;
  height: 21px;
  transform: translateY(-50%);
  background-size: 100% 100%;
  background-position: center center;
  background-repeat: no-repeat;
  transition: transform 0.3s ease;
  pointer-events: none;
  z-index: 1;
}
// === Tab 项（Figma 节点：一氧化碳/能见度/洞内照明/洞外光强） ===
.c-env-monitor-tab-item {
  position: relative;
  z-index: 2;
  width: 78px;
  height: 21px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Source Han Sans CN', sans-serif;
  font-size: 14px;
  font-weight: 500;
  line-height: 12px;
  color: #2c9bea;
  cursor: pointer;
  transition: color 0.3s ease;
  white-space: nowrap;
  flex-shrink: 0;

  &.active {
    color: #ffffff;
    text-shadow: 0 0.6px 0 rgba(0, 111, 227, 1);
  }
}
// === 右侧图标按钮组 ===
.c-env-monitor-tabs-icon {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
// === 图标按钮容器（Figma 节点：icon，背景矩形+图标） ===
.c-env-monitor-icon-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #ffffff 0%, #e2f0ff 36%, #deedff 69%, #ffffff 100%);
  border: 1px solid rgba(161, 206, 255, 1);
  border-radius: 4px;
  cursor: pointer;
  transition: opacity 0.3s ease;

  &:hover {
    opacity: 0.8;
  }
}
// === 图标图片（Figma 节点：柱状图_filled 1 / 属性 列表 详情2 1） ===
.c-env-monitor-icon-img {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
// === 角标数字（Figma 节点：num，红色圆形徽章） ===
.c-env-monitor-badge {
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f53f3f;
  border-radius: 29px;
  flex-shrink: 0;
}

.c-env-monitor-badge-num {
  font-family: 'PingFang SC', sans-serif;
  font-size: 12px;
  font-weight: 500;
  line-height: 14px;
  color: #ffffff;
}
</style>