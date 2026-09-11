<template>
  <!-- 右侧图标操作区：图表/列表视图切换图标 + 红色 badge -->
  <div class="tabs-icon-area" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '295px 27px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">
    <!-- 图表视图图标（icon1），点击切换到图表视图 -->
<div class="icon-btn" :class="{ 'icon-btn--active': activeView === 'chart' }" @click="handleViewClick('chart')" >
<img v-if="icon1" :src="icon1" class="icon-img" alt="图表视图" />
      <!-- icon1 缺失时 CSS 降级：柱状图形状 -->
      <span v-else class="icon-fallback icon-fallback--chart">&#9646;</span>
    </div>

    <!-- 列表视图图标（icon2）容器，含 badge -->
    <div class="icon-btn-wrapper">
<div class="icon-btn" :class="{ 'icon-btn--active': activeView === 'list' }" @click="handleViewClick('list')" >
<img v-if="icon2" :src="icon2" class="icon-img" alt="列表视图" />
        <!-- icon2 缺失时 CSS 降级：列表形状 -->
        <span v-else class="icon-fallback icon-fallback--list" :style="{ backgroundImage: `url(${bg1})`, backgroundSize: '295px 27px', backgroundPosition: '0px 0px', backgroundRepeat: 'no-repeat' }">&#9776;</span>
      </div>
      <!-- 红色 badge：显示告警数 6 -->
      <div class="badge">6</div>
    </div>
  </div>
</template>

<script setup>
import bg1 from '../../resources/images/bg-7890.png'
import icon1 from '../../resources/images/icon-7941.png'
import icon2 from '../../resources/images/icon-7945.png'


// 右侧图标操作区子组件（交互控件区）
// 职责：图表/列表视图切换图标渲染 + badge 数字 + 视图切换交互
// icon1/icon2 由父组件传入，资源缺失时有 CSS 降级

const props = defineProps({ // 当前视图模式 activeView: { type: String, default: 'chart' }, // 图表视图图标 icon1: { type: String, default: '' }, // 列表视图图标 icon2: { type: String, default: '' }
})

const emit = defineEmits(['view-change'])

// 点击图标切换视图
const handleViewClick = (view) => { emit('view-change', view)
}
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

// 图标操作区容器：横向排列，固定尺寸
.tabs-icon-area {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  width: 52px;
  height: 24px;
  flex-shrink: 0;
}

// 图标按钮容器（带相对定位，为 badge 定位做锚点）
.icon-btn-wrapper {
  position: relative;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

// 单个图标按钮：无额外 border/radius，图标 PNG 已内含样式
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s;
  box-sizing: border-box;

  &:hover {
    opacity: 1;
  }

  // 激活态图标高亮
  &--active {
    opacity: 1;
  }
}

// 图标图片：固定 24×24，contain 保持比例
.icon-img {
  width: 24px;
  height: 24px;
  object-fit: contain;
  display: block;
  flex-shrink: 0;
}

// 图标降级文字（资源缺失时）
.icon-fallback {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
}

// 红色数字 badge：绝对定位到图标右上角
.badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 14px;
  height: 14px;
  background: #f53f3f;
  border-radius: 50%;
  font-family: 'PingFang SC', sans-serif;
  font-size: 10px;
  font-weight: 500;
  color: #ffffff;
  text-align: center;
  line-height: 14px;
  pointer-events: none;
}
</style>