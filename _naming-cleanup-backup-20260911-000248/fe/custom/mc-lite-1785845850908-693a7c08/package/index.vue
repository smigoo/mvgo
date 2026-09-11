<template>
  <div class="waybill-container">
    <!-- 顶部标题栏 -->
    <div class="header-bar">
      <div class="header-left">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#00BFFF"/>
            <path d="M2 17L12 22L22 17" stroke="#00BFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="#00BFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <span class="title-text">运单信息</span>
        <span class="plate-tag">{{ plateNumber }}</span>
      </div>
      <button class="close-btn" @click="handleClose">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <!-- 中部数据表格 -->
    <div class="table-section">
      <table class="data-table">
        <thead>
          <tr>
            <th v-for="(col, index) in columns" :key="index" :style="{ width: col.width }">{{ col.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in tableData" :key="index" :class="{ 'row-active': index === activeRowIndex }">
            <td>{{ row.id }}</td>
            <td>{{ row.name }}</td>
            <td>{{ row.originShort }}</td>
            <td>{{ row.time }}</td>
            <td>{{ row.destShort }}</td>
            <td>{{ row.eta }}</td>
            <td>{{ row.loadStatus }}</td>
            <td>{{ row.status }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 底部详情展示 -->
    <div class="detail-section">
      <div class="detail-header">
        <span class="diamond-icon">◆</span>
        <span class="detail-title">运单详情</span>
      </div>
      
      <div class="detail-content">
        <div class="info-grid">
          <div class="info-item">
            <span class="label">起运地</span>
            <span class="value">{{ detailData.origin }}</span>
          </div>
          <div class="info-item">
            <span class="label">危险品名称</span>
            <span class="value">{{ detailData.goodsName }}</span>
          </div>
          
          <div class="info-item">
            <span class="label">分类名称</span>
            <span class="value">{{ detailData.category }}</span>
          </div>
          <div class="info-item">
            <span class="label">目的地</span>
            <span class="value">{{ detailData.dest }}</span>
          </div>

          <div class="info-item">
            <span class="label">运输里程</span>
            <span class="value">{{ detailData.distance }}</span>
          </div>
          <!-- 占位，保持布局对齐 -->
          <div class="info-item empty"></div> 

          <div class="info-item">
            <span class="label">发车时间</span>
            <span class="value">{{ detailData.startTime }}</span>
          </div>
          <div class="info-item">
            <span class="label">预计到达时间</span>
            <span class="value">{{ detailData.eta }}</span>
          </div>

          <div class="info-item">
            <span class="label">满载情况</span>
            <span class="value">{{ detailData.loadStatusDetail }}</span>
          </div>
          <div class="info-item">
            <span class="label">总重量</span>
            <span class="value">{{ detailData.weight }}</span>
          </div>

          <div class="info-item">
            <span class="label">驾驶员姓名</span>
            <span class="value">{{ detailData.driverName }}</span>
          </div>
          <div class="info-item">
            <span class="label">驾驶员电话</span>
            <span class="value">{{ detailData.driverPhone }}</span>
          </div>

          <div class="info-item full-width">
            <span class="label">备注</span>
            <span class="value">{{ detailData.remark }}</span>
          </div>
        </div>

        <div class="image-container">
          <img :src="detailData.image" alt="监控截图" class="monitor-image" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits, ref } from 'vue';

// 定义 Props
const props = defineProps({
  plateNumber: {
    type: String,
    default: '苏A 12345'
  },
  tableData: {
    type: Array,
    default: () => [
      { id: '3203502388...', name: '烟花', originShort: '江阴', time: '2023-11-22 06:20:46', destShort: '靖江', eta: '--', loadStatus: '满载', status: '在途' },
      { id: '3203502388...', name: '硫酸', originShort: '无锡', time: '2023-11-20 06:20:46', destShort: '泰州', eta: '--', loadStatus: '满载', status: '在途' },
      { id: '3203502388...', name: '硫酸', originShort: '江阴', time: '2023-11-19 06:20:46', destShort: '靖江', eta: '--', loadStatus: '满载', status: '在途' }
    ]
  },
  detailData: {
    type: Object,
    default: () => ({
      origin: '江苏省无锡市江阴市',
      goodsName: '烟花',
      category: '危险品(1类4项)',
      dest: '江苏省泰州市靖江市',
      distance: '200(KM)',
      startTime: '2023-11-22 06:20:46',
      eta: '2023-11-22 12:04:21',
      loadStatusDetail: '满载货物',
      weight: '9.8(吨)',
      driverName: '张悦',
      driverPhone: '13955086495',
      remark: '栖霞大道浦口104国道桥宁马高速路路二桥百水桥栖霞大道',
      image: 'https://placehold.co/400x300/1a1a1a/FFF?text=Monitor+Image' // 占位图，实际应传入真实URL
    })
  },
  activeRowIndex: {
    type: Number,
    default: 0
  }
});

// 定义 Emits
const emit = defineEmits(['close', 'row-click']);

const columns = [
  { label: '运单编号', width: '15%' },
  { label: '危化品名称', width: '12%' },
  { label: '超运地', width: '10%' },
  { label: '实际发车时间', width: '18%' },
  { label: '目的地', width: '10%' },
  { label: '预计到达时间', width: '12%' },
  { label: '满载情况', width: '10%' },
  { label: '运输状态', width: '10%' }
];

const handleClose = () => {
  emit('close');
};
</script>

<style scoped>
/* CSS 变量定义，支持主题切换 */
:root {
  --bg-color: #002222;
  --header-bg: #003333;
  --table-header-bg: #004d4d;
  --table-row-active: #006666;
  --table-row-normal: #003333;
  --table-border: #005555;
  --text-primary: #ffffff;
  --text-secondary: #a0c0c0;
  --accent-color: #00ffff;
  --tag-bg: #d48806;
  --tag-text: #ffffff;
}

.waybill-container {
  background-color: var(--bg-color, #002222);
  color: var(--text-primary, #ffffff);
  font-family: 'Microsoft YaHei', sans-serif;
  padding: 20px;
  border: 1px solid #004444;
  box-sizing: border-box;
  min-width: 800px;
}

/* 顶部标题栏 */
.header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  border-bottom: 1px solid #004444;
  padding-bottom: 10px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
}

.logo-icon svg {
  width: 100%;
  height: 100%;
}

.title-text {
  font-size: 20px;
  font-weight: bold;
  letter-spacing: 1px;
}

.plate-tag {
  background-color: var(--tag-bg, #d48806);
  color: var(--tag-text, #ffffff);
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: bold;
  border: 1px solid #e6a020;
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--text-primary, #ffffff);
  cursor: pointer;
  font-size: 20px;
  padding: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.3s;
}

.close-btn:hover {
  color: #ff4d4d;
}

.close-btn svg {
  width: 20px;
  height: 20px;
}

/* 数据表格区 */
.table-section {
  margin-bottom: 30px;
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.data-table th {
  background: linear-gradient(90deg, #004d4d 0%, #003333 100%);
  color: var(--text-primary, #ffffff);
  padding: 12px 10px;
  text-align: left;
  font-weight: bold;
  border-bottom: 2px solid #006666;
  /* 模拟表头斜切角效果 */
  clip-path: polygon(0 0, 100% 0, 98% 100%, 0% 100%);
}

.data-table th:first-child {
  clip-path: polygon(10px 0, 100% 0, 98% 100%, 0% 100%);
  padding-left: 20px;
}

.data-table td {
  padding: 12px 10px;
  border-bottom: 1px solid var(--table-border, #004444);
  color: var(--text-secondary, #a0c0c0);
}

.row-active {
  background-color: var(--table-row-active, #006666) !important;
}

.row-active td {
  color: var(--text-primary, #ffffff);
  font-weight: 500;
}

.data-table tbody tr:not(.row-active) {
  background-color: var(--table-row-normal, #003333);
}

.data-table tbody tr:hover:not(.row-active) {
  background-color: #004444;
}

/* 运单详情区 */
.detail-section {
  border-top: 1px solid #004444;
  padding-top: 20px;
}

.detail-header {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
}

.diamond-icon {
  color: var(--text-secondary, #a0c0c0);
  margin-right: 8px;
  font-size: 14px;
}

.detail-title {
  font-size: 18px;
  font-weight: bold;
}

.detail-content {
  display: flex;
  gap: 40px;
}

.info-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 40px;
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
  color: var(--text-secondary, #a0c0c0);
  margin-right: 10px;
  min-width: 80px;
}

.value {
  color: var(--text-primary, #ffffff);
  font-weight: bold;
  font-size: 15px;
}

.image-container {
  width: 320px;
  height: 200px;
  border: 1px solid #005555;
  background-color: #001111;
  flex-shrink: 0;
}

.monitor-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>