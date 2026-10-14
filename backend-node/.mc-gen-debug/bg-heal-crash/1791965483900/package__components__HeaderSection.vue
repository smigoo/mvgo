<template>
  <!-- 顶部标题区：徽标 + 标题文字 + 全国筛选 + 关闭按钮（横向排列） -->
  <div class="c-aiot-dpjh-bsjd-header">
    <!-- 标题左侧装饰图标（Group 11，20×20） -->
    <img class="c-aiot-dpjh-bsjd-header-badge" :src="icon1" alt="节点概览图标" style="width:20px;height:20px;object-fit:contain" />

    <!-- 标题文字（部署节点概览） -->
    <span class="c-aiot-dpjh-bsjd-header-title">部署节点概览</span>

    <!-- 标题右侧：全国筛选（常驻收起态下拉） -->
    <div class="c-aiot-dpjh-bsjd-header-filter">
      <span class="c-aiot-dpjh-bsjd-header-filter-text">全国</span>
      <span class="c-aiot-dpjh-bsjd-header-filter-arrow" aria-hidden="true"></span>
    </div>

    <!-- 关闭图标（10×10 装饰微元素） -->
    <img class="c-aiot-dpjh-bsjd-header-close" :src="icon2" alt="关闭" style="width:10px;height:10px;object-fit:contain" />
  </div>
</template>

<script setup>
import icon1 from '../../resources/images/Group_11-5897.png'
import icon2 from '../../resources/images/icon-关闭-5903.png'


// 顶部标题区：无业务数据，纯展示；资源变量由系统注入（icon1 / icon2）
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

.c-aiot-dpjh-bsjd-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  flex-shrink: 0;

  .c-aiot-dpjh-bsjd-header-badge {
    display: block;
    width: 20px;
    height: 20px;
    margin-right: 8px;
    flex-shrink: 0;
  }

  .c-aiot-dpjh-bsjd-header-title {
    font-size: @fontSize;
    font-weight: @fontWeightStrong;
    color: @color-primary;
    line-height: 1.4;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .c-aiot-dpjh-bsjd-header-filter {
    display: flex;
    flex-direction: row;
    align-items: center;
    margin-left: 12px;
    flex-shrink: 0;

    .c-aiot-dpjh-bsjd-header-filter-text {
      font-size: @fontSize;
      color: @color-text-secondary;
      line-height: 1.4;
      white-space: nowrap;
    }

    .c-aiot-dpjh-bsjd-header-filter-arrow {
      display: inline-block;
      width: 0;
      height: 0;
      margin-left: 4px;
      border-left: 3px solid transparent;
      border-right: 3px solid transparent;
      border-top: 4px solid @color-text-secondary;
    }
  }

  .c-aiot-dpjh-bsjd-header-close {
    display: block;
    width: 10px;
    height: 10px;
    margin-left: auto;
    flex-shrink: 0;
  }
}
</style>