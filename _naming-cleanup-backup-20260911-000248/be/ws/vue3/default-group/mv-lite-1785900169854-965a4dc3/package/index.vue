<template>
  <div class="modal-container">
    <!-- 顶部标题栏 -->
    <div class="header">
      <div class="header-left">
        <span class="title">运单信息</span>
        <span class="tag">苏A 12345</span>
      </div>
      <div class="close-btn">×</div>
    </div>

    <!-- 数据表格区 -->
    <div class="table-section">
      <a-table
        :columns="columns"
        :data-source="data"
        :pagination="false"
        :row-class-name="getRowClassName"
        class="custom-table"
      />
    </div>

    <!-- 详情展示区 -->
    <div class="detail-section">
      <div class="detail-title">
        <span class="diamond-icon">♦</span> 运单详情
      </div>
      
      <div class="detail-content">
        <div class="detail-text-grid">
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
          <div class="info-item empty"></div>

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

        <div class="detail-image-wrapper">
          <img src="https://placehold.co/400x300/1a1a1a/FFF?text=Truck+Monitor" alt="监控截图" class="monitor-img" />
          <!-- 这里用占位图模拟，实际应使用截图中的图片 -->
          <div class="img-overlay-text">黄光沪M32</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Table as ATable } from 'ant-design-vue';

const columns = [
  { title: '运单编号', dataIndex: 'id', key: 'id', width: 120 },
  { title: '危化品名称', dataIndex: 'name', key: 'name', width: 120 },
  { title: '超运地', dataIndex: 'origin', key: 'origin', width: 100 },
  { title: '实际发车时间', dataIndex: 'time', key: 'time', width: 180 },
  { title: '目的地', dataIndex: 'dest', key: 'dest', width: 100 },
  { title: '预计到达时间', dataIndex: 'eta', key: 'eta', width: 140 },
  { title: '满载情况', dataIndex: 'load', key: 'load', width: 100 },
  { title: '运输状态', dataIndex: 'status', key: 'status', width: 100 },
];

const data = [
  {
    key: '1',
    id: '3203502388...',
    name: '烟花',
    origin: '江阴',
    time: '2023-11-22 06:20:46',
    dest: '靖江',
    eta: '--',
    load: '满载',
    status: '在途',
  },
  {
    key: '2',
    id: '3203502388...',
    name: '硫酸',
    origin: '无锡',
    time: '2023-11-20 06:20:46',
    dest: '泰州',
    eta: '--',
    load: '满载',
    status: '在途',
  },
  {
    key: '3',
    id: '3203502388...',
    name: '硫酸',
    origin: '江阴',
    time: '2023-11-19 06:20:46',
    dest: '靖江',
    eta: '--',
    load: '满载',
    status: '在途',
  },
];

const getRowClassName = (record, index) => {
  return index === 0 ? 'highlight-row' : '';
};
</script>

<style scoped>
/* 整体容器 */
.modal-container {
  background-color: #052b2b;
  color: #ffffff;
  font-family: 'Microsoft YaHei', sans-serif;
  width: 100%;
  min-height: 600px;
  padding: 20px;
  box-sizing: border-box;
  border: 1px solid #1a5c5c;
}

/* 顶部标题栏 */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  background: linear-gradient(to right, #0a3d3d, #052b2b);
  padding: 10px 15px;
  border-bottom: 2px solid #1a5c5c;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 15px;
}

.title {
  font-size: 18px;
  font-weight: bold;
  color: #fff;
}

.tag {
  background-color: #f1c40f;
  color: #000;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: bold;
}

.close-btn {
  font-size: 24px;
  cursor: pointer;
  color: #fff;
  font-weight: bold;
}

/* 表格区域 */
.table-section {
  margin-bottom: 30px;
}

/* 详情区域 */
.detail-section {
  margin-top: 20px;
}

.detail-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  color: #fff;
}

.diamond-icon {
  color: #fff;
  margin-right: 8px;
  font-size: 12px;
}

.detail-content {
  display: flex;
  gap: 40px;
}

/* 左侧文本网格 */
.detail-text-grid {
  flex: 2;
  display: grid;
  grid-template-columns: 1fr 1fr;
  row-gap: 20px;
  column-gap: 40px;
  padding-left: 20px;
}

.info-item {
  display: flex;
  font-size: 14px;
  line-height: 1.5;
}

.info-item.full-width {
  grid-column: 1 / -1;
}

.info-item.empty {
  visibility: hidden;
}

.label {
  color: #ccc; /* 稍微淡一点，区分标签和内容，或者根据截图全是白色 */
  color: #fff;
  margin-right: 10px;
  white-space: nowrap;
}

.value {
  color: #fff;
}

/* 右侧图片 */
.detail-image-wrapper {
  flex: 1;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.monitor-img {
  width: 100%;
  max-width: 350px;
  border: 2px solid #fff;
  object-fit: cover;
}

.img-overlay-text {
  position: absolute;
  bottom: 10px;
  left: 10px;
  font-size: 12px;
  color: #fff;
  text-shadow: 1px 1px 2px #000;
}

/* Ant Design Vue 表格样式覆盖 */
:deep(.custom-table) {
  background-color: transparent;
  color: #fff;
}

:deep(.ant-table) {
  background-color: transparent;
  color: #fff;
}

:deep(.ant-table-thead > tr > th) {
  background-color: #0d4f4f !important;
  color: #fff !important;
  border-color: #1a5c5c !important;
  text-align: center;
  font-weight: bold;
}

:deep(.ant-table-tbody > tr > td) {
  background-color: #083838 !important;
  color: #fff !important;
  border-color: #1a5c5c !important;
  text-align: center;
}

:deep(.ant-table-tbody > tr:hover > td) {
  background-color: #135a5a !important;
}

:deep(.highlight-row) > td {
  background-color: #135a5a !important;
  border-color: #1a5c5c !important;
}

:deep(.ant-table-tbody > tr > td) {
  padding: 12px 16px;
}

</style>