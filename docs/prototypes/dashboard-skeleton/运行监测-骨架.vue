<template>
  <div class="dashboard">
    <!-- ===== 顶部 Header：标题 + 天气 + 工具按钮 ===== -->
    <header class="dashboard-header">
      <div class="dh-title">运行监测</div>
      <div class="dh-weather">晴转多云 26°C · 日期时间</div>
      <div class="dh-tools">主页 / 应用中心 / 全屏 / 管理员 / 退出 / 2D / 高精</div>
    </header>

    <!-- ===== 主体：地图压底 + 侧栏浮层 ===== -->
    <div class="dashboard-body">
      <!-- 地图层：压在底部（背景层），不实现仅占位 -->
      <div class="map-layer">
        <div class="placeholder-map">地图区域（不实现，仅占位）</div>
      </div>

      <!-- 浮层：左右侧栏浮于地图之上 -->
      <div class="sidebars">
        <!-- 左侧栏：流量监测（约 5 个面板，高度按视觉比例估算） -->
        <aside class="sidebar left">
          <!-- 组件1：当日总流量（数字卡片，约 15%） -->
          <section class="panel" style="height:15%">
            <h3 class="panel-title">当日总流量</h3>
            <p class="panel-note">江阴靖江长江隧道 34,620 / 江阴大桥 82,379</p>
          </section>
          <!-- 组件2：24小时流量趋势（折线+柱状组合图，约 25%） -->
          <section class="panel" style="height:25%">
            <h3 class="panel-title">24小时流量趋势</h3>
          </section>
          <!-- 组件3：车型分布（饼图/环形图，约 20%） -->
          <section class="panel" style="height:20%">
            <h3 class="panel-title">车型分布</h3>
          </section>
          <!-- 组件4：流量预测（实际vs预测 面积图，约 20%） -->
          <section class="panel" style="height:20%">
            <h3 class="panel-title">流量预测</h3>
          </section>
          <!-- 组件5：重点车辆监测（数字卡片，约 20%） -->
          <section class="panel" style="height:20%">
            <h3 class="panel-title">重点车辆监测</h3>
            <p class="panel-note">危化品车 / 重型货车 / 超限车辆</p>
          </section>
        </aside>

        <!-- 右侧栏：监测面板（约 3 个面板，高度按视觉比例估算） -->
        <aside class="sidebar right">
          <!-- 组件6：智能侦测（AI 事件列表，约 35%） -->
          <section class="panel" style="height:35%">
            <h3 class="panel-title">智能侦测</h3>
            <p class="panel-note">交通态势 / 协同上报 / 异常停车 ...</p>
          </section>
          <!-- 组件7：设备监测（状态网格，约 30%） -->
          <section class="panel" style="height:30%">
            <h3 class="panel-title">设备监测</h3>
            <p class="panel-note">设备总数 / 在线 / 异常</p>
          </section>
          <!-- 组件8：环境监测（多曲线，约 35%） -->
          <section class="panel" style="height:35%">
            <h3 class="panel-title">环境监测</h3>
            <p class="panel-note">一氧化碳 / 能见度 / 洞内照明 / 洞外光强</p>
          </section>
        </aside>
      </div>
    </div>

    <!-- ===== 底部 Footer（预留） ===== -->
    <footer class="dashboard-footer"></footer>
  </div>
</template>

<script setup lang="ts">
// 骨架阶段：仅布局与占位，无业务逻辑、无数据绑定
</script>

<style scoped lang="less">
.dashboard {
  display: flex; flex-direction: column; height: 100vh;
  background: linear-gradient(160deg, #eef4f6 0%, #e2edf0 100%);
  color: #1d4a5e;
}
.dashboard-header {
  height: 60px; display: flex; align-items: center; justify-content: space-between;
  padding: 0 16px; background: #dcebf0; border-bottom: 1px solid #bfd9e2; z-index: 2;
}
.dh-title { font-size: 20px; font-weight: 600; color: #143d4f; }
.dh-weather { font-size: 13px; color: #4f7484; }
.dh-tools { font-size: 13px; color: #4f7484; }
/* 主体：相对定位容器 */
.dashboard-body { flex: 1; position: relative; overflow: hidden; }
/* 地图层：压在底部（背景层） */
.map-layer { position: absolute; inset: 0; z-index: 0; padding: 8px; }
.placeholder-map {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  background: #e9f2f5; color: #7fa3b3; border: 1px dashed #a7cbdb; border-radius: 4px; font-size: 14px;
}
/* 浮层：左右侧栏浮于地图之上，中间露出地图 */
.sidebars {
  position: relative; z-index: 1; height: 100%; padding: 8px;
  display: flex; justify-content: space-between; gap: 8px; pointer-events: none;
}
.sidebar { width: 22%; display: flex; flex-direction: column; gap: 8px; pointer-events: auto; }
.panel {
  border: 1px solid #cfe0e8; border-radius: 4px; padding: 8px;
  background: rgba(255,255,255,.94); box-shadow: 0 2px 8px rgba(120,160,180,.22); overflow: hidden;
}
.panel-title { font-size: 14px; font-weight: 600; margin: 0 0 6px; color: #1d4a5e; }
.panel-note { font-size: 12px; color: #5b7a8a; margin: 0; }
.dashboard-footer { height: 30px; border-top: 1px solid #bfd9e2; background: #dcebf0; z-index: 2; }
</style>
