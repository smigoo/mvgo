<template>
  <div class="c-6dddd6-header">
    <span class="c-6dddd6-header-title">新增产品</span>
    <div class="c-6dddd6-header-close">
      <img :src="icon1" class="c-6dddd6-header-close-icon" alt="关闭" style="width:18px;height:18px;object-fit:contain" />
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/Frame-797.png'


// 资源变量由系统自动注入（icon1）
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-6dddd6-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 27px;
  box-sizing: border-box;
}

.c-6dddd6-header-title {
  font-size: @fontSizeLg;
  font-weight: @fontWeightStrong;
  color: @color-text-base;
  white-space: nowrap;
  flex-shrink: 0;
  line-height: 1;
}

.c-6dddd6-header-close {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  cursor: pointer;
}

.c-6dddd6-header-close-icon {
  width: 18px;
  height: 18px;
  display: block;
}
</style>
