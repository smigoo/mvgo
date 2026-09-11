<template>
  <div class="container">
    <!-- 标题栏 -->
    <div class="header">
      <div class="header-left">
        <span class="icon-diamond"></span>
        <span class="title">运单信息</span>
        <span class="tag">苏A 12345</span>
      </div>
      <div class="header-right">
        <button class="close-btn">×</button>
      </div>
    </div>

    <!-- 数据表格 -->
    <div class="table-section">
      <a-table
        :columns="columns"
        :data-source="tableData"
        :pagination="false"
        row-key="id"
        :row-class-name="rowClassName"
        class="custom-table"
      />
    </div>

    <!-- 详情区域 -->
    <div class="detail-section">
      <div class="detail-title">
        <span class="icon-diamond-small"></span>
        运单详情
      </div>
      
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
            <div class="info-item empty"></div>
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
        
        <div class="detail-image-wrapper">
          <div class="monitor-image">
            <!-- 模拟监控图片内容 -->
            <div class="img-overlay-top">
              <span>苏A12345 宁马高速K...</span>
              <span>2023年11月22日 08:27:47.057</span>
            </div>
            <div class="img-content">
               <div class="truck-red"></div>
               <div class="truck-white"></div>
            </div>
            <div class="img-overlay-bottom">
              <span>黄 苏APM32</span>
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
  { title: '运单编号', dataIndex: 'id', key: 'id' },
  { title: '危化品名称', dataIndex: 'name', key: 'name' },
  { title: '超运地', dataIndex: 'origin', key: 'origin' },
  { title: '实际发车时间', dataIndex: 'startTime', key: 'startTime' },
  { title: '目的地', dataIndex: 'dest', key: 'dest' },
  { title: '预计到达时间', dataIndex: 'eta', key: 'eta' },
  { title: '满载情况', dataIndex: 'loadStatus', key: 'loadStatus' },
  { title: '运输状态', dataIndex: 'status', key: 'status' },
];

const tableData = [
  {
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

const rowClassName = (record, index) => {
  return index === 0 ? 'highlight-row' : '';
};
</script>

<style scoped>
:root {
  --bg-color: #001a1a;
  --surface-color: #003333;
  --border-color: #006666;
  --text-color: #ffffff;
  --primary-color: #00ffff;
  --highlight-bg: #004d4d;
  --tag-bg: #d4a017; /* 近似黄色/金色 */
  --tag-text: #000000;
}

.container {
  background-color: #002222; /* 整体背景 */
  color: #ffffff;
  font-family: sans-serif;
  padding: 10px;
  width: 100%;
  box-sizing: border-box;
  min-height: 600px;
  display: flex;
  flex-direction: column;
}

/* 标题栏 */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(to bottom, #004444, #002222);
  padding: 10px 15px;
  border-bottom: 1px solid #006666;
  margin-bottom: 15px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.icon-diamond {
  width: 8px;
  height: 8px;
  background-color: #ffffff;
  transform: rotate(45deg);
  display: inline-block;
}

.title {
  font-size: 18px;
  font-weight: bold;
  color: #ffffff;
}

.tag {
  background-color: #d4a017; /* 苏A标签颜色 */
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
  background-color: #004444;
}

/* 表格区域 */
.table-section {
  margin-bottom: 20px;
  background-color: #002b2b;
  border: 1px solid #004444;
}

/* 覆盖 Ant Design 表格样式以匹配深色主题 */
:deep(.ant-table) {
  background-color: transparent;
  color: #ffffff;
}

:deep(.ant-table-thead > tr > th) {
  background-color: #004444;
  color: #ffffff;
  border-bottom: 1px solid #006666;
  font-weight: bold;
  text-align: center;
}

:deep(.ant-table-tbody > tr > td) {
  background-color: #002222;
  border-bottom: 1px solid #003333;
  text-align: center;
  color: #cccccc;
}

:deep(.ant-table-tbody > tr.highlight-row > td) {
  background-color: #005555 !important; /* 第一行高亮 */
  color: #ffffff;
}

:deep(.ant-table-tbody > tr:hover > td) {
  background-color: #004444 !important;
}

/* 详情区域 */
.detail-section {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.detail-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 15px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #ffffff;
}

.icon-diamond-small {
  width: 6px;
  height: 6px;
  background-color: #ffffff;
  transform: rotate(45deg);
  display: inline-block;
}

.detail-content {
  display: flex;
  gap: 20px;
  background-color: #001a1a;
  padding: 10px;
  border: 1px solid #003333;
}

.detail-info {
  flex: 2;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-row {
  display: flex;
  gap: 40px; /* 列间距 */
}

.info-row.full-width {
  margin-top: 10px;
}

.info-item {
  flex: 1;
  display: flex;
  font-size: 13px;
  line-height: 1.5;
}

.info-item.empty {
  visibility: hidden;
}

.label {
  color: #aaaaaa;
  margin-right: 10px;
  min-width: 80px;
}

.value {
  color: #ffffff;
}

.detail-image-wrapper {
  flex: 1;
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
}

.monitor-image {
  width: 100%;
  max-width: 300px;
  height: 200px;
  background-color: #000000;
  border: 1px solid #ffffff;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 模拟图片内容 */
.img-overlay-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  background: rgba(0,0,0,0.5);
  color: #fff;
  font-size: 10px;
  padding: 2px 5px;
  display: flex;
  justify-content: space-between;
  z-index: 2;
}

.img-content {
  flex: 1;
  background: #333; /* 路面颜色 */
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
}

/* 模拟卡车 */
.truck-red {
  width: 60px;
  height: 80px;
  background-color: #a52a2a;
  border-radius: 4px;
  position: relative;
}
.truck-red::after {
  content: '';
  position: absolute;
  top: 10px; left: 10px; right: 10px; height: 20px;
  background: #000; /* 挡风玻璃 */
}

.truck-white {
  width: 40px;
  height: 60px;
  background-color: #eee;
  border-radius: 4px;
  position: relative;
}
.truck-white::after {
  content: '';
  position: absolute;
  top: 10px; left: 5px; right: 5px; height: 15px;
  background: #000;
}

.img-overlay-bottom {
  position: absolute;
  bottom: 0;
  left: 0;
  background: rgba(0,0,0,0.5);
  color: #fff;
  font-size: 10px;
  padding: 2px 5px;
  z-index: 2;
}

/* 道路标线模拟 */
.img-content::before {
  content: '';
  position: absolute;
  top: 0; bottom: 0;
  left: 50%;
  width: 2px;
  background: #fff;
  transform: translateX(-50%);
}

</style>