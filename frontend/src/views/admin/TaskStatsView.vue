<template>
  <div class="mg-root">
    <header class="mg-header">
      <div>
        <h1 class="mg-title">任务统计</h1>
        <p class="mg-sub">管理员 · 任务明细与模型效果对比</p>
      </div>
      <a-tag color="blue" class="mg-readonly-tag">管理员</a-tag>
    </header>

    <!-- 共享时间窗（R7，联动两 tab） -->
    <div class="ts-window-bar">
      <span class="ts-window-label">时间窗</span>
      <a-select v-model="timePreset" class="ts-window-select" @change="onWindowChange">
        <a-select-option value="all">全部时间</a-select-option>
        <a-select-option value="week">本周</a-select-option>
        <a-select-option value="d30">近 30 天</a-select-option>
        <a-select-option value="d60">近 60 天</a-select-option>
        <a-select-option value="custom">自定义</a-select-option>
      </a-select>
      <a-range-picker
        v-if="timePreset === 'custom'"
        v-model="customRange"
        class="ts-window-range"
        @change="onWindowChange"
      />
      <span class="ts-window-info">{{ windowLabel }}</span>
      <a-button size="small" @click="reloadAll">刷新</a-button>
    </div>

    <a-tabs v-model:active-key="activeTab">
      <!-- Tab 0：仪表台 -->
      <a-tab-pane key="dashboard" tab="仪表台">
        <section class="mg-section">
          <div class="mg-section-head">
            <h2 class="mg-section-title">平台概览</h2>
            <span class="mg-count">{{ dashboard.windowLabel }}</span>
          </div>

          <!-- 全局概览 KPI 卡片 -->
          <div class="dashboard-kpi-grid">
            <div class="dashboard-kpi-card">
              <div class="dashboard-kpi-label">任务总量</div>
              <div class="dashboard-kpi-value">{{ dashboard.overview.totalTasks }}</div>
              <div class="dashboard-kpi-sub">成功 {{ dashboard.overview.completedTasks }} · 失败 {{ dashboard.overview.failedTasks }}</div>
            </div>
            <div class="dashboard-kpi-card">
              <div class="dashboard-kpi-label">整体成功率</div>
              <div class="dashboard-kpi-value" :style="{ color: successRateColor(dashboard.overview.successRate) }">
                {{ rateText(dashboard.overview.successRate) }}
              </div>
              <div class="dashboard-kpi-sub">目标 ≥ 80%</div>
            </div>
            <div class="dashboard-kpi-card">
              <div class="dashboard-kpi-label">平均耗时</div>
              <div class="dashboard-kpi-value">{{ formatDurationMs(dashboard.overview.avgDurationMs) }}</div>
              <div class="dashboard-kpi-sub">仅成功任务</div>
            </div>
            <div class="dashboard-kpi-card">
              <div class="dashboard-kpi-label">Token 消耗</div>
              <div class="dashboard-kpi-value">{{ formatTokens(dashboard.overview.totalTokens) }}</div>
              <div class="dashboard-kpi-sub">活跃用户 {{ dashboard.overview.activeUsers }}</div>
            </div>
          </div>

          <!-- 模型效率排行 + 失败归因 -->
          <div class="dashboard-two-col">
            <div class="dashboard-card">
              <h3 class="dashboard-card-title">🏆 模型效率排行（Top 10）</h3>
              <div v-if="dashboard.modelRanking.length === 0" class="dashboard-empty">暂无数据</div>
              <div v-else class="dashboard-model-ranking">
                <div v-for="(m, idx) in dashboard.modelRanking" :key="idx" class="dashboard-model-row">
                  <div class="dashboard-model-rank">{{ idx + 1 }}</div>
                  <div class="dashboard-model-info">
                    <div class="dashboard-model-name" :title="m.model">
                      <a-tag :color="m.type === 'vision' ? 'purple' : 'cyan'" size="small">
                        {{ m.type === 'vision' ? '视觉' : '文本' }}
                      </a-tag>
                      {{ shortModel(m.model) }}
                    </div>
                    <div class="dashboard-model-meta">
                      <span>成功率 {{ rateText(m.successRate) }}</span>
                      <span v-if="m.secPer100LinesP50 !== null">· {{ m.secPer100LinesP50.toFixed(1) }}s/百行</span>
                      <span v-if="m.tokenKPer100LinesP50 !== null">· {{ m.tokenKPer100LinesP50.toFixed(2) }}K/百行</span>
                    </div>
                  </div>
                  <div class="dashboard-model-tasks">{{ m.taskCount }} 任务</div>
                </div>
              </div>
            </div>

            <div class="dashboard-card">
              <h3 class="dashboard-card-title">🔍 失败归因分布</h3>
              <div v-if="dashboard.failDistribution.total === 0" class="dashboard-empty">暂无失败</div>
              <div v-else class="dashboard-fail-distribution">
                <div class="dashboard-fail-bar">
                  <div class="dashboard-fail-segment quality" :style="{ width: `${dashboard.failDistribution.qualityRate * 100}%` }">
                    {{ dashboard.failDistribution.qualityRate > 0.1 ? `${(dashboard.failDistribution.qualityRate * 100).toFixed(0)}%` : '' }}
                  </div>
                  <div class="dashboard-fail-segment env" :style="{ width: `${dashboard.failDistribution.envRate * 100}%` }">
                    {{ dashboard.failDistribution.envRate > 0.1 ? `${(dashboard.failDistribution.envRate * 100).toFixed(0)}%` : '' }}
                  </div>
                  <div class="dashboard-fail-segment other" :style="{ width: `${dashboard.failDistribution.otherRate * 100}%` }">
                    {{ dashboard.failDistribution.otherRate > 0.1 ? `${(dashboard.failDistribution.otherRate * 100).toFixed(0)}%` : '' }}
                  </div>
                </div>
                <div class="dashboard-fail-legend">
                  <div class="dashboard-fail-item clickable" @click="toggleFailDetails('quality')">
                    <span class="dashboard-fail-dot quality"></span>
                    <span>质量失败（归模型）</span>
                    <span class="dashboard-fail-count">{{ dashboard.failDistribution.quality }}</span>
                    <span class="dashboard-fail-expand">{{ expandedFailType === 'quality' ? '▼' : '▶' }}</span>
                  </div>
                  <div class="dashboard-fail-item clickable" @click="toggleFailDetails('env')">
                    <span class="dashboard-fail-dot env"></span>
                    <span>环境失败（归基础设施）</span>
                    <span class="dashboard-fail-count">{{ dashboard.failDistribution.env }}</span>
                    <span class="dashboard-fail-expand">{{ expandedFailType === 'env' ? '▼' : '▶' }}</span>
                  </div>
                  <div class="dashboard-fail-item clickable" @click="toggleFailDetails('other')">
                    <span class="dashboard-fail-dot other"></span>
                    <span>其他（归管线 bug）</span>
                    <span class="dashboard-fail-count">{{ dashboard.failDistribution.other }}</span>
                    <span class="dashboard-fail-expand">{{ expandedFailType === 'other' ? '▼' : '▶' }}</span>
                  </div>
                </div>
                <div class="dashboard-fail-total">共 {{ dashboard.failDistribution.total }} 次失败</div>
                
                <!-- 二级展开：具体错误列表 -->
                <div v-if="expandedFailType && dashboard.failDistribution[`${expandedFailType}Details`]?.length > 0" class="dashboard-fail-details">
                  <div class="dashboard-fail-details-title">
                    {{ failTypeLabel(expandedFailType) }} 的具体错误（最近 {{ dashboard.failDistribution[`${expandedFailType}Details`].length }} 条）：
                  </div>
                  <div class="dashboard-fail-details-list">
                    <div v-for="(detail, idx) in dashboard.failDistribution[`${expandedFailType}Details`]" :key="idx" class="dashboard-fail-detail-item">
                      <div class="dashboard-fail-detail-header">
                        <span class="dashboard-fail-detail-name">{{ detail.componentName }}</span>
                        <span class="dashboard-fail-detail-time">{{ formatTime(detail.startTime) }}</span>
                      </div>
                      <div class="dashboard-fail-detail-error">{{ detail.error }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 效率趋势 -->
          <div class="dashboard-card">
            <h3 class="dashboard-card-title">📈 效率趋势（近 30 天）</h3>
            <div v-if="dashboard.trends.length === 0" class="dashboard-empty">暂无数据</div>
            <div v-else class="dashboard-trend-chart">
              <svg :viewBox="`0 0 ${trendChartWidth} ${trendChartHeight}`" class="dashboard-trend-svg">
                <!-- 背景网格 -->
                <line v-for="(tick, i) in dashboardTrendTicks" :key="'grid-'+i" 
                      :x1="trendChartPadding" :y1="tick.y" 
                      :x2="trendChartWidth - trendChartPadding" :y2="tick.y" 
                      stroke="#f0f0f0" stroke-width="1"/>
                <!-- 80% 参考线 -->
                <line :x1="trendChartPadding" :y1="trendChartPadding + (trendChartHeight - 2 * trendChartPadding) * 0.2" 
                      :x2="trendChartWidth - trendChartPadding" :y2="trendChartPadding + (trendChartHeight - 2 * trendChartPadding) * 0.2" 
                      stroke="#52c41a" stroke-width="1" stroke-dasharray="4,4" opacity="0.5"/>
                <text :x="trendChartWidth - trendChartPadding + 5" 
                      :y="trendChartPadding + (trendChartHeight - 2 * trendChartPadding) * 0.2 + 4" 
                      font-size="10" fill="#52c41a">80%</text>
                <!-- Y 轴 -->
                <line :x1="trendChartPadding" :y1="trendChartPadding" 
                      :x2="trendChartPadding" :y2="trendChartHeight - trendChartPadding" 
                      stroke="#d9d9d9" stroke-width="1"/>
                <!-- X 轴 -->
                <line :x1="trendChartPadding" :y1="trendChartHeight - trendChartPadding" 
                      :x2="trendChartWidth - trendChartPadding" :y2="trendChartHeight - trendChartPadding" 
                      stroke="#d9d9d9" stroke-width="1"/>
                <!-- Y 轴刻度 -->
                <text v-for="(tick, i) in dashboardTrendTicks" :key="'y-'+i" 
                      :x="trendChartPadding - 8" :y="tick.y + 4" 
                      text-anchor="end" font-size="11" fill="#666">{{ tick.label }}</text>
                <!-- 面积填充 -->
                <polygon :points="dashboardTrendAreaPoints" fill="url(#dashboardTrendGradient)" opacity="0.3"/>
                <!-- 折线 -->
                <polyline :points="dashboardTrendLinePoints" fill="none" 
                          stroke="#1890ff" stroke-width="2.5" stroke-linejoin="round"/>
                <!-- 数据点 -->
                <circle v-for="(point, i) in dashboardTrendPoints" :key="'p-'+i" 
                        :cx="point.x" :cy="point.y" r="4" 
                        fill="#fff" stroke="#1890ff" stroke-width="2">
                  <title>{{ point.tooltip }}</title>
                </circle>
                <!-- X 轴标签 -->
                <text v-for="(point, i) in dashboardTrendPoints.filter((_, idx) => idx % Math.ceil(dashboard.trends.length / 8) === 0)" 
                      :key="'x-'+i" :x="point.x" :y="trendChartHeight - trendChartPadding + 18" 
                      text-anchor="middle" font-size="11" fill="#666">{{ point.dateLabel }}</text>
                <!-- 渐变定义 -->
                <defs>
                  <linearGradient id="dashboardTrendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#1890ff" stop-opacity="0.4"/>
                    <stop offset="100%" stop-color="#1890ff" stop-opacity="0"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>

          <!-- 部门汇总 -->
          <div class="dashboard-card">
            <h3 class="dashboard-card-title">👥 部门使用情况</h3>
            <div v-if="dashboard.departmentSummary.length === 0" class="dashboard-empty">暂无数据</div>
            <div v-else class="mg-table-wrap">
              <a-table
                class="mg-table"
                size="small"
                :columns="departmentColumns"
                :data-source="dashboard.departmentSummary"
                :pagination="false"
                :scroll="{ x: 800 }"
                row-key="department"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'successRate'">
                    <span :style="{ color: successColor(record) }">{{ rateText(record.successRate) }}</span>
                  </template>
                  <template v-else-if="column.key === 'durationP50Ms'">
                    {{ formatDurationMs(record.durationP50Ms) }}
                  </template>
                  <template v-else>
                    {{ record[column.key] ?? '-' }}
                  </template>
                </template>
              </a-table>
            </div>
          </div>

          <p class="ts-hint">
            💡 <b>仪表台说明：</b>默认展示近 30 天数据。模型效率排行按任务数过滤样本不足的情况，优先展示成功率高的模型。
            失败归因帮助定位问题：质量失败归模型、环境失败归基础设施、其他归管线 bug。
          </p>
        </section>
      </a-tab-pane>

      <!-- Tab 1：任务诊断台（异常聚焦） -->
      <a-tab-pane key="tasks" tab="任务诊断台">
        <section class="mg-section">
          <div class="mg-section-head">
            <h2 class="mg-section-title">任务诊断台</h2>
            <span class="mg-count">共 {{ diagnosticTasks.length }} 个异常任务</span>
          </div>

          <!-- 异常摘要条 -->
          <div class="diagnostic-summary-bar">
            <div class="diagnostic-summary-item">
              <span class="diagnostic-summary-value warning">{{ diagnosticSummary.abnormalCount }}</span>
              <span class="diagnostic-summary-label">异常任务</span>
            </div>
            <div class="diagnostic-summary-item">
              <span class="diagnostic-summary-value danger">¥{{ diagnosticSummary.wastedCost.toFixed(2) }}</span>
              <span class="diagnostic-summary-label">浪费成本</span>
            </div>
            <div class="diagnostic-summary-item">
              <span class="diagnostic-summary-value">{{ diagnosticSummary.mainBottleneck }}</span>
              <span class="diagnostic-summary-label">主要瓶颈</span>
            </div>
          </div>

          <!-- 筛选器 -->
          <div class="ts-filter-bar">
            <a-select v-model="diagnosticFilter" class="ts-filter-item" placeholder="异常类型" allow-clear>
              <a-select-option value="failed">失败任务</a-select-option>
              <a-select-option value="retry">高重试（≥2次）</a-select-option>
              <a-select-option value="highCost">高成本低质量</a-select-option>
            </a-select>
            <a-input
              v-model="filterUserId"
              class="ts-filter-item"
              placeholder="按用户 ID 筛选"
              allow-clear
            />
            <a-input
              v-model="filterModel"
              class="ts-filter-item"
              placeholder="按模型名筛选"
              allow-clear
            />
            <a-select v-model="filterStatus" class="ts-filter-item" placeholder="按状态筛选" allow-clear>
              <a-select-option value="completed">成功</a-select-option>
              <a-select-option value="failed">失败</a-select-option>
              <a-select-option value="cancelled">取消</a-select-option>
            </a-select>
          </div>

          <div class="mg-table-wrap">
            <a-table
              class="mg-table"
              size="small"
              :columns="diagnosticColumns"
              :data-source="diagnosticTasks"
              :loading="tasksLoading"
              :pagination="taskPagination"
              :scroll="{ x: 1200 }"
              row-key="sessionId"
              @change="onTaskTableChange"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'status'">
                  <a-tag :color="statusColor(record.status)">{{ statusText(record.status) }}</a-tag>
                </template>
                <template v-else-if="column.key === 'retryCount'">
                  <a-tag v-if="record.retryCount >= 2" color="orange">{{ record.retryCount }}次</a-tag>
                  <span v-else class="mg-muted">{{ record.retryCount || 0 }}</span>
                </template>
                <template v-else-if="column.key === 'cost'">
                  <span class="diagnostic-cost">¥{{ (record.estimatedCost || 0).toFixed(3) }}</span>
                </template>
                <template v-else-if="column.key === 'diagnosis'">
                  <div class="diagnostic-conclusion">
                    <a-tag v-if="record.status === 'failed'" :color="getFailCategoryColor(record.failCategory)">
                      {{ getFailCategoryLabel(record.failCategory) }}
                    </a-tag>
                    <span class="diagnostic-action">
                      {{ getDiagnosticAction(record) }}
                    </span>
                  </div>
                </template>
                <template v-else-if="column.key === 'startTime'">
                  {{ formatTime(record.startTime) }}
                </template>
                <template v-else-if="column.key === 'componentName'">
                  <a-tooltip :title="record.componentName">
                    <span class="ts-ellipsis">{{ record.componentName || '-' }}</span>
                  </a-tooltip>
                </template>
                <template v-else-if="column.key === 'models'">
                  <a-tooltip placement="topLeft">
                    <template #title>
                      <div v-if="record.textModel">文本: {{ record.textModel }}</div>
                      <div v-if="record.visionModel">视觉: {{ record.visionModel }}</div>
                    </template>
                    <div class="ts-models-cell">
                      <span v-if="record.textModel" class="ts-model-text">{{ shortModel(record.textModel) }}</span>
                      <span v-if="record.visionModel" class="ts-model-vision">{{ shortModel(record.visionModel) }}</span>
                    </div>
                  </a-tooltip>
                </template>
                <template v-else-if="column.key === 'duration'">
                  {{ formatDurationMs(record.duration) }}
                </template>
                <template v-else>
                  <span class="ts-ellipsis">{{ record[column.key] ?? '-' }}</span>
                </template>
              </template>
            </a-table>
          </div>
          <p class="ts-hint">
            口径：成功率 = 成功 ÷ (成功 + 失败)，排除取消；token 为调用级精确，文件/行数为任务级参与（text/vision 有重叠）。
            失败分类：<a-tag color="red">质量</a-tag> 归模型 ·
            <a-tag color="orange">环境</a-tag> 归基础设施 ·
            <a-tag>其他</a-tag> 归管线 bug。
          </p>
        </section>
      </a-tab-pane>

      <!-- Tab 2：模型效果对比 -->
      <a-tab-pane key="compare" tab="模型效果对比">
        <section class="mg-section">
          <div class="mg-section-head">
            <h2 class="mg-section-title">哪个模型更好？</h2>
            <span class="mg-count">共 {{ compare.length }} 个模型·代理组合</span>
          </div>

          <!-- 图表化对比区 -->
          <div v-if="compare.length > 0" class="ts-compare-charts">
            <!-- 成功率对比 -->
            <div class="ts-chart-card">
              <h4 class="ts-chart-title">成功率对比 <span class="ts-chart-sub">越高越好</span></h4>
              <div class="ts-bar-chart">
                <div v-for="item in topCompare" :key="'sr-'+item.key" class="ts-bar-row">
                  <div class="ts-bar-label">
                    <div class="ts-bar-model" :title="item.model">{{ shortModel(item.model) }}</div>
                    <div class="ts-bar-proxy" :title="item.baseURL">{{ shortProxy(item.baseURL) }}</div>
                  </div>
                  <div class="ts-bar-track">
                    <div
                      class="ts-bar-fill"
                      :style="{
                        width: `${(item.successRate || 0) * 100}%`,
                        backgroundColor: barColor(item.successRate)
                      }"
                    />
                    <span class="ts-bar-value">{{ rateText(item.successRate) }}</span>
                  </div>
                  <a-tag v-if="item.smallSample" color="default" size="small">样本少</a-tag>
                  <a-tag v-else-if="isBestSuccessRate(item)" color="gold" size="small">最佳</a-tag>
                </div>
              </div>
            </div>

            <!-- 耗时效率对比 -->
            <div class="ts-chart-card">
              <h4 class="ts-chart-title">每百行耗时 <span class="ts-chart-sub">秒/百行，越小越好</span></h4>
              <div class="ts-bar-chart">
                <div v-for="item in topCompare" :key="'dur-'+item.key" class="ts-bar-row">
                  <div class="ts-bar-label">
                    <div class="ts-bar-model" :title="item.model">{{ shortModel(item.model) }}</div>
                    <div class="ts-bar-proxy" :title="item.baseURL">{{ shortProxy(item.baseURL) }}</div>
                  </div>
                  <div class="ts-bar-track">
                    <div
                      class="ts-bar-fill ts-bar-fill-duration"
                      :style="{ width: `${secPer100BarWidth(item)}%` }"
                    />
                    <span class="ts-bar-value">{{ formatSecPer100(item) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Token 效率对比 -->
            <div class="ts-chart-card">
              <h4 class="ts-chart-title">每百行 Token <span class="ts-chart-sub">K/百行，越小越好</span></h4>
              <div class="ts-bar-chart">
                <div v-for="item in topCompare" :key="'tok-'+item.key" class="ts-bar-row">
                  <div class="ts-bar-label">
                    <div class="ts-bar-model" :title="item.model">{{ shortModel(item.model) }}</div>
                    <div class="ts-bar-proxy" :title="item.baseURL">{{ shortProxy(item.baseURL) }}</div>
                  </div>
                  <div class="ts-bar-track">
                    <div
                      class="ts-bar-fill ts-bar-fill-token"
                      :style="{ width: `${tokenKPer100BarWidth(item)}%` }"
                    />
                    <span class="ts-bar-value">{{ formatTokenKPer100(item) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 精简表格（可展开查看详情） -->
          <a-collapse :bordered="false" class="ts-detail-collapse">
            <a-collapse-panel key="1" header="查看详细数据表">
              <div class="mg-table-wrap">
                <a-table
                  class="mg-table"
                  size="small"
                  :columns="compareColumnsShort"
                  :data-source="compare"
                  :loading="compareLoading"
                  :pagination="false"
                  :scroll="{ x: 1200 }"
                  row-key="key"
                >
                  <template #bodyCell="{ column, record }">
                    <template v-if="column.key === 'type'">
                      <a-tag :color="record.type === 'vision' ? 'purple' : 'cyan'">
                        {{ record.type === 'vision' ? '视觉' : '文本' }}
                      </a-tag>
                    </template>
                    <template v-else-if="column.key === 'model'">
                      <a-tooltip :title="record.model">
                        <span class="ts-ellipsis">{{ record.model || '-' }}</span>
                      </a-tooltip>
                    </template>
                    <template v-else-if="column.key === 'successRate'">
                      <span :style="{ color: successColor(record) }">{{ rateText(record.successRate) }}</span>
                    </template>
                    <template v-else-if="column.key === 'qualitySuccessRate'">
                      <span :style="{ color: successColor(record), fontWeight: 600 }">
                        {{ rateText(record.qualitySuccessRate) }}
                      </span>
                    </template>
                    <template v-else-if="column.key === 'durationP50Ms'">
                      {{ formatDurationMs(record.durationP50Ms) }}
                    </template>
                    <template v-else-if="column.key === 'totalTokens'">
                      {{ formatTokens(record.totalTokens) }}
                    </template>
                    <template v-else-if="column.key === 'failBreakdown'">
                      <span v-if="record.failed === 0" class="mg-muted">-</span>
                      <span v-else>
                        <span class="ts-fail-q" title="质量失败">质{{ record.qualityFail }}</span>
                        <span class="ts-fail-e" title="环境失败">环{{ record.envFail }}</span>
                      </span>
                    </template>
                    <template v-else-if="column.key === 'smallSample'">
                      <a-tag v-if="record.smallSample" color="default">样本少</a-tag>
                      <span v-else class="mg-muted">✓</span>
                    </template>
                    <template v-else-if="column.key === 'secPer100LinesP50'">
                      <span v-if="record.secPer100LinesP50 !== null">{{ record.secPer100LinesP50.toFixed(1) }}s</span>
                      <span v-else class="mg-muted">-</span>
                    </template>
                    <template v-else-if="column.key === 'tokenKPer100LinesP50'">
                      <span v-if="record.tokenKPer100LinesP50 !== null">{{ record.tokenKPer100LinesP50.toFixed(2) }}K</span>
                      <span v-else class="mg-muted">-</span>
                    </template>
                    <template v-else>
                      <a-tooltip :title="record[column.key]">
                        <span class="ts-ellipsis">{{ record[column.key] ?? '-' }}</span>
                      </a-tooltip>
                    </template>
                  </template>
                </a-table>
              </div>
            </a-collapse-panel>
          </a-collapse>

          <p class="ts-hint">
            <b>怎么看：</b>成功率越高越好（≥80% 优秀）；每百行耗时/Token 越小越好（效率归一化指标）。
            「质量成功率」排除了环境问题，更能反映模型本身能力。样本 &lt; 3 的结论仅供参考。
          </p>
        </section>
      </a-tab-pane>

      <!-- Tab 3：历史表现 -->
      <a-tab-pane key="trends" tab="历史表现">
        <section class="mg-section">
          <div class="mg-section-head">
            <h2 class="mg-section-title">随时间变化，效果稳定吗？</h2>
            <div class="ts-trend-controls">
              <a-select v-model:value="trendGranularity" class="ts-trend-select" @change="loadTrends">
                <a-select-option value="day">按天看</a-select-option>
                <a-select-option value="week">按周看</a-select-option>
              </a-select>
              <a-select v-model:value="trendMetric" class="ts-trend-select" @change="loadTrends">
                <a-select-option value="successRate">成功率变化</a-select-option>
                <a-select-option value="duration">耗时变化</a-select-option>
                <a-select-option value="tokens">Token 消耗</a-select-option>
                <a-select-option value="taskCount">任务数量</a-select-option>
              </a-select>
            </div>
          </div>

          <!-- 解读说明 -->
          <div class="ts-trend-insight">
            <template v-if="trendMetric === 'successRate'">
              <span class="ts-insight-icon">📈</span>
              <span>这条线表示<b>每天/每周的成功率</b>。线往上走说明效果变好，往下掉说明有问题。绿色区域 ≥80% 是正常范围。</span>
            </template>
            <template v-else-if="trendMetric === 'duration'">
              <span class="ts-insight-icon">⏱️</span>
              <span>这条线表示<b>每天/每周的耗时中位数</b>。线越低越快，突然变高可能是模型响应慢或任务复杂。</span>
            </template>
            <template v-else-if="trendMetric === 'tokens'">
              <span class="ts-insight-icon">💰</span>
              <span>这条线表示<b>每天/每周的 Token 消耗量</b>。Token 是成本指标，越高花费越多。</span>
            </template>
            <template v-else>
              <span class="ts-insight-icon">📊</span>
              <span>这条线表示<b>每天/每周的任务数量</b>。可以看出使用频率的变化。</span>
            </template>
          </div>

          <div v-if="trendsLoading" class="ts-trend-loading">加载中...</div>
          <div v-else-if="trends.length === 0" class="ts-trend-empty">暂无数据</div>
          <div v-else class="ts-trend-chart">
            <svg :viewBox="`0 0 ${chartWidth} ${chartHeight}`" class="ts-trend-svg">
              <!-- 背景网格 -->
              <line v-for="(tick, i) in yTicks" :key="'grid-'+i" :x1="chartPadding" :y1="tick.y" :x2="chartWidth - chartPadding" :y2="tick.y" stroke="#f0f0f0" stroke-width="1"/>
              <!-- 80% 参考线（成功率时显示） -->
              <template v-if="trendMetric === 'successRate' && yMax <= 1">
                <line :x1="chartPadding" :y1="chartPadding + (chartHeight - 2 * chartPadding) * (1 - 0.8)" :x2="chartWidth - chartPadding" :y2="chartPadding + (chartHeight - 2 * chartPadding) * (1 - 0.8)" stroke="#52c41a" stroke-width="1" stroke-dasharray="4,4" opacity="0.5"/>
                <text :x="chartWidth - chartPadding + 5" :y="chartPadding + (chartHeight - 2 * chartPadding) * (1 - 0.8) + 4" font-size="10" fill="#52c41a">80%</text>
              </template>
              <!-- Y 轴 -->
              <line :x1="chartPadding" :y1="chartPadding" :x2="chartPadding" :y2="chartHeight - chartPadding" stroke="#d9d9d9" stroke-width="1"/>
              <!-- X 轴 -->
              <line :x1="chartPadding" :y1="chartHeight - chartPadding" :x2="chartWidth - chartPadding" :y2="chartHeight - chartPadding" stroke="#d9d9d9" stroke-width="1"/>
              <!-- Y 轴刻度 -->
              <text v-for="(tick, i) in yTicks" :key="'y-'+i" :x="chartPadding - 8" :y="tick.y + 4" text-anchor="end" font-size="11" fill="#666">{{ tick.label }}</text>
              <!-- 面积填充 -->
              <polygon
                :points="trendAreaPoints"
                fill="url(#trendGradient)"
                opacity="0.3"
              />
              <!-- 折线 -->
              <polyline
                :points="trendLinePoints"
                fill="none"
                stroke="#1890ff"
                stroke-width="2.5"
                stroke-linejoin="round"
              />
              <!-- 数据点 -->
              <circle
                v-for="(point, i) in trendPoints"
                :key="'p-'+i"
                :cx="point.x"
                :cy="point.y"
                r="4"
                fill="#fff"
                stroke="#1890ff"
                stroke-width="2"
              >
                <title>{{ point.tooltip }}</title>
              </circle>
              <!-- X 轴标签 -->
              <text
                v-for="(point, i) in trendPoints.filter((_, idx) => idx % Math.ceil(trends.length / 8) === 0)"
                :key="'x-'+i"
                :x="point.x"
                :y="chartHeight - chartPadding + 18"
                text-anchor="middle"
                font-size="11"
                fill="#666"
              >{{ point.dateLabel }}</text>
              <!-- 渐变定义 -->
              <defs>
                <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#1890ff" stop-opacity="0.4"/>
                  <stop offset="100%" stop-color="#1890ff" stop-opacity="0"/>
                </linearGradient>
              </defs>
            </svg>
          </div>

          <p class="ts-hint">
            💡 <b>小提示：</b>悬停数据点可以看具体数值。如果某段突然变差，可以切换到「任务日志」tab 查看那几天的具体任务。
          </p>
        </section>
      </a-tab-pane>

    </a-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import http from '@/core/http'

const activeTab = ref('dashboard')

// ---------- 仪表台数据 ----------
const dashboard = ref<any>({
  overview: {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    successRate: null,
    avgDurationMs: 0,
    totalTokens: 0,
    activeUsers: 0,
  },
  modelRanking: [],
  trends: [],
  failDistribution: {
    quality: 0,
    qualityRate: 0,
    env: 0,
    envRate: 0,
    other: 0,
    otherRate: 0,
    total: 0,
  },
  departmentSummary: [],
  windowLabel: '近 30 天',
})
const dashboardLoading = ref(false)

// 失败归因展开状态
const expandedFailType = ref<'quality' | 'env' | 'other' | null>(null)

const toggleFailDetails = (type: 'quality' | 'env' | 'other') => {
  expandedFailType.value = expandedFailType.value === type ? null : type
}

const failTypeLabel = (type: string) => {
  const labels = {
    quality: '质量失败',
    env: '环境失败',
    other: '其他错误',
  }
  return labels[type as keyof typeof labels] || type
}

// 仪表台趋势图尺寸
const trendChartWidth = 800
const trendChartHeight = 280
const trendChartPadding = 50

// 部门表格列
const departmentColumns = [
  { title: '部门', dataIndex: 'department', key: 'department', width: 150 },
  { title: '用户数', dataIndex: 'userCount', key: 'userCount', width: 80, sorter: (a: any, b: any) => a.userCount - b.userCount },
  { title: '任务数', dataIndex: 'taskCount', key: 'taskCount', width: 80, sorter: (a: any, b: any) => a.taskCount - b.taskCount },
  { title: '成功率', key: 'successRate', width: 100, sorter: (a: any, b: any) => (a.successRate || 0) - (b.successRate || 0) },
  { title: '耗时 P50', key: 'durationP50Ms', width: 100, sorter: (a: any, b: any) => (a.durationP50Ms || 0) - (b.durationP50Ms || 0) },
]

// 仪表台趋势图计算
const dashboardTrendPoints = computed(() => {
  if (dashboard.value.trends.length === 0) return []
  const points: Array<{ x: number; y: number; dateLabel: string; tooltip: string }> = []
  const plotWidth = trendChartWidth - trendChartPadding * 2
  const plotHeight = trendChartHeight - trendChartPadding * 2
  const xStep = plotWidth / Math.max(dashboard.value.trends.length - 1, 1)

  for (let i = 0; i < dashboard.value.trends.length; i++) {
    const t = dashboard.value.trends[i]
    const x = trendChartPadding + i * xStep
    const y = trendChartPadding + plotHeight * (1 - (t.successRate || 0))
    const date = new Date(t.timestamp)
    const dateLabel = `${date.getMonth() + 1}/${date.getDate()}`
    const tooltip = `${dateLabel}\n成功率: ${((t.successRate || 0) * 100).toFixed(1)}%\n任务数: ${t.taskCount || 0}`
    points.push({ x, y, dateLabel, tooltip })
  }
  return points
})

const dashboardTrendLinePoints = computed(() => {
  return dashboardTrendPoints.value.map(p => `${p.x},${p.y}`).join(' ')
})

const dashboardTrendAreaPoints = computed(() => {
  if (dashboardTrendPoints.value.length === 0) return ''
  const first = dashboardTrendPoints.value[0]
  const last = dashboardTrendPoints.value[dashboardTrendPoints.value.length - 1]
  const bottom = trendChartHeight - trendChartPadding
  return `${first.x},${bottom} ${dashboardTrendLinePoints.value} ${last.x},${bottom}`
})

const dashboardTrendTicks = computed(() => {
  const ticks: Array<{ y: number; label: string }> = []
  const plotHeight = trendChartHeight - trendChartPadding * 2
  for (let i = 0; i <= 4; i++) {
    const ratio = i / 4
    const value = 1 - ratio
    const y = trendChartPadding + plotHeight * ratio
    ticks.push({ y, label: `${(value * 100).toFixed(0)}%` })
  }
  return ticks
})

function successRateColor(rate: number | null): string {
  if (rate === null || rate === undefined) return 'var(--text-secondary)'
  if (rate >= 0.8) return '#52c41a'
  if (rate >= 0.5) return '#faad14'
  return '#ff4d4f'
}

async function loadDashboard() {
  dashboardLoading.value = true
  try {
    const res = await http.get('/api/task-stats/dashboard')
    // http.get 返回响应体本身，后端返回 { success, data: { overview, modelRanking, ... }, source }
    if (res && res.success && res.data) {
      dashboard.value = {
        overview: res.data.overview || dashboard.value.overview,
        modelRanking: res.data.modelRanking || [],
        trends: res.data.trends || [],
        failDistribution: res.data.failDistribution || dashboard.value.failDistribution,
        departmentSummary: res.data.departmentSummary || [],
        windowLabel: res.data.windowLabel || '近 30 天',
      }
    }
  } catch (e: any) {
    message.error(e.message || '加载仪表台数据失败')
  } finally {
    dashboardLoading.value = false
  }
}

// ---------- 时间窗（R7） ----------
const timePreset = ref('all')
const customRange = ref<any>(null)
const windowLabel = ref('全部时间')

function windowParams(): Record<string, string> {
  if (timePreset.value === 'all') return {}
  if (timePreset.value === 'custom') {
    if (!customRange.value || customRange.value.length !== 2) return {}
    return {
      preset: 'custom',
      from: isoYmd(customRange.value[0]),
      to: isoYmd(customRange.value[1]),
    }
  }
  return { preset: timePreset.value }
}

function isoYmd(v: any): string {
  if (!v) return ''
  if (typeof v === 'string') return v
  if (typeof v.format === 'function') return v.format('YYYY-MM-DD')
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`
  }
  return ''
}

// ---------- 任务日志 ----------
const tasks = ref<any[]>([])
const tasksLoading = ref(false)
const taskPagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  pageSizeOptions: ['20', '50', '100'],
})

// R9：客户端筛选
const filterUserId = ref('')
const filterModel = ref('')
const filterStatus = ref('')
const diagnosticFilter = ref('')

// 异常任务过滤（默认只显示需要关注的）
const diagnosticTasks = computed(() => {
  const uid = filterUserId.value.trim().toLowerCase()
  const mdl = filterModel.value.trim().toLowerCase()
  const st = filterStatus.value
  const diagType = diagnosticFilter.value
  
  return tasks.value.filter((t) => {
    // 过滤掉 running/pending 任务
    if (t.status === 'running' || t.status === 'pending') return false
    
    // 默认只显示异常任务（失败 / 重试≥2次 / 高成本低质量）
    if (!diagType) {
      const isFailed = t.status === 'failed'
      const isHighRetry = t.retryCount >= 2
      const isHighCostLowQuality = (t.estimatedCost || 0) > 0.5 && t.status === 'completed' && !t.success
      if (!isFailed && !isHighRetry && !isHighCostLowQuality) return false
    } else {
      // 按筛选类型过滤
      if (diagType === 'failed' && t.status !== 'failed') return false
      if (diagType === 'retry' && t.retryCount < 2) return false
      if (diagType === 'highCost' && !((t.estimatedCost || 0) > 0.5 && t.status === 'completed' && !t.success)) return false
    }
    
    if (uid) {
      const userIdMatch = (t.userId || '').toLowerCase().includes(uid)
      const usernameMatch = (t.username || '').toLowerCase().includes(uid)
      if (!userIdMatch && !usernameMatch) return false
    }
    if (st && t.status !== st) return false
    if (mdl) {
      const tm = (t.textModel || '').toLowerCase()
      const vm = (t.visionModel || '').toLowerCase()
      if (!tm.includes(mdl) && !vm.includes(mdl)) return false
    }
    return true
  })
})

// 异常摘要统计
const diagnosticSummary = computed(() => {
  const abnormal = diagnosticTasks.value
  const failedCount = abnormal.filter(t => t.status === 'failed').length
  const wastedCost = abnormal.reduce((sum, t) => sum + (t.estimatedCost || 0), 0)
  
  // 主要瓶颈分析
  const failCategories = abnormal.filter(t => t.status === 'failed').map(t => t.failCategory || 'other')
  const categoryCount: Record<string, number> = {}
  failCategories.forEach(cat => {
    categoryCount[cat] = (categoryCount[cat] || 0) + 1
  })
  
  let mainBottleneck = '无'
  if (Object.keys(categoryCount).length > 0) {
    const sorted = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])
    const top = sorted[0][0]
    mainBottleneck = top === 'quality' ? '质量门禁' : top === 'env' ? '环境问题' : '其他'
  }
  
  return {
    abnormalCount: abnormal.length,
    wastedCost,
    mainBottleneck,
  }
})

// 诊断台表格列
const diagnosticColumns = [
  { title: '时间', key: 'startTime', width: 130, sorter: (a: any, b: any) => (a.startTime || 0) - (b.startTime || 0) },
  { title: '组件', key: 'componentName', width: 160, ellipsis: true },
  { title: '模型', key: 'models', width: 180, ellipsis: true },
  { title: '重试', key: 'retryCount', width: 70, sorter: (a: any, b: any) => (a.retryCount || 0) - (b.retryCount || 0) },
  { title: '成本', key: 'cost', width: 80, sorter: (a: any, b: any) => (a.estimatedCost || 0) - (b.estimatedCost || 0) },
  { title: '耗时', key: 'duration', width: 80, sorter: (a: any, b: any) => (a.duration || 0) - (b.duration || 0) },
  { title: '状态', key: 'status', width: 70 },
  { title: '诊断结论', key: 'diagnosis', width: 220 },
]

// 失败分类颜色
function getFailCategoryColor(category: string): string {
  if (category === 'quality') return 'red'
  if (category === 'env') return 'orange'
  return 'default'
}

// 失败分类标签
function getFailCategoryLabel(category: string): string {
  if (category === 'quality') return '质量失败'
  if (category === 'env') return '环境问题'
  return '其他'
}

// 诊断建议
function getDiagnosticAction(task: any): string {
  if (task.status === 'failed') {
    if (task.failCategory === 'quality') return '建议：降低复杂度重试'
    if (task.failCategory === 'env') return '建议：检查环境后重试'
    return '建议：联系管理员'
  }
  if (task.retryCount >= 2) return '多次重试，建议人工介入'
  if ((task.estimatedCost || 0) > 0.5 && !task.success) return '高成本低质量，建议优化需求'
  return ''
}

watch([filterUserId, filterModel, filterStatus], () => {
  taskPagination.current = 1
})

const taskColumns = [
  { title: '时间', key: 'startTime', width: 130, sorter: (a: any, b: any) => (a.startTime || 0) - (b.startTime || 0) },
  { title: '组件', key: 'componentName', width: 160, ellipsis: true },
  { title: '用户', key: 'userId', width: 80 },
  { title: '类型', key: 'target', width: 60 },
  { title: '状态', key: 'status', width: 70 },
  { title: '模型', key: 'models', width: 220, ellipsis: true },
  { title: 'Token / 行数', key: 'tokensAndLines', width: 100, sorter: (a: any, b: any) => (a.totalTokens || 0) - (b.totalTokens || 0) },
  { title: '耗时', key: 'duration', width: 80, sorter: (a: any, b: any) => (a.duration || 0) - (b.duration || 0) },
  { title: '失败原因', key: 'failReason', width: 180, ellipsis: true },
]

// ---------- 模型对比 ----------
const compare = ref<any[]>([])
const compareLoading = ref(false)

// 精简版表格列（折叠面板内）
const compareColumnsShort = [
  { title: '类型', key: 'type', width: 60 },
  { title: '模型', key: 'model', width: 140, ellipsis: true },
  { title: '成功率', key: 'successRate', width: 80, sorter: (a: any, b: any) => (a.successRate || 0) - (b.successRate || 0) },
  { title: '质量成功率', key: 'qualitySuccessRate', width: 90, sorter: (a: any, b: any) => (a.qualitySuccessRate || 0) - (b.qualitySuccessRate || 0) },
  { title: '失败', key: 'failBreakdown', width: 100 },
  { title: '耗时 P50', key: 'durationP50Ms', width: 90, sorter: (a: any, b: any) => (a.durationP50Ms || 0) - (b.durationP50Ms || 0) },
  { title: 'Token', key: 'totalTokens', width: 90, sorter: (a: any, b: any) => (a.totalTokens || 0) - (b.totalTokens || 0) },
  { title: '每百行耗时(s)', key: 'secPer100LinesP50', width: 110, sorter: (a: any, b: any) => (a.secPer100LinesP50 || 0) - (b.secPer100LinesP50 || 0) },
  { title: '每百行Token(K)', key: 'tokenKPer100LinesP50', width: 120, sorter: (a: any, b: any) => (a.tokenKPer100LinesP50 || 0) - (b.tokenKPer100LinesP50 || 0) },
  { title: '样本', key: 'smallSample', width: 70 },
]

// 图表用：取任务数最多的前 6 个模型
const topCompare = computed(() => {
  return [...compare.value]
    .filter(r => !r.smallSample) // 排除样本不足的
    .sort((a, b) => b.taskCount - a.taskCount)
    .slice(0, 6)
})

// 成功率最佳标注
function isBestSuccessRate(item: any): boolean {
  if (item.smallSample) return false
  const best = Math.max(...topCompare.value.filter(r => !r.smallSample).map(r => r.successRate || 0))
  return (item.successRate || 0) === best && best > 0
}

// 柱状图颜色
function barColor(rate: number | null): string {
  if (rate === null || rate === undefined) return '#d9d9d9'
  if (rate >= 0.8) return '#52c41a'
  if (rate >= 0.5) return '#faad14'
  return '#ff4d4f'
}

// 耗时柱宽（相对最大值）
function durationBarWidth(ms: number | null): number {
  if (!ms) return 0
  const maxDur = Math.max(...topCompare.value.map(r => r.durationP50Ms || 0))
  return maxDur > 0 ? (ms / maxDur) * 100 : 0
}

// 效率指标：每百行耗时(秒) / 每百行Token(K)
function formatSecPer100(item: any): string {
  if (item.secPer100LinesP50 === null || item.secPer100LinesP50 === undefined) return '—'
  return `${item.secPer100LinesP50.toFixed(1)}s/百行`
}

function secPer100BarWidth(item: any): number {
  if (item.secPer100LinesP50 === null || item.secPer100LinesP50 === undefined) return 0
  // 越低越好，反转：最小值 = 100% 宽度
  const vals = topCompare.value
    .filter(r => r.secPer100LinesP50 !== null && r.secPer100LinesP50 !== undefined)
    .map(r => r.secPer100LinesP50)
  if (vals.length === 0) return 0
  const minVal = Math.min(...vals)
  const maxVal = Math.max(...vals)
  if (maxVal === minVal) return 50
  // 反转：值越小，宽度越大
  return ((maxVal - item.secPer100LinesP50) / (maxVal - minVal)) * 100
}

function formatTokenKPer100(item: any): string {
  if (item.tokenKPer100LinesP50 === null || item.tokenKPer100LinesP50 === undefined) return '—'
  return `${item.tokenKPer100LinesP50.toFixed(2)}K/百行`
}

function tokenKPer100BarWidth(item: any): number {
  if (item.tokenKPer100LinesP50 === null || item.tokenKPer100LinesP50 === undefined) return 0
  // 越低越好，反转：最小值 = 100% 宽度
  const vals = topCompare.value
    .filter(r => r.tokenKPer100LinesP50 !== null && r.tokenKPer100LinesP50 !== undefined)
    .map(r => r.tokenKPer100LinesP50)
  if (vals.length === 0) return 0
  const minVal = Math.min(...vals)
  const maxVal = Math.max(...vals)
  if (maxVal === minVal) return 50
  // 反转：值越小，宽度越大
  return ((maxVal - item.tokenKPer100LinesP50) / (maxVal - minVal)) * 100
}

// 模型名缩写
function shortModel(name: string): string {
  if (!name) return '-'
  // 取最后一段（去掉提供商前缀）
  const parts = name.split('/')
  const short = parts[parts.length - 1]
  return short.length > 16 ? short.slice(0, 16) + '…' : short
}

// 代理名缩写
function shortProxy(url: string): string {
  if (!url) return '-'
  // 提取域名部分
  const match = url.match(/^(?:https?:\/\/)?(?:www\.)?([^\/]+)/i)
  if (match) {
    const host = match[1]
    // 简化常见域名
    if (host.includes('openai')) return 'OpenAI'
    if (host.includes('anthropic')) return 'Anthropic'
    if (host.includes('dashscope')) return '阿里云'
    if (host.includes('baidu')) return '百度'
    if (host.includes('zhipu')) return '智谱'
    if (host.includes('moonshot')) return '月之暗面'
    if (host.includes('deepseek')) return 'DeepSeek'
    if (host.includes('claude')) return 'Claude'
    // 取主域名
    const parts = host.split('.')
    if (parts.length >= 2) {
      return parts[parts.length - 2] // 取倒数第二段
    }
    return host.slice(0, 12)
  }
  return url.slice(0, 12)
}

// ---------- 格式化 ----------
function formatTime(v: any): string {
  if (!v) return '-'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '-'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function formatDurationMs(ms: unknown): string {
  const n = Number(ms)
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1000) return `${Math.round(n)}ms`
  const sec = n / 1000
  if (sec < 60) return `${sec < 10 ? sec.toFixed(1) : Math.round(sec)}s`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm ? `${h}h ${rm}m` : `${h}h`
}

function formatTokens(n: number): string {
  if (!n) return '0'
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function shortId(id: string): string {
  return id ? id.slice(0, 8) : '-'
}

function shortUrl(url: string): string {
  if (!url) return '-'
  return url.replace(/^https?:\/\//, '').slice(0, 36)
}

function shortReason(r: string): string {
  if (!r) return '-'
  return r.length > 28 ? r.slice(0, 28) + '…' : r
}

function statusColor(s: string): string {
  if (s === 'completed') return 'green'
  if (s === 'failed') return 'red'
  if (s === 'cancelled') return 'default'
  return 'orange'
}

function statusText(s: string): string {
  if (s === 'completed') return '成功'
  if (s === 'failed') return '失败'
  if (s === 'cancelled') return '取消'
  return s || '-'
}

function failTypeColor(t: string): string {
  if (t === 'quality') return 'red'
  if (t === 'env') return 'orange'
  return 'default'
}

function failTypeText(t: string): string {
  if (t === 'quality') return '质量'
  if (t === 'env') return '环境'
  return '其他'
}

function rateText(r: number | null): string {
  if (r === null || r === undefined) return '—'
  return `${(r * 100).toFixed(0)}%`
}

function successColor(record: any): string {
  if (record.taskCount < 3) return 'var(--text-secondary)'
  const r = record.successRate
  if (r === null || r === undefined) return 'var(--text-secondary)'
  if (r >= 0.8) return 'var(--color-success, #52c41a)'
  if (r >= 0.5) return 'var(--color-warning, #faad14)'
  return 'var(--color-danger, #ff4d4f)'
}

function onTaskTableChange(pag: any) {
  taskPagination.current = pag.current
  taskPagination.pageSize = pag.pageSize
}

function onWindowChange() {
  reloadAll()
}

async function reloadAll() {
  await Promise.all([loadTasks(), loadCompare()])
}

// ---------- 数据加载 ----------
async function loadTasks() {
  tasksLoading.value = true
  try {
    const data = await http.get('/api/task-stats/tasks', windowParams())
    // http.get 返回响应体本身，后端返回 { success, data: { list, count, windowLabel } }
    if (data && data.success && data.data) {
      tasks.value = data.data.list || []
      taskPagination.total = diagnosticTasks.value.length
      windowLabel.value = data.data.windowLabel || '全部时间'
    }
  } catch (e: any) {
    message.error(e.message || '加载任务日志失败')
    if (e.status === 401 || e.status === 403) message.error('无权限或登录已过期')
  } finally {
    tasksLoading.value = false
  }
}

async function loadCompare() {
  compareLoading.value = true
  try {
    const data = await http.get('/api/task-stats/model-compare', windowParams())
    // http.get 返回响应体本身，后端返回 { success, data: { list, count, windowLabel } }
    if (data && data.success && data.data) {
      compare.value = (data.data.list || []).map((r: any, i: number) => ({
        ...r,
        key: `${r.type}:${r.model}:${r.baseURL}:${i}`,
      }))
      windowLabel.value = data.data.windowLabel || '全部时间'
    }
  } catch (e: any) {
    message.error(e.message || '加载模型对比失败')
    if (e.status === 401 || e.status === 403) message.error('无权限或登录已过期')
  } finally {
    compareLoading.value = false
  }
}

// 筛选变化时总数同步
watch(diagnosticTasks, (v) => {
  taskPagination.total = v.length
})

// ---------- 效果趋势（R12） ----------
const trends = ref<any[]>([])
const trendsLoading = ref(false)
const trendGranularity = ref<'day' | 'week'>('day')
const trendMetric = ref<'successRate' | 'duration' | 'tokens' | 'taskCount'>('successRate')

// 图表尺寸
const chartWidth = 800
const chartHeight = 300
const chartPadding = 50

// 计算图表数据点
const trendPoints = computed(() => {
  if (trends.value.length === 0) return []

  const points: Array<{ x: number; y: number; dateLabel: string; tooltip: string; value: number }> = []
  const plotWidth = chartWidth - chartPadding * 2
  const plotHeight = chartHeight - chartPadding * 2

  // 获取 Y 轴范围
  let maxValue = 0
  let minValue = 0
  for (const t of trends.value) {
    const v = getMetricValue(t)
    if (v > maxValue) maxValue = v
    if (v < minValue) minValue = v
  }

  // 成功率特殊处理：0-1 范围
  if (trendMetric.value === 'successRate') {
    minValue = 0
    maxValue = 1
  } else if (maxValue === minValue) {
    maxValue = minValue + 1
  }

  const xStep = trends.value.length > 1 ? plotWidth / (trends.value.length - 1) : 0

  for (let i = 0; i < trends.value.length; i++) {
    const t = trends.value[i]
    const value = getMetricValue(t)
    const x = chartPadding + i * xStep
    const yRatio = (value - minValue) / (maxValue - minValue)
    const y = chartHeight - chartPadding - yRatio * plotHeight

    const date = new Date(t.timestamp)
    const dateLabel = `${date.getMonth() + 1}/${date.getDate()}`

    let tooltip = `${dateLabel}\n`
    if (trendMetric.value === 'successRate') {
      tooltip += `成功率: ${(value * 100).toFixed(1)}%\n任务数: ${t.taskCount}`
    } else if (trendMetric.value === 'duration') {
      tooltip += `耗时 P50: ${formatDurationMs(value)}\n任务数: ${t.taskCount}`
    } else if (trendMetric.value === 'tokens') {
      tooltip += `Token: ${formatTokens(value)}\n任务数: ${t.taskCount}`
    } else {
      tooltip += `任务数: ${value}\n成功: ${t.completed}`
    }

    points.push({ x, y, dateLabel, tooltip, value })
  }

  return points
})

// 计算折线点
const trendLinePoints = computed(() => {
  return trendPoints.value.map((p) => `${p.x},${p.y}`).join(' ')
})

// 计算面积填充点（闭合多边形）
const trendAreaPoints = computed(() => {
  if (trendPoints.value.length === 0) return ''
  const bottom = chartHeight - chartPadding
  const first = trendPoints.value[0]
  const last = trendPoints.value[trendPoints.value.length - 1]
  const linePoints = trendPoints.value.map((p) => `${p.x},${p.y}`).join(' ')
  return `${first.x},${bottom} ${linePoints} ${last.x},${bottom}`
})

// Y 轴最大值（用于判断是否显示 80% 参考线）
const yMax = computed(() => {
  if (trendMetric.value === 'successRate') return 1
  let max = 0
  for (const t of trends.value) {
    const v = getMetricValue(t)
    if (v > max) max = v
  }
  return max
})

// 计算 Y 轴刻度
const yTicks = computed(() => {
  if (trends.value.length === 0) return []

  const ticks: Array<{ y: number; label: string }> = []
  const plotHeight = chartHeight - chartPadding * 2

  let maxValue = 0
  let minValue = 0
  for (const t of trends.value) {
    const v = getMetricValue(t)
    if (v > maxValue) maxValue = v
    if (v < minValue) minValue = v
  }

  if (trendMetric.value === 'successRate') {
    minValue = 0
    maxValue = 1
  } else if (maxValue === minValue) {
    maxValue = minValue + 1
  }

  // 生成 5 个刻度
  for (let i = 0; i <= 4; i++) {
    const ratio = i / 4
    const value = minValue + (maxValue - minValue) * ratio
    const y = chartHeight - chartPadding - ratio * plotHeight

    let label = ''
    if (trendMetric.value === 'successRate') {
      label = `${(value * 100).toFixed(0)}%`
    } else if (trendMetric.value === 'duration') {
      label = formatDurationMs(value)
    } else if (trendMetric.value === 'tokens') {
      label = formatTokens(value)
    } else {
      label = String(Math.round(value))
    }

    ticks.push({ y, label })
  }

  return ticks
})

function getMetricValue(t: any): number {
  if (trendMetric.value === 'successRate') {
    return t.successRate ?? 0
  } else if (trendMetric.value === 'duration') {
    return t.durationP50Ms ?? 0
  } else if (trendMetric.value === 'tokens') {
    return t.totalTokens ?? 0
  } else {
    return t.taskCount ?? 0
  }
}

async function loadTrends() {
  trendsLoading.value = true
  try {
    const params = {
      ...windowParams(),
      granularity: trendGranularity.value,
    }
    const data = await http.get('/api/task-stats/trends', params)
    trends.value = data.data.series || []
  } catch (e: any) {
    message.error(e.message || '加载趋势数据失败')
    if (e.status === 401 || e.status === 403) message.error('无权限或登录已过期')
  } finally {
    trendsLoading.value = false
  }
}

onMounted(() => {
  loadDashboard()
  reloadAll()
  loadTrends()
})
</script>

<style lang="less" scoped>
.ts-window-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  margin-bottom: 12px;
  background: var(--bg-elevated, #fafafa);
  border: 1px solid var(--border-color, #eee);
  border-radius: 8px;
}
.ts-window-label {
  font-weight: 600;
  color: var(--text-primary, #333);
}
.ts-window-select {
  width: 120px;
}
.ts-window-range {
  width: 240px;
}
.ts-window-info {
  font-size: 12px;
  color: var(--text-secondary, #888);
  margin-left: auto;
}
.ts-filter-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.ts-filter-item {
  width: 200px;
}
.mg-muted {
  color: var(--text-secondary, #888);
}
.ts-reason {
  display: inline-block;
  max-width: 170px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ts-ellipsis {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ts-models-cell,
.ts-tokens-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}
.ts-model-text { color: var(--text-primary, #333); }
.ts-model-vision { color: #722ed1; font-size: 11px; }
.ts-proxy-inline { color: var(--text-secondary, #888); font-size: 11px; }
.ts-tokens { color: var(--text-primary, #333); font-weight: 500; }
.ts-lines { color: var(--text-secondary, #888); font-size: 11px; }
.ts-fail-q { color: #ff4d4f; margin-right: 6px; }
.ts-fail-e { color: #faad14; margin-right: 6px; }
.ts-fail-o { color: #999; }
.ts-hint {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--text-secondary, #888);
  line-height: 1.7;
}

// R12 趋势图
.ts-trend-controls {
  display: flex;
  gap: 10px;
}
.ts-trend-select {
  width: 110px;
}
.ts-trend-insight {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 16px;
  margin: 12px 0;
  background: linear-gradient(135deg, #e6f7ff 0%, #f0f5ff 100%);
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary, #333);
}
.ts-insight-icon {
  font-size: 18px;
  flex-shrink: 0;
}
.ts-trend-loading,
.ts-trend-empty {
  text-align: center;
  padding: 40px 0;
  color: var(--text-secondary, #888);
}
.ts-trend-chart {
  margin: 16px 0;
}
.ts-trend-svg {
  width: 100%;
  height: auto;
  background: var(--bg-elevated, #fafafa);
  border: 1px solid var(--border-color, #eee);
  border-radius: 8px;
}

// 模型对比图表
.ts-compare-charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
  margin: 16px 0;
}
.ts-chart-card {
  background: var(--bg-elevated, #fafafa);
  border: 1px solid var(--border-color, #eee);
  border-radius: 10px;
  padding: 16px;
}
.ts-chart-title {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #333);
}
.ts-chart-sub {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-secondary, #888);
  margin-left: 6px;
}
.ts-bar-chart {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ts-bar-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ts-bar-label {
  width: 100px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ts-bar-model {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary, #333);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ts-bar-proxy {
  font-size: 10px;
  color: var(--text-secondary, #888);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ts-bar-track {
  flex: 1;
  height: 24px;
  background: var(--bg-base, #fff);
  border: 1px solid var(--border-color, #eee);
  border-radius: 4px;
  position: relative;
  overflow: hidden;
}
.ts-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
  background: #1890ff;
}
.ts-bar-fill-duration {
  background: linear-gradient(90deg, #52c41a 0%, #faad14 50%, #ff4d4f 100%);
}
.ts-bar-fill-token {
  background: linear-gradient(90deg, #722ed1 0%, #eb2f96 100%);
}
.ts-bar-value {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary, #333);
}
.ts-detail-collapse {
  margin-top: 16px;
  background: transparent;
  border: none;
}
.ts-detail-collapse :deep(.ant-collapse-header) {
  font-size: 13px;
  color: var(--text-secondary, #888);
  padding: 8px 0 !important;
}
.ts-detail-collapse :deep(.ant-collapse-content-box) {
  padding: 0 !important;
}

// 仪表台样式
.dashboard-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.dashboard-kpi-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.dashboard-kpi-label {
  font-size: 13px;
  opacity: 0.9;
  margin-bottom: 8px;
}

.dashboard-kpi-value {
  font-size: 28px;
  font-weight: 600;
  margin-bottom: 8px;
}

.dashboard-kpi-sub {
  font-size: 12px;
  opacity: 0.8;
}

.dashboard-two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 24px;
}

@media (max-width: 1200px) {
  .dashboard-two-col {
    grid-template-columns: 1fr;
  }
}

.dashboard-card {
  background: var(--bg-elevated, #fafafa);
  border: 1px solid var(--border-color, #eee);
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

.dashboard-card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #333);
  margin: 0 0 16px 0;
}

.dashboard-empty {
  text-align: center;
  padding: 40px 0;
  color: var(--text-secondary, #888);
}

.dashboard-model-ranking {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dashboard-model-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  background: var(--bg-base, #fff);
  border-radius: 6px;
  transition: all 0.2s;
}

.dashboard-model-row:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.dashboard-model-rank {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #667eea;
  color: white;
  border-radius: 50%;
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}

.dashboard-model-info {
  flex: 1;
  min-width: 0;
}

.dashboard-model-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #333);
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.dashboard-model-meta {
  font-size: 12px;
  color: var(--text-secondary, #888);
}

.dashboard-model-tasks {
  font-size: 12px;
  color: var(--text-secondary, #888);
  white-space: nowrap;
}

.dashboard-fail-distribution {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dashboard-fail-bar {
  display: flex;
  height: 40px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-base, #fff);
}

.dashboard-fail-segment {
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.3s;
}

.dashboard-fail-segment.quality {
  background: #ff4d4f;
}

.dashboard-fail-segment.env {
  background: #faad14;
}

.dashboard-fail-segment.other {
  background: #d9d9d9;
  color: var(--text-primary, #333);
}

.dashboard-fail-legend {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dashboard-fail-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.dashboard-fail-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dashboard-fail-dot.quality {
  background: #ff4d4f;
}

.dashboard-fail-dot.env {
  background: #faad14;
}

.dashboard-fail-dot.other {
  background: #d9d9d9;
}

.dashboard-fail-count {
  margin-left: auto;
  font-weight: 600;
  color: var(--text-primary, #333);
}

.dashboard-fail-total {
  font-size: 13px;
  color: var(--text-secondary, #888);
  text-align: right;
  margin-top: 8px;
}

.dashboard-fail-item.clickable {
  cursor: pointer;
  transition: background 0.2s;
  padding: 6px 8px;
  border-radius: 4px;
}

.dashboard-fail-item.clickable:hover {
  background: var(--bg-elevated, #f5f5f5);
}

.dashboard-fail-expand {
  margin-left: 4px;
  font-size: 10px;
  color: var(--text-secondary, #888);
}

.dashboard-fail-details {
  margin-top: 12px;
  padding: 12px;
  background: var(--bg-elevated, #fafafa);
  border-radius: 6px;
  border: 1px solid var(--border-color, #eee);
}

.dashboard-fail-details-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #333);
  margin-bottom: 10px;
}

.dashboard-fail-details-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.dashboard-fail-detail-item {
  padding: 10px;
  background: var(--bg-base, #fff);
  border-radius: 4px;
  border: 1px solid var(--border-color, #e8e8e8);
}

.dashboard-fail-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.dashboard-fail-detail-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #333);
}

.dashboard-fail-detail-time {
  font-size: 12px;
  color: var(--text-secondary, #888);
}

.dashboard-fail-detail-error {
  font-size: 12px;
  color: var(--error-color, #ff4d4f);
  word-break: break-all;
  line-height: 1.5;
  font-family: 'Courier New', monospace;
}

.dashboard-trend-chart {
  margin-top: 16px;
}

.dashboard-trend-svg {
  width: 100%;
  height: auto;
  background: var(--bg-base, #fff);
  border-radius: 6px;
}

/* 诊断台样式 */
.diagnostic-summary-bar {
  display: flex;
  gap: 24px;
  padding: 16px 20px;
  background: linear-gradient(135deg, #fff5f5 0%, #fff 100%);
  border: 1px solid #ffccc7;
  border-radius: 8px;
  margin-bottom: 16px;
}

.diagnostic-summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 120px;
}

.diagnostic-summary-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary, #333);
  line-height: 1.2;
}

.diagnostic-summary-value.warning {
  color: #fa8c16;
}

.diagnostic-summary-value.danger {
  color: #ff4d4f;
}

.diagnostic-summary-label {
  font-size: 12px;
  color: var(--text-secondary, #888);
  margin-top: 4px;
}

.diagnostic-cost {
  font-family: 'Courier New', monospace;
  color: var(--text-secondary, #666);
}

.diagnostic-conclusion {
  display: flex;
  align-items: center;
  gap: 8px;
}

.diagnostic-action {
  font-size: 12px;
  color: var(--text-secondary, #666);
  line-height: 1.4;
}
</style>
