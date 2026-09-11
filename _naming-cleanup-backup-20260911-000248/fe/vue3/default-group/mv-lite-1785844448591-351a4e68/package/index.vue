<template>
  <div class="modal-overlay">
    <div class="modal-container">
      <!-- 标题栏 -->
      <div class="header">
        <div class="header-left">
          <div class="title-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <span class="title-text">运单信息</span>
          <span class="license-plate">苏A 12345</span>
        </div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <!-- 运单列表表格 -->
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
            <tr 
              v-for="(row, index) in tableData" 
              :key="index"
              :class="{ 'active-row': selectedIndex === index }"
              @click="selectedIndex = index"
            >
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

      <!-- 运单详情 -->
      <div class="details-section">
        <div class="section-header">
          <span class="diamond-icon">♦</span>
          <span class="section-title">运单详情</span>
        </div>
        
        <div class="details-content">
          <div class="info-grid">
            <div class="info-item">
              <span class="label">起运地</span>
              <span class="value">{{ currentDetail.originFull }}</span>
            </div>
            <div class="info-item">
              <span class="label">危化品名称</span>
              <span class="value">{{ currentDetail.name }}</span>
            </div>
            <div class="info-item">
              <span class="label">分类名称</span>
              <span class="value">{{ currentDetail.category }}</span>
            </div>
            <div class="info-item">
              <span class="label">目的地</span>
              <span class="value">{{ currentDetail.destFull }}</span>
            </div>
            <div class="info-item">
              <span class="label">运输里程</span>
              <span class="value">{{ currentDetail.distance }}</span>
            </div>
            <div class="info-item empty"></div> <!-- 占位 -->
            
            <div class="info-item">
              <span class="label">发车时间</span>
              <span class="value">{{ currentDetail.departTime }}</span>
            </div>
            <div class="info-item">
              <span class="label">预计到达时间</span>
              <span class="value">{{ currentDetail.arriveTimeDetail }}</span>
            </div>
            <div class="info-item">
              <span class="label">满载情况</span>
              <span class="value">{{ currentDetail.loadDetail }}</span>
            </div>
            <div class="info-item">
              <span class="label">总重量</span>
              <span class="value">{{ currentDetail.weight }}</span>
            </div>
            <div class="info-item">
              <span class="label">驾驶员姓名</span>
              <span class="value">{{ currentDetail.driverName }}</span>
            </div>
            <div class="info-item">
              <span class="label">驾驶员电话</span>
              <span class="value">{{ currentDetail.driverPhone }}</span>
            </div>
            <div class="info-item full-width">
              <span class="label">备注</span>
              <span class="value">{{ currentDetail.remark }}</span>
            </div>
          </div>

          <div class="image-container">
            <!-- 使用占位图模拟监控截图 -->
            <img 
              src="https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=400&q=80" 
              alt="监控截图" 
              class="monitor-img"
            />
            <div class="img-overlay-text">苏A·P3432</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const selectedIndex = ref(0);

const tableData = [
  {
    id: '3203502388...',
    name: '烟花',
    origin: '江阴',
    departTime: '2023-11-22 06:20:46',
    destination: '靖江',
    arriveTime: '--',
    loadStatus: '满载',
    transportStatus: '在途',
    // 详情数据
    originFull: '江苏省无锡市江阴市',
    destFull: '江苏省泰州市靖江市',
    category: '危险品(1类4项)',
    distance: '200(KM)',
    arriveTimeDetail: '2023-11-22 12:04:21',
    loadDetail: '满载货物',
    weight: '9.8(吨)',
    driverName: '张悦',
    driverPhone: '13955086495',
    remark: '栖霞大道浦口104国道桥宁马高速路路二桥百水桥栖霞大道'
  },
  {
    id: '3203502388...',
    name: '硫酸',
    origin: '无锡',
    departTime: '2023-11-20 06:20:46',
    destination: '泰州',
    arriveTime: '--',
    loadStatus: '满载',
    transportStatus: '在途',
    originFull: '江苏省无锡市',
    destFull: '江苏省泰州市',
    category: '危险品(8类)',
    distance: '150(KM)',
    arriveTimeDetail: '2023-11-20 10:00:00',
    loadDetail: '满载货物',
    weight: '10.0(吨)',
    driverName: '李四',
    driverPhone: '13800000000',
    remark: '常规运输路线'
  },
  {
    id: '3203502388...',
    name: '硫酸',
    origin: '江阴',
    departTime: '2023-11-19 06:20:46',
    destination: '靖江',
    arriveTime: '--',
    loadStatus: '满载',
    transportStatus: '在途',
    originFull: '江苏省无锡市江阴市',
    destFull: '江苏省泰州市靖江市',
    category: '危险品(8类)',
    distance: '200(KM)',
    arriveTimeDetail: '2023-11-19 12:00:00',
    loadDetail: '满载货物',
    weight: '9.5(吨)',
    driverName: '王五',
    driverPhone: '13900000000',
    remark: '注意限速'
  }
];

const currentDetail = computed(() => tableData[selectedIndex.value]);
</script>

<style scoped>
/* 变量定义 */
:root {
  --primary-color: #00e5ff;
  --bg-color: #052b36;
  --bg-header: #004d40;
  --text-color: #ffffff;
  --text-muted: #a0c4c9;
  --border-color: #1a5c66;
  --row-hover: rgba(0, 229, 255, 0.1);
  --row-active: rgba(0, 229, 255, 0.25);
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
  color: #ffffff;
}

.modal-container {
  width: 90%;
  max-width: 1200px;
  background: #052b36;
  border: 1px solid #1a5c66;
  border-radius: 4px;
  box-shadow: 0 0 20px rgba(0, 229, 255, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 标题栏 */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background: linear-gradient(90deg, #004d40 0%, #052b36 100%);
  border-bottom: 1px solid #1a5c66;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-icon {
  color: #00e5ff;
  display: flex;
  align-items: center;
}

.title-text {
  font-size: 18px;
  font-weight: bold;
  color: #ffffff;
}

.license-plate {
  background: #e6a23c; /* 黄色背景 */
  color: #000;
  padding: 2px 8px;
  border-radius: 2px;
  font-size: 14px;
  font-weight: bold;
}

.close-btn {
  background: transparent;
  border: none;
  color: #ffffff;
  font-size: 20px;
  cursor: pointer;
  transition: color 0.3s;
}

.close-btn:hover {
  color: #00e5ff;
}

/* 表格区域 */
.table-section {
  padding: 20px;
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.data-table th {
  text-align: left;
  padding: 12px 10px;
  color: #a0c4c9;
  border-bottom: 1px solid #1a5c66;
  font-weight: normal;
}

.data-table td {
  padding: 12px 10px;
  border-bottom: 1px solid rgba(26, 92, 102, 0.3);
  color: #ffffff;
}

.data-table tbody tr {
  cursor: pointer;
  transition: background 0.3s;
}

.data-table tbody tr:hover {
  background: rgba(0, 229, 255, 0.05);
}

.data-table tbody tr.active-row {
  background: linear-gradient(90deg, rgba(0, 229, 255, 0.2) 0%, rgba(0, 229, 255, 0.05) 100%);
  border-left: 3px solid #00e5ff;
}

.data-table tbody tr.active-row td:first-child {
  /* 修正边框导致的位移 */
  padding-left: 7px; 
}

/* 详情区域 */
.details-section {
  padding: 0 20px 20px 20px;
}

.section-header {
  display: flex;
  align-items: center;
  margin-bottom: 15px;
  font-size: 16px;
  font-weight: bold;
}

.diamond-icon {
  color: #00e5ff;
  margin-right: 8px;
  font-size: 12px;
}

.details-content {
  display: flex;
  gap: 20px;
  background: rgba(0, 0, 0, 0.2);
  padding: 20px;
  border-radius: 4px;
  border: 1px solid #1a5c66;
}

.info-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px 30px;
  font-size: 14px;
}

.info-item {
  display: flex;
  align-items: baseline;
}

.info-item.full-width {
  grid-column: span 2;
}

.info-item.empty {
  visibility: hidden;
}

.label {
  color: #a0c4c9;
  margin-right: 10px;
  min-width: 80px;
}

.value {
  color: #ffffff;
}

.image-container {
  width: 300px;
  height: 200px;
  position: relative;
  border: 1px solid #1a5c66;
  background: #000;
  flex-shrink: 0;
}

.monitor-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.img-overlay-text {
  position: absolute;
  bottom: 5px;
  left: 5px;
  color: #fff;
  font-size: 12px;
  text-shadow: 1px 1px 2px #000;
}

/* 响应式调整 */
@media (max-width: 900px) {
  .details-content {
    flex-direction: column;
  }
  .image-container {
    width: 100%;
    height: 200px;
  }
}
</style>