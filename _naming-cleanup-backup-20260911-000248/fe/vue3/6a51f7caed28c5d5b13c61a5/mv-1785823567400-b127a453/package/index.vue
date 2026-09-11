<template>
  <div class="mv-1785823567400-b127a453">
    <!-- 头部区域 -->
    <div class="waybill-header">
      <!-- 头部背景装饰 -->
      <div class="header-bg">
        <!-- 左侧菱形图标 -->
        <div class="header-diamond-icon">
          <img :src="icongroup4114" class="diamond-img" alt="菱形图标" />
        </div>
        <!-- 标题文字 -->
        <span class="header-title">运单信息</span>
        <!-- 分割线装饰 -->
        <img :src="icon1" class="header-divider" alt="分割线" />
        <!-- 矩形装饰 -->
        <img :src="icon2" class="header-rect" alt="矩形" />
        <!-- 矩形备份装饰 -->
        <img :src="icon3" class="header-rect-backup" alt="矩形备份" />
      </div>
      <!-- 车牌标签 -->
      <div class="plate-tag">
        <span class="plate-text">苏A 12345</span>
      </div>
      <!-- 关闭按钮 -->
      <div class="close-btn" @click="handleClose">
        <img :src="icon5" class="close-icon" alt="关闭" />
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="waybill-content">
      <!-- 运单列表表格 -->
      <div class="waybill-table-section">
        <!-- 表头 -->
        <div class="table-header-row">
          <div class="table-header-bg" :style="{ backgroundImage: `url(${bg1})` }"></div>
          <div class="table-header-cells">
            <span class="th-cell">运单编号</span>
            <span class="th-cell">危化品名称</span>
            <span class="th-cell">超运地</span>
            <span class="th-cell">实际发车时间</span>
            <span class="th-cell">目的地</span>
            <span class="th-cell">预计到达时间</span>
            <span class="th-cell">满载情况</span>
            <span class="th-cell">运输状态</span>
          </div>
        </div>
        <!-- 数据行 -->
        <div
          v-for="(row, index) in tableData"
          :key="row.id"
          :class="['table-data-row', { 'table-data-row--active': selectedRowId === row.id }]"
          @click="handleRowClick(row.id)"
        >
          <div class="table-row-bg" :style="{ backgroundImage: `url(${getRowBg(index)})` }"></div>
          <div class="table-row-cells">
            <span class="td-cell">{{ row.waybillNo }}</span>
            <span class="td-cell">{{ row.hazmatName }}</span>
            <span class="td-cell">{{ row.origin }}</span>
            <span class="td-cell">{{ row.departTime }}</span>
            <span class="td-cell">{{ row.destination }}</span>
            <span class="td-cell">{{ row.eta }}</span>
            <span class="td-cell">{{ row.loadStatus }}</span>
            <span class="td-cell">{{ row.transportStatus }}</span>
          </div>
        </div>
      </div>

      <!-- 运单详情标题 -->
      <div class="details-title-section">
        <div class="details-diamond"></div>
        <span class="details-title-text">运单详情</span>
        <div class="details-title-line"></div>
      </div>

      <!-- 运单详情内容 -->
      <div class="waybill-details-section">
        <!-- 左侧文本信息 -->
        <div class="details-text-info">
          <div class="info-grid">
            <!-- 第一行 -->
            <div class="info-item">
              <span class="info-label">起运地</span>
              <span class="info-value">江苏省无锡市江阴市</span>
            </div>
            <div class="info-item">
              <span class="info-label">危化品名称</span>
              <span class="info-value">烟花</span>
            </div>
            <!-- 第二行 -->
            <div class="info-item">
              <span class="info-label">分类名称</span>
              <span class="info-value">危险品(1类4项)</span>
            </div>
            <div class="info-item">
              <span class="info-label">目的地</span>
              <span class="info-value">江苏省泰州市靖江市</span>
            </div>
            <!-- 第三行 -->
            <div class="info-item">
              <span class="info-label">运输里程</span>
              <span class="info-value">200(KM)</span>
            </div>
            <div class="info-item">
              <span class="info-label">发车时间</span>
              <span class="info-value">2023-11-22 06:20:46</span>
            </div>
            <!-- 第四行 -->
            <div class="info-item">
              <span class="info-label">预计到达时间</span>
              <span class="info-value">2023-11-22 12:04:21</span>
            </div>
            <div class="info-item">
              <span class="info-label">满载情况</span>
              <span class="info-value">满载货物</span>
            </div>
            <!-- 第五行 -->
            <div class="info-item">
              <span class="info-label">总重量</span>
              <span class="info-value">9.8(吨)</span>
            </div>
            <div class="info-item">
              <span class="info-label">驾驶员姓名</span>
              <span class="info-value">张悦</span>
            </div>
            <!-- 第六行 -->
            <div class="info-item">
              <span class="info-label">驾驶员电话</span>
              <span class="info-value">13955086495</span>
            </div>
            <div class="info-item"></div>
            <!-- 备注行（跨两列） -->
            <div class="info-item info-item--full">
              <span class="info-label">备注</span>
              <span class="info-value">栖霞大道浦口104国道桥宁马高速路路二桥百水桥栖霞大道</span>
            </div>
          </div>
        </div>
        <!-- 右侧监控图片 -->
        <div class="details-image">
          <img :src="img1" class="monitor-img" alt="监控图片" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>

import icon1 from '../resources/images/分割线-98952.png'
import icon2 from '../resources/images/矩形-98954.png'
import icon3 from '../resources/images/矩形备份-98955.png'
import icon5 from '../resources/images/Union-98964.png'
import bg1 from '../resources/images/bg-2.png'
import img1 from '../resources/images/img-99044.png'
import bg2 from '../resources/images/bg-98973.png'
import bg3 from '../resources/images/bg-98983.png'
import bg4 from '../resources/images/bg-98993.png'
import icongroup4114 from '../resources/images/Group_4114-98956.png'

/**
 * 运单信息组件
 * 展示危化品运输运单信息，包含运单列表表格和运单详情
 * 支持行选中交互和关闭弹窗交互
 */
import { ref, onMounted, onUnmounted} from 'vue'

// 引入系统自动注入的图片资源变量

// #region 1. Props定义
const props = defineProps({
  // 是否可见
  isVisible: { type: Boolean, default: true },
  // 车牌号
  plateNumber: { type: String, default: '苏A 12345' }
})
// #endregion

// #region 2. Emits定义
const emit = defineEmits(['close', 'row-select'])
// #endregion

// #region 3. 响应式状态
// 当前选中的行ID
const selectedRowId = ref('row-1')

// 表格数据（API可绑定替换）
const tableData = ref([
  {
    id: 'row-1',
    waybillNo: '3203502388...',
    hazmatName: '烟花',
    origin: '江阴',
    departTime: '2023-11-22 06:20:46',
    destination: '靖江',
    eta: '--',
    loadStatus: '满载',
    transportStatus: '在途'
  },
  {
    id: 'row-2',
    waybillNo: '3203502388...',
    hazmatName: '硫酸',
    origin: '无锡',
    departTime: '2023-11-20 06:20:46',
    destination: '泰州',
    eta: '--',
    loadStatus: '满载',
    transportStatus: '在途'
  },
  {
    id: 'row-3',
    waybillNo: '3203502388...',
    hazmatName: '硫酸',
    origin: '江阴',
    departTime: '2023-11-19 06:20:46',
    destination: '靖江',
    eta: '--',
    loadStatus: '满载',
    transportStatus: '在途'
  }
])
// #endregion

// #region 4. 计算属性
// 根据行索引返回对应的背景图
const getRowBg = (index) => {
  const bgMap = ref([bg2, bg3, bg4])
  return bgMap[index] || bg2
}
// #endregion

// #region 5. 方法
// 处理行点击选中
const handleRowClick = (rowId) => {
  selectedRowId.value = rowId
  emit('row-select', rowId)
}

// 处理关闭按钮点击
const handleClose = () => {
  emit('close')
}
// #endregion

// #region 6. 生命周期
onMounted(() => {
  // 组件挂载完成
})

onUnmounted(() => {
  // 清理资源
})
// #endregion

</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

// 根容器 - 深色背景面板
.mv-1785823567400-b127a453 {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #003032;
  overflow: hidden;
  font-family: 'Source Han Sans CN', sans-serif;
  color: #ffffff;
  font-size: 14px;
}

// 头部区域
.waybill-header {
  width: 100%;
  height: 34px;
  display: flex;
  flex-direction: row;
  align-items: center;
  position: relative;
  flex-shrink: 0;
}

// 头部背景装饰区
.header-bg {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
  position: relative;
  background: linear-gradient(90deg, rgba(14, 205, 190, 0.3) 0%, rgba(14, 205, 190, 0.05) 100%);
  box-shadow: inset 0 0 10px rgba(4, 254, 197, 0.2), inset 0 0 2px rgba(48, 245, 255, 1);
}

// 菱形图标
.header-diamond-icon {
  width: 17px;
  height: 18px;
  margin-left: 12px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  .diamond-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

// 标题文字
.header-title {
  font-family: 'PangMenZhengDao', 'Source Han Sans CN', sans-serif;
  font-size: 20px;
  font-weight: 400;
  line-height: 24px;
  color: #ffffff;
  margin-left: 8px;
  white-space: nowrap;
}

// 分割线装饰
.header-divider {
  width: 733px;
  height: 4px;
  margin-left: 10px;
  object-fit: contain;
  flex-shrink: 0;
}

// 矩形装饰
.header-rect {
  width: 20px;
  height: 1px;
  margin-left: 4px;
  object-fit: contain;
  flex-shrink: 0;
}

// 矩形备份装饰
.header-rect-backup {
  width: 12px;
  height: 2px;
  margin-left: 2px;
  object-fit: contain;
  flex-shrink: 0;
}

// 车牌标签
.plate-tag {
  position: absolute;
  right: 40px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  height: 24px;
  background: #b07b00;
  border: 1px solid rgba(255, 255, 255, 1);
  border-radius: 4px;
  z-index: 2;
}

.plate-text {
  font-family: 'Roboto', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 24px;
  color: #ffffff;
  white-space: nowrap;
}

// 关闭按钮
.close-btn {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 15px;
  height: 15px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;

  &:hover {
    opacity: 0.8;
  }

  .close-icon {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

// 内容区域
.waybill-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px 17px;
  gap: 12px;
}

// 运单列表表格区域
.waybill-table-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

// 表头行
.table-header-row {
  width: 100%;
  height: 32px;
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
}

.table-header-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.table-header-cells {
  position: relative;
  z-index: 1;
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
}

.th-cell {
  flex: 1;
  font-size: 14px;
  font-weight: 700;
  line-height: 21px;
  color: #ffffff;
  text-align: left;
  padding: 0 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  // 实际发车时间和预计到达时间列宽一些
  &:nth-child(4),
  &:nth-child(6) {
    flex: 1.5;
  }
}

// 数据行
.table-data-row {
  width: 100%;
  height: 32px;
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s ease;

  .table-row-bg {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
  }

  .table-row-cells {
    position: relative;
    z-index: 1;
    width: 100%;
    display: flex;
    flex-direction: row;
    align-items: center;
  }

  // 选中态
  &--active {
    border: 1px solid #18ffce;
    background: rgba(0, 240, 255, 0.1);
    box-shadow: inset 0 0 8px rgba(27, 255, 221, 0.85);
  }

  &:hover:not(&--active) {
    background: rgba(0, 240, 255, 0.05);
  }
}

.td-cell {
  flex: 1;
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: #ffffff;
  text-align: left;
  padding: 0 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &:nth-child(4),
  &:nth-child(6) {
    flex: 1.5;
  }
}

// 运单详情标题
.details-title-section {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.details-diamond {
  width: 10px;
  height: 10px;
  background: #d9d9d9;
  transform: rotate(45deg);
  flex-shrink: 0;
}

.details-title-text {
  font-size: 16px;
  font-weight: 700;
  line-height: 24px;
  color: #ffffff;
  white-space: nowrap;
}

.details-title-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, #18ffce 0%, transparent 100%);
}

// 运单详情内容区域
.waybill-details-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
  gap: 16px;
}

// 左侧文本信息
.details-text-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
}

.info-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 5px;
  min-height: 21px;

  // 跨两列的备注项
  &--full {
    grid-column: span 2;
  }
}

.info-label {
  font-size: 14px;
  font-weight: 400;
  line-height: 21px;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  flex-shrink: 0;
}

.info-value {
  font-size: 14px;
  font-weight: 700;
  line-height: 21px;
  color: #ffffff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// 右侧监控图片
.details-image {
  width: 237px;
  height: 155px;
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.2);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;

  .monitor-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}</style>