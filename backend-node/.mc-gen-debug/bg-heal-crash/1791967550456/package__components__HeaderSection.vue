<template>
  <div class="c-aiot-dpjh-bsjd-header-row">
    <!-- 左侧：标题装饰线 + 标题 + 图标 -->
    <div class="c-aiot-dpjh-bsjd-header-left">
      <img :src="icon1" class="c-aiot-dpjh-bsjd-header-logo" alt="部署节点概览" style="width:20px;height:20px;object-fit:contain" />
      <span class="c-aiot-dpjh-bsjd-header-title">部署节点概览</span>
      <img :src="icon2" class="c-aiot-dpjh-bsjd-header-line" alt="" style="width:10px;height:10px;object-fit:contain" />
    </div>
    <!-- 右侧：地区下拉 + 关闭 -->
    <div class="c-aiot-dpjh-bsjd-header-right">
      <div class="c-aiot-dpjh-bsjd-header-select">
        <span class="c-aiot-dpjh-bsjd-header-select-text">全国</span>
        <span class="c-aiot-dpjh-bsjd-header-select-arrow"></span>
      </div>
      <img :src="icon3" class="c-aiot-dpjh-bsjd-header-close" alt="关闭" />
    </div>
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/Group_11-5897.png'
import icon2 from '../../resources/images/icon-关闭-5903.png'
import icon3 from '../../resources/images/标题-线-5891.png'


// 资源变量由系统自动注入（icon1: Group 11 / icon2: 标题-线 / icon3: icon-关闭）
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
  }

  .c-aiot-dpjh-bsjd-header-title {
    margin-left: 6px;
    font-size: calc(@fontSize * 1.286);
    color: @color-title-accent;
    white-space: nowrap;
    flex-shrink: 0;
    font-weight: @fontWeightStrong;
  }

  .c-aiot-dpjh-bsjd-header-line {
    width: 470px;
    height: 2px;
    margin-left: 10px;
    flex-shrink: 0;
    object-fit: contain;
  }

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
      font-size: calc(@fontSize * 0.857);
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
  }
}
</style>