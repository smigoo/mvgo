<template>
  <div class="modal-container">
    <!-- 顶部标题栏 -->
    <div class="header">
      <div class="header-left">
        <span class="title">运单信息</span>
        <span class="tag">苏A 12345</span>
      </div>
      <div class="close-btn">✕</div>
    </div>

    <!-- 运单列表表格 -->
    <div class="table-section">
      <div class="table-header">
        <div class="col col-id">运单编号</div>
        <div class="col col-name">危化品名称</div>
        <div class="col col-loc">超运地</div>
        <div class="col col-time">实际发车时间</div>
        <div class="col col-dest">目的地</div>
        <div class="col col-eta">预计到达时间</div>
        <div class="col col-load">满载情况</div>
        <div class="col col-status">运输状态</div>
      </div>
      <div class="table-body">
        <div class="table-row active" v-for="(row, index) in tableData" :key="index">
          <div class="col col-id">{{ row.id }}</div>
          <div class="col col-name">{{ row.name }}</div>
          <div class="col col-loc">{{ row.origin }}</div>
          <div class="col col-time">{{ row.time }}</div>
          <div class="col col-dest">{{ row.dest }}</div>
          <div class="col col-eta">{{ row.eta }}</div>
          <div class="col col-load">{{ row.load }}</div>
          <div class="col col-status">{{ row.status }}</div>
        </div>
      </div>
    </div>

    <!-- 运单详情标题 -->
    <div class="detail-title">
      <span class="diamond">♦</span> 运单详情
    </div>

    <!-- 详情展示区 -->
    <div class="detail-content">
      <!-- 左侧文本信息 -->
      <div class="detail-text">
        <div class="info-grid">
          <div class="info-item">
            <span class="label">起运地</span>
            <span class="value">江苏省无锡市江阴市</span>
          </div>
          <div class="info-item">
            <span class="label">危险品名称</span>
            <span class="value">烟花</span>
          </div>
          <div class="info-item">
            <span class="label">分类名称</span>
            <span class="value">危险品(1类4项)</span>
          </div>
          <div class="info-item">
            <span class="label">目的地</span>
            <span class="value">江苏省泰州市靖江市</span>
          </div>
          <div class="info-item">
            <span class="label">运输里程</span>
            <span class="value">200(KM)</span>
          </div>
          <div class="info-item empty"></div> <!-- 占位 -->
          
          <div class="info-item">
            <span class="label">发车时间</span>
            <span class="value">2023-11-22 06:20:46</span>
          </div>
          <div class="info-item">
            <span class="label">预计到达时间</span>
            <span class="value">2023-11-22 12:04:21</span>
          </div>
          <div class="info-item">
            <span class="label">满载情况</span>
            <span class="value">满载货物</span>
          </div>
          <div class="info-item">
            <span class="label">总重量</span>
            <span class="value">9.8(吨)</span>
          </div>
          <div class="info-item">
            <span class="label">驾驶员姓名</span>
            <span class="value">张悦</span>
          </div>
          <div class="info-item">
            <span class="label">驾驶员电话</span>
            <span class="value">13955086495</span>
          </div>
          <div class="info-item full-width">
            <span class="label">备注</span>
            <span class="value">栖霞大道浦口104国道桥宁马高速路路二桥百水桥栖霞大道</span>
          </div>
        </div>
      </div>

      <!-- 右侧图片展示 -->
      <div class="detail-image">
        <div class="image-placeholder">
          <!-- 模拟截图内容 -->
          <div class="mock-img-content">
            <div class="mock-top-bar">
              <span>卡口抓拍 宁马高速K...</span>
              <span>2023年11月22日 08:27:47.057</span>
            </div>
            <div class="mock-road">
              <div class="truck red-truck">
                <div class="truck-front">苏APM32</div>
              </div>
              <div class="truck white-truck">
                <div class="truck-front">...</div>
              </div>
            </div>
            <div class="mock-bottom-text">苏APM32</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const tableData = ref([
  {
    id: '3203502388...',
    name: '烟花',
    origin: '江阴',
    time: '2023-11-22 06:20:46',
    dest: '靖江',
    eta: '--',
    load: '满载',
    status: '在途'
  },
  {
    id: '3203502388...',
    name: '硫酸',
    origin: '无锡',
    time: '2023-11-20 06:20:46',
    dest: '泰州',
    eta: '--',
    load: '满载',
    status: '在途'
  },
  {
    id: '3203502388...',
    name: '硫酸',
    origin: '江阴',
    time: '2023-11-19 06:20:46',
    dest: '靖江',
    eta: '--',
    load: '满载',
    status: '在途'
  }
]);
</script>

<style scoped>
/* 全局变量与基础重置 */
* {
  box-sizing: border-box;
}

.modal-container {
  width: 100%;
  max-width: 1200px;
  background-color: #042b2b; /* 深色背景 */
  color: #ffffff;
  font-family: "Microsoft YaHei", sans-serif;
  border: 1px solid #1a5c5c;
  border-radius: 4px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

/* 顶部标题栏 */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(to bottom, #0a4d4d, #042b2b);
  padding: 8px 15px;
  border-bottom: 1px solid #1a5c5c;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title {
  font-size: 18px;
  font-weight: bold;
  color: #fff;
}

.tag {
  background-color: #d4a017; /* 黄色标签 */
  color: #000;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: bold;
}

.close-btn {
  font-size: 20px;
  cursor: pointer;
  color: #fff;
}

/* 表格区域 */
.table-section {
  width: 100%;
  border: 1px solid #1a5c5c;
  background-color: #052626;
}

.table-header {
  display: flex;
  background-color: #0a3d3d;
  border-bottom: 1px solid #1a5c5c;
  padding: 8px 0;
}

.table-body {
  display: flex;
  flex-direction: column;
  gap: 2px; /* 行间距 */
  padding: 5px 0;
}

.table-row {
  display: flex;
  background-color: #0a3d3d;
  padding: 8px 0;
  font-size: 13px;
}

.table-row.active {
  background-color: #006666; /* 高亮行，接近 #008080 但更深一点以配合文字 */
  border: 1px solid #008080;
}

.col {
  padding: 0 10px;
  display: flex;
  align-items: center;
}

/* 列宽分配 */
.col-id { width: 12%; }
.col-name { width: 10%; }
.col-loc { width: 8%; }
.col-time { width: 18%; }
.col-dest { width: 8%; }
.col-eta { width: 14%; }
.col-load { width: 10%; }
.col-status { width: 10%; text-align: center; justify-content: center;}

.table-header .col {
  font-weight: bold;
  color: #fff;
  border-right: 1px solid rgba(255,255,255,0.1);
}
.table-header .col:last-child { border-right: none; }

/* 详情标题 */
.detail-title {
  font-size: 16px;
  font-weight: bold;
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 5px;
}

.diamond {
  font-size: 12px;
  color: #fff;
}

/* 详情内容区 */
.detail-content {
  display: flex;
  gap: 20px;
  padding: 10px 20px 20px 20px;
}

/* 左侧文本 */
.detail-text {
  flex: 1.5;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  row-gap: 15px;
  column-gap: 20px;
  font-size: 13px;
}

.info-item {
  display: flex;
  gap: 10px;
}

.info-item.full-width {
  grid-column: span 2;
}

.info-item.empty {
  visibility: hidden;
}

.label {
  color: #ccc;
  min-width: 80px;
}

.value {
  color: #fff;
}

/* 右侧图片 */
.detail-image {
  flex: 1;
  display: flex;
  justify-content: flex-end;
}

.image-placeholder {
  width: 100%;
  max-width: 380px;
  height: 220px;
  border: 2px solid #fff;
  background-color: #000;
  position: relative;
  overflow: hidden;
}

/* 模拟图片内容的 CSS 绘图 */
.mock-img-content {
  width: 100%;
  height: 100%;
  position: relative;
  background: #333; /* 路面颜色 */
  display: flex;
  flex-direction: column;
}

.mock-top-bar {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  background: rgba(0,0,0,0.5);
  color: #fff;
  font-size: 10px;
  padding: 2px 5px;
  display: flex;
  justify-content: space-between;
  z-index: 2;
}

.mock-road {
  flex: 1;
  position: relative;
  background: #444;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  padding-bottom: 20px;
  gap: 20px;
  /* 模拟车道线 */
  background-image: linear-gradient(90deg, transparent 49%, #fff 49%, #fff 51%, transparent 51%);
  background-size: 100% 100%;
}

/* 简单的卡车模拟 */
.truck {
  width: 60px;
  height: 100px;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: flex-end;
}

.red-truck {
  background: #a33;
  border-radius: 4px 4px 0 0;
  box-shadow: 0 0 5px rgba(0,0,0,0.5);
}

.white-truck {
  background: #ddd;
  width: 50px;
  height: 80px;
  border-radius: 4px 4px 0 0;
}

.truck-front {
  position: absolute;
  bottom: 5px;
  font-size: 10px;
  color: #fff;
  background: rgba(0,0,0,0.5);
  padding: 1px 3px;
}

.mock-bottom-text {
  position: absolute;
  bottom: 5px;
  left: 5px;
  color: #fff;
  font-size: 10px;
}

</style>