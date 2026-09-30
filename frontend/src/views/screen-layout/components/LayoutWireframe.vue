<!--
  大屏布局 · 线框渲染器
  ------------------------------------------------------------
  纯展示组件：把 ScreenLayout 渲染成结构线框（毫秒级、无 AI、无网络）。
  只负责「填充父容器」，不关心缩放 —— 缩放由父容器决定盒子大小，
  这样同一份线框既能表达 fluid（盒子=视口），也能表达 contain（盒子=等比内接框）。
-->
<template>
  <div class="wf-root">
    <!-- 顶栏 -->
    <div v-if="layout.header?.enabled" class="wf-hf wf-header" :style="headerStyle">
      <span v-if="labels" class="wf-hf-tag">HEADER {{ layout.header.height }}</span>
    </div>

    <!-- 主体 -->
    <div class="wf-body" :style="bodyStyle">
      <div
        v-for="(col, ci) in layout.body.columns"
        :key="col.id"
        class="wf-col"
        :style="{ flexGrow: frValue(col.width), flexBasis: 0 }"
      >
        <div v-for="z in zonesOf(ci)" :key="z.id" class="wf-zone">
          <span v-if="labels && !dense" class="wf-zone-label">{{ ci + 1 }}区{{ z.seq }}</span>
          <span v-else-if="labels && dense" class="wf-zone-dot"></span>
        </div>
      </div>
    </div>

    <!-- 底栏 -->
    <div v-if="layout.footer?.enabled" class="wf-hf wf-footer" :style="footerStyle">
      <span v-if="labels" class="wf-hf-tag">FOOTER {{ layout.footer.height }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ScreenLayout, ZoneConfig } from '@/types/screen-layout'

const props = withDefaults(
  defineProps<{
    layout: ScreenLayout
    /** 是否显示区域编号 */
    labels?: boolean
    /** 紧凑模式：区域角标改为小点，适合缩略图 */
    dense?: boolean
  }>(),
  { labels: true, dense: false },
)

/** 每列内的 zone 列表，附上列内序号 */
const zoneMap = computed<Record<number, Array<{ id: string; seq: number }>>>(() => {
  const map: Record<number, Array<{ id: string; seq: number }>> = {}
  const counter: Record<number, number> = {}
  for (const z of props.layout.body.zones) {
    const ci = z.colIndex
    if (ci === undefined || ci === null || ci < 0) continue
    counter[ci] = (counter[ci] || 0) + 1
    if (!map[ci]) map[ci] = []
    map[ci].push({ id: z.id, seq: counter[ci] })
  }
  return map
})

function zonesOf(colIndex: number): Array<{ id: string; seq: number }> {
  return zoneMap.value[colIndex] || []
}

function frValue(width: string): number {
  const m = /^(\d+(?:\.\d+)?)fr$/.exec(width || '')
  return m ? parseFloat(m[1]) : 1
}

/** 列间距取自第一个 zone 的内边距，保证线框与真实产出一致 */
const gap = computed(() => {
  const z: ZoneConfig | undefined = props.layout.body.zones[0]
  return z?.padding?.left || '8px'
})

const headerStyle = computed(() => ({ height: props.layout.header?.height || '70px' }))
const footerStyle = computed(() => ({ height: props.layout.footer?.height || '50px' }))

const bodyStyle = computed(() => ({
  display: 'flex',
  gap: gap.value,
  padding: gap.value,
}))
</script>

<style scoped>
.wf-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  /*
   * 蓝图底色：刻意与画布的「设计稿背景色」解耦。
   * 线框是结构预览，若跟随设计稿背景（默认 #ffffff），
   * 浅蓝标签与虚线边框会直接失去对比度 —— 结构反而看不清。
   */
  background-color: #0b1219;
  background-image: linear-gradient(rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.02));
}

.wf-hf {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-height: 0;
}

.wf-header {
  background: rgba(56, 132, 255, 0.18);
  border-bottom: 1px solid rgba(56, 132, 255, 0.35);
}

.wf-footer {
  background: rgba(56, 132, 255, 0.1);
  border-top: 1px solid rgba(56, 132, 255, 0.25);
}

.wf-hf-tag {
  font-size: 10px;
  letter-spacing: 0.5px;
  color: rgba(160, 200, 255, 0.75);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: nowrap;
  overflow: hidden;
}

.wf-body {
  flex: 1;
  min-height: 0;
  box-sizing: border-box;
  overflow: hidden;
}

.wf-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  min-height: 0;
}

.wf-zone {
  flex: 1 1 0;
  min-height: 0;
  min-width: 0;
  border: 1px dashed rgba(120, 170, 255, 0.45);
  border-radius: 4px;
  background: rgba(56, 132, 255, 0.07);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.wf-zone-label {
  font-size: 10px;
  color: rgba(150, 190, 255, 0.7);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: nowrap;
}

.wf-zone-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgba(150, 190, 255, 0.5);
}
</style>
