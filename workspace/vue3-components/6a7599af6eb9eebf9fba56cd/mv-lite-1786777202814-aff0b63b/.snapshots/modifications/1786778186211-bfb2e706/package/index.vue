<template>
  <div class="mv-lite-container">
    <!-- 标题栏 -->
    <div class="header">
      <div class="header-left">
        <div class="title-group">
          <span class="icon-list">☰</span>
          <h2 class="title">运单信息</h2>
          <span class="tag">苏A 12345</span>
        </div>
      </div>
      <button class="close-btn" @click="handleClose">×</button>
    </div>

    <!-- 数据表格 -->
    <div class="table-section">
      <a-table
        :columns="columns"
        :data-source="tableData"
        :pagination="false"
        :row-class-name="getRowClassName"
        class="custom-table"
      />
    </div>

    <!-- 详情区域 -->
    <div class="detail-section">
      <h3 class="detail-title">
        <span class="diamond">♦</span> 运单详情
      </h3>
      
      <div class="detail-content">
        <div class="detail-info">
          <div class="info-row">
            <div class="info-item">
              <span class="label">起运地</span>
              <span class="value">江苏省无锡市江阴市</span>
            </div>
            <div class="info-item">
              <span class="label">危险品名称</span>
              <span class="value">烟花</span>
            </div>
          </div>
          <div class="info-row">
            <div class="info-item">
              <span class="label">分类名称</span>
              <span class="value">危险品(1类4项)</span>
            </div>
            <div class="info-item">
              <span class="label">目的地</span>
              <span class="value">江苏省泰州市靖江市</span>
            </div>
          </div>
          <div class="info-row">
            <div class="info-item">
              <span class="label">运输里程</span>
              <span class="value">200(KM)</span>
            </div>
            <div class="info-item"></div> <!-- 占位 -->
          </div>
          <div class="info-row">
            <div class="info-item">
              <span class="label">发车时间</span>
              <span class="value">2023-11-22 06:20:46</span>
            </div>
            <div class="info-item">
              <span class="label">预计到达时间</span>
              <span class="value">2023-11-22 12:04:21</span>
            </div>
          </div>
          <div class="info-row">
            <div class="info-item">
              <span class="label">满载情况</span>
              <span class="value">满载货物</span>
            </div>
            <div class="info-item">
              <span class="label">总重量</span>
              <span class="value">9.8(吨)</span>
            </div>
          </div>
          <div class="info-row">
            <div class="info-item">
              <span class="label">驾驶员姓名</span>
              <span class="value">张悦</span>
            </div>
            <div class="info-item">
              <span class="label">驾驶员电话</span>
              <span class="value">13955086495</span>
            </div>
          </div>
          <div class="info-row full-width">
            <div class="info-item">
              <span class="label">备注</span>
              <span class="value">栖霞大道浦口104国道桥宁马高速路路二桥百水桥栖霞大道</span>
            </div>
          </div>
        </div>
        
        <div class="detail-image">
          <!-- 使用占位图模拟截图中的监控画面 -->
          <img src="https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80" alt="监控画面" class="monitor-img" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Table as ATable } from 'ant-design-vue';

const columns = [
  { title: '运单编号', dataIndex: 'id', key: 'id', width: 120 },
  { title: '危化品名称', dataIndex: 'name', key: 'name', width: 100 },
  { title: '超运地', dataIndex: 'origin', key: 'origin', width: 80 },
  { title: '实际发车时间', dataIndex: 'startTime', key: 'startTime', width: 160 },
  { title: '目的地', dataIndex: 'dest', key: 'dest', width: 80 },
  { title: '预计到达时间', dataIndex: 'endTime', key: 'endTime', width: 120 },
  { title: '满载情况', dataIndex: 'loadStatus', key: 'loadStatus', width: 100 },
  { title: '运输状态', dataIndex: 'status', key: 'status', width: 100 },
];

const tableData = [
  {
    key: '1',
    id: '3203502388...',
    name: '烟花',
    origin: '江阴',
    startTime: '2023-11-22 06:20:46',
    dest: '靖江',
    endTime: '--',
    loadStatus: '满载',
    status: '在途',
  },
  {
    key: '2',
    id: '3203502388...',
    name: '硫酸',
    origin: '无锡',
    startTime: '2023-11-20 06:20:46',
    dest: '泰州',
    endTime: '--',
    loadStatus: '满载',
    status: '在途',
  },
  {
    key: '3',
    id: '3203502388...',
    name: '硫酸',
    origin: '江阴',
    startTime: '2023-11-19 06:20:46',
    dest: '靖江',
    endTime: '--',
    loadStatus: '满载',
    status: '在途',
  },
];

const getRowClassName = (record, index) => {
  if (index === 0) return 'active-row';
  return '';
};

const handleClose = () => {
  console.log('Close clicked');
};
</script>

<style scoped>
/* 变量定义 */
:root {
  --bg-color: #002b36;
  --surface-color: #00404d;
  --border-color: #006666;
  --text-main: #ffffff;
  --text-sub: #a0c0c0;
  --highlight: #00ffff;
  --tag-bg: #d4a017;
}

.mv-lite-container {
  background-color: #00222b; /* 整体背景 */
  color: #ffffff;
  font-family: 'Microsoft YaHei', sans-serif;
  padding: 20px;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  max-width: 1200px;
  margin: 0 auto;
}

/* 标题栏 */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  background: linear-gradient(to right, #00404d, #002b36);
  padding: 10px 15px;
  border-bottom: 2px solid #006666;
}

.header-left {
  display: flex;
  align-items: center;
}

.title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.icon-list {
  font-size: 18px;
  color: #00ffff;
  margin-right: 5px;
}

.title {
  font-size: 18px;
  font-weight: bold;
  margin: 0;
  color: #ffffff;
  letter-spacing: 1px;
}

.tag {
  background-color: #d4a017;
  color: #000;
  padding: 2px 8px;
  border-radius: 2px;
  font-size: 14px;
  font-weight: bold;
}

.close-btn {
  background: transparent;
  border: 1px solid #006666;
  color: #ffffff;
  font-size: 20px;
  cursor: pointer;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.close-btn:hover {
  background-color: #00404d;
  color: #00ffff;
}

/* 表格区域 */
.table-section {
  margin-bottom: 20px;
  border: 1px solid #006666;
  border-radius: 4px;
  overflow: hidden;
}

/* 强制覆盖 Ant Design Table 样式 */
:deep(.ant-table) {
  background-color: transparent;
  color: #ffffff;
}

:deep(.ant-table-thead > tr > th) {
  background-color: #00404d;
  color: #ffffff;
  border-bottom: 1px solid #006666;
  font-weight: normal;
  text-align: center;
}

:deep(.ant-table-tbody > tr > td) {
  background-color: #00333d;
  color: #ffffff;
  border-bottom: 1px solid #006666;
  text-align: center;
}

:deep(.ant-table-tbody > tr:hover > td) {
  background-color: #004d5c;
}

:deep(.ant-table-tbody > tr.active-row > td) {
  background-color: #005566; /* 选中行高亮 */
  border-left: 3px solid #00ffff; /* 模拟左侧高亮条 */
}

:deep(.ant-table-tbody > tr.active-row > td:first-child) {
   /* 修正边框 */
}

/* 详情区域 */
.detail-section {
  margin-top: 20px;
}

.detail-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 15px;
  display: flex;
  align-items: center;
  color: #ffffff;
}

.diamond {
  color: #ffffff;
  margin-right: 8px;
  font-size: 12px;
}

.detail-content {
  display: flex;
  gap: 20px;
  background-color: #002b36;
  padding: 10px;
}

.detail-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-row {
  display: flex;
  gap: 20px;
}

.info-row.full-width {
  display: block;
}

.info-item {
  flex: 1;
  display: flex;
  font-size: 14px;
  line-height: 1.5;
}

.info-item .label {
  color: #a0c0c0; /* 浅青色/灰色 */
  margin-right: 10px;
  min-width: 80px;
  text-align: right;
}

.info-item .value {
  color: #ffffff;
  flex: 1;
}

.detail-image {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.monitor-img {
  width: 100%;
  height: auto;
  border: 1px solid #006666;
  object-fit: cover;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .detail-content {
    flex-direction: column;
  }
  .detail-image {
    width: 100%;
  }
  .info-row {
    flex-direction: column;
    gap: 5px;
  }
}
</style>