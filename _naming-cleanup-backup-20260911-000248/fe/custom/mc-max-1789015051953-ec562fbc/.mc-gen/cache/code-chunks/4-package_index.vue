<script setup>
import { onMounted, onUnmounted } from 'vue'

// 子组件导入（41个section级子组件）
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
import Group2136637321 from './components/Group2136637321.vue'
import Group1321317970A from './components/Group1321317970A.vue'
import Group2136637552 from './components/Group2136637552.vue'
import Group1321317970B from './components/Group1321317970B.vue'
import Group2136637555 from './components/Group2136637555.vue'
import Group1321317970C from './components/Group1321317970C.vue'
import Group2136637558 from './components/Group2136637558.vue'
import Group1321317970D from './components/Group1321317970D.vue'
import Group2136637550 from './components/Group2136637550.vue'
import Group1321317970E from './components/Group1321317970E.vue'
import Group2136637553 from './components/Group2136637553.vue'
import Group1321317970F from './components/Group1321317970F.vue'
import Group2136637556 from './components/Group2136637556.vue'
import Group1321317970G from './components/Group1321317970G.vue'
import Group2136637559 from './components/Group2136637559.vue'
import Group1321317970H from './components/Group1321317970H.vue'
import Group2136637551 from './components/Group2136637551.vue'
import Group1321317970I from './components/Group1321317970I.vue'
import Group2136637554 from './components/Group2136637554.vue'
import Group1321317970J from './components/Group1321317970J.vue'
import Group2136637557 from './components/Group2136637557.vue'
import Group1321317970K from './components/Group1321317970K.vue'
import Group2136637560 from './components/Group2136637560.vue'
import Group1321317970L from './components/Group1321317970L.vue'

// $mcComponentBuilder 解构（只调用一次）
const { componentProps, businessProps, runtimeBuilder, componentApi } = $mcComponentBuilder()

// onMounted：触发 onload 事件
onMounted(() => {
  runtimeBuilder.publishEvent('device-monitor-onload', {
    componentId: 'device-monitor',
    timestamp: Date.now()
  })
})
</script>