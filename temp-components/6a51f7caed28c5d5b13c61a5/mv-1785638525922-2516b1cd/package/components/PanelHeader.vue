<template>
  <div class="panel-header">
    <!-- 左侧标题与装饰区 -->
    <div class="panel-header__left">
      <img :src="icon1" class="panel-header__dot" alt="" />
      <span class="panel-header__title">设备监测</span>
      <div class="panel-header__line"></div>
      <span class="panel-header__subtitle">*数据实时更新</span>
    </div>

    <!-- 右侧统计与操作区 -->
    <div class="panel-header__right">
      <div class="panel-header__stat">
        <span class="panel-header__stat-label">设备类型</span>
        <span class="panel-header__stat-value panel-header__stat-value--blue">{{ deviceTypeCount }}</span>
      </div>
      <div class="panel-header__stat">
        <span class="panel-header__stat-label">设备总数</span>
        <span class="panel-header__stat-value panel-header__stat-value--blue">{{ deviceTotalCount }}</span>
      </div>
      <div class="panel-header__stat">
        <span class="panel-header__stat-label">完好率</span>
        <span class="panel-header__stat-value panel-header__stat-value--green">{{ integrityRate }}</span>
      </div>
      <img :src="icon2" class="panel-header__icon" alt="刷新" @click="emit('refresh')" />
    </div>
  </div>
</template>

<script setup>
// 面板头部组件
// 功能：展示面板标题、实时数据提示、设备统计概览及刷新操作
// 交互：点击右侧图标触发刷新事件

// #region 1. Props 定义
const props = defineProps({
  // 设备类型数量
  deviceTypeCount: { type: String, default: '28' },
  // 设备总数
  deviceTotalCount: { type: String, default: '68562' },
  // 完好率
  integrityRate: { type: String, default: '98%' },
  // 标题前装饰圆点图标
  icon1: { type: String, default: '' },
  // 右侧刷新操作图标
  icon2: { type: String, default: '' }
})
// #endregion

// #region 2. Emits 定义
const emit = defineEmits(['refresh'])
// #endregion
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

// 面板头部容器：横向布局，两端对齐
.panel-header {
  width: 100%;
  height: 30px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  position: relative;
  border-bottom: 1px solid rgba(25, 144, 255, 0.15);

  // 左侧标题与装饰区
  &__left {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }

  // 标题前的小圆点装饰
  &__dot {
    width: 8px;
    height: 8px;
    flex-shrink: 0;
    object-fit: contain;
  }

  // 主标题：渐变文字
  &__title {
    font-family: 'Noto Sans SC', sans-serif;
    font-size: 16px;
    font-weight: 700;
    line-height: 19px;
    background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    color: transparent;
  }

  // 标题右侧的渐变装饰条
  &__line {
    width: 120px;
    height: 6px;
    background: linear-gradient(90deg, #559eff 0%, rgba(85, 158, 255, 0.1) 100%);
    border-radius: 3px;
  }

  // 副标题提示文字
  &__subtitle {
    font-family: 'Source Han Sans CN', sans-serif;
    font-size: 12px;
    font-weight: 400;
    line-height: 21px;
    background: linear-gradient(90deg, #1990ff 0%, #5a7eff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    color: transparent;
  }

  // 右侧统计与操作区
  &__right {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 16px;
  }

  // 统计项容器
  &__stat {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 1px;

    // 统计项标签
    &-label {
      font-family: 'Source Han Sans CN', sans-serif;
      font-size: 14px;
      font-weight: 400;
      line-height: 21px;
      color: #333333;
    }

    // 统计项数值基础样式
    &-value {
      font-family: 'Roboto', sans-serif;
      font-size: 20px;
      font-weight: 700;
      line-height: 23px;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      color: transparent;

      // 蓝色渐变数值（设备类型、设备总数）
      &--blue {
        background: linear-gradient(180deg, #e1f0ff 0%, #00ccff 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      // 绿色渐变数值（完好率）
      &--green {
        background: linear-gradient(180deg, #e1f0ff 0%, #08a3a5 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
    }
  }

  // 右侧刷新图标
  &__icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    object-fit: contain;
    cursor: pointer;
    transition: transform 0.3s ease;

    &:hover {
      transform: rotate(180deg);
    }
  }
}</style>