<template>
  <div class="container">
    <!-- 标题栏 -->
    <div class="header">
      <div class="header-left">
        <span class="title">运单信息</span>
        <span class="tag">苏A 12345</span>
      </div>
      <div class="header-right">
        <button class="close-btn" @click="handleClose">×</button>
      </div>
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
    <div class="details-section">
      <div class="details-title">
        <span class="diamond">◆</span> 运单详情
      </div>
      
      <div class="details-content">
        <div class="details-text">
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
        
        <div class="details-image">
          <!-- 模拟截图中的监控画面 -->
          <div class="img-placeholder">
             <div class="img-overlay-text">苏APM132</div>
             <div class="img-top-text">
                <span>卡口: 钟山互通K...</span>
                <span>2023年11月22日 08:27:47.057</span>
             </div>
             <div class="fake-truck-scene">
                <div class="truck-red"></div>
                <div class="truck-white"></div>
             </div>
          </div>
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
  { title: '预计到达时间', dataIndex: 'eta', key: 'eta', width: 120 },
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
    eta: '--',
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
    eta: '--',
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
    eta: '--',
    loadStatus: '满载',
    status: '在途',
  },
];

const getRowClassName = (record, index) => {
  if (index === 0) return 'row-highlight';
  return '';
};

const handleClose = () => {
  console.log('Close clicked');
};
</script>

<style scoped>
/* 全局容器 */
.container {
  background-color: #001a1a;
  color: #ffffff;
  font-family: 'Microsoft YaHei', sans-serif;
  padding: 10px;
  border: 1px solid #004d4d;
  border-radius: 4px;
  width: 100%;
  max-width: 1200px; /* 模拟弹窗宽度 */
  box-sizing: border-box;
}

/* 标题栏 */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(to right, #003333, #001a1a);
  padding: 8px 15px;
  border-bottom: 1px solid #004d4d;
  margin-bottom: 15px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 15px;
}

.title {
  font-size: 18px;
  font-weight: bold;
  color: #ffffff;
  letter-spacing: 1px;
}

.tag {
  background-color: #d4a017; /* 金黄色 */
  color: #000000;
  padding: 2px 8px;
  border-radius: 2px;
  font-size: 14px;
  font-weight: bold;
}

.close-btn {
  background: transparent;
  border: 1px solid #006666;
  color: #ffffff;
  font-size: 16px;
  cursor: pointer;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 2px;
}

.close-btn:hover {
  background-color: #004d4d;
}

/* 表格区域 */
.table-section {
  margin-bottom: 20px;
  background-color: #002222;
  border: 1px solid #004d4d;
}

/* 深度样式覆盖 Ant Design Table */
:deep(.ant-table) {
  background-color: transparent;
  color: #ffffff;
}

:deep(.ant-table-thead > tr > th) {
  background-color: #003333;
  color: #ffffff;
  border-bottom: 1px solid #006666;
  font-weight: bold;
  text-align: center;
}

:deep(.ant-table-tbody > tr > td) {
  background-color: #002222;
  border-bottom: 1px solid #003333;
  color: #ffffff;
  text-align: center;
}

:deep(.ant-table-tbody > tr:hover > td) {
  background-color: #003333 !important;
}

/* 高亮行 */
:deep(.row-highlight > td) {
  background-color: #004444 !important;
  border: 1px solid #00ffff;
  box-shadow: inset 0 0 10px rgba(0, 255, 255, 0.1);
}

/* 详情区域 */
.details-section {
  background-color: #001a1a;
}

.details-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 15px;
  display: flex;
  align-items: center;
  color: #ffffff;
}

.diamond {
  color: #ffffff;
  font-size: 12px;
  margin-right: 8px;
}

.details-content {
  display: flex;
  gap: 20px;
}

.details-text {
  flex: 1;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 20px;
  font-size: 13px;
}

.info-item {
  display: flex;
  align-items: center;
}

.info-item.full-width {
  grid-column: span 2;
}

.info-item.empty {
  visibility: hidden;
}

.label {
  color: #a0a0a0; /* 浅灰色标签 */
  margin-right: 10px;
  min-width: 80px;
  display: inline-block;
}

.value {
  color: #ffffff;
}

.details-image {
  width: 300px;
  flex-shrink: 0;
}

.img-placeholder {
  width: 100%;
  height: 200px;
  background-color: #000000;
  border: 1px solid #ffffff;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.img-top-text {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #ffffff;
  padding: 2px 5px;
  background: rgba(0,0,0,0.5);
  z-index: 2;
}

.img-overlay-text {
  position: absolute;
  bottom: 5px;
  left: 5px;
  font-size: 10px;
  color: #ffffff;
  z-index: 2;
}

/* 模拟卡车画面 */
.fake-truck-scene {
  flex: 1;
  background: linear-gradient(to bottom, #333, #111);
  position: relative;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  padding-bottom: 20px;
  gap: 20px;
}

/* 简单的CSS画车 */
.truck-red {
  width: 60px;
  height: 80px;
  background-color: #8b0000;
  border-radius: 4px 4px 0 0;
  position: relative;
}
.truck-red::after {
  content: '';
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  height: 20px;
  background-color: #333; /* 挡风玻璃 */
}

.truck-white {
  width: 50px;
  height: 70px;
  background-color: #cccccc;
  border-radius: 4px 4px 0 0;
  position: relative;
}
.truck-white::after {
  content: '';
  position: absolute;
  top: 10px;
  left: 8px;
  right: 8px;
  height: 15px;
  background-color: #333;
}

/* 道路线 */
.fake-truck-scene::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  background-color: #ffffff;
  transform: translateX(-50%);
}

</style>