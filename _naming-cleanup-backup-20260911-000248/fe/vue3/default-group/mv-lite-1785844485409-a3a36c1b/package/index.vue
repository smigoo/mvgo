<template>
  <div class="modal-overlay">
    <div class="modal-container">
      <!-- 标题栏 -->
      <div class="header">
        <div class="header-left">
          <span class="header-icon">📋</span>
          <h2 class="header-title">运单信息</h2>
          <span class="license-tag">苏A 12345</span>
        </div>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>

      <!-- 数据表格区 -->
      <div class="table-section">
        <table class="data-table">
          <thead>
            <tr>
              <th>运单编号</th>
              <th>危化品名称</th>
              <th>超运地</th>
              <th>实际发车时间</th>
              <th>目的地</th>
              <th>预计到达时间</th>
              <th>满载情况</th>
              <th>运输状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in tableData" :key="index" :class="{ 'row-active': index === activeIndex }" @click="activeIndex = index">
              <td>{{ row.id }}</td>
              <td>{{ row.name }}</td>
              <td>{{ row.origin }}</td>
              <td>{{ row.departTime }}</td>
              <td>{{ row.destination }}</td>
              <td>{{ row.arriveTime }}</td>
              <td>{{ row.loadStatus }}</td>
              <td>{{ row.transportStatus }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 详情展示区 -->
      <div class="detail-section">
        <h3 class="detail-title">♦ 运单详情</h3>
        <div class="detail-content">
          <div class="info-grid">
            <div class="info-item">
              <span class="label">起运地</span>
              <span class="value">{{ detailInfo.origin }}</span>
            </div>
            <div class="info-item">
              <span class="label">危险品名称</span>
              <span class="value">{{ detailInfo.dangerName }}</span>
            </div>
            
            <div class="info-item">
              <span class="label">分类名称</span>
              <span class="value">{{ detailInfo.category }}</span>
            </div>
            <div class="info-item">
              <span class="label">目的地</span>
              <span class="value">{{ detailInfo.destination }}</span>
            </div>

            <div class="info-item">
              <span class="label">运输里程</span>
              <span class="value">{{ detailInfo.distance }}</span>
            </div>
            <div class="info-item"></div> <!-- 占位 -->

            <div class="info-item">
              <span class="label">发车时间</span>
              <span class="value">{{ detailInfo.departTime }}</span>
            </div>
            <div class="info-item">
              <span class="label">预计到达时间</span>
              <span class="value">{{ detailInfo.arriveTime }}</span>
            </div>

            <div class="info-item">
              <span class="label">满载情况</span>
              <span class="value">{{ detailInfo.loadStatus }}</span>
            </div>
            <div class="info-item">
              <span class="label">总重量</span>
              <span class="value">{{ detailInfo.weight }}</span>
            </div>

            <div class="info-item">
              <span class="label">驾驶员姓名</span>
              <span class="value">{{ detailInfo.driverName }}</span>
            </div>
            <div class="info-item">
              <span class="label">驾驶员电话</span>
              <span class="value">{{ detailInfo.driverPhone }}</span>
            </div>

            <div class="info-item full-width">
              <span class="label">备注</span>
              <span class="value">{{ detailInfo.remark }}</span>
            </div>
          </div>
          
          <div class="image-container">
            <!-- 模拟监控图片 -->
            <div class="monitor-img">
               <img src="https://images.unsplash.com/photo-1591768793355-74d04bb88d88?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80" alt="监控抓拍" />
               <div class="img-overlay-text">
                 <div class="overlay-top">
                   <span>卡口抓拍</span>
                   <span>2023年11月22日 08:27:47.057</span>
                 </div>
                 <div class="overlay-bottom">
                   <span>黄 苏APM132</span>
                 </div>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';

const activeIndex = ref(0);

const tableData = [
  {
    id: '3203502388...',
    name: '烟花',
    origin: '江阴',
    departTime: '2023-11-22 06:20:46',
    destination: '靖江',
    arriveTime: '--',
    loadStatus: '满载',
    transportStatus: '在途'
  },
  {
    id: '3203502388...',
    name: '硫酸',
    origin: '无锡',
    departTime: '2023-11-20 06:20:46',
    destination: '泰州',
    arriveTime: '--',
    loadStatus: '满载',
    transportStatus: '在途'
  },
  {
    id: '3203502388...',
    name: '硫酸',
    origin: '江阴',
    departTime: '2023-11-19 06:20:46',
    destination: '靖江',
    arriveTime: '--',
    loadStatus: '满载',
    transportStatus: '在途'
  }
];

const detailInfo = reactive({
  origin: '江苏省无锡市江阴市',
  dangerName: '烟花',
  category: '危险品(1类4项)',
  destination: '江苏省泰州市靖江市',
  distance: '200(KM)',
  departTime: '2023-11-22 06:20:46',
  arriveTime: '2023-11-22 12:04:21',
  loadStatus: '满载货物',
  weight: '9.8(吨)',
  driverName: '张悦',
  driverPhone: '13955086495',
  remark: '栖霞大道浦口104国道桥宁马高速路路二桥百水桥栖霞大道'
});
</script>

<style scoped>
/* 基础变量 */
:root {
  --bg-color: #021e1e;
  --primary-color: #147878;
  --text-color: #e0f2f1;
  --header-bg: #0a3d3d;
  --table-header-bg: #0d4d4d;
  --table-row-bg: #052b2b;
  --table-row-hover: #0d4545;
  --tag-bg: #e6a23c;
  --tag-text: #000;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  font-family: 'Microsoft YaHei', sans-serif;
}

.modal-container {
  width: 900px;
  background-color: #021e1e;
  border: 1px solid #147878;
  border-radius: 4px;
  box-shadow: 0 0 20px rgba(20, 120, 120, 0.3);
  color: #e0f2f1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 标题栏 */
.header {
  background: linear-gradient(90deg, #0a3d3d 0%, #052b2b 100%);
  padding: 10px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #147878;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-icon {
  font-size: 14px;
  color: #fff;
}

.header-title {
  margin: 0;
  font-size: 16px;
  font-weight: bold;
  color: #fff;
  letter-spacing: 1px;
}

.license-tag {
  background-color: #e6a23c;
  color: #000;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
}

.close-btn {
  background: transparent;
  border: none;
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  padding: 0 5px;
}

.close-btn:hover {
  color: #ff4d4f;
}

/* 表格区 */
.table-section {
  padding: 15px 20px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table th {
  background-color: #0d4d4d;
  color: #fff;
  padding: 10px 5px;
  text-align: left;
  font-weight: bold;
  border: 1px solid #021e1e;
}

.data-table td {
  background-color: #052b2b;
  padding: 10px 5px;
  border: 1px solid #021e1e;
  color: #e0f2f1;
}

.data-table tbody tr {
  cursor: pointer;
  transition: background-color 0.2s;
}

.data-table tbody tr:hover {
  background-color: #0d4545;
}

.row-active {
  background-color: #147878 !important;
  color: #fff;
  font-weight: bold;
}

/* 详情区 */
.detail-section {
  padding: 0 20px 20px 20px;
}

.detail-title {
  font-size: 14px;
  color: #fff;
  margin-bottom: 15px;
  display: flex;
  align-items: center;
  gap: 5px;
}

.detail-content {
  display: flex;
  justify-content: space-between;
  gap: 20px;
}

.info-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px 10px;
  font-size: 13px;
}

.info-item {
  display: flex;
  align-items: baseline;
}

.info-item.full-width {
  grid-column: span 2;
}

.label {
  color: #a0c4c4;
  margin-right: 10px;
  min-width: 80px;
  display: inline-block;
}

.value {
  color: #fff;
}

.image-container {
  width: 280px;
  height: 180px;
  flex-shrink: 0;
  border: 1px solid #147878;
  background: #000;
  position: relative;
  overflow: hidden;
}

.monitor-img {
  width: 100%;
  height: 100%;
  position: relative;
}

.monitor-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.img-overlay-text {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 5px;
  box-sizing: border-box;
  font-size: 10px;
  color: #fff;
  text-shadow: 1px 1px 1px #000;
}

.overlay-top {
  display: flex;
  justify-content: space-between;
}

.overlay-bottom {
  text-align: left;
}

</style>