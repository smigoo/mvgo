<template>
  <div data-section-id="565:2" class="c-aiot-dpjh-bsjd-header-row" style="display:flex;flex-direction:row;align-items:center;">
    <!-- 左侧：标题装饰线 + 标题 + 图标 -->
    
    <!-- 右侧：地区下拉 + 关闭 -->
    <div class="c-aiot-dpjh-bsjd-header-right">
      <div class="c-aiot-dpjh-bsjd-header-select">
        <span class="c-aiot-dpjh-bsjd-header-select-text">全国</span>
        
      </div>
      <img :src="icon3" class="c-aiot-dpjh-bsjd-header-close" alt="关闭" />
    </div>
  </div>
</template>

<script setup>
import icon3 from '../../resources/images/标题-线-5891.png'

</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-aiot-dpjh-bsjd-header-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 100%;

  .c-aiot-dpjh-bsjd-header-left {
    display: flex;
    flex-direction: row;
    align-items: center;
    flex-shrink: 0;
  }

  .c-aiot-dpjh-bsjd-header-logo {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    object-fit: contain;
  display: flex;}

  .c-aiot-dpjh-bsjd-header-title {
    margin-left: 6px;
    font-size: calc(var(--fontSize, 14px) * 1.286);
    color: @color-title-accent;
    white-space: nowrap;
    flex-shrink: 0;
    font-weight: @fontWeightStrong;
  display: flex;}

  .c-aiot-dpjh-bsjd-header-line {
    width: 470px;
    height: 2px;
    margin-left: 10px;
    flex-shrink: 0;
    object-fit: contain;
  display: flex;}

  .c-aiot-dpjh-bsjd-header-right {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .c-aiot-dpjh-bsjd-header-select {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    cursor: pointer;

    .c-aiot-dpjh-bsjd-header-select-text {
      font-size: calc(var(--fontSize, 14px) * 0.857);
      color: @color-text-secondary;
      white-space: nowrap;
    }

    .c-aiot-dpjh-bsjd-header-select-arrow {
      width: 0;
      height: 0;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-top: 5px solid @color-text-secondary;
    }
  }

  .c-aiot-dpjh-bsjd-header-close {
    width: 10px;
    height: 10px;
    flex-shrink: 0;
    object-fit: contain;
    cursor: pointer;
  display: flex;}
}
</style>