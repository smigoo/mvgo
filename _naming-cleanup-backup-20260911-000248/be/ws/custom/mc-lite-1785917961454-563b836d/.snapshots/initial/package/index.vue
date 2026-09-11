<template>
  <base-panel panelKey="default-panel">
    <div class="c-mc-lite-1785917961454-563b836d-content">
      <!-- 标题栏 -->
      <div class="c-mc-lite-1785917961454-563b836d-header">
        <div class="c-mc-lite-1785917961454-563b836d-header-left">
          <span class="c-mc-lite-1785917961454-563b836d-icon"></span>
          <span class="c-mc-lite-1785917961454-563b836d-title">运单信息</span>
          <span class="c-mc-lite-1785917961454-563b836d-tag">苏A 12345</span>
        </div>
        <div class="c-mc-lite-1785917961454-563b836d-close" @click="handleClose">✕</div>
      </div>

      <!-- 表格区域 -->
      <div class="c-mc-lite-1785917961454-563b836d-table-wrapper">
        <a-table
          :columns="columns"
          :data-source="dataSource"
          :pagination="false"
          :row-class-name="getRowClassName"
          class="c-mc-lite-1785917961454-563b836d-table"
          @row-click="handleRowClick"
        />
      </div>

      <!-- 详情区域 -->
      <div class="c-mc-lite-1785917961454-563b836d-detail-section">
        <div class="c-mc-lite-1785917961454-563b836d-detail-title">
          <span class="c-mc-lite-1785917961454-563b836d-diamond">♦</span> 运单详情
        </div>
        
        <div class="c-mc-lite-1785917961454-563b836d-detail-body">
          <div class="c-mc-lite-1785917961454-563b836d-detail-left">
            <div class="c-mc-lite-1785917961454-563b836d-info-grid">
              <div class="c-mc-lite-1785917961454-563b836d-info-item">
                <span class="c-mc-lite-1785917961454-563b836d-label">起运地</span>
                <span class="c-mc-lite-1785917961454-563b836d-value">江苏省无锡市江阴市</span>
              </div>
              <div class="c-mc-lite-1785917961454-563b836d-info-item">
                <span class="c-mc-lite-1785917961454-563b836d-label">危险品名称</span>
                <span class="c-mc-lite-1785917961454-563b836d-value">烟花</span>
              </div>
              
              <div class="c-mc-lite-1785917961454-563b836d-info-item">
                <span class="c-mc-lite-1785917961454-563b836d-label">分类名称</span>
                <span class="c-mc-lite-1785917961454-563b836d-value">危险品(1类4项)</span>
              </div>
              <div class="c-mc-lite-1785917961454-563b836d-info-item">
                <span class="c-mc-lite-1785917961454-563b836d-label">目的地</span>
                <span class="c-mc-lite-1785917961454-563b836d-value">江苏省泰州市靖江市</span>
              </div>

              <div class="c-mc-lite-1785917961454-563b836d-info-item">
                <span class="c-mc-lite-1785917961454-563b836d-label">运输里程</span>
                <span class="c-mc-lite-1785917961454-563b836d-value">200(KM)</span>
              </div>
              <div class="c-mc-lite-1785917961454-563b836d-info-item"></div> <!-- 占位 -->

              <div class="c-mc-lite-1785917961454-563b836d-info-item">
                <span class="c-mc-lite-1785917961454-563b836d-label">发车时间</span>
                <span class="c-mc-lite-1785917961454-563b836d-value">2023-11-22 06:20:46</span>
              </div>
              <div class="c-mc-lite-1785917961454-563b836d-info-item">
                <span class="c-mc-lite-1785917961454-563b836d-label">预计到达时间</span>
                <span class="c-mc-lite-1785917961454-563b836d-value">2023-11-22 12:04:21</span>
              </div>

              <div class="c-mc-lite-1785917961454-563b836d-info-item">
                <span class="c-mc-lite-1785917961454-563b836d-label">满载情况</span>
                <span class="c-mc-lite-1785917961454-563b836d-value">满载货物</span>
              </div>
              <div class="c-mc-lite-1785917961454-563b836d-info-item">
                <span class="c-mc-lite-1785917961454-563b836d-label">总重量</span>
                <span class="c-mc-lite-1785917961454-563b836d-value">9.8(吨)</span>
              </div>

              <div class="c-mc-lite-1785917961454-563b836d-info-item">
                <span class="c-mc-lite-1785917961454-563b836d-label">驾驶员姓名</span>
                <span class="c-mc-lite-1785917961454-563b836d-value">张悦</span>
              </div>
              <div class="c-mc-lite-1785917961454-563b836d-info-item">
                <span class="c-mc-lite-1785917961454-563b836d-label">驾驶员电话</span>
                <span class="c-mc-lite-1785917961454-563b836d-value">13955086495</span>
              </div>

              <div class="c-mc-lite-1785917961454-563b836d-info-item c-mc-lite-1785917961454-563b836d-full-width">
                <span class="c-mc-lite-1785917961454-563b836d-label">备注</span>
                <span class="c-mc-lite-1785917961454-563b836d-value">栖霞大道浦口104国道桥宁马高速路路二桥百水桥栖霞大道</span>
              </div>
            </div>
          </div>
          
          <div class="c-mc-lite-1785917961454-563b836d-detail-right">
            <div class="c-mc-lite-1785917961454-563b836d-image-box">
              <!-- 使用占位图模拟截图中的监控画面 -->
              <img src="https://placehold.co/400x300/111/FFF?text=Truck+Monitor+View" alt="车辆监控" class="c-mc-lite-1785917961454-563b836d-monitor-img" />
              <div class="c-mc-lite-1785917961454-563b836d-img-overlay-text">苏A·AP532</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </base-panel>
</template>

<script setup>
import { Table as ATable } from 'ant-design-vue';

const columns = [
  { title: '运单编号', dataIndex: 'id', key: 'id' },
  { title: '危化品名称', dataIndex: 'name', key: 'name' },
  { title: '超运地', dataIndex: 'origin', key: 'origin' },
  { title: '实际发车时间', dataIndex: 'startTime', key: 'startTime' },
  { title: '目的地', dataIndex: 'dest', key: 'dest' },
  { title: '预计到达时间', dataIndex: 'endTime', key: 'endTime' },
  { title: '满载情况', dataIndex: 'loadStatus', key: 'loadStatus' },
  { title: '运输状态', dataIndex: 'status', key: 'status' },
];

const dataSource = [
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
  if (index === 0) return 'c-mc-lite-1785917961454-563b836d-row-active';
  return 'c-mc-lite-1785917961454-563b836d-row-normal';
};

const handleClose = () => {
  console.log('Close button clicked');
};

const handleRowClick = (record) => {
  console.log('Row clicked:', record);
};
</script>

<style scoped>
/* 基础变量 */
.c-mc-lite-1785917961454-563b836d-content {
  width: 100%;
  height: 100%;
  background-color: #001a1a; /* 深色背景 */
  color: #ffffff;
  font-family: 'Microsoft YaHei', sans-serif;
  display: flex;
  flex-direction: column;
  padding: 10px;
  box-sizing: border-box;
  overflow: hidden;
}

/* 标题栏 */
.c-mc-lite-1785917961454-563b836d-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  background: linear-gradient(to right, #003333, #002222);
  border-bottom: 2px solid #004444;
  margin-bottom: 15px;
}

.c-mc-lite-1785917961454-563b836d-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.c-mc-lite-1785917961454-563b836d-icon {
  color: #00ffff;
  font-size: 16px;
}

.c-mc-lite-1785917961454-563b836d-title {
  font-size: 18px;
  font-weight: bold;
  color: #ffffff;
  letter-spacing: 1px;
}

.c-mc-lite-1785917961454-563b836d-tag {
  background-color: #e6a23c; /* 黄色/橙色标签 */
  color: #000000;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: bold;
}

.c-mc-lite-1785917961454-563b836d-close {
  color: #ffffff;
  font-size: 20px;
  cursor: pointer;
  border: 1px solid #006666;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.c-mc-lite-1785917961454-563b836d-close:hover {
  background-color: #004444;
}

/* 表格区域 */
.c-mc-lite-1785917961454-563b836d-table-wrapper {
  margin-bottom: 20px;
  width: 100%;
}

/* 覆盖 Ant Design Table 样式以匹配截图 */
.c-mc-lite-1785917961454-563b836d-table :deep(.ant-table) {
  background: transparent;
  color: #ffffff;
}

.c-mc-lite-1785917961454-563b836d-table :deep(.ant-table-thead > tr > th) {
  background-color: #003333;
  color: #00ffff;
  border-bottom: 1px solid #006666;
  font-weight: bold;
  text-align: center;
}

.c-mc-lite-1785917961454-563b836d-table :deep(.ant-table-tbody > tr) {
  background-color: #002b2b;
  border-bottom: 1px solid #004444;
  cursor: pointer;
  transition: all 0.3s;
}

/* 模拟截图中的行间距和圆角效果比较难，这里用边框高亮模拟 */
.c-mc-lite-1785917961454-563b836d-row-active {
  background-color: #004444 !important;
  border: 1px solid #00ffff;
}

.c-mc-lite-1785917961454-563b836d-row-active td {
  border-top: 1px solid #00ffff;
  border-bottom: 1px solid #00ffff;
}
.c-mc-lite-1785917961454-563b836d-row-active td:first-child {
  border-left: 1px solid #00ffff;
  border-top-left-radius: 4px;
  border-bottom-left-radius: 4px;
}
.c-mc-lite-1785917961454-563b836d-row-active td:last-child {
  border-right: 1px solid #00ffff;
  border-top-right-radius: 4px;
  border-bottom-right-radius: 4px;
}

.c-mc-lite-1785917961454-563b836d-row-normal:hover {
  background-color: #003333 !important;
}

.c-mc-lite-1785917961454-563b836d-table :deep(.ant-table-tbody > tr > td) {
  border-bottom: 1px solid #004444;
  text-align: center;
  padding: 12px 8px;
}

/* 详情区域 */
.c-mc-lite-1785917961454-563b836d-detail-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.c-mc-lite-1785917961454-563b836d-detail-title {
  font-size: 16px;
  font-weight: bold;
  color: #ffffff;
  margin-bottom: 15px;
  display: flex;
  align-items: center;
}

.c-mc-lite-1785917961454-563b836d-diamond {
  color: #00ffff;
  margin-right: 5px;
  font-size: 12px;
}

.c-mc-lite-1785917961454-563b836d-detail-body {
  display: flex;
  flex: 1;
  gap: 20px;
  min-height: 0; /* 防止溢出 */
}

.c-mc-lite-1785917961454-563b836d-detail-left {
  flex: 2;
  overflow-y: auto;
}

.c-mc-lite-1785917961454-563b836d-detail-right {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

/* 文本网格布局 */
.c-mc-lite-1785917961454-563b836d-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px 20px;
  font-size: 14px;
}

.c-mc-lite-1785917961454-563b836d-info-item {
  display: flex;
  align-items: baseline;
}

.c-mc-lite-1785917961454-563b836d-full-width {
  grid-column: 1 / -1;
}

.c-mc-lite-1785917961454-563b836d-label {
  color: #aaaaaa; /* 浅灰色标签 */
  margin-right: 10px;
  white-space: nowrap;
}

.c-mc-lite-1785917961454-563b836d-value {
  color: #ffffff;
  word-break: break-all;
}

/* 图片区域 */
.c-mc-lite-1785917961454-563b836d-image-box {
  width: 100%;
  max-width: 300px;
  border: 2px solid #006666;
  position: relative;
  background-color: #000;
}

.c-mc-lite-1785917961454-563b836d-monitor-img {
  width: 100%;
  height: auto;
  display: block;
  opacity: 0.8;
}

.c-mc-lite-1785917961454-563b836d-img-overlay-text {
  position: absolute;
  bottom: 5px;
  left: 5px;
  color: #fff;
  font-size: 12px;
  background: rgba(0,0,0,0.5);
  padding: 2px 4px;
}

</style>