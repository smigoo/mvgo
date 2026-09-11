<template>
  <div class="mv-1785781275696-cbb4db83">
    <!-- 底层装饰背景图 -->
    <div class="bg-layer-4" :style="{ backgroundImage: `url(${bg4})` }"></div>

    <!-- 顶部标题栏 -->
    <div class="header-section" :style="{ backgroundImage: `url(${bg1})` }">
      <div class="header-left">
        <img :src="icongroup4114" alt="装饰" class="header-group-icon" />
        <span class="title-text">运单信息</span>
        <div class="plate-tag">苏A 12345</div>
      </div>
      <div class="header-right">
        <button class="close-btn" @click="handleClose" aria-label="关闭弹窗">
          <img :src="icon5" alt="关闭" class="close-icon" />
        </button>
      </div>
      <!-- 标题栏底部装饰线 -->
      <img :src="icon1" class="header-line" />
      <!-- 其他装饰图标引用 -->
      <img :src="icon2" class="header-rect" />
      <img :src="icon3" class="header-rect-backup" />
    </div>

    <!-- 表格区 -->
    <div class="table-section" :style="{ backgroundImage: `url(${bg2})` }">
      <a-table
        :columns="columns"
        :data-source="tableData"
        :pagination="false"
        :row-class-name="(record, index) => index === activeRowIndex ? 'selected-row' : ''"
        :custom-row="customRow"
        size="small"
        class="custom-table"
      />
    </div>

    <!-- 详情区 -->
    <div class="details-section" :style="{ backgroundImage: `url(${bg3})` }">
      <div class="details-title">
        <div class="title-icon-small"></div>
        <span>运单详情</span>
      </div>
      <div class="details-content">
        <div class="details-left">
          <div class="detail-grid">
            <div class="detail-item" v-for="(item, index) in detailItems" :key="index">
              <span class="detail-label">{{ item.label }}</span>
              <span class="detail-value">{{ item.value }}</span>
            </div>
          </div>
        </div>
        <div class="details-right">
          <img :src="img1" alt="车辆监控截图" class="monitor-img" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import bg4 from '../resources/images/bg-98993.png'
import bg1 from '../resources/images/bg-2.png'
import icon5 from '../resources/images/Union-98964.png'
import icon1 from '../resources/images/分割线-98952.png'
import icon2 from '../resources/images/矩形-98954.png'
import icon3 from '../resources/images/矩形备份-98955.png'
import bg2 from '../resources/images/bg-98973.png'
import bg3 from '../resources/images/bg-98983.png'
import img1 from '../resources/images/img-99044.png'
import icongroup4114 from '../resources/images/Group_4114-98956.png'

/**
 * 运单信息弹窗组件
 * 展示危化品运输车辆的运单列表与详情，支持行点击切换详情数据。
 */
import { ref, computed} from 'vue'

// 资源变量由系统自动注入：bg1, bg2, bg3, bg4, icon1, icon2, icon3, icongroup4114, icon5, img1

// #region 响应式状态
const activeRowIndex = ref(0)
// #endregion

// #region 表格配置与数据
const columns = ref([
  { title: '运单编号', dataIndex: 'waybillNo', key: 'waybillNo', ellipsis: true },
  { title: '危化品名称', dataIndex: 'hazardName', key: 'hazardName' },
  { title: '超运地', dataIndex: 'origin', key: 'origin' },
  { title: '实际发车时间', dataIndex: 'departTime', key: 'departTime' },
  { title: '目的地', dataIndex: 'destination', key: 'destination' },
  { title: '预计到达时间', dataIndex: 'arriveTime', key: 'arriveTime' },
  { title: '满载情况', dataIndex: 'loadStatus', key: 'loadStatus' },
  { title: '运输状态', dataIndex: 'transportStatus', key: 'transportStatus' }
])

const tableData = ref([
  {
    key: '1',
    waybillNo: '3203502388...',
    hazardName: '烟花',
    origin: '江阴',
    departTime: '2023-11-22 06:20:46',
    destination: '靖江',
    arriveTime: '--',
    loadStatus: '满载',
    transportStatus: '在途',
    detail: {
      originFull: '江苏省无锡市江阴市',
      hazardNameFull: '烟花',
      categoryName: '危险品(1类4项)',
      destinationFull: '江苏省泰州市靖江市',
      distance: '200(KM)',
      departTimeFull: '2023-11-22 06:20:46',
      arriveTimeFull: '2023-11-22 12:04:21',
      loadStatusFull: '满载货物',
      totalWeight: '9.8(吨)',
      driverName: '张悦',
      driverPhone: '13955086495',
      remark: '栖霞大道浦口104国道桥宁马高速路路二桥百水桥栖霞大道'
    }
  },
  {
    key: '2',
    waybillNo: '3203502388...',
    hazardName: '硫酸',
    origin: '无锡',
    departTime: '2023-11-20 06:20:46',
    destination: '泰州',
    arriveTime: '--',
    loadStatus: '满载',
    transportStatus: '在途',
    detail: {
      originFull: '江苏省无锡市',
      hazardNameFull: '硫酸',
      categoryName: '危险品(8类)',
      destinationFull: '江苏省泰州市',
      distance: '150(KM)',
      departTimeFull: '2023-11-20 06:20:46',
      arriveTimeFull: '2023-11-20 10:00:00',
      loadStatusFull: '满载货物',
      totalWeight: '15.0(吨)',
      driverName: '李四',
      driverPhone: '13800138000',
      remark: '无'
    }
  },
  {
    key: '3',
    waybillNo: '3203502388...',
    hazardName: '硫酸',
    origin: '江阴',
    departTime: '2023-11-19 06:20:46',
    destination: '靖江',
    arriveTime: '--',
    loadStatus: '满载',
    transportStatus: '在途',
    detail: {
      originFull: '江苏省无锡市江阴市',
      hazardNameFull: '硫酸',
      categoryName: '危险品(8类)',
      destinationFull: '江苏省泰州市靖江市',
      distance: '200(KM)',
      departTimeFull: '2023-11-19 06:20:46',
      arriveTimeFull: '2023-11-19 12:00:00',
      loadStatusFull: '满载货物',
      totalWeight: '12.5(吨)',
      driverName: '王五',
      driverPhone: '13900139000',
      remark: '无'
    }
  }
])
// #endregion

// #region 计算属性
// 根据当前选中行计算详情键值对数据
const detailItems = computed(() => {
  const current = tableData.value[activeRowIndex.value]
  if (!current) return []
  const d = current.detail
  return [
    { label: '起运地', value: d.originFull },
    { label: '危险品名称', value: d.hazardNameFull },
    { label: '分类名称', value: d.categoryName },
    { label: '目的地', value: d.destinationFull },
    { label: '运输里程', value: d.distance },
    { label: '发车时间', value: d.departTimeFull },
    { label: '预计到达时间', value: d.arriveTimeFull },
    { label: '满载情况', value: d.loadStatusFull },
    { label: '总重量', value: d.totalWeight },
    { label: '驾驶员姓名', value: d.driverName },
    { label: '驾驶员电话', value: d.driverPhone },
    { label: '备注', value: d.remark }
  ]
})
// #endregion

// #region 交互方法
// 表格行点击事件，切换选中行并联动刷新详情
const customRow = (record, index) => {
  return {
    onClick: () => {
      activeRowIndex.value = index
    }
  }
}

// 关闭弹窗事件
const handleClose = () => {
  console.log('关闭运单信息弹窗')
}
// #endregion
</script>

<style lang="less" scoped>
@import '../resources/styles/index.less';

.mv-1785781275696-cbb4db83 {
  width: 100%;
  height: 100%;
  /* [Style Refine] fills[0].color → rgb(0, 48, 50) */
  background: rgb(0, 48, 50); 
  display: flex;
  flex-direction: column;
  color: #FFFFFF;
  font-size: 14px;
  overflow: hidden;
  box-sizing: border-box;
  position: relative;

  .bg-layer-4 {
    position: absolute;
    inset: 0;
    /* [Style Refine] 背景图精确还原红线：必须使用 100% 100% */
    background-size: 100% 100%
    pointer-events: none;
    z-index: 0;
  }

  .header-section {
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    position: relative;
    /* [Style Refine] 背景图精确还原红线：必须使用 100% 100% */
    background-size: 100% 100%
    flex-shrink: 0;
    z-index: 1;

    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
      z-index: 2;

      .header-group-icon {
        width: 17px;
        height: 18px;
        object-fit: contain;
      }

      .title-text {
        /* [Style Refine] typography.fontSize → 20px */
        font-size: 20px;
        font-weight: 400;
        color: #FFFFFF;
      }

      .plate-tag {
        /* [Style Refine] fills[0].color → rgb(176, 123, 0) */
        background: rgb(176, 123, 0);
        color: #FFFFFF;
        padding: 0 6px;
        /* [Style Refine] cornerRadius → 4px */
        border-radius: 4px;
        font-size: 14px;
        /* [Style Refine] strokes[0].color → #FFFFFF */
        border: 1px solid #FFFFFF;
        display: flex;
        align-items: center;
        height: 24px;
      }
    }

    .header-right {
      z-index: 2;
      .close-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        outline: none;
        
        .close-icon {
          width: 15px;
          height: 15px;
          object-fit: contain;
        }
      }
    }

    .header-line {
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 4px;
      object-fit: fill;
      z-index: 1;
    }
    
    .header-rect, .header-rect-backup {
      position: absolute;
      bottom: 2px;
      left: 50px;
      object-fit: contain;
      z-index: 1;
      opacity: 0.8;
    }
    .header-rect-backup {
      left: 75px;
    }
  }

  .table-section {
    /* [Layout Refine] Figma bbox height → 140px */
    height: 140px;
    padding: 4px 14px;
    /* [Style Refine] 背景图精确还原红线：必须使用 100% 100% */
    background-size: 100% 100%
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    z-index: 1;

    .custom-table {
      width: 100%;
      height: 100%;
      
      :deep(.ant-table) {
        background: transparent;
        color: #FFFFFF;
      }
      :deep(.ant-table-thead > tr > th) {
        /* [Style Refine] fills[0].color → rgb(0, 55, 58) */
        background: rgb(0, 55, 58);
        color: #FFFFFF;
        border-bottom: none;
        /* [Style Refine] typography.fontWeight → 700 */
        font-weight: 700;
        font-size: 14px;
        padding: 5px 8px;
      }
      :deep(.ant-table-tbody > tr > td) {
        /* [Style Refine] fills[0].color → rgb(0, 70, 75) */
        background: rgb(0, 70, 75);
        color: #FFFFFF;
        border-bottom: none;
        /* [Style Refine] typography.fontWeight → 400 */
        font-weight: 400;
        font-size: 14px;
        padding: 5px 8px;
      }
      :deep(.ant-table-tbody > tr.selected-row > td) {
        /* [Style Refine] fills[0].color → rgb(1, 67, 71) */
        background: rgb(1, 67, 71);
        /* [Style Refine] effects[0] → inner shadow */
        box-shadow: inset 0 0 13.5px rgba(27, 255, 221, 0.85);
      }
      :deep(.ant-table-tbody > tr:hover > td) {
        background: rgba(24, 255, 206, 0.1);
      }
      :deep(.ant-table-placeholder) {
        background: transparent;
      }
    }
  }

  .details-section {
    /* [Layout Refine] 占据剩余空间 */
    flex: 1;
    min-height: 0;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    /* [Style Refine] 背景图精确还原红线：必须使用 100% 100% */
    background-size: 100% 100%
    flex-shrink: 0;
    z-index: 1;

    .details-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      /* [Style Refine] typography.fontSize → 16px, fontWeight → 700 */
      font-size: 16px;
      font-weight: 700;
      color: #FFFFFF;

      .title-icon-small {
        width: 10px;
        height: 10px;
        /* [Style Refine] fills[0].color → rgb(217, 217, 217) */
        background: rgb(217, 217, 217);
        transform: rotate(45deg);
      }
    }

    .details-content {
      flex: 1;
      display: flex;
      gap: 20px;
      min-height: 0;

      .details-left {
        flex: 1;
        min-width: 0;
        .detail-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px 24px;
          
          .detail-item {
            display: flex;
            align-items: center;
            /* [Layout Refine] Figma itemSpacing → 5px */
            gap: 5px;
            font-size: 14px;
            line-height: 21px;
            
            .detail-label {
              color: #FFFFFF;
              flex-shrink: 0;
              min-width: 70px;
              text-align: right;
              /* [Style Refine] typography.fontWeight → 400 */
              font-weight: 400;
            }
            .detail-value {
              color: #FFFFFF;
              /* [Style Refine] typography.fontWeight → 700 */
              font-weight: 700;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
          }
        }
      }

      .details-right {
        width: 237px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        
        .monitor-img {
          width: 237px;
          height: 155px;
          object-fit: cover;
          /* [Style Refine] strokes[0].color → #FFFFFF */
          border: 1px solid #FFFFFF;
        }
      }
    }
  }
}
</style>