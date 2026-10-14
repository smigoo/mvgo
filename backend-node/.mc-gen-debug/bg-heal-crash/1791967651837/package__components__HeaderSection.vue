<template>
  <div data-section-id="565:2" class="c-aiot-dpjh-bsjd-header" style="display:flex;flex-direction:row;align-items:center;">
    <!-- 标题装饰（标题-线 470×2 图片资源） -->

    <!-- Group 11 图标（20×20） -->

    <!-- 标题文字「部署节点概览」 -->
<!-- 🎯 面板标题由 base-panel 外壳渲染，标题元素已程序化移除 -->

    <!-- 全国筛选（下拉收起态） -->
    <div class="c-aiot-dpjh-bsjd-header-region">
      <span class="c-aiot-dpjh-bsjd-header-region-text">全国</span>
      
    </div>

    <!-- 关闭按钮（icon-关闭 10×10） -->
    <img :src="icon2" alt="关闭" title="关闭" class="c-aiot-dpjh-bsjd-header-close" style="width:10px;height:10px;object-fit:contain" />
  </div>
</template>

<script setup>
import icon2 from '../../resources/images/icon-关闭-5903.png'

</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';

/* header 区（水平排列，从上到下真值：装饰线 → 图标 → 标题 → 全国 → 关闭） */
.c-aiot-dpjh-bsjd-header {  display: flex;
  flex-direction: row;
  width: 100%;

  min-height: 0;
}
</style>