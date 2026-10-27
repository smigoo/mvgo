<template>
  <div class="unified-generate">
    <div class="page-header-bar">
      <div class="header-bar-content">
        <div class="header-bar-main">
          <div class="header-bar-icon" aria-hidden="true">
            <component :is="headerIconComponent" />
          </div>
          <div class="header-bar-text">
            <h1 class="header-bar-title">{{ pageHeaderTitle }}</h1>
            <p class="header-bar-desc">{{ pageHeaderDesc }}</p>
          </div>
        </div>
        <router-link to="/components" class="header-bar-library-link">
          <span class="library-link-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05"/><path d="M12 22.08V12"/></svg></span>
          <span>我的组件库</span>
        </router-link>
        <!-- <button class="btn-header-settings" @click="openConfig" title="配置 Figma Token 和 AI Key">
          <SettingOutlined />
          设置
        </button> -->
      </div>
    </div>

    <!-- 空状态：欢迎引导 + 快捷卡片 -->
    <div v-if="!isGenerating && progressCards.length === 0 && !showPreview" class="output-idle">
      <div class="quick-cards">
        <div class="quick-card quick-card--beam clickable" @click="router.push('/tasks')">
          <span class="quick-card-border-beam" aria-hidden="true"></span>
          <span class="qc-icon"><UnorderedListOutlined /></span>
          <div class="qc-body">
            <span class="qc-title">最近生成</span>
            <span class="qc-desc">查看 {{ filteredHistory.length }} 条历史记录</span>
          </div>
          <span class="qc-arrow">→</span>
        </div>
        <div class="quick-card static">
          <span class="qc-icon"><BulbOutlined /></span>
          <div class="qc-body">
            <span class="qc-title">快速上手</span>
            <span class="qc-desc">粘贴 Figma 链接 → 选择类型 → 生成 → 预览</span>
          </div>
        </div>
        <div class="quick-card static">
          <span class="qc-icon"><BarChartOutlined /></span>
          <div class="qc-body">
            <span class="qc-title">今日概况</span>
            <span class="qc-desc">
              今日生成
              <strong>{{ todayStats.total }}</strong>
              个，成功
              <strong style="color: var(--success)">{{ todayStats.success }}</strong>
              个
            </span>
          </div>
        </div>
      </div>
    </div>
    <!-- 双栏主体 / 空状态居中 -->
    <div
      class="generate-body"
      :class="{ 'is-active': isGenerating || progressCards.length > 0 || showPreview }"
    >
      <!-- 左栏：配置面板 
       :class="{ collapsed: isGenerating && configCollapsed }"-->
      <aside class="config-panel">
        <div class="config-panel-inner">
          <div class="config-panel-header">
            <span class="config-panel-title">组件生成任务</span>
          </div>
          <div class="config-section">
            <!-- 输入来源 -->
            <div class="form-group source-group">
              <label>输入来源</label>
              <div class="source-tabs" role="radiogroup" aria-label="输入来源">
                <button
                  v-for="s in sourceOptions"
                  :key="s.key"
                  type="button"
                  class="source-tab"
                  :class="{ active: inputSource === s.key }"
                  :disabled="isGenerating"
                  role="radio"
                  :aria-checked="inputSource === s.key"
                  @click="inputSource = s.key"
                >
                  <FileImageOutlined v-if="s.key === 'screenshot'" />
                  <Html5Outlined v-else-if="s.key === 'html'" />
                  <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                    <path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z"/>
                    <path d="M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z"/>
                    <path d="M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z"/>
                    <path d="M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z"/>
                    <path d="M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z"/>
                  </svg>
                  {{ s.label }}
                </button>
              </div>
            </div>

            <!-- Figma URL 输入（带历史记录） -->
            <div v-if="inputSource === 'figma'" class="form-group figma-url-group" v-feature="'figma.integration'">
              <div class="label-row">
                <label>{{ dualThemeEnabled ? '浅色设计稿链接' : 'Figma 文件或节点链接' }}</label>
                <!-- 🆕 R1：渐进展开入口 —— 仅微码 + Max 档可用（契约收窄） -->
                <button
                  v-if="dualThemeSupported && !dualThemeEnabled && !isGenerating"
                  type="button"
                  class="dual-toggle-btn"
                  title="已有深色设计稿？点这里同时生成双主题（两侧色值都取自设计稿）"
                  @click="dualThemeEnabled = true"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  深色稿
                </button>
                <button
                  v-else-if="dualThemeEnabled && !isGenerating"
                  type="button"
                  class="dual-toggle-btn is-on"
                  title="关闭双主题模式"
                  @click="disableDualTheme"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                  取消
                </button>
              </div>
              <div class="form-input-wrapper" ref="inputWrapperRef">
                <input
                  id="figmaDesignUrl"
                  v-model="figmaUrl"
                  type="text"
                  name="figmaDesignUrl"
                  class="form-input"
                  placeholder="粘贴 figma.com 链接"
                  :disabled="isGenerating"
                  inputmode="url"
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck="false"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  @focus="onFigmaInputFocus"
                  @blur="onFigmaInputBlur"
                />
                <button
                  v-if="figmaUrl && !isGenerating"
                  class="input-history-btn"
                  @click="showUrlHistory = !showUrlHistory"
                  title="历史记录"
                >
                  <UnorderedListOutlined />
                </button>
                <button
                  v-if="figmaUrl && !isGenerating"
                  class="input-clear-btn"
                  @click="clearCurrentUrl"
                  title="清除"
                >
                  <CloseOutlined />
                </button>
                <Transition name="dropdown-fade">
                  <div v-if="showUrlHistory && urlHistory.length > 0" class="url-history-dropdown">
                    <div class="dropdown-header">
                      <span>
                        <UnorderedListOutlined />
                        历史记录
                      </span>
                      <button class="dropdown-clear" @click="clearAllUrlHistory">清空全部</button>
                    </div>
                    <div
                      v-for="(item, idx) in urlHistory"
                      :key="idx"
                      class="dropdown-item"
                      :class="{ active: figmaUrl === item.url && componentType === item.target && generationTier === item.tier }"
                      @mousedown.prevent="selectUrlHistory(item)"
                    >
                      <span class="item-icon"><LinkOutlined /></span>
                      <span class="item-url" :title="item.url">{{ item.url }}</span>
                      <span v-if="item.target || item.tier" class="item-tags">
                        <span v-if="item.target" class="item-tag">{{ item.target === 'vue3' ? 'Vue3' : '微码' }}</span>
                        <span v-if="item.tier" class="item-tag">{{ item.tier === 'lite' ? 'Lite' : 'Max' }}</span>
                      </span>
                    </div>
                  </div>
                </Transition>
              </div>
              <div v-if="urlInfo" class="url-info" :class="urlInfo.type">
                <span v-html="urlInfo.message"></span>
              </div>
              
              <!-- Figma 预览图卡片 -->
              <div v-if="isLoadingPreview" class="figma-preview-card loading">
                <div class="preview-spinner"></div>
                <span>正在获取预览图...</span>
              </div>
              
              <div v-else-if="figmaPreview" class="figma-preview-card">
                <div v-if="figmaPreview.error" class="preview-error">
                  <ExclamationCircleOutlined />
                  <span>{{ figmaPreview.error }}</span>
                </div>
                <template v-else>
                  <div class="preview-image-wrapper">
                    <img :src="figmaPreview.imageUrl" :alt="figmaPreview.nodeName" class="preview-image" />
                  </div>
                  <div class="preview-info">
                    <div class="preview-name">{{ figmaPreview.nodeName }}</div>
                    <div class="preview-size">{{ figmaPreview.width }} × {{ figmaPreview.height }}</div>
                    <button class="btn-confirm-preview" @click="confirmPreview" :disabled="previewConfirmed">
                      <CheckOutlined />
                      {{ previewConfirmed ? '已确认' : '确认这是目标组件' }}
                    </button>
                  </div>
                </template>
              </div>

              <!-- ══════════════════════════════════════════════
                   🆕 R1/R2 双主题：副稿输入 + 主副选择 + 副稿预览确认
                   ══════════════════════════════════════════════ -->
              <div v-if="dualThemeEnabled" class="dual-theme-block">
                <div class="dual-theme-banner">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4M12 8h.01" />
                  </svg>
                  <span>多主题模式 · 每套主题的色值都取自对应设计稿，不再由算法派生</span>
                </div>

                <!-- 🆕🆕 2026-10-12 主题行列表：可增删、可改名、可上下移；第一行即主稿 -->
                <div class="theme-rows">
                  <div
                    v-for="(row, idx) in themeRows"
                    :key="idx"
                    class="theme-row"
                    :class="{ 'is-primary': idx === 0 }"
                  >
                    <div class="theme-row-head">
                      <span class="theme-role-badge">{{ idx === 0 ? '主稿' : `主题 ${idx + 1}` }}</span>
                      <input
                        v-model="row.name"
                        type="text"
                        class="theme-name-input"
                        placeholder="主题名，如 黄昏模式"
                        :disabled="isGenerating"
                        maxlength="20"
                        @focus="selectThemeNameOnFocus"
                        @click="selectThemeNameOnFocus"
                      />
                      <div class="theme-row-actions">
                        <button
                          type="button"
                          :disabled="isGenerating || idx === 0"
                          @click="moveThemeRow(idx, -1)"
                          title="上移（设为���稿）"
                        >
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                        </button>
                        <button
                          type="button"
                          :disabled="isGenerating || idx === themeRows.length - 1"
                          @click="moveThemeRow(idx, 1)"
                          title="下移"
                        >
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
                        </button>
                        <button
                          type="button"
                          :disabled="isGenerating || themeRows.length <= 1"
                          @click="removeThemeRow(idx)"
                          title="删除该主题"
                        >
                          <CloseOutlined />
                        </button>
                      </div>
                    </div>

                    <!-- 第 0 行复用主框的链接（主稿已在主输入框填过） -->
                    <div v-if="idx === 0" class="theme-row-note">
                      链接使用上方「{{ themeRows[0]?.name || '浅色' }}」输入框（主稿 = 结构基准）
                    </div>
                    <template v-else>
                      <div class="form-input-wrapper">
                        <input
                          v-model="row.url"
                          type="text"
                          class="form-input"
                          :placeholder="`粘贴「${row.name || '该主题'}」的 figma.com 节点链接`"
                          :disabled="isGenerating"
                          inputmode="url"
                          autocomplete="off"
                          spellcheck="false"
                          data-lpignore="true"
                          data-1p-ignore="true"
                          data-bwignore="true"
                          @input="onThemeRowInput(idx)"
                        />
                        <button
                          v-if="row.url && !isGenerating"
                          class="input-clear-btn"
                          @click="row.url = ''; onThemeRowInput(idx)"
                          title="清除"
                        >
                          <CloseOutlined />
                        </button>
                      </div>
                      <div v-if="row.error" class="dual-error">
                        <ExclamationCircleOutlined />
                        <div>
                          <div class="dual-error-title">{{ row.error }}</div>
                        </div>
                      </div>
                      <div v-else-if="row.loading" class="figma-preview-card loading">
                        <div class="preview-spinner"></div>
                        <span>正在获取预览...</span>
                      </div>
                      <div v-else-if="row.previewImage" class="figma-preview-card">
                        <div class="preview-image-wrapper">
                          <img :src="row.previewImage" :alt="row.previewName" class="preview-image" />
                        </div>
                        <div class="preview-info">
                          <div class="preview-name">{{ row.previewName }}</div>
                          <div class="preview-size">{{ row.previewWidth }} × {{ row.previewHeight }}</div>
                          <button class="btn-confirm-preview" @click="confirmThemeRow(idx)" :disabled="row.confirmed">
                            <CheckOutlined />
                            {{ row.confirmed ? '已确认' : '确认该主题' }}
                          </button>
                        </div>
                      </div>
                    </template>
                  </div>
                </div>

                <!-- 校验提示 -->
                <div v-if="hasDuplicateThemeNode" class="dual-warn">
                  <ExclamationCircleOutlined />
                  <span>多个主题指向同一个 Figma 节点，请提供各自独立的设计稿</span>
                </div>
                <div v-else-if="hasDuplicateThemeName" class="dual-warn">
                  <ExclamationCircleOutlined />
                  <span>主题名称重复，请改成不同的名字</span>
                </div>

                <button
                  v-if="canAddTheme"
                  type="button"
                  class="add-theme-btn"
                  @click="addThemeRow"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  添加主题（还可加 {{ MAX_THEMES - themeRows.length }} 个）
                </button>
              </div>
            </div>

            <!-- 截图来源占位 -->
            <div v-else-if="inputSource === 'screenshot'" class="form-group source-placeholder">
              <label>截图上传</label>
              <div class="source-placeholder-body">
                <FileImageOutlined />
                <span>截图生成请前往 <router-link to="/lite">轻量生成</router-link></span>
              </div>
            </div>

            <!-- HTML 来源占位 -->
            <div v-else-if="inputSource === 'html'" class="form-group source-placeholder">
              <label>HTML 来源</label>
              <div class="source-placeholder-body">
                <Html5Outlined />
                <span>HTML 生成即将上线</span>
              </div>
            </div>

            <!-- 代码类型 -->
            <div class="form-group type-group">
              <label>代码类型</label>
              <CodeTypeToggle v-model="componentType" :disabled="isGenerating" />
            </div>

            <!-- 生成规格 -->
            <div class="form-group tier-group">
              <label>生成规格</label>
              <TierToggle v-model="generationTier" :disabled="isGenerating" />
              <div class="tier-hint">
                {{ generationTier === 'lite'
                  ? 'Lite 侧重快速布局还原，适合需求明确、追求效率的场景。'
                  : 'Max 进入完整设计生成管线，深度还原设计稿并执行多轮精修。' }}
              </div>
            </div>

            <!-- 面板类型选择（仅微码组件） -->
            <div v-if="componentType === 'microcode'" class="form-group panel-type-group">
              <label>面板类型 Panel Type</label>
              <select v-model="selectedPanelType" class="form-select" :disabled="isGenerating">
                <option value="default-panel">Default Panel（默认/浅色面板）</option>
                <option value="model-panels">Model Panels（弹窗面板）</option>
                <option value="aio-panel">AIO Panel（一体化/深色面板）</option>
                <option value="empty">Empty（空面板）</option>
              </select>
              <div class="hint">选择微码面板类型，决定组件在面板系统中的集成方式</div>
            </div>

            <!-- 需求文档上传 -->
            <DocUploadPanel
              v-model:document="requirementDoc"
              :disabled="isGenerating"
              @analysis-change="(a) => (docAnalysis = a)"
            />

            <!-- 操作按钮 -->
            <div class="action-row">
              <button
                class="btn-generate"
                :class="{ 'is-generating': isGenerating }"
                :disabled="!isGenerating && !canGenerate"
                @click="isGenerating ? cancelTask() : handleComponentGenerate()"
              >
                <span v-if="isGenerating" class="spinner"></span>
                <StopOutlined v-if="isGenerating" />
                <RocketOutlined v-else />
                {{ isGenerating ? '终止' : '开始生成' }}
              </button>
            </div>

            <!-- 状态提示 -->
            <div v-if="inputSource === 'figma' && !urlInfo" class="status-hint neutral">粘贴 Figma 设计稿链接开始</div>
            <div v-else-if="inputSource === 'figma' && !canGenerate && !isGenerating" class="status-hint warn">
              URL 需要包含有效的 file key 和 node-id 参数
            </div>
          </div>
        </div>

        <!-- 收起态的展开按钮 -->
        <!-- <button
          v-if="isGenerating && configCollapsed"
          class="config-expand-btn"
          @click="configCollapsed = false"
          title="展开配置面板"
        >
          <RightOutlined />
        </button> -->
      </aside>

      <!-- 右栏：输出面板 -->
      <main class="output-panel">
        <!-- SSE 进度 -->
        <div v-if="isGenerating || progressCards.length > 0" class="progress-section">
          <div v-if="isGenerating && progressCards.length === 0" class="waiting-card">
            <span class="pulse"></span>
            正在连接生成服务...
          </div>

          <div v-else class="pipeline-steps">
            <div
              v-for="(step, idx) in pipelineState"
              :key="step.key"
              class="pipeline-step"
              :class="[step.status, { active: step.isActive }]"
            >
              <div v-if="idx > 0" class="step-line" :class="step.status"></div>
              <div class="step-node">
                <CheckOutlined v-if="step.status === 'completed'" class="step-check" />
                <CloseOutlined v-else-if="step.status === 'failed'" class="step-x" />
                <span v-else-if="step.status === 'running'" class="step-pulse"></span>
                <span v-else class="step-dot"></span>
              </div>
              <div class="step-label">{{ step.label }}</div>
            </div>
          </div>

          <div v-if="progressCards.length > 0" class="current-stage-detail">
            <span class="detail-icon">
              {{ cardIcon(progressCards[progressCards.length - 1].status) }}
            </span>
            <span class="detail-stage">{{ progressCards[progressCards.length - 1].stage }}</span>
            <span class="detail-msg">{{ progressCards[progressCards.length - 1].message }}</span>
          </div>
        </div>

        <!-- 下载 + Playground -->
        <div v-if="generationComplete && downloadUrl" class="download-section">
          <button
            type="button"
            class="btn-download"
            @click="downloadComponentPackage"
            title="下载组件包"
            aria-label="下载组件包"
          >
            <DownloadOutlined />
            下载组件包 (ZIP)
          </button>
          <GradientButton
            :border-radius="10"
            :border-width="2"
            :blur="6"
            :duration="3000"
            class="!min-h-8 !min-w-0 text-sm font-semibold"
            @click="currentSessionId && openPlayground(currentSessionId)"
          >
            <span class="inline-flex items-center gap-1.5">
              <ToolOutlined />
              进入 Playground
            </span>
          </GradientButton>
        </div>

        <!-- 预览 iframe -->
        <div v-if="showPreview && previewUrl" class="preview-section">
          <div class="preview-header">
            <span class="preview-title">
              <EyeOutlined />
              组件预览
            </span>
            <div class="preview-actions">
              <!-- 🛡️ 2026-09-03：已对接的组件显示「撤回对接」，未对接显示「对接接口」 -->
              <template v-if="componentType === 'vue3'">
                <a-popconfirm
                  v-if="bindingStatus.bound"
                  title="撤回此次对接？"
                  description="将移除组件内注入的接口代码与 API 文件，恢复到对接前状态。"
                  ok-text="撤回"
                  ok-type="danger"
                  cancel-text="取消"
                  :loading="rollingBack"
                  @confirm="handleUnbindFromPreview"
                >
                  <button
                    class="preview-btn binding-preview-btn binding-preview-btn--bound"
                    type="button"
                    title="撤回对接"
                  >
                    <RollbackOutlined v-if="!rollingBack" />
                    <LoadingOutlined v-else />
                    {{ rollingBack ? '撤回中' : '撤回对接' }}
                  </button>
                </a-popconfirm>
                <button
                  v-else
                  class="preview-btn binding-preview-btn"
                  @click="openBindingWizardFromPreview()"
                  title="对接接口"
                >
                  <ApiOutlined />
                  对接接口
                </button>
              </template>
              <button
                class="preview-btn icon-tooltip"
                @click="refreshPreview"
                data-tooltip="刷新"
                aria-label="刷新预览"
              >
                <ReloadOutlined />
              </button>
              <a
                :href="previewUrl"
                target="_blank"
                class="preview-btn icon-tooltip"
                data-tooltip="新窗口"
                aria-label="新窗口打开"
              >
                <ExportOutlined />
              </a>
              <button class="preview-btn icon-tooltip" @click="closePreview" data-tooltip="关闭" aria-label="关闭预览">
                <CloseOutlined />
              </button>
            </div>
          </div>
          <!-- 响应式测试模式：画布容器承载 iframe + 三向手柄（拖拽逻辑来自 useResizableFrame 单一实现） -->
          <div
            v-if="responsiveTestMode"
            class="rz-canvas"
            :class="{ 'is-resizing': frameResize.isResizing.value }"
            :style="frameResize.bodyStyle.value"
          >
            <iframe
              :src="previewUrl"
              class="preview-iframe"
              :style="frameResize.frameStyle.value"
              frameborder="0"
              sandbox="allow-scripts"
            ></iframe>
            <span class="rz-size-bubble" v-if="frameResize.showSizeBubble.value">
              {{ frameResize.sizeLabel.value }}
            </span>
            <span
              class="rz-h rz-h--r" tabindex="0" role="separator" aria-label="调整预览宽度"
              @pointerdown="frameResize.startResize($event, 'right')"
              @keydown="frameResize.onHandleKeydown($event, 'right')"
              @focus="frameResize.onHandleFocus"
            ></span>
            <span
              class="rz-h rz-h--b" tabindex="0" role="separator" aria-label="调整预览高度"
              @pointerdown="frameResize.startResize($event, 'bottom')"
              @keydown="frameResize.onHandleKeydown($event, 'bottom')"
              @focus="frameResize.onHandleFocus"
            ></span>
            <span
              class="rz-h rz-h--c" tabindex="0" role="separator" aria-label="同时调整预览宽高"
              @pointerdown="frameResize.startResize($event, 'corner')"
              @keydown="frameResize.onHandleKeydown($event, 'corner')"
              @focus="frameResize.onHandleFocus"
            ></span>
          </div>
          <iframe
            v-else
            :src="previewUrl"
            class="preview-iframe"
            frameborder="0"
            sandbox="allow-scripts"
          ></iframe>
          <div class="rz-toolbar">
            <template v-if="responsiveTestMode">
              <span class="rz-size" aria-live="polite">{{ frameResize.sizeLabel.value }}</span>
              <span class="rz-preset">{{ frameResize.presetName.value }}</span>
              <button
                class="rz-btn"
                v-for="vp in viewportPresets"
                :key="vp.key"
                :class="{ 'is-on': frameResize.presetName.value === vp.key }"
                :title="vp.label + '（锁定宽度）'"
                @click="frameResize.applyPreset(vp.key, vp.width, vp.height)"
              >{{ vp.short }}</button>
              <button
                v-if="frameResize.isWidthLocked.value"
                class="rz-btn"
                title="解锁宽度后可自由拖动"
                @click="frameResize.unlockWidth()"
              >解锁宽</button>
              <button class="rz-btn" title="恢复默认尺寸" @click="frameResize.resetSize()">重置</button>
            </template>
            <button
              class="rz-btn"
              :title="responsiveTestMode ? '退出响应式测试，恢复固定高度' : '进入响应式测试模式，可拖拽改变预览容器尺寸'"
              @click="responsiveTestMode = !responsiveTestMode"
            >{{ responsiveTestMode ? '退出响应式测试' : '响应式测试' }}</button>
          </div>
        </div>

        <!-- 日志 -->
        <div v-if="logs.length > 0" class="logs-section">
          <div class="logs-header">
            <ProfileOutlined />
            生成日志
          </div>
          <div class="logs-list">
            <div v-for="(log, i) in logs" :key="i" class="log-item" :class="log.level">
              <span class="log-time">{{ log.time }}</span>
              <span class="log-msg">{{ log.message }}</span>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- 接口对接向导 -->
    <ApiBindingWizard
      v-model:open="bindingWizardOpen"
      :componentId="bindingComponent?.sessionId || ''"
      :groupId="bindingGroupId"
      :componentName="bindingComponent?.componentName || ''"
      surface="drawer"
      @refresh-preview="refreshPreview"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, inject, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/config'
import {
  ApiOutlined,
  BarChartOutlined,
  BulbOutlined,
  CheckOutlined,
  CloseOutlined,
  CodeOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  ExportOutlined,
  EyeOutlined,
  FileImageOutlined,
  FileTextOutlined,
  Html5Outlined,
  LinkOutlined,
  ProfileOutlined,
  ReloadOutlined,
  RocketOutlined,
  RollbackOutlined,
  StopOutlined,
  ToolOutlined,
  UnorderedListOutlined,
  LoadingOutlined
} from '@ant-design/icons-vue'
import {
  generateComponent,
  generateVue3Component,
  createProgressStream,
  cancelTask as cancelTaskApi,
  fetchTaskStatus,
  fetchFigmaPreview
} from '@/api/generator'
import { getVue3PreviewUrl, getMcPreviewUrl } from '@/api/component'
import { downloadByUrl } from '@/utils/download-file'
import { useResizableFrame } from '@/composables/useResizableFrame'
import { PREVIEW_VIEWPORT_PRESETS } from '@/constants/previewViewports'
import ApiBindingWizard from '@/views/workspace/ApiBindingWizard.vue'
import DocUploadPanel from '@/components/generate/DocUploadPanel.vue'
import CodeTypeToggle from '@/components/common/CodeTypeToggle.vue'
import TierToggle from '@/components/common/TierToggle.vue'
import http from '@/core/http'
import { message } from 'ant-design-vue'
import GradientButton from '@/components/inspira-ui/GradientButton.vue'

// ── 全局状态 ──
const configStore = useConfigStore()
const route = useRoute()
const router = useRouter()
const openConfig = inject<any>('openConfig', () => {})
const baseURL = import.meta.env.VITE_LANGGRAPH_API || 'http://localhost:3000/api'

// ── 历史记录（跟随顶部组件类型切换） ──
interface HistoryItem {
  sessionId: string
  componentName: string
  status: string
  startTime: number
  endTime?: number
  duration?: number
  target: string
  groupId?: string
  error?: string
}
const allHistory = ref<HistoryItem[]>([])
const filteredHistory = computed(() =>
  allHistory.value.filter((i) => i.target === componentType.value)
)

const todayStats = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStart = today.getTime()
  const todayTasks = allHistory.value.filter((i) => i.startTime >= todayStart)
  return {
    total: todayTasks.length,
    success: todayTasks.filter((i) => i.status === 'completed').length,
    failed: todayTasks.filter((i) => i.status === 'failed').length
  }
})

const pageHeaderTitle = computed(() =>
  componentType.value === 'microcode' ? '微码组件生成' : 'Vue3 组件生成'
)

const pageHeaderDesc = computed(() =>
  componentType.value === 'microcode'
    ? '从 Figma 设计稿生成面板系统组件包，适合 cp-xxx 组件与面板集成场景。'
    : '从 Figma 设计稿生成标准 Vue3 单文件组件，支持预览与接口对接。'
)

const headerIconComponent = computed(() =>
  componentType.value === 'microcode' ? CodeOutlined : FileTextOutlined
)

async function loadHistory() {
  try {
    const data = await http.get(`${baseURL}/tasks`)
    if (data?.success && Array.isArray(data.data.tasks)) {
      allHistory.value = data.data.tasks.map((t: any) => ({
        sessionId: t.sessionId,
        // 🏷️ 展示优先中文 displayName（后端 tasks 已存；componentName 是语义代码名/回退）
        componentName: t.displayName || t.componentName || '未命名',
        status: t.status,
        startTime: t.startTime,
        endTime: t.endTime,
        duration: t.duration,
        target: t.target || t.result?.target || 'microcode',
        groupId: t.groupId,
        error: t.error
      }))
    }
  } catch (e) {
    // 静默失败
  }
}

// ── Figma URL 历史记录（localStorage） ──
// 🛡️ 2026-10-27：条目从纯 URL 升级为 { url, target, tier, time } ——
//   同一 URL 按「规范（microcode/vue3）× 档位（max/lite)」各算一条记录
//   （此前只按 URL 去重，同 URL 换个规范/档位的生成在历史里被合并成一条）。
interface UrlHistoryItem {
  url: string
  target?: 'microcode' | 'vue3'
  tier?: 'lite' | 'max'
  time?: number
}
function normalizeUrlHistory(raw: any[]): UrlHistoryItem[] {
  // 兼容旧格式（纯 string[]）→ 无 target/tier 的条目照常展示（无标签）
  return (Array.isArray(raw) ? raw : [])
    .map((it): UrlHistoryItem | null =>
      typeof it === 'string' ? { url: it } : it && typeof it.url === 'string' ? it : null,
    )
    .filter((it): it is UrlHistoryItem => it !== null)
}
function loadUrlHistory() {
  try {
    const raw = localStorage.getItem('figma-url-history')
    urlHistory.value = raw ? normalizeUrlHistory(JSON.parse(raw)) : []
  } catch {
    urlHistory.value = []
  }
}

function saveToUrlHistory(url: string) {
  if (!url) return
  const entry: UrlHistoryItem = {
    url,
    target: componentType.value,
    tier: generationTier.value,
    time: Date.now(),
  }
  // 去重 key = url + 规范 + 档位（同组合再次生成 ⇒ 提到最前并刷新时间，不占新条目）
  const current = urlHistory.value.filter(
    (it) => !(it.url === entry.url && it.target === entry.target && it.tier === entry.tier),
  )
  current.unshift(entry)
  if (current.length > 10) current.length = 10
  urlHistory.value = current
  localStorage.setItem('figma-url-history', JSON.stringify(current))
}

function selectUrlHistory(item: UrlHistoryItem) {
  figmaUrl.value = item.url
  // 恢复该条记录的规范与档位（一条记录 = 一次具体生成的完整上下文）
  if (item.target) componentType.value = item.target
  if (item.tier) generationTier.value = item.tier
  showUrlHistory.value = false
}

function clearCurrentUrl() {
  figmaUrl.value = ''
}

function clearAllUrlHistory() {
  urlHistory.value = []
  localStorage.removeItem('figma-url-history')
  showUrlHistory.value = false
}

function onFigmaInputFocus() {
  if (urlHistory.value.length > 0 && !isGenerating.value) {
    showUrlHistory.value = true
  }
}

function onFigmaInputBlur() {
  // 延迟关闭，让 mousedown 能选中下拉项
  setTimeout(() => {
    showUrlHistory.value = false
  }, 200)
}

function openPlayground(sessionId: string) {
  router.push(`/demo/${sessionId}`)
}

function syncTaskRoute(sessionId: string, target: 'microcode' | 'vue3') {
  router.replace({
    path: '/generator/component',
    query: {
      session: sessionId,
      type: target
    }
  })
}

function resetTaskViewState() {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
  stopSseFallback()
  currentSessionId = null
  isGenerating.value = false
  configCollapsed.value = false
  generationComplete.value = false
  downloadUrl.value = ''
  progressCards.value = []
  logs.value = []
  figmaUrl.value = ''
  requirementDoc.value = ''
  docAnalysis.value = null
  selectedPanelType.value = 'default-panel'
  closePreview()
}

// ── 预览 ──
const previewUrl = ref('')
const showPreview = ref(false)

// ═══ 响应式测试模式 ═══
// 本页预览 iframe 原为 CSS 写死 height:480px，无法测试响应式。
// 进入响应式模式后改由 useResizableFrame 接管真实尺寸，媒体查询才会重新匹配。
const responsiveTestMode = ref(false)
const viewportPresets = PREVIEW_VIEWPORT_PRESETS
const frameResize = useResizableFrame({
  componentId: '',
  defaultWidth: 1280,
  defaultHeight: 720,
})

function resolveItemGroupId(sessionId: string, fallback?: string): string {
  // 🛡️ 2026-09-03 修复：组件落盘在「生成那一刻」的 group 下；若用户之后切了组
  // （localStorage currentGroupId 已变），仍用 localStorage 拼预览/对接 URL 会指向
  // 不存在的目录 → 预览 load-error / bind-api RUNTIME-004 阻断。
  // 优先取历史任务记录里的真实 groupId，localStorage 仅作兜底。
  const item = allHistory.value.find((i) => i.sessionId === sessionId)
  if (item?.groupId) return item.groupId
  return fallback || localStorage.getItem('currentGroupId') || 'default-group'
}

function openPreview(sessionId: string, target: string) {
  if (target === 'vue3') {
    const groupId = resolveItemGroupId(sessionId)
    previewUrl.value = getVue3PreviewUrl(groupId, sessionId)
  } else {
    // microcode / phase2 微码组件走前端 mc-component 路由
    previewUrl.value = getMcPreviewUrl(sessionId)
  }
  showPreview.value = true
  if (target === 'vue3') {
    loadBindingStatus(sessionId)
  }
}

// 🛡️ 2026-09-03：已对接的组件，预览按钮应切换为「撤回对接」而非重复「对接接口」。
// 后端 bind-api 按 componentId 去重覆盖（upsertBinding），无感知重复对接会覆盖已调好的绑定。
const bindingStatus = ref<{
  sessionId: string
  bound: boolean
  bindingId?: string
  catalogId?: string
  loading: boolean
}>({ sessionId: '', bound: false, loading: false })

async function loadBindingStatus(sessionId: string) {
  bindingStatus.value = { sessionId, bound: false, loading: true }
  try {
    const data: any = await http.get(`/api/vue3/bindings?componentId=${encodeURIComponent(sessionId)}`)
    const list = data?.data?.bindings || []
    const rec = Array.isArray(list) && list.length > 0 ? list[0] : null
    bindingStatus.value = {
      sessionId,
      bound: !!rec,
      bindingId: rec?.bindingId,
      catalogId: rec?.catalogId,
      loading: false,
    }
  } catch (e) {
    bindingStatus.value = { sessionId, bound: false, loading: false }
  }
}

// 撤回对接：调后端 unbind，移除注入代码 + 删 api 文件 + 删绑定记录，恢复组件到对接前
const rollingBack = ref(false)
async function handleUnbindFromPreview() {
  if (!bindingStatus.value.bindingId) return
  rollingBack.value = true
  try {
    const data: any = await http.post(
      `/api/vue3/bindings/${bindingStatus.value.bindingId}/delete`,
    )
    if (data?.success) {
      message.success('已撤回对接，组件已恢复')
      bindingStatus.value = { ...bindingStatus.value, bound: false, bindingId: undefined }
      refreshPreview()
    } else {
      message.error(data?.data?.error || data?.message || '撤回失败')
    }
  } catch (err: any) {
    message.error('撤回失败: ' + err.message)
  } finally {
    rollingBack.value = false
  }
}

function closePreview() {
  showPreview.value = false
  previewUrl.value = ''
}

function refreshPreview() {
  if (previewUrl.value) {
    const url = previewUrl.value
    previewUrl.value = ''
    nextTick(() => {
      previewUrl.value = url
    })
  }
}

// ── 接口对接向导 ──
const bindingWizardOpen = ref(false)
const bindingComponent = ref<HistoryItem | null>(null)
// 🛡️ 2026-09-03 修复：跟随当前绑定组件的历史真实 groupId，localStorage 仅兜底
// （此前恒读 localStorage currentGroupId，用户切组后旧组件对接会指向不存在的目录）
const bindingGroupId = computed(() => {
  if (bindingComponent.value?.groupId) return bindingComponent.value.groupId
  return localStorage.getItem('currentGroupId') || 'default-group'
})

function openBindingWizardFromPreview() {
  // 从预览弹窗打开，使用当前预览的 sessionId
  const sessionId = previewUrl.value.match(/\/preview\/([^?]+)/)?.[1]
  if (sessionId) {
    const item = allHistory.value.find((i) => i.sessionId === sessionId)
    // 🛡️ 2026-09-03：item 未命中历史时，从当前预览 URL 的 groupId query 兜底
    const urlGroupId = new URLSearchParams(previewUrl.value.split('?')[1] || '').get('groupId') || undefined
    bindingComponent.value = item || {
      sessionId,
      componentName: '预览组件',
      status: 'completed',
      startTime: 0,
      target: 'vue3',
      groupId: urlGroupId
    }
    bindingWizardOpen.value = true
  }
}

// ── 组件生成状态 ──
const componentType = ref<'microcode' | 'vue3'>('microcode')
const inputSource = ref<'figma' | 'screenshot' | 'html'>('figma')
const generationTier = ref<'lite' | 'max'>('max')
const sourceOptions = [
  { key: 'screenshot' as const, label: '截图' },
  { key: 'figma' as const, label: 'Figma' },
  { key: 'html' as const, label: 'HTML' }
]
const selectedPanelType = ref('default-panel')
const figmaUrl = ref('')
const urlHistory = ref<UrlHistoryItem[]>([])
const showUrlHistory = ref(false)
const isGenerating = ref(false)
const configCollapsed = ref(false) // 生成中时左侧配置面板是否收起
const generationComplete = ref(false)

// Figma 预览状态
const figmaPreview = ref<{
  imageUrl?: string
  nodeName?: string
  width?: number
  height?: number
  error?: string
  previewToken?: string
} | null>(null)
const isLoadingPreview = ref(false)
const previewConfirmed = ref(false)

// ══════════════════════════════════════════════════════════════
// 🆕 2026-10-10 双主题 Figma 输入（R1/R2）
//
// 设计：**渐进式** —— 默认只显示一个链接框（存量用户零变化），
// 点「深色稿」才展开第二框 + 显式主副单选。
//
// 三条硬约束（与后端契约一一对应）：
//  1. 副稿只在**非空且合法**时才随请求下发（后端 fail-closed，失败=整任务失败）；
//  2. 副稿的「实测明暗」由后端算，前端只能**展示**不能臆造（不自己算亮度）；
//  3. 双主题仅微码 + Max 档可用（契约收窄，见 D8/D9）。
// ══════════════════════════════════════════════════════════════
const secondaryFigmaUrl = ref('')
const dualThemeEnabled = ref(false)          // 是否展开/启用第二输入框
const primaryRole = ref<'first' | 'second'>('first') // 主稿是第一个还是第二个
const secondaryPreviewConfirmed = ref(false)  // 副稿预览已确认
const secondaryPreviewError = ref('')// 副稿拉取失败文案（fail-closed 提示）
const secondaryPreviewLoading = ref(false)
// 副稿预览图（拆成独立 ref：副稿确认与主稿确认互不影响）
const secondaryPreviewImage = ref('')
const secondaryPreviewName = ref('')
const secondaryPreviewWidth = ref<number | null>(null)
const secondaryPreviewHeight = ref<number | null>(null)

// ══════════════════════════════════════════════════════════════
// 🆕🆕 2026-10-12 N 主题：主题行数组（替代单副稿）
//
// 每个主题 = 一份设计稿 + 一个用户自填的名字。主稿恒为 themes[0]
// （后端 themeNodes[0] 决定结构/几何/文案），前端不给「主副单选」——
// 用户用「上下移动」表达顺序，第一行即主稿。
// ══════════════════════════════════════════════════════════════
const MAX_THEMES = 8

interface ThemeRow {
  name: string
  url: string
  confirmed: boolean
  previewImage: string
  previewName: string
  previewWidth: number | null
  previewHeight: number | null
  error: string
  loading: boolean
}

function newThemeRow(name: string): ThemeRow {
  return {
    name,
    url: '',
    confirmed: false,
    previewImage: '',
    previewName: '',
    previewWidth: null,
    previewHeight: null,
    error: '',
    loading: false,
  }
}

/** 主题行：索引 0 是主稿（浅色），1 是深色，2+ 由用户命名 */
const themeRows = ref<ThemeRow[]>([newThemeRow('浅色'), newThemeRow('深色')])

/** 切换双主题模式时重建行（关闭则清空，避免残留上次的输入） */
watch(dualThemeEnabled, (on) => {
  if (on && themeRows.value.length < 2) {
    themeRows.value = [newThemeRow('浅色'), newThemeRow('深色')]
  }
  if (!on) {
    themeRows.value = [newThemeRow('浅色'), newThemeRow('深色')]
  }
})

// 兼容旧的单副稿字段（存量逻辑与模板仍在用）
const secondaryFigmaUrlRef = secondaryFigmaUrl
void secondaryFigmaUrlRef

/** 双主题是否可用：仅微码 + Max（契约收窄） */
const dualThemeSupported = computed(
  () => componentType.value === 'microcode' && generationTier.value === 'max',
)

// 副稿 URL 解析（与主稿同口径，独立函数避免两处正则漂移）
const secondaryUrlInfo = computed(() => {
  if (!secondaryFigmaUrl.value) return null
  try {
    const urlObj = new URL(secondaryFigmaUrl.value)
    const pathMatch = urlObj.pathname.match(/\/(file|design)\/([^/]+)/)
    const nodeId = urlObj.searchParams.get('node-id')
    if (pathMatch && nodeId) {
      return {
        type: 'success' as const,
        message: `File Key: <code>${pathMatch[2]}</code> &nbsp; Node ID: <code>${nodeId}</code>`,
        fileKey: pathMatch[2],
        nodeId,
      }
    }
    return { type: 'warning' as const, message: '副稿链接需要包含 node-id 参数', fileKey: '', nodeId: '' }
  } catch {
    return { type: 'error' as const, message: '副稿链接无效', fileKey: '', nodeId: '' }
  }
})

/** 副稿是否已就绪（解析成功 + 预览已确认） */
const secondaryReady = computed(
  () =>
    dualThemeEnabled.value &&
    secondaryUrlInfo.value?.type === 'success' &&
    secondaryPreviewConfirmed.value,
)

/** 副稿与主稿是同一节点 ⇒ 必须拦（两稿同源则双真值无意义，等于白跑一次 Figma） */
const secondarySameAsPrimary = computed(() => {
  if (urlInfo.value?.type !== 'success' || secondaryUrlInfo.value?.type !== 'success') return false
  return (
    urlInfo.value.fileKey === secondaryUrlInfo.value.fileKey &&
    String(urlInfo.value.nodeId) === String(secondaryUrlInfo.value.nodeId)
  )
})

// 需求文档（可选，驱动四配置/数据字段一次写对）
const requirementDoc = ref('')
const docAnalysis = ref<any>(null)
const downloadUrl = ref('')
const progressCards = ref<{ stage: string; message: string; status: string }[]>([])
const logs = ref<{ time: string; level: string; message: string }[]>([])
let eventSource: EventSource | null = null
let currentSessionId: string | null = null
let sseFallbackTimer: ReturnType<typeof setInterval> | null = null
let figmaUrlBeforeConfigOpen = ''
let figmaUrlGuardTimer: ReturnType<typeof window.setTimeout> | null = null

// 🛡️ 2026-09-04：原生 <a :href download> 不带 Token → 生产 Java 401；统一 Blob 下载
function downloadComponentPackage() {
  const url = downloadUrl.value
  if (!url) return
  const name = `${currentSessionId || 'component'}.zip`
  void downloadByUrl(url, name)
}

// ── SSE 断开恢复：检查任务实际状态，防止页面卡在"运行中" ──
async function checkTaskAndRecover(sessionId: string) {
  try {
    const resp = await fetchTaskStatus(sessionId)
    const st = resp.data?.task?.status
    if (st === 'completed') {
      addLog('info', '检测到任务已完成（SSE 断开恢复）')
      updateCard('完成', '组件已生成', 'completed')
      generationComplete.value = true
      downloadUrl.value = `${baseURL}/phase2/download/${sessionId}`
      isGenerating.value = false
      configCollapsed.value = false
      eventSource?.close()
      eventSource = null
      stopSseFallback()
      loadHistory()
      openPreview(sessionId, componentType.value)
    } else if (st === 'failed') {
      addLog('error', `检测到任务失败（SSE 断开恢复）: ${resp.data?.task?.error || ''}`)
      isGenerating.value = false
      configCollapsed.value = false
      eventSource?.close()
      eventSource = null
      stopSseFallback()
    } else if (st === 'cancelled') {
      addLog('warn', '任务已被取消（SSE 断开恢复）')
      isGenerating.value = false
      configCollapsed.value = false
      eventSource?.close()
      eventSource = null
      stopSseFallback()
    } else {
      // 仍在运行中，仅在 SSE 连接已断开时才重建，避免无谓重连
      if (!eventSource || eventSource.readyState === EventSource.CLOSED) {
        addLog('info', '任务仍在运行中，重建 SSE 连接...')
        bindSseEvents(sessionId)
      }
    }
  } catch {
    // API 查询失败，可能是网络抖动，不中断生成
  }
}

// 统一的 SSE 事件绑定（初始连接 + 断开重连复用）
function bindSseEvents(sessionId: string) {
  currentSessionId = sessionId
  // 先关闭旧连接
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
  // 重建 SSE 连接
  eventSource = createProgressStream(sessionId)
  eventSource.onmessage = (event) => {
    let data: any
    try {
      data = JSON.parse(event.data)
    } catch (e) {
      console.warn('[SSE] 非法 JSON 数据:', event.data)
      addLog('warn', `SSE 收到非法数据，已跳过`)
      return
    }
    if (data.type === 'connected') {
      addLog('info', data.isReconnect ? '重连成功' : '连接成功')
    } else if (data.type === 'progress') {
      if (data.status === 'cancelled') {
        addLog('warn', `${data.message || '任务已被取消'}`)
        isGenerating.value = false
        configCollapsed.value = false
        eventSource?.close()
        eventSource = null
        stopSseFallback()
      } else {
        updateCard(data.stage, data.message, data.status)
        addLog('info', `[${data.stage}] ${data.message}`)
      }
    } else if (data.type === 'complete') {
      addLog('info', '生成完成')
      updateCard('完成', '组件已生成', 'completed')
      generationComplete.value = true
      downloadUrl.value = `${baseURL}/phase2/download/${currentSessionId}`
      isGenerating.value = false
      configCollapsed.value = false
      eventSource?.close()
      eventSource = null
      stopSseFallback()
      loadHistory()
      if (currentSessionId) {
        openPreview(currentSessionId, componentType.value)
      }
    } else if (data.type === 'error') {
      addLog('error', `${data.message}`)
      if (data.stack) {
        console.error('[SSE] 生成失败堆栈 (供排查):\n' + data.stack)
      }
      isGenerating.value = false
      configCollapsed.value = false
      eventSource?.close()
      eventSource = null
      stopSseFallback()
    } else if (data.type === 'cancelled') {
      addLog('warn', `${data.message || '任务已取消'}`)
      isGenerating.value = false
      configCollapsed.value = false
      eventSource?.close()
      eventSource = null
      stopSseFallback()
    }
  }
  eventSource.onerror = () => {
    addLog('warn', 'SSE 连接断开，正在检查任务状态...')
    if (currentSessionId) checkTaskAndRecover(currentSessionId)
  }
}

function startSseFallback(sessionId: string) {
  stopSseFallback()
  // 每 15 秒检查一次任务状态，防止 SSE 静默断开导致卡死
  sseFallbackTimer = setInterval(() => {
    if (!isGenerating.value) {
      stopSseFallback()
      return
    }
    checkTaskAndRecover(sessionId)
  }, 15000)
}

function stopSseFallback() {
  if (sseFallbackTimer) {
    clearInterval(sseFallbackTimer)
    sseFallbackTimer = null
  }
}

// 切换组件类型时清除上一类型的预览和生成状态
watch(componentType, () => {
  showPreview.value = false
  previewUrl.value = ''
  progressCards.value = []
  logs.value = []
  generationComplete.value = false
  downloadUrl.value = ''
})

// ── URL 解析 ──
const urlInfo = computed(() => {
  if (!figmaUrl.value) return null
  try {
    const urlObj = new URL(figmaUrl.value)
    const pathMatch = urlObj.pathname.match(/\/(file|design)\/([^/]+)/)
    const nodeId = urlObj.searchParams.get('node-id')
    if (pathMatch && nodeId) {
      return {
        type: 'success',
        message: `File Key: <code>${pathMatch[2]}</code> &nbsp; Node ID: <code>${nodeId}</code>`,
        fileKey: pathMatch[2],
        nodeId
      }
    }
    return { type: 'warning', message: 'URL 需要包含 node-id 参数', fileKey: '', nodeId: '' }
  } catch {
    return { type: 'error', message: '无效的 URL', fileKey: '', nodeId: '' }
  }
})

const canGenerate = computed(() => {
  const base =
    inputSource.value === 'figma' &&
    urlInfo.value?.type === 'success' &&
    previewConfirmed.value
  if (!base) return false
  // 双主题模式：所有已填主题都要确认预览，且不能有重复节点/重名
  if (dualThemeEnabled.value) {
    return (
      filledThemeRows.value.length > 0 &&
      allThemesConfirmed.value &&
      !hasDuplicateThemeNode.value &&
      !hasDuplicateThemeName.value
    )
  }
  return true
})

function isLikelyDesignUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return true
  return /^https?:\/\//i.test(trimmed) || /figma\.com/i.test(trimmed)
}

function protectFigmaUrlFromAutofill() {
  figmaUrlBeforeConfigOpen = figmaUrl.value
  if (figmaUrlGuardTimer) {
    window.clearTimeout(figmaUrlGuardTimer)
  }
  figmaUrlGuardTimer = window.setTimeout(() => {
    if (!isLikelyDesignUrl(figmaUrl.value) && figmaUrlBeforeConfigOpen !== figmaUrl.value) {
      figmaUrl.value = figmaUrlBeforeConfigOpen
    }
  }, 300)
}

// URL 变化时自动加载 Figma 预览
let previewDebounce: ReturnType<typeof setTimeout> | null = null
watch(figmaUrl, (newUrl) => {
  // 清除之前的定时器
  if (previewDebounce) clearTimeout(previewDebounce)

  // 重置确认状态
  previewConfirmed.value = false

  // 延迟 1 秒后加载预览（避免频繁请求）
  previewDebounce = setTimeout(() => {
    // success 和 warning 都尝试加载预览（warning = 缺少 node-id，后端可自动获取）
    if (newUrl && (urlInfo.value?.type === 'success' || urlInfo.value?.type === 'warning')) {
      loadFigmaPreview()
    } else {
      figmaPreview.value = null
    }
  }, 1000)
})

// 加载 Figma 预览图
async function loadFigmaPreview() {
  if (!urlInfo.value || urlInfo.value.type !== 'success') return
  
  isLoadingPreview.value = true
  figmaPreview.value = null
  
  try {
    const rawCfg = (configStore.config as any)?.value !== undefined 
      ? (configStore.config as any).value 
      : configStore.config
    
    const result = await fetchFigmaPreview({
      figmaUrl: figmaUrl.value,
      figmaToken: rawCfg?.figmaToken,
      config: rawCfg
    })
    
    if (result.success) {
      figmaPreview.value = {
        imageUrl: result.imageUrl,
        nodeName: result.nodeName,
        width: result.width,
        height: result.height,
        previewToken: result.previewToken
      }
    } else {
      figmaPreview.value = { error: result.error }
    }
  } catch (err: any) {
    figmaPreview.value = { error: err.message || '预览加载失败' }
  } finally {
    isLoadingPreview.value = false
  }
}

// 确认预览后开始生成
function confirmPreview() {
  previewConfirmed.value = true
}

// ══════════════════════════════════════════════════════════════
// 🆕 R1/R2 副稿逻辑
// ══════════════════════════════════════════════════════════════

/**
 * 副稿输入变化 → 重置确认态并（防抖后）拉预览。
 *
 * ⚠️ 去抖 600ms：用户粘贴链接后往往还会微调，逐字符打接口会撞 Figma 限流
 *   （现有限流槽 maxConcurrency=1，见 R1 风险项）。
 */
let secondaryPreviewTimer: ReturnType<typeof setTimeout> | null = null
function onSecondaryUrlInput() {
  secondaryPreviewConfirmed.value = false
  secondaryPreviewError.value = ''
  secondaryPreviewImage.value = ''
  secondaryPreviewName.value = ''
  if (secondaryPreviewTimer) window.clearTimeout(secondaryPreviewTimer)
  secondaryPreviewTimer = setTimeout(loadSecondaryPreview, 600)
}

/** 拉取副稿预览图（与主稿同接口；失败文案直接来自后端的归类结果） */
async function loadSecondaryPreview() {
  const info = secondaryUrlInfo.value
  if (!info || info.type !== 'success') return
  // 同节点无需请求
  if (secondarySameAsPrimary.value) return

  secondaryPreviewLoading.value = true
  secondaryPreviewError.value = ''
  try {
    const rawCfg = (configStore.config as any)?.value !== undefined
      ? (configStore.config as any).value
      : configStore.config
    const result = await fetchFigmaPreview({
      figmaUrl: secondaryFigmaUrl.value,
      figmaToken: rawCfg?.figmaToken,
      config: rawCfg,
    })
    if (result.success) {
      secondaryPreviewImage.value = result.imageUrl
      secondaryPreviewName.value = result.nodeName
      secondaryPreviewWidth.value = result.width
      secondaryPreviewHeight.value = result.height
    } else {
      secondaryPreviewError.value = result.error || '深色稿预览获取失败'
    }
  } catch (err: any) {
    secondaryPreviewError.value = err?.message || '深色稿预览获取失败'
  } finally {
    secondaryPreviewLoading.value = false
  }
}

function confirmSecondaryPreview() {
  secondaryPreviewConfirmed.value = true
}

function clearSecondaryUrl() {
  secondaryFigmaUrl.value = ''
  onSecondaryUrlInput()
}

/** 关闭双主题：清空副稿全部状态，回到单稿（不丢主稿已填内容） */
function disableDualTheme() {
  dualThemeEnabled.value = false
  secondaryFigmaUrl.value = ''
  secondaryPreviewConfirmed.value = false
  secondaryPreviewError.value = ''
  secondaryPreviewImage.value = ''
  secondaryPreviewName.value = ''
  if (secondaryPreviewTimer) window.clearTimeout(secondaryPreviewTimer)
}

// ══════════════════════════════════════════════════════════════
// 🆕🆕 N 主题：行增删 / 解析 / 校验 / 下发
// ══════════════════════════════════════════════════════════════

/** 解析单个 Figma 链接 → {fileKey, nodeId} | null（与主稿 urlInfo 同口径） */
function parseFigmaUrl(raw: string): { fileKey: string; nodeId: string } | null {
  if (!raw) return null
  try {
    const u = new URL(raw)
    const m = u.pathname.match(/\/(file|design)\/([^/]+)/)
    const nodeId = u.searchParams.get('node-id')
    if (m && nodeId) return { fileKey: m[2], nodeId }
  } catch {
    /* 无效 URL ⇒ null */
  }
  return null
}

/** 各行解析结果 */
const themeRowParsed = computed(() =>
  themeRows.value.map((r) => ({ row: r, parsed: parseFigmaUrl(r.url) })),
)

/** 已填写链接的行（即需要提交的主题），索引 0 恒为主稿 */
const filledThemeRows = computed(() =>
  themeRowParsed.value.filter((x) => x.parsed !== null),
)

/** 所有已填写的行都已确认预览 */
const allThemesConfirmed = computed(
  () =>
    filledThemeRows.value.length > 0 &&
    filledThemeRows.value.every((x) => x.row.confirmed),
)

/** 有多个主题指向同一节点 ⇒ 阻断（那一侧不是独立真值） */
const hasDuplicateThemeNode = computed(() => {
  const keys = filledThemeRows.value.map(
    (x) => `${x.parsed!.fileKey}::${x.parsed!.nodeId}`,
  )
  return new Set(keys).size !== keys.length
})

/** 主题名重复（展示无法区分） */
const hasDuplicateThemeName = computed(() => {
  const names = themeRows.value
    .filter((r) => r.url.trim())
    .map((r) => r.name.trim())
    .filter(Boolean)
  return new Set(names).size !== names.length
})

/** 能否再加一行 */
const canAddTheme = computed(
  () => dualThemeEnabled.value && themeRows.value.length < MAX_THEMES,
)

/** 新增一行：默认名用「主题 N」，留空让用户自己起 */
function addThemeRow() {
  if (!canAddTheme.value) return
  themeRows.value.push(newThemeRow(`主题 ${themeRows.value.length + 1}`))
}

/** 删除一行（至少保留 1 行） */
function removeThemeRow(index: number) {
  if (themeRows.value.length <= 1) return
  themeRows.value.splice(index, 1)
  if (secondaryPreviewTimer) window.clearTimeout(secondaryPreviewTimer)
}

/** 上移/下移 —— 第一行即主稿，故「上移」等价于「设为主稿」 */
function moveThemeRow(index: number, delta: -1 | 1) {
  const next = index + delta
  if (next < 0 || next >= themeRows.value.length) return
  const arr = themeRows.value
  ;[arr[index], arr[next]] = [arr[next], arr[index]]
}

/** 行输入变化 → 重置该行确认态并防抖拉预览 */
let themeRowTimers: Array<ReturnType<typeof setTimeout> | null> = []
function onThemeRowInput(index: number) {
  const row = themeRows.value[index]
  if (!row) return
  row.confirmed = false
  row.error = ''
  row.previewImage = ''
  row.previewName = ''
  if (themeRowTimers[index]) clearTimeout(themeRowTimers[index])
  themeRowTimers[index] = setTimeout(() => loadThemeRowPreview(index), 600)
}

/** 拉取某一行主题的预览图（index 0 复用主稿已渲好的 figmaPreview） */
async function loadThemeRowPreview(index: number) {
  const x = themeRowParsed.value[index]
  const row = themeRows.value[index]
  if (!row || !x?.parsed) return
  // 第 0 行就是主稿，主稿预览已在 figma-connector 阶段渲好，直接复用
  if (index === 0 && figmaPreview.value?.imageUrl) {
    row.previewImage = figmaPreview.value.imageUrl
    row.previewName = figmaPreview.value.nodeName || ''
    row.previewWidth = figmaPreview.value.width ?? null
    row.previewHeight = figmaPreview.value.height ?? null
    return
  }
  row.loading = true
  row.error = ''
  try {
    const rawCfg = (configStore.config as any)?.value !== undefined
      ? (configStore.config as any).value
      : configStore.config
    const result = await fetchFigmaPreview({
      figmaUrl: row.url,
      figmaToken: rawCfg?.figmaToken,
      config: rawCfg,
    })
    if (result.success) {
      row.previewImage = result.imageUrl
      row.previewName = result.nodeName || ''
      row.previewWidth = result.width ?? null
      row.previewHeight = result.height ?? null
    } else {
      row.error = result.error || '预览获取失败'
    }
  } catch (err: any) {
    row.error = err?.message || '预览获取失败'
  } finally {
    row.loading = false
  }
}

/**
 * 确认某一行主题的预览（2026-10-12 强化）。
 *
 * 🔴 改前是 `if (row) row.confirmed = true` —— **零校验**，用户没看到图也能确认。
 * 改后规则（用户决策：「填 url 时候需要强制预览，确认后才允许生成」）：
 * 1. 必须已填 URL；
 * 2. 必须**预览成功**（`row.previewImage` 非空、无 error）——
 *    未成功时**主动重新拉一次**再判定，仍失败则拒绝确认并给出原因；
 * 3. 通过后才置 `confirmed = true`。
 *
 * 为什么值得加：预览失败却放行 ⇒ 后端落盘拿不到主题图（`previewImageUrl` 为空），
 * 产物该主题的预览图永久缺失，而用户**毫不知情**（生成成功、门禁全绿）。
 *
 * ⚠️ 第0 行是主稿：它的图复用 `figmaPreview`（已在 figma-connector 阶段渲好），
 *   不能因为 `row.previewImage` 为空就判失败—— 需先 `loadThemeRowPreview(0)`。
 */
async function confirmThemeRow(index: number) {
  const row = themeRows.value[index]
  if (!row) return
  if (!row.url?.trim()) {
    row.error = '请先填写 Figma 链接'
    row.confirmed = false
    return
  }
  // 预览还没成功（可能还在 loading，或上拉失败）⇒ 先补拉一次再判定
  if (!row.previewImage || row.error) {
    await loadThemeRowPreview(index)
  }
  if (!row.previewImage) {
    row.confirmed = false
    row.error = row.error || '预览未成功，无法确认（请检查链接与token 权限）'
    return
  }
  row.error = ''
  row.confirmed = true
}

/**
 * 主题名输入框聚焦时全选。
 *
 * 为什么需要：名字是**预填**的（「浅色」/「深色」/「主题 N」），
 *   用户的意图几乎总是「**替换**」而非「追加」。
 *   实测（2026-10-12 真机）：不加全选时，点进「深色」框直接打字
 *   会得到 `深色夜模式` —— 预填值成了误用的前缀。
 *
 * 只在该框被点击时全选 —— 用户已自定义过的名字若再次聚焦
 *   被清空反而是二次误伤。
 * ⚠️ 必须同时挂 focus + click：用户改过一次后光标仍在框内，
 *   此时再点不会重新触发 focus ⇒ 只挂 focus 的话第二次改名又会变追加
 *   （实测 `dusk-mode` → `dusk-mode黄昏模式`）。
 */
function selectThemeNameOnFocus(event: FocusEvent | MouseEvent) {
  const el = event.target as HTMLInputElement | null
  if (!el) return
  el.select()
}

// ── 工具函数 ──
function cardIcon(status: string) {
  return (
    { running: '运行中', completed: '完成', failed: '失败', cancelled: '取消' }[status] ?? '状态'
  )
}

/* ── 管线阶段（横向步骤条） ── */
const PIPELINE_STAGES = [
  { key: 'init', label: '初始化' },
  { key: 'figma', label: 'Figma数据' },
  { key: 'vision', label: '视觉分析' },
  { key: 'parallel', label: '并行分析' },
  { key: 'code', label: '代码生成与精修' },
  { key: 'finish', label: '完成' }
] as const

function stageToPipeline(stage: string): string {
  const s = stage.trim()
  if (s === '初始化') return 'init'
  if (s === 'Figma数据获取') return 'figma'
  if (s === '视觉分析') return 'vision'
  if (s === '并行分析' || s === '串行精修') return 'parallel'
  if (
    [
      '布局审查',
      '样式映射',
      '代码生成',
      '布局精修',
      '样式精修',
      '质量检查',
      '迭代修订',
      '代码清理',
      '样式检查',
      '合规确认',
      'figma'
    ].includes(s)
  )
    return 'code'
  if (s === '完成') return 'finish'
  return 'code' // 默认归入代码阶段
}

const pipelineState = computed(() => {
  // 收集每个大阶段的状态（取最高优先级）
  const map = new Map<string, string>()
  for (const c of progressCards.value) {
    const pk = stageToPipeline(c.stage)
    const cur = map.get(pk) || 'pending'
    const prio: Record<string, number> = {
      failed: 4,
      running: 3,
      completed: 2,
      warning: 1,
      pending: 0
    }
    if ((prio[c.status] || 0) > (prio[cur] || 0)) map.set(pk, c.status)
  }

  // 确定活跃索引：running 阶段，或最后一个有状态的阶段
  let activeIdx = -1
  for (let i = 0; i < PIPELINE_STAGES.length; i++) {
    const st = map.get(PIPELINE_STAGES[i].key)
    if (st === 'running') {
      activeIdx = i
      break
    }
    if (st === 'completed' || st === 'failed') activeIdx = i
  }

  return PIPELINE_STAGES.map((s, i) => {
    let status = map.get(s.key) || 'pending'
    if (status === 'pending' && activeIdx >= 0 && i < activeIdx) {
      status = 'completed'
    }
    return { ...s, status, isActive: i === activeIdx }
  })
})

function addLog(level: string, message: string) {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  logs.value.push({ time, level, message })
}

function updateCard(stage: string, message: string, status: string) {
  const idx = progressCards.value.findIndex((c) => c.stage === stage)
  if (idx >= 0) {
    progressCards.value[idx] = { stage, message, status }
  } else {
    progressCards.value.push({ stage, message, status })
  }
}

// ── 组件生成 ──
async function handleComponentGenerate() {
  if (!canGenerate.value || !urlInfo.value) return

  const missing: string[] = []
  const cfg = configStore.config as any
  const rawCfg = cfg?.value !== undefined ? cfg.value : cfg
  if (!rawCfg?.figmaToken?.trim()) missing.push('Figma Token')
  if (componentType.value === 'microcode') {
    if (!rawCfg?.visionApiKey?.trim()) missing.push('视觉 API Key')
    if (!rawCfg?.textApiKey?.trim()) missing.push('文本 API Key')
  } else {
    if (!rawCfg?.visionApiKey?.trim() && !rawCfg?.textApiKey?.trim())
      missing.push('API Key（视觉/文本至少一项）')
  }

  if (missing.length > 0) {
    alert(`请先在 设置 中配置：${missing.join('、')}`)
    return
  }

  // 保存到历史记录
  saveToUrlHistory(figmaUrl.value)

  isGenerating.value = true
  configCollapsed.value = true
  progressCards.value = []
  logs.value = []
  generationComplete.value = false
  downloadUrl.value = ''
  addLog('info', `开始生成${componentType.value === 'microcode' ? '微码' : '普通'}组件...`)

  const requestData: any = {
    fileKey: urlInfo.value.fileKey,
    nodeId: urlInfo.value.nodeId,
    groupId: localStorage.getItem('currentGroupId') || 'default-group',
    tier: generationTier.value
  }

  // 预览图复用：传递 previewToken 让后端跳过截图门禁
  if (figmaPreview.value?.previewToken) {
    requestData.previewToken = figmaPreview.value.previewToken
  }

  // 需求文档（可选）——随请求传给后端，驱动文档子管线
  if (requirementDoc.value.trim().length >= 20) {
    requestData.requirementDoc = requirementDoc.value
    if (docAnalysis.value) requestData.docAnalysis = docAnalysis.value
  }

  // 微码组件传面板类型
  if (componentType.value === 'microcode') {
    requestData.panelType = selectedPanelType.value
  }

  // 🆕🆕 2026-10-12 N 主题（R1/R2）：下发主题设计稿数组。
  //   关键：**顺序即语义** —— themeNodes[0] 恒为主稿（决定结构/几何/文案），
  //   所以用户「上移某行」等于「把它设为主稿」，前端不另传 primaryRole。
  //
  //   三条硬约束在此收口：
  //   1. 仅双主题模式**且**所有已填主题都确认过预览才下发（否则退化为单稿）；
  //   2. 仅微码 + Max（契约收窄；lite/vue3 DTO 无此字段，发了会被静默忽略）；
  //   3. 主稿（第 0 行）用主框已解析的 fileKey/nodeId，避免重复粘贴。
  if (dualThemeEnabled.value && dualThemeSupported.value && allThemesConfirmed.value) {
    requestData.themeNodes = filledThemeRows.value.map((x, i) =>
      i === 0
        ? {
            fileKey: urlInfo.value!.fileKey,
            nodeId: urlInfo.value!.nodeId,
            name: x.row.name.trim() || '浅色',
            // 🔴 2026-10-12：主稿预览图 URL（**方案 A：传 URL 不是 base64**）。
            //   主稿的图由 `confirmPreview` 渲好并被 `loadThemeRowPreview(0)` 复用，
            //   传下去让后端**零额外Figma 调用**即可落盘为最终 `mc-preview.png`。
            previewImageUrl: x.row.previewImage || undefined,
          }
        : {
            fileKey: x.parsed!.fileKey,
            nodeId: x.parsed!.nodeId,
            name: x.row.name.trim() || `主题 ${i + 1}`,
            // 🔴 2026-10-12：副主题预览图 URL —— 用户在「填 URL 阶段」已强制预览
            //   并确认过（`confirmThemeRow` 现在会校验预览成功才放行），
            //   这张图**直接复用为该主题的最终预览图**（后端落盘 `mc-preview-<key>.png`），
            //   生成阶段**无需再调 Figma exportImage**（省限流，见
            //   `mc-component-graph-phase2.js:378`「只 getNode，不 exportImage」）。
            //   ⚠️ 后端落盘失败只 warn 不阻断（色板真值才是关键），故此处缺失不拦生成。
            previewImageUrl: x.row.previewImage || undefined,
          },
    )
    addLog(
      'info',
      `🎨 多主题模式：${requestData.themeNodes.length} 套主题，主稿「${requestData.themeNodes[0].name}」`,
    )
  }

  if (configStore.isConfigured) {
    const raw = configStore.config as any
    const c = raw?.value !== undefined ? raw.value : raw
    requestData.config = JSON.parse(JSON.stringify(c))
  }

  try {
    const api = componentType.value === 'microcode' ? generateComponent : generateVue3Component
    const response = await api(requestData)
    if (!response.success) throw new Error(response.error || '请求失败')

    currentSessionId = response.sessionId
    syncTaskRoute(response.sessionId, componentType.value)
    addLog('info', `任务已创建: ${response.sessionId}`)

    // 绑定 SSE 事件 + 启动 fallback
    bindSseEvents(response.sessionId)
    startSseFallback(response.sessionId)
  } catch (err: any) {
    addLog('error', `生成失败: ${err?.message || '未知错误'}`)
    isGenerating.value = false
    configCollapsed.value = false
  }
}

async function cancelTask() {
  if (!currentSessionId) return
  try {
    await cancelTaskApi(currentSessionId)
    addLog('info', '已发送终止请求')
    isGenerating.value = false
    configCollapsed.value = false
    eventSource?.close()
    eventSource = null
    stopSseFallback()
  } catch (err: any) {
    addLog('error', `终止失败: ${err?.message}`)
  }
}

// ── 从 URL query 恢复任务状态（WorkflowMonitor 跳转）──
async function recoverFromQuery() {
  const querySession = route.query.session as string
  const queryType = route.query.type as string
  if (!querySession) return

  // 切换组件类型（如果有 type 参数）
  if (queryType === 'vue3') {
    componentType.value = 'vue3'
  }

  try {
    const statusResp = await fetchTaskStatus(querySession)
    if (statusResp?.success && statusResp.task) {
      const task = statusResp.task
      currentSessionId = querySession

      // 回显：组件类型（优先用 task.target）
      if (task.target === 'vue3') {
        componentType.value = 'vue3'
      } else if (task.target === 'microcode') {
        componentType.value = 'microcode'
      }

      // 回显：Figma URL
      if (task.fileKey && task.nodeId) {
        const id = task.nodeId.replace('-', ':')
        figmaUrl.value = `https://www.figma.com/design/${task.fileKey}?node-id=${id}`
      }

      // 回显：面板类型
      if (task.panelKey) {
        selectedPanelType.value = task.panelKey
      }

      // 恢复进度卡片
      if (Array.isArray(task.progress)) {
        progressCards.value = task.progress.map((p: any) => ({
          stage: p.stage || p.message || '',
          message: p.message || '',
          status: p.status || (p.type === 'error' ? 'error' : 'info')
        }))
      }

      // 已完成 → 显示预览
      if (task.status === 'completed') {
        generationComplete.value = true
        downloadUrl.value = `${baseURL}/phase2/download/${querySession}`
        openPreview(querySession, task.target || componentType.value)
      }

      // 失败 → 显示错误
      if (task.status === 'failed') {
        generationComplete.value = true
        if (task.error) {
          progressCards.value.push({ stage: '错误', message: task.error, status: 'error' })
        }
      }

      // 运行中或已暂停 → 恢复生成态 + 连接 SSE 接收实时进度
      if (task.status === 'running' || task.status === 'paused') {
        isGenerating.value = true
        generationComplete.value = false
        addLog('info', `已连接到进行中的任务: ${querySession}`)

        // 绑定 SSE 事件 + 启动 fallback
        bindSseEvents(querySession)
        startSseFallback(querySession)
      }
    }
  } catch {
    // 静默
  }

  // 刷新历史列表
  loadHistory()
}

// 监控 WorkflowMonitor 等组件跳转时 query 变化
watch(
  () => route.query.session,
  (newSession, oldSession) => {
    if (newSession && typeof newSession === 'string') {
      recoverFromQuery()
      return
    }

    if (oldSession && !newSession) {
      resetTaskViewState()
    }
  }
)

onMounted(() => {
  window.addEventListener('mvgo:before-open-config', protectFigmaUrlFromAutofill)
  loadHistory()
  loadUrlHistory()
  // 初始加载时也检查 query（如直接访问链接）
  if (route.query.session) {
    recoverFromQuery()
  }
  // 从组件详情页跳转过来时，自动填充 Figma URL（可选带 type 参数切换组件类型）
  if (route.query.figmaUrl && typeof route.query.figmaUrl === 'string') {
    figmaUrl.value = route.query.figmaUrl
    if (route.query.type === 'vue3') {
      componentType.value = 'vue3'
    } else if (route.query.type === 'microcode') {
      componentType.value = 'microcode'
    }
  }
})

// 组件卸载时关闭 SSE 连接 + 清理定时器，防止泄漏
onUnmounted(() => {
  window.removeEventListener('mvgo:before-open-config', protectFigmaUrlFromAutofill)
  if (figmaUrlGuardTimer) {
    window.clearTimeout(figmaUrlGuardTimer)
    figmaUrlGuardTimer = null
  }
  resetTaskViewState()
})
</script>

<style scoped>
/* ── Figma 预览卡片 ── */
/* ══════════════════════════════════════════════════════════════
   🆕 双主题输入区（R1/R2 · 2026-10-10）
   渐进式：默认单框，按需展开。展开区用左侧色条与主稿区视觉区分。
   ══════════════════════════════════════════════════════════════ */
.label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.dual-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border: 1px solid var(--brand-border, #dcdfe6);
  border-radius: 999px;
  background: transparent;
  color: var(--brand, #409eff);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.18s, border-color 0.18s;
  white-space: nowrap;
}
.dual-toggle-btn:hover {
  background: var(--brand-bg, #ecf5ff);
}
.dual-toggle-btn.is-on {
  color: var(--text-tertiary, #909399);
  border-color: var(--border-color, #dcdfe6);
}

.dual-theme-block {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid var(--brand-border, #dcdfe6);
  border-radius: 8px;
  background: var(--brand-bg, #f7fafd);
}
.dual-theme-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--brand, #409eff);
}
.dual-role-picker {
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--brand-border, #dcdfe6);
}
.dual-role-label {
  display: block;
  margin-bottom: 7px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #303133);
}
.dual-role-label em {
  font-style: normal;
  font-weight: 400;
  font-size: 12px;
  color: var(--text-tertiary, #909399);
}
.dual-role-options {
  display: flex;
  gap: 8px;
}
.dual-role-option {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border: 1px solid var(--border-color, #dcdfe6);
  border-radius: 6px;
  background: var(--bg-primary, #fff);
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.18s, background 0.18s;
}
.dual-role-option.active {
  border-color: var(--brand, #409eff);
  background: var(--brand-bg, #ecf5ff);
}
.secondary-url-group {
  margin-bottom: 0;
}

/* 🆕🆕 N 主题行列表 */
.theme-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 10px;
}
.theme-row {
  padding: 10px;
  border: 1px solid var(--border-color, #dcdfe6);
  border-radius: 8px;
  background: var(--bg-primary, #fff);
}
.theme-row.is-primary {
  border-color: var(--brand, #409eff);
  background: var(--brand-bg, #f7fafd);
}
.theme-row-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.theme-role-badge {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  background: var(--bg-alt, #f0f2f5);
  color: var(--text-secondary, #606266);
}
.theme-row.is-primary .theme-role-badge {
  background: var(--brand, #409eff);
  color: #fff;
}
.theme-name-input {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: var(--bg-alt, #f5f7fa);
  font-size: 13px;
  color: var(--text-primary, #303133);
}
.theme-name-input:focus {
  outline: none;
  border-color: var(--brand, #409eff);
  background: var(--bg-primary, #fff);
}
.theme-row-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
.theme-row-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--border-color, #dcdfe6);
  border-radius: 4px;
  background: var(--bg-primary, #fff);
  color: var(--text-secondary, #606266);
  cursor: pointer;
  transition: background 0.18s, color 0.18s;
}
.theme-row-actions button:hover:not(:disabled) {
  background: var(--brand-bg, #ecf5ff);
  color: var(--brand, #409eff);
}
.theme-row-actions button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.theme-row-note {
  padding: 6px 10px;
  border-radius: 4px;
  background: var(--bg-alt, #f5f7fa);
  font-size: 12px;
  color: var(--text-tertiary, #909399);
}
.add-theme-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  padding: 7px;
  border: 1px dashed var(--border-color, #dcdfe6);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary, #606266);
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.18s, color 0.18s;
}
.add-theme-btn:hover {
  border-color: var(--brand, #409eff);
  color: var(--brand, #409eff);
}
.dual-warn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;
  font-size: 12px;
}
.dual-error {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  padding: 9px 11px;
  border: 1px solid rgba(239, 68, 68, 0.35);
  border-radius: 6px;
  background: rgba(239, 68, 68, 0.06);
  color: var(--error, #f56c6c);
  font-size: 12px;
}
.dual-error-title {
  font-weight: 500;
  margin-bottom: 6px;
}
.dual-error-action {
  padding: 3px 9px;
  border: 1px solid var(--border-color, #dcdfe6);
  border-radius: 999px;
  background: var(--bg-primary, #fff);
  color: var(--text-secondary, #606266);
  font-size: 12px;
  cursor: pointer;
}

.figma-preview-card {
  margin-top: 12px;
  padding: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.figma-preview-card.loading {
  justify-content: center;
  align-items: center;
  padding: 24px;
  color: var(--text-secondary);
  font-size: 13px;
}

.preview-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-default);
  border-top-color: var(--brand);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-right: 8px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.preview-image-wrapper {
  flex-shrink: 0;
  width: 120px;
  height: 120px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--bg-alt);
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.preview-info {
  flex: 1;
  min-width: 0;
}

.preview-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-size {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.btn-confirm-preview {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--brand);
  background: var(--brand-bg);
  border: 1px solid var(--brand);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-confirm-preview:hover:not(:disabled) {
  background: var(--brand);
  color: white;
}

.btn-confirm-preview:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.preview-error {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--error);
  font-size: 13px;
  padding: 8px;
  background: rgba(var(--error-rgb, 220, 38, 38), 0.05);
  border-radius: var(--radius-sm);
}

/* ── 页面整体（全宽双栏布局） ── */
.unified-generate {
  position: relative;
  isolation: isolate;
  padding: 0;
  min-height: calc(100vh - 84px);
  box-sizing: border-box;
  max-width: 1500px;
  margin: 0 auto;
  /* background:
    radial-gradient(ellipse 70% 55% at 8% 12%, rgba(222, 228, 237, 0.7) 0%, transparent 55%),
    radial-gradient(ellipse 60% 45% at 92% 88%, rgba(206, 214, 224, 0.5) 0%, transparent 50%),
    linear-gradient(180deg, #f5f7fb 0%, #eef1f7 100%); */
}

/* 高级感背景：细网格 + 柔和光晕 + 轻微噪点 */
/* .unified-generate::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -2;
  pointer-events: none;
  background-image:
    linear-gradient(to right, rgba(148, 163, 184, 0.05) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(148, 163, 184, 0.05) 1px, transparent 1px);
  background-size: 28px 28px;
  -webkit-mask-image: radial-gradient(ellipse 80% 80% at 50% 40%, black 18%, transparent 78%);
  mask-image: radial-gradient(ellipse 80% 80% at 50% 40%, black 18%, transparent 78%);
}

.unified-generate::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  opacity: 0.28;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
  mix-blend-mode: overlay;
} */

.unified-generate > * {
  position: relative;
  z-index: 1;
}

[data-theme='dark'] .unified-generate {
  background: var(--bg-page);
}

[data-theme='dark'] .unified-generate::before,
[data-theme='dark'] .unified-generate::after {
  display: none;
}

/* ── 顶部标题栏（紧凑化） ── */
.page-header-bar {
  margin-bottom: 0;
  padding: 10px 20px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-default);
}
.header-bar-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.header-bar-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.header-bar-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background: var(--bg-alt);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-light);
  font-size: 17px;
  flex-shrink: 0;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--brand) 10%, transparent);
}
.header-bar-text {
  min-width: 0;
}
.header-bar-kicker {
  font-size: 11px;
  font-weight: 700;
  line-height: 1.4;
  color: var(--brand);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 4px;
}
.header-bar-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.2;
}
.header-bar-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 4px 0 0;
}
.btn-header-settings {
  padding: 8px 18px;
  background: transparent;
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}
.btn-header-settings:hover {
  border-color: var(--brand);
  color: var(--brand);
  background: var(--brand-bg);
}

.header-bar-library-link {
  flex-shrink: 0;
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--brand);
  text-decoration: none;
  background: var(--brand-bg);
  border: 1px solid color-mix(in srgb, var(--brand) 18%, transparent);
  border-radius: var(--radius-md);
  transition: color 0.2s ease, background 0.2s ease, border-color 0.2s ease,
    box-shadow 0.2s ease, transform 0.2s ease;
  white-space: nowrap;
}

.header-bar-library-link:hover {
  background: color-mix(in srgb, var(--brand-bg) 70%, var(--brand) 8%);
  border-color: var(--brand);
  transform: translateY(-1px);
  box-shadow: var(--shadow-lg);
}

/* ── 双栏主体（空状态：居中单列 / 生成中：双栏） ── */
.generate-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  /* gap: 24px; */
  /* min-height: calc(100vh - 200px); */
}
.generate-body:not(.is-active) {
  justify-content: center;
  /* padding-top: 24px; */
  padding-bottom: 48px;
}
.generate-body.is-active {
  display: grid;
  grid-template-columns: 460px 1fr;
  gap: 24px;
  align-items: start;
}

/* ── 左栏：配置面板 ── */
.config-panel {
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  width: 100%;
}
.generate-body.is-active .config-panel {
  position: sticky;
  top: 24px;
  max-width: none;
  width: auto;
}
.generate-body.is-active .config-panel.collapsed {
  width: 0;
  min-width: 0;
  opacity: 0;
  pointer-events: none;
}
.config-panel-inner {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}
.config-panel-header {
  padding: 14px 20px 0;
}
.config-panel-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.02em;
}
.config-section {
  padding: 12px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 收起态 — 左侧小箭头按钮 */
.config-expand-btn {
  position: fixed;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 64px;
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  z-index: 50;
  transition: all 0.2s;
  box-shadow: 2px 0 8px var(--shadow-sm);
}
.config-expand-btn:hover {
  background: var(--brand-bg);
  border-color: var(--brand);
  color: var(--brand);
}

/* ── 右栏：输出面板 ── */
.output-panel {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.generate-body.is-active .output-panel {
  width: auto;
  min-width: 0;
}

/* 空状态：欢迎引导 + 快捷卡片（紧凑化） */
.output-idle {
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  padding: 0 0 8px;
}
.idle-welcome {
  text-align: center;
  padding: 4px 0 0;
}
.idle-icon {
  font-size: 32px;
  display: block;
  margin-bottom: 8px;
  opacity: 0.7;
}
.idle-welcome h3 {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px;
}
.idle-welcome p {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 0;
  line-height: 1.5;
}

/* 顶部摘要条（紧凑） */
.quick-cards {
  display: grid;
  grid-template-columns: 1.15fr 1fr 1fr;
  gap: 10px;
  width: 100%;
}
.quick-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 60px;
  padding: 10px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  cursor: default;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    transform 0.2s ease,
    box-shadow 0.2s ease;
  overflow: hidden;
}
.quick-card.clickable {
  cursor: pointer;
  border-color: color-mix(in srgb, var(--brand) 28%, var(--border-light));
}
.quick-card.clickable:hover {
  border-color: var(--brand);
  background: color-mix(in srgb, var(--brand-bg) 40%, var(--bg-card));
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}
.quick-card--beam > *:not(.quick-card-border-beam) {
  position: relative;
  z-index: 1;
}
.quick-card-border-beam {
  display: none;
}
.quick-card.static {
  opacity: 0.92;
}
.quick-card.static .qc-title {
  font-weight: 600;
  font-size: 14px;
}
.qc-icon {
  font-size: 17px;
  color: var(--brand);
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--brand-bg) 72%, transparent);
  border-radius: var(--radius-md);
}
.qc-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.qc-title {
  font-size: 14px;
  font-weight: 650;
  color: var(--text-primary);
}
.qc-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.45;
}
.qc-arrow {
  font-size: 13px;
  color: var(--text-quaternary);
  flex-shrink: 0;
  transition: transform 0.2s;
}
.quick-card:first-child:hover .qc-arrow {
  color: var(--brand);
  transform: translateX(2px);
}

/* ── 输入来源切换 ── */
.source-tabs {
  display: flex;
  gap: 6px;
  padding: 4px;
  background: color-mix(in srgb, var(--bg-hover) 82%, transparent);
  border-radius: var(--radius-lg);
}
.source-tab {
  flex: 1;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}
.source-tab:hover:not(:disabled) {
  background: var(--bg-card);
  color: var(--text-primary);
}
.source-tab:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.source-tab.active {
  background: var(--bg-card);
  border-color: var(--border-light);
  color: var(--brand);
  box-shadow: var(--shadow-sm);
}
.source-tab svg {
  flex-shrink: 0;
}

/* ── 来源占位提示 ── */
.source-placeholder-body {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  border: 1px dashed var(--border-light);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--bg-hover) 72%, var(--bg-card) 28%);
  color: var(--text-secondary);
  font-size: 13px;
}
.source-placeholder-body a {
  color: var(--brand);
  text-decoration: none;
}
.source-placeholder-body a:hover {
  text-decoration: underline;
}

/* ── 代码类型 / 生成规格 通用 ── */
.type-group,
.tier-group {
  margin-top: 4px;
}
.tier-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* ── 表单通用 ── */
.form-group {
}
.form-group label {
  display: block;
  font-size: 12px;
  font-weight: 650;
  color: var(--text-primary);
  margin-bottom: 6px;
}
.form-input {
  width: 100%;
  padding: 11px 14px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-primary);
  background: color-mix(in srgb, var(--bg-hover) 72%, var(--bg-card) 28%);
  transition: all 0.2s;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
}
.form-input:focus {
  border-color: var(--brand);
  background: var(--bg-card);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 12%, transparent);
}
.form-input::placeholder {
  color: color-mix(in srgb, var(--text-quaternary) 74%, transparent);
}
.form-input:disabled {
  background: var(--bg-alt);
  color: var(--text-quaternary);
  cursor: not-allowed;
}

/* ── Figma URL 输入框 + 历史记录 ── */
.form-input-wrapper {
  position: relative;
}
.figma-url-group .form-input {
  padding-right: 64px;
}
.input-history-btn,
.input-clear-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  border-radius: var(--radius-md);
  color: var(--text-tertiary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.input-history-btn {
  right: 36px;
}
.input-clear-btn {
  right: 6px;
}
.input-history-btn:hover,
.input-clear-btn:hover {
  border-color: var(--brand-border);
  color: var(--text-secondary);
}
.input-history-btn.active {
  border-color: var(--brand);
  color: var(--brand);
  background: var(--brand-bg);
}

.url-history-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px var(--shadow-dropdown);
  z-index: 100;
  overflow: hidden;
}
.dropdown-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-light);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
}
.dropdown-clear {
  border: none;
  background: none;
  color: var(--error-text);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  transition: background 0.15s;
}
.dropdown-clear:hover {
  background: var(--error-bg);
}
.dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.1s;
  border-bottom: 1px solid var(--bg-alt);
}
.dropdown-item:last-child {
  border-bottom: none;
}
.dropdown-item:hover {
  background: var(--brand-bg);
}
.dropdown-item.active {
  background: var(--brand-bg);
}
.dropdown-item .item-icon {
  font-size: 13px;
  opacity: 0.5;
  flex-shrink: 0;
}
.dropdown-item .item-url {
  font-size: 12px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dropdown-item .item-tags {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  margin-left: auto;
}
.dropdown-item .item-tag {
  font-size: 10px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 999px;
  background: var(--bg-alt);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
}
.dropdown-fade-enter-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.dropdown-fade-leave-active {
  transition:
    opacity 0.1s ease,
    transform 0.1s ease;
}
.dropdown-fade-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.form-select {
  width: 100%;
  padding: 11px 14px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-primary);
  background: color-mix(in srgb, var(--bg-hover) 72%, var(--bg-card) 28%);
  transition: all 0.2s;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%2394a3b8' d='M6 8L0 0h12z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  padding-right: 36px;
}
.form-select option {
  background: var(--bg-card);
  color: var(--text-primary);
}
.form-select:focus {
  border-color: color-mix(in srgb, var(--brand) 34%, transparent);
  background-color: var(--bg-card);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 8%, transparent);
}
.form-select:disabled {
  background: var(--bg-alt);
  color: var(--text-quaternary);
  cursor: not-allowed;
}
.panel-type-group .hint {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 5px;
}

.url-info {
  margin-top: 8px;
  padding: 0;
  border-radius: 0;
  font-size: 11px;
  line-height: 1.5;
}
.url-info.success {
  background: transparent;
  color: var(--success);
}
.url-info.warning {
  background: transparent;
  color: var(--warning-text);
}
.url-info.error {
  background: transparent;
  color: var(--error-text);
}
.url-info :deep(code) {
  background: var(--border-light);
  padding: 1px 5px;
  border-radius: var(--radius-xs);
  font-size: 11px;
}

/* ── 操作按钮 ── */
.action-row {
  display: flex;
  gap: 8px;
  margin-top: 2px;
  padding-top: 12px;
  border-top: 1px solid color-mix(in srgb, var(--border-light) 72%, transparent);
}
.btn-generate {
  flex: 1;
  padding: 11px 20px;
  border: none;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--brand);
  color: var(--text-on-brand);
  box-shadow: var(--shadow-lg);
}
.btn-generate:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: var(--shadow-lg);
  background: var(--brand);
}
.btn-generate:disabled {
  background: var(--border-strong);
  color: var(--text-quaternary);
  cursor: not-allowed;
  box-shadow: none;
}
.btn-generate.is-generating {
  background: linear-gradient(135deg, var(--error) 0%, var(--error-light) 100%);
  color: var(--text-on-brand);
  opacity: 0.94;
}
.btn-generate.is-generating:hover {
  opacity: 1;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid color-mix(in srgb, var(--text-on-brand) 30%, transparent);
  border-top-color: var(--text-on-brand);
  border-radius: var(--radius-full);
  animation: spin 0.7s linear infinite;
  display: inline-block;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── 状态提示 ── */
.status-hint {
  padding: 0;
  border-radius: 0;
  font-size: 11px;
  line-height: 1.5;
}
.status-hint.neutral {
  background: transparent;
  color: var(--text-secondary);
}
.status-hint.warn {
  background: transparent;
  color: var(--warning-text);
}

:deep(.doc-upload-panel) {
  margin-top: 4px;
  margin-bottom: 2px;
  border: 1px solid color-mix(in srgb, var(--border-light) 64%, transparent);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-hover) 58%, var(--bg-card) 42%);
}
:deep(.doc-upload-panel.expanded) {
  border-color: color-mix(in srgb, var(--brand) 26%, transparent);
  background: var(--bg-card);
}
:deep(.doc-upload-panel .panel-header) {
  padding: 11px 14px;
}
:deep(.doc-upload-panel .panel-header:hover) {
  background: color-mix(in srgb, var(--brand-bg) 34%, transparent);
}
:deep(.doc-upload-panel .header-hint) {
  font-size: 11px;
  color: var(--text-tertiary);
}
:deep(.doc-upload-panel .panel-body) {
  padding: 0 14px 14px;
}
:deep(.doc-upload-panel .doc-textarea) {
  border: 1px solid transparent;
  background: color-mix(in srgb, var(--bg-hover) 68%, var(--bg-card) 32%);
}
:deep(.doc-upload-panel .doc-textarea:focus) {
  border-color: color-mix(in srgb, var(--brand) 34%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 8%, transparent);
}
:deep(.doc-upload-panel .doc-btn) {
  border: 1px solid transparent;
  background: color-mix(in srgb, var(--bg-card) 86%, var(--bg-hover) 14%);
}
:deep(.doc-upload-panel .doc-btn:hover:not(:disabled)) {
  border-color: color-mix(in srgb, var(--brand) 28%, transparent);
}
:deep(.doc-upload-panel .analysis-result) {
  background: color-mix(in srgb, var(--brand-bg) 48%, var(--bg-card));
  border-color: color-mix(in srgb, var(--brand) 18%, transparent);
}
:deep(.doc-upload-panel .chip) {
  border: 1px solid transparent;
  background: color-mix(in srgb, var(--bg-card) 86%, transparent);
}

/* ── 进度步骤条 ── */
.progress-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}
.waiting-card {
  padding: 28px;
  background: var(--bg-card);
  border: 1.5px dashed var(--border-default);
  border-radius: var(--radius-lg);
  text-align: center;
  font-size: 14px;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.pulse {
  width: 10px;
  height: 10px;
  background: var(--brand);
  border-radius: var(--radius-full);
  animation: pulse-anim 1.2s ease-in-out infinite;
  display: inline-block;
}
@keyframes pulse-anim {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
}

/* 横向步骤条 */
.pipeline-steps {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px 20px 12px;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  gap: 0;
}
.pipeline-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  min-width: 0;
}
.step-line {
  position: absolute;
  top: 16px;
  left: -50%;
  width: 100%;
  height: 2.5px;
  background: var(--border-default);
  z-index: 0;
  border-radius: var(--radius-xs);
}
.step-line.completed {
  background: var(--success-light);
}
.step-line.failed {
  background: var(--error);
}
.step-line.running {
  background: linear-gradient(90deg, var(--success-light) 0%, var(--brand-light) 100%);
}
.step-node {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-alt);
  border: 2px solid var(--border-strong);
  z-index: 1;
  transition: all 0.3s;
  flex-shrink: 0;
}
.pipeline-step.completed .step-node {
  background: var(--success-bg);
  border-color: var(--success-light);
}
.pipeline-step.failed .step-node {
  background: var(--error-bg);
  border-color: var(--error);
}
.pipeline-step.running .step-node {
  background: var(--brand-bg);
  border-color: var(--brand);
  box-shadow: 0 0 0 5px var(--brand-bg-active);
}
.step-check {
  color: var(--success);
  font-size: 15px;
  font-weight: 700;
}
.step-x {
  color: var(--error-text);
  font-size: 15px;
  font-weight: 700;
}
.step-pulse {
  width: 12px;
  height: 12px;
  background: var(--brand);
  border-radius: var(--radius-full);
  animation: pulse-anim 1.2s ease-in-out infinite;
}
.step-dot {
  width: 8px;
  height: 8px;
  background: var(--text-tertiary);
  border-radius: var(--radius-full);
}
.step-label {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-tertiary);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  padding: 0 2px;
}
.pipeline-step.completed .step-label {
  color: var(--success);
  font-weight: 600;
}
.pipeline-step.failed .step-label {
  color: var(--error-text);
  font-weight: 600;
}
.pipeline-step.running .step-label {
  color: var(--brand);
  font-weight: 700;
}

.current-stage-detail {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  font-size: 13px;
  color: var(--text-secondary);
}
.detail-icon {
  font-size: 15px;
  flex-shrink: 0;
}
.detail-stage {
  font-weight: 600;
  color: var(--text-primary);
  flex-shrink: 0;
}
.detail-msg {
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 下载按钮 ── */
.download-section {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
}
.btn-download {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  background: var(--brand);
  color: var(--text-inverse);
  border: none;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}
.btn-download:hover {
  background: var(--brand-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}

.btn-playground {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 22px;
  background: var(--module-playground);
  color: var(--module-playground-contrast);
  border: none;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
  box-shadow: var(--shadow-md);
}
.btn-playground:hover {
  filter: brightness(1.12);
  transform: translateY(-1px);
  box-shadow: var(--shadow-lg);
}
.btn-playground:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

/* ── 日志 ── */
.logs-section {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 12px 14px;
  box-shadow: 0 1px 8px var(--shadow-sm);
  border: 1px solid var(--border-light);
  width: 100%;
}
.logs-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-light);
}
.logs-list {
  max-height: 280px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.log-item {
  display: flex;
  gap: 8px;
  padding: 3px 6px;
  border-radius: var(--radius-xs);
  font-size: 12px;
  font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
  line-height: 1.5;
}
.log-item.error {
  color: var(--error-text);
  background: var(--error-bg);
}
.log-item.warn {
  color: var(--warning-text);
  background: var(--warning-bg);
}
.log-time {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

/* ── 预览 ── */
.preview-section {
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-md);
  border: 1px solid var(--border-light);
  background: var(--bg-card);
}
.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: var(--text-primary);
  color: var(--text-inverse);
}
.preview-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}
.preview-actions {
  display: flex;
  gap: 6px;
}
.preview-btn {
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.15);
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-inverse);
  font-size: 12px;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.2s;
}
.preview-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}
/* 撤回对接态：警示色区分于「对接接口」 */
.binding-preview-btn--bound {
  background: rgba(217, 83, 79, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.35);
}
.binding-preview-btn--bound:hover {
  background: rgba(217, 83, 79, 0.55);
}
.preview-iframe {
  width: 100%;
  height: 480px;
  border: none;
  display: block;
  background: var(--bg-page);
}

/* ===================================================================
 * 预览容器响应式调尺（响应式测试模式）
 * 拖拽逻辑全部来自 composables/useResizableFrame（全仓唯一实现），此处只做外观。
 * =================================================================== */
.preview-section {
  position: relative;
}
.rz-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 6px 0 8px;
  font-size: 12px;
}
.rz-size {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--bg-tertiary, rgba(0, 0, 0, 0.06));
}
.rz-preset {
  color: var(--text-tertiary, #8a8a96);
}
.rz-btn {
  border: 0.5px solid var(--border-color, #d9dbe0);
  background: var(--bg-primary, #fff);
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-primary, #2c2c34);
}
.rz-btn:hover {
  border-color: #185fa5;
  color: #185fa5;
}
.rz-btn.is-on {
  background: #faeeda;
  border-color: #ba7517;
  color: #633806;
}
/* 画布：真实尺寸容器，宽度超出父级时横向滚动 */
.rz-canvas {
  position: relative;
  display: inline-block;
  min-width: 0;
}
.rz-canvas.is-resizing {
  pointer-events: none;
}
.rz-canvas .preview-iframe {
  height: 100%;
}
.rz-h {
  position: absolute;
  background: #185fa5;
  border-radius: 2px;
  opacity: 0.85;
  z-index: 5;
  /* Pointer Events 必需：否则拖拽被浏览器手势截走，pointermove 收不到 */
  touch-action: none;
  user-select: none;
}
.rz-h:hover,
.rz-h:focus-visible {
  opacity: 1;
  outline: 2px solid rgba(24, 95, 165, 0.35);
  outline-offset: 1px;
}
.rz-h--r {
  right: -3px;
  top: 50%;
  width: 6px;
  height: 34px;
  transform: translateY(-50%);
  cursor: ew-resize;
}
.rz-h--b {
  bottom: -3px;
  left: 50%;
  width: 34px;
  height: 6px;
  transform: translateX(-50%);
  cursor: ns-resize;
}
.rz-h--c {
  right: -4px;
  bottom: -4px;
  width: 10px;
  height: 10px;
  cursor: nwse-resize;
}
.rz-size-bubble {
  position: absolute;
  right: 8px;
  bottom: 8px;
  z-index: 6;
  background: #185fa5;
  color: #fff;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  pointer-events: none;
}

/* ── 响应式：窄屏降级为单栏 ── */
@media (max-width: 900px) {
  .header-bar-content {
    flex-direction: column;
    align-items: stretch;
  }
  .btn-header-settings {
    width: 100%;
    justify-content: center;
  }
  .generate-body.is-active {
    grid-template-columns: 1fr;
  }
  .generate-body.is-active .config-panel {
    position: static;
  }
  .generate-body.is-active .config-panel.collapsed {
    width: 100%;
    opacity: 1;
    pointer-events: auto;
  }
  .config-expand-btn {
    display: none;
  }
  .quick-cards {
    grid-template-columns: 1fr;
  }
}
</style>
