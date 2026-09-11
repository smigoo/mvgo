<template>
  <div class="task-detail-page">
    <!-- ═══ 面包屑栏 ═══ -->
    <div class="breadcrumb-bar">
      <button class="bc-back" @click="goBackToList">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        返回
      </button>
      <span class="bc-sep">/</span>
      <!-- 2026-09-04：面包屑改为「任务号 · 组件中文名 · 组件ID」 -->
      <span class="bc-title">{{ sessionId }}</span>
      <span class="bc-session">· {{ task?.displayName || task?.componentName || '未命名组件' }}<template v-if="task?.componentId"> · {{ task.componentId }}</template></span>

      <div class="breadcrumb-actions" v-if="task">
        <button v-if="task.status === 'running'" class="btn-action btn-pause" @click="handlePause">
          ⏸ 暂停
        </button>
        <button v-if="task.status === 'paused'" class="btn-action" @click="handleResume">
          ▶ 恢复
        </button>
        <button
          v-if="task.status === 'running' || task.status === 'paused'"
          class="btn-danger"
          @click="handleCancel"
        >
          ✕ 取消
        </button>
        <button class="btn-refresh" @click="handleManualRefresh">↻ 刷新</button>
        <McSpecCheckButton
          v-if="!pageTaskFlag && taskTarget === 'microcode' && task && (task.status === 'completed' || (task.fileCount && task.fileCount > 0))"
          :component-id="task.componentId || sessionId"
        />
        <button
          v-if="!pageTaskFlag && canPushGit && task && (task.status === 'completed' || (task.fileCount && task.fileCount > 0))"
          class="btn-action btn-gitlab-push"
          @click="openGitLabPush"
        >
          🚀 推送到 GitLab
        </button>
      </div>
    </div>

    <!-- ═══ 主布局 ═══ -->
    <div class="detail-layout">
      <div class="detail-body" :class="{ 'detail-body--empty': !task }">
        <!-- ═══ 左侧边栏 ═══ -->
        <aside class="sidebar" v-if="task">
          <!-- 任务配置 -->
          <div class="sidebar-section">
            <!-- <div class="section-head">
              <span class="section-title">任务配置</span>
            </div> -->
            <!-- 输入源 -->
            <div class="sidebar-field">
              <div class="field-label">输入源</div>
              <div class="source-tabs">
                <button
                  type="button"
                  class="source-tab"
                  :class="{ active: taskSourceMode === 'screenshot' }"
                  disabled
                >
                  截图
                </button>
                <button
                  type="button"
                  class="source-tab"
                  :class="{ active: taskSourceMode === 'figma' }"
                  disabled
                >
                  Figma
                </button>
                <button
                  v-if="!pageTaskFlag"
                  type="button"
                  class="source-tab"
                  :class="{ active: taskSourceMode === 'html' }"
                  disabled
                >
                  HTML
                </button>
              </div>
              <!-- 来源具体值 + 操作按钮 -->
              <!-- Figma 来源：源设计缩略图 + URL -->
              <div class="source-value" v-if="taskSourceMode === 'figma'">
                <div class="source-block-label">{{ sourceBlockLabel }}</div>
                <div class="source-thumb-row source-thumb-row--full">
                  <img
                    v-if="!sourceImageFailed"
                    :key="sourceImageReloadKey"
                    :src="sourceDesignImageUrl"
                    :alt="task.componentName || 'Figma 源设计'"
                    class="source-thumb source-thumb--clickable"
                    loading="lazy"
                    @click="sourceImagePreviewVisible = true"
                    @load="onSourceImageLoad"
                    @error="onSourceImageError"
                    title="点击查看大图"
                  />
                  <span v-else class="source-thumb-placeholder">{{ sourceDesignPlaceholder }}</span>
                </div>
                <div class="source-url-row" v-if="figmaUrl">
                  <div class="source-url-popover-wrap">
                    <span class="source-url source-url--truncate">{{ figmaUrlShort }}</span>
                    <div class="source-url-popover">{{ figmaUrl }}</div>
                  </div>
                  <div class="source-actions">
                    <button type="button" class="source-action-btn" @click="copySourceUrl" title="复制 Figma URL">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    </button>
                    <a :href="figmaUrl" target="_blank" rel="noopener" class="source-action-btn" title="打开 Figma">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </a>
                  </div>
                </div>
              </div>
              <!-- 截图来源：截图原图 + 复制 -->
              <div class="source-value" v-else-if="taskSourceMode === 'screenshot'">
                <div class="source-block-label">{{ sourceBlockLabel }}</div>
                <div class="source-thumb-row source-thumb-row--full">
                  <img
                    v-if="!sourceImageFailed"
                    :key="sourceImageReloadKey"
                    :src="sourceDesignImageUrl"
                    alt="截图来源"
                    class="source-thumb source-thumb--clickable"
                    loading="lazy"
                    @click="sourceImagePreviewVisible = true"
                    @load="onSourceImageLoad"
                    @error="onSourceImageError"
                    title="点击查看大图"
                  />
                  <span v-else class="source-thumb-placeholder">{{ sourceDesignPlaceholder }}</span>
                </div>
              </div>
              <div class="source-value source-batch" v-if="batchContext">
                <span class="batch-info">批次 {{ batchContext.index }}/{{ batchContext.total }}</span>
              </div>


            </div>
            <!-- 代码类型（仅组件任务展示） -->
            <div class="sidebar-field" v-if="!pageTaskFlag">
              <div class="field-label">代码类型</div>
              <div class="seg-control">
                <button class="seg-opt" :class="{ active: taskTarget === 'vue3' }" disabled>
                  V3
                </button>
                <button class="seg-opt" :class="{ active: taskTarget === 'microcode' }" disabled>
                  MC
                </button>
              </div>
            </div>
            <!-- 生成规格（仅组件任务展示） -->
            <div class="sidebar-field" v-if="!pageTaskFlag">
              <div class="field-label">生成规格</div>
              <div class="seg-control">
                <button
                  class="seg-opt"
                  :class="{ active: taskTier === 'lite', 'seg-lite': taskTier === 'lite' }"
                  disabled
                >
                  Lite
                </button>
                <button class="seg-opt" :class="{ active: taskTier === 'max' }" disabled>
                  Max
                </button>
              </div>
            </div>
          </div>

          <!-- 任务信息 -->
          <div class="sidebar-section">
            <div class="section-head">
              <span class="section-title">任务信息</span>
            </div>
            <div class="info-grid">
              <span class="info-key">任务号</span>
              <span class="info-val info-mono">{{ sessionId }}</span>
              <span class="info-key">状态</span>
              <span class="status-badge" :class="statusBadgeClass">
                <span v-if="task.status === 'running'" class="sb-dot"></span>
                {{ statusLabel }}
              </span>
              <span class="info-key" v-if="task.componentName">名称</span>
              <!-- 2026-09-03：名称显示「组件中文名 · 组件ID」（原为 componentName=任务号，不直观） -->
              <span class="info-val" v-if="task.componentName">
                {{ task.displayName || task.componentName || '未命名组件' }}<template v-if="task.componentId"> · {{ task.componentId }}</template>
              </span>
              <span class="info-key" v-if="task.startTime">创建</span>
              <span class="info-val info-mono" v-if="task.startTime">
                {{ formatTime(task.startTime) }}
              </span>
              <!-- <template v-if="modelsUsed.length">
                <span class="info-key">模型</span>
                <span class="info-val info-mono">{{ modelsUsed.join(', ') }}</span>
              </template> -->
            </div>
          </div>

          <!-- AI 模型使用（任务结束后展示） -->
          <div class="sidebar-section" v-if="modelsUsed.length && task.status !== 'running'">
            <div class="section-head">
              <span class="section-title">AI 模型</span>
            </div>
            <div class="model-tags">
              <span v-for="m in modelsUsed" :key="m" class="model-tag">{{ m }}</span>
            </div>
          </div>

          <!-- 质量门禁 -->
          <div class="sidebar-section" v-if="task.qualityGate">
            <div class="section-head">
              <span class="section-title">质量门禁</span>
            </div>
            <div class="qg-badge" :class="task.qualityGate">{{ qualityGateLabel }}</div>
          </div>
        </aside>

        <!-- ═══ 主内容区 ═══ -->
        <main class="main-content">
          <div class="content-scroll">
            <!-- ═══ 加载中 ═══ -->
            <div v-if="loading" class="detail-loading">
              <span class="loading-spinner"></span>
              加载任务详情...
            </div>

            <!-- ═══ 兜底轮询 ═══ -->
            <div v-else-if="taskMissingRetries > 0 && taskMissingRetries < 3" class="detail-loading">
              <span class="loading-spinner"></span>
              任务初始化中，请稍候...
            </div>

            <!-- ═══ 任务加载失败 / 不存在 ═══ -->
            <div v-else-if="!task" class="detail-empty">
              <svg
                class="empty-icon"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M22 12h-6l-2 3h-4l-2-3H2" />
                <path
                  d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
                />
              </svg>
              <h3>{{ taskLoadError || '任务不存在或已被删除' }}</h3>
              <p v-if="taskLoadError === '任务详情加载失败'" class="empty-description">
                任务记录可能仍然存在，请重试加载。
              </p>
              <div class="empty-actions">
                <button
                  v-if="taskLoadError === '任务详情加载失败'"
                  type="button"
                  class="empty-retry"
                  @click="handleManualRefresh"
                >
                  重新加载
                </button>
                <button type="button" class="empty-link" @click="goBackToList">返回任务列表</button>
              </div>
            </div>

            <!-- ═══ 统一画布 ═══ -->
            <template v-else>
              <div class="canvas">
                <!-- ── 概览区 ── -->
                <div class="canvas-overview">
                  <div class="overview-top">
                    <div class="overview-left">
                      <div class="identity-main">
                        <div class="identity-main-top">
                          <span
                            class="identity-copy"
                            :class="{ 'is-copied': copiedTaskId }"
                            :title="sessionId + '（点击复制任务号）'"
                            @click="copyTaskId"
                          >
                            <h2 class="identity-name">任务号：{{ sessionId }}</h2>
                            <svg
                              class="identity-copy-icon"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            >
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          </span>
                        </div>
                        <!-- <div class="identity-submeta">
                          <span class="identity-field-label">组件名：</span>
                          <span class="plugin-id">{{ task.displayName || task.componentName || '未命名组件' }}</span>
                          <span class="identity-field-sep">；</span>
                          <span class="identity-field-label">组件ID：</span>
                          <span class="plugin-id plugin-id-mono">{{ task.componentId || sessionId }}</span>
                        </div> -->
                        <div class="tag-row">
                          <span class="tag-pill tag-type">
                            {{ pageTaskFlag ? '页面' : (taskTarget === 'vue3' ? 'Vue3' : '微码') }}
                          </span>
                          <span class="tag-pill tag-source">
                            {{
                              taskSourceMode === 'screenshot'
                                ? '截图'
                                : taskSourceMode === 'figma'
                                  ? 'Figma'
                                  : 'HTML'
                            }}
                          </span>
                          <span class="tag-pill" v-if="!pageTaskFlag && taskTier">
                            {{ taskTier === 'lite' ? 'Lite' : 'Max' }}
                          </span>
                          <span class="tag-pill tag-batch" v-if="batchContext">
                            {{ batchContext.index }}/{{ batchContext.total }}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div class="acceptance-badge" v-if="task.status === 'running'">
                      ✓ 验收
                      <span class="ab-pct">{{ taskProgressPercent }}%</span>
                    </div>
                    <div
                      class="acceptance-badge badge-success"
                      v-else-if="task.status === 'completed'"
                    >
                      ✓ 完成
                      <span class="ab-pct">100%</span>
                    </div>
                  </div>

                  <!-- 步骤进度条（横向可滚动 · 当前步高亮 · 点击定位日志） -->
                  <div class="step-progress-section">
                    <div class="sp-summary">
                      <span class="sp-count">第 {{ currentStepOrdinal }}/{{ timelineSteps.length }} 步</span>
                      <span class="sp-current" v-if="activeStepName">进行中：{{ activeStepName }}</span>
                      <span class="sp-current sp-current--failed" v-else-if="failedStepName">
                        失败：{{ failedStepName }}
                      </span>
                    </div>
                    <div class="step-progress-track">
                      <!-- 底层轨道（100% 撑满容器） -->
                      <div class="sp-track-bg"></div>
                      <!-- 填充进度线 -->
                      <div
                        class="sp-track-fill"
                        :style="{ width: stepProgressWidth + '%' }"
                      ></div>
                      <template v-for="(step, si) in timelineSteps" :key="si">
                        <!-- 步骤节点 -->
                        <div
                          class="sp-node"
                          :class="step.state"
                          :title="step.name + ' · ' + stepStateLabel(step.state)"
                          @click="scrollLogToStep(si)"
                        >
                          <div class="sp-dot">
                            <svg
                              v-if="step.state === 'completed'"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2.5"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <svg
                              v-else-if="step.state === 'failed'"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="3"
                              stroke-linecap="round"
                            >
                              <path d="M6 6 L18 18 M18 6 L6 18" />
                            </svg>
                            <span v-else-if="step.state === 'active'" class="sp-pulse">●</span>
                            <span v-else class="sp-num">{{ si + 1 }}</span>
                          </div>
                          <span
                            class="sp-label"
                            :class="{ 'text-muted': step.state === 'pending' || step.state === 'skipped' }"
                          >
                            {{ step.name }}
                          </span>
                          <span
                            v-if="step.state === 'active' || step.state === 'failed' || step.state === 'skipped' || step.state === 'parallel'"
                            class="sp-status"
                            :class="'sp-st-' + step.state"
                          >
                            {{ step.timeLabel }}
                          </span>
                        </div>
                      </template>
                    </div>
                  </div>

                  <!-- ── 失败任务：醒目的错误摘要卡片 ── -->
                  <div class="failure-summary-card" v-if="task.status === 'failed' && failureSummary">
                    <div class="fsc-icon">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                      </svg>
                    </div>
                    <div class="fsc-content">
                      <div class="fsc-title">生成失败</div>
                      <div class="fsc-message">{{ failureSummary }}</div>
                      <button
                        v-if="pageTaskFlag"
                        class="fsc-retry-btn"
                        :disabled="retrying"
                        @click="handlePageRetry"
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="23 4 23 10 17 10"/>
                          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                        </svg>
                        {{ retrying ? '重新生成中...' : '重新生成页面骨架' }}
                      </button>
                    </div>
                  </div>
                </div>

                <!-- ── 分割线 ── -->
                <div class="canvas-divider"></div>

                <!-- ── 交付面板（组件产物可用后展示，置顶，紧凑状态栏）── -->
                <div
                  v-if="task.status === 'completed' || canOpenPlayground"
                  class="delivery-panel visible"
                >
                  <div class="delivery-head">
                    <div class="delivery-icon" :class="{ 'delivery-icon-warn': task.status !== 'completed' }">
                      {{ task.status === 'completed' ? '✓' : '⚠' }}
                    </div>
                    <div>
                      <div class="delivery-title">
                        {{ pageTaskFlag
                          ? (task.status === 'completed' ? '页面生成完成' : '页面骨架已生成（草稿）')
                          : (task.status === 'completed' ? '组件生成完成' : '组件代码已生成（草稿）') }}
                      </div>
                      <div class="delivery-desc" v-if="task.status !== 'completed'">
                        {{ pageTaskFlag
                          ? '当前为页面骨架草稿，可进入 Playground 查看与编辑'
                          : '质量门禁未通过，当前为未验收草稿代码；可进入 Playground 查看与修复' }}
                      </div>
                    </div>
                  </div>
                  <div class="delivery-actions">
                    <!-- 🛡️ 2026-09-04：原生 href 下载不带 Token 头 → 生产 401，改 fetch+Blob -->
                    <button
                      v-if="task.status === 'completed' || canOpenPlayground"
                      type="button"
                      class="btn-delivery btn-delivery-primary"
                      @click="downloadArtifact"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      下载产物
                    </button>
                    <button
                      v-if="!pageTaskFlag && task.status === 'completed' && componentRecord && isOwnComponent"
                      type="button"
                      class="btn-delivery"
                      :class="isPublicComponent ? 'btn-delivery-pool--public' : 'btn-delivery-warning'"
                      :disabled="poolPushing"
                      @click="pushToPublicPool"
                    >
                      <svg
                        v-if="!isPublicComponent"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <svg
                        v-else
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="8" y1="12" x2="16" y2="12" />
                      </svg>
                      {{ poolPushing ? '处理中…' : (isPublicComponent ? '下架公共池' : '推送到公共池') }}
                    </button>
                    <!-- 🛡️ 2026-09-03：绑定状态切换——已对接显示「撤回对接」，未对接显示「对接接口」 -->
                    <button
                      v-if="!pageTaskFlag && (task.status === 'completed' || canOpenPlayground) && isVue3Target && !latestBindingId"
                      class="btn-delivery"
                      type="button"
                      @click="openBindingWizard"
                    >
                      对接接口
                    </button>
                    <button
                      v-if="!pageTaskFlag && latestBindingId"
                      class="btn-delivery btn-delivery-danger"
                      type="button"
                      :disabled="rollingBack"
                      @click="confirmRollbackBinding"
                    >
                      {{ rollingBack ? '撤回中…' : '撤回对接' }}
                    </button>
                    <button
                      v-if="task.status === 'failed' && canOpenPlayground"
                      type="button"
                      class="btn-delivery btn-delivery-warning"
                      @click="openGitLabPush"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      上传产物
                    </button>
                  </div>
                </div>

                <!-- ── 组件名 + 操作按钮栏 ── -->
                <div class="canvas-header">
                  <div class="ch-name-row">
                    <span class="ch-name">{{ task.componentName || (pageTaskFlag ? '未命名页面' : '未命名组件') }}({{ task.componentId }})</span>
                    <GradientButton
                      v-if="canOpenPlayground"
                      class="btn-playground-gradient"
                      :border-width="2"
                      :border-radius="14"
                      :blur="0"
                      :duration="3000"
                      bg-color="var(--btn-playground-bg, #1a1a2e)"
                      title="在 Playground 中查看和编辑组件"
                      @click="openPlayground"
                    >
                      <CodeOutlined style="margin-right: 5px;" />
                      Playground
                    </GradientButton>
                    <!-- 🛡️ A 方案：生成进行中进入 PG 为草稿模式，主组件锁定不可编辑 -->
                    <div
                      v-if="task.status === 'running' && canOpenPlayground && task.artifactReadyLevel === 'partial'"
                      style="margin-top:8px;padding:6px 10px;background:rgba(255,193,7,0.12);border:1px solid rgba(255,193,7,0.4);border-radius:8px;color:#b88230;font-size:12px;line-height:1.5;"
                    >
                      ⚠ 生成进行中：当前为草稿模式，主组件(index.vue)尚未生成完，进入 Playground 后将被锁定不可编辑（避免被生成覆盖）；子组件可正常编辑。
                    </div>
                    <span
                      v-if="task.userApproved"
                      class="speed-pass-mark"
                      title="用户点击「跳过剩余阶段」极速通过"
                    >
                      ⚡ 跳过剩余
                    </span>
                  </div>
                  <div class="ch-actions">
                    <button
                      v-if="isFigmaLiteCompleted(task)"
                      class="btn-upgrade"
                      :disabled="upgrading || assetUpgraded"
                      :title="assetUpgraded ? '素材已应用，无需重复升级' : ''"
                      @click="handleUpgradeAssets"
                    >
                      {{ assetUpgraded ? '已升级' : upgrading ? '升级中...' : '升级素材' }}
                    </button>
                    <!-- 人工审核按钮已隐藏 -->
                    <!-- <button
                      v-if="task.status === 'failed'"
                      class="btn-review"
                      @click="openReviewModal"
                    >
                      人工审核
                    </button> -->
                    <button
                      v-if="task.status === 'failed' || task.status === 'cancelled'"
                      class="btn-retry"
                      :disabled="retryBusy"
                      @click="handleRetry(false)"
                    >
                      {{ retrying ? '重新生成中...' : '重新生成' }}
                    </button>
                    <button
                      v-if="task.status !== 'running' && task.status !== 'paused'"
                      class="btn-delete-task"
                      @click="handleDeleteTask"
                    >
                      删除任务
                    </button>
                  </div>
                </div>
                <div class="ch-tabs">
                  <button
                    class="ch-tab"
                    :class="{ active: activeTab === 'logs' }"
                    @click="activeTab = 'logs'"
                  >
                    日志
                    <span class="ct-hotkey">(H)</span>
                  </button>
                  <button
                    class="ch-tab"
                    :class="{ active: activeTab === 'code' }"
                    @click="activeTab = 'code'; hasUnreadCode = false"
                  >
                    产物
                    <span v-if="codeSnapshot" class="ct-count">{{ codeSnapshot.files.length }}</span>
                    <span v-if="hasUnreadCode" class="ct-unread-dot"></span>
                  </button>
                  <button
                    class="ch-tab"
                    :class="{ active: activeTab === 'stats' }"
                    @click="activeTab = 'stats'"
                  >
                    统计
                  </button>
                  <button
                    class="ch-tab"
                    :class="{ active: activeTab === 'preview' }"
                    @click="activeTab = 'preview'"
                  >
                    预览
                  </button>
                </div>

                <!-- ── 分割线 ── -->
                <div class="canvas-divider"></div>

                <!-- ── Tab 面板：日志 ── -->
                <div class="log-panel" v-show="activeTab === 'logs'">
                  <div class="log-toolbar">
                    <div class="log-filter">
                      <button
                        class="log-filter-btn"
                        :class="{ active: logFilter === 'all' }"
                        @click="logFilter = 'all'"
                      >
                        全部
                      </button>
                      <button
                        class="log-filter-btn"
                        :class="{ active: logFilter === 'info' }"
                        @click="logFilter = 'info'"
                      >
                        INFO
                      </button>
                      <button
                        class="log-filter-btn"
                        :class="{ active: logFilter === 'warn' }"
                        @click="logFilter = 'warn'"
                      >
                        WARN
                      </button>
                      <button
                        class="log-filter-btn"
                        :class="{ active: logFilter === 'error' }"
                        @click="logFilter = 'error'"
                      >
                        ERROR
                      </button>
                    </div>
                    <div class="log-actions">
                      <button class="log-tool-btn" title="复制日志" @click="copyLogs">📋</button>
                      <button class="log-tool-btn" title="下载日志" @click="downloadLogs">↓</button>
                    </div>
                  </div>
                  <div class="log-body" ref="logBodyRef">
                    <template v-if="filteredLogs.length">
                      <div v-for="(log, li) in filteredLogs" :key="li" class="log-line">
                        <span class="log-ts">[{{ log.time }}]</span>
                        <span v-if="log.model" class="log-model" :title="'本次调用模型: ' + log.model">[{{ log.model }}]</span>
                        <span :class="'log-lv-' + log.level">{{ log.label }}</span>
                        <span class="log-msg">{{ log.message }}</span>
                        <span v-if="log.count > 1" class="log-count">×{{ log.count }}</span>
                      </div>
                    </template>
                    <div v-else class="log-empty-hint">暂无日志输出</div>
                  </div>
                  <div class="log-footer">
                    <div class="log-footer-left">
                      <span class="lf-item" v-if="task.status === 'running'">
                        <span class="lf-dot"></span>
                        实时流式输出中
                      </span>
                      <span class="lf-item">{{ logLines.length }} 行</span>
                      <label class="lf-autoscroll" title="新日志自动滚动到底部">
                        <input type="checkbox" v-model="autoScroll" /> 自动滚动
                      </label>
                    </div>
                    <span>
                      按
                      <kbd class="kbd-hint">H</kbd>
                      切换面板
                    </span>
                  </div>
                </div>

                <!-- ── Tab 面板：生成中代码（只读草稿，不执行 candidate） ── -->
                <div class="snapshot-code-panel" :class="{ visible: activeTab === 'code' }">
                  <div v-if="codeSnapshot" class="snapshot-code-shell">
                    <!-- 阶段状态条（移到面板顶部，全宽展示） -->
                    <div
                      v-if="fileLifecycleSummary || fileLifecycleLabel"
                      class="snapshot-phase-bar"
                    >
                      <span class="phase-dot" :class="`is-${fileLifecyclePhase || 'working'}`"></span>
                      <span class="phase-text">{{ fileLifecycleLabel }}<template v-if="fileLifecycleSummary"> · {{ fileLifecycleSummary }}</template></span>
                    </div>

                    <aside class="snapshot-file-list">
                      <div class="snapshot-file-header">
                        <span>候选文件</span>
                        <span>r{{ codeSnapshot.revision.slice(-6) }}</span>
                      </div>

                      <!-- 🛡️ 半成品：缺失关键文件清单（partial 快照） -->
                      <div v-if="codeSnapshot.status === 'partial' && codeSnapshot.missingFiles && codeSnapshot.missingFiles.length" class="snapshot-missing-summary">
                        <div class="sms-info">
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                            <line x1="12" y1="9" x2="12" y2="13"/>
                            <line x1="12" y1="17" x2="12.01" y2="17"/>
                          </svg>
                          <span class="sms-text">缺失关键文件：{{ codeSnapshot.missingFiles.join('、') }}</span>
                        </div>
                      </div>

                      <!-- 失败任务：问题文件摘要条 -->
                      <div v-if="failedFilesCount > 0" class="snapshot-failed-summary">
                        <div class="sfs-info">
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="12" y1="8" x2="12" y2="12"/>
                            <line x1="12" y1="16" x2="12.01" y2="16"/>
                          </svg>
                          <span class="sfs-text">{{ failedFilesCount }} 个文件存在问题</span>
                        </div>
                        <button class="sfs-locate-btn" @click="locateFirstFailedFile" title="定位到第一个问题文件">
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="11" cy="11" r="8"/>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                          </svg>
                          定位
                        </button>
                      </div>

                      <!-- 逐文件问题明细：直接列出文件 + 行列 + 错误码，点击直达 -->
                      <div v-if="failedFilePaths.length > 0" class="snapshot-issue-list">
                        <button
                          v-for="issueFile in failedFilePaths"
                          :key="issueFile"
                          class="sil-item"
                          :class="{ active: selectedSnapshotPath === issueFile }"
                          :title="issueFile"
                          @click="locateFailedFile(issueFile)"
                        >
                          <span class="sil-name">{{ issueFile.split('/').pop() }}</span>
                          <span class="sil-badge">
                            {{ qualityIssues.filter(i => i.file === issueFile && i.severity === 'BLOCK').length }}
                          </span>
                        </button>
                      </div>

                      <template v-for="row in visibleSnapshotRows" :key="row.node.path">
                        <button
                          v-if="row.node.type === 'folder'"
                          class="snapshot-file-item snapshot-folder-item"
                          :style="{ paddingLeft: `${12 + row.depth * 14}px` }"
                          :title="row.node.path"
                          @click="toggleSnapshotFolder(row.node.path)"
                        >
                          <svg
                            class="snapshot-folder-arrow"
                            :class="{ collapsed: collapsedSnapshotFolders.has(row.node.path) }"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.6"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          ><path d="M6 4l4 4-4 4" /></svg>
                          <svg class="snapshot-folder-icon" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 3.5A1.5 1.5 0 0 1 3 2h3.086a1 1 0 0 1 .707.293L8.207 3.707A1 1 0 0 0 8.914 4H13a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5v-8z" /></svg>
                          <span class="snapshot-file-name">{{ row.node.name }}</span>
                        </button>
                        <button
                          v-else
                          class="snapshot-file-item"
                          :class="{ active: selectedSnapshotPath === row.node.path }"
                          :style="{ paddingLeft: `${12 + row.depth * 14}px` }"
                          :title="row.node.path"
                          @click="openSnapshotFile(row.node.path)"
                        >
                          <span
                            class="snapshot-file-state"
                            :class="`is-${fileStateOf(row.node.path)}`"
                            :title="fileStateLabel(fileStateOf(row.node.path))"
                          ></span>
                          <span class="snapshot-file-name">{{ row.node.name }}</span>
                          <small>{{ formatSnapshotFileSize(row.node.size ?? 0) }}</small>
                        </button>
                      </template>
                    </aside>
                    <section class="snapshot-code-view">
                      <div class="snapshot-code-toolbar">
                        <span>{{ selectedSnapshotPath || '请选择文件' }}</span>
                        <span class="snapshot-state" :class="`is-${codeSnapshot.status}`">
                          {{ snapshotStatusLabel }}
                        </span>
                        <!-- 编辑闭环：编辑 → 保存（新 revision）→ 重新校验 → 刷新预览 -->
                        <template v-if="canEditSnapshot && !codeEditing">
                          <button class="snapshot-tool-btn" @click="startEditing" title="直接修改当前文件（保存后生成新的候选 revision）">
                            编辑
                          </button>
                        </template>
                        <template v-else-if="codeEditing">
                          <button class="snapshot-tool-btn" @click="cancelEditing">取消</button>
                          <button
                            class="snapshot-tool-btn is-primary"
                            :disabled="savingSnapshot || !codeDirty"
                            @click="saveSnapshotFile"
                            title="Ctrl/Cmd + S 保存。保存后会生成新的候选 revision 并自动刷新预览"
                          >
                            {{ savingSnapshot ? '保存中…' : '保存' }}
                          </button>
                        </template>
                        <button
                          class="snapshot-tool-btn"
                          :disabled="revalidating || savingSnapshot"
                          @click="revalidateSnapshot"
                          title="重跑质量门禁（LESS 真实编译 + SFC 语义 + 结构完整性），拿回逐文件行列级诊断"
                        >
                          {{ revalidating ? '校验中…' : '重新校验' }}
                        </button>
                        <button class="snapshot-tool-btn" @click="refreshPreviewSnapshot" title="忽略质量结论，强制用当前产物重新渲染预览">
                          刷新预览
                        </button>
                      </div>

                      <!-- 文件级错误明细（结构化诊断优先，日志匹配兜底） -->
                      <div v-if="selectedFileIssues.length > 0" class="snapshot-file-error-bar">
                        <div class="sfeb-header">
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="12" y1="8" x2="12" y2="12"/>
                            <line x1="12" y1="16" x2="12.01" y2="16"/>
                          </svg>
                          <span class="sfeb-title">此文件存在 {{ selectedFileIssues.length }} 个问题</span>
                        </div>
                        <div class="sfeb-list sfeb-list--rich">
                          <div
                            v-for="(issue, ei) in selectedFileIssues"
                            :key="ei"
                            class="sfeb-issue"
                            :class="`is-${issue.severity.toLowerCase()}`"
                          >
                            <button class="sfeb-issue-loc" @click="revealIssueLine(issue)" title="跳转到出错位置">
                              <span class="sfeb-code">{{ issue.id }}</span>
                              <span class="sfeb-pos">{{ issue.file.split('/').pop() }}:{{ issue.line }}:{{ issue.column }}</span>
                            </button>
                            <div class="sfeb-msg">{{ issue.message }}</div>
                            <pre v-if="issue.snippet && issue.snippet.length" class="sfeb-snippet"><code
                              ><span
                                v-for="(row, ri) in issue.snippet"
                                :key="ri"
                                class="sfeb-snippet-line"
                                :class="{ 'is-current': row.current }"
                              ><i class="sfeb-snippet-no">{{ row.line }}</i>{{ row.code }}
</span></code></pre>
                            <div v-if="issue.hint?.suggestion" class="sfeb-hint">建议：{{ issue.hint.suggestion }}</div>
                          </div>
                        </div>
                        <div class="sfeb-footer">
                          <button class="sfeb-copy-btn" @click="copySelectedFileErrors" title="复制此文件的错误信息">
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                            复制错误
                          </button>
                          <button class="sfeb-jump-btn" @click="jumpToFullLogs" title="在完整日志中查看">
                            查看完整日志 →
                          </button>
                        </div>
                      </div>
                      <div v-else-if="selectedFileLogErrors.length > 0" class="snapshot-file-error-bar">
                        <div class="sfeb-header">
                          <span class="sfeb-title">此文件相关日志（未拿到结构化诊断，仅供参考）</span>
                        </div>
                        <div class="sfeb-list">
                          <div v-for="(err, ei) in selectedFileLogErrors" :key="ei" class="sfeb-item">
                            <span class="sfeb-time">{{ err.time }}</span>
                            <span class="sfeb-msg">{{ err.message }}</span>
                          </div>
                        </div>
                        <div class="sfeb-footer">
                          <button class="sfeb-copy-btn" @click="copySelectedFileErrors">复制错误</button>
                          <button class="sfeb-jump-btn" @click="jumpToFullLogs">查看完整日志 →</button>
                        </div>
                      </div>

                      <div v-if="snapshotLoading" class="snapshot-code-empty">正在读取 revision 文件…</div>
                      <div v-else-if="snapshotError" class="snapshot-code-empty is-error">{{ snapshotError }}</div>
                      <div v-else-if="selectedSnapshotKind === 'image'" class="snapshot-image-wrap">
                        <img :src="selectedSnapshotUrl" :alt="selectedSnapshotPath" class="snapshot-image" />
                      </div>
                      <div v-else-if="selectedSnapshotKind === 'font'" class="snapshot-code-empty">
                        字体文件不支持预览（{{ selectedSnapshotPath }}）
                      </div>
                      <div v-else-if="selectedSnapshotKind === 'binary'" class="snapshot-code-empty">
                        二进制文件不支持预览（{{ selectedSnapshotPath }}）
                      </div>
                      <div v-else-if="codeEditing" class="snapshot-code-editor">
                        <textarea
                          v-model="codeDraft"
                          class="snapshot-code-textarea"
                          spellcheck="false"
                          @keydown.ctrl.s.prevent="saveSnapshotFile"
                          @keydown.meta.s.prevent="saveSnapshotFile"
                        ></textarea>
                        <div class="sce-hint">
                          正在编辑 <strong>{{ selectedSnapshotPath }}</strong> · 保存后生成新的不可变候选 revision，并自动重新校验 + 刷新预览（Ctrl/Cmd + S）
                        </div>
                      </div>
                      <div v-else class="snapshot-code-scroll" ref="snapshotCodeScrollRef">
                        <div class="snapshot-line-gutter" aria-hidden="true">
                          <span
                            v-for="n in snapshotLineCount"
                            :key="n"
                            :data-line="n"
                            :class="{ 'is-issue-line': issueLineSet.has(n) }"
                          >{{ n }}</span>
                        </div>
                        <div class="snapshot-code-body">
                          <div
                            v-if="activeIssueLine > 0"
                            class="snapshot-issue-line"
                            :style="{ top: `${16 + (activeIssueLine - 1) * 21.25}px` }"
                          ></div>
                          <pre class="snapshot-code-content"><code class="hljs" v-html="highlightedSnapshotContent"></code></pre>
                        </div>
                      </div>
                    </section>
                  </div>
                  <div v-else class="snapshot-code-empty">
                    尚未产生完整文件。代码生成角色完成首个文件组后将在这里显示。
                  </div>
                </div>

                <!-- ── Tab 面板：统计 ── -->
                <div class="stats-panel" :class="{ visible: activeTab === 'stats' }">
                  <div class="stat-card stat-card--blue">
                    <div class="stat-accent"></div>
                    <div class="stat-body">
                      <div class="stat-icon stat-ic-1">
                        <svg viewBox="0 0 1024 1024" fill="currentColor"><path d="M238.933333 443.733333h17.066667a119.466667 119.466667 0 0 1 0 238.933334H238.933333v136.533333h136.533334v-19.182933a117.3504 117.3504 0 1 1 234.7008 0V819.2H716.8v-204.6976L785.066667 614.4A68.3008 68.3008 0 0 0 785.066667 477.866667h-68.266667v-136.533334h-136.533333V273.066667a68.266667 68.266667 0 1 0-136.533334 0v68.266666H238.933333v102.4z m273.066667-307.2a136.533333 136.533333 0 0 1 136.533333 136.533334h136.533334v136.533333a136.533333 136.533333 0 0 1 0.034133 273.1008L785.066667 887.466667h-243.165867v-87.4496a49.083733 49.083733 0 0 0-98.167467 0V887.466667H170.666667v-273.066667h85.333333a51.2 51.2 0 0 0 0-102.4H170.666667V273.066667h204.8a136.533333 136.533333 0 0 1 136.533333-136.533334z"/></svg>
                      </div>
                      <div class="stat-info">
                        <div class="stat-num">{{ statsData.componentCount }}</div>
                        <div class="stat-label">生成组件数</div>
                      </div>
                    </div>
                  </div>
                  <div class="stat-card stat-card--green">
                    <div class="stat-accent"></div>
                    <div class="stat-body">
                      <div class="stat-icon stat-ic-2">
                        <svg viewBox="0 0 1027 1024" fill="currentColor"><path d="M321.828571 226.742857c-14.628571-14.628571-36.571429-14.628571-51.2 0L7.314286 482.742857c-14.628571 14.628571-14.628571 36.571429 0 51.2l256 256c14.628571 14.628571 36.571429 14.628571 51.2 0 14.628571-14.628571 14.628571-36.571429 0-51.2L87.771429 512l234.057142-234.057143c7.314286-14.628571 7.314286-36.571429 0-51.2z m263.314286 0c-14.628571 0-36.571429 7.314286-43.885714 29.257143l-131.657143 497.371429c-7.314286 21.942857 7.314286 36.571429 29.257143 43.885714s36.571429-7.314286 43.885714-29.257143l131.657143-497.371429c7.314286-14.628571-7.314286-36.571429-29.257143-43.885714z m431.542857 256l-256-256c-14.628571-14.628571-36.571429-14.628571-51.2 0-14.628571 14.628571-14.628571 36.571429 0 51.2L936.228571 512l-234.057142 234.057143c-14.628571 14.628571-14.628571 36.571429 0 51.2 14.628571 14.628571 36.571429 14.628571 51.2 0l256-256c14.628571-14.628571 14.628571-43.885714 7.314285-58.514286z"/></svg>
                      </div>
                      <div class="stat-info">
                        <div class="stat-num">{{ statsData.fileCount }}</div>
                        <div class="stat-label">代码文件</div>
                      </div>
                    </div>
                  </div>
                  <div class="stat-card stat-card--cyan">
                    <div class="stat-accent"></div>
                    <div class="stat-body">
                      <div class="stat-icon stat-ic-5">
                        <svg viewBox="0 0 1024 1024" fill="currentColor"><path d="M170.666667 170.666667h682.666666v85.333333H170.666667V170.666667m0 256h682.666666v85.333333H170.666667v-85.333333m0 256h682.666666v85.333333H170.666667v-85.333333m0 256h682.666666v85.333333H170.666667v-85.333333z"/></svg>
                      </div>
                      <div class="stat-info">
                        <div class="stat-num">{{ statsData.lineCount }}</div>
                        <div class="stat-label">代码行数</div>
                      </div>
                    </div>
                  </div>
                  <div class="stat-card stat-card--orange">
                    <div class="stat-accent"></div>
                    <div class="stat-body">
                      <div class="stat-icon stat-ic-3">
                        <svg viewBox="0 0 1024 1024" fill="currentColor"><path d="M554.666667 516.266667l102.4 102.4-59.733334 59.733333-123.733333-123.733333H469.333333V341.333333h85.333334v174.933334zM512 853.333333c-187.733333 0-341.333333-153.6-341.333333-341.333333s153.6-341.333333 341.333333-341.333333 341.333333 153.6 341.333333 341.333333-153.6 341.333333-341.333333 341.333333z m0-85.333333c140.8 0 256-115.2 256-256s-115.2-256-256-256-256 115.2-256 256 115.2 256 256 256z"/></svg>
                      </div>
                      <div class="stat-info">
                        <div class="stat-num">{{ taskElapsedTime }}</div>
                        <div class="stat-label">已用时间</div>
                      </div>
                    </div>
                  </div>
                  <div class="stat-card stat-card--purple">
                    <div class="stat-accent"></div>
                    <div class="stat-body">
                      <div class="stat-icon stat-ic-4">
                        <svg viewBox="0 0 1024 1024" fill="currentColor"><path d="M512 85.333333h-42.666667v469.333334h469.333334v-42.666667c0-235.648-191.018667-426.666667-426.666667-426.666667z m42.666667 384V173.312c154.389333 19.242667 276.778667 141.632 296.021333 296.021333H554.666667zM85.376 512c0-191.061333 125.568-352.789333 298.666667-407.146667v90.602667c-125.077333 50.645333-213.333333 173.290667-213.333334 316.522667 0 188.522667 152.832 341.333333 341.333334 341.333333 143.274667 0 265.92-88.256 316.544-213.354667h90.602666c-54.357333 173.12-216.085333 298.688-407.146666 298.688-235.626667 0-426.666667-191.018667-426.666667-426.666666z"/></svg>
                      </div>
                      <div class="stat-info">
                        <div class="stat-num">{{ statsData.estimatedRemaining }}</div>
                        <div class="stat-label">预计剩余</div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- ── Tab 面板：预览 ── -->
                <div class="preview-panel" :class="{ visible: activeTab === 'preview' }">
                  <div class="preview-hint">
                    <span class="ph-ic">
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </span>
                    <span>{{ previewHintText }}</span>
                    <!-- 🎨 面板类型：放在提示行右侧，不再浮在预览画布里遮挡组件内容。
                         通过 postMessage 下发给 iframe 内的预览页实时生效。 -->
                    <label v-if="showPanelTypeSwitch" class="ph-panel-type">
                      <span class="ph-pt-label">面板类型</span>
                      <select v-model="previewPanelType" class="ph-pt-select">
                        <option value="">使用默认</option>
                        <option value="default-panel">默认/浅色面板</option>
                        <option value="model-panels">弹窗面板</option>
                        <option value="aio-panel">一体化/深色面板</option>
                        <option value="empty">无面板</option>
                      </select>
                    </label>
                  </div>

                  <!-- 运行中且尚无可编译 revision：骨架预览 -->
                  <div class="browser-frame" v-if="task.status === 'running' && !shouldShowPreview">
                    <div class="bf-bar">
                      <div class="bf-dots">
                        <i></i>
                        <i></i>
                        <i></i>
                      </div>
                      <div class="bf-url">
                        {{ pageTaskFlag ? 'page' : 'component' }}://{{ task.componentName || sessionId }}/preview
                      </div>
                    </div>
                    <div class="bf-body">
                      <div class="sk-row" style="align-items: center">
                        <div class="sk-block" style="width: 28px; height: 28px"></div>
                        <div style="flex: 1">
                          <div class="sk-line" style="width: 42%; margin-bottom: 8px"></div>
                          <div class="sk-line" style="width: 24%; height: 9px"></div>
                        </div>
                      </div>
                      <div class="sk-row">
                        <div class="sk-block" style="flex: 1; height: 64px"></div>
                        <div class="sk-block" style="flex: 1; height: 64px"></div>
                        <div class="sk-block" style="flex: 1; height: 64px"></div>
                      </div>
                      <div class="sk-block" style="height: 120px; margin-bottom: 16px"></div>
                      <div class="sk-block" style="height: 96px"></div>
                      <div class="sk-overlay">
                        <div class="sk-spinner"></div>
                        <div class="sk-overlay-text">
                          <span class="lf-dot"></span>
                          正在渲染组件预览… {{ taskProgressPercent }}%
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- revision 或正式产物：真实 iframe 预览 -->
                  <div class="browser-frame" v-else-if="shouldShowPreview">
                    <div class="bf-bar">
                      <div class="bf-dots">
                        <i></i>
                        <i></i>
                        <i></i>
                      </div>
                      <div class="bf-url">
                        {{ pageTaskFlag ? 'page' : 'component' }}://{{ task.componentName || sessionId }}/preview
                      </div>
                      <span v-if="previewSourceLabel" class="bf-source" :title="previewSourceLabel">
                        {{ previewSourceLabel }}
                      </span>
                      <button
                        class="bf-action-btn"
                        :disabled="revalidating"
                        title="重跑质量门禁，拿回逐文件行列级诊断（不影响当前预览）"
                        @click="revalidateSnapshot"
                      >{{ revalidating ? '校验中' : '重新校验' }}</button>
                      <button
                        class="bf-action-btn"
                        title="忽略缓存，用当前产物强制重新渲染预览"
                        @click="refreshPreviewSnapshot"
                      >刷新</button>
                      <button
                        class="bf-fullscreen-btn"
                        title="在新窗口全屏预览（可自由拉伸）"
                        @click="openFullscreenPreview"
                      >
                        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6V3a1 1 0 0 1 1-1h3M14 6V3a1 1 0 0 0-1-1h-3M2 10v3a1 1 0 0 0 1 1h3M14 10v3a1 1 0 0 1-1 1h-3"/></svg>
                      </button>
                    </div>
                    <div ref="previewViewportRef" class="bf-body bf-body-real">
                      <div class="preview-scale-stage" :style="previewStageStyle">
                        <iframe
                          v-if="activePreviewSlot < 0 && shouldShowPreview"
                          :key="previewKey"
                          :src="previewUrl"
                          class="preview-iframe"
                          :style="previewIframeStyle"
                          frameborder="0"
                          scrolling="no"
                          sandbox="allow-scripts allow-same-origin allow-popups"
                        ></iframe>
                        <iframe
                          v-for="(frame, slot) in previewFrames"
                          v-show="frame.url && (slot === activePreviewSlot || slot === pendingPreviewSlot)"
                          :key="`revision-slot-${slot}-${previewReloadKey}`"
                          :src="frame.url"
                          class="preview-iframe preview-iframe-buffered"
                          :class="{ 'is-pending': slot === pendingPreviewSlot }"
                          :style="previewIframeStyle"
                          frameborder="0"
                          scrolling="no"
                          :aria-label="slot === activePreviewSlot ? '当前 revision 预览' : '候选 revision 预览加载中'"
                          sandbox="allow-scripts allow-same-origin allow-popups"
                        ></iframe>
                      </div>
                      <PreviewErrorBanner :message="previewError" @dismiss="clearPreviewError" />
                    </div>
                  </div>

                  <!-- 失败且无预览：强引导卡片 -->
                  <div class="browser-frame browser-frame--failed" v-else-if="task.status === 'failed'">
                    <div class="bf-bar">
                      <div class="bf-dots">
                        <i></i>
                        <i></i>
                        <i></i>
                      </div>
                      <div class="bf-url">
                        {{ pageTaskFlag ? 'page' : 'component' }}://{{ task.componentName || sessionId }}/preview
                      </div>
                    </div>
                    <div class="bf-body bf-body-failed">
                      <div class="failed-guide-card">
                        <!-- 诊断标签 -->
                        <div class="fgc-diagnosis" :style="{ borderColor: failureDiagnosis.color }">
                          <span class="fgc-diag-icon">{{ failureDiagnosis.icon }}</span>
                          <span class="fgc-diag-type">{{ {
                            timeout: '生成超时',
                            quality_gate: '质量门禁未通过',
                            syntax_error: '代码语法错误',
                            network: '网络异常中断',
                            interrupted: '生成被中断',
                            unknown: '未知错误'
                          }[failureDiagnosis.type] }}</span>
                          <span class="fgc-diag-sep">·</span>
                          <span class="fgc-diag-hint">{{ failureDiagnosis.explanation }}</span>
                        </div>

                        <div class="fgc-icon">
                          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="12" y1="8" x2="12" y2="12"/>
                            <line x1="12" y1="16" x2="12.01" y2="16"/>
                          </svg>
                        </div>
                        <h3 class="fgc-title">组件代码已生成，但未通过质量检查</h3>
                        <p class="fgc-reason" v-if="failureSummary">
                          <span class="fgc-reason-label">失败原因：</span>
                          {{ failureSummary }}
                        </p>

                        <!-- 逐文件问题明细：直接给出错误码 + 行列 + 消息，点击直达 -->
                        <div v-if="qualityIssues.length > 0" class="fgc-issues">
                          <div class="fgc-issues-head">
                            共 {{ qualityBlockCount }} 个阻断问题，分布在 {{ failedFilePaths.length }} 个文件
                            <button class="fgc-issues-locate" @click="locateFirstFailedFile">定位第一个</button>
                          </div>
                          <button
                            v-for="(issue, ii) in qualityIssues.filter(i => i.severity === 'BLOCK').slice(0, 8)"
                            :key="ii"
                            class="fgc-issue-item"
                            @click="locateFailedFile(issue.file)"
                          >
                            <span class="fgc-issue-code">{{ issue.id }}</span>
                            <span class="fgc-issue-pos">{{ issue.file || '—' }}:{{ issue.line }}:{{ issue.column }}</span>
                            <span class="fgc-issue-msg">{{ issue.message }}</span>
                          </button>
                          <div v-if="qualityBlockCount > 8" class="fgc-issues-more">
                            仅显示前 8 条，切到「产物」页查看全部
                          </div>
                        </div>

                        <div class="fgc-actions">
                          <button
                            v-if="!pageTaskFlag && codeSnapshot"
                            class="fgc-btn-secondary fgc-btn-force-preview"
                            :disabled="forcePreviewing"
                            title="把当前产物发布到 workspace 并强制渲染预览 —— 不管质量门禁是否通过都能看到实际效果"
                            @click="forcePreviewSnapshot"
                          >
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                              <circle cx="12" cy="12" r="3"/>
                            </svg>
                            {{ forcePreviewing ? '发布中...' : '强制预览当前产物' }}
                          </button>
                          <GradientButton
                            v-if="canOpenPlayground"
                            class="fgc-btn-primary"
                            :class="{ 'fgc-btn-recommended': failureDiagnosis.recommendation === 'playground' }"
                            :border-width="2"
                            :border-radius="14"
                            :blur="0"
                            :duration="3000"
                            bg-color="var(--btn-playground-bg, #1a1a2e)"
                            @click="openPlayground"
                          >
                            <CodeOutlined style="margin-right: 6px;" />
                            进入 Playground 修复
                            <span class="fgc-rec-badge" v-if="failureDiagnosis.recommendation === 'playground'">推荐</span>
                          </GradientButton>
                          <!-- 🛡️ 2026-09-04：原生 href 下载不带 Token 头 → 生产 401，改 fetch+Blob -->
                          <button
                            v-if="failedDownloadUrl"
                            type="button"
                            class="fgc-btn-secondary"
                            @click="downloadDraft"
                          >
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                              <polyline points="7 10 12 15 17 10"/>
                              <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            下载草稿代码
                          </button>
                          <button
                            v-if="!pageTaskFlag"
                            class="fgc-btn-secondary"
                            :class="{ 'fgc-btn-recommended-secondary': failureDiagnosis.recommendation === 'retry' }"
                            :disabled="retrying"
                            @click="handleRetry(false)"
                          >
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <polyline points="23 4 23 10 17 10"/>
                              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                            </svg>
                            {{ retrying ? '重新生成中...' : '重新生成' }}
                            <span class="fgc-rec-badge fgc-rec-inline" v-if="failureDiagnosis.recommendation === 'retry'">推荐</span>
                          </button>
                          <button
                            v-if="!pageTaskFlag"
                            class="fgc-btn-secondary fgc-btn-resume"
                            :disabled="retrying"
                            title="复用已缓存的 Figma 分析结果，跳过 Figma 拉取与视觉分析，直接重新生成代码"
                            @click="handleRetry(true)"
                          >
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <polygon points="5 3 19 12 5 21 5 3"/>
                            </svg>
                            {{ retrying ? '续跑中...' : '续跑（复用缓存）' }}
                          </button>
                          <button
                            v-if="pageTaskFlag"
                            class="fgc-btn-secondary fgc-btn-recommended-secondary"
                            :disabled="retrying"
                            @click="handlePageRetry"
                          >
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <polyline points="23 4 23 10 17 10"/>
                              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                            </svg>
                            {{ retrying ? '重新生成中...' : '重新生成页面骨架' }}
                          </button>
                          <button
                            v-if="failureDiagnosis.recommendation === 'check_logs'"
                            class="fgc-btn-secondary fgc-btn-recommended-secondary"
                            @click="activeTab = 'logs'; logFilter = 'error'"
                          >
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <circle cx="11" cy="11" r="8"/>
                              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            </svg>
                            查看详细日志
                            <span class="fgc-rec-badge fgc-rec-inline">推荐</span>
                          </button>
                        </div>
                        <div class="fgc-meta-actions">
                          <button class="fgc-meta-btn" @click="copyFailureContext" title="复制错误上下文，可粘贴到 AI 工具或团队沟通">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                            复制错误信息
                          </button>
                        </div>
                        <p class="fgc-hint">
                          {{ failureDiagnosis.recommendation === 'playground'
                            ? '💡 Playground 支持 AI 对话式修复，可自动修复语法错误、缺失引用等常见问题'
                            : failureDiagnosis.recommendation === 'retry'
                            ? '💡 建议重新生成，系统会自动恢复进度；如仍失败，可下载草稿代码手动修改'
                            : '💡 建议查看详细日志定位问题后，下载草稿代码手动修复，或重新生成' }}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
              <!-- /canvas -->

              <!-- ═══ 画布外操作区（等待/排队状态保留在底部）══ -->
              <div class="canvas-actions" v-if="isWaiting">
                <span class="waiting-text">{{ waitingLabel }}</span>
                <RippleButton
                  class="btn-delivery btn-delivery-primary"
                  :disabled="startingContinue"
                  :ripple-color="'rgba(59,130,246,0.5)'"
                  @click="handleContinueGeneration"
                >
                  {{ startingContinue ? '启动中...' : '继续生成' }}
                </RippleButton>
                <button class="btn-cancel-op" @click="handleCancelQueue">取消排队</button>
              </div>

              <!-- 审核状态 -->
              <div class="canvas-actions" v-if="humanReviewed">
                <span class="reviewed-badge">✓ 已人工审核</span>
                <button class="btn-cancel-op" @click="confirmRevokeReview">撤回审核</button>
              </div>

            </template>
            <!-- /canvas + actions -->
          </div>
          <!-- /content-scroll -->
        </main>
      </div>
      <!-- /detail-body -->
    </div>
    <!-- /detail-layout -->

    <!-- ═══ 组件分析抽屉 ═══ -->
    <ComponentAnalysisDrawer
      v-model:visible="analysisDrawerVisible"
      :loading="analysisLoading"
      :error="analysisError"
      :report="analysisReport"
    />

    <!-- ═══ 人工审核对话框 ═══ -->
    <div v-if="reviewModalVisible" class="modal-overlay" @click.self="reviewModalVisible = false">
      <div class="modal-box">
        <h3 class="modal-title">人工审核</h3>
        <div class="modal-task-info">
          <div class="info-row">
            <span class="info-label">任务号：</span>
            {{ sessionId }}
          </div>
          <div class="info-row">
            <span class="info-label">组件：</span>
            {{ task?.componentName || '未命名' }}
          </div>
          <div class="info-row">
            <span class="info-label">类型：</span>
            {{ task?.target === 'vue3' ? 'Vue3 组件' : '微码组件' }}
          </div>
          <div class="info-row">
            <span class="info-label">失败原因：</span>
            {{ task?.error || task?.statusMessage || '-' }}
          </div>
        </div>
        <div class="review-action-group">
          <label class="review-radio">
            <input type="radio" v-model="reviewAction" value="passed" />
            <span class="radio-label">通过</span>
            <span class="radio-desc">标记为成功，可继续绑定接口等操作</span>
          </label>
          <label class="review-radio">
            <input type="radio" v-model="reviewAction" value="warned" />
            <span class="radio-label">警告通过</span>
            <span class="radio-desc">存在问题但可接受，显示警告标记</span>
          </label>
        </div>
        <div class="review-reason-group">
          <label class="reason-label">
            审核原因
            <span class="optional">（选填）</span>
          </label>
          <textarea
            v-model="reviewReason"
            class="reason-textarea"
            rows="3"
            placeholder="记录审核原因，便于后续追溯…"
          ></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn-modal-cancel" @click="reviewModalVisible = false">取消</button>
          <button class="btn-modal-confirm" @click="submitReview" :disabled="reviewSubmitting">
            {{ reviewSubmitting ? '提交中…' : '确认提交' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ═══ 接口对接向导（Drawer） ═══ -->
    <ApiBindingWizard
      v-model:open="bindingWizardOpen"
      :componentId="task?.componentId || task?.sessionId || ''"
      :groupId="bindingGroupId"
      :componentName="task?.componentName || ''"
      @refresh-preview="refreshBindingStatusAfterWizard"
    />

    <!-- ══ 来源图片放大弹窗 ═══ -->
    <div v-if="sourceImagePreviewVisible" class="source-preview-modal" @click.self="sourceImagePreviewVisible = false">
      <div class="source-preview-modal__content">
        <div class="source-preview-modal__header">
          <span class="source-preview-modal__title">{{ taskSourceMode === 'figma' ? 'Figma 源设计' : '截图原图' }}</span>
          <button type="button" class="source-preview-modal__close" @click="sourceImagePreviewVisible = false" title="关闭">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <img
          :src="sourceDesignImageUrl"
          :alt="task.componentName || 'Figma 源设计'"
          class="source-preview-modal__img"
        />
      </div>
    </div>

    <!-- ══ GitLab 推送弹窗 ═══ -->
    <GitLabPushModal
      v-if="task"
      ref="gitLabPushModalRef"
      :component-id="pushComponentId"
      :is-running="task.status === 'running'"
      @success="handleGitLabPushSuccess"
    />

    <!-- ══ 公共组件池推送弹窗 ═══ -->
    <PublishToPoolModal
      v-model:open="publishModalOpen"
      :component="componentRecord"
      :submitting="poolPushing"
      @ok="onPublishOk"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, reactive, shallowRef, triggerRef, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { CodeOutlined } from '@ant-design/icons-vue'
import {
  fetchTaskStatus,
  fetchLatestTaskCodeSnapshot,
  fetchTaskCodeSnapshotFile,
  fetchTaskCodeSnapshotFileBlob,
  editTaskCodeSnapshotFile,
  validateTaskCodeSnapshot,
  publishTaskToWorkspace,
  type QualityIssue,
  deleteTask as apiDeleteTask,
  pauseTask,
  resumeTask,
  cancelTask,
  generateComponent,
  generateVue3Component,
  submitHumanReview,
  revokeHumanReview,
  cancelQueuedTask,
  startQueuedTask,
  createProgressStream,
  type TaskCodeSnapshotManifest,
  type TaskCodeSnapshotFile
} from '@/api/generator/generator'
import {
  getComponentBySessionId,
  getComponentFiles,
  getRouteUrl,
  unpublishComponent
} from '@/api/component'
import { useUserStore } from '@/store'
import PublishToPoolModal from '@/components/PublishToPoolModal.vue'
import { publishToPublicPool } from '@/utils/component-pool'
import { downloadByUrl } from '@/utils/download-file'
import ComponentAnalysisDrawer from '@/components/ComponentAnalysisDrawer.vue'
import McSpecCheckButton from '@/components/McSpecCheckButton.vue'
import { useConfigStore } from '@/stores/config'
import PreviewErrorBanner from '@/components/PreviewErrorBanner.vue'
import TierBadge from '@/components/generate/TierBadge.vue'
import CodeTypeBadge from '@/components/generate/CodeTypeBadge.vue'
import RippleButton from '@/components/inspira-ui/RippleButton.vue'
import GradientButton from '@/components/inspira-ui/GradientButton.vue'
import { API_BINDING_REFRESH_EVENT } from '@/composables/useApiBindingBridge'
import ApiBindingWizard from '@/views/workspace/ApiBindingWizard.vue'
import { usePreviewErrorBridge } from '@/composables/usePreviewErrorBridge'
import { useFeatureFlag } from '@/composables/useFeatureFlag'
import {
  buildTaskPlaygroundLocation,
  canOpenTaskPlayground,
  resolveTaskTarget,
  resolveComponentType,
  isPageTask,
  canOpenPagePlayground,
  buildPagePlaygroundLocation
} from '@/utils/task-actions'
import { buildPreviewUrl as buildResolvedPreviewUrl, resolvePreviewDescriptor } from '@/utils/preview-resolver'
import http from '@/core/http'
import GitLabPushModal from '@/components/GitLabPushModal.vue'

// 代码预览语法高亮（VS Code Dark+ 风格，与 microcode-playground 一致）
import hljs from 'highlight.js/lib/common'
import 'highlight.js/styles/github-dark.css'

const route = useRoute()
const router = useRouter()
const configStore = useConfigStore()
const baseURL = import.meta.env.VITE_LANGGRAPH_API || 'http://localhost:3000/api'

const sessionId = computed(() => route.params.sessionId as string)

// GitLab 推送
const { isEnabled: isFeatureEnabled } = useFeatureFlag()
const gitLabPushModalRef = ref<InstanceType<typeof GitLabPushModal> | null>(null)
const canPushGit = computed(() => isFeatureEnabled('git.push'))
const pushComponentId = computed(() => task.value?.componentId || task.value?.sessionId || '')

function openGitLabPush() {
  gitLabPushModalRef.value?.open()
}

function handleGitLabPushSuccess() {
  message.success('推送成功！')
}

const task = ref<any>(null)
const workspaceDimensions = ref<PreviewDimensions | null>(null)
const previewViewportRef = ref<HTMLElement | null>(null)
const previewViewportWidth = ref(0)
let previewResizeObserver: ResizeObserver | null = null
const loading = ref(false)
const taskLoadError = ref('')
const taskMissingRetries = ref(0)
const activeTab = ref('logs')
const codeSnapshot = ref<TaskCodeSnapshotManifest | null>(null)
const hasUnreadCode = ref(false)  // 代码 tab 红点：有快照且用户未点击过
const lastGoodSnapshot = ref<TaskCodeSnapshotManifest | null>(null)
// 页面骨架产物：扁平文件列表（与 component /files 返回结构一致）
const pageFiles = ref<{ name: string; path: string; type: 'file' | 'folder'; size?: number }[]>([])
const pageStructure = ref<any>(null)
const selectedSnapshotPath = ref('')
const selectedSnapshotContent = ref('')
const selectedSnapshotUrl = ref('')
const selectedSnapshotKind = ref<'text' | 'image' | 'font' | 'binary'>('text')
const snapshotLoading = ref(false)
const snapshotError = ref('')

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'])
const FONT_EXTENSIONS = new Set(['woff', 'woff2', 'ttf', 'otf', 'eot'])
function classifySnapshotFile(path: string): 'text' | 'image' | 'font' | 'binary' {
  const ext = (path.toLowerCase().split('.').pop() || '').trim()
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (FONT_EXTENSIONS.has(ext)) return 'font'
  if (['vue', 'js', 'ts', 'jsx', 'tsx', 'json', 'css', 'less', 'scss', 'html', 'md', 'txt', 'xml', 'svg'].includes(ext)) return 'text'
  return 'binary'
}
function isImageSnapshot(path: string) {
  return classifySnapshotFile(path) === 'image'
}
function isFontSnapshot(path: string) {
  return classifySnapshotFile(path) === 'font'
}

function revokeSnapshotUrl() {
  if (selectedSnapshotUrl.value && selectedSnapshotUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(selectedSnapshotUrl.value)
  }
  selectedSnapshotUrl.value = ''
}
// 文件生命周期追踪：模型正在解析/写入/校验哪些文件（多活动文件支持）
const fileLifecyclePhase = ref('')
const fileLifecycleSummary = ref('')
const fileStates = ref<Record<string, string>>({})
const logFilter = ref('all')
const logBodyRef = ref<HTMLElement | null>(null)
const autoScroll = ref(true)
const logLines = shallowRef<any[]>([])
// 状态接口返回的历史日志可能被 SSE buffer 再次重放；用计数 Map 只消费这批接缝副本，
// 不做任务生命周期永久去重，避免丢失稍后再次出现的有效同名日志。
const historyReplayCounts = new Map<string, number>()
const previewKey = ref(0)
const previewAvailable = ref(false)
type PreviewFrame = { url: string; snapshot: TaskCodeSnapshotManifest | null }
const previewFrames = ref<PreviewFrame[]>([
  { url: '', snapshot: null },
  { url: '', snapshot: null },
])
const activePreviewSlot = ref(-1)
const pendingPreviewSlot = ref(-1)
const activePreviewSnapshot = computed(() =>
  activePreviewSlot.value >= 0 ? previewFrames.value[activePreviewSlot.value]?.snapshot || null : null
)
const pendingPreviewSnapshot = computed(() =>
  pendingPreviewSlot.value >= 0 ? previewFrames.value[pendingPreviewSlot.value]?.snapshot || null : null
)
const pendingPreviewLoading = computed(() => pendingPreviewSlot.value >= 0)
const analysisDrawerVisible = ref(false)
const analysisLoading = ref(false)
const analysisError = ref('')
const analysisReport = ref<any>(null)
const latestBindingId = ref('')
const rollingBack = ref(false)
const bindingWizardOpen = ref(false)
/** 每秒递增，驱动 taskElapsedTime computed 重新计算 */
const elapsedTick = ref(0)
let elapsedTimer: ReturnType<typeof setInterval> | null = null
const bindingGroupId = computed(
  () => (typeof localStorage !== 'undefined' ? localStorage.getItem('currentGroupId') : null) || 'default-group'
)
const retrying = ref(false)
const recovering = ref(false)
const upgrading = ref(false)

// 组件 / 页面 统一的 Playground 可进性
const canOpenPlayground = computed(() => {
  if (!task.value) return false
  return pageTaskFlag.value ? canOpenPagePlayground(task.value) : canOpenTaskPlayground(task.value)
})
const playgroundLocation = computed(() => {
  if (!task.value) return null
  return pageTaskFlag.value ? buildPagePlaygroundLocation(task.value) : buildTaskPlaygroundLocation(task.value)
})
const reviewModalVisible = ref(false)
const reviewAction = ref<'passed' | 'warned'>('passed')
const reviewReason = ref('')
const reviewSubmitting = ref(false)
const humanReviewed = ref(false)
const startingContinue = ref(false)

const retryBusy = computed(() => retrying.value || recovering.value || upgrading.value)

// ── 公共组件池：已完成组件推送到公共池（发布/下架）──
const userStore = useUserStore()
// 已入库的组件记录（componentId 对应任务 sessionId；入库后才有 _id/visibility）
const componentRecord = ref<any>(null)
const componentRecordLoaded = ref(false)
const poolPushing = ref(false)
const publishModalOpen = ref(false)

/** 任务完成后加载组件记录（含 visibility），用于推送按钮状态 */
async function ensureComponentRecord(force = false) {
  if (componentRecordLoaded.value && !force) return
  if (!sessionId.value || task.value?.status !== 'completed') return
  try {
    const record = await getComponentBySessionId(sessionId.value)
    componentRecord.value = record || null
  } catch {
    componentRecord.value = null // 未入库（如页面任务/草稿），按钮不显示
  } finally {
    componentRecordLoaded.value = true
  }
}

/** 是否自己的组件（creatorId 可能是 populate 对象或裸 id） */
const isOwnComponent = computed(() => {
  const myId = (userStore.userInfo as any)?.id || (userStore.userInfo as any)?._id
  const creatorRaw = componentRecord.value?.creatorId as any
  const creatorId = creatorRaw?._id || creatorRaw
  return Boolean(myId && creatorId && String(creatorId) === String(myId))
})

const isPublicComponent = computed(() => componentRecord.value?.visibility === 'public')

/** 推送到公共组件池：未入池 → 弹窗确认（名称可改、类型带入）；已入池 → 下架确认 */
async function pushToPublicPool() {
  const record = componentRecord.value
  if (!record || poolPushing.value) return
  if (record.visibility !== 'public') {
    publishModalOpen.value = true
    return
  }
  const label = record.name || sessionId.value
  if (!confirm(`确定将组件"${label}"从公共组件池下架吗？下架后仅自己可见。`)) return
  poolPushing.value = true
  try {
    await unpublishComponent(record._id)
    message.success('已从公共组件池下架')
    await ensureComponentRecord(true)
  } catch (err: any) {
    message.error(err.response?.data?.message || '操作失败')
  } finally {
    poolPushing.value = false
  }
}

/** 弹窗确认发布：名称有变更先增量更新，再发布 */
async function onPublishOk(payload: { name: string }) {
  const record = componentRecord.value
  if (!record || poolPushing.value) return
  poolPushing.value = true
  try {
    await publishToPublicPool(record, payload)
    publishModalOpen.value = false
    message.success('已发布到公共组件池')
    await ensureComponentRecord(true)
  } catch (err: any) {
    message.error(err.response?.data?.message || '操作失败')
  } finally {
    poolPushing.value = false
  }
}

// 任务完成且已入库后自动拉取组件记录；手动刷新/完成后重拉一次
watch(
  () => task.value?.status,
  (status) => {
    if (status === 'completed') {
      componentRecordLoaded.value = false
      ensureComponentRecord()
    }
  },
  { immediate: true },
)

// 从原文件保留的完整业务逻辑
const taskSourceMode = computed(() => {
  const src = getTaskSource(task.value)
  if (src === 'html') return 'html'
  if (src === 'figma') return 'figma'
  return 'screenshot'
})

const taskTarget = computed(() => resolveTaskTarget(task.value) || 'microcode')
const taskTier = computed(() => getTaskTier(task.value))

// 页面骨架任务识别（taskType 可能是 'page' / 'page-skeleton'，或 sessionId 以 page- 开头）
const pageTaskFlag = computed(() => isPageTask(task.value))
const pageTaskId = computed(() => (pageTaskFlag.value ? String(task.value?.sessionId || '') : ''))
const pageGroupId = computed(() => (pageTaskFlag.value ? String(task.value?.groupId || 'default-group') : ''))

// ── 身份识别 computed ──
const figmaUrl = computed(() => {
  const t = task.value
  if (!t?.fileKey) return ''
  const nodeId = t.nodeId ? `?node-id=${encodeURIComponent(t.nodeId)}` : ''
  return `https://www.figma.com/file/${t.fileKey}${nodeId}`
})

const figmaUrlShort = computed(() => {
  if (!figmaUrl.value) return ''
  // 截短展示：Figma URL 通常很长
  return figmaUrl.value.length > 48
    ? figmaUrl.value.slice(0, 48) + '…'
    : figmaUrl.value
})

const sourceDesignImageUrl = computed(() => {
  const t = task.value
  if (!t) return ''
  // 页面骨架的源图是 screenshot.png
  if (pageTaskFlag.value) {
    return `/api/page-skeleton/${pageGroupId.value}/${pageTaskId.value}/file?path=screenshot.png&raw=1`
  }
  const cid = t.componentId || t.sessionId
  return `/api/component/${cid}/file?path=resources/images/mc-preview.png&raw=1`
})

// 缩略图加载状态（失败任务 mc-preview.png 不存在时需显示占位符）
const sourceImageLoaded = ref(false)
const sourceImageFailed = ref(false)
const sourceImagePreviewVisible = ref(false)
watch(sourceDesignImageUrl, () => {
  sourceImageLoaded.value = false
  sourceImageFailed.value = false
})
const onSourceImageLoad = () => {
  sourceImageLoaded.value = true
  sourceImageFailed.value = false
}
const onSourceImageError = () => {
  sourceImageLoaded.value = false
  sourceImageFailed.value = true
}

// 🆕 重试 / 生成场景：设计稿缩略图状态感知 + 防卡死
// - 生成中（running/queued/retry_scheduled/pending）显示「生成中…」而非「未生成」，
//   避免把「进行中」误读成「失败」（之前 figma 重试一进就显示「设计稿未生成」的根因）。
// - 任务成功落盘 mc-preview.png / screenshot.png 后，bump key 强制重新加载缩略图，
//   解决「生成已成功、区域却卡在『未生成』」的二次 bug（原仅依赖 URL 变化才重置）。
const sourceImageReloadKey = ref(0)
// 🆕 周期性重试：任务运行期间 mc-preview.png 可能尚未写入（Figma 步骤 2 才落盘），
//   img @error 一次就设 sourceImageFailed=true 并销毁 img 元素 → 永远不再重试。
//   修复：每 4s 在运行态下重置 failed 状态 + bump key，让 Vue 重建 <img> 重新请求。
let _sourceImageRetryTimer: ReturnType<typeof setInterval> | null = null
function startSourceImageRetryPolling() {
  stopSourceImageRetryPolling()
  _sourceImageRetryTimer = setInterval(() => {
    const st = task.value?.status
    const isGenerating = st === 'running' || st === 'queued' || st === 'retry_scheduled' || st === 'pending'
    if (!isGenerating || sourceImageLoaded.value) {
      stopSourceImageRetryPolling()
      return
    }
    if (sourceImageFailed.value) {
      sourceImageFailed.value = false
      sourceImageReloadKey.value++
    }
  }, 4000)
}
function stopSourceImageRetryPolling() {
  if (_sourceImageRetryTimer) {
    clearInterval(_sourceImageRetryTimer)
    _sourceImageRetryTimer = null
  }
}
// 启动轮询（watch task 状态变化）
watch(
  () => task.value?.status,
  (st) => {
    const isGenerating = st === 'running' || st === 'queued' || st === 'retry_scheduled' || st === 'pending'
    if (isGenerating && !sourceImageLoaded.value) {
      startSourceImageRetryPolling()
    } else {
      stopSourceImageRetryPolling()
    }
  },
  { immediate: true },
)
// 组件卸载时清理
onUnmounted(() => {
  stopSourceImageRetryPolling()
})
const sourceBlockLabel = computed(() =>
  taskSourceMode.value === 'screenshot' ? '截图原图' : 'Figma 源设计'
)
const sourceDesignPlaceholder = computed(() => {
  const st = task.value?.status
  const generating =
    st === 'running' || st === 'queued' || st === 'retry_scheduled' || st === 'pending'
  if (taskSourceMode.value === 'screenshot') {
    return generating ? '截图生成中…' : '截图未加载'
  }
  return generating ? '设计稿生成中…' : '设计稿未生成'
})

watch(
  () => task.value?.status,
  (newStatus, oldStatus) => {
    if (
      (newStatus === 'success' || newStatus === 'completed') &&
      oldStatus &&
      oldStatus !== newStatus
    ) {
      // mc-preview.png / screenshot.png 已落盘：给一点 IO 余量后强制重载缩略图
      sourceImageFailed.value = false
      setTimeout(() => {
        sourceImageReloadKey.value++
      }, 400)
    }
  }
)

const batchContext = computed<{ index: number; total: number } | null>(() => {
  const t = task.value
  if (!t) return null
  const childIds: string[] | undefined = t.childIds
  if (!childIds || childIds.length <= 1) return null
  const currentIndex = childIds.indexOf(t.sessionId)
  if (currentIndex < 0) return null
  return { index: currentIndex + 1, total: childIds.length }
})



// ── 来源操作：复制 / 跳转 ──
async function copySourceUrl() {
  if (!figmaUrl.value) return
  try {
    await navigator.clipboard.writeText(figmaUrl.value)
    message.success('Figma URL 已复制')
  } catch {
    // fallback
    const ta = document.createElement('textarea')
    ta.value = figmaUrl.value
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    message.success('Figma URL 已复制')
  }
}

async function copyImageUrl() {
  const url = sourceDesignImageUrl.value
  if (!url) return
  try {
    await navigator.clipboard.writeText(url)
    message.success('图片地址已复制')
  } catch {
    const ta = document.createElement('textarea')
    ta.value = url
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    message.success('图片地址已复制')
  }
}

// ── 任务编码复制 ──
const copiedTaskId = ref(false)
let copiedTaskIdTimer: ReturnType<typeof setTimeout> | null = null
async function copyTaskId() {
  const text = sessionId.value
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  message.success('任务编码已复制')
  copiedTaskId.value = true
  if (copiedTaskIdTimer) clearTimeout(copiedTaskIdTimer)
  copiedTaskIdTimer = setTimeout(() => {
    copiedTaskId.value = false
  }, 2000)
}

// 子阶段 → 粗粒度状态名（方案A：running 状态按当前阶段细化，消除"生成中"与"代码已生成"同屏歧义）
const STAGE_PHASE_LABEL: Record<string, string> = {
  // ── 数据采集 ──
  '初始化': '数据采集中', 'figma': '数据采集中', 'Figma数据获取': '数据采集中', 'Figma 截图获取': '数据采集中',
  '数据获取': '数据采集中', 'figma-connector': '数据采集中', 'doc-analyzer': '数据采集中', 'precheck': '数据采集中',
  'upgrade-fetch': '数据采集中', 'upgrade-download': '数据采集中',
  // ── 分析 ──
  '视觉分析': '分析中', '并行分析': '分析中', '布局审查': '分析中', '样式映射': '分析中',
  'visual-parser': '分析中', 'layout-reviewer': '分析中', 'style-mapper': '分析中',
  'vision-agent': '分析中', 'vision-agent.analyzeImage': '分析中', 'analyzing': '分析中', '自优化': '分析中',
  'upgrade-analysis': '分析中',
  // ── 代码生成 ──
  '子组件规划': '代码生成中', '代码生成': '代码生成中', 'microcode-engineer': '代码生成中',
  'code-engineer': '代码生成中', 'generating': '代码生成中', 'config-generator': '代码生成中',
  'upgrade-code': '代码生成中', 'resuming': '代码生成中',
  // ── 质量校验/精修 ──
  '质量检查': '质量校验中', '运行时质量门禁': '质量校验中', '视觉质量门禁': '质量校验中',
  '布局精修': '质量校验中', '样式精修': '质量校验中', '布局样式精修': '质量校验中', '串行精修': '质量校验中',
  '合并精修': '质量校验中', '对抗精修': '质量校验中', 'adversarial-checker': '质量校验中',
  '迭代修订': '质量校验中', '样式检查': '质量校验中', '代码清理': '质量校验中', '合规确认': '质量校验中',
  'upgrade-sync': '质量校验中',
}

const statusLabel = computed(() => {
  const map: Record<string, string> = {
    running: '生成中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
    paused: '已暂停',
    queued: '排队中',
    rate_limited: '配额不足',
    retry_scheduled: '等待重试'
  }
  // 方案A：running 时从 SSE 阶段流推断当前子阶段（倒序找最近活跃阶段；未建连/无阶段回退默认）
  if (task.value?.status === 'running') {
    const keys = Object.keys(sseStages.value)
    for (let i = keys.length - 1; i >= 0; i--) {
      const st = sseStages.value[keys[i]]
      if (st && st.status && st.status !== 'pending') {
        return STAGE_PHASE_LABEL[keys[i]] || '生成中'
      }
    }
    return '生成中'
  }
  return map[task.value?.status] || task.value?.status || '未知'
})

const statusBadgeClass = computed(() => {
  const s = task.value?.status
  if (s === 'running') return 'running'
  if (s === 'completed') return 'success'
  if (s === 'failed') return 'failed'
  if (s === 'cancelled') return 'cancelled'
  return 'pending'
})

const qualityGateLabel = computed(() => {
  const map: Record<string, string> = { passed: '通过', warned: '警告', failed: '阻断' }
  return map[task.value?.qualityGate] || task.value?.qualityGate || ''
})

const modelsUsed = computed(() => {
  // 优先展示任务实际调用到的模型（completionModels），而非配置快照中的全部模型
  const cm = task.value?.completionModels
  if (cm) {
    const used = new Set<string>()
    // 后端可能把同槽多个模型用逗号拼接（如 text 槽多个 provider 被加权分散命中）
    const split = (s: any) =>
      String(s || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    split(cm.visionModel).forEach((m) => used.add(m))
    split(cm.textModel).forEach((m) => used.add(m))
    if (used.size > 0) return Array.from(used)
  }
  // 兜底：从配置快照取（旧任务无 completionModels 时）
  // 注意：只取实际会走请求的字段，不取 providers 备用池（池里的是降级候选，不是实际使用的）
  const snapshot = task.value?.configSnapshot
  if (!snapshot) return []
  const models = new Set<string>()
  // unified 模式下 unifiedModel 是唯一真相源；separate 模式下 vision/text 各自独立
  if (snapshot.unifiedModel && snapshot.modelMode === 'unified') {
    models.add(snapshot.unifiedModel)
  } else {
    if (snapshot.visionModel) models.add(snapshot.visionModel)
    if (snapshot.textModel) models.add(snapshot.textModel)
  }
  return Array.from(models)
})

const isVue3Target = computed(() => resolveTaskTarget(task.value) === 'vue3')

type PreviewDimensions = { width: number; height: number }

function normalizePreviewDimensions(value: any): PreviewDimensions | null {
  if (!value) return null
  const bbox = value.document?.absoluteBoundingBox || value.absoluteBoundingBox || value
  const width = Number(bbox.width ?? bbox.originalWidth)
  const height = Number(bbox.height ?? bbox.originalHeight)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return { width: Math.round(width), height: Math.round(height) }
}

async function loadWorkspaceDimensions(currentTask: any) {
  workspaceDimensions.value = null
  if (!currentTask || getTaskSource(currentTask) !== 'figma') return
  // _figma-size.json 只在任务完成并 copyToWorkspace 后才写入 workspace；
  // running/failed/paused 任务的产物仍在 temp-components，workspace 中不存在该文件，
  // 此时跳过拉取，避免每次打开详情页都产生一次无谓的 404（尺寸回退到 task 元数据）。
  if (currentTask.status !== 'completed') return
  const componentId = currentTask.componentId || currentTask.sessionId
  const groupId = currentTask.groupId || 'default-group'
  const type = resolveTaskTarget(currentTask) === 'vue3' ? 'vue3-components' : 'custom-components'
  const relativePath = type === 'vue3-components'
    ? `${type}/${groupId}/${componentId}/_figma-size.json`
    : `${type}/${componentId}/_figma-size.json`
  try {
    const url = import.meta.env.DEV
      ? `/__raw/workspace/${relativePath}`
      : `/api/preview/${type === 'vue3-components' ? `${groupId}/` : ''}${componentId}/_figma-size.json`
    const response = await fetch(url)
    if (!response.ok) return
    workspaceDimensions.value = normalizePreviewDimensions(await response.json())
  } catch {
    workspaceDimensions.value = null
  }
}

// Figma / 截图任务的原始宽高可能来自任务显式字段，也可能只保存在 precheck 历史进度中。
// 必须从这些权威来源恢复，不能因 _figma-size.json 缺失退化成 1:1 正方形。
const figmaDimensions = computed<PreviewDimensions | null>(() => {
  const currentTask = task.value
  if (!currentTask) return null

  const explicitCandidates = [
    workspaceDimensions.value,
    currentTask.figmaDimensions,
    currentTask.figmaSize,
    currentTask.result?.figmaDimensions,
    currentTask.result?.figmaSize,
    currentTask.result?.document?.absoluteBoundingBox,
  ]
  for (const candidate of explicitCandidates) {
    const dimensions = normalizePreviewDimensions(candidate)
    if (dimensions) return dimensions
  }

  const progress = Array.isArray(currentTask.progress) ? [...currentTask.progress].reverse() : []
  for (const item of progress) {
    const dimensions = normalizePreviewDimensions(item)
    if (dimensions) return dimensions
  }
  return null
})

const previewScale = computed(() => {
  const dimensions = figmaDimensions.value
  if (!dimensions || previewViewportWidth.value <= 0) return 1
  return Math.min(1, previewViewportWidth.value / dimensions.width)
})

const previewStageStyle = computed(() => {
  const dimensions = figmaDimensions.value
  if (!dimensions) return { width: '100%', height: '500px' }
  return {
    width: `${Math.round(dimensions.width * previewScale.value)}px`,
    height: `${Math.round(dimensions.height * previewScale.value)}px`
  }
})

const previewIframeStyle = computed(() => {
  const dimensions = figmaDimensions.value
  if (!dimensions) return { width: '100%', height: '500px', display: 'block' }
  return {
    width: `${dimensions.width}px`,
    height: `${dimensions.height}px`,
    display: 'block',
    transform: `scale(${previewScale.value})`,
    transformOrigin: 'top left'
  }
})

const downloadUrl = computed(() => {
  if (!task.value) return '#'
  if (pageTaskFlag.value) {
    return `/api/page-skeleton/${pageGroupId.value}/${pageTaskId.value}/download`
  }
  // 🛡️ 2026-09-03：原 /api/generator/download/:sessionId 后端无此路由（404 实锤）。
  // 改走 /api/component/download/:componentId（phase2Service.packageComponent 跨
  // backend→frontend→temp workspace 解析，打包 workspace 当前真值）——
  // 绑定后下载含 api/*.mjs 注入产物，撤回后自动回到绑定前代码。
  return `/api/component/download/${task.value.componentId || task.value.sessionId}`
})

// 🛡️ 2026-09-04：原生 <a :href download> 下载不带 Token 请求头 → 生产 Java
// SessionGuardInterceptor fail-closed 401 → Chrome「无法从网站上提取文件」。
// 统一改 fetch(带 Token) → Blob → a[download]（utils/download-file.js）。
function downloadArtifact() {
  if (!task.value) return
  const url = task.value.status === 'completed' ? downloadUrl.value : failedDownloadUrl.value
  if (!url || url === '#') return
  const name = pageTaskFlag.value
    ? `${pageTaskId.value}.zip`
    : `${task.value.componentId || task.value.sessionId}.zip`
  void downloadByUrl(url, name)
}

function downloadDraft() {
  if (!failedDownloadUrl.value || failedDownloadUrl.value === '#') return
  const name = `${task.value?.sessionId || 'task'}-draft.zip`
  void downloadByUrl(failedDownloadUrl.value, name)
}

// 失败/取消任务：从 temp 中间产物打包下载（后端 /api/tasks/:id/code-download 已支持 failed/cancelled）
const failedDownloadUrl = computed(() => {
  if (!task.value) return '#'
  if (pageTaskFlag.value) {
    return `/api/page-skeleton/${pageGroupId.value}/${pageTaskId.value}/download`
  }
  return `/api/tasks/${task.value.sessionId}/code-download`
})

function buildPreviewUrl(snapshot: TaskCodeSnapshotManifest | null = null) {
  if (!task.value) return ''
  const descriptor = resolvePreviewDescriptor(
    {
      sessionId: String(task.value.sessionId || sessionId.value),
      componentId: String(pageTaskFlag.value ? pageTaskId.value : (task.value.componentId || task.value.sessionId || sessionId.value)),
      groupId: pageTaskFlag.value ? pageGroupId.value : task.value.groupId,
      target: pageTaskFlag.value ? 'page' : task.value.target,
      taskType: pageTaskFlag.value ? 'page' : task.value.taskType,
      artifactReady: task.value.artifactReady,
    },
    {
      candidate: snapshot?.status === 'candidate' || snapshot?.status === 'validating' ? snapshot : null,
      partial: snapshot?.status === 'partial' ? snapshot : null,
      lastGood: snapshot?.status === 'last-good' ? snapshot : null,
    },
  )
  if (!descriptor) return ''
  return buildResolvedPreviewUrl(descriptor, {
    width: figmaDimensions.value?.width,
    height: figmaDimensions.value?.height,
    // 同一 revision 再次刷新时 URL 完全一致，浏览器/预览页会命中缓存而不重新加载；
    // 用递增 cacheKey 保证「刷新预览」是真的重载。
    cacheKey: previewReloadKey.value,
  })
}

/** 预览来源与质量风险：让「不合格也能看效果」不变成「误以为已通过」。 */
const previewSourceLabel = computed(() => {
  const snapshot = activePreviewSnapshot.value || pendingPreviewSnapshot.value || codeSnapshot.value
  if (!snapshot) return ''
  const nameMap: Record<string, string> = {
    candidate: '候选版本',
    validating: '校验中版本',
    partial: '半成品版本',
    'last-good': '稳定版本（已过门禁）',
    rejected: '已拒绝版本',
  }
  const suffix = snapshot.revision ? `r${snapshot.revision.slice(-6)}` : ''
  const base = `${nameMap[String(snapshot.status)] || snapshot.status || '未知版本'}${suffix ? ` · ${suffix}` : ''}`
  if (qualityBlockCount.value > 0) return `${base} · ${qualityBlockCount.value} 个阻断问题（预览仅供参考）`
  return `${base} · 无阻断问题`
})

const previewUrl = computed(() => {
  if (activePreviewSlot.value >= 0) return previewFrames.value[activePreviewSlot.value]?.url || ''
  // 🛡️ fallback 不再传 null —— 优先用当前 codeSnapshot（含候选/半成品/稳定），
  // 让 URL 带 sessionId + revision 走「快照源分支」，未发布组件也能预览。
  // codeSnapshot 为 null（无任何快照）才退化为 workspace 路径，
  // 失败任务也走 loadCodeSnapshot(:3663) 加载 candidate，理论上必有快照。
  return buildPreviewUrl(codeSnapshot.value || activePreviewSnapshot.value || null)
})

const shouldShowPreview = computed(() => {
  // 生成中允许挂载受控 revision 的隐藏候选帧；正式 workspace 仍由 artifactReady 放行。
  // 页面骨架任务的后端 artifactReady 未单独识别，.completed 状态且磁盘有产物时直接放行。
  if (pageTaskFlag.value && task.value?.status === 'completed') return true
  return !!activePreviewSnapshot.value || !!pendingPreviewSnapshot.value || task.value?.artifactReady === true
})

function openFullscreenPreview() {
  const url = previewUrl.value
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

const previewHintText = computed(() => {
  if (!task.value) return ''
  if (pageTaskFlag.value) {
    if (task.value.status === 'completed') return `页面预览：已生成 ${task.value.componentName || '页面'} 实际渲染效果`
    return '页面预览将在生成完成后显示'
  }
  if (pendingPreviewLoading.value) return '候选预览正在安全换帧，当前稳定画面继续保留'
  if (activePreviewSnapshot.value?.status === 'last-good') return '稳定预览：已通过质量门禁的 last-good 版本'
  if (activePreviewSnapshot.value) return '候选预览：隔离 revision 正在验证，不影响正式版本'
  if (task.value.status === 'running') return '等待生成首个可编译候选 revision'
  if (task.value.status === 'completed' && task.value.artifactReady === true)
    return `组件预览：已生成 ${task.value.componentName || '组件'} 实际渲染效果`
  if (task.value.status === 'failed') {
    if (activePreviewSnapshot.value || pendingPreviewSnapshot.value) {
      return qualityBlockCount.value > 0
        ? `降级预览：任务失败但产物仍可渲染（${qualityBlockCount.value} 个阻断问题，效果仅供参考）`
        : `降级预览：${task.value.componentName || '组件'}（任务失败但产物可用）`
    }
    if (codeSnapshot.value) return '预览尚未加载：可点击「强制预览当前产物」直接用现有代码渲染'
    return '预览不可用：任务失败，未能生成有效组件'
  }
  return '预览将在任务完成后显示'
})

// ── 预览面板类型（仅微码组件）────────────────────────────────
// 原先这个下拉是预览页 iframe 内部的浮层，会压在组件内容上。
// 现在移到预览提示行右侧，选中值通过 postMessage 下发到 iframe 内实时生效。
const previewPanelType = ref('')
const showPanelTypeSwitch = computed(
  () => !pageTaskFlag.value && !isVue3Target.value && shouldShowPreview.value
)

function pushPanelTypeToFrames() {
  if (!showPanelTypeSwitch.value) return
  const host = previewViewportRef.value
  if (!host) return
  host.querySelectorAll('iframe.preview-iframe').forEach((el) => {
    const frame = el as HTMLIFrameElement
    try {
      frame.contentWindow?.postMessage(
        { type: 'set-panel-type', panelType: previewPanelType.value },
        window.location.origin
      )
    } catch {
      /* iframe 已卸载或不可访问：忽略 */
    }
  })
}

watch(previewPanelType, pushPanelTypeToFrames)

const taskElapsedTime = computed(() => {
  // 引用 elapsedTick 使 computed 每秒重新计算
  void elapsedTick.value
  // 后端任务实体使用 startTime/endTime（数字时间戳），无 createdAt/completedAt
  const t = task.value
  if (!t?.startTime) return '-'
  const start = t.startTime
  const end = t.endTime || Date.now()
  const diff = Math.floor((end - start) / 1000)
  const mins = Math.floor(diff / 60)
  const secs = diff % 60
  return mins > 0 ? `${mins}m${secs}s` : `${secs}s`
})

const sseStages = ref<Record<string, { status: string; progress?: number }>>({})

const taskProgressPercent = computed(() => {
  if (!task.value) return 0
  if (task.value.status === 'completed') return 100
  if (task.value.status === 'failed' || task.value.status === 'cancelled') return 100

  const stages = sseStages.value
  const stageList = Object.keys(stages)
  if (stageList.length === 0) return 0

  let total = 0
  for (const key of stageList) {
    const stage = stages[key]
    if (stage.status === 'completed' || stage.status === 'warning') {
      // 阶段已执行完毕：completed 或「完成但有告警」（视觉比对未达标、质量门禁有告警但仍推进）
      // warning 之前被当作 0 贡献，导致进度长期低估、卡在 ~50%
      total += 100
    } else if (stage.status === 'running') {
      // 进行中的阶段：后端基本不下发数值 progress，默认按半程兜底，避免长任务阶段长期 0 贡献
      total += typeof stage.progress === 'number' ? stage.progress : 50
    }
    // failed / pending / BLOCK / error 等贡献 0
  }
  return Math.min(99, Math.round(total / stageList.length))
})

const totalStageCount = computed(() => Object.keys(sseStages.value).length)
const completedStageCount = computed(() => {
  return Object.values(sseStages.value).filter((s) => s.status === 'completed').length
})

// 阶段 key → 中文可读名（覆盖 Phase2 中文 stage / 英文 node key / Lite / 升级 三条管线）
// 来源：backend-node/src/workflow/workflow.constants.ts(HANDLER_REGISTRY) + ai-engine/graphs/mc-component-graph-vue3.js(stage:)
const STAGE_LABELS: Record<string, string> = {
  // ── Phase2 中文 stage key（后端 graph 直发）──
  '自优化': '自优化',
  '初始化': '初始化',
  'figma': 'Figma 数据获取',
  'Figma数据获取': 'Figma 数据获取',
  'Figma 截图获取': 'Figma 截图获取',
  '视觉分析': '视觉分析',
  '数据获取': '数据获取',
  '并行分析': '并行分析',
  '布局审查': '布局审查',
  '样式映射': '样式映射',
  '代码生成': '代码生成',
  '布局精修': '布局精修',
  '样式精修': '样式精修',
  '质量检查': '质量检查',
  '运行时质量门禁': '运行时质量门禁',
  '视觉质量门禁': '视觉质量门禁',
  '迭代修订': '迭代修订',
  '代码清理': '代码清理',
  '样式检查': '样式检查',
  '合规确认': '合规确认',
  '完成': '完成',
  '子组件规划': '子组件规划',
  '串行精修': '串行精修',
  '合并精修': '合并精修',
  '预算警告': '预算警告',
  '预算超限': '预算超限',
  '审行精修': '对抗精修',
  '合并精粹': '合并精修',
  // ── 英文 node key（新管线按节点名上报）──
  'figma-connector': 'Figma 数据获取',
  'visual-parser': '视觉分析',
  'layout-reviewer': '布局审查',
  'style-mapper': '样式映射',
  'microcode-engineer': '微码生成',
  'code-engineer': '代码生成',
  'layout-style-refiner': '布局样式精修',
  'layout-refiner': '布局精修',
  'style-refiner': '样式精修',
  'adversarial-checker': '对抗检查',
  'doc-analyzer': '文档分析',
  'config-generator': '配置生成',
  'vision-agent': '图像分析',
  'vision-agent.analyzeImage': '图像分析',
  // ── Lite 单组件流程 ──
  'precheck': '前置检查',
  'analyzing': '需求分析',
  'analysis_done': '分析完成',
  'generating': '代码生成',
  'codegen_done': '代码完成',
  // ── 批量/升级 ──
  'upgrade-fetch': '获取资源',
  'upgrade-download': '下载文件',
  'upgrade-analysis': '升级分析',
  'upgrade-code': '升级代码',
  'upgrade-sync': '同步状态',
  'upgrade-complete': '升级完成',
  'upgrade-error': '升级失败',
  'resuming': '恢复任务'
}

// 解析阶段显示名：先查表，再回退到 nameMap，最后对未知 key 做可读化（拆分分隔符/首字母大写）
function resolveStageLabel(key: string, nameMap: Record<string, string>): string {
  if (STAGE_LABELS[key]) return STAGE_LABELS[key]
  if (nameMap[key]) return nameMap[key]
  if (key.includes('.')) {
    const head = key.split('.')[0]
    if (STAGE_LABELS[head]) return STAGE_LABELS[head]
    return '智能分析'
  }
  const cleaned = key
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

const timelineSteps = computed(() => {
  if (!task.value) return []

  // 优先用 sseStages（SSE 实时 + loadTask 历史恢复都写入这里）
  let stages = sseStages.value
  const stageList = Object.keys(stages)

  // 兜底：如果 sseStages 为空但 task 有历史 progress 数据，直接从 progress 构建
  if (stageList.length === 0 && Array.isArray(task.value.progress)) {
    const fallback: Record<string, { status: string; progress?: number }> = {}
    for (const item of task.value.progress) {
      if (item?.stage) {
        fallback[item.stage] = { status: item.status, progress: item.progress }
      }
    }
    stages = fallback
  }

  const finalStageList = Object.keys(stages)
  if (finalStageList.length === 0) {
    return [
      {
        name: '初始化',
        desc: '准备任务环境',
        state: 'pending',
        timeLabel: '-',
        subSteps: []
      }
    ]
  }

  const failedIdx = finalStageList.findIndex((k) => stages[k].status === 'failed')
  // 首个 running 阶段索引：仅它作为「主当前步」(active)，其余并行 running 降级为 parallel
  const firstRunningIdx = finalStageList.findIndex((k) => stages[k].status === 'running')

  return finalStageList.map((key, idx) => {
    const stage = stages[key]
    let state =
      stage.status === 'completed' || stage.status === 'warning'
        ? 'completed' // warning = 阶段已执行完毕但有告警，仍按「已完成」展示，避免误显示为「等待中」
        : stage.status === 'running'
          // 🔧 任务已结束时（failed/cancelled/completed），running 阶段不可能真的在跑
          // 后端某些 catch 块漏发 failed 状态（只发了 error 事件），前端这里兜底修正
          // 🔧 2026-09-11 修复：任务 completed 时，running 阶段应映射为 completed，确保进度条到 100%
          ? (task.value.status === 'failed' || task.value.status === 'cancelled'
              ? 'failed'
              : task.value.status === 'completed'
                ? 'completed'
                : 'active')
          : stage.status === 'failed'
            ? 'failed'
            : 'pending'
    // 失败步骤之后的 pending 步骤标记为「已跳过」
    if (failedIdx >= 0 && idx > failedIdx && state === 'pending') state = 'skipped'
    // 并行执行的多阶段：仅首个 running 为 active，其余降级 parallel（空心蓝环，避免一串相同蓝圈）
    if (state === 'active' && firstRunningIdx >= 0 && idx !== firstRunningIdx) {
      state = 'parallel'
    }

    // 后端实际 stage key 映射（覆盖 lite / phase2 / vue3 三条管线）
    const nameMap: Record<string, string> = {
      // Phase2 / Vue3 管线（中文 key，后端直接发送）
      '初始化': '初始化',
      // 页面骨架生成管线（page-skeleton.service.ts generateFromImage 发送）
      input: '输入准备',
      sanitize: '图像消毒',
      analyze: '视觉布局分析',
      render: '骨架渲染',
      done: '生成完成',
      '自优化': '自优化',
      'Figma数据获取': 'Figma 数据获取',
      'Figma 截图获取': 'Figma 截图获取',
      'Figma 数据获取': 'Figma 数据获取',
      '文档分析': '文档分析',
      '视觉分析': '视觉分析',
      '代码生成': '代码生成',
      '截图校验': '截图校验',
      // 单组件生成流程（英文 key，lite.service.ts）
      precheck: '前置检查',
      analyzing: '需求分析',
      analysis_done: '分析完成',
      generating: '代码生成',
      codegen_done: '代码完成',
      // 批量/升级流程
      'upgrade-fetch': '获取资源',
      'upgrade-download': '下载文件',
      'upgrade-analysis': '升级分析',
      'upgrade-code': '升级代码',
      'upgrade-sync': '同步状态',
      'upgrade-complete': '升级完成',
      'upgrade-error': '升级失败',
      resuming: '恢复任务'
    }

    const descMap: Record<string, string> = {
      precheck: '检查任务配置和输入文件',
      input: '准备截图或 Figma 渲染图',
      sanitize: '统一重编码图像并解析尺寸',
      analyze: '调用视觉模型识别区域与组件',
      render: '生成 index.vue 与面板组件',
      done: '页面骨架生成完成',
      analyzing: '解析设计稿，提取组件结构',
      analysis_done: '需求分析完成',
      generating: '生成 Vue 组件代码',
      codegen_done: '代码生成完成',
      'upgrade-fetch': '获取升级所需的资源文件',
      'upgrade-download': '下载依赖文件',
      'upgrade-analysis': '分析代码结构和依赖关系',
      'upgrade-code': '执行代码升级和重构',
      'upgrade-sync': '同步状态到数据库',
      'upgrade-complete': '升级流程完成',
      'upgrade-error': '升级过程中出现错误',
      resuming: '恢复暂停的任务'
    }

    return {
      name: resolveStageLabel(key, nameMap),
      desc: descMap[key] || '',
      state,
      timeLabel:
        state === 'completed'
          ? '完成'
          : state === 'active'
            ? '进行中'
            : state === 'parallel'
              ? '并行'
              : state === 'failed'
                ? '失败'
                : state === 'skipped'
                  ? '已跳过'
                  : '等待中',
      subSteps:
        stage.status === 'running'
          ? [{ name: '正在处理...', detail: '请稍候', state: 'running', timeLabel: '进行中' }]
          : []
    }
  })
})

// 步骤数据变化后，重新测量轨道实际宽度（覆盖从首节点到末节点中心）
const completedSteps = computed(() => {
  return timelineSteps.value.filter((s) => s.state === 'completed').length
})

const activeStepName = computed(
  () => timelineSteps.value.find((s) => s.state === 'active')?.name || ''
)
const failedStepName = computed(
  () => timelineSteps.value.find((s) => s.state === 'failed')?.name || ''
)
// 进度位置：已完成数 + （进行中/并行/失败占位 1）
const currentStepOrdinal = computed(() => {
  const steps = timelineSteps.value
  const done = steps.filter((s) => s.state === 'completed').length
  const ongoing = steps.some((s) => s.state === 'active' || s.state === 'parallel' || s.state === 'failed') ? 1 : 0
  return done + ongoing
})

function stepStateLabel(state: string) {
  const map: Record<string, string> = {
    completed: '已完成',
    active: '进行中',
    parallel: '并行执行中',
    failed: '失败',
    skipped: '已跳过',
    pending: '等待中'
  }
  return map[state] || state
}

// 步骤进度条填充宽度（0~100，用于连贯进度线）
const stepProgressWidth = computed(() => {
  const steps = timelineSteps.value
  const n = steps.length
  if (n <= 1) return 100
  const completedIdx = steps.findLastIndex((s) => s.state === 'completed')
  const activeIdx = steps.findIndex((s) => s.state === 'active')
  const lastRunningIdx = steps.findLastIndex((s) => s.state === 'active' || s.state === 'parallel')
  // 全部完成
  if (completedIdx === n - 1 && activeIdx < 0) return 100
  // 有进行中/并行的步骤：填充到最后一个运行节点中间位置
  if (lastRunningIdx >= 0) return ((lastRunningIdx + 0.5) / (n - 1)) * 100
  // 只有已完成的：填充到最后一个已完成节点
  if (completedIdx >= 0) return (completedIdx / (n - 1)) * 100
  // 全部等待
  return 0
})

// 直接用 ref + watch 替代 computed，绕开 computed 缓存失效 bug
const filteredLogs = ref<any[]>([])
function recomputeFilteredLogs() {
  const lines = logLines.value
  if (logFilter.value === 'all') {
    filteredLogs.value = [...lines]
  } else {
    filteredLogs.value = lines.filter((log) => log.level === logFilter.value)
  }
}

// 失败根因摘要：从 task.error、日志错误、步骤失败名中提取最具体的原因
const failureSummary = computed(() => {
  const t = task.value
  if (!t || t.status !== 'failed') return ''

  // 优先级 1：task.error 字段（后端 sendError / task-status 推送）
  if (t.error && typeof t.error === 'string' && t.error.trim()) {
    return t.error.trim()
  }

  // 优先级 2：从日志中提取最后一条 error 级别的信息
  const errorLogs = logLines.value.filter(
    (log) => log.level === 'error' && log.message && log.message.trim()
  )
  if (errorLogs.length > 0) {
    // 取最后一条，通常是最直接的失败原因
    const lastError = errorLogs[errorLogs.length - 1]
    const msg = lastError.message.trim()
    // 清理常见的 emoji 前缀（❌、⚠️ 等）
    return msg.replace(/^[❌⚠️🔴]\s*/, '').replace(/^\[[\w-]+\]\s*/, '')
  }

  // 优先级 3：从 progress 中找 status=failed 的阶段
  if (t.progress && Array.isArray(t.progress)) {
    const failedStage = t.progress.find((p: any) => p.status === 'failed' && p.message)
    if (failedStage?.message) {
      return failedStage.message.trim().replace(/^[❌⚠️🔴]\s*/, '')
    }
  }

  // 优先级 4：从 timeline 步骤中取失败步骤名
  if (failedStepName.value) {
    return `在「${failedStepName.value}」阶段失败`
  }

  return '未知原因，请查看详细日志'
})

// 失败智能诊断：根据错误类型推荐最佳修复方案
interface FailureDiagnosis {
  type: 'timeout' | 'quality_gate' | 'syntax_error' | 'network' | 'interrupted' | 'unknown'
  icon: string
  color: string
  recommendation: 'playground' | 'retry' | 'check_logs'
  explanation: string
}

const failureDiagnosis = computed<FailureDiagnosis>(() => {
  const summary = failureSummary.value.toLowerCase()
  
  // 1. 超时
  if (summary.includes('超时') || summary.includes('timeout')) {
    return {
      type: 'timeout',
      icon: '⏱️',
      color: '#f59e0b',
      recommendation: 'playground',
      explanation: '生成过程可能已产出代码，但质量检查未通过。建议进入 Playground 查看并修复。'
    }
  }
  
  // 2. 质量门禁（L0-B 验证失败）
  if (summary.includes('质量') || summary.includes('门禁') || summary.includes('code-001') || summary.includes('code-002')) {
    return {
      type: 'quality_gate',
      icon: '🚧',
      color: '#f97316',
      recommendation: 'playground',
      explanation: '代码已生成但未通过质量检查。Playground 支持 AI 自动修复语法错误、缺失引用等常见问题。'
    }
  }
  
  // 3. 语法错误
  if (summary.includes('语法') || summary.includes('syntax') || summary.includes('未定义') || summary.includes('undefined')) {
    return {
      type: 'syntax_error',
      icon: '🐛',
      color: '#ef4444',
      recommendation: 'playground',
      explanation: '代码存在语法错误或未定义变量。Playground 的 AI 修复可以自动识别并修复这些问题。'
    }
  }
  
  // 4. 网络错误
  if (summary.includes('网络') || summary.includes('network') || summary.includes('连接') || summary.includes('connection')) {
    return {
      type: 'network',
      icon: '🌐',
      color: '#3b82f6',
      recommendation: 'retry',
      explanation: '生成过程因网络问题中断。建议重新生成，系统会自动恢复进度。'
    }
  }
  
  // 5. 服务重启 / 进程被杀导致的中断。
  //    必须在 unknown 之前判定：这类任务的产物是「chunk 级候选快照」——源码与图片已落盘，
  //    但标准样式入口（resources/styles/index.less 等）在 microcode-engineer.js 的
  //    「补充标准文件」步骤才写盘，进程被杀时那一步根本没执行。
  //    因此快照天然缺样式入口，质量面板会报「缺少被引用的样式文件」。
  //    这不是代码缺陷、也不是模型生成错误，重跑一次即可，不该引导用户去翻日志或改代码。
  if (
    summary.includes('服务重启') ||
    summary.includes('任务中断') ||
    summary.includes('进程中断') ||
    summary.includes('已被取消')
  ) {
    return {
      type: 'interrupted',
      icon: '🔌',
      color: '#8b5cf6',
      recommendation: 'retry',
      explanation:
        '生成被服务重启或进程中断打断，已落盘的产物不完整（通常缺少样式入口文件）。这是环境中断而非代码缺陷，重新生成即可。'
    }
  }

  // 6. 未知
  return {
    type: 'unknown',
    icon: '❓',
    color: '#6b7280',
    recommendation: 'check_logs',
    explanation: '失败原因不明确，建议查看详细日志以定位问题。'
  }
})

/** 复制失败上下文到剪贴板（结构化信息，可粘贴到 AI 工具或团队沟通） */
async function copyFailureContext() {
  const t = task.value
  if (!t) return
  
  const errorLogs = logLines.value
    .filter((log) => log.level === 'error' && log.message?.trim())
    .slice(-5)
    .map((l) => `[${l.time}] ${l.message}`)
    .join('\n')
  
  const context = `# 组件生成失败上下文

## 组件信息
- 组件名称：${t.componentName || '未命名'}
- 任务 ID：${t.taskId || sessionId.value}
- 生成时间：${new Date(t.createdAt || Date.now()).toLocaleString('zh-CN')}

## 失败诊断
- 错误类型：${failureDiagnosis.value.icon} ${failureDiagnosis.value.type}
- 建议操作：${failureDiagnosis.value.explanation}

## 失败原因
${failureSummary.value}

## 关键错误日志
${errorLogs || '（无错误日志）'}

---
请根据以上信息帮我分析并修复这个问题。`
  
  try {
    await navigator.clipboard.writeText(context)
    message.success('已复制错误上下文，可粘贴到 AI 工具或团队沟通')
  } catch {
    const ta = document.createElement('textarea')
    ta.value = context; ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    document.execCommand('copy'); document.body.removeChild(ta)
    message.success('已复制错误上下文')
  }
}

/** 复制当前过滤后的日志到剪贴板 */
async function copyLogs() {
  const text = filteredLogs.value
    .map((l) => `[${l.time}] [${l.label}]${l.model ? ` [${l.model}]` : ''} ${l.message}${l.count > 1 ? ` ×${l.count}` : ''}`)
    .join('\n')
  if (!text) { message.info('暂无日志可复制'); return }
  try {
    await navigator.clipboard.writeText(text)
    message.success(`已复制 ${filteredLogs.value.length} 条日志`)
  } catch {
    // fallback: textarea 方式
    const ta = document.createElement('textarea')
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    document.execCommand('copy'); document.body.removeChild(ta)
    message.success(`已复制 ${filteredLogs.value.length} 条日志`)
  }
}

/** 下载日志为 .txt 文件 */
function downloadLogs() {
  const text = filteredLogs.value
    .map((l) => `[${l.time}] [${l.label}]${l.model ? ` [${l.model}]` : ''} ${l.message}${l.count > 1 ? ` ×${l.count}` : ''}`)
    .join('\n')
  if (!text) { message.info('暂无日志可下载'); return }
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${sessionId.value || 'task'}_logs.txt`
  a.click()
  URL.revokeObjectURL(url)
}

watch(logLines, recomputeFilteredLogs, { immediate: true, deep: false })
watch(logFilter, recomputeFilteredLogs)

// 日志新增或切换/过滤变化时，自动滚动到底部（保持实时跟随最新输出）
function scrollLogToBottom() {
  const el = logBodyRef.value
  if (el) {
    el.scrollTop = el.scrollHeight
  }
}
watch(filteredLogs, () => {
  if (autoScroll.value) nextTick(scrollLogToBottom)
})

// 点击步骤节点 → 切到日志 Tab 并跟随最新输出
function scrollLogToStep(_si: number) {
  activeTab.value = 'logs'
  if (autoScroll.value) nextTick(scrollLogToBottom)
}

watch(activeTab, (tab) => {
  if (tab === 'logs') {
    nextTick(scrollLogToBottom)
  }
  // 失败任务切换到代码 Tab 时，自动定位到第一个失败文件
  if (tab === 'code' && task.value?.status === 'failed' && failedFilesCount.value > 0) {
    nextTick(() => {
      // 延迟一下确保 codeSnapshot 已加载
      setTimeout(() => locateFirstFailedFile(), 100)
    })
  }
})

// 根据任务状态自动设置默认 Tab：
// 完成 → 预览；进行中 / 失败 / 其他 → 日志（并滚动到底部）
watch(
  () => task.value?.status,
  (status) => {
    if (status === 'completed') {
      activeTab.value = 'preview'
    } else {
      activeTab.value = 'logs'
    }
    if (activeTab.value === 'logs') {
      nextTick(scrollLogToBottom)
    }
  },
  { immediate: true }
)

/**
 * 基于快照 files 统计文件数与代码行数。
 * 快照 files 是产物面板的权威数据源；task.fileCount 可能为 0 或缺失。
 */
const snapshotFileCount = computed(() => codeSnapshot.value?.files?.length ?? 0)
const snapshotTotalLines = computed(() => {
  const files = codeSnapshot.value?.files
  if (!files || files.length === 0) return null
  // 旧快照可能缺失 lines 字段
  if (!files.some((f) => typeof f.lines === 'number')) return null
  return files.reduce((sum, f) => sum + (f.lines ?? 0), 0)
})

const statsData = computed(() => {
  const hasSnapshotFiles = snapshotFileCount.value > 0
  const fileCount = hasSnapshotFiles ? snapshotFileCount.value : (task.value?.fileCount ?? '-')
  // 旧快照可能没有 lines 字段，此时显示 '-' 而非误导的 0
  const lineCount = snapshotTotalLines.value ?? '-'

  if (pageTaskFlag.value) {
    const components = pageStructure.value?.components || []
    return {
      componentCount: components.length || 1,
      fileCount,
      lineCount,
      estimatedRemaining: '-'
    }
  }
  return {
    componentCount: task.value?.componentCount || 1,
    fileCount,
    lineCount,
    estimatedRemaining: estimatedRemainingTime.value
  }
})

/**
 * 基于已用时间 + 当前进度百分比 动态估算剩余时间。
 * 公式：remaining = elapsed × (100 - progress) / progress（线性外推）
 * 进度 0 时根据已用时间和阶段数给一个经验兜底值。
 */
const estimatedRemainingTime = computed(() => {
  const t = task.value
  if (!t || t.status !== 'running') return '-'

  const progress = taskProgressPercent.value
  const elapsedSec = (() => {
    if (!t.startTime) return 0
    return Math.floor((Date.now() - t.startTime) / 1000)
  })()

  let remainingSec: number

  if (progress > 5 && elapsedSec > 0) {
    // 有足够进度时线性外推：按当前速率推算剩余
    remainingSec = Math.ceil(elapsedSec * ((100 - progress) / progress))
  } else if (elapsedSec < 30) {
    // 刚启动(<30s)，微码典型总耗时 3-5min
    remainingSec = 180
  } else if (totalStageCount.value > 0 && completedStageCount.value === 0) {
    // 有阶段定义但还没完成任何阶段 → 按阶段数估算（每阶段 ~45s）
    remainingSec = totalStageCount.value * 45
  } else {
    // 已跑了一段时间但进度仍低 → 按已用时间的 3 倍兜底
    remainingSec = Math.max(60, elapsedSec * 3)
  }

  // 上限保护：超过 10min 显示 ">10min"
  if (remainingSec > 600) return '>10min'
  if (remainingSec < 30) return '<30s'
  const mins = Math.round(remainingSec / 60)
  return `~${mins}min`
})

const isWaiting = computed(() => {
  if (!task.value) return false
  return (
    task.value.status === 'queued' ||
    task.value.status === 'rate_limited' ||
    task.value.status === 'retry_scheduled'
  )
})

const waitingLabel = computed(() => {
  if (!task.value) return ''
  if (task.value.status === 'queued') return '排队中，等待执行...'
  if (task.value.status === 'rate_limited') return '配额不足，等待恢复...'
  if (task.value.status === 'retry_scheduled') return '等待重试...'
  return '等待中'
})

const assetUpgraded = computed(() => task.value?.assetsUpgraded || false)

const isFigmaLiteCompleted = (t: any) => {
  if (!t) return false
  return t.sourceType === 'figma' && t.generationTier === 'lite' && t.status === 'completed'
}

const { previewError, clearPreviewError } = usePreviewErrorBridge()

async function goBackToList() {
  teardownProgressSSE()
  const query = { ...route.query }
  await router.replace({ name: 'TaskCenter', query })
}

function handleManualRefresh() {
  loadTask()
}

function formatTime(ts: string) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function getTaskSource(t: any): 'screenshot' | 'figma' | 'html' {
  if (!t) return 'screenshot'
  return t.sourceType || 'screenshot'
}

function getTaskTier(t: any): 'lite' | 'max' {
  if (!t) return 'lite'
  // 注意：任务记录字段是 generationTier，不是 tier（早期误读 t.tier 导致徽章永远显示 Lite）
  if (t.generationTier) return t.generationTier
  // 兜底：从 sessionId 前缀推断（mc-max- / mc-lite-）
  const parts = (t.sessionId || '').split('-')
  if (parts.length >= 2) {
    if (parts[1] === 'lite') return 'lite'
    if (parts[1] === 'max') return 'max'
  }
  return 'lite'
}

type TaskLogEntry = {
  time: string
  timestamp: number
  firstTimestamp: number
  lastTimestamp: number
  level: string
  label: string
  message: string
  model?: string
  type: 'log' | 'progress'
  detail?: string
  count: number
}

const LOG_FOLD_WINDOW_MS = 2000

function formatLogTime(timestamp?: number) {
  return timestamp
    ? new Date(timestamp).toLocaleTimeString('en-US', { hour12: false })
    : '--:--:--'
}

function buildReplayKey(item: any) {
  return JSON.stringify([
    Number(item?.timestamp) || 0,
    item?.type || 'log',
    item?.level || 'info',
    item?.stage || '',
    item?.message || '',
    item?.meta || null,
  ])
}

/** 为未记录详细日志的页面骨架任务生成合成日志（基于产物结构），避免日志面板完全空白 */
function buildPageSyntheticLogs(pageData: any, structure: any): TaskLogEntry[] {
  const now = Date.now()
  const entries: TaskLogEntry[] = []
  const add = (message: string, level = 'info', label = 'INFO') => {
    entries.push({
      time: formatLogTime(now),
      timestamp: now,
      firstTimestamp: now,
      lastTimestamp: now,
      level,
      label,
      message,
      type: 'log',
      count: 1
    })
  }
  const meta = pageData?.meta || {}
  const layout = structure?.layout || {}
  const components = structure?.components || []
  add('开始生成页面骨架')
  if (meta.source?.type) {
    add(`输入源：${meta.source.type === 'figma' ? 'Figma' : '截图'}`)
  }
  if (layout.title) {
    add(`识别页面标题：${layout.title}`)
  }
  const regionNames: Record<string, string> = {
    header: '顶部栏', footer: '底部栏', left: '左侧边栏', right: '右侧边栏', center: '中心内容区'
  }
  const regions = components.map((c: any) => regionNames[c.region] || c.region).filter(Boolean)
  if (regions.length) {
    add(`识别页面区域：${[...new Set(regions)].join('、')}`)
  }
  if (components.length) {
    add(`规划 ${components.length} 个区域组件`)
  }
  add('写入 index.vue 与组件清单')
  add('生成页面骨架完成', 'success', 'SUCCESS')
  return entries
}

function appendFoldedLog(target: TaskLogEntry[], entry: TaskLogEntry) {
  const last = target[target.length - 1]
  const isSameContinuousLog = Boolean(
    last &&
    last.type === entry.type &&
    last.level === entry.level &&
    last.message === entry.message &&
    last.detail === entry.detail &&
    entry.timestamp >= last.lastTimestamp &&
    entry.timestamp - last.lastTimestamp <= LOG_FOLD_WINDOW_MS
  )

  if (isSameContinuousLog) {
    last.count += entry.count
    last.lastTimestamp = entry.lastTimestamp
    last.timestamp = entry.timestamp
    last.time = entry.time
    return
  }

  target.push(entry)
}

function createTaskLogEntry(item: any, isLog: boolean): TaskLogEntry {
  const timestamp = Number(item?.timestamp) || Date.now()
  const level = isLog
    ? (item.level || 'info')
    : (item.status === 'completed' ? 'success' : item.status === 'running' ? 'info' : 'warn')

  const model = item?.meta?.model || item?.meta?.agentModel || undefined

  return {
    time: formatLogTime(timestamp),
    timestamp,
    firstTimestamp: timestamp,
    lastTimestamp: timestamp,
    level,
    label: isLog
      ? `[${level.toUpperCase()}]`
      : `[${item.status?.toUpperCase() || 'PROGRESS'}]`,
    model: model || undefined,
    message: isLog ? item.message : `[${item.stage || '?'}] ${item.message}`,
    type: isLog ? 'log' : 'progress',
    detail: item.stage || undefined,
    count: 1,
  }
}

const snapshotStatusLabel = computed(() => {
  const labels: Record<string, string> = {
    candidate: '候选代码 · 暂不执行',
    validating: '正在验证',
    'last-good': '可预览快照',
    rejected: '验证未通过',
    partial: '部分产物 · 可继续编辑',
  }
  return labels[codeSnapshot.value?.status || ''] || '等待检查'
})

// ─── 候选文件层级树 ───
interface SnapshotTreeNode {
  name: string
  path: string
  type: 'folder' | 'file'
  size?: number
  children?: SnapshotTreeNode[]
}

/** 把扁平文件清单转成目录树（文件夹在前，同层按名称排序） */
function buildSnapshotFileTree(files: TaskCodeSnapshotFile[]): SnapshotTreeNode[] {
  const root: SnapshotTreeNode[] = []
  const folderMap = new Map<string, SnapshotTreeNode>()
  for (const file of files) {
    const parts = file.path.split('/')
    let children = root
    let prefix = ''
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i]
      const fullPath = prefix ? `${prefix}/${seg}` : seg
      if (i === parts.length - 1) {
        children.push({ name: seg, path: fullPath, type: 'file', size: file.size })
      } else {
        prefix = fullPath
        let folder = folderMap.get(fullPath)
        if (!folder) {
          folder = { name: seg, path: fullPath, type: 'folder', children: [] }
          folderMap.set(fullPath, folder)
          children.push(folder)
        }
        children = folder.children!
      }
    }
  }
  const sortNodes = (nodes: SnapshotTreeNode[]) => {
    nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1))
    for (const n of nodes) if (n.children) sortNodes(n.children)
  }
  sortNodes(root)
  return root
}

const collapsedSnapshotFolders = ref<Set<string>>(new Set())

const snapshotFileTree = computed(() => buildSnapshotFileTree(codeSnapshot.value?.files || []))

/** 根据折叠状态展开成可见行（文件夹行 + 文件行，带缩进深度） */
const visibleSnapshotRows = computed(() => {
  const rows: Array<{ node: SnapshotTreeNode; depth: number }> = []
  const walk = (nodes: SnapshotTreeNode[], depth: number) => {
    for (const node of nodes) {
      rows.push({ node, depth })
      if (node.type === 'folder' && node.children && !collapsedSnapshotFolders.value.has(node.path)) {
        walk(node.children, depth + 1)
      }
    }
  }
  walk(snapshotFileTree.value, 0)
  return rows
})

function toggleSnapshotFolder(path: string) {
  const next = new Set(collapsedSnapshotFolders.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  collapsedSnapshotFolders.value = next
}

function formatSnapshotFileSize(size: number) {
  if (size < 1024) return `${size} B`
  return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`
}

/** 文件生命周期状态 → 视觉状态点语义（蓝=写入/解析中、橙=已修改待校验、绿=通过、红=失败、灰=未变化） */
function fileStateOf(path: string): string {
  const explicit = fileStates.value[path]
  // SSE 生命周期标记优先；未标记时，命中结构化诊断的 BLOCK 问题也视为失败，
  // 否则「文件树状态点」与「问题文件清单」会互相矛盾。
  if (explicit && explicit !== 'unchanged') return explicit
  if (failedFilePaths.value.includes(path)) return 'failed'
  return explicit || 'unchanged'
}

const FILE_STATE_LABELS: Record<string, string> = {
  working: '正在处理中',
  modeling: '模型生成中',
  parsing: '正在解析',
  writing: '正在写入',
  modified: '本轮已修改，待校验',
  validating: '正在校验',
  passed: '校验通过',
  failed: '校验失败（待修复）',
  unchanged: '本轮未变化',
}
function fileStateLabel(state: string): string {
  return FILE_STATE_LABELS[state] || state
}

// ── 结构化质量诊断（逐文件：错误码 / 行列 / 消息 / 代码片段 / 修复建议） ──────────
/**
 * 权威数据源是后端 task.result，而不是日志文本。
 * 旧实现用 `log.message.includes(fileName)` 做字符串匹配，只能给出「某文件有问题」，
 * 既无行列也无错误码 —— 这正是用户反馈「定位过去依旧不知道错在哪」的根因。
 */
const lastValidationIssues = ref<QualityIssue[]>([])

function normalizeIssue(raw: any): QualityIssue | null {
  if (!raw) return null
  const message = String(raw.message || '').trim()
  if (!message) return null
  const severity = raw.severity === 'BLOCK' ? 'BLOCK' : raw.severity === 'WARN' ? 'WARN' : 'INFO'
  return {
    id: String(raw.id || 'UNKNOWN'),
    severity,
    sourceType: raw.sourceType || 'structure',
    file: String(raw.file || '').replace(/\\/g, '/'),
    line: Number(raw.line) || 1,
    column: Number(raw.column) || 1,
    message,
    extract: Array.isArray(raw.extract) ? raw.extract : undefined,
    snippet: Array.isArray(raw.snippet) ? raw.snippet : undefined,
    hint: raw.hint?.suggestion ? { suggestion: String(raw.hint.suggestion) } : undefined,
    healApplied: raw.healApplied === true,
  }
}

/** 合并生成管线诊断 + 本次手动重新校验结果，按 id/文件/行列/消息去重。 */
const qualityIssues = computed<QualityIssue[]>(() => {
  const result = task.value?.result || {}
  const buckets: any[] = [
    ...(Array.isArray(result?.codeValidationResult?.issues) ? result.codeValidationResult.issues : []),
    ...(Array.isArray(result?.lessCompileGate?.diagnostics) ? result.lessCompileGate.diagnostics : []),
    ...(Array.isArray(result?.runtimeGate?.issues) ? result.runtimeGate.issues : []),
    ...lastValidationIssues.value,
  ]
  const seen = new Set<string>()
  const merged: QualityIssue[] = []
  for (const raw of buckets) {
    const issue = normalizeIssue(raw)
    if (!issue) continue
    const key = `${issue.id}|${issue.file}|${issue.line}|${issue.column}|${issue.message}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(issue)
  }
  return merged
})

const qualityBlockCount = computed(
  () => qualityIssues.value.filter((issue) => issue.severity === 'BLOCK').length
)

/** 问题文件 = 结构化诊断命中的文件 ∪ SSE 生命周期标记为 failed 的文件 */
const failedFilePaths = computed<string[]>(() => {
  const snapshotPaths = new Set((codeSnapshot.value?.files || []).map((f) => f.path))
  if (snapshotPaths.size === 0) return []
  const fromIssues = qualityIssues.value
    .filter((issue) => issue.severity === 'BLOCK' && issue.file && snapshotPaths.has(issue.file))
    .map((issue) => issue.file)
  const fromStates = Object.entries(fileStates.value)
    .filter(([, state]) => state === 'failed')
    .map(([path]) => path)
  return [...new Set([...fromIssues, ...fromStates])].filter((path) => snapshotPaths.has(path))
})

const failedFilesCount = computed(() => failedFilePaths.value.length)

/** 当前选中文件命中的结构化诊断（按行号升序） */
const selectedFileIssues = computed<QualityIssue[]>(() => {
  const path = selectedSnapshotPath.value
  if (!path) return []
  return qualityIssues.value
    .filter((issue) => issue.file === path)
    .sort((a, b) => {
      const severityWeight = (s: string) => (s === 'BLOCK' ? 0 : s === 'WARN' ? 1 : 2)
      if (severityWeight(a.severity) !== severityWeight(b.severity)) {
        return severityWeight(a.severity) - severityWeight(b.severity)
      }
      return a.line - b.line
    })
})

/** 结构化诊断缺失时的兜底：仍走日志文件名匹配，保证旧任务不至于一片空白。 */
const selectedFileLogErrors = computed(() => {
  if (!selectedSnapshotPath.value || task.value?.status !== 'failed') return []
  if (selectedFileIssues.value.length > 0) return []
  const fileName = selectedSnapshotPath.value.split('/').pop() || ''
  const fileErrors = logLines.value.filter((log) => {
    if (log.level !== 'error') return false
    const msg = log.message || ''
    return msg.includes(fileName) || msg.includes(selectedSnapshotPath.value!)
  })
  const picked = fileErrors.length > 0
    ? fileErrors
    : logLines.value.filter((log) => log.level === 'error' && log.message?.trim()).slice(-3)
  return picked.map((l) => ({ time: l.time, message: l.message }))
})

/** 当前高亮的问题行（用于行号槽与代码行高亮条） */
const activeIssueLine = ref(0)
const issueLineSet = computed(() => {
  const set = new Set<number>()
  for (const issue of selectedFileIssues.value) {
    if (issue.severity === 'BLOCK' && issue.line > 0) set.add(issue.line)
  }
  return set
})
const snapshotCodeScrollRef = ref<HTMLElement | null>(null)

function revealIssueLine(issue: QualityIssue) {
  activeIssueLine.value = issue.line > 0 ? issue.line : 0
  nextTick(() => {
    const host = snapshotCodeScrollRef.value
    if (!host) return
    const target = host.querySelector<HTMLElement>(`.snapshot-line-gutter span[data-line="${activeIssueLine.value}"]`)
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  })
}

function expandSnapshotPath(path: string) {
  const parts = path.split('/')
  for (let i = 1; i < parts.length; i++) {
    const folderPath = parts.slice(0, i).join('/')
    if (collapsedSnapshotFolders.value.has(folderPath)) {
      collapsedSnapshotFolders.value.delete(folderPath)
    }
  }
}

/**
 * 定位到指定问题文件，并把它的第一个阻断问题行滚动到视野中央。
 *
 * 注意：问题可能指向**快照中不存在**的文件（典型是 STRUCT-003「缺少被引用的样式文件」）。
 * 这类路径直接 openSnapshotFile 会打到 404，用户只看到一串请求错误而得不到任何有用信息，
 * 因此这里先做存在性判断，缺失文件改为提示「文件缺失 + 修复建议」。
 */
async function locateFailedFile(path: string) {
  if (!path) return
  const snapshotPaths = new Set((codeSnapshot.value?.files || []).map((f: any) => f.path))
  if (snapshotPaths.size > 0 && !snapshotPaths.has(path)) {
    const issue = qualityIssues.value.find(
      (item) => item.file === path && item.severity === 'BLOCK',
    )
    message.warning(
      `${path} 在当前快照中不存在，无法打开源码：${issue?.message || '该文件被引用但未生成'}`
      + (issue?.hint?.suggestion ? ` —— ${issue.hint.suggestion}` : ''),
    )
    return
  }
  expandSnapshotPath(path)
  if (selectedSnapshotPath.value !== path) {
    await openSnapshotFile(path)
  }
  const first = qualityIssues.value
    .filter((issue) => issue.file === path && issue.severity === 'BLOCK')
    .sort((a, b) => a.line - b.line)[0]
  if (first) {
    revealIssueLine(first)
    message.info(`${path.split('/').pop()} 第 ${first.line} 行：${first.message}`)
  } else {
    message.success(`已定位到问题文件：${path.split('/').pop()}`)
  }
}

/** 定位到第一个失败文件（展开文件夹并选中） */
function locateFirstFailedFile() {
  const target = failedFilePaths.value[0]
    || Object.entries(fileStates.value).find(([_, state]) => state === 'failed')?.[0]
  if (!target) return
  void locateFailedFile(target)
}

/** 复制当前文件的错误（结构化优先，其次日志兜底） */
async function copySelectedFileErrors() {
  const fileName = selectedSnapshotPath.value?.split('/').pop() || '未知文件'
  const structured = selectedFileIssues.value
  const lines: string[] = [`# 文件错误：${fileName}`]
  if (structured.length > 0) {
    for (const issue of structured) {
      lines.push(`[${issue.severity}] ${issue.id} ${issue.file}:${issue.line}:${issue.column}`)
      lines.push(`  ${issue.message}`)
      const current = issue.snippet?.find((row) => row.current)
      if (current) lines.push(`  错误代码: ${current.code.trim()}`)
      if (issue.hint?.suggestion) lines.push(`  建议: ${issue.hint.suggestion}`)
    }
  } else {
    for (const e of selectedFileLogErrors.value) lines.push(`[${e.time}] ${e.message}`)
  }
  const text = lines.join('\n')
  try {
    await navigator.clipboard.writeText(text)
    message.success('已复制错误信息')
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    document.execCommand('copy'); document.body.removeChild(ta)
    message.success('已复制错误信息')
  }
}

/** 跳转到完整日志视图 */
function jumpToFullLogs() {
  activeTab.value = 'logs'
  logFilter.value = 'error'
}

const fileLifecycleLabel = computed(() => {
  const labels: Record<string, string> = {
    waiting: '等待生成',
    modeling: '模型生成中',
    parsing: '正在解析',
    writing: '正在写入',
    validating: '正在校验',
    completed: '生成完毕',
    failed: '生成失败',
  }
  return labels[fileLifecyclePhase.value] || ''
})

function applyFileLifecycle(data: any) {
  fileLifecyclePhase.value = data?.phase || ''
  fileLifecycleSummary.value = data?.summary || ''
  const next = { ...fileStates.value }
  for (const f of data?.files || []) {
    if (f && typeof f.path === 'string') next[f.path] = f.state || 'working'
  }
  fileStates.value = next
}

/** 根据文件名推断 highlight.js 语言（.vue 用 xml 高亮模板部分） */
function resolveHljsLang(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    vue: 'xml',
    html: 'xml',
    js: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    ts: 'typescript',
    jsx: 'javascript',
    tsx: 'typescript',
    css: 'css',
    less: 'less',
    scss: 'scss',
    json: 'json',
    md: 'markdown',
    svg: 'xml',
    xml: 'xml',
  }
  return map[ext] ?? null
}

const highlightedSnapshotContent = computed(() => {
  const code = selectedSnapshotContent.value
  if (!code) return ''
  const lang = resolveHljsLang(selectedSnapshotPath.value)
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value
    }
    return hljs.highlightAuto(code).value
  } catch {
    return escapeHtml(code)
  }
})

/** 产物代码行号总数：按换行符计数 +1（空内容记为 0），用于行号槽渲染 */
const snapshotLineCount = computed(() => {
  const code = selectedSnapshotContent.value
  if (!code) return 0
  const lines = code.split('\n').length
  return code.endsWith('\n') ? lines - 1 : lines
})

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

async function openSnapshotFile(path: string) {
  if (!codeSnapshot.value || !path) return
  selectedSnapshotPath.value = path
  snapshotLoading.value = true
  snapshotError.value = ''
  revokeSnapshotUrl()
  selectedSnapshotContent.value = ''
  const kind = classifySnapshotFile(path)
  selectedSnapshotKind.value = kind
  try {
    if (pageTaskFlag.value) {
      // 页面骨架：走 /api/page-skeleton/:groupId/:id/file?path=...
      const fileUrl = `/api/page-skeleton/${pageGroupId.value}/${pageTaskId.value}/file?path=${encodeURIComponent(path)}`
      if (kind === 'image') {
        const resp = await http.raw(fileUrl + '&raw=1')
        if (!resp.ok) throw new Error('读取图片失败')
        const blob = await resp.blob()
        selectedSnapshotUrl.value = URL.createObjectURL(blob)
      } else if (kind === 'text') {
        const data = await http.get(fileUrl)
        selectedSnapshotContent.value = data?.content ?? data?.data?.content ?? ''
      }
      return
    }
    if (kind === 'image') {
      const blob = await fetchTaskCodeSnapshotFileBlob(
        sessionId.value,
        codeSnapshot.value.revision,
        path,
      )
      selectedSnapshotUrl.value = URL.createObjectURL(blob)
    } else if (kind === 'text') {
      selectedSnapshotContent.value = await fetchTaskCodeSnapshotFile(
        sessionId.value,
        codeSnapshot.value.revision,
        path,
      )
    }
    // font / binary：不拉取，留空让 template 显示"该类型文件不支持预览"
  } catch (error: any) {
    selectedSnapshotContent.value = ''
    snapshotError.value = error?.response?.data?.message || error?.message || '读取快照文件失败'
  } finally {
    snapshotLoading.value = false
  }
}

// ── 代码编辑 → 保存 → 重新校验 → 刷新预览 ─────────────────────────────
/**
 * 用户手改产物后必须能立刻看到效果。链路：
 *   编辑 → POST /edit（生成新的不可变 candidate revision）
 *        → 重拉 latest（新 revision 成为候选并触发预览换帧）
 *        → POST /validate（重跑同源质量门禁，拿回逐文件行列级诊断）
 *        → 强制刷新预览 iframe
 * 质量门禁不通过也只是提示风险，不阻止预览 —— 用户要的就是「不管是否合格都能看到效果」。
 */
const codeEditing = ref(false)
const codeDraft = ref('')
const savingSnapshot = ref(false)
const revalidating = ref(false)
const forcePreviewing = ref(false)
/** 递增使 iframe key 变化，强制真实重载（相同 revision + 相同 URL 时浏览器不会重新请求） */
const previewReloadKey = ref(0)

const canEditSnapshot = computed(() => {
  const status = codeSnapshot.value?.status
  return (
    !!codeSnapshot.value &&
    !pageTaskFlag.value &&
    ['candidate', 'partial', 'validating', 'last-good'].includes(String(status || ''))
  )
})

const codeDirty = computed(
  () => codeEditing.value && codeDraft.value !== selectedSnapshotContent.value
)

function startEditing() {
  if (!canEditSnapshot.value) return
  codeDraft.value = selectedSnapshotContent.value
  codeEditing.value = true
}

function cancelEditing() {
  codeEditing.value = false
  codeDraft.value = ''
}

async function saveSnapshotFile() {
  if (!codeSnapshot.value || !selectedSnapshotPath.value) return
  if (codeDraft.value === selectedSnapshotContent.value) {
    message.info('内容未变化，无需保存')
    return
  }
  savingSnapshot.value = true
  try {
    await editTaskCodeSnapshotFile(
      sessionId.value,
      codeSnapshot.value.revision,
      selectedSnapshotPath.value,
      codeDraft.value,
    )
    codeEditing.value = false
    codeDraft.value = ''
    message.success('已保存为新候选 revision')
    // 重拉 latest：新 revision 成为 candidate，并自动触发预览安全换帧
    await loadCodeSnapshot(selectedSnapshotPath.value)
    await revalidateSnapshot()
  } catch (error: any) {
    message.error(error?.response?.data?.message || error?.message || '保存失败')
  } finally {
    savingSnapshot.value = false
  }
}

/** 重跑质量门禁（LESS 真实编译 + SFC 语义 + 结构完整性），刷新逐文件诊断。 */
async function revalidateSnapshot() {
  if (!codeSnapshot.value) return
  revalidating.value = true
  try {
    const result = await validateTaskCodeSnapshot(sessionId.value, codeSnapshot.value.revision)
    const issues = Array.isArray(result?.issues) ? result.issues : []
    lastValidationIssues.value = issues
    // 后端已把结论写回 task.result；这里同步本地避免再发一次任务查询。
    if (task.value) {
      task.value = {
        ...task.value,
        result: {
          ...(task.value.result || {}),
          codeValidationResult: {
            pass: result?.pass === true,
            blockCount: result?.blockCount ?? 0,
            issues,
            revision: result?.revision,
            checkedAt: result?.checkedAt,
          },
        },
      }
    }
    if (result?.pass) {
      message.success('重新校验通过：无阻断问题')
    } else {
      message.warning(`仍有 ${result?.blockCount ?? 0} 个阻断问题，点击文件列表「定位」可直达具体行列`)
    }
    await refreshPreviewSnapshot()
  } catch (error: any) {
    message.error(error?.response?.data?.message || error?.message || '重新校验失败')
  } finally {
    revalidating.value = false
  }
}

/** 强制刷新预览：无论质量门禁是否通过，都用当前 candidate/partial revision 重建 iframe。 */
async function refreshPreviewSnapshot() {
  const snapshot = codeSnapshot.value
  if (!snapshot) return
  previewFrames.value = [
    { url: '', snapshot: null },
    { url: '', snapshot: null },
  ]
  activePreviewSlot.value = -1
  pendingPreviewSlot.value = -1
  await nextTick()
  previewReloadKey.value++
  queuePreviewSnapshot({ ...snapshot })
}

/**
 * 强制预览：失败任务产物没有进 workspace 时，先把当前快照发布到 workspace 再重载 iframe。
 * 用户诉求「不管是否合格都能看到效果」的最后一道兜底。
 */
async function forcePreviewSnapshot() {
  if (!sessionId.value) return
  forcePreviewing.value = true
  try {
    await publishTaskToWorkspace(sessionId.value)
    await loadCodeSnapshot(selectedSnapshotPath.value)
    await refreshPreviewSnapshot()
    message.success('已发布当前产物并刷新预览（质量门禁结论不变）')
  } catch (error: any) {
    message.error(error?.response?.data?.message || error?.message || '强制预览失败')
  } finally {
    forcePreviewing.value = false
  }
}

function queuePreviewSnapshot(snapshot: TaskCodeSnapshotManifest | null) {
  if (!snapshot || snapshot.status === 'rejected') return
  const activeRevision = activePreviewSnapshot.value?.revision
  const pendingRevision = pendingPreviewSnapshot.value?.revision
  if (snapshot.revision === activeRevision && activePreviewSlot.value >= 0) {
    previewFrames.value[activePreviewSlot.value] = {
      ...previewFrames.value[activePreviewSlot.value],
      snapshot,
    }
    return
  }
  if (snapshot.revision === pendingRevision && pendingPreviewSlot.value >= 0) {
    previewFrames.value[pendingPreviewSlot.value] = {
      ...previewFrames.value[pendingPreviewSlot.value],
      snapshot,
    }
    return
  }

  const slot = activePreviewSlot.value === 0 ? 1 : 0
  previewFrames.value[slot] = {
    snapshot,
    url: buildPreviewUrl(snapshot),
  }
  pendingPreviewSlot.value = slot
}

function handlePreviewFrameMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin && event.origin !== 'null') return
  const data = event.data
  if (!data || typeof data.type !== 'string') return
  if (data.sessionId && data.sessionId !== sessionId.value) return

  // 预览页挂载握手：把当前面板类型设置补发给刚起来的这一帧。
  // 不能只依赖 iframe 的 load 事件 —— 那时 iframe 内 Vue 可能尚未 mounted，消息会被丢弃。
  if (data.type === 'mvgo-preview-mounted') {
    if (showPanelTypeSwitch.value) {
      try {
        ;(event.source as Window | null)?.postMessage(
          { type: 'set-panel-type', panelType: previewPanelType.value },
          window.location.origin
        )
      } catch {
        /* 源窗口已关闭：忽略 */
      }
    }
    return
  }

  if (data.type === 'MVGO_PREVIEW_READY' && pendingPreviewSlot.value >= 0) {
    const pending = previewFrames.value[pendingPreviewSlot.value]
    if (pending?.snapshot?.revision !== data.revision) return
    activePreviewSlot.value = pendingPreviewSlot.value
    pendingPreviewSlot.value = -1
    clearPreviewError()
    return
  }

  if (data.type === 'MVGO_PREVIEW_ERROR' && pendingPreviewSlot.value >= 0) {
    const pending = previewFrames.value[pendingPreviewSlot.value]
    if (data.revision && pending?.snapshot?.revision !== data.revision) return
    previewFrames.value[pendingPreviewSlot.value] = { url: '', snapshot: null }
    pendingPreviewSlot.value = -1
    // 旧活动帧仍可用时，候选失败只是一次安全换帧失败，不覆盖为全局预览错误。
    if (activePreviewSlot.value >= 0) clearPreviewError()
  }
}

async function loadCodeSnapshot(preferredPath = selectedSnapshotPath.value) {
  if (!sessionId.value) return

  // 页面骨架：走 /api/page-skeleton/:groupId/:id/files 构造产物面板数据
  if (pageTaskFlag.value) {
    try {
      const resp = await http.get(`/api/page-skeleton/${pageGroupId.value}/${pageTaskId.value}/files`)
      const files = (resp?.data?.files || resp?.files || []) as any[]
      pageFiles.value = files.map((f: any) => ({
        name: f.name,
        path: f.path,
        type: f.type || 'file',
        size: f.size
      }))
      codeSnapshot.value = {
        revision: 'page-' + pageTaskId.value,
        status: 'completed',
        files: pageFiles.value.map((f) => ({
          path: f.path,
          name: f.name,
          type: f.type,
          size: f.size ?? 0
        }))
      } as any
      if (codeSnapshot.value) hasUnreadCode.value = true
      // 页面任务不走 revision 预览帧，直接打开第一个文件
      if (!preferredPath) {
        preferredPath = codeSnapshot.value.files.find((f: any) => f.path === 'index.vue')?.path
          || codeSnapshot.value.files[0]?.path
          || ''
      }
      if (preferredPath) await openSnapshotFile(preferredPath)
    } catch (e) {
      console.warn('Failed to load page files', e)
      codeSnapshot.value = null
      pageFiles.value = []
    }
    return
  }

  try {
    const response = await fetchLatestTaskCodeSnapshot(sessionId.value)
    const candidate = response.candidate
    const lastGood = response.lastGood
    // 🛡️ 半成品抢救：失败任务也暴露 partial 快照，可预览、可进 PG 手动补全。
    const partial = response.partial
    codeSnapshot.value = candidate || partial || lastGood || null
    if (codeSnapshot.value) hasUnreadCode.value = true
    lastGoodSnapshot.value = lastGood || null
    const nextPreview = candidate || partial || lastGood || null
    if (nextPreview) {
      queuePreviewSnapshot(nextPreview)
    } else {
      previewFrames.value = [
        { url: '', snapshot: null },
        { url: '', snapshot: null },
      ]
      activePreviewSlot.value = -1
      pendingPreviewSlot.value = -1
    }
    if (!codeSnapshot.value) {
      selectedSnapshotPath.value = ''
      selectedSnapshotContent.value = ''
      return
    }
    const nextPath = codeSnapshot.value.files.some((file) => file.path === preferredPath)
      ? preferredPath
      : codeSnapshot.value.files.find((file) => file.path === 'package/index.vue')?.path
        || codeSnapshot.value.files[0]?.path
        || ''
    if (nextPath) await openSnapshotFile(nextPath)
  } catch (error: any) {
    if (error?.response?.status !== 404) console.warn('Failed to load task code snapshot', error)
  }
}

async function loadTask() {
  console.log('[loadTask] 开始执行, sessionId:', sessionId.value)
  if (!sessionId.value) {
    console.warn('[loadTask] sessionId 为空，跳过加载')
    return
  }  try {
    loading.value = true
    taskLoadError.value = ''

    // 详情页必须直查单任务，不能依赖列表接口再 find：列表可能受筛选、分页、
    // 用户范围或瞬时加载失败影响，导致真实存在的任务被误判为已删除。
    const resp = await fetchTaskStatus(sessionId.value)
    const found = resp?.data?.task || resp?.task || null

    if (resp?.success !== false && found) {
      task.value = found
      taskMissingRetries.value = 0
      await loadWorkspaceDimensions(found)
      await loadCodeSnapshot()

      // 更新 SSE 阶段数据 + 从历史 progress 恢复日志（带去重聚合）
      // 后端 task.progress 是数组 [{ type, stage, status, message, ... }]
      if (found.progress && Array.isArray(found.progress)) {
        const rebuilt: TaskLogEntry[] = []
        const record: Record<string, { status: string; progress?: number }> = {}
        historyReplayCounts.clear()
        for (const item of found.progress) {
          // 聚合阶段状态到时间线
          if (item?.stage) {
            record[item.stage] = { status: item.status, progress: item.progress }
          }
          // 恢复 type='log' 的纯日志 和 type='progress'/'stage' 的阶段变更
          const isLog = item?.type === 'log'
          const isProgress = ['progress', 'stage'].includes(item?.type) || (!item?.type && item?.stage)
          if ((isLog || isProgress) && item?.message) {
            const replayKey = buildReplayKey(item)
            historyReplayCounts.set(replayKey, (historyReplayCounts.get(replayKey) || 0) + 1)
            appendFoldedLog(rebuilt, createTaskLogEntry(item, isLog))
          }
        }
        logLines.value = rebuilt
        triggerRef(logLines)
        filteredLogs.value = logFilter.value === 'all' ? [...rebuilt] : rebuilt.filter(log => log.level === logFilter.value)
        sseStages.value = record
      }

      // 页面骨架任务：加载结构 + 产物文件数 + 合成日志兜底
      if (pageTaskFlag.value) {
        try {
          const pageResp = await http.get(`/api/page-skeleton/${pageGroupId.value}/${pageTaskId.value}`)
          const pageData = pageResp?.data || pageResp
          pageStructure.value = pageData?.structure || null
          const filesResp = await http.get(`/api/page-skeleton/${pageGroupId.value}/${pageTaskId.value}/files`)
          const files = (filesResp?.data?.files || filesResp?.files || []) as any[]
          pageFiles.value = files.map((f: any) => ({
            name: f.name,
            path: f.path,
            type: f.type || 'file',
            size: f.size
          }))
          task.value.fileCount = files.length
          // 若后端未记录详细日志（如改动前的历史 completed 任务），用页面结构生成合成日志兜底。
          // 仅当任务已终态(completed)时合成，避免「生成中」阶段闪现「已完成」的合成日志。
          // 生成中/失败的任务若有真实 progress，上面已从 found.progress 重建；若为空则靠 SSE 实时推送。
          if ((!found.progress || !found.progress.length) && pageData && found.status === 'completed') {
            const synthetic = buildPageSyntheticLogs(pageData, pageStructure.value)
            logLines.value = synthetic
            triggerRef(logLines)
            filteredLogs.value = logFilter.value === 'all' ? [...synthetic] : []
            sseStages.value = { '页面生成': { status: 'completed', progress: 100 } }
          }
        } catch (e) {
          console.warn('Failed to load page detail', e)
        }
      }

      // 加载组件文件数
      if (found.componentId) {
        try {
          const files = await getComponentFiles(found.componentId)
          task.value.fileCount = files.length
        } catch (e) {
          console.warn('Failed to load component files', e)
        }
      }

      // 预览可用性由后端正式产物检查决定，临时图片或分块缓存不能开放预览。
      // 页面骨架 completed 状态直接放行（后端 artifactReady 未单独识别页面产物）。
      previewAvailable.value = found.artifactReady === true || (pageTaskFlag.value && found.status === 'completed')

      // 🛡️ 2026-09-03：加载该组件的接口对接状态（决定按钮显示「撤回对接」还是「对接接口」）
      if (!pageTaskFlag.value && resolveTaskTarget(found) === 'vue3' && found.componentId) {
        await loadBindingStatus(found.componentId)
      }
    } else {
      task.value = null
      taskMissingRetries.value++
      if (taskMissingRetries.value < 3) {
        setTimeout(loadTask, 2000)
      } else {
        taskLoadError.value =
          resp?.data?.error ||
          resp?.error ||
          (resp?.message && resp.message !== 'ok' ? resp.message : '') ||
          '任务不存在或已被删除'
      }
    }
  } catch (error: any) {
    console.error('Failed to load task', error)
    task.value = null
    taskMissingRetries.value = 3
    taskLoadError.value = '任务详情加载失败'
  } finally {
    loading.value = false
  }
}

async function handlePause() {
  if (!task.value) return
  try {
    await pauseTask(task.value.sessionId)
    message.success('任务已暂停')
    await loadTask()
  } catch (error: any) {
    message.error('暂停失败: ' + (error.message || '未知错误'))
  }
}

async function handleResume() {
  if (!task.value) return
  try {
    await resumeTask(task.value.sessionId)
    message.success('任务已恢复')
    await loadTask()
  } catch (error: any) {
    message.error('恢复失败: ' + (error.message || '未知错误'))
  }
}

async function handleCancel() {
  if (!task.value) return
  Modal.confirm({
    title: '确认取消任务？',
    content: '取消后任务将停止，已生成的代码可以下载。',
    okText: '确认取消',
    okType: 'danger',
    cancelText: '返回',
    onOk: async () => {
      try {
        await cancelTask(task.value.sessionId)
        message.success('任务已取消')
        await loadTask()
      } catch (error: any) {
        message.error('取消失败: ' + (error.message || '未知错误'))
      }
    }
  })
}

async function handleDeleteTask() {
  if (!task.value) return
  Modal.confirm({
    title: '确认删除任务？',
    content: '删除后任务及其产物将永久丢失，无法恢复。',
    okText: '确认删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        await apiDeleteTask(task.value.sessionId)
        message.success('任务已删除')
        router.push('/tasks')
      } catch (error: any) {
        message.error('删除失败: ' + (error.message || '未知错误'))
      }
    }
  })
}

async function handleContinueGeneration() {
  if (!task.value) return
  try {
    startingContinue.value = true
    await startQueuedTask(task.value.sessionId)
    message.success('已触发继续生成')
    await loadTask()
  } catch (error: any) {
    message.error('继续生成失败: ' + (error.message || '未知错误'))
  } finally {
    startingContinue.value = false
  }
}

async function handleCancelQueue() {
  if (!task.value) return
  try {
    await cancelQueuedTask(task.value.sessionId)
    message.success('已取消排队')
    await loadTask()
  } catch (error: any) {
    message.error('取消排队失败: ' + (error.message || '未知错误'))
  }
}

async function openReviewModal() {
  reviewAction.value = 'passed'
  reviewReason.value = ''
  reviewModalVisible.value = true
}

async function submitReview() {
  if (!task.value) return
  try {
    reviewSubmitting.value = true
    await submitHumanReview(task.value.sessionId, reviewAction.value, reviewReason.value)
    message.success('审核已提交')
    reviewModalVisible.value = false
    humanReviewed.value = true
    await loadTask()
  } catch (error: any) {
    message.error('审核提交失败: ' + (error.message || '未知错误'))
  } finally {
    reviewSubmitting.value = false
  }
}

function confirmRevokeReview() {
  Modal.confirm({
    title: '确认撤回审核？',
    content: '撤回后任务将恢复为未审核状态。',
    okText: '确认撤回',
    okType: 'danger',
    cancelText: '取消',
    onOk: handleRevokeReview
  })
}

async function handleRevokeReview() {
  if (!task.value) return
  try {
    await revokeHumanReview(task.value.sessionId)
    message.success('审核已撤回')
    humanReviewed.value = false
    await loadTask()
  } catch (error: any) {
    message.error('撤回失败: ' + (error.message || '未知错误'))
  }
}

async function handleRetry(reuseCache = false) {
  if (!task.value) return
  const t = task.value
  let closeLoading: ReturnType<typeof message.loading> | null = null

  try {
    retrying.value = true
    closeLoading = message.loading({ content: reuseCache ? '正在续跑（复用缓存）...' : '正在重新生成...', duration: 0 })

    if (t.sourceType === 'screenshot' && t.generationTier === 'lite') {
      const data = await http.post(`/api/lite/retry/${t.sessionId}`, {
        componentType: t.target || 'vue3'
      })
      closeLoading?.()
      if (data.success) {
        message.success('重试已启动')
        const newSessionId = data.data?.sessionId
        if (newSessionId) {
          router.push(`/tasks/${newSessionId}`)
        } else {
          await loadTask()
        }
      } else {
        message.error(data.message || '重试失败')
      }
    } else {
      // 防御：fileKey/nodeId 为空（历史脏数据/恢复任务）时后端 DTO 校验会 400，
      // 这里直接拦截给出明确提示，避免用户看到无意义的 400。
      if (!t.fileKey || !t.nodeId) {
        closeLoading?.()
        message.warning('该任务缺少 Figma 参数，无法重试')
        return
      }
      const rawCfg =
        (configStore.config as any)?.value !== undefined
          ? (configStore.config as any).value
          : configStore.config
      const requestData: any = {
        sessionId: t.sessionId,
        sourceType: t.sourceType,
        generationTier: t.generationTier,
        target: t.target,
        fileKey: t.fileKey,
        nodeId: t.nodeId,
        componentId: t.componentId,
        componentName: t.componentName,
        groupId: t.groupId,
        config: rawCfg || {},
        reuseCache, // 🆕 续跑复用缓存：true=复用 figma/visual 缓存，false=全新重新生成
      }

      const response =
        t.target === 'vue3'
          ? await generateVue3Component(requestData)
          : await generateComponent(requestData)

      closeLoading?.()

      if (response.success) {
        message.success('重试已启动')
        const newSessionId = response.data?.sessionId
        if (newSessionId) {
          router.push(`/tasks/${newSessionId}`)
        } else {
          await loadTask()
        }
      } else {
        message.error(response.error || '重试失败')
      }
    }
  } catch (error: any) {
    closeLoading?.()
    message.error('重试失败: ' + (error.message || '未知错误'))
  } finally {
    retrying.value = false
  }
}

/** 页面骨架任务失败重试：基于磁盘已保存截图重新生成（复用同一 pageId，SSE 推送新进度） */
async function handlePageRetry() {
  if (!task.value) return
  const t = task.value
  let closeLoading: ReturnType<typeof message.loading> | null = null
  try {
    retrying.value = true
    closeLoading = message.loading({ content: '正在重新生成页面骨架...', duration: 0 })
    const data = await http.post(
      `/api/page-skeleton/${encodeURIComponent(t.groupId || 'default-group')}/${encodeURIComponent(t.sessionId)}/retry`,
      {},
    )
    closeLoading?.()
    if (data?.success) {
      message.success('重试已启动')
      // 复用同一 pageId：刷新任务并重新订阅 SSE（实时推送新进度）
      await loadTask()
      setupProgressSSE()
    } else {
      message.error(data?.message || '重试失败')
    }
  } catch (error: any) {
    closeLoading?.()
    message.error('重试失败: ' + (error.message || '未知错误'))
  } finally {
    retrying.value = false
  }
}

async function handleUpgradeAssets() {
  if (!task.value) return
  const t = task.value

  try {
    upgrading.value = true
    message.loading({ content: '正在升级素材...', duration: 0 })

    const data = await http.post(`/api/lite/upgrade-assets/${t.sessionId}`)

    if (data.success) {
      message.success('素材升级完成')
      await loadTask()
      previewKey.value++
    } else {
      message.error(data.message || '升级失败')
    }
  } catch (error: any) {
    message.error('升级失败: ' + (error.message || '未知错误'))
  } finally {
    upgrading.value = false
  }
}

function openPlayground() {
  if (!canOpenPlayground.value || !playgroundLocation.value) return
  router.push(playgroundLocation.value)
}

function openBindingWizard() {
  if (!task.value) return
  // 🛡️ 接口对接（数据槽分析）仅 Vue3 组件支持；微码组件无标准 SFC data slot，
  // 调用 /api/vue3/analyze-slots 会因「组件 SFC 文件未找到」500。
  if (!isVue3Target.value) {
    message.warning('仅 Vue3 组件支持接口对接')
    return
  }
  bindingWizardOpen.value = true
}

function confirmRollbackBinding() {
  Modal.confirm({
    title: '确认撤回接口对接？',
    content: '撤回后将恢复对接前的状态。',
    okText: '确认撤回',
    okType: 'danger',
    cancelText: '取消',
    onOk: handleRollbackBinding
  })
}

// 🛡️ 2026-09-03：查询组件是否已对接接口。此前 latestBindingId 从不赋值，
// 「撤回接口对接」入口是死代码（永远不显示）。绑定状态是后端持久化记录，
// 与任务记录相互独立，必须按 componentId 主动查询。
async function loadBindingStatus(componentId: string) {
  try {
    const resp: any = await http.get(`/api/vue3/bindings?componentId=${encodeURIComponent(componentId)}`)
    const list = resp?.data?.bindings || resp?.bindings || []
    if (Array.isArray(list) && list.length > 0) {
      latestBindingId.value = list[0]?.bindingId || ''
    } else {
      latestBindingId.value = ''
    }
  } catch (e) {
    latestBindingId.value = ''
  }
}

async function handleRollbackBinding() {
  if (!task.value || !latestBindingId.value) return

  try {
    rollingBack.value = true
    // 🛡️ 2026-09-03：后端解绑路由是 POST bindings/:id/delete（此前误用 http.delete → 404 永不生效）
    await http.post(`/api/vue3/bindings/${latestBindingId.value}/delete`)
    message.success('接口对接已撤回')
    latestBindingId.value = ''
    await loadTask()
  } catch (error: any) {
    message.error('撤回失败: ' + (error.message || '未知错误'))
  } finally {
    rollingBack.value = false
  }
}

let progressEventSource: EventSource | null = null

function teardownProgressSSE() {
  if (progressEventSource) {
    progressEventSource.onmessage = null
    progressEventSource.onerror = null
    progressEventSource.close()
    progressEventSource = null
  }
}

function setupProgressSSE() {
  if (!sessionId.value || sessionId.value === 'undefined') {
    console.warn('TaskDetail: 未设置 sessionId，跳过 SSE 连接')
    return
  }
  // 任务已终态（completed / failed / cancelled），不需要建立 SSE 连接
  // EventSource 会在服务端断开后自动重连，导致已完成任务也被反复轮询
  const isTerminal = ['completed', 'failed', 'cancelled'].includes(task.value?.status || '')
  if (isTerminal) {
    console.log('[SSE] 任务已终态，跳过 SSE 连接:', task.value?.status)
    return
  }
  teardownProgressSSE()
  progressEventSource = createProgressStream(sessionId.value)
  progressEventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.type === 'progress') {
        sseStages.value = {
          ...sseStages.value,
          [data.stage]: {
            status: data.status,
            progress: data.progress
          }
        }
      } else if (data.type === 'code-snapshot') {
        // SSE 只携带 revision 元数据；源码始终通过受保护的 revision API 拉取。
        // rejected 通知会使 latest 自动回退 last-good，避免继续展示失败候选。
        void loadCodeSnapshot()
      } else if (data.type === 'snapshot-resync') {
        // 服务端历史窗口已发生缺口，直接拉取当前 candidate + last-good 全量状态。
        void loadCodeSnapshot()
        // 🛡️ 缺口同时意味着日志事件（eventHistory 窗口 120 条）已溢出丢失：
        // Last-Event-ID 回放无法覆盖，必须从 task.progress 全量重建日志，否则日志区冻结。
        if (task.value && task.value.status === 'running') void loadTask()
      } else if (data.type === 'file-lifecycle') {
        // 文件生命周期事件：更新文件组阶段与多文件状态（不触发 snapshot 拉取）
        applyFileLifecycle(data)
      } else if (data.type === 'log') {
        // 状态接口的完整历史与新 SSE 连接的 buffer 可能重叠。
        // 只消费同 timestamp/meta 的历史副本；真正的新日志继续进入有界连续折叠。
        const replayKey = buildReplayKey(data)
        const replayCount = historyReplayCounts.get(replayKey) || 0
        if (replayCount > 0) {
          if (replayCount === 1) historyReplayCounts.delete(replayKey)
          else historyReplayCounts.set(replayKey, replayCount - 1)
          return
        }

        const nextLines = [...logLines.value]
        appendFoldedLog(nextLines, createTaskLogEntry(data, true))
        logLines.value = nextLines
        triggerRef(logLines)
      } else if (data.type === 'task-status') {
        // 后端推送任务状态变更（如 failed/completed），即使前端尚未从 API 拿到 task 也要更新
        if (task.value) {
          task.value.status = data.status
          if (data.error) task.value.error = data.error
        } else {
          // task 还没从 API 加载到，先构造最小 task 对象让页面不再卡"初始化中"
          task.value = {
            sessionId: sessionId.value,
            status: data.status,
            error: data.error || data.message || '',
            progress: [],
          }
        }
        // 停止轮询加载
        taskMissingRetries.value = 0
        // 任务进入终态后立即关闭 SSE，防止 EventSource 自动重连导致重复请求
        if (['completed', 'failed', 'cancelled'].includes(data.status)) {
          console.log('[SSE] 任务终态，关闭 SSE:', data.status)
          teardownProgressSSE()
          // 🔄 终态后重新拉取任务实体：SSE 只推 status，artifactReady / endTime / fileCount
          // 等字段必须靠 API 刷新。完成场景下预览 iframe 由 artifactReady 放行，
          // 不重拉会出现"任务显示完成但预览一直不刷新"；previewKey++ 强制 iframe 重挂载。
          loadTask().finally(() => {
            previewKey.value++
          })
        }
      } else if (data.type === 'error') {
        // 记录错误信息，如果 task 已存在则写入 error 字段
        if (task.value) {
          task.value.error = data.message || data.error
          if (task.value.status === 'running') task.value.status = 'failed'
        } else {
          task.value = {
            sessionId: sessionId.value,
            status: 'failed',
            error: data.message || data.error || '未知错误',
            progress: [],
          }
        }
        taskMissingRetries.value = 0
        // error 类型也是终态，关闭 SSE
        teardownProgressSSE()
        // 🔄 同 task-status 终态：重拉任务实体（失败但产物可用时 artifactReady 仍为 true，草稿预览需放行）
        loadTask().finally(() => {
          previewKey.value++
        })
      }
    } catch (e) {
      console.warn('Failed to parse SSE message', e)
    }
  }

  progressEventSource.onerror = () => {
    // SSE 自动重连是 EventSource 内置行为，如果任务已终态则关闭连接
    const isTerminal = ['completed', 'failed', 'cancelled'].includes(task.value?.status || '')
    if (isTerminal) {
      console.log('[SSE] 任务已终态，关闭重连')
      teardownProgressSSE()
    } else {
      console.warn('SSE connection error')
    }
  }
}

onMounted(() => {
  previewResizeObserver = new ResizeObserver((entries) => {
    previewViewportWidth.value = Math.floor(entries[0]?.contentRect.width || 0)
  })
  watch(
    previewViewportRef,
    (element, previousElement) => {
      if (previousElement) previewResizeObserver?.unobserve(previousElement)
      if (element) previewResizeObserver?.observe(element)
    },
    { immediate: true }
  )
  window.addEventListener('message', handlePreviewFrameMessage)
  // 已用时间每秒刷新
  elapsedTimer = setInterval(() => { elapsedTick.value++ }, 1000)
  // 先建立 SSE 连接，再加载任务状态
  // 这样可以避免错过早期的 SSE 事件（如进度更新、日志等）
  // 如果任务已终态，setupProgressSSE 内部会跳过连接
  ;(async () => {
    setupProgressSSE()  // 先建立 SSE 连接
    await loadTask()    // 再加载任务状态
  })()
})

onUnmounted(() => {
  previewResizeObserver?.disconnect()
  previewResizeObserver = null
  window.removeEventListener('message', handlePreviewFrameMessage)
  revokeSnapshotUrl()
  if (progressEventSource) {
    progressEventSource.close()
    progressEventSource = null
  }
  if (elapsedTimer) {
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }
})

watch(sessionId, () => {
  loadTask()
  setupProgressSSE()
})

// 🛡️ 2026-09-03：对接向导关闭后重查绑定状态（绑定成功→按钮切「撤回对接」；
// 若向导内撤回→按钮切回「对接接口」）。loadBindingStatus 内部幂等，可安全重复调用。
function refreshBindingStatusAfterWizard() {
  const cid = task.value?.componentId || task.value?.sessionId
  if (!pageTaskFlag.value && cid) loadBindingStatus(cid)
}

watch(bindingWizardOpen, (open) => {
  if (!open) {
    // 关闭面板时稍候让后端绑定事务落盘完成再查询
    setTimeout(refreshBindingStatusAfterWizard, 500)
  }
})
</script>

<style scoped>
/* 样式部分需要从 tokens.css 导入设计令牌 */
@import '@/assets/styles/themes/tokens.css';

.task-detail-page {
  /* 填满 app-content 可用高度（100vh - AppHeader 64px），不产生整页滚动 */
  height: calc(100vh - 104px);
  background: var(--bg-page);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.breadcrumb-bar {
  flex-shrink: 0;
  height: 48px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-default);
  display: flex;
  align-items: center;
  padding: 0 24px;
  gap: 12px;
}

.bc-back {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.bc-back:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.bc-back svg {
  width: 14px;
  height: 14px;
}

.bc-sep {
  color: var(--text-tertiary);
  font-size: 14px;
}

.bc-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bc-session {
  font-size: 11px;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  margin-left: 4px;
}

.breadcrumb-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.btn-action,
.btn-danger,
.btn-refresh {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid var(--border-default);
  background: var(--bg-card);
  color: var(--text-primary);
}

.btn-action:hover,
.btn-refresh:hover {
  background: var(--bg-hover);
}

.btn-pause {
  color: var(--c-orange-600);
  border-color: var(--c-orange-300);
}

.btn-danger {
  background: var(--c-red-500);
  color: white;
  border-color: var(--c-red-500);
}

.btn-danger:hover {
  background: var(--c-red-600);
}

.detail-layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0; /* 关键：允许 flex 子项收缩 */
}

.detail-body {
  flex: 1;
  display: grid;
  grid-template-columns: 280px 1fr;
  overflow: hidden;
  min-height: 0; /* 允许 grid 子项收缩 */
}

.detail-body--empty {
  grid-template-columns: 1fr;
}

.sidebar {
  background: var(--bg-card);
  border-right: 1px solid var(--border-default);
  overflow-y: auto;
  scrollbar-gutter: stable;
  user-select: none;
}

.sidebar-section {
  padding: 16px;
  border-bottom: 1px solid var(--border-default);
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.sidebar-field {
  margin-bottom: 16px;
}

.field-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.source-tabs {
  display: flex;
  background: var(--bg-secondary);
  border-radius: 6px;
  padding: 3px;
  gap: 3px;
}

.source-tab {
  flex: 1;
  padding: 6px 12px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.source-tab:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.source-tab.active {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.seg-control {
  display: flex;
  background: var(--bg-secondary);
  border-radius: 6px;
  padding: 3px;
  gap: 3px;
}

.seg-opt {
  flex: 1;
  padding: 6px 12px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.seg-opt:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.seg-opt.active {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.seg-opt.active.seg-lite {
  background: linear-gradient(135deg, #a7f3d0, #6ee7b7);
  color: #065f46;
}

.info-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px 12px;
  font-size: 13px;
}

.info-key {
  color: var(--text-tertiary);
  font-weight: 500;
}

.info-val {
  color: var(--text-primary);
}

.info-mono {
  font-family: var(--font-mono);
  font-size: 12px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.status-badge.running {
  background: var(--task-running-bg);
  color: var(--task-running-text);
}

.status-badge.success {
  background: var(--task-success-bg);
  color: var(--task-success-text);
}

.status-badge.failed {
  background: var(--task-failed-bg);
  color: var(--task-failed-text);
}

.status-badge.cancelled {
  background: var(--bg-secondary);
  color: var(--text-tertiary);
}

.status-badge.pending {
  background: var(--bg-secondary);
  color: var(--text-tertiary);
}

.sb-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse-dot 1.5s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.model-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 0;
}

.model-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
  background: rgba(99, 102, 241, 0.1);
  color: var(--c-indigo-300, #a5b4fc);
  border: 1px solid rgba(99, 102, 241, 0.18);
}

.qg-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}

.qg-badge.passed {
  background: var(--task-success-bg);
  color: var(--task-success-text);
}

.qg-badge.warned {
  background: var(--task-queued-bg);
  color: var(--task-queued-text);
}

.qg-badge.failed {
  background: var(--task-failed-bg);
  color: var(--task-failed-text);
}

.main-content {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.content-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  /* 预留滚动条槽位：滚动条永不挤占内容宽度，消除高度重排造成的滚动条跳动 */
  scrollbar-gutter: stable;
}

.detail-body--empty .main-content,
.detail-body--empty .content-scroll {
  min-height: 0;
}

.detail-body--empty .content-scroll {
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail-loading,
.detail-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  width: 100%;
  min-height: 100%;
  padding: 48px 24px;
  text-align: center;
  color: var(--text-secondary);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-default);
  border-top-color: var(--c-blue-500);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-icon {
  color: var(--text-tertiary);
}

.empty-description {
  margin: -8px 0 0;
  color: var(--text-tertiary);
  font-size: 14px;
}

.empty-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.empty-link,
.empty-retry {
  height: 36px;
  padding: 0 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.empty-link {
  border: 1px solid transparent;
  background: var(--c-blue-500);
  color: var(--text-inverse);
}

.empty-link:hover {
  background: var(--c-blue-600);
}

.empty-retry {
  border: 1px solid var(--border-default);
  background: var(--bg-card);
  color: var(--text-primary);
}

.empty-retry:hover {
  border-color: var(--c-blue-500);
  color: var(--c-blue-500);
}

.canvas {
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.canvas-overview {
  padding: 16px 24px;
}

.overview-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.overview-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 任务号（可点击复制，图标随任务号置顶） */
.identity-copy {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  cursor: pointer;
  user-select: all;
}

.identity-copy-icon {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  opacity: 0.5;
  color: var(--text-secondary);
  transition: opacity 0.2s, color 0.2s;
}

.identity-copy:hover .identity-copy-icon,
.identity-copy.is-copied .identity-copy-icon {
  opacity: 1;
  color: #1e8e3e;
}

.identity-copy.is-copied .identity-name {
  color: #1e8e3e;
}

/* 身份字段：显式写清 任务号 / 组件名 / 组件ID */
.identity-submeta {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex-wrap: wrap;
}

.identity-field-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.identity-field-sep {
  font-size: 13px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.plugin-id {
  font-size: 13px;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  min-width: 0;
  line-height: 1.4;
  word-break: break-all;
}

.plugin-id-mono {
  font-family: var(--font-mono);
}

.plugin-id-text {
  word-break: break-all;
  line-height: 1.4;
}

.tag-row {
  display: flex;
  gap: 6px;
}

.tag-pill {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

.tag-pill.tag-type {
  background: var(--c-blue-50);
  color: var(--c-blue-700);
}

.tag-pill.tag-source {
  background: var(--c-purple-50);
  color: var(--c-purple-700);
}

.tag-pill.tag-batch {
  background: var(--c-green-50);
  color: var(--c-green-700);
  font-family: var(--font-mono);
}

/* ── 身份识别区 ─ */
.identity-main {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.identity-main-top {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.identity-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 420px;
}

/* ─ 侧边栏来源具体值 + 操作按钮 ── */
.source-value {
  margin-top: 8px;
}

.source-url-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.source-url {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-tertiary);
  word-break: break-all;
  line-height: 1.4;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 截短URL容器 */
.source-url--truncate {
  display: block;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* URL hover popover */
.source-url-popover-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
}

.source-url-popover {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 100;
  padding: 8px 10px;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-primary);
  word-break: break-all;
  line-height: 1.5;
  opacity: 0;
  visibility: hidden;
  transform: translateY(4px);
  transition: opacity 0.15s, visibility 0.15s, transform 0.15s;
  pointer-events: none;
}

.source-url-popover-wrap:hover .source-url-popover {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
  pointer-events: auto;
}

.source-thumb-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 全宽布局：缩略图占满宽度，操作按钮在图片上方 */
.source-thumb-row--full {
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
}

.source-thumb {
  width: 40px;
  height: 40px;
  object-fit: cover;
  /* border-radius: 4px;
  border: 1px solid var(--border-default); */
}

/* 全宽模式下的缩略图：撑满宽度 + 保持比例 + 最大高度限制 */
.source-thumb-row--full .source-thumb {
  width: 100%;
  height: auto;
  min-height: 60px;
  max-height: 160px;
  object-fit: contain;
  object-position: center;
  cursor: pointer;
  /* border-radius: 6px;
  background: var(--bg-secondary);
  transition: box-shadow 0.15s; */
}

/* 可点击缩略图提示 */
.source-thumb--clickable {
  cursor: pointer;
}

/* 缩略图操作按钮行 */
.source-thumb-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

/* 全宽模式下的 placeholder */
.source-thumb-row--full .source-thumb-placeholder {
  width: 100%;
  height: 60px;
  max-height: 100px;
  border-radius: 6px;
}

.source-block-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.source-thumb-placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  font-size: 10px;
  font-weight: 500;
  color: var(--text-tertiary);
  background: var(--bg-secondary);
  border: 1px dashed var(--border-default);
  border-radius: 4px;
  text-align: center;
  line-height: 1.2;
  padding: 2px;
  box-sizing: border-box;
}

.source-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.source-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  background: #fff;
  color: var(--text-secondary);
  cursor: pointer;
  text-decoration: none;
  transition: all 0.15s;
  flex-shrink: 0;
}

.source-action-btn:hover {
  border-color: var(--c-blue-400);
  color: var(--c-blue-600);
  background: var(--c-blue-50);
}

.source-batch .batch-info {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  color: var(--c-green-700);
  background: var(--c-green-50);
  padding: 2px 8px;
  border-radius: 4px;
}

.acceptance-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 16px;
  background: var(--task-running-bg);
  color: var(--task-running-text);
  font-size: 13px;
  font-weight: 600;
}

.acceptance-badge.badge-success {
  background: var(--task-success-bg);
  color: var(--task-success-text);
}

.ab-pct {
  font-variant-numeric: tabular-nums;
}

/* ═══ 步骤进度条（连贯进度效果 · 卡片化升级版）═══ */
.step-progress-section {
  margin-top: 16px;
  margin-bottom: 8px;
}

.sp-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  font-size: 13px;
}

.sp-count {
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.2px;
}

.sp-current {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 9999px;
  background: rgba(59, 130, 246, 0.08);
  color: var(--c-blue-600, #2563eb);
  font-weight: 600;
}

.sp-current::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--c-blue-500, #3b82f6);
  animation: sp-current-blink 1.4s ease-in-out infinite;
}

@keyframes sp-current-blink {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.85); }
}

.sp-current--failed {
  background: rgba(239, 68, 68, 0.08);
  color: var(--task-failed-text, #dc2626);
}

.sp-current--failed::before {
  background: var(--task-failed, #ef4444);
  animation: none;
}

.sp-scroll-hint {
  margin-top: 10px;
  font-size: 11px;
  color: var(--text-tertiary);
  text-align: center;
  opacity: 0.75;
}

.step-progress-track {
  display: flex;
  align-items: flex-start;
  position: relative;
  padding: 13px 4px 4px;
  /* 节点已改为 flex:1 自适应均分，不再需要横向滚动 */
  overflow-x: hidden;
}

.step-progress-track::-webkit-scrollbar {
  height: 5px;
}

.step-progress-track::-webkit-scrollbar-thumb {
  background: var(--border-default);
  border-radius: 3px;
}

/* ══ 底层轨道（贯穿所有节点）══ */
.sp-track-bg {
  position: absolute;
  top: 26px; /* 对齐 sp-dot 中心：track padding + node padding + dot 半径 */
  left: 0;
  right: 0;
  width: 100%;
  height: 4px;
  background: var(--bg-secondary, #f1f5f9);
  border-radius: 2px;
  z-index: 0;
}

/* ══ 填充进度线（覆盖在轨道上）══ */
.sp-track-fill {
  position: absolute;
  top: 26px;
  left: 0;
  height: 4px;
  border-radius: 2px;
  z-index: 1;
  transition: width 0.55s cubic-bezier(0.22, 1, 0.36, 1);
  background: linear-gradient(90deg, var(--task-success, #22c55e) 0%, var(--c-blue-500, #3b82f6) 100%);
  box-shadow: 0 0 10px rgba(34, 197, 94, 0.2);
}

/* 有进行中步骤时，填充线末端用蓝色渐变+脉冲 */
.sp-track-fill::after {
  content: '';
  position: absolute;
  right: 2px;
  top: -4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--c-blue-500, #3b82f6);
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12), 0 0 14px rgba(59, 130, 246, 0.45);
  animation: sp-fill-glow 1.6s ease-in-out infinite;
}

@keyframes sp-fill-glow {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.55; transform: scale(1.35); }
}

/* 步骤节点（浮在进度线上） */
.sp-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  /* 自适应均分：不管 2 步还是 14 步，节点均匀分布填满轨道 */
  flex: 1 1 0;
  min-width: 0;
  padding: 4px 5px 6px;
  box-sizing: border-box;
  position: relative;
  z-index: 2;
  border-radius: 10px;
  cursor: pointer;
}

.sp-node:hover .sp-label {
  transform: scale(1.12);
}

/* 进行中：蓝底高亮，便于在长步骤条中快速定位（仅主当前步） */
.sp-node.active {
  /* background: linear-gradient(180deg, rgba(59, 130, 246, 0.08) 0%, rgba(59, 130, 246, 0.03) 100%);
  box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.22), 0 4px 14px rgba(59, 130, 246, 0.08); */
}

.sp-node.active:hover .sp-label {
  transform: scale(1.12);
}

/* 并行执行中：空心蓝环 + 极浅蓝底，区别于主当前步的实心蓝，避免一串相同蓝圈 */
.sp-node.parallel {
  background: rgba(59, 130, 246, 0.04);
}

.sp-node.parallel .sp-dot {
  background: var(--bg-card, #fff);
  border-color: var(--c-blue-400, #60a5fa);
  color: var(--c-blue-600, #2563eb);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.08);
}

/* 已跳过：虚线灰圈 + 删除线 */
.sp-node.skipped .sp-dot {
  background: transparent;
  border-style: dashed;
  color: var(--text-disabled, #bbb);
  border-color: var(--border-default);
}

.sp-node.skipped .sp-label {
  text-decoration: line-through;
}

.sp-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--border-default);
  background: var(--bg-card, #fff);
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 700;
  transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
  z-index: 1;
}

.sp-dot svg {
  width: 12px;
  height: 12px;
  color: inherit;
}

/* 已完成 */
.sp-node.completed .sp-dot {
  background: var(--task-success, #22c55e);
  border-color: var(--task-success, #22c55e);
  color: #fff;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.12);
}

/* 进行中 */
.sp-node.active .sp-dot {
  background: var(--c-blue-500, #3b82f6);
  border-color: var(--c-blue-500, #3b82f6);
  color: #fff;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12), 0 0 14px rgba(59, 130, 246, 0.3);
  animation: sp-pulse-ring 2s ease-in-out infinite;
}

@keyframes sp-pulse-ring {
  0%, 100% { box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12), 0 0 14px rgba(59, 130, 246, 0.3); }
  50% { box-shadow: 0 0 0 7px rgba(59, 130, 246, 0.06), 0 0 20px rgba(59, 130, 246, 0.22); }
}

.sp-pulse {
  animation: sp-dot-blink 1.2s ease-in-out infinite;
  font-size: 10px;
}

@keyframes sp-dot-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

/* 等待态 */
.sp-node.pending .sp-dot {
  background: var(--bg-disabled, #f1f1f1);
  color: var(--text-disabled, #bbb);
  border-color: var(--border-default);
}

/* 失败态 */
.sp-node.failed .sp-dot {
  background: var(--task-failed, #ef4444);
  border-color: var(--task-failed, #ef4444);
  color: #fff;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.12);
}

/* 标签文字 */
.sp-label {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.25;
  color: var(--text-primary);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  transition: transform 0.18s ease;
  transform-origin: center bottom;
}

.sp-label.text-muted {
  color: var(--text-tertiary);
  font-weight: 400;
}

.sp-status {
  font-size: 10px;
  font-weight: 500;
  color: var(--text-tertiary);
  padding: 2px 7px;
  border-radius: 9999px;
  background: transparent;
  white-space: nowrap;
  line-height: 1.2;
}

.sp-st-completed {
  color: var(--task-success-text, #16a34a);
  background: rgba(34, 197, 94, 0.09);
}

.sp-st-failed {
  color: var(--task-failed-text, #dc2626);
  background: rgba(239, 68, 68, 0.09);
  font-weight: 600;
}

.sp-st-skipped {
  color: var(--text-disabled, #999);
  background: rgba(0, 0, 0, 0.04);
}

.sp-st-active {
  color: var(--c-blue-600, #2563eb);
  background: rgba(59, 130, 246, 0.1);
  font-weight: 600;
}

.sp-st-parallel {
  color: var(--c-blue-600, #2563eb);
  background: rgba(59, 130, 246, 0.08);
}

.sp-st-pending {
  color: var(--text-tertiary);
  background: var(--bg-secondary);
}

.canvas-divider {
  height: 1px;
  background: var(--border-default);
  margin: 0;
}

.canvas-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
}

.ch-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.ch-name-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ch-name {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
}

.speed-pass-mark {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--c-green-50);
  color: var(--c-green-700);
  font-weight: 600;
}

.ch-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 24px;
  background: transparent;
}

.ch-tab {
  height: 40px;
  padding: 0 18px;
  display: flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  position: relative;
  border-bottom: 2px solid transparent;
  transition: all var(--transition-fast);
}

.ch-tab.active {
  color: var(--brand);
  font-weight: 600;
  border-bottom-color: var(--brand);
}

.ct-count {
  font-size: 10.5px;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--bg-secondary);
  color: var(--text-tertiary);
  font-weight: 600;
}

.ch-tab.active .ct-count {
  background: color-mix(in srgb, var(--brand) 12%, transparent);
  color: var(--brand);
}

/* 代码 tab 红点：有快照未查看时显示 */
.ct-unread-dot {
  position: absolute;
  top: 6px;
  right: 4px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ef4444;
  border: 1.5px solid var(--bg-card, #fff);
  animation: unread-pulse 2s ease-in-out infinite;
}
@keyframes unread-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}

.ct-hotkey {
  font-size: 10px;
  color: var(--text-tertiary);
  margin-left: 2px;
}

.timeline-body {
  padding: 24px 28px;
}

.step-item {
  display: flex;
  gap: 16px;
  position: relative;
  padding-bottom: 28px;
}

.step-item:last-child {
  padding-bottom: 0;
}

.step-item::before {
  content: '';
  position: absolute;
  left: 14px;
  top: 28px;
  bottom: 0;
  width: 2px;
  background: var(--border-default);
}

.step-item:last-child::before {
  display: none;
}

.step-item.completed::before {
  background: var(--task-success);
}

.step-item.active::before {
  background: linear-gradient(180deg, var(--task-running) 0%, var(--border-default) 100%);
}

.step-dot-wrap {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
}

.step-dot {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-dot);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--border-default);
  background: var(--bg-card);
  color: var(--text-tertiary);
  font-size: 13px;
  font-weight: 700;
  transition: all var(--transition-base);
}

.step-item.completed .step-dot {
  background: var(--task-success);
  border-color: var(--task-success);
  color: #fff;
}

.step-item.active .step-dot {
  background: var(--task-running-bg);
  border-color: var(--task-running);
  color: var(--task-running-text);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--task-running) 15%, transparent);
  animation: active-glow 2s ease-in-out infinite;
}

@keyframes active-glow {
  0%,
  100% {
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--task-running) 12%, transparent);
  }
  50% {
    box-shadow: 0 0 0 8px color-mix(in srgb, var(--task-running) 6%, transparent);
  }
}

.step-item.pending .step-dot {
  background: var(--bg-disabled);
  color: var(--text-disabled);
}

.step-dot svg {
  width: 14px;
  height: 14px;
}

.step-content {
  flex: 1;
  min-width: 0;
  padding-top: 3px;
}

.step-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.step-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.step-time {
  font-size: 12px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  font-family: 'JetBrains Mono', monospace;
}

.step-desc {
  font-size: 12.5px;
  color: var(--text-secondary);
  margin-top: 3px;
  line-height: 1.5;
}

.text-muted {
  color: var(--text-tertiary);
}

.expand-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--brand);
  cursor: pointer;
  font-weight: 500;
  border: none;
  background: none;
  padding: 2px 0;
  margin-top: 8px;
}

.expand-label {
  margin-left: 4px;
}

.expand-btn svg {
  width: 13px;
  height: 13px;
  transition: transform var(--transition-fast);
}

.expand-btn.expanded svg {
  transform: rotate(90deg);
}

.sub-steps {
  margin-top: 12px;
  padding-left: 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sub-step {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  background: var(--bg-secondary);
  border-radius: 4px;
  border-left: 3px solid transparent;
}

.sub-step.running {
  border-left-color: var(--task-running);
  background: color-mix(in srgb, var(--task-running) 4%, var(--bg-card));
}

.sub-step.done {
  border-left-color: var(--task-success);
}

.sub-step.error {
  border-left-color: var(--task-failed);
  background: color-mix(in srgb, var(--task-failed) 3%, var(--bg-card));
}

.ss-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-dot);
  flex-shrink: 0;
  margin-top: 5px;
  background: var(--text-tertiary);
}

.sub-step.running .ss-dot {
  background: var(--task-running);
  animation: pulse-dot 1.5s ease-in-out infinite;
}

.sub-step.done .ss-dot {
  background: var(--task-success);
}

.sub-step.error .ss-dot {
  background: var(--task-failed);
}

.ss-body {
  flex: 1;
  min-width: 0;
}

.ss-name {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-primary);
}

.ss-detail {
  font-size: 11.5px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.ss-time {
  font-size: 11.5px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  font-family: 'JetBrains Mono', monospace;
  margin-top: 2px;
}

/* ═══ 日志面板 — 代码编辑器风格 ═══ */
.log-panel {
  background: #1e1e1e;
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  overflow: hidden;
}

.log-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: #252526;
  border-bottom: 1px solid #3c3c3c;
}

.log-filter {
  display: flex;
  align-items: center;
  gap: 2px;
}

.log-filter-btn {
  height: 26px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  color: #9d9d9d;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.log-filter-btn:hover {
  color: #ddd;
  background: rgba(255,255,255,.08);
}

.log-filter-btn.active {
  color: #fff;
  background: rgba(255,255,255,.12);
  border-color: rgba(255,255,255,.15);
  font-weight: 600;
}

.log-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.log-tool-btn {
  width: 26px;
  height: 26px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  color: #9d9d9d;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  transition: all 0.15s ease;
}

.log-tool-btn:hover {
  color: #fff;
  background: rgba(255,255,255,.08);
}

.log-body {
  padding: 12px 16px;
  font-family: 'JetBrains Mono', 'SFMono-Regular', 'Consolas', 'Menlo', monospace;
  font-size: 11.8px;
  line-height: 1.7;
  color: #d4d4d4;
  max-height: 400px;
  overflow-y: auto;
  background: #1e1e1e;
  /* 自定义滚动条 */
  scrollbar-width: thin;
  scrollbar-color: #555 #1e1e1e;
}

.log-body::-webkit-scrollbar { width: 8px; }
.log-body::-webkit-scrollbar-track { background: #1e1e1e; }
.log-body::-webkit-scrollbar-thumb { background: #555; border-radius: 4px; }
.log-body::-webkit-scrollbar-thumb:hover { background: #666; }

.log-line {
  display: flex;
  gap: 10px;
  padding: 1px 0;
  border-radius: 2px;
  transition: background 0.1s ease;
}

.log-line:hover {
  background: rgba(255,255,255,.03);
}

.log-ts {
  color: #6a737d;
  flex-shrink: 0;
  user-select: none;
  opacity: 0.7;
  font-size: 10.5px;
}

/* 日志条目中的「当前模型」标签 [gpt-5.4] */
.log-model {
  color: #c792ea;
  background: rgba(199,146,234,.12);
  border: 1px solid rgba(199,146,234,.25);
  border-radius: 3px;
  padding: 0 4px;
  flex-shrink: 0;
  font-size: 10.5px;
  font-weight: 600;
  user-select: none;
}

/* 语法高亮色 — VS Code 风格 */
.log-lv-info {
  color: #3794ff;
  font-weight: 600;
}

.log-lv-warn {
  color: #cca700;
  font-weight: 600;
}

.log-lv-error {
  color: #f14c4c;
  font-weight: 600;
}

.log-lv-success {
  color: var(--c-green-600);
  font-weight: 600;
}

.log-msg {
  flex: 1;
  word-break: break-all;
}

.log-count {
  flex-shrink: 0;
  color: #6a737d;
  font-size: 10px;
  opacity: 0.7;
  user-select: none;
}

.log-empty-hint {
  text-align: center;
  padding: 40px;
  color: #6a737d;
  font-size: 12px;
}

.log-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  background: #252526;
  border-top: 1px solid #3c3c3c;
  font-size: 11px;
  color: #9d9d9d;
}

.log-footer-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.lf-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.lf-autoscroll {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
  color: #9d9d9d;
}

.lf-autoscroll input {
  cursor: pointer;
  accent-color: var(--c-blue-500, #3b82f6);
}

.lf-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-dot);
  background: #3794ff;
  animation: pulse-dot 2s ease-in-out infinite;
}

.kbd-hint {
  font-size: 10px;
  padding: 1px 5px;
  border: 1px solid #555;
  border-radius: 3px;
  background: #333;
  font-family: inherit;
}

.snapshot-code-panel {
  display: none;
  padding: 12px 16px 16px;
}

.snapshot-code-panel.visible { display: block; }

.snapshot-code-shell {
  display: grid;
  grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
  min-height: 460px;
  border: 1px solid var(--border-default, rgba(255,255,255,0.08));
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-card, rgba(255,255,255,0.03));
}

.snapshot-file-list {
  border-right: 1px solid var(--border-default, rgba(255,255,255,0.08));
  background: var(--bg-secondary, rgba(255,255,255,0.02));
  overflow-y: auto;
  scrollbar-width: thin;
  min-height: 460px;
  scrollbar-color: rgba(128,128,128,0.35) transparent;
}
.snapshot-file-list:hover { scrollbar-color: rgba(180,180,180,0.55) transparent; }

.snapshot-file-list::-webkit-scrollbar { width: 6px; }
.snapshot-file-list::-webkit-scrollbar-track { background: transparent; }
.snapshot-file-list::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.35); border-radius: 3px; }
.snapshot-file-list:hover::-webkit-scrollbar-thumb { background: rgba(180,180,180,0.55); }

.snapshot-file-header,
.snapshot-code-toolbar {
  min-height: 40px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  border-bottom: 1px solid var(--border-default, rgba(255,255,255,0.08));
  color: var(--text-secondary, #94a3b8);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
}
.snapshot-code-toolbar .snapshot-state,
.snapshot-code-toolbar .snapshot-tool-btn {
  margin-left: auto;
}
.snapshot-code-toolbar .snapshot-tool-btn {
  margin-left: 8px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border: 1px solid var(--border-default, rgba(255,255,255,0.12));
  border-radius: 6px;
  background: var(--bg-secondary, rgba(255,255,255,0.04));
  color: var(--text-primary, #e2e8f0);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.snapshot-code-toolbar .snapshot-tool-btn:hover {
  background: rgba(59, 130, 246, 0.12);
  border-color: var(--c-blue-500, #3b82f6);
  color: var(--c-blue-300, #93c5fd);
}
.snapshot-code-toolbar .snapshot-tool-btn svg { flex: 0 0 auto; }

.snapshot-file-item {
  width: 100%;
  min-height: 36px;
  padding: 8px 12px;
  border: 0;
  background: transparent;
  color: var(--text-primary, #e2e8f0);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}

.snapshot-file-item:hover { background: rgba(255, 255, 255, 0.05); }
.snapshot-file-item.active {
  background: rgba(59, 130, 246, 0.12);
  color: var(--c-blue-300, #93c5fd);
}
.snapshot-file-item.active small { color: var(--c-blue-400, #60a5fa); }
.snapshot-file-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; }
.snapshot-file-item small { color: var(--text-tertiary, #64748b); white-space: nowrap; font-size: 11px; font-variant-numeric: tabular-nums; }

/* 候选文件层级树：文件夹行 + 箭头 + 文件夹图标 */
.snapshot-folder-item {
  justify-content: flex-start;
  gap: 6px;
  color: var(--text-secondary, #94a3b8);
}
.snapshot-folder-item:hover { background: rgba(255, 255, 255, 0.04); }
.snapshot-folder-item .snapshot-file-name { font-weight: 500; }
.snapshot-folder-arrow {
  flex: 0 0 auto;
  width: 12px;
  height: 12px;
  color: var(--text-tertiary, #64748b);
  transform: rotate(90deg);
  transition: transform 0.15s ease;
}
.snapshot-folder-arrow.collapsed { transform: rotate(0deg); }
.snapshot-folder-icon {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  color: var(--c-amber-400, #fbbf24);
  opacity: 0.9;
}

/* ── 失败任务：文件列表顶部的问题文件摘要条 ── */
.snapshot-failed-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  margin: 0 6px 4px;
  border-radius: 6px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
}
.sfs-info {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sfs-text {
  font-size: 11px;
  color: #f87171;
  font-weight: 500;
}
.sfs-locate-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 4px;
  background: rgba(239, 68, 68, 0.1);
  color: #f87171;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}
.sfs-locate-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
}

/* ── 逐文件问题清单（点击直达行列） ── */
.snapshot-issue-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0 6px 6px;
  max-height: 168px;
  overflow-y: auto;
}
.sil-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: rgba(239, 68, 68, 0.05);
  color: var(--text-secondary, #94a3b8);
  font-size: 11px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
}
.sil-item:hover {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.35);
  color: var(--text-primary, #e2e8f0);
}
.sil-item.active {
  background: rgba(239, 68, 68, 0.18);
  border-color: rgba(239, 68, 68, 0.5);
}
.sil-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.sil-badge {
  flex: 0 0 auto;
  min-width: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: rgba(239, 68, 68, 0.25);
  color: #fca5a5;
  font-size: 10px;
  font-weight: 600;
  text-align: center;
  line-height: 16px;
}

/* ── 半成品：缺失关键文件清单（partial 快照） ── */
.snapshot-missing-summary {
  padding: 6px 10px;
  margin: 0 6px 4px;
  border-radius: 6px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.2);
}
.sms-info {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sms-text {
  font-size: 11px;
  color: #fbbf24;
  font-weight: 500;
}

/* ── 代码视图：文件级错误摘要条 ── */
.snapshot-file-error-bar {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(239, 68, 68, 0.15);
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.06) 0%, rgba(239, 68, 68, 0.02) 100%);
}
.sfeb-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.sfeb-title {
  font-size: 12px;
  font-weight: 600;
  color: #f87171;
}
.sfeb-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 8px;
  max-height: 72px;
  overflow-y: auto;
}
.sfeb-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 11px;
  line-height: 1.4;
}
.sfeb-time {
  flex-shrink: 0;
  color: var(--text-tertiary, #64748b);
  font-family: ui-monospace, monospace;
  font-size: 10px;
}
.sfeb-msg {
  color: var(--text-secondary, #94a3b8);
  word-break: break-all;
}
.sfeb-footer {
  display: flex;
  align-items: center;
  gap: 12px;
}
.sfeb-copy-btn,
.sfeb-jump-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 4px;
  background: transparent;
  color: var(--text-tertiary, #64748b);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}
.sfeb-copy-btn:hover,
.sfeb-jump-btn:hover {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.4);
  color: #f87171;
}

/* ── 结构化诊断明细：错误码 + 行列 + 代码片段 + 建议 ── */
.sfeb-list--rich {
  max-height: 260px;
  gap: 6px;
}
.sfeb-issue {
  padding: 6px 8px;
  border-left: 2px solid rgba(239, 68, 68, 0.5);
  border-radius: 0 4px 4px 0;
  background: rgba(239, 68, 68, 0.05);
}
.sfeb-issue.is-warn { border-left-color: rgba(245, 158, 11, 0.6); background: rgba(245, 158, 11, 0.05); }
.sfeb-issue.is-info { border-left-color: rgba(148, 163, 184, 0.5); background: rgba(148, 163, 184, 0.05); }
.sfeb-issue-loc {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  margin-bottom: 3px;
  border: 0;
  background: transparent;
  cursor: pointer;
  font-size: 10px;
}
.sfeb-code {
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 600;
}
.sfeb-pos {
  color: var(--text-tertiary, #64748b);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.sfeb-issue-loc:hover .sfeb-pos { color: #93c5fd; }
.sfeb-snippet {
  margin: 4px 0 0;
  padding: 6px 8px;
  border-radius: 4px;
  background: #0d1117;
  overflow-x: auto;
  max-height: 108px;
}
.sfeb-snippet code { display: block; background: transparent; padding: 0; font-size: 11px; }
.sfeb-snippet-line {
  display: block;
  color: var(--text-tertiary, #64748b);
  white-space: pre;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  line-height: 1.5;
}
.sfeb-snippet-line.is-current {
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.12);
  font-weight: 600;
}
/* 行号列：让用户能把「issue.line」与源码行一一对上，而不是只看高亮猜位置 */
.sfeb-snippet-no {
  display: inline-block;
  min-width: 26px;
  margin-right: 8px;
  text-align: right;
  font-style: normal;
  color: #4b5563;
  user-select: none;
}
.sfeb-snippet-line.is-current .sfeb-snippet-no { color: #f87171; }
.sfeb-hint {
  margin-top: 4px;
  color: #fbbf24;
  font-size: 11px;
  line-height: 1.5;
}

/* ── 代码编辑区（手改产物） ── */
.snapshot-code-editor {
  flex: 1;
  min-height: 400px;
  display: flex;
  flex-direction: column;
  background: #0d1117;
}
.snapshot-code-textarea {
  flex: 1;
  min-height: 360px;
  width: 100%;
  padding: 16px 18px;
  border: 0;
  outline: none;
  resize: none;
  background: #0d1117;
  color: #e6edf3;
  font: 12.5px/1.7 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  tab-size: 2;
  white-space: pre;
}
.sce-hint {
  flex: 0 0 auto;
  padding: 8px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(59, 130, 246, 0.06);
  color: var(--text-secondary, #94a3b8);
  font-size: 11px;
}
.snapshot-tool-btn.is-primary {
  border-color: var(--c-blue-500, #3b82f6);
  background: rgba(59, 130, 246, 0.16);
  color: var(--c-blue-300, #93c5fd);
}
.snapshot-tool-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ── 出错行高亮 ── */
.snapshot-code-body {
  position: relative;
  flex: 1;
  min-width: 0;
}
.snapshot-issue-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 21.25px;
  background: rgba(239, 68, 68, 0.16);
  border-left: 2px solid #ef4444;
  pointer-events: none;
  z-index: 0;
}
.snapshot-code-body .snapshot-code-content { position: relative; z-index: 1; }
.snapshot-line-gutter span.is-issue-line {
  color: #fca5a5;
  font-weight: 700;
  background: rgba(239, 68, 68, 0.18);
}

/* ── 预览来源 / 操作按钮 ── */
.bf-source {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-tertiary, #94a3b8);
  font-size: 11px;
  white-space: nowrap;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bf-action-btn {
  flex: 0 0 auto;
  padding: 2px 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary, #94a3b8);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}
.bf-action-btn:hover {
  background: rgba(59, 130, 246, 0.14);
  border-color: var(--c-blue-500, #3b82f6);
  color: var(--c-blue-300, #93c5fd);
}
.bf-action-btn:disabled { opacity: 0.45; cursor: not-allowed; }

/* ── 失败卡片：逐文件问题清单 + 强制预览 ── */
.fgc-issues {
  width: 100%;
  max-width: 560px;
  margin: 4px auto 12px;
  padding: 10px 12px;
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.05);
  text-align: left;
}
.fgc-issues-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  color: #f87171;
  font-size: 12px;
  font-weight: 600;
}
.fgc-issues-locate {
  margin-left: auto;
  padding: 2px 8px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 4px;
  background: transparent;
  color: #f87171;
  font-size: 11px;
  cursor: pointer;
}
.fgc-issues-locate:hover { background: rgba(239, 68, 68, 0.14); }
.fgc-issue-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  padding: 4px 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary, #94a3b8);
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}
.fgc-issue-item:hover { background: rgba(239, 68, 68, 0.1); color: var(--text-primary, #e2e8f0); }
.fgc-issue-code {
  flex: 0 0 auto;
  color: #fca5a5;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 600;
}
.fgc-issue-pos {
  flex: 0 0 auto;
  color: var(--text-tertiary, #64748b);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.fgc-issue-msg { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fgc-issues-more { margin-top: 4px; color: var(--text-tertiary, #64748b); font-size: 11px; }
.fgc-btn-force-preview { border-color: rgba(59, 130, 246, 0.5); color: var(--c-blue-300, #93c5fd); }

/* 阶段状态条（面板顶部，全宽展示） */
.snapshot-phase-bar {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--border-default, rgba(255,255,255,0.08));
  background: rgba(59, 130, 246, 0.06);
  font-size: 12px;
  color: var(--text-secondary, #94a3b8);
}
.snapshot-phase-bar .phase-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}
.snapshot-phase-bar .phase-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-tertiary, #64748b);
}
.snapshot-phase-bar .phase-dot.is-modeling,
.snapshot-phase-bar .phase-dot.is-writing,
.snapshot-phase-bar .phase-dot.is-parsing,
.snapshot-phase-bar .phase-dot.is-working {
  background: var(--c-blue-400, #60a5fa);
  animation: phase-pulse 1.2s ease-in-out infinite;
}
.snapshot-phase-bar .phase-dot.is-validating { background: var(--c-amber-400, #fbbf24); animation: phase-pulse 1.2s ease-in-out infinite; }
.snapshot-phase-bar .phase-dot.is-completed,
.snapshot-phase-bar .phase-dot.is-passed { background: var(--c-green-400, #4ade80); }
.snapshot-phase-bar .phase-dot.is-failed { background: var(--c-red-400, #f87171); }

/* 文件生命周期：阶段摘要条（侧栏内，保留兼容） */
.snapshot-file-phase {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-default, rgba(255,255,255,0.08));
  background: rgba(59, 130, 246, 0.06);
  font-size: 11.5px;
  color: var(--text-secondary, #94a3b8);
}
.snapshot-file-phase .phase-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}
.snapshot-file-phase .phase-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-tertiary, #64748b);
}
.snapshot-file-phase .phase-dot.is-modeling,
.snapshot-file-phase .phase-dot.is-writing,
.snapshot-file-phase .phase-dot.is-parsing,
.snapshot-file-phase .phase-dot.is-working {
  background: var(--c-blue-400, #60a5fa);
  animation: phase-pulse 1.2s ease-in-out infinite;
}
.snapshot-file-phase .phase-dot.is-validating { background: var(--c-amber-400, #fbbf24); animation: phase-pulse 1.2s ease-in-out infinite; }
.snapshot-file-phase .phase-dot.is-completed,
.snapshot-file-phase .phase-dot.is-passed { background: var(--c-green-400, #4ade80); }
.snapshot-file-phase .phase-dot.is-failed { background: var(--c-red-400, #f87171); }
@keyframes phase-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(96, 165, 250, 0.5); }
  50% { opacity: 0.4; box-shadow: 0 0 0 4px rgba(96, 165, 250, 0); }
}

/* 文件生命周期：单文件状态点（覆盖 .snapshot-file-item span 的 ellipsis 默认） */
.snapshot-file-state {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  overflow: visible !important;
  text-overflow: clip !important;
  white-space: normal !important;
  background: var(--text-tertiary, #475569);
}
.snapshot-file-state.is-writing,
.snapshot-file-state.is-parsing,
.snapshot-file-state.is-modeling,
.snapshot-file-state.is-working {
  background: var(--c-blue-400, #60a5fa);
  animation: file-writing-pulse 1s ease-in-out infinite;
}
.snapshot-file-state.is-modified { background: var(--c-amber-400, #fbbf24); }
.snapshot-file-state.is-validating { background: var(--c-amber-400, #fbbf24); animation: file-writing-pulse 1s ease-in-out infinite; }
.snapshot-file-state.is-passed { background: var(--c-green-400, #4ade80); }
.snapshot-file-state.is-failed { background: var(--c-red-400, #f87171); }
.snapshot-file-state.is-unchanged { background: var(--text-tertiary, #475569); }
@keyframes file-writing-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.snapshot-file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 二进制预览：图片直接渲染，字体/其他二进制显示提示 */
.snapshot-image-wrap {
  flex: 1;
  min-height: 400px;
  max-height: 620px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: repeating-conic-gradient(#1e2530 0% 25%, #181d26 0 50%) 0 / 24px 24px;
  overflow: auto;
}
.snapshot-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
  image-rendering: -webkit-optimize-contrast;
}

.snapshot-code-view { min-width: 0; display: flex; flex-direction: column; }
.snapshot-state {
  padding: 2px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.snapshot-state.is-last-good {
  color: var(--c-green-400, #4ade80);
  background: rgba(34, 197, 94, 0.1);
}
.snapshot-state.is-rejected {
  color: var(--c-red-400, #f87171);
  background: rgba(239, 68, 68, 0.1);
}
.snapshot-code-scroll {
  flex: 1;
  min-height: 400px;
  margin: 0;
  overflow: visible;
  background: #0d1117;
  font: 12.5px/1.7 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  tab-size: 2;
  white-space: pre;
  display: flex;
  flex-direction: row;
}
/* 行号槽：与代码同 font/line-height，顶部 padding 与代码对齐，随外层容器一起滚动 */
.snapshot-line-gutter {
  flex-shrink: 0;
  position: sticky;
  left: 0;
  z-index: 1;
  padding: 16px 10px 16px 14px;
  text-align: right;
  user-select: none;
  color: rgba(255, 255, 255, 0.28);
  font: 12.5px/1.7 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  background: #0d1117;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}
.snapshot-line-gutter span {
  display: block;
  min-width: 28px;
}
/* 让 hljs github-dark 主题接管配色，容器只负责背景与滚动 */
.snapshot-code-content {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 16px 18px;
  background: transparent;
  font: inherit;
  white-space: pre;
}
.snapshot-code-content .hljs {
  background: transparent;
  padding: 0;
  font: inherit;
  white-space: pre;
}
.snapshot-code-empty {
  min-height: 240px;
  display: grid;
  place-items: center;
  padding: 28px;
  color: var(--text-tertiary, #64748b);
  text-align: center;
  font-size: 13px;
}
.snapshot-code-empty.is-error { color: var(--c-red-400, #f87171); }
.ct-count {
  margin-left: 5px;
  padding: 0 5px;
  border-radius: 8px;
  background: var(--bg-secondary, #f1f5f9);
  color: var(--text-secondary, #64748b);
  font-size: 10px;
}

.stats-panel {
  display: none;
  padding: 20px 24px;
}

.stats-panel.visible {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
}

/* ══ 统计卡片 — 现代重设计 ══ */
.stat-card {
  position: relative;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-default, #e5e7eb);
  border-radius: 12px;
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: row;
  transition: all .22s cubic-bezier(.4,0,.2,1);
}
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,.08), 0 2px 6px rgba(0,0,0,.04);
}

/* 左侧彩色竖条 */
.stat-accent {
  width: 4px;
  flex-shrink: 0;
  border-radius: 0 2px 2px 0;
}

/* 卡片主体：图标 + 数据左对齐 */
.stat-body {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 18px;
}

.stat-icon {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.stat-icon svg {
  width: 24px;
  height: 24px;
}

.stat-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.stat-num {
  font-size: 20px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.stat-label {
  font-size: 12.5px;
  color: var(--text-tertiary, #9ca3af);
  line-height: 1.3;
}

/* ── 蓝色卡片：组件数 ── */
.stat-card--blue { background: linear-gradient(135deg, #eff6ff 0%, #fff 60%); border-color: #bfdbfe; }
.stat-card--blue .stat-accent { background: linear-gradient(180deg, #3b82f6, #2563eb); }
.stat-card--blue .stat-icon { background: #dbeafe; color: #2563eb; }
.stat-card--blue .stat-num { color: #1d4ed8; }
.stat-card--blue:hover { box-shadow: 0 8px 24px rgba(37,99,235,.14), 0 2px 6px rgba(37,99,235,.08); }

/* ── 绿色卡片：文件数 ── */
.stat-card--green { background: linear-gradient(135deg, #f0fdf4 0%, #fff 60%); border-color: #bbf7d0; }
.stat-card--green .stat-accent { background: linear-gradient(180deg, #22c55e, #16a34a); }
.stat-card--green .stat-icon { background: #dcfce7; color: #16a34a; }
.stat-card--green .stat-num { color: #15803d; }
.stat-card--green:hover { box-shadow: 0 8px 24px rgba(22,163,74,.14), 0 2px 6px rgba(22,163,74,.08); }

/* ── 橙色卡片：已用时间 ── */
.stat-card--orange { background: linear-gradient(135deg, #fff7ed 0%, #fff 60%); border-color: #fed7aa; }
.stat-card--orange .stat-accent { background: linear-gradient(180deg, #f97316, #ea580c); }
.stat-card--orange .stat-icon { background: #ffedd5; color: #ea580c; }
.stat-card--orange .stat-num { color: #c2410c; }
.stat-card--orange:hover { box-shadow: 0 8px 24px rgba(234,88,12,.14), 0 2px 6px rgba(234,88,12,.08); }

/* ── 紫色卡片：预计剩余 ── */
.stat-card--purple { background: linear-gradient(135deg, #faf5ff 0%, #fff 60%); border-color: #e9d5ff; }
.stat-card--purple .stat-accent { background: linear-gradient(180deg, #a855f7, #9333ea); }
.stat-card--purple .stat-icon { background: #f3e8ff; color: #9333ea; }
.stat-card--purple .stat-num { color: #7e22ce; }
.stat-card--purple:hover { box-shadow: 0 8px 24px rgba(147,51,234,.14), 0 2px 6px rgba(147,51,234,.08); }

/* ── 青色卡片：代码行数 ── */
.stat-card--cyan { background: linear-gradient(135deg, #ecfeff 0%, #fff 60%); border-color: #a5f3fc; }
.stat-card--cyan .stat-accent { background: linear-gradient(180deg, #06b6d4, #0891b2); }
.stat-card--cyan .stat-icon { background: #cffafe; color: #0891b2; }
.stat-card--cyan .stat-num { color: #0e7490; }
.stat-card--cyan:hover { box-shadow: 0 8px 24px rgba(8,145,178,.14), 0 2px 6px rgba(8,145,178,.08); }

.preview-panel {
  display: none;
  padding: 16px;
}

.preview-panel.visible {
  display: block;
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
}

.preview-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  row-gap: 8px;
  font-size: 12.5px;
  color: var(--text-tertiary);
  margin-bottom: 12px;
}

.ph-ic {
  color: var(--brand);
  display: flex;
}

/* ── 预览面板类型切换器 ──────────────────────────────────
 * 放在提示行最右侧，选中值通过 postMessage 下发给预览 iframe。
 * 视觉上保持「提示行的一部分」的轻量感：不做主操作级别的实心按钮。 */
.ph-panel-type {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.ph-pt-label {
  color: var(--text-tertiary);
  white-space: nowrap;
}

.ph-pt-select {
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.ph-pt-select:hover {
  border-color: var(--brand);
  color: var(--text-primary);
}

.ph-pt-select:focus {
  outline: none;
  border-color: var(--brand);
}

.browser-frame {
  border: 1px solid var(--border-default);
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
}

.bf-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 38px;
  padding: 0 14px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-default);
}

.bf-dots {
  display: flex;
  gap: 6px;
}

.bf-dots i {
  width: 9px;
  height: 9px;
  border-radius: var(--radius-dot);
  display: block;
}

.bf-dots i:nth-child(1) {
  background: #ff5f57;
}

.bf-dots i:nth-child(2) {
  background: #febc2e;
}

.bf-dots i:nth-child(3) {
  background: #28c840;
}

.bf-url {
  flex: 1;
  height: 22px;
  border-radius: 4px;
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  display: flex;
  align-items: center;
  padding: 0 10px;
  font-size: 11px;
  color: var(--text-tertiary);
  font-family: 'JetBrains Mono', monospace;
}

/* 全屏预览按钮 */
.bf-fullscreen-btn {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  padding: 0;
}
.bf-fullscreen-btn:hover {
  color: var(--text-primary);
  border-color: var(--border-strong);
  background: var(--bg-hover);
}

.bf-body {
  padding: 20px;
  background: var(--bg-page);
  min-height: 300px;
  position: relative;
}

.sk-line {
  height: 12px;
  border-radius: 4px;
  background: var(--bg-secondary);
  position: relative;
  overflow: hidden;
}

.sk-block {
  border-radius: 4px;
  background: var(--bg-secondary);
  position: relative;
  overflow: hidden;
}

.sk-line::after,
.sk-block::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.55), transparent);
  animation: sk-shimmer 1.4s ease-in-out infinite;
}

@keyframes sk-shimmer {
  100% {
    transform: translateX(100%);
  }
}

.sk-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.sk-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  background: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(1px);
}

.sk-spinner {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-dot);
  border: 3px solid var(--bg-secondary);
  border-top-color: var(--task-running);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.sk-overlay-text {
  font-size: 12px;
  color: var(--task-running-text);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.preview-scale-stage {
  position: relative;
  flex: 0 0 auto;
  overflow: hidden;
}

.preview-iframe {
  border: none;
  border-radius: 0 0 4px 4px;
}

.preview-scale-stage {
  position: relative;
}

.preview-iframe-buffered {
  position: relative;
  z-index: 1;
}

.preview-iframe-buffered.is-pending {
  position: absolute;
  inset: 0;
  z-index: 0;
  visibility: hidden;
  pointer-events: none;
}

.bf-body-real {
  position: relative;
  padding: 0;
  min-height: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow: hidden;
}

.bf-body-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 13px;
}

.preview-unavailable {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  color: var(--text-tertiary);
  font-size: 13px;
}

.delivery-panel {
  display: none;
  padding: 10px 24px;
  background: var(--c-green-50);
  border-bottom: 1px solid var(--border-default);
}

.delivery-panel.visible {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.delivery-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.delivery-icon {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-dot);
  background: var(--task-success);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
  flex-shrink: 0;
}

/* 门禁未通过的草稿态：警示黄，与 ✓ 成功绿区分 */
.delivery-icon-warn {
  background: #faad14;
}

.delivery-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--task-success-text);
}

.delivery-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.delivery-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 0;
}

/* Playground — GradientButton 尺寸适配 canvas-header */
.btn-playground-gradient {
  min-height: 28px !important;
  min-width: auto !important;
  padding: 0 13px !important;
  font-size: 11.5px !important;
}

/* 收紧彩虹渐变溢出范围（默认 inset -200% 太宽） */
.btn-playground-gradient::before {
  inset: -30% !important;
}

.btn-delivery {
  height: 32px;
  padding: 0 18px;
  border: 0.5px solid var(--button-secondary-border);
  border-radius: var(--radius-full);
  background: var(--button-secondary-bg);
  color: var(--button-secondary-text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: border-color 0.18s ease, color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}

.btn-delivery:hover {
  border-color: var(--brand);
  background: var(--button-secondary-bg-hover);
  color: var(--brand);
}

.btn-delivery:active {
  border-color: var(--brand-active);
  background: var(--brand-bg-active);
  color: var(--brand-active);
}

.btn-delivery-primary {
  background: var(--brand-cta);
  border-color: var(--brand-cta);
  color: #fff;
}

.btn-delivery-primary:hover {
  background: var(--brand-cta-hover);
  border-color: var(--brand-cta-hover);
  color: #fff;
}

.btn-delivery-primary:active {
  filter: brightness(0.92);
}

.btn-delivery-warning {
  background: var(--c-amber-500, #f59e0b);
  border-color: var(--c-amber-500, #f59e0b);
  color: #fff;
}

.btn-delivery-warning:hover {
  background: var(--c-amber-600, #d97706);
  border-color: var(--c-amber-600, #d97706);
  color: #fff;
}

.btn-delivery-warning:active {
  filter: brightness(0.92);
}

.btn-delivery-warning:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 🛡️ 2026-09-03：撤回对接（危险红，区分于常规操作） */
.btn-delivery-danger {
  background: var(--c-red-500, #e5484d);
  border-color: var(--c-red-500, #e5484d);
  color: #fff;
}

.btn-delivery-danger:hover {
  background: var(--c-red-600, #dc3d43);
  border-color: var(--c-red-600, #dc3d43);
  color: #fff;
}

.btn-delivery-danger:active {
  filter: brightness(0.92);
}

.btn-delivery-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 推送到公共组件池（琥珀色主操作，与 GitLab 推送同档位）；
   已入池态转中性灰绿示意「可下架」 */
.btn-delivery-pool--public {
  border-style: dashed;
  opacity: 0.85;
}

.btn-delivery-pool--public:hover {
  border-color: var(--c-amber-500, #f59e0b);
  color: var(--c-amber-500, #f59e0b);
  background: transparent;
}

.canvas-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 12px 24px;
  gap: 8px;
  border-top: 1px solid var(--border-default);
  background: var(--bg-hover);
}

.canvas-actions-end {
  margin-left: auto;
}

.btn-review {
  height: 32px;
  padding: 0 16px;
  border: none;
  border-radius: 4px;
  background: var(--brand);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-retry {
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.btn-upgrade {
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--c-orange-300);
  border-radius: 4px;
  background: var(--c-orange-50);
  color: var(--c-orange-600);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.btn-cancel-op {
  height: 30px;
  padding: 0 14px;
  border: 1px solid var(--c-red-300);
  border-radius: 4px;
  background: var(--c-red-50);
  color: var(--c-red-600);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.waiting-text {
  font-size: 12px;
  color: var(--text-tertiary);
  font-style: italic;
}

.reviewed-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 10px;
  background: var(--c-green-50);
  color: var(--c-green-700);
  font-size: 11.5px;
  font-weight: 600;
}

.btn-delete-task {
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--c-red-300);
  border-radius: 4px;
  background: var(--c-red-50);
  color: var(--c-red-600);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.modal-box {
  background: var(--bg-card);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  padding: 24px;
  width: 90%;
  max-width: 520px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 16px;
}

.modal-task-info {
  background: var(--bg-secondary);
  border-radius: 4px;
  padding: 12px 16px;
  margin-bottom: 20px;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}

.info-label {
  font-size: 12px;
  color: var(--text-tertiary);
}

.review-action-group {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.review-radio {
  flex: 1;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border: 2px solid var(--border-default);
  border-radius: 4px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.radio-label:hover {
  border-color: var(--brand);
}

input[type='radio']:checked + .radio-label {
  border-color: var(--brand);
  background: color-mix(in srgb, var(--brand) 5%, transparent);
}

.radio-desc {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.review-reason-group {
  margin-bottom: 20px;
}

.reason-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.optional {
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 400;
  margin-left: 4px;
}

.reason-textarea {
  width: 100%;
  min-height: 80px;
  padding: 10px 12px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
}

.reason-textarea:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 10%, transparent);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn-modal-cancel {
  height: 36px;
  padding: 0 18px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  background: var(--bg-card);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.btn-modal-confirm {
  height: 36px;
  padding: 0 18px;
  border: none;
  border-radius: 4px;
  background: var(--brand);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn-modal-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-menu-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.action-menu-link:hover {
  background: var(--bg-hover);
}

.action-menu-link.danger {
  color: var(--c-red-600);
}

/* 深色主题适配 — 日志面板已是暗底，仅需微调 */
[data-theme='dark'] .log-panel {
  background: #181818;
}

[data-theme='dark'] .log-toolbar {
  background: #1f1f1f;
  border-color: #333;
}

[data-theme='dark'] .log-body {
  color: #d4d4d4;
  background: #181818;
}

[data-theme='dark'] .log-footer {
  background: #1f1f1f;
  border-color: #333;
}

[data-theme='dark'] .log-lv-error {
  color: var(--c-red-400);
}

[data-theme='dark'] .log-lv-success {
  color: var(--c-green-400);
}

[data-theme='dark'] .sk-line::after,
[data-theme='dark'] .sk-block::after {
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08), transparent);
}

[data-theme='dark'] .sk-overlay {
  background: rgba(10, 16, 28, 0.45);
}

[data-theme='dark'] .delivery-panel {
  background: rgba(34, 197, 94, 0.08);
}

/* ══ 统计卡片 — 暗色 ══ */
[data-theme='dark'] .stat-card--blue { background: linear-gradient(135deg, rgba(37,99,235,.08) 0%, #1c2128 60%); border-color: #1e3a5f; }
[data-theme='dark'] .stat-card--blue .stat-icon { background: rgba(37,99,235,.15); color: #60a5fa; }
[data-theme='dark'] .stat-card--blue .stat-num { color: #93bbfd; }

[data-theme='dark'] .stat-card--green { background: linear-gradient(135deg, rgba(22,163,74,.08) 0%, #1c2128 60%); border-color: #14532d; }
[data-theme='dark'] .stat-card--green .stat-icon { background: rgba(22,163,74,.15); color: #4ade80; }
[data-theme='dark'] .stat-card--green .stat-num { color: #86efac; }

[data-theme='dark'] .stat-card--orange { background: linear-gradient(135deg, rgba(234,88,12,.08) 0%, #1c2128 60%); border-color: #431407; }
[data-theme='dark'] .stat-card--orange .stat-icon { background: rgba(234,88,12,.15); color: #fb923c; }
[data-theme='dark'] .stat-card--orange .stat-num { color: #fdba74; }

[data-theme='dark'] .stat-card--purple { background: linear-gradient(135deg, rgba(147,51,234,.08) 0%, #1c2128 60%); border-color: #2e1065; }
[data-theme='dark'] .stat-card--purple .stat-icon { background: rgba(147,51,234,.15); color: #c084fc; }
[data-theme='dark'] .stat-card--purple .stat-num { color: #d8b4fe; }

[data-theme='dark'] .footer-bar {
  background: var(--bg-alt);
}

[data-theme='dark'] .seg-control {
  background: #232936;
}

[data-theme='dark'] .source-tabs {
  background: #232936;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition: none !important;
    animation: none !important;
  }
}

@media (max-width: 900px) {
  .detail-body {
    grid-template-columns: 1fr;
  }
  .sidebar {
    display: none;
  }
}

/* ═══ 来源图片放大弹窗 ══ */
.source-preview-modal {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.source-preview-modal__content {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  background: var(--bg-card, #fff);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.source-preview-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-default);
  background: var(--bg-card, #fff);
}

.source-preview-modal__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.source-preview-modal__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.source-preview-modal__close:hover {
  background: var(--c-red-50);
  border-color: var(--c-red-400);
  color: var(--c-red-600);
}

.source-preview-modal__img {
  display: block;
  max-width: 90vw;
  max-height: 80vh;
  width: auto;
  height: auto;
  object-fit: contain;
  background: var(--bg-secondary);
}

/* ═══ 失败任务：概览区错误摘要卡片 ═══ */
.failure-summary-card {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding: 12px 16px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(239, 68, 68, 0.04) 100%);
  border: 1px solid rgba(239, 68, 68, 0.25);
}

.fsc-icon {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.12);
}

.fsc-content {
  flex: 1;
  min-width: 0;
}

.fsc-title {
  font-size: 13px;
  font-weight: 600;
  color: #dc2626;
  margin-bottom: 2px;
}

.fsc-message {
  font-size: 12px;
  color: var(--text-secondary, #64748b);
  line-height: 1.5;
  word-break: break-word;
}

.fsc-retry-btn {
  margin-top: 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  color: #fff;
  background: linear-gradient(135deg, #f97316, #ef4444);
  border: none;
  border-radius: 999px;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.fsc-retry-btn:hover { opacity: 0.92; }
.fsc-retry-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* ═══ 失败任务：预览区引导卡片 ═══ */
.bf-body-failed {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  min-height: 320px;
}

.failed-guide-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 480px;
  padding: 24px;
  border-radius: 16px;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-default, rgba(0, 0, 0, 0.08));
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
}

.fgc-icon {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(245, 158, 11, 0.1);
}

.fgc-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #1e293b);
  margin: 0 0 8px 0;
  line-height: 1.4;
}

.fgc-reason {
  font-size: 13px;
  color: var(--text-secondary, #64748b);
  margin: 0 0 20px 0;
  line-height: 1.5;
  word-break: break-word;
}

.fgc-reason-label {
  color: var(--text-tertiary, #94a3b8);
  font-weight: 500;
}

.fgc-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 16px;
}

.fgc-btn-primary {
  display: inline-flex;
  align-items: center;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.fgc-btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border: 1px solid var(--border-default, rgba(0, 0, 0, 0.12));
  border-radius: 8px;
  background: var(--bg-card, #fff);
  color: var(--text-primary, #1e293b);
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.15s;
}

.fgc-btn-secondary:hover:not(:disabled) {
  background: var(--bg-secondary, #f8fafc);
  border-color: var(--border-hover, rgba(0, 0, 0, 0.2));
}

.fgc-btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.fgc-hint {
  font-size: 12px;
  color: var(--text-tertiary, #94a3b8);
  margin: 0;
  line-height: 1.5;
}

/* 失败诊断标签 */
.fgc-diagnosis {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
  margin-bottom: 12px;
  background: var(--bg-card, #fff);
}

.fgc-diag-icon {
  font-size: 14px;
}

.fgc-diag-type {
  font-weight: 600;
  color: var(--text-primary, #1e293b);
}

.fgc-diag-sep {
  color: var(--text-tertiary, #94a3b8);
}

.fgc-diag-hint {
  color: var(--text-secondary, #475569);
}

/* 推荐徽章 */
.fgc-rec-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--c-green-500, #22c55e);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
}

.fgc-rec-inline {
  margin-left: 4px;
}

.fgc-btn-recommended {
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
}

.fgc-btn-recommended-secondary {
  border-color: var(--c-green-500, #22c55e);
  color: var(--c-green-600, #16a34a);
}

/* 续跑（复用缓存）按钮：蓝色系，与「重新生成」区分，表示快速复用分析结果 */
.fgc-btn-resume {
  border-color: var(--c-blue-400, #60a5fa);
  color: var(--c-blue-600, #2563eb);
}

.fgc-btn-resume:hover:not(:disabled) {
  background: var(--c-blue-50, #eff6ff);
  border-color: var(--c-blue-500, #3b82f6);
}

/* 元操作区（复制按钮等） */
.fgc-meta-actions {
  display: flex;
  justify-content: center;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-default, rgba(0, 0, 0, 0.08));
}

.fgc-meta-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: var(--text-tertiary, #94a3b8);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s;
}

.fgc-meta-btn:hover {
  color: var(--text-primary, #1e293b);
}

.fgc-meta-btn svg {
  flex-shrink: 0;
}
</style>
