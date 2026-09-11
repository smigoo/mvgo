<template>
  <div class="waybill-container">
    <!-- 顶部标题栏 -->
    <div class="header">
      <div class="header-left">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#00e5ff" fill-opacity="0.8"/>
            <path d="M2 17L12 22L22 17" stroke="#00e5ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="#00e5ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <span class="title">运单信息</span>
        <span class="tag">{{ tagText }}</span>
      </div>
      <button class="close-btn" @click="handleClose">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <!-- 中部表格 -->
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th v-for="col in columns" :key="col.key">{{ col.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr 
            v-for="(row, index) in tableData" 
            :key="index"
            :class="{ 'row-active': row.id === selectedRowId }"
            @click="handleRowClick(row)"
          >
            <td>{{ row.id }}</td>
            <td>{{ row.name }}</td>
            <td>{{ row.origin }}</td>
            <td>{{ row.departTime }}</td>
            <td>{{ row.destination }}</td>
            <td>{{ row.eta }}</td>
            <td>{{ row.loadStatus }}</td>
            <td>{{ row.transportStatus }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 底部详情 -->
    <div class="detail-section">
      <div class="section-header">
        <span class="diamond-icon">◆</span>
        <span class="section-title">运单详情</span>
      </div>
      
      <div class="detail-content">
        <div class="info-grid">
          <div class="info-item">
            <span class="label">起运地</span>
            <span class="value">{{ detailInfo.originFull }}</span>
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
            <span class="value">{{ detailInfo.destFull }}</span>
          </div>
          <div class="info-item">
            <span class="label">运输里程</span>
            <span class="value">{{ detailInfo.distance }}</span>
          </div>
          <div class="info-item">
            <span class="label">发车时间</span>
            <span class="value">{{ detailInfo.departTime }}</span>
          </div>
          <div class="info-item">
            <span class="label">预计到达时间</span>
            <span class="value">{{ detailInfo.eta }}</span>
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
          <img :src="imageUrl" alt="监控抓拍" class="monitor-img" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits, ref } from 'vue';

const props = defineProps({
  tagText: {
    type: String,
    default: '苏A 12345'
  },
  columns: {
    type: Array,
    default: () => [
      { key: 'id', label: '运单编号' },
      { key: 'name', label: '危化品名称' },
      { key: 'origin', label: '超运地' },
      { key: 'departTime', label: '实际发车时间' },
      { key: 'destination', label: '目的地' },
      { key: 'eta', label: '预计到达时间' },
      { key: 'loadStatus', label: '满载情况' },
      { key: 'transportStatus', label: '运输状态' }
    ]
  },
  tableData: {
    type: Array,
    default: () => [
      { id: '3203502388...', name: '烟花', origin: '江阴', departTime: '2023-11-22 06:20:46', destination: '靖江', eta: '--', loadStatus: '满载', transportStatus: '在途' },
      { id: '3203502388...', name: '硫酸', origin: '无锡', departTime: '2023-11-20 06:20:46', destination: '泰州', eta: '--', loadStatus: '满载', transportStatus: '在途' },
      { id: '3203502388...', name: '硫酸', origin: '江阴', departTime: '2023-11-19 06:20:46', destination: '靖江', eta: '--', loadStatus: '满载', transportStatus: '在途' }
    ]
  },
  selectedRowId: {
    type: String,
    default: '3203502388...' // 默认选中第一行，实际逻辑中应区分ID
  },
  detailInfo: {
    type: Object,
    default: () => ({
      originFull: '江苏省无锡市江阴市',
      dangerName: '烟花',
      category: '危险品(1类4项)',
      destFull: '江苏省泰州市靖江市',
      distance: '200(KM)',
      departTime: '2023-11-22 06:20:46',
      eta: '2023-11-22 12:04:21',
      loadStatus: '满载货物',
      weight: '9.8(吨)',
      driverName: '张悦',
      driverPhone: '13955086495',
      remark: '栖霞大道浦口104国道桥宁马高速路路二桥百水桥栖霞大道'
    })
  },
  imageUrl: {
    type: String,
    default: 'https://placehold.co/400x250/1a1a1a/FFF?text=Monitor+Image' // 占位图，实际应传入截图中的图片URL
  }
});

const emit = defineEmits(['close', 'row-select']);

const handleClose = () => {
  emit('close');
};

const handleRowClick = (row) => {
  emit('row-select', row);
};
</script>

<style scoped>
:root {
  --bg-color: #001a1a;
  --header-bg: #002b2b;
  --table-header-bg: #003333;
  --table-row-bg: #002222;
  --table-row-hover: #003333;
  --table-row-active: #004d4d;
  --text-primary: #ffffff;
  --text-secondary: #a0c0c0;
  --accent-color: #00e5ff;
  --border-color: #004040;
}

.waybill-container {
  background-color: var(--bg-color);
  color: var(--text-primary);
  font-family: 'Microsoft YaHei', sans-serif;
  padding: 20px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  box-shadow: 0 0 20px rgba(0, 229, 255, 0.1);
  min-width: 800px;
}

/* Header Styles */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border-color);
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

.title {
  font-size: 20px;
  font-weight: bold;
  letter-spacing: 1px;
}

.tag {
  background-color: #d4a017; /* 金色/橙色背景 */
  color: #fff;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: bold;
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-primary);
  cursor: pointer;
  font-size: 20px;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.3s;
}

.close-btn:hover {
  color: var(--accent-color);
}

.close-btn svg {
  width: 20px;
  height: 20px;
}

/* Table Styles */
.table-wrapper {
  margin-bottom: 30px;
  border: 1px solid var(--border-color);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.data-table th {
  background-color: var(--table-header-bg);
  color: var(--text-primary);
  padding: 12px 10px;
  text-align: left;
  font-weight: bold;
  border-bottom: 1px solid var(--border-color);
  position: relative;
}

/* 模拟表头斜线装饰 */
.data-table th::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 0 0 20px 20px;
  border-color: transparent transparent var(--accent-color) transparent;
  opacity: 0.3;
}

.data-table td {
  padding: 12px 10px;
  border-bottom: 1px solid rgba(0, 64, 64, 0.5);
  color: var(--text-primary);
}

.data-table tbody tr {
  background-color: var(--table-row-bg);
  transition: background-color 0.3s;
  cursor: pointer;
}

.data-table tbody tr:hover {
  background-color: var(--table-row-hover);
}

.data-table tbody tr.row-active {
  background: linear-gradient(90deg, #004d4d 0%, #003333 100%);
  border-left: 3px solid var(--accent-color);
}

/* Detail Section Styles */
.detail-section {
  border-top: 1px solid var(--border-color);
  padding-top: 20px;
}

.section-header {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
}

.diamond-icon {
  color: var(--text-secondary);
  font-size: 12px;
  margin-right: 8px;
}

.section-title {
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

.label {
  color: var(--text-secondary);
  margin-right: 10px;
  min-width: 80px;
}

.value {
  color: var(--text-primary);
  font-weight: 500;
}

.image-container {
  width: 350px;
  height: 200px;
  border: 1px solid var(--border-color);
  background-color: #000;
  overflow: hidden;
  position: relative;
}

.monitor-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>