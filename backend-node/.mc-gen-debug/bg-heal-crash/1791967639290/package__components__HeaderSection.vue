<template>
  <div class="c-aiot-dpjh-bsjd-header">
    <!-- 标题装饰（标题-线 470×2 图片资源） -->
    <div class="c-aiot-dpjh-bsjd-header-title-img">
      <img :src="icon3" alt="" class="c-aiot-dpjh-bsjd-header-title-line" />
    </div>

    <!-- Group 11 图标（20×20） -->
    <img :src="icon1" alt="" class="c-aiot-dpjh-bsjd-group-11" style="width:20px;height:20px;object-fit:contain" />

    <!-- 标题文字「部署节点概览」 -->
    <span class="c-aiot-dpjh-bsjd-header-text">部署节点概览</span>

    <!-- 全国筛选（下拉收起态） -->
    <div class="c-aiot-dpjh-bsjd-header-region">
      <span class="c-aiot-dpjh-bsjd-header-region-text">全国</span>
      <span class="c-aiot-dpjh-bsjd-header-region-arrow" aria-hidden="true"></span>
    </div>

    <!-- 关闭按钮（icon-关闭 10×10） -->
    <img :src="icon2" alt="关闭" title="关闭" class="c-aiot-dpjh-bsjd-header-close" style="width:10px;height:10px;object-fit:contain" />
  </div>
</template>

<script setup>
import icon3 from '../../resources/images/标题-线-5891.png'
import icon1 from '../../resources/images/Group_11-5897.png'
import icon2 from '../../resources/images/icon-关闭-5903.png'


// 资源变量（icon3 / icon1 / icon2）由系统后处理自动注入，禁止手写 import
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

/* header 区（水平排列，从上到下真值：装饰线 → 图标 → 标题 → 全国 → 关闭） */
.c-aiot-dpjh-bsjd-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  height: 30px;
  min-height: 0;
  flex-shrink: 0;
  gap: 8px;
}
</style>