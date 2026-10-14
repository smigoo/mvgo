<template>
  <div class="c-aiot-dpjh-bsjd-group-2136638414">
    <div
      v-for="(item, index) in nodeList"
      :key="index"
      class="c-aiot-dpjh-bsjd-node-card"
    >
      <!-- 图标资源：节点图标 -->
      <img :src="icon4" alt="节点图标" class="c-aiot-dpjh-bsjd-node-icon" style="width:40px;height:40px;object-fit:contain" />

      <div class="c-aiot-dpjh-bsjd-node-info">
        <!-- 第一行：节点名称 + 地址 + 在线/离线标签 -->
        <div class="c-aiot-dpjh-bsjd-node-row-top">
          <span class="c-aiot-dpjh-bsjd-node-name">{{ item.name }}</span>
          <span class="c-aiot-dpjh-bsjd-node-address">{{ item.address }}</span>
          <span class="c-aiot-dpjh-bsjd-node-tag">{{ item.onlineLabel }}</span>
          <span class="c-aiot-dpjh-bsjd-node-tag-value">{{ item.onlineValue }}</span>
          <span class="c-aiot-dpjh-bsjd-node-tag">{{ item.offlineLabel }}</span>
          <span class="c-aiot-dpjh-bsjd-node-tag-value">{{ item.offlineValue }}</span>
        </div>
      </div>

      <!-- 右侧数值：在线/离线数值（大号强调色） -->
      <div class="c-aiot-dpjh-bsjd-node-stats">
        <span class="c-aiot-dpjh-bsjd-node-stat-online">{{ item.total }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import icon4 from '../../resources/images/icon-5808.png'


// 资源引用由系统自动注入（icon4 = icon-5808.png）
// 禁止手写 import 语句

// 部署节点数据（文案严格来自 Figma 文字真值白名单）
const nodeList = [
  {
    name: '江苏联网节点',
    address: '江苏省南京市建邺区江东中路',
    onlineLabel: '在线',
    onlineValue: '3,792',
    offlineLabel: '离线',
    offlineValue: '28',
    total: '3,792'
  },
  {
    name: '江苏沿江公司节点',
    address: '江苏省南京市建邺区江东中路',
    onlineLabel: '在线',
    onlineValue: '2,138',
    offlineLabel: '离线',
    offlineValue: '12',
    total: '2,138'
  },
  {
    name: '湖南交通厅节点',
    address: '湖南省长沙市芙蓉区五一大道',
    onlineLabel: '在线',
    onlineValue: '1,665',
    offlineLabel: '离线',
    offlineValue: '15',
    total: '1,665'
  },
  {
    name: '湖南交建局节点',
    address: '湖南省长沙市芙蓉区五一大道',
    onlineLabel: '在线',
    onlineValue: '1,415',
    offlineLabel: '离线',
    offlineValue: '5',
    total: '1,415'
  },
  {
    name: '安徽交控节点',
    address: '安徽省合肥市包河区徽州大道',
    onlineLabel: '在线',
    onlineValue: '965',
    offlineLabel: '离线',
    offlineValue: '15',
    total: '965'
  },
  {
    name: '平陆运河节点',
    address: '广西壮族自治区南宁市青秀区',
    onlineLabel: '在线',
    onlineValue: '752',
    offlineLabel: '离线',
    offlineValue: '8',
    total: '752'
  }
]
</script>

<style lang="less" scoped>
@import '../../resources/styles/index.less';
</style>