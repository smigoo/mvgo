<template>
  <div class="modal-container">
    <!-- 标题栏 -->
    <div class="header">
      <div class="header-left">
        <span class="header-icon">📋</span>
        <h2 class="header-title">运单信息</h2>
        <span class="license-tag">苏A 12345</span>
      </div>
      <button class="close-btn" @click="$emit('close')">✕</button>
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
          <tr v-for="(row, index) in tableData" :key="index" :class="{ 'active-row': index === 0 }">
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
        <div class="detail-info-grid">
          <div class="info-item">
            <span class="label">起运地</span>
            <span class="value">{{ detail.originFull }}</span>
          </div>
          <div class="info-item">
            <span class="label">危险品名称</span>
            <span class="value">{{ detail.dangerName }}</span>
          </div>
          
          <div class="info-item">
            <span class="label">分类名称</span>
            <span class="value">{{ detail.category }}</span>
          </div>
          <div class="info-item">
            <span class="label">目的地</span>
            <span class="value">{{ detail.destFull }}</span>
          </div>

          <div class="info-item">
            <span class="label">运输里程</span>
            <span class="value">{{ detail.distance }}</span>
          </div>
          <div class="info-item"></div> <!-- 占位 -->

          <div class="info-item">
            <span class="label">发车时间</span>
            <span class="value">{{ detail.departTimeFull }}</span>
          </div>
          <div class="info-item">
            <span class="label">预计到达时间</span>
            <span class="value">{{ detail.arriveTimeFull }}</span>
          </div>

          <div class="info-item">
            <span class="label">满载情况</span>
            <span class="value">{{ detail.loadStatusFull }}</span>
          </div>
          <div class="info-item">
            <span class="label">总重量</span>
            <span class="value">{{ detail.weight }}</span>
          </div>

          <div class="info-item">
            <span class="label">驾驶员姓名</span>
            <span class="value">{{ detail.driverName }}</span>
          </div>
          <div class="info-item">
            <span class="label">驾驶员电话</span>
            <span class="value">{{ detail.driverPhone }}</span>
          </div>

          <div class="info-item full-width">
            <span class="label">备注</span>
            <span class="value">{{ detail.remark }}</span>
          </div>
        </div>
        
        <div class="detail-image-wrapper">
          <!-- 模拟监控图片 -->
          <div class="monitor-image">
             <img src="https://placehold.co/300x200/111/fff?text=Monitor+View" alt="监控画面" />
             <div class="img-overlay-text">
               <div>抓拍时间: 2023-11-22 06:21:01</div>
               <div>苏A·P3432</div>
             </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

defineEmits(['close']);

const tableData = ref([
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
]);

const detail = ref({
  originFull: '江苏省无锡市江阴市',
  dangerName: '烟花',
  category: '危险品(1类4项)',
  destFull: '江苏省泰州市靖江市',
  distance: '200(KM)',
  departTimeFull: '2023-11-22 06:20:46',
  arriveTimeFull: '2023-11-22 12:04:21',
  loadStatusFull: '满载货物',
  weight: '9.8(吨)',
  driverName: '张悦',
  driverPhone: '13955086495',
  remark: '栖霞大道浦口104国道桥宁马高速路路二桥百水桥栖霞大道'
});
</script>

<style scoped>
/* 颜色变量定义 */
:root {
  --bg-color: #021e1e;
  --primary-color: #147878;
  --text-color: #e0f2f1;
  --header-bg: #0a3636;
  --row-bg: #062b2b;
  --row-active-bg: #1a8f8f;
  --tag-bg: #f0ad4e;
  --border-color: #1f5f5f;
}

.modal-container {
  background-color: #021e1e;
  color: #e0f2f1;
  font-family: 'Microsoft YaHei', sans-serif;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  border: 1px solid #1f5f5f;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  padding: 10px;
  box-sizing: border-box;
}

/* 标题栏 */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(to right, #0a3636, #021e1e);
  padding: 10px 15px;
  border-bottom: 2px solid #147878;
  margin-bottom: 15px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-icon {
  font-size: 18px;
}

.header-title {
  margin: 0;
  font-size: 18px;
  font-weight: bold;
  color: #fff;
  letter-spacing: 1px;
}

.license-tag {
  background-color: #dcb346; /* 截图中的黄褐色 */
  color: #000;
  padding: 2px 8px;
  border-radius: 2px;
  font-size: 14px;
  font-weight: bold;
}

.close-btn {
  background: transparent;
  border: 1px solid #147878;
  color: #e0f2f1;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}

.close-btn:hover {
  background-color: #147878;
  color: #fff;
}

/* 表格区 */
.table-section {
  margin-bottom: 20px;
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  text-align: center;
}

.data-table th {
  background-color: #147878;
  color: #fff;
  padding: 10px 5px;
  font-weight: bold;
  border: 1px solid #0a4545;
}

.data-table td {
  padding: 10px 5px;
  border: 1px solid #0a4545;
  background-color: #062b2b;
  color: #a0c0c0;
}

.data-table tr.active-row td {
  background-color: #1a8f8f; /* 高亮行 */
  color: #fff;
  font-weight: bold;
}

/* 详情区 */
.detail-section {
  flex: 1;
}

.detail-title {
  font-size: 16px;
  color: #fff;
  margin-bottom: 15px;
  display: flex;
  align-items: center;
  gap: 5px;
}

.detail-content {
  display: flex;
  gap: 20px;
}

.detail-info-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px 40px;
  font-size: 14px;
}

.info-item {
  display: flex;
  align-items: baseline;
}

.info-item.full-width {
  grid-column: span 2;
}

.label {
  color: #a0c0c0;
  margin-right: 10px;
  min-width: 80px;
  display: inline-block;
}

.value {
  color: #fff;
  font-weight: 500;
}

.detail-image-wrapper {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.monitor-image {
  position: relative;
  width: 100%;
  height: 200px;
  border: 2px solid #147878;
  background-color: #000;
  overflow: hidden;
}

.monitor-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.8;
}

.img-overlay-text {
  position: absolute;
  top: 5px;
  left: 5px;
  right: 5px;
  color: #fff;
  font-size: 10px;
  text-shadow: 1px 1px 2px #000;
  display: flex;
  justify-content: space-between;
}

.img-overlay-text div:last-child {
   position: absolute;
   bottom: 5px;
   left: 5px;
   top: auto;
}

</style>