<template>
  <div class="token-dashboard" @keydown.esc="onEscKey">
    <!-- ── 头部：标题 + 面包屑 + 控件（所有维度共用） ── -->
    <div class="dashboard-header" :style="{ borderLeftColor: dimensionTheme.primary }">
      <div class="dimension-strip" :style="{ background: dimensionTheme.primary }">
        <span class="dimension-name">{{ dimensionTheme.label }}</span>
      </div>
      <div class="header-left" :style="{ paddingLeft: '8px' }">
        <h2 class="page-title">
          Token 用量监控
          <span v-if="ctx !== 'all'" class="dimension-badge" :style="dimensionBadgeStyle">{{ dimensionTheme.label }}</span>
        </h2>
        <div class="drilldown-breadcrumb" v-if="ctx !== 'all'" :style="{ color: dimensionTheme.primary }">
          <template v-for="(crumb, idx) in breadcrumbPath" :key="idx">
            <a v-if="idx < breadcrumbPath.length - 1" class="crumb-link" :style="{ color: dimensionTheme.primary }" @click="store.drillBack(idx)">
              {{ crumb.label }}
            </a>
            <span v-else class="crumb-current" :style="{ color: dimensionTheme.primary }">{{ crumb.label }}</span>
            <span v-if="idx < breadcrumbPath.length - 1" class="crumb-sep"> &gt; </span>
          </template>
          <a-button size="small" type="link" danger @click="store.clearDrillDown" class="clear-btn">× 清除</a-button>
        </div>
        <div class="view-label" v-if="ctx !== 'all'" :style="{ background: dimensionTheme.bg, borderColor: dimensionTheme.light }">
          <span class="dimension-dot" :style="{ background: dimensionTheme.primary }"></span>
          <span class="view-label-text">当前分析: {{ currentViewLabel }}</span>
          <template v-if="monitorData">
            <span class="view-label-stat">| 总Token: {{ formatTokens(monitorData.overview.totalTokens) }}</span>
            <span class="view-label-stat">| 调用: {{ monitorData.overview.totalCallCount }} 次</span>
          </template>
        </div>
      </div>
      <div class="header-controls">
        <a-radio-group :value="monitorQuery.period" size="small" @change="onPeriodChange">
          <a-radio-button value="daily">按天</a-radio-button>
          <a-radio-button value="weekly">按周</a-radio-button>
          <a-radio-button value="monthly">按月</a-radio-button>
        </a-radio-group>
        <a-select :value="monitorQuery.days" size="small" style="width: 110px" @change="onDaysChange">
          <a-select-option :value="7">最近 7 天</a-select-option>
          <a-select-option :value="14">最近 14 天</a-select-option>
          <a-select-option :value="30">最近 30 天</a-select-option>
        </a-select>
        <a-input-search v-model:value="searchText" placeholder="搜索用户或群组..." size="small" style="width: 200px" allow-clear @search="onSearch" />
        <a-select v-model:value="selectedGroup" size="small" style="width: 110px" placeholder="全部群组" allow-clear @change="onGroupDrill">
          <a-select-option v-for="g in (monitorData?.groups || [])" :key="g.id" :value="g.id">{{ g.name }}</a-select-option>
        </a-select>
      </div>
    </div>

    <a-spin :spinning="monitorLoading" tip="加载中...">
      <template v-if="monitorData">

        <!-- ══════════════════════════════════════════════
             维度 1：全量视图（概览仪表盘）
             ══════════════════════════════════════════════ -->
        <div v-if="ctx === 'all'" key="all" class="dimension-layout">
          <!-- 4 张小卡片 -->
          <div class="overview-cards">
            <StatCard icon="box" iconBg="#e6f4ff" iconC="var(--brand)" :label="overviewLabel" :value="formatTokens(monitorData.overview.totalTokens)" :sub="`输入 ${formatTokens(overviewInput)} / 输出 ${formatTokens(overviewOutput)}`" />
            <StatCard icon="cost" iconBg="var(--success-bg)" iconC="var(--success)" label="预估成本" :value="`¥${monitorData.overview.estimatedCost.toFixed(2)}`" :sub="`${monitorData.overview.totalCallCount.toLocaleString()} 次调用`" />
            <StatCard icon="users" iconBg="#f9f0ff" iconC="var(--feature)" label="活跃用户" :value="String(monitorData.overview.activeUsers)" :sub="`${monitorData.groups.length} 个群组`" />
            <StatCard icon="chart" iconBg="var(--warning-bg)" iconC="var(--warning)" label="人均 Token" :value="formatTokens(monitorData.overview.avgTokensPerUser)" :sub="`${formatPercentage(maxUserPercent)} 最高占比`" />
          </div>
          <!-- 柱状(用户排行) + 环形(模型分布) -->
          <div class="charts-row">
            <div class="chart-panel">
              <div class="chart-title">{{ chartTitles.bar }}</div>
              <div ref="barRef" class="chart-box" style="height:280px"></div>
            </div>
            <div class="chart-panel">
              <div class="chart-title">{{ chartTitles.ring }}</div>
              <div ref="ringRef" class="chart-box" style="height:280px"></div>
            </div>
          </div>
          <!-- 双线趋势 -->
          <div class="chart-panel chart-panel-full">
            <div class="chart-title">{{ chartTitles.trend }}</div>
            <div ref="trendRef" class="chart-box" style="height:280px"></div>
            <!-- 当日明细弹出 -->
            <transition name="slide-down">
              <div v-if="dayDetailVisible && dayDetail" class="day-detail-panel">
                <div class="day-detail-header">
                  <span class="dimension-dot" :style="{ background: 'var(--c-cyan-500)' }"></span>
                  <span>{{ dayDetail.date }} 当日明细</span>
                  <span class="day-detail-summary">{{ dayDetail.summary.userCount }} 人 · {{ dayDetail.summary.callCount }} 次 · {{ formatTokens(dayDetail.summary.totalTokens) }}</span>
                  <a-button size="small" type="link" @click="store.closeDayDetail">收起 ▲</a-button>
                </div>
                <a-table :data-source="dayDetail.records" :pagination="false" :columns="dayDetailColumns" row-key="userId" size="small" :scroll="{ y: 200 }">
                  <template #bodyCell="{ column, record }">
                    <template v-if="column.dataIndex === 'userName'">
                      <span class="clickable-cell" @click="drillToUser(record.userId, record.userName)">{{ record.userName }}</span>
                      <a-tag :color="groupColor(record.groupId)" class="group-tag">{{ record.groupName }}</a-tag>
                    </template>
                    <template v-if="column.dataIndex === 'model'">
                      <span class="clickable-cell" @click="drillToModel(record.model)">{{ record.model }}</span>
                    </template>
                    <template v-if="column.dataIndex === 'totalTokens'"><span class="token-num">{{ record.totalTokens.toLocaleString() }}</span></template>
                  </template>
                </a-table>
              </div>
            </transition>
          </div>
          <!-- 用户用量表格 -->
          <div class="table-section">
            <div class="chart-title">{{ tableTitle }}</div>
            <a-table :data-source="tableDataSource" :pagination="{ pageSize: 10, showSizeChanger: true, showTotal: t => `共 ${t} 条` }" :columns="currentTableColumns" row-key="userId" size="middle" :loading="monitorLoading" @row-click="onTableRowClick" :custom-row="() => ({ style: { cursor: 'pointer' } })">
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'userName'">
                  <div class="user-cell"><span class="clickable-cell" @click.stop="drillToUser(record.userId, record.userName)">{{ record.userName }}</span><a-tag v-if="record.groupName" :color="groupColor(record.groupId)" class="group-tag">{{ record.groupName }}</a-tag></div>
                </template>
                <template v-if="column.dataIndex === 'model'"><span class="clickable-cell" @click.stop="drillToModel(record.model)">{{ record.model }}</span></template>
                <template v-if="column.dataIndex === 'totalTokens'"><span class="token-num">{{ record.totalTokens.toLocaleString() }}</span></template>
                <template v-if="column.dataIndex === 'percentage'"><div class="percent-cell"><div class="percent-bar-track"><div class="percent-bar-fill" :style="{ width: Math.min(record.percentage, 100) + '%', background: percentColor(record.percentage) }"></div></div><span class="percent-text">{{ record.percentage }}%</span></div></template>
                <template v-if="column.dataIndex === 'models'"><a-tag v-for="m in record.models.slice(0, 3)" :key="m.model" color="blue" class="model-tag">{{ m.model }}</a-tag><a-tag v-if="record.models.length > 3" color="default">+{{ record.models.length - 3 }}</a-tag></template>
                <template v-if="column.dataIndex === 'estimatedCost'">¥{{ record.estimatedCost.toFixed(2) }}</template>
                <template v-if="column.dataIndex === 'lastActive'"><span :class="{ 'active-today': isToday(record.lastActive) }">{{ formatDate(record.lastActive) }}</span></template>
              </template>
            </a-table>
          </div>
        </div>

        <!-- ══════════════════════════════════════════════
             维度 2：用户视图（个人画像）
             ══════════════════════════════════════════════ -->
        <div v-else-if="ctx === 'user'" key="user" class="dimension-layout">
          <!-- 大号用户信息卡 -->
          <DimensionHeroCard
            type="user"
            icon="user"
            :label="drillDownContext.label || ''"
            :theme="heroCardTheme"
            :metrics="userHeroMetrics"
            :avatar-color="monitorData.users[0]?.avatarColor || 'var(--feature)'"
            :subtitle="monitorData.users[0]?.groupName || ''"
          />
          <!-- 环形(模型分布) + 折线(个人趋势) -->
          <div class="charts-row">
            <div class="chart-panel" :style="chartPanelThemeStyle">
              <div class="chart-title" :style="chartTitleThemeStyle"><span class="dimension-dot" :style="{ background: dimensionTheme.primary }"></span>模型使用分布</div>
              <div ref="ringRef" class="chart-box" style="height: 280px"></div>
            </div>
            <div class="chart-panel" :style="chartPanelThemeStyle">
              <div class="chart-title" :style="chartTitleThemeStyle"><span class="dimension-dot" :style="{ background: dimensionTheme.primary }"></span>每日用量趋势</div>
              <div ref="trendRef" class="chart-box" style="height: 280px"></div>
            </div>
          </div>
          <!-- 调用记录表格 -->
          <div class="table-section" :style="tableSectionThemeStyle">
            <div class="chart-title" :style="chartTitleThemeStyle"><span class="dimension-dot" :style="{ background: dimensionTheme.primary }"></span>调用记录</div>
            <a-table :data-source="monitorData?.userCallRecords || []" :pagination="{ pageSize: 10, showSizeChanger: true }" :columns="callRecordColumns" row-key="time" size="middle">
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'model'"><span class="clickable-cell" @click="drillToModel(record.model)">{{ record.model }}</span></template>
                <template v-if="column.dataIndex === 'totalTokens'"><span class="token-num">{{ record.totalTokens.toLocaleString() }}</span></template>
              </template>
            </a-table>
          </div>
        </div>

        <!-- ══════════════════════════════════════════════
             维度 3：群组视图（团队分析）
             ══════════════════════════════════════════════ -->
        <div v-else-if="ctx === 'group'" key="group" class="dimension-layout">
          <!-- 大号群组信息卡 -->
          <DimensionHeroCard
            type="group"
            icon="users"
            :label="drillDownContext.label || ''"
            :theme="heroCardTheme"
            :metrics="groupHeroMetrics"
            :subtitle="`${monitorData.overview.activeUsers} 名成员`"
          />
          <!-- 横向柱状(成员排行) + 环形(模型分布) -->
          <div class="charts-row">
            <div class="chart-panel" :style="chartPanelThemeStyle">
              <div class="chart-title" :style="chartTitleThemeStyle"><span class="dimension-dot" :style="{ background: dimensionTheme.primary }"></span>成员用量排行</div>
              <div ref="barRef" class="chart-box" style="height: 280px"></div>
            </div>
            <div class="chart-panel" :style="chartPanelThemeStyle">
              <div class="chart-title" :style="chartTitleThemeStyle"><span class="dimension-dot" :style="{ background: dimensionTheme.primary }"></span>模型分布</div>
              <div ref="ringRef" class="chart-box" style="height: 280px"></div>
            </div>
          </div>
          <!-- 多线趋势 -->
          <div class="chart-panel chart-panel-full" :style="chartPanelThemeStyle">
            <div class="chart-title" :style="chartTitleThemeStyle"><span class="dimension-dot" :style="{ background: dimensionTheme.primary }"></span>成员每日趋势</div>
            <div ref="trendRef" class="chart-box" style="height: 300px"></div>
          </div>
          <!-- 成员用量表格 -->
          <div class="table-section" :style="tableSectionThemeStyle">
            <div class="chart-title" :style="chartTitleThemeStyle"><span class="dimension-dot" :style="{ background: dimensionTheme.primary }"></span>成员用量明细</div>
            <a-table :data-source="filteredUsers" :pagination="{ pageSize: 10, showSizeChanger: true }" :columns="userColumns" row-key="userId" size="middle" @row-click="onTableRowClick" :custom-row="() => ({ style: { cursor: 'pointer' } })">
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'userName'"><span class="clickable-cell" @click.stop="drillToUser(record.userId, record.userName)">{{ record.userName }}</span></template>
                <template v-if="column.dataIndex === 'totalTokens'"><span class="token-num">{{ record.totalTokens.toLocaleString() }}</span></template>
                <template v-if="column.dataIndex === 'percentage'"><div class="percent-cell"><div class="percent-bar-track"><div class="percent-bar-fill" :style="{ width: Math.min(record.percentage, 100) + '%', background: percentColor(record.percentage) }"></div></div><span class="percent-text">{{ record.percentage }}%</span></div></template>
                <template v-if="column.dataIndex === 'models'"><a-tag v-for="m in record.models.slice(0, 3)" :key="m.model" color="blue" class="model-tag">{{ m.model }}</a-tag><a-tag v-if="record.models.length > 3" color="default">+{{ record.models.length - 3 }}</a-tag></template>
                <template v-if="column.dataIndex === 'estimatedCost'">¥{{ record.estimatedCost.toFixed(2) }}</template>
              </template>
            </a-table>
          </div>
        </div>

        <!-- ══════════════════════════════════════════════
             维度 4：模型视图（模型画像）
             ══════════════════════════════════════════════ -->
        <div v-else-if="ctx === 'model'" key="model" class="dimension-layout">
          <!-- 大号模型信息卡 -->
          <DimensionHeroCard
            type="model"
            icon="model"
            :label="drillDownContext.label || ''"
            :theme="heroCardTheme"
            :metrics="modelHeroMetrics"
            :subtitle="`${monitorData.overview.activeUsers} 名用户使用`"
          />
          <!-- 柱状(用户排行) + 折线(模型趋势) -->
          <div class="charts-row">
            <div class="chart-panel" :style="chartPanelThemeStyle">
              <div class="chart-title" :style="chartTitleThemeStyle"><span class="dimension-dot" :style="{ background: dimensionTheme.primary }"></span>用户用量排行</div>
              <div ref="barRef" class="chart-box" style="height: 280px"></div>
            </div>
            <div class="chart-panel" :style="chartPanelThemeStyle">
              <div class="chart-title" :style="chartTitleThemeStyle"><span class="dimension-dot" :style="{ background: dimensionTheme.primary }"></span>每日用量趋势</div>
              <div ref="trendRef" class="chart-box" style="height: 280px"></div>
            </div>
          </div>
          <!-- 用户明细表格 -->
          <div class="table-section" :style="tableSectionThemeStyle">
            <div class="chart-title" :style="chartTitleThemeStyle"><span class="dimension-dot" :style="{ background: dimensionTheme.primary }"></span>用户使用明细</div>
            <a-table :data-source="filteredUsers" :pagination="{ pageSize: 10, showSizeChanger: true }" :columns="userColumns" row-key="userId" size="middle" @row-click="onTableRowClick" :custom-row="() => ({ style: { cursor: 'pointer' } })">
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'userName'"><span class="clickable-cell" @click.stop="drillToUser(record.userId, record.userName)">{{ record.userName }}</span><a-tag v-if="record.groupName" :color="groupColor(record.groupId)" class="group-tag">{{ record.groupName }}</a-tag></template>
                <template v-if="column.dataIndex === 'totalTokens'"><span class="token-num">{{ record.totalTokens.toLocaleString() }}</span></template>
                <template v-if="column.dataIndex === 'percentage'"><div class="percent-cell"><div class="percent-bar-track"><div class="percent-bar-fill" :style="{ width: Math.min(record.percentage, 100) + '%', background: percentColor(record.percentage) }"></div></div><span class="percent-text">{{ record.percentage }}%</span></div></template>
                <template v-if="column.dataIndex === 'estimatedCost'">¥{{ record.estimatedCost.toFixed(2) }}</template>
              </template>
            </a-table>
          </div>
        </div>

        <!-- ══════════════════════════════════════════════
             维度 5：日期视图（当日快照）
             ══════════════════════════════════════════════ -->
        <div v-else-if="ctx === 'date'" key="date" class="dimension-layout">
          <!-- 4 张当天卡片 -->
          <div class="overview-cards">
            <StatCard icon="box" iconBg="#e6fffb" iconC="var(--c-cyan-500)" label="当日 Token" :value="formatTokens(dateOverview.totalTokens)" :sub="`输入 ${formatTokens(dateOverview.input)} / 输出 ${formatTokens(dateOverview.output)}`" />
            <StatCard icon="call" iconBg="#e6fffb" iconC="var(--c-cyan-500)" label="调用次数" :value="String(dateOverview.callCount)" sub="次" />
            <StatCard icon="user" iconBg="#e6fffb" iconC="var(--c-cyan-500)" label="使用人数" :value="String(dateOverview.userCount)" sub="人" />
            <StatCard icon="model" iconBg="#e6fffb" iconC="var(--c-cyan-500)" label="使用模型" :value="String(dateOverview.modelCount)" sub="个" />
          </div>
          <!-- 柱状(当天用户) + 环形(当天模型) -->
          <div class="charts-row">
            <div class="chart-panel" :style="chartPanelThemeStyle">
              <div class="chart-title" :style="chartTitleThemeStyle"><span class="dimension-dot" :style="{ background: 'var(--c-cyan-500)' }"></span>{{ dateChartTitle }} · 用户排行</div>
              <div ref="barRef" class="chart-box" style="height: 280px"></div>
            </div>
            <div class="chart-panel" :style="chartPanelThemeStyle">
              <div class="chart-title" :style="chartTitleThemeStyle"><span class="dimension-dot" :style="{ background: 'var(--c-cyan-500)' }"></span>{{ dateChartTitle }} · 模型分布</div>
              <div ref="ringRef" class="chart-box" style="height: 280px"></div>
            </div>
          </div>
          <!-- 当日调用明细 -->
          <div class="table-section" :style="tableSectionThemeStyle">
            <div class="chart-title" :style="chartTitleThemeStyle"><span class="dimension-dot" :style="{ background: 'var(--c-cyan-500)' }"></span>当日调用明细</div>
            <a-table :data-source="dateDetailRecords" :pagination="{ pageSize: 10, showSizeChanger: true }" :columns="dateDetailTableColumns" row-key="userId" size="middle">
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'userName'"><span class="clickable-cell" @click="drillToUser(record.userId, record.userName)">{{ record.userName }}</span><a-tag :color="groupColor(record.groupId)" class="group-tag">{{ record.groupName }}</a-tag></template>
                <template v-if="column.dataIndex === 'model'"><span class="clickable-cell" @click="drillToModel(record.model)">{{ record.model }}</span></template>
                <template v-if="column.dataIndex === 'totalTokens'"><span class="token-num">{{ record.totalTokens.toLocaleString() }}</span></template>
              </template>
            </a-table>
          </div>
        </div>

      </template>
      <a-empty v-if="!monitorData && !monitorLoading" description="暂无数据" />
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import { useTokenUsageStore } from '@/stores/token-usage'
import DimensionHeroCard from '@/components/generator/DimensionHeroCard.vue'
import StatCard from './components/StatCard.vue'
import type { DayDetail } from '@/types/token-usage'

const store = useTokenUsageStore()

// ─── 维度主题 ───
interface DimensionTheme {
  primary: string; light: string; bg: string; gradient: [string, string]; label: string
}
const dimensionTheme = computed<DimensionTheme>(() => {
  switch (ctx.value) {
    case 'user':  return { primary: 'var(--feature)', light: '#d3adf7', bg: '#f9f0ff', gradient: ['var(--feature)', '#b37feb'], label: '用户分析' }
    case 'group': return { primary: 'var(--success)', light: 'var(--success-border)', bg: 'var(--success-bg)', gradient: ['var(--success)', '#95de64'], label: '群组分析' }
    case 'model': return { primary: 'var(--warning)', light: '#ffd591', bg: 'var(--warning-bg)', gradient: ['var(--warning)', '#ffc069'], label: '模型分析' }
    case 'date':  return { primary: 'var(--c-cyan-500)', light: '#87e8de', bg: '#e6fffb', gradient: ['var(--c-cyan-500)', '#5cdbd3'], label: '日期明细' }
    default:      return { primary: 'var(--brand)', light: 'var(--c-blue-200)', bg: '#e6f4ff', gradient: ['var(--brand)', '#69b1ff'], label: '全量视图' }
  }
})

// ─── 查询状态 ───
const searchText = ref('')
const selectedGroup = ref<string | undefined>(undefined)
const ctx = computed(() => store.drillDownContext.type)
const monitorQuery = computed(() => store.monitorQuery)
const monitorData = computed(() => store.monitorData)
const monitorLoading = computed(() => store.monitorLoading)
const filteredUsers = computed(() => store.filteredUsers)
const drillDownContext = computed(() => store.drillDownContext)
const breadcrumbPath = computed(() => store.breadcrumbPath)
const chartTitles = computed(() => store.chartTitles)
const currentViewLabel = computed(() => store.currentViewLabel)
const dayDetail = computed(() => store.dayDetail)
const dayDetailVisible = computed(() => store.dayDetailVisible)

// ─── HeroCard 主题 ───
const heroCardTheme = computed(() => ({ primary: dimensionTheme.value.primary, light: dimensionTheme.value.light, bg: dimensionTheme.value.bg }))

// ─── 主题 Style ───
const dimensionBadgeStyle = computed(() => ({ background: dimensionTheme.value.bg, color: dimensionTheme.value.primary, borderColor: dimensionTheme.value.light }))
const chartPanelThemeStyle = computed(() => ({ borderColor: dimensionTheme.value.light }))
const chartTitleThemeStyle = computed(() => ({ borderBottomColor: dimensionTheme.value.light, color: dimensionTheme.value.primary }))
const tableSectionThemeStyle = computed(() => ({ borderColor: dimensionTheme.value.light }))

// ─── 全量视图数据 ───
const overviewLabel = computed(() => '总 Token 用量')
const overviewInput = computed(() => (monitorData.value?.users || []).reduce((s, u) => s + u.inputTokens, 0))
const overviewOutput = computed(() => (monitorData.value?.users || []).reduce((s, u) => s + u.outputTokens, 0))
const maxUserPercent = computed(() => {
  const users = monitorData.value?.users || []
  return users.length > 0 ? Math.max(...users.map(u => u.percentage)) : 0
})

// ─── 用户视图 Hero 指标 ───
const userHeroMetrics = computed(() => {
  const d = monitorData.value
  if (!d) return []
  const u = d.users[0]
  return [
    { label: '总 Token', value: formatTokens(d.overview.totalTokens) },
    { label: '调用次数', value: String(d.overview.totalCallCount) },
    { label: '预估成本', value: `¥${d.overview.estimatedCost.toFixed(2)}` },
    { label: '活跃天数', value: u?.activeDays ? `${u.activeDays}天` : '—' },
    { label: '输入/输出', value: u ? `${((u.inputTokens / Math.max(1, u.outputTokens)) * 10 / 10).toFixed(1)} : 1` : '—' },
  ]
})

// ─── 群组视图 Hero 指标 ───
const groupHeroMetrics = computed(() => {
  const d = monitorData.value
  if (!d) return []
  return [
    { label: '总 Token', value: formatTokens(d.overview.totalTokens) },
    { label: '人均 Token', value: formatTokens(d.overview.avgTokensPerUser) },
    { label: '预估成本', value: `¥${d.overview.estimatedCost.toFixed(2)}` },
    { label: '调用总次数', value: String(d.overview.totalCallCount) },
  ]
})

// ─── 模型视图 Hero 指标 ───
const modelHeroMetrics = computed(() => {
  const d = monitorData.value
  if (!d) return []
  return [
    { label: '总 Token', value: formatTokens(d.overview.totalTokens) },
    { label: '预估成本', value: `¥${d.overview.estimatedCost.toFixed(2)}` },
    { label: '使用人数', value: String(d.overview.activeUsers) },
    { label: '输入/输出比', value: d.overview.inputOutputRatio ? `${d.overview.inputOutputRatio} : 1` : '—' },
  ]
})

// ─── 日期视图数据 ───
const dateOverview = computed(() => {
  const d = dayDetail.value
  if (!d) return { totalTokens: 0, input: 0, output: 0, callCount: 0, userCount: 0, modelCount: 0 }
  const models = new Set(d.records.map(r => r.model))
  return {
    totalTokens: d.summary.totalTokens,
    input: d.records.reduce((s, r) => s + r.inputTokens, 0),
    output: d.records.reduce((s, r) => s + r.outputTokens, 0),
    callCount: d.summary.callCount,
    userCount: d.summary.userCount,
    modelCount: models.size,
  }
})
const dateChartTitle = computed(() => dayDetail.value?.date || '')
const dateDetailRecords = computed(() => dayDetail.value?.records || [])
const dateDetailTableColumns = [
  { title: '用户', dataIndex: 'userName', width: 80 },
  { title: '模型', dataIndex: 'model', width: 120 },
  { title: '输入', dataIndex: 'inputTokens', width: 100 },
  { title: '输出', dataIndex: 'outputTokens', width: 100 },
  { title: '总计', dataIndex: 'totalTokens', width: 100 },
]

// ─── 表格列配置 ───
const userColumns = [
  { title: '用户', dataIndex: 'userName', width: 100 },
  { title: 'Token 总量', dataIndex: 'totalTokens', width: 120, sorter: (a: any, b: any) => a.totalTokens - b.totalTokens },
  { title: '调用次数', dataIndex: 'callCount', width: 90 },
  { title: '占比', dataIndex: 'percentage', width: 160 },
  { title: '模型', dataIndex: 'models', width: 200 },
  { title: '成本', dataIndex: 'estimatedCost', width: 100, sorter: (a: any, b: any) => a.estimatedCost - b.estimatedCost },
]
const callRecordColumns = [
  { title: '时间', dataIndex: 'time', width: 110 },
  { title: '模型', dataIndex: 'model', width: 120 },
  { title: '输入 Token', dataIndex: 'inputTokens', width: 120 },
  { title: '输出 Token', dataIndex: 'outputTokens', width: 120 },
  { title: '总 Token', dataIndex: 'totalTokens', width: 120 },
]
const dayDetailColumns = [
  { title: '用户', dataIndex: 'userName', width: 80 },
  { title: '模型', dataIndex: 'model', width: 120 },
  { title: '输入', dataIndex: 'inputTokens', width: 90 },
  { title: '输出', dataIndex: 'outputTokens', width: 90 },
  { title: '总计', dataIndex: 'totalTokens', width: 90 },
]
const isUserView = computed(() => ctx.value === 'user')
const currentTableColumns = computed(() => isUserView.value ? callRecordColumns : userColumns)
const tableTitle = computed(() => isUserView.value ? '调用记录' : '用户用量明细')
const tableDataSource = computed(() => {
  if (isUserView.value) return monitorData.value?.userCallRecords || []
  return filteredUsers.value
})

// ─── 下钻操作 ───
function drillToUser(userId: string, userName: string) { store.drillTo({ type: 'user', userId, label: userName }) }
function drillToModel(model: string) { store.drillTo({ type: 'model', model, label: model }) }
function onGroupDrill(groupId: string | undefined) {
  selectedGroup.value = groupId
  if (groupId) { const g = monitorData.value?.groups.find(x => x.id === groupId); store.drillTo({ type: 'group', groupId, label: g?.name || groupId }) }
  else store.clearDrillDown()
}
function onTableRowClick(record: any) { if (ctx.value !== 'user') drillToUser(record.userId, record.userName) }
function onPeriodChange(e: any) { store.setMonitorQuery({ period: e.target.value }) }
function onDaysChange(val: number) { store.setMonitorQuery({ days: val }) }
function onSearch(val: string) { store.setMonitorQuery({ search: val || '' }) }
function onEscKey(e: KeyboardEvent) { if (e.key === 'Escape' && ctx.value !== 'all') store.drillBack(breadcrumbPath.value.length - 2) }

// ─── ECharts Refs ───
const barRef = ref<HTMLDivElement | null>(null)
const ringRef = ref<HTMLDivElement | null>(null)
const trendRef = ref<HTMLDivElement | null>(null)
let barChart: echarts.ECharts | null = null
let ringChart: echarts.ECharts | null = null
let trendChart: echarts.ECharts | null = null

// ─── 柱状图（全量/群组/模型/日期） ───
function initBarChart() {
  if (!barRef.value) return
  barChart = echarts.init(barRef.value)
  barChart.on('click', (params: any) => {
    if (params.componentType !== 'series') return
    const items = barChartSource.value
    if (!items.length) return
    const item = items[params.dataIndex]
    if (!item) return
    const raw = (item as any).raw
    if (raw?.userId) drillToUser(raw.userId, item.label)
  })

  const src = barChartSource.value
  const t = dimensionTheme.value
  const isHBar = ctx.value === 'group'

  if (isHBar) {
    barChart.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p: any) => `<b>${p[0].name}</b><br/>Token: ${p[0].value.toLocaleString()}<br/>点击查看详情` },
      grid: { left: 80, right: 40, top: 10, bottom: 20 },
      xAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatTokens(v) }, splitLine: { lineStyle: { color: 'var(--border-light)' } } },
      yAxis: { type: 'category', data: src.map(i => i.label), inverse: true, axisLabel: { fontSize: 12 }, axisLine: { lineStyle: { color: t.light } } },
      series: [{
        type: 'bar', data: src.map(i => i.value),
        itemStyle: { borderRadius: [0, 4, 4, 0], color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: t.gradient[0] }, { offset: 1, color: t.gradient[1] }]) },
        barMaxWidth: 24,
        emphasis: { itemStyle: { color: t.primary }, label: { show: true, position: 'right', fontSize: 12 } },
      }],
    }, true)
  } else {
    barChart.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p: any) => {
        const item = src[p[0].dataIndex]; const raw = (item as any).raw
        return `<b>${item.label}</b>${raw?.groupName ? ` (${raw.groupName})` : ''}<br/>Token: ${item.value.toLocaleString()}${raw?.percentage ? `<br/>占比: ${raw.percentage}%` : ''}<br/>点击查看详情`
      }},
      grid: { left: 12, right: 20, top: 10, bottom: src.length > 7 ? 50 : 30 },
      xAxis: { type: 'category', data: src.map(i => i.label), axisLabel: { fontSize: 11, rotate: src.length > 7 ? 30 : 0 } },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatTokens(v) }, splitLine: { lineStyle: { color: 'var(--border-light)' } } },
      series: [{
        type: 'bar', data: src.map(i => i.value),
        itemStyle: { borderRadius: [4, 4, 0, 0], color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: t.gradient[0] }, { offset: 1, color: t.gradient[1] }]) },
        barMaxWidth: 40,
        emphasis: { itemStyle: { color: t.primary }, label: { show: true, position: 'top', fontSize: 12 } },
      }],
    }, true)
  }
}

const barChartSource = computed(() => {
  const d = monitorData.value
  if (!d) return []
  if (ctx.value === 'user') return []
  if (ctx.value === 'model') return (d.modelUserRanking || []).map(r => ({ label: r.userName, value: r.totalTokens, raw: r }))
  if (ctx.value === 'group') return (d.users || []).slice(0, 8).map(u => ({ label: u.userName, value: u.totalTokens, raw: u }))
  if (ctx.value === 'date') {
    const records = dayDetail.value?.records || []
    const map = new Map<string, { name: string; tokens: number; userId: string; groupId: string; groupName: string }>()
    for (const r of records) {
      const e = map.get(r.userId)
      if (e) { e.tokens += r.totalTokens } else { map.set(r.userId, { name: r.userName, tokens: r.totalTokens, userId: r.userId, groupId: r.groupId, groupName: r.groupName }) }
    }
    return [...map.values()].sort((a, b) => b.tokens - a.tokens).slice(0, 10).map(e => ({ label: e.name, value: e.tokens, raw: { userId: e.userId, userName: e.name, groupName: e.groupName } }))
  }
  return store.topUsers.map(u => ({ label: u.userName, value: u.totalTokens, raw: u }))
})

// ─── 环形图（全量/用户/群组/日期） ───
function initRingChart() {
  if (!ringRef.value) return
  ringChart = echarts.init(ringRef.value)
  ringChart.on('click', (params: any) => {
    if (params.componentType !== 'series') return
    if (ctx.value === 'model') return
    drillToModel(params.name)
  })
  const models = monitorData.value?.models || []
  const t = dimensionTheme.value
  ringChart.setOption({
    tooltip: { trigger: 'item', formatter: (p: any) => `<b>${p.name}</b><br/>Token: ${p.value.toLocaleString()}<br/>占比: ${p.percent}%<br/>${ctx.value !== 'model' ? '点击查看该模型详情' : ''}` },
    legend: { orient: 'vertical', right: 0, top: 'center', textStyle: { fontSize: 12 } },
    series: [{
      type: 'pie', radius: ['50%', '75%'], center: ['40%', '50%'], avoidLabelOverlap: false, padAngle: 2,
      itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' }, scaleSize: 10 },
      data: models.map((m, i) => ({ name: m.model, value: m.totalTokens, itemStyle: { color: modelColors[i % modelColors.length] } })),
    }],
  }, true)
}

// ─── 趋势图 ───
function initTrendChart() {
  if (!trendRef.value) return
  trendChart = echarts.init(trendRef.value)
  trendChart.on('click', (params: any) => {
    if (params.componentType !== 'series') return
    const ts = monitorData.value?.timeSeries || []
    if (ts[params.dataIndex]) store.showDayDetail(ts[params.dataIndex].time)
  })

  const t = dimensionTheme.value
  const ts = monitorData.value?.timeSeries || []
  const xLabels = ts.map(d => d.time.slice(5))

  // 群组多线模式
  if (ctx.value === 'group' && monitorData.value?.memberBreakdown) {
    const members = monitorData.value.memberBreakdown
    const colors = ['var(--feature)', 'var(--brand)', 'var(--success)', 'var(--warning)', 'var(--c-cyan-500)', '#eb2f96', '#f5222d', '#2f54eb']
    trendChart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: members.map(m => m.userName), bottom: 0, textStyle: { fontSize: 11 } },
      grid: { left: 12, right: 20, top: 10, bottom: 40 },
      xAxis: { type: 'category', data: xLabels, boundaryGap: false, axisLabel: { fontSize: 11, rotate: xLabels.length > 14 ? 45 : 0 } },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatTokens(v) }, splitLine: { lineStyle: { color: 'var(--border-light)' } } },
      series: members.map((m, i) => ({
        name: m.userName, type: 'line', data: m.values, smooth: true, symbol: 'circle', symbolSize: 3,
        lineStyle: { color: colors[i % colors.length], width: 1.5 },
        itemStyle: { color: colors[i % colors.length] },
        emphasis: { scale: 1.3 },
      })),
    }, true)
    return
  }

  // 单线/双线模式
  const hasHighlight = dayDetailVisible.value && dayDetail.value
  trendChart.setOption({
    tooltip: { trigger: 'axis', formatter: (params: any) => {
      const p = params[0]; const d = ts[p.dataIndex]
      return `<b>${d.time}</b><br/>Token: ${d.totalTokens.toLocaleString()}<br/>输入: ${d.inputTokens.toLocaleString()} / 输出: ${d.outputTokens.toLocaleString()}<br/>调用: ${d.callCount} 次<br/>成本: ¥${d.estimatedCost.toFixed(2)}${ctx.value !== 'date' ? '<br/><span style="color:var(--text-tertiary);font-size:11px;">点击查看当日明细</span>' : ''}`
    }},
    legend: { data: ['Token 总量'], bottom: 0, textStyle: { fontSize: 12 } },
    grid: { left: 12, right: 20, top: 10, bottom: 35 },
    xAxis: { type: 'category', data: xLabels, boundaryGap: false, axisLabel: { fontSize: 11, rotate: xLabels.length > 14 ? 45 : 0 } },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => formatTokens(v) }, splitLine: { lineStyle: { color: 'var(--border-light)' } } },
    series: [{
      name: 'Token 总量', type: 'line',
      data: ts.map((d, i) => {
        const isH = hasHighlight && d.time === dayDetail.value?.date
        return { value: d.totalTokens, itemStyle: isH ? { color: 'var(--error)' } : undefined, symbolSize: isH ? 10 : 4 }
      }),
      smooth: true, symbol: 'circle', symbolSize: 4,
      lineStyle: { color: t.primary, width: 2 },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: t.primary + '40' }, { offset: 1, color: t.primary + '05' }]) },
      itemStyle: { color: t.primary },
      emphasis: { scale: 1.5, itemStyle: { color: t.primary } },
    }],
  }, true)
}

// ─── 图表刷新 ───
// 切换维度时 v-if/v-else-if 会销毁旧 DOM 并创建新 DOM，
// 必须先 dispose 旧 ECharts 实例，否则 setOption 打在已销毁的 DOM 上 → 图表不显示、点击不生效
function renderAllCharts() {
  nextTick(() => {
    barChart?.dispose(); barChart = null
    ringChart?.dispose(); ringChart = null
    trendChart?.dispose(); trendChart = null
    initBarChart()
    initRingChart()
    initTrendChart()
  })
}
function handleResize() { barChart?.resize(); ringChart?.resize(); trendChart?.resize() }

watch([monitorData, drillDownContext, dayDetailVisible], () => renderAllCharts(), { deep: true })
watch(filteredUsers, () => renderAllCharts())
// 钻取返回时同步群组下拉框
watch(ctx, (newCtx) => {
  if (newCtx.type !== 'group') selectedGroup.value = undefined
})

// ─── URL 同步 ───
function syncUrl() {
  const dc = drillDownContext.value
  const params = new URLSearchParams()
  if (dc.type !== 'all') { params.set('view', dc.type); if (dc.userId) params.set('user', dc.userId); if (dc.groupId) params.set('group', dc.groupId); if (dc.model) params.set('model', dc.model); if (dc.date) params.set('date', dc.date) }
  window.history.replaceState(null, '', params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname)
}
watch(drillDownContext, () => syncUrl(), { deep: true })

// ─── 生命周期 ───
onMounted(async () => {
  await store.fetchMonitorData()
  renderAllCharts()
  window.addEventListener('resize', handleResize)
  document.addEventListener('keydown', onEscKey as any)
})
onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  document.removeEventListener('keydown', onEscKey as any)
  barChart?.dispose(); ringChart?.dispose(); trendChart?.dispose()
})

// ─── 工具函数 ���──
function formatTokens(n: number): string { if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'; if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'; return String(n) }
function formatPercentage(n: number): string { return n > 0 ? n.toFixed(1) + '%' : '—' }
function formatDate(iso: string): string { const d = new Date(iso); return `${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}` }
function isToday(iso: string): boolean { return iso === new Date().toISOString().slice(0, 10) }
function groupColor(g: string): string { const m: Record<string, string> = { 'g-dev': 'blue', 'g-product': 'green', 'g-design': 'purple', 'g-test': 'orange' }; return m[g] || 'default' }
function percentColor(pct: number): string { if (pct >= 30) return 'var(--error)'; if (pct >= 15) return 'var(--warning)'; if (pct >= 5) return 'var(--brand)'; return 'var(--success)' }
const modelColors = ['var(--brand)', 'var(--success)', 'var(--feature)', 'var(--warning)', 'var(--c-cyan-500)', '#eb2f96']
</script>

<style scoped>
.token-dashboard { padding: 24px; max-width: 1400px; margin: 0 auto; }

/* ─── 头部 ─── */
.dashboard-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; padding-left: 12px; border-left: 4px solid transparent; transition: border-color 0.3s ease; position: relative; }
.header-left { flex: 1; min-width: 0; }
.dimension-strip { display: flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: var(--radius-sm); color: #fff; font-size: 12px; font-weight: 600; white-space: nowrap; flex-shrink: 0; transition: background 0.3s ease; }
.dimension-badge { display: inline-block; padding: 2px 10px; border-radius: var(--radius-md); font-size: 11px; font-weight: 600; border: 1px solid; vertical-align: middle; letter-spacing: 0.3px; }
.dimension-dot { display: inline-block; width: 8px; height: 8px; border-radius: var(--radius-full); flex-shrink: 0; }
.page-title { font-size: 20px; font-weight: 700; margin: 0 0 6px 0; white-space: nowrap; display: flex; align-items: center; gap: 10px; }
.header-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex-shrink: 0; }

/* ─── 面包屑 ─── */
.drilldown-breadcrumb { display: flex; align-items: center; gap: 4px; font-size: 13px; margin-bottom: 4px; }
.crumb-link { cursor: pointer; font-weight: 500; text-decoration: none; }
.crumb-link:hover { text-decoration: underline; }
.crumb-current { font-weight: 600; }
.crumb-sep { color: var(--scrollbar-thumb); margin: 0 2px; }
.clear-btn { margin-left: 8px; padding: 0; font-size: 13px; }
.view-label { font-size: 12px; color: var(--text-tertiary); padding: 6px 12px; border-radius: var(--radius-sm); border: 1px solid transparent; display: inline-flex; align-items: center; gap: 6px; transition: background 0.3s, border-color 0.3s; }
.view-label-text { font-weight: 600; color: var(--text-primary); }
.view-label-stat { margin-left: 6px; color: var(--text-secondary); }

/* ─── 概览卡片 ─── */
.overview-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
.stat-card { display: flex; align-items: center; gap: 14px; padding: 18px 20px; background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--radius-lg); transition: box-shadow 0.2s; }
.stat-card:hover { box-shadow: 0 2px 12px var(--shadow-sm); }
.stat-icon { width: 44px; height: 44px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
.stat-body { flex: 1; min-width: 0; }
.stat-label { font-size: 12px; color: var(--text-tertiary); margin-bottom: 2px; }
.stat-value { font-size: 22px; font-weight: 700; color: var(--text-primary); line-height: 1.2; }
.stat-sub { font-size: 11px; color: var(--scrollbar-thumb); margin-top: 2px; }

/* ─── 图表 ─── */
.charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.chart-panel { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--radius-lg); padding: 16px; transition: border-color 0.3s; }
.chart-panel-full { margin-bottom: 16px; }
.chart-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--bg-alt); display: flex; align-items: center; gap: 6px; transition: border-color 0.3s, color 0.3s; }
.chart-box { width: 100%; }

/* ─── 当日明细 ─── */
.day-detail-panel { margin-top: 12px; border-top: 1px dashed var(--border-default); padding-top: 12px; }
.day-detail-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; font-size: 13px; font-weight: 600; color: var(--text-primary); }
.day-detail-summary { font-weight: 400; font-size: 12px; color: var(--text-tertiary); flex: 1; }

/* ─── 表格 ─── */
.table-section { background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--radius-lg); padding: 16px; transition: border-color 0.3s; }
.user-cell { display: flex; align-items: center; gap: 8px; }
.group-tag { font-size: 11px; line-height: 1; }
.clickable-cell { color: var(--brand); cursor: pointer; font-weight: 600; transition: color 0.15s; }
.clickable-cell:hover { color: var(--brand-hover); text-decoration: underline; }
.percent-cell { display: flex; align-items: center; gap: 8px; }
.percent-bar-track { flex: 1; height: 6px; background: var(--bg-alt); border-radius: var(--radius-xs); overflow: hidden; }
.percent-bar-fill { height: 100%; border-radius: var(--radius-xs); transition: width 0.3s; }
.percent-text { width: 48px; font-size: 12px; color: var(--text-tertiary); font-variant-numeric: tabular-nums; text-align: right; }
.model-tag { margin-right: 4px; margin-bottom: 2px; }
.active-today { color: var(--success); font-weight: 600; }
.active-today::after { content: ''; display: inline-block; width: 6px; height: 6px; background: var(--success); border-radius: var(--radius-full); margin-left: 4px; vertical-align: middle; }
.token-num { font-variant-numeric: tabular-nums; }

/* ─── 布局淡入动画（替代 transition mode="out-in"，DOM 立即插入避免图表初始化时机问题） ─── */
@keyframes fadeInUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.dimension-layout { animation: fadeInUp 0.2s ease; }

/* ─── 滑入动画 ─── */
.slide-down-enter-active, .slide-down-leave-active { transition: all 0.3s ease; overflow: hidden; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; max-height: 0; }
.slide-down-enter-to, .slide-down-leave-from { opacity: 1; max-height: 400px; }

/* ─── 响应式 ─── */
@media (max-width: 1024px) { .overview-cards { grid-template-columns: repeat(2, 1fr); } .charts-row { grid-template-columns: 1fr; } }
@media (max-width: 640px) { .overview-cards { grid-template-columns: 1fr; } .header-controls { flex-direction: column; align-items: flex-start; } }
</style>
