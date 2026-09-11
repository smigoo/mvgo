<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

// 子组件导入 - section 级别
import SectionHeaderStats from './components/SectionHeaderStats.vue'
import SectionMainContent from './components/SectionMainContent.vue'
import SectionHeader from './components/SectionHeader.vue'
import Frame2136638825 from './components/Frame2136638825.vue'
import Frame2136638826 from './components/Frame2136638826.vue'
import Frame2136638827 from './components/Frame2136638827.vue'
import SectionSwitch from './components/SectionSwitch.vue'
import SectionActive from './components/SectionActive.vue'
import SectionActiveLine1 from './components/SectionActiveLine1.vue'
import SectionActiveLine2 from './components/SectionActiveLine2.vue'
import SectionActiveIcon from './components/SectionActiveIcon.vue'
import SectionDefault from './components/SectionDefault.vue'
import SectionDefaultLine1 from './components/SectionDefaultLine1.vue'
import SectionDefaultLine2 from './components/SectionDefaultLine2.vue'
import SectionDefaultIcon from './components/SectionDefaultIcon.vue'
import SectionAntdTab from './components/SectionAntdTab.vue'
import SectionCons from './components/SectionCons.vue'
import GroupCamera from './components/GroupCamera.vue'
import GroupCameraDecor from './components/GroupCameraDecor.vue'
import GroupRobot from './components/GroupRobot.vue'
import GroupRobotDecor from './components/GroupRobotDecor.vue'
import GroupCoviDetector from './components/GroupCoviDetector.vue'
import GroupCoviDecor from './components/GroupCoviDecor.vue'
import GroupLightMeter from './components/GroupLightMeter.vue'
import GroupLightDecor from './components/GroupLightDecor.vue'
import GroupLidar from './components/GroupLidar.vue'
import GroupLidarDecor from './components/GroupLidarDecor.vue'
import GroupWindSensor from './components/GroupWindSensor.vue'
import GroupWindDecor from './components/GroupWindDecor.vue'
import GroupTempHumidity from './components/GroupTempHumidity.vue'
import GroupTempDecor from './components/GroupTempDecor.vue'
import GroupEmergencyPhone from './components/GroupEmergencyPhone.vue'
import GroupEmergencyDecor from './components/GroupEmergencyDecor.vue'
import GroupHeightDetector from './components/GroupHeightDetector.vue'
import GroupHeightDecor from './components/GroupHeightDecor.vue'
import GroupCo2Sensor from './components/GroupCo2Sensor.vue'
import GroupCo2Decor from './components/GroupCo2Decor.vue'
import GroupPressureSensor from './components/GroupPressureSensor.vue'
import GroupPressureDecor from './components/GroupPressureDecor.vue'
import GroupWaterQuality from './components/GroupWaterQuality.vue'
import GroupWaterDecor from './components/GroupWaterDecor.vue'

// $mcComponentBuilder 调用（仅此一次，直接解构）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// 当前激活的 Tab
const activeTab = ref('监控')

// Tab 列表数据
const tabList = ref([
  { name: '监控', badge: '3/3740', badgeType: 'primary' },
  { name: '照明', badge: '3', badgeType: 'error' },
  { name: '通风', badge: null },
  { name: '供配电', badge: null },
  { name: '消防', badge: null },
  { name: '交通诱导', badge: null }
])
</script>