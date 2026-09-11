<template>
  <section class="warning-board">
    <div class="glow-layer"></div>

    <header class="board-header">
      <div class="title-wrap">
        <span class="diamond-icon" aria-hidden="true"></span>
        <h1>今日预警列表</h1>
      </div>

      <div class="status-wrap">
        <button class="person-status" type="button" @click="handleStatusClick('张三')">
          <span class="person-icon" aria-hidden="true"></span>
          <span class="person-name">张三</span>
          <span class="processed">已处理 <b>1</b></span>
        </button>
        <button class="person-status" type="button" @click="handleStatusClick('李四')">
          <span class="person-icon" aria-hidden="true"></span>
          <span class="person-name">李四</span>
          <span class="processed">已处理 <b>0</b></span>
        </button>
      </div>
    </header>

    <main class="table-panel">
      <a-table
        class="warning-table"
        :columns="columns"
        :data-source="data"
        :pagination="false"
        :row-key="record => record.key"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'result'">
            <span :class="['result-text', record.result === '待处理' ? 'pending' : 'done']">
              {{ record.result }}
            </span>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <button class="verify-link" type="button" @click="handleVerify(record)">查看核实</button>
          </template>
        </template>
      </a-table>
    </main>
  </section>
</template>

<script setup>
import { Table as ATable } from 'ant-design-vue'

defineOptions({
  name: 'mv-lite-1786851198219-a726e505',
  components: { ATable }
})

const columns = [
  { title: '预警项', dataIndex: 'warning', key: 'warning', width: '15%' },
  { title: '传感器节点', dataIndex: 'node', key: 'node', width: '15%' },
  { title: '桩号', dataIndex: 'stake', key: 'stake', width: '12%' },
  { title: '异常原因', dataIndex: 'reason', key: 'reason', width: '18%' },
  { title: '异常时间', dataIndex: 'time', key: 'time', width: '14%' },
  { title: '处理结果', dataIndex: 'result', key: 'result', width: '14%' },
  { title: '操作', dataIndex: 'action', key: 'action', width: '12%' }
]

const data = [
  {
    key: '1',
    warning: '管片沉降',
    node: 'ZYN6-2',
    stake: 'K5+900',
    reason: '数值偏小异常',
    time: '18:20',
    result: '待处理'
  },
  {
    key: '2',
    warning: '接缝位移',
    node: 'ZYN6-3',
    stake: 'K4+200',
    reason: '网络异常',
    time: '18:20',
    result: '待处理'
  },
  {
    key: '3',
    warning: '管片沉降',
    node: 'ZYN6-2',
    stake: 'K3+700',
    reason: '网络异常',
    time: '18:20',
    result: '已处理'
  }
]

const handleVerify = record => {
  console.log('查看核实', record)
}

const handleStatusClick = name => {
  console.log('人员状态', name)
}
</script>

<style scoped>
.warning-board {
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  color: #e8ffff;
  background:
    radial-gradient(circle at 82% 0%, rgba(16, 255, 218, 0.24), transparent 30%),
    linear-gradient(108deg, rgba(0, 118, 101, 0.22) 0%, rgba(0, 58, 53, 0.4) 33%, rgba(0, 86, 74, 0.22) 34%, rgba(0, 45, 43, 0.58) 100%),
    repeating-linear-gradient(90deg, rgba(67, 255, 226, 0.055) 0, rgba(67, 255, 226, 0.055) 1px, transparent 1px, transparent 106px),
    repeating-linear-gradient(0deg, rgba(67, 255, 226, 0.045) 0, rgba(67, 255, 226, 0.045) 1px, transparent 1px, transparent 56px),
    #003a35;
  border: 1px solid rgba(0, 230, 195, 0.62);
  box-shadow:
    inset 0 0 18px rgba(0, 230, 195, 0.36),
    inset 0 0 46px rgba(0, 130, 116, 0.3);
  font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
}

.glow-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(78deg, transparent 0%, transparent 38%, rgba(136, 255, 238, 0.09) 39%, rgba(136, 255, 238, 0.03) 48%, transparent 49%),
    linear-gradient(90deg, rgba(0, 255, 213, 0.16), transparent 10%, transparent 82%, rgba(0, 255, 213, 0.1)),
    radial-gradient(ellipse at 95% 12%, rgba(54, 255, 225, 0.22), transparent 24%);
  opacity: 0.9;
}

.board-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 18%;
  min-height: 56px;
  padding: 0 44px 0 22px;
  box-sizing: border-box;
  background: linear-gradient(180deg, rgba(0, 207, 177, 0.27), rgba(3, 66, 59, 0.2) 78%, rgba(0, 230, 195, 0.08));
  border-bottom: 1px solid rgba(11, 189, 169, 0.7);
  box-shadow:
    inset 0 3px 9px rgba(0, 255, 218, 0.65),
    inset 0 -1px 15px rgba(0, 230, 195, 0.26),
    0 0 14px rgba(0, 230, 195, 0.4);
}

.title-wrap {
  display: flex;
  align-items: center;
  min-width: 0;
}

.title-wrap h1 {
  margin: 0 0 0 14px;
  font-size: clamp(20px, 1.42vw, 26px);
  line-height: 1.15;
  font-weight: 800;
  letter-spacing: 1px;
  color: #eaffff;
  text-shadow: 0 0 8px rgba(0, 230, 195, 0.7);
}

.diamond-icon {
  position: relative;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  transform: rotate(45deg);
  background: linear-gradient(135deg, #baffff 0%, #00e6c3 46%, #16746f 100%);
  box-shadow: 0 0 12px rgba(0, 230, 195, 0.88);
}

.diamond-icon::before,
.diamond-icon::after {
  content: "";
  position: absolute;
  inset: 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.55);
  border-left: 1px solid rgba(255, 255, 255, 0.4);
}

.diamond-icon::after {
  inset: -4px;
  background: rgba(0, 230, 195, 0.1);
  filter: blur(5px);
  z-index: -1;
}

.status-wrap {
  display: flex;
  align-items: center;
  gap: 56px;
  height: 100%;
}

.person-status {
  display: inline-flex;
  align-items: center;
  height: 44px;
  padding: 0;
  color: #e8ffff;
  background: transparent;
  border: 0;
  cursor: pointer;
  font: inherit;
  text-shadow: 0 0 7px rgba(0, 230, 195, 0.42);
}

.person-icon {
  position: relative;
  width: 32px;
  height: 32px;
  margin-right: 12px;
  background:
    radial-gradient(circle at 48% 19%, #cbffff 0 13%, #00e6c3 14% 29%, transparent 30%),
    linear-gradient(135deg, transparent 18%, #1ffff0 19% 50%, #0c7a71 51% 82%, transparent 83%);
  filter: drop-shadow(0 0 8px rgba(0, 230, 195, 0.9));
}

.person-icon::before,
.person-icon::after {
  content: "";
  position: absolute;
  left: 7px;
  bottom: 2px;
  width: 18px;
  height: 12px;
  transform: skewX(-28deg);
  background: linear-gradient(135deg, #8ffff5, #00e6c3 54%, #09564f);
  border: 1px solid rgba(172, 255, 247, 0.35);
}

.person-icon::after {
  left: 3px;
  bottom: 8px;
  width: 14px;
  height: 9px;
  opacity: 0.72;
}

.person-name {
  margin-right: 26px;
  font-size: clamp(15px, 0.93vw, 18px);
  white-space: nowrap;
}

.processed {
  font-size: clamp(15px, 0.9vw, 17px);
  white-space: nowrap;
}

.processed b {
  font-weight: 600;
}

.table-panel {
  position: relative;
  z-index: 1;
  height: 82%;
  padding: 22px 20px 20px;
  box-sizing: border-box;
}

.warning-table {
  width: 100%;
  height: 100%;
}

:deep(.warning-table .ant-table) {
  height: 100%;
  color: #e8ffff;
  background: transparent;
  font-family: inherit;
}

:deep(.warning-table .ant-table-container) {
  border: 0;
}

:deep(.warning-table .ant-table-content) {
  height: 100%;
}

:deep(.warning-table table) {
  height: 100%;
  table-layout: fixed !important;
  border-collapse: collapse;
}

:deep(.warning-table .ant-table-thead > tr > th) {
  height: 62px;
  padding: 0 24px;
  color: #f0ffff;
  font-size: clamp(17px, 1.12vw, 21px);
  font-weight: 800;
  line-height: 1.2;
  text-align: left;
  background: linear-gradient(180deg, rgba(8, 123, 107, 0.82), rgba(6, 79, 69, 0.76));
  border: 0;
  border-bottom: 1px solid rgba(20, 246, 218, 0.48);
  text-shadow: 0 0 7px rgba(0, 230, 195, 0.35);
}

:deep(.warning-table .ant-table-thead > tr > th::before) {
  display: none !important;
}

:deep(.warning-table .ant-table-tbody > tr > td) {
  height: 50px;
  padding: 0 24px;
  color: #e8ffff;
  font-size: clamp(16px, 0.98vw, 19px);
  line-height: 1.2;
  text-align: left;
  background: rgba(4, 78, 69, 0.52);
  border-bottom: 1px solid rgba(11, 189, 169, 0.46);
}

:deep(.warning-table .ant-table-tbody > tr:nth-child(2n) > td) {
  background: rgba(3, 66, 59, 0.44);
}

:deep(.warning-table .ant-table-tbody > tr:hover > td) {
  background: rgba(5, 101, 88, 0.58) !important;
}

:deep(.warning-table .ant-table-cell) {
  white-space: nowrap;
}

.result-text.pending {
  color: #ffd929;
  text-shadow: 0 0 8px rgba(255, 217, 41, 0.35);
}

.result-text.done {
  color: #26e2e4;
  text-shadow: 0 0 8px rgba(38, 226, 228, 0.38);
}

.verify-link {
  padding: 0;
  color: #00f0b9;
  font: inherit;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-shadow: 0 0 8px rgba(0, 230, 195, 0.48);
}

.verify-link:hover {
  color: #75ffe7;
}

@media (max-width: 1000px) {
  .board-header {
    padding-right: 22px;
  }

  .status-wrap {
    gap: 22px;
  }

  .person-name {
    margin-right: 12px;
  }

  .table-panel {
    padding: 14px 12px 12px;
  }

  :deep(.warning-table .ant-table-thead > tr > th),
  :deep(.warning-table .ant-table-tbody > tr > td) {
    padding: 0 12px;
  }
}
/* Ant Design Vue Table 内部背景层：避免透明单元格透出默认白底 */
:deep(.warning-table .ant-table-container),
:deep(.warning-table .ant-table-content),
:deep(.warning-table table) {
  background: transparent;
  color: inherit;
}

/* Ant Design Vue 4 通过单元格状态类控制行悬浮背景 */
:deep(.warning-table .ant-table-tbody > tr > td.ant-table-cell-row-hover) {
  background: rgba(5, 101, 88, 0.58) !important;
}

</style>