<template>
  <div class="unified-generate gen-v4">
    <div v-if="toastMsg" class="app-toast" role="status" aria-live="polite">{{ toastMsg }}</div>

    <!-- ═══ workbench ═══ -->
    <div class="workbench">
      <main class="main-col">
        <h1 class="page-title">新建生成任务</h1>
        <p class="page-sub">选择来源并填写信息，AI 将为你生成对应组件。</p>

        <!-- 来源 Tab（flex 等分 100%） -->
        <div class="source-tabs" role="tablist" aria-label="输入来源">
          <button
            type="button"
            class="source-tab"
            :class="{ active: sourceMode === 'screenshot' }"
            :aria-selected="sourceMode === 'screenshot'"
            :disabled="busy"
            role="tab"
            @click="selectSource('screenshot')"
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="8.5" cy="9" r="1.5" />
              <path d="m21 15-5-5L5 20" />
            </svg>
            上传截图
          </button>
          <button
            type="button"
            class="source-tab"
            :class="{ active: sourceMode === 'figma' }"
            :aria-selected="sourceMode === 'figma'"
            :disabled="busy"
            role="tab"
            @click="selectSource('figma')"
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              aria-hidden="true"
            >
              <path d="M8 3h4v6H8a3 3 0 0 1 0-6Z" />
              <path d="M12 3h4a3 3 0 0 1 0 6h-4V3Z" />
              <path d="M8 9h4v6H8a3 3 0 0 1 0-6Z" />
              <circle cx="16" cy="12" r="3" />
              <path d="M8 15h4v3a3 3 0 1 1-3-3Z" />
            </svg>
            Figma 链接
          </button>
          <button
            type="button"
            class="source-tab"
            :class="{ active: sourceMode === 'docx-html' }"
            :aria-selected="sourceMode === 'docx-html'"
            :disabled="busy"
            role="tab"
            @click="selectSource('docx-html')"
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              aria-hidden="true"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            HTML + 需求文档
          </button>
        </div>

        <!-- 隐藏文件输入（脚本依赖 ref） -->
        <input
          ref="fileInput"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          @change="onFile"
        />
        <input
          ref="htmlFileInput"
          type="file"
          accept=".html,.htm,.css,.js,.png,.jpg,.jpeg,.gif,.svg,.webp,.ico,.woff,.woff2,text/html"
          multiple
          hidden
          @change="onHtmlFile"
        />
        <input
          ref="docxFileInput"
          type="file"
          accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          hidden
          @change="onDocxFile"
        />

        <!-- ═══ 单一画布：随 Tab 切换内容 ═══ -->
        <div class="canvas">
          <!-- 截图 -->
          <div class="field" v-show="sourceMode === 'screenshot'">
            <div
              v-if="!images.length"
              class="drop-zone"
              :class="{ 'is-dragging': drag }"
              tabindex="0"
              @dragover.prevent="drag = true"
              @dragleave.prevent="drag = false"
              @drop.prevent="onDrop"
              @click="triggerFile"
              @keydown.enter.prevent="triggerFile"
              @keydown.space.prevent="triggerFile"
            >
              <span class="upload-icon">
                <svg
                  viewBox="0 0 24 24"
                  width="32"
                  height="32"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  aria-hidden="true"
                >
                  <path d="M12 16V4" />
                  <path d="m7 9 5-5 5 5" />
                  <path d="M5 14v5h14v-5" />
                </svg>
              </span>
              <strong>选择或粘贴截图</strong>
              <span>拖拽到这里，或按 Ctrl+V</span>
              <small>PNG、JPG、WebP · 单张图片</small>
            </div>
            <div v-else class="image-preview-row">
              <div class="image-preview-stage">
                <img :src="images[0].preview" :alt="images[0].name" />
              </div>
              <div class="image-preview-toolbar">
                <div class="image-preview-info">
                  <strong :title="images[0].name">{{ images[0].name }}</strong>
                  <span>{{ imageMetaText }}</span>
                </div>
                <div class="image-preview-actions">
                  <button type="button" class="text-action" :disabled="busy" @click="triggerFile">
                    替换
                  </button>
                  <button
                    type="button"
                    class="icon-action danger"
                    :disabled="busy"
                    title="删除截图"
                    aria-label="删除截图"
                    @click="removeImg(0)"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="15"
                      height="15"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                      aria-hidden="true"
                    >
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="m19 6-1 14H6L5 6" />
                      <path d="M10 11v5M14 11v5" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Figma -->
          <div class="field" v-show="sourceMode === 'figma'">
            <div class="figma-inline-bar">
              <template v-if="!previewConfirmed">
                <div class="figma-inline-input-row">
                  <input
                    v-model="figmaUrl"
                    type="text"
                    class="form-input figma-inline-input"
                    placeholder="粘贴 figma.com 链接"
                    :disabled="busy"
                    autocomplete="off"
                    autocapitalize="off"
                    spellcheck="false"
                  />
                  <button
                    v-if="urlHistory.length"
                    type="button"
                    class="history-btn"
                    :class="{ active: showUrlHistory }"
                    @click="showUrlHistory = !showUrlHistory"
                    :disabled="busy"
                    title="最近使用"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="15"
                      height="15"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.8"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    :disabled="!isValidFigmaUrl || busy || isLoadingPreview"
                    @click="loadFigmaPreview"
                  >
                    {{ previewActionText }}
                  </button>
                  <!-- 历史下拉 — 绝对定位紧跟输入行下方 -->
                  <div v-if="showUrlHistory && urlHistory.length" class="url-history-dropdown">
                    <div class="url-history-header">
                      <span class="url-history-title">最近使用</span>
                      <button type="button" class="url-history-clear" @click="clearUrlHistory">
                        清空
                      </button>
                    </div>
                    <div
                      v-for="(url, idx) in urlHistory"
                      :key="url"
                      class="url-history-item"
                      @click="selectUrlHistory(url)"
                    >
                      <svg
                        class="url-item-icon"
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                      <span class="url-text">{{ url }}</span>
                      <button
                        class="url-del"
                        title="删除此记录"
                        @click.stop="removeUrlHistory(idx)"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="14"
                          height="14"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <path d="M18 6 6 18" />
                          <path d="m6 6 12 12" />
                          <circle cx="12" cy="12" r="9" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
                <div
                  v-if="figmaUrl.trim()"
                  class="input-feedback"
                  :class="{ invalid: !isValidFigmaUrl }"
                >
                  {{ isValidFigmaUrl ? '链接格式有效' : '请输入有效的 Figma 文件或节点链接' }}
                </div>
              </template>

              <template v-else>
                <div class="figma-inline-readonly">
                  <span class="figma-readonly-badge">
                    <svg
                      viewBox="0 0 24 24"
                      width="12"
                      height="12"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    已确认 Figma 来源
                  </span>
                  <span class="figma-readonly-url" :title="figmaUrl">{{ figmaUrl }}</span>
                  <button
                    type="button"
                    class="figma-readonly-change"
                    @click="changeFigmaSource"
                    :disabled="busy"
                  >
                    更换
                  </button>
                </div>
              </template>

              <!-- 画布区域：显式状态机，避免空档期误显示失败 -->
              <div class="figma-canvas" :data-preview-status="previewStatus">
                <div v-if="previewStatus === 'idle'" class="figma-empty-guide">
                  <div class="figma-empty-icon">
                    <svg
                      viewBox="0 0 24 24"
                      width="36"
                      height="36"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                    >
                      <path d="M8 3h4v6H8a3 3 0 0 1 0-6Z" />
                      <path d="M12 3h4a3 3 0 0 1 0 6h-4V3Z" />
                      <path d="M8 9h4v6H8a3 3 0 0 1 0-6Z" />
                      <circle cx="16" cy="12" r="3" />
                      <path d="M8 15h4v3a3 3 0 1 1-3-3Z" />
                    </svg>
                  </div>
                  <strong>粘贴 Figma 链接开始</strong>
                  <p>支持文件链接或单个 Frame / 组件节点链接</p>
                </div>

                <div
                  v-else-if="previewStatus === 'invalid'"
                  class="figma-error-state figma-error-state--validation"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="40"
                    height="40"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v5" />
                    <circle cx="12" cy="16" r=".8" fill="currentColor" />
                  </svg>
                  <strong>链接格式不正确</strong>
                  <p class="figma-error-msg">请输入 Figma 文件、设计稿或节点链接</p>
                </div>

                <div
                  v-else-if="previewStatus === 'pending' && !retainedPreview"
                  class="figma-pending-state"
                >
                  <strong>链接已识别</strong>
                  <p>即将自动获取预览，也可以点击“获取预览”立即开始</p>
                  <small>Figma 图片通常需要 5–15 秒</small>
                </div>

                <div v-else-if="isLoadingPreview && !retainedPreview" class="figma-loading-state">
                  <div class="figma-loading-spinner"><div class="spinner spinner--lg"></div></div>
                  <p class="figma-loading-text">正在获取预览图...</p>
                  <p class="figma-loading-hint">Figma 图片通常需要 5–15 秒，请勿重复提交</p>
                  <p class="figma-loading-sub">{{ figmaUrl }}</p>
                </div>

                <div
                  v-else-if="(previewStatus === 'pending' || isLoadingPreview) && retainedPreview"
                  class="figma-preview-card figma-preview-card--retained"
                >
                  <div class="preview-thumb">
                    <img :src="retainedPreview.imageUrl" :alt="retainedPreview.nodeName" />
                  </div>
                  <div class="preview-transition-mask">
                    <div v-if="isLoadingPreview" class="spinner"></div>
                    <strong>
                      {{ isLoadingPreview ? '正在获取新链接预览' : '链接已更换，等待获取新预览' }}
                    </strong>
                    <span>
                      {{
                        isLoadingPreview
                          ? '旧预览暂时保留，完成后自动替换'
                          : '旧预览仅用于过渡，不可确认或生成'
                      }}
                    </span>
                  </div>
                  <div class="preview-meta">
                    <span class="preview-name">{{ retainedPreview.nodeName }}</span>
                    <span class="preview-size">旧预览</span>
                  </div>
                </div>

                <div
                  v-else-if="
                    (previewStatus === 'ready' || previewStatus === 'confirmed') && figmaPreview
                  "
                  class="figma-preview-card"
                >
                  <div class="preview-thumb">
                    <img :src="figmaPreview.imageUrl" :alt="figmaPreview.nodeName" />
                  </div>
                  <div class="preview-meta">
                    <span class="preview-name">{{ figmaPreview.nodeName }}</span>
                    <span class="preview-size">
                      {{ figmaPreview.width }} × {{ figmaPreview.height }}
                    </span>
                  </div>
                </div>

                <div v-else-if="previewStatus === 'error'" class="figma-error-state">
                  <svg
                    viewBox="0 0 24 24"
                    width="40"
                    height="40"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="m15 9-6 6" />
                    <path d="m9 9 6 6" />
                  </svg>
                  <strong>{{ previewError?.title || '预览加载失败' }}</strong>
                  <p class="figma-error-msg">{{ previewError?.message || '请稍后重试' }}</p>
                  <button type="button" class="btn btn-primary btn-sm" @click="loadFigmaPreview">
                    重新获取
                  </button>
                </div>

                <!-- 后端返回成功后先由浏览器验证图片可加载，再允许进入 ready -->
                <img
                  v-if="isLoadingPreview && figmaPreview?.imageUrl"
                  class="preview-image-probe"
                  :src="figmaPreview.imageUrl"
                  alt=""
                  @load="handlePreviewImageLoad"
                  @error="handlePreviewImageError"
                />
              </div>
            </div>
          </div>

          <!-- 需求文档：左右双栏（HTML 原型 + 需求文档） -->
          <div class="field" v-show="sourceMode === 'docx-html'">
            <!-- 左右双栏（紧凑模式） -->
            <div class="docx-dual-panel docx-dual-panel--compact">
              <!-- ══ 左栏：HTML 原型 ══ -->
              <div class="docx-panel docx-panel--html">
                <div class="docx-panel-header">
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"
                    />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <span>HTML 原型</span>
                  <span v-if="htmlFile" class="docx-badge done">已上传</span>
                  <span v-else class="docx-badge pending">待上传</span>
                </div>

                <!-- 空态：未上传 HTML -->
                <div
                  v-if="!htmlFile"
                  class="drop-zone docx-drop-zone"
                  :class="{ 'is-dragging': htmlDrag }"
                  tabindex="0"
                  @dragover.prevent="htmlDrag = true"
                  @dragleave.prevent="htmlDrag = false"
                  @drop.prevent="onHtmlDrop"
                  @click="triggerHtmlFile"
                  @keydown.enter.prevent="triggerHtmlFile"
                  @keydown.space.prevent="triggerHtmlFile"
                >
                  <span class="upload-icon html-icon">
                    <svg
                      viewBox="0 0 24 24"
                      width="28"
                      height="28"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.6"
                    >
                      <path
                        d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"
                      />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                  </span>
                  <strong>选择 HTML 原型</strong>
                  <span>可同时选中 HTML 及其 CSS / JS / 图片</span>
                  <small>.html (+ 配套资源) · 最大 5 MB</small>
                </div>

                <!-- 已上传：显示文件信息（紧凑行） -->
                <div v-else class="docx-file-card docx-file-card--compact">
                  <div class="docx-file-info">
                    <span class="file-type-icon small html-tag">HTML</span>
                    <div class="docx-file-meta">
                      <strong :title="htmlFile.name">{{ htmlFile.name }}</strong>
                      <span>{{ formatFileSize(htmlFile.size) }} · 原型文件</span>
                    </div>
                  </div>
                  <div class="docx-file-actions">
                    <button
                      type="button"
                      class="text-action"
                      :disabled="busy"
                      @click="triggerHtmlFile"
                    >
                      替换
                    </button>
                    <button
                      type="button"
                      class="icon-action danger small"
                      :disabled="busy"
                      title="删除 HTML 原型"
                      @click="removeHtmlFile()"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.8"
                      >
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="m19 6-1 14H6L5 6" />
                        <path d="M10 11v5M14 11v5" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <!-- ══ 右栏：需求文档 ══ -->
              <div class="docx-panel docx-panel--docx">
                <div class="docx-panel-header">
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  <span>需求文档</span>
                  <span v-if="docxFile" class="docx-badge done">已上传</span>
                  <span v-else class="docx-badge pending">待上传</span>
                </div>

                <!-- 空态：未上传 DOCX -->
                <div
                  v-if="!docxFile"
                  class="drop-zone docx-drop-zone"
                  :class="{ 'is-dragging': docxDrag }"
                  tabindex="0"
                  @dragover.prevent="docxDrag = true"
                  @dragleave.prevent="docxDrag = false"
                  @drop.prevent="onDocxDrop"
                  @click="triggerDocxFile"
                  @keydown.enter.prevent="triggerDocxFile"
                  @keydown.space.prevent="triggerDocxFile"
                >
                  <span class="upload-icon docx-icon">
                    <svg
                      viewBox="0 0 24 24"
                      width="28"
                      height="28"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.6"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </span>
                  <strong>选择需求文档</strong>
                  <span>拖拽或点击选择</span>
                  <small>DOCX、DOC · 最大 10 MB</small>
                </div>

                <!-- 已上传：显示文件信息 -->
                <div v-else class="docx-file-card">
                  <div class="docx-file-info">
                    <span class="file-type-icon small docx">DOCX</span>
                    <div class="docx-file-meta">
                      <strong :title="docxFile.name">{{ docxFile.name }}</strong>
                      <span>{{ docxMetaText }}</span>
                    </div>
                  </div>
                  <div class="docx-file-actions">
                    <button
                      type="button"
                      class="text-action"
                      :disabled="busy"
                      @click="triggerDocxFile"
                    >
                      替换
                    </button>
                    <button
                      type="button"
                      class="icon-action danger small"
                      :disabled="busy"
                      title="删除需求文档"
                      @click="removeDocxFile()"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.8"
                      >
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="m19 6-1 14H6L5 6" />
                        <path d="M10 11v5M14 11v5" />
                      </svg>
                    </button>
                  </div>
                </div>

                <!-- 打包中提示 -->
                <div v-if="splitBuilding" class="docx-status-line building">
                  <span class="spinner spinner--sm"></span>
                  <span>正在生成交付包...</span>
                </div>
              </div>
            </div>
            <!-- /docx-dual-panel -->

            <!-- 预览 + 组件列表：左右并列 -->
            <div class="html-split-row">
              <!-- HTML 预览舞台：16:9 画布 + 组件拆分标注 -->
              <div class="html-preview-stage">
                <!-- 分析中：画布中央大加载态 -->
                <div v-if="splitAnalyzing" class="html-preview-loading">
                  <div class="html-loading-spinner">
                    <div class="spinner spinner--lg"></div>
                  </div>
                  <p class="html-loading-text">正在分析 HTML 结构...</p>
                  <p class="html-loading-sub">AI 正在识别页面中的可拆分组件</p>
                </div>

                <!-- 空态：未上传 HTML -->
                <div v-else-if="!htmlFile" class="html-preview-empty">
                  <svg
                    viewBox="0 0 24 24"
                    width="34"
                    height="34"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.4"
                  >
                    <rect x="3" y="4" width="18" height="14" rx="2" />
                    <path d="M3 9h18" />
                    <path d="M8 14h8" />
                  </svg>
                  <p>上传 HTML 原型后，将在此处以 16:9 画布预览页面并标注拆分出的组件</p>
                </div>

                <!-- 预览 / 标注视图 -->
                <div v-else class="html-preview-frame html-preview-frame--169">
                  <!-- 组件标签叠加层 -->
                  <div
                    v-if="splitComponents.length > 0"
                    class="comp-labels-overlay"
                    :key="'labels-' + splitComponents.length"
                  >
                    <span
                      v-for="comp in splitComponents"
                      :key="comp.index"
                      class="comp-label-badge"
                      :class="{ 'comp-label--hover': hoveredSplitIdx === comp.index }"
                      @mouseenter="highlightIframeComp(comp.index, true)"
                      @mouseleave="highlightIframeComp(comp.index, false)"
                      @click="clickIframeComp(comp.index)"
                    >
                      <span class="comp-label-num">{{ comp.index + 1 }}</span>
                      <span class="comp-label-name">{{ comp.name }}</span>
                    </span>
                  </div>
                  <!-- 预览 iframe：分析后用标注 HTML（后端或前端生成），分析前用原始 HTML -->
                  <iframe
                    ref="previewIframeRef"
                    :src="effectivePreviewUrl"
                    class="html-preview-iframe"
                    :key="previewUrlKey"
                    @load="onPreviewIframeLoad"
                  ></iframe>
                </div>
              </div>

              <!-- 组件拆分结果：列表 + 勾选 -->
              <div v-if="splitComponents.length > 0" class="split-components-panel">
                <div class="split-panel-head">
                  <span class="split-panel-title">
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <rect x="3" y="3" width="7" height="7" rx="1" />
                      <rect x="14" y="3" width="7" height="5" rx="1" />
                      <rect x="3" y="14" width="7" height="7" rx="1" />
                      <rect x="14" y="12" width="7" height="9" rx="1" />
                    </svg>
                    拆分出的组件 ({{ splitComponents.length }})
                  </span>
                  <label class="split-select-all">
                    <input
                      type="checkbox"
                      :checked="splitComponents.every((c) => splitSelections[c.index]?.selected)"
                      @change="toggleAllSplitSelections"
                    />
                    <span>全选</span>
                  </label>
                </div>
                <div class="split-comp-list">
                  <div
                    v-for="comp in splitComponents"
                    :key="comp.index"
                    class="split-comp-row"
                    :class="{
                      'split-comp--selected': splitSelections[comp.index]?.selected,
                      'split-comp--hover': hoveredSplitIdx === comp.index
                    }"
                    @click="toggleSplitSelection(comp.index)"
                    @mouseenter="highlightIframeComp(comp.index, true)"
                    @mouseleave="highlightIframeComp(comp.index, false)"
                  >
                    <label class="split-comp-check" @stop.prevent>
                      <input
                        type="checkbox"
                        :checked="splitSelections[comp.index]?.selected"
                        @change.stop="toggleSplitSelection(comp.index)"
                        @click.stop
                      />
                    </label>
                    <span class="split-comp-idx">{{ comp.index + 1 }}</span>
                    <span class="split-comp-name" :title="comp.name">{{ comp.name }}</span>
                    <span v-if="comp.strategy" class="split-comp-strategy">
                      {{ comp.strategy }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <!-- /html-split-row -->

            <p class="source-hint">
              上传 HTML 原型和/或需求文档后，AI 将根据已有文件分析并拆分组件。
            </p>
          </div>
        </div>

        <!-- 技术栈 + 规格 + CTA -->
        <div class="action-row">
          <div class="tech-chips">
            <CodeTypeToggle v-model="compType" :disabled="busy" />
          </div>
          <div class="seg-wrap">
            <TierToggle v-model="genTier" :disabled="busy" :disabled-values="tierDisabledValues" />
          </div>
          <RippleButton
            class="cta"
            :class="{ busy }"
            :disabled="ctaDisabled"
            :ripple-color="busy ? '#ef4444' : 'rgba(59,130,246,0.5)'"
            :duration="650"
            @click="onCtaClick"
          >
            <span v-if="busy || submitting" class="spinner"></span>
            {{ busy ? '终止生成' : submitting ? '校验配置...' : generateButtonText }}
          </RippleButton>
        </div>

        <div v-if="!busy" class="quota-bar" v-show="quotaInfo">
          <span>
            今日 {{ quotaInfo?.daily?.used || 0 }}/{{ quotaInfo?.daily?.limit || 15 }} · 本小时
            {{ quotaInfo?.hourly?.used || 0 }}/{{ quotaInfo?.hourly?.limit || 5 }}
          </span>
        </div>
      </main>

      <!-- 右栏：今日概览 + 最近生成 -->
      <aside class="right-panel" id="rightPanel">
        <div class="r-head">
          <div class="r-title">
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            >
              <rect x="3" y="3" width="7" height="9" rx="1" />
              <rect x="14" y="3" width="7" height="5" rx="1" />
              <rect x="14" y="12" width="7" height="9" rx="1" />
              <rect x="3" y="16" width="7" height="5" rx="1" />
            </svg>
            今日概览
          </div>
          <router-link class="r-link" to="/tasks">查看全部</router-link>
        </div>

        <div class="ov-grid">
          <div class="ov-card" role="button" tabindex="0" @click="onStatClick('total')">
            <div class="ov-num">{{ taskSummary?.total ?? 0 }}</div>
            <div class="ov-label">总任务</div>
          </div>
          <div class="ov-card done" role="button" tabindex="0" @click="onStatClick('completed')">
            <div class="ov-num">{{ taskSummary?.completed ?? 0 }}</div>
            <div class="ov-label">已完成</div>
          </div>
          <div class="ov-card prog" role="button" tabindex="0" @click="onStatClick('running')">
            <div class="ov-num">{{ taskSummary?.running ?? 0 }}</div>
            <div class="ov-label">进行中</div>
          </div>
          <div class="ov-card fail" role="button" tabindex="0" @click="onStatClick('failed')">
            <div class="ov-num">{{ taskSummary?.failed ?? 0 }}</div>
            <div class="ov-label">失败</div>
          </div>
        </div>

        <div class="recent-head">
          <div class="recent-title">
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            >
              <path d="M12 8v4l3 2" />
              <circle cx="12" cy="12" r="9" />
            </svg>
            最近生成
          </div>
          <router-link class="r-link" to="/tasks">更多</router-link>
        </div>
        <div class="task-list">
          <div
            v-for="(t, i) in recent"
            :key="`${t.sessionId || t.name}-${i}`"
            class="task-item"
            :class="{ 'is-failed': t.status === 'failed' }"
            role="button"
            tabindex="0"
            @click="onTaskSelect(t)"
            @keydown.enter.prevent="onTaskSelect(t)"
            @keydown.space.prevent="onTaskSelect(t)"
          >
            <span class="state-dot" :class="historyDotClass(t.status)"></span>
            <div class="task-main">
              <div class="task-name" :title="t.name">{{ t.name }}</div>
              <div class="task-time">{{ historyTimeText(t) }}</div>
              <div class="task-meta" v-if="t.status !== 'running'">
                <span class="task-source" v-if="getRecentSource(t)">{{ sourceLabel(getRecentSource(t)) }}</span>
                <span class="task-duration" v-if="t.duration">{{ formatRecentDuration(t.duration) }}</span>
              </div>
              <div class="task-degraded" v-if="t.visualDegraded && t.status !== 'running'">⚠ 视觉分析降级，布局可能偏离设计稿</div>
              <div class="task-degraded" v-if="t.degradedScriptParts && t.degradedScriptParts.length && t.status !== 'running'">⚠ 生成不完整（{{ degradedScriptPartsLabel(t.degradedScriptParts) }}），可二次生成</div>
              <div class="task-degraded" v-if="t.missingFiles && t.missingFiles.length && t.status !== 'running'">⚠ 缺失关键文件（{{ t.missingFiles.join('、') }}），可进入编辑器补全</div>
              <div class="task-degraded task-degraded--retry" v-if="t.status === 'failed' && t.checkpointStatus && t.checkpointStatus !== 'none'">已缓存{{ checkpointCacheLabel(t.checkpointStatus) }}，换模型重试可秒续</div>
            </div>
            <span class="task-tag" :class="historyTagClass(t)">{{ historyTagText(t) }}</span>
          </div>
        </div>
        <div v-if="!recent.length" class="empty-state">
          <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="4" y="8" width="32" height="24" rx="3" opacity=".5" />
            <path d="M12 18h16M12 24h10" stroke-linecap="round" opacity=".4" />
          </svg>
          <span class="es-text">暂无任务记录</span>
          <span class="es-hint">生成组件后将在此显示</span>
        </div>
      </aside>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/config'
import { generateLite, batchGenerate, cancelTask } from '@/api/lite'
import { fetchFigmaPreview } from '@/api/generator'
import TierToggle from '@/components/common/TierToggle.vue'
import CodeTypeToggle from '@/components/common/CodeTypeToggle.vue'
import RippleButton from '@/components/inspira-ui/RippleButton.vue'
import http from '@/core/http'

// ═══ 状态 ═══
const configStore = useConfigStore()
const router = useRouter()

const SOURCE_MODE_KEY = 'mvgo_generate_source_mode'
const mode = ref('single')
const isDev = import.meta.env.DEV
const savedSourceMode = localStorage.getItem(SOURCE_MODE_KEY)
const sourceMode = ref(
  ['screenshot', 'figma'].includes(savedSourceMode) ? savedSourceMode : 'screenshot'
)
const figmaUrl = ref('')
// ── Figma 预览图显式状态机 ──
type PreviewStatus = 'idle' | 'invalid' | 'pending' | 'loading' | 'ready' | 'error' | 'confirmed'
type PreviewErrorType =
  | 'invalid-url'
  | 'permission'
  | 'node-not-found'
  | 'timeout'
  | 'rate-limit'
  | 'network'
  | 'image-load'
  | 'unknown'
type FigmaPreviewData = {
  imageUrl: string
  nodeName: string
  width?: number
  height?: number
  previewToken: string
  sourceUrl: string
  imageLoaded: boolean
}
type PreviewDisplayData = Omit<FigmaPreviewData, 'previewToken' | 'imageLoaded'>
type PreviewErrorInfo = {
  type: PreviewErrorType
  title: string
  message: string
}

const previewStatus = ref<PreviewStatus>('idle')
const figmaPreview = ref<FigmaPreviewData | null>(null)
const retainedPreview = ref<PreviewDisplayData | null>(null)
const previewError = ref<PreviewErrorInfo | null>(null)
const previewConfirmed = ref(false)
const confirmedPreviewUrl = ref('')
const previewCache = new Map<string, FigmaPreviewData>()
let previewDebounce: ReturnType<typeof setTimeout> | null = null
let previewRequestId = 0
let previewAbortController: AbortController | null = null
const images = ref([])
const htmlFile = ref(null)
const htmlBlobUrl = ref('')
const htmlAssets = ref([]) // 配套资源（CSS/JS/图片）
const cachedInlineHtml = ref('') // 缓存 buildInlineHtml 的输出（已内联 CSS/JS 的完整 HTML），供标注函数复用
const htmlError = ref('')
const previewIframeRef = ref(null)
const hoveredSplitIdx = ref(null)
// 拆分相关状态
const htmlContentCache = ref('') // 缓存读取的 HTML 内容
const splitPreviewHtml = ref('') // 带标注的预览 HTML
const rawHtmlPreview = ref('') // 原始 HTML 预览（丢入后立即显示）
const splitAnalyzing = ref(false) // 分析中
const splitComponents = ref([]) // 识别到的组件列表
const splitFileName = ref('') // 文件名（去后缀）
const splitSelections = ref({}) // { [index]: { selected: boolean, componentType: 'vue3'|'microcode' } }

// 切换单个组件选中状态
function toggleSplitSelection(index) {
  const sel = splitSelections.value[index]
  if (sel) {
    sel.selected = !sel.selected
  }
  // 同步选中高亮到预览 iframe
  nextTick(() => syncSelectedHighlightsToIframe())
}
// 全选 / 反切
function toggleAllSplitSelections() {
  const allSelected = splitComponents.value.every((c) => splitSelections.value[c.index]?.selected)
  for (const comp of splitComponents.value) {
    if (splitSelections.value[comp.index]) {
      splitSelections.value[comp.index].selected = !allSelected
    }
  }
  nextTick(() => syncSelectedHighlightsToIframe())
}
const splitGenerating = ref(false) // 拆分生成中
const splitBuilding = ref(false) // 组件拆分交付包打包中（docx-html 模式）
const splitResults = ref([]) // 生成返回的组件信息
const activeHtmlBatchId = ref('') // HTML 拆分批次号
let manualCompCounter = 0 // 手动框选组件计数器
const compType = ref('vue3')
const genTier = ref('lite')
const panelType = ref('default-panel')
const compName = ref('')
const requirementDoc = ref('')
const docAnalysis = ref(null)
const busy = ref(false)
const submitting = ref(false)
const genMsg = ref('')
const elapsed = ref('')
// 驱动「最近生成」列表相对时间刷新（60s 间隔，精度到分钟级）
const historyTick = ref(0)
let historyTimer: ReturnType<typeof setInterval> | null = null
const previewUrl = ref('')
const result = ref(false)
const resultSessionId = ref('')
// 极速通过标记：本次生成由用户点击「跳过剩余阶段」完成（产物未经 AI 对抗修正）
const drag = ref(false)
const fileInput = ref(null)
const htmlFileInput = ref(null)
// HTML + 需求文档 模式
const docxFile = ref(null)
const docxDrag = ref(false)
const docxFileInput = ref(null)
const htmlDrag = ref(false) // 双栏 HTML 拖拽状态
const quotaInfo = ref(null)
const urlHistory = ref([])
const showUrlHistory = ref(false)
const logs = ref([])
const recent = ref([])
const taskSummary = ref(null)
let es = null
let timer = null
let startAt = 0

// 管线阶段（4 步）
const stages = ref([
  { key: 'analyze', label: '分析', status: 'pending' },
  { key: 'generate', label: '生成', status: 'pending' },
  { key: 'quality', label: '校验', status: 'pending' },
  { key: 'complete', label: '完成', status: 'pending' }
])

// HTML 拆分子任务 SSE 连接与状态
const splitResultStreams = ref({}) // { [sessionId]: EventSource }
const splitOverallProgress = ref({ total: 0, completed: 0, failed: 0 })

// 批量（保留，当前 UI 不可达）
const batchProgress = ref(null)
const batchItems = ref([])
const batchEta = ref('')

// ═══ 派生状态 ═══
const normalizeFigmaUrl = (url: string) => url.trim()
const isValidFigmaUrl = computed(() =>
  /^https?:\/\/(?:www\.)?figma\.com\/(?:file|design|proto)\//i.test(
    normalizeFigmaUrl(figmaUrl.value)
  )
)
const isLoadingPreview = computed(() => previewStatus.value === 'loading')
const canConfirmFigmaPreview = computed(
  () =>
    previewStatus.value === 'ready' &&
    !!figmaPreview.value?.imageLoaded &&
    !!figmaPreview.value?.previewToken &&
    figmaPreview.value.sourceUrl === normalizeFigmaUrl(figmaUrl.value)
)
const previewActionText = computed(() => {
  if (previewStatus.value === 'loading' || previewStatus.value === 'pending') return '获取中...'
  if (previewStatus.value === 'error') return '重新获取'
  // ready / confirmed 让位给主 CTA（确认此预览 / 生成 Lite Vue3），这里只承担"重新获取"
  if (previewStatus.value === 'ready' || previewStatus.value === 'confirmed') return '重新获取'
  return '获取预览'
})

const tierLabel = computed(() => (genTier.value === 'lite' ? 'Lite' : 'Max'))
// v3: 仅 Figma 来源允许 Max，其他来源（截图/网页）Max 禁用，Lite 保持可选
const tierAllowedSources = ['figma']
const tierDisabledValues = computed(() =>
  tierAllowedSources.includes(sourceMode.value) ? [] : ['max']
)
const imageMetaText = computed(() => {
  const image = images.value[0]
  if (!image) return ''
  const parts = []
  if (image.width && image.height) parts.push(`${image.width} × ${image.height}`)
  if (image.size) parts.push(formatFileSize(image.size))
  return parts.join(' · ') || '图片已就绪'
})
const docxMetaText = computed(() => {
  if (!docxFile.value) return ''
  return `${formatFileSize(docxFile.value.size)} · 需求文档`
})
const generateButtonText = computed(() => {
  if (sourceMode.value === 'screenshot')
    return `使用截图生成${compType.value === 'vue3' ? ' Vue3' : '微码组件'}`
  if (sourceMode.value === 'html') {
    if (splitAnalyzing.value) return '分析中...'
    if (splitComponents.value.length > 0)
      return `生成选中的组件 (${Object.values(splitSelections.value).filter((s) => s.selected).length}/${splitComponents.value.length})`
    return '分析 HTML 文件'
  }
  if (sourceMode.value === 'docx-html') {
    if (splitAnalyzing.value) return '分析中...'
    if (splitBuilding.value) return '正在生成交付包...'
    if (splitComponents.value.length > 0)
      return `导出选中的组件 MD (${Object.values(splitSelections.value).filter((s) => s.selected).length}/${splitComponents.value.length})`
    return '分析需求与 HTML'
  }
  // figma：先确认预览，再生成
  if (previewStatus.value === 'ready') return '确认此预览'
  if (previewStatus.value === 'confirmed')
    return `生成 ${tierLabel.value} ${compType.value === 'vue3' ? 'Vue3' : '微码组件'}`
  return `生成 ${tierLabel.value} ${compType.value === 'vue3' ? 'Vue3' : '微码组件'}`
})
const disabledReason = computed(() => {
  if (sourceMode.value === 'screenshot') return '请先上传一张截图'
  if (sourceMode.value === 'html') {
    if (htmlError.value) return htmlError.value
    if (!htmlFile.value) return '请先上传一个 HTML 文件'
    if (splitAnalyzing.value) return '正在分析 HTML 结构...'
    if (splitComponents.value.length > 0) return ''
    return '请点击按钮分析 HTML 文件'
  }
  if (sourceMode.value === 'docx-html') {
    if (htmlError.value) return htmlError.value
    if (!htmlFile.value && !docxFile.value) return '请上传 HTML 原型或需求文档'
    if (splitAnalyzing.value) return '正在分析需求与 HTML...'
    if (splitBuilding.value) return '正在生成交付包...'
    if (splitComponents.value.length > 0) return ''
    return '请点击按钮开始分析'
  }
  if (!figmaUrl.value.trim()) return '请先粘贴 Figma 文件或节点链接'
  if (!isValidFigmaUrl.value) return '请输入有效的 Figma 文件或节点链接'
  if (previewStatus.value === 'loading' || previewStatus.value === 'pending')
    return '正在获取 Figma 预览图'
  if (previewStatus.value === 'error') return previewError.value?.message || '请重新获取预览图'
  if (previewStatus.value === 'ready') return '' // 主 CTA 此时显示"确认此预览"，无需再提示
  if (!previewConfirmed.value) return '请先确认预览图'
  return ''
})

const canGo = computed(() => {
  if (busy.value) return false
  if (sourceMode.value === 'screenshot') return images.value.length === 1
  if (sourceMode.value === 'html')
    return !!htmlFile.value && !htmlError.value && !splitAnalyzing.value
  if (sourceMode.value === 'docx-html')
    return (
      (!!htmlFile.value || !!docxFile.value) &&
      !htmlError.value &&
      !splitAnalyzing.value &&
      !splitBuilding.value
    )
  return (
    isValidFigmaUrl.value &&
    previewConfirmed.value &&
    previewStatus.value === 'confirmed' &&
    confirmedPreviewUrl.value === normalizeFigmaUrl(figmaUrl.value) &&
    !!figmaPreview.value?.imageLoaded &&
    !!figmaPreview.value?.previewToken
  )
})

// figma ready 状态下：CTA 由"可确认"门控控制，否则维持 canGo 逻辑
const ctaDisabled = computed(() => {
  if (submitting.value) return true
  if (busy.value) return false
  if (sourceMode.value === 'figma' && previewStatus.value === 'ready')
    return !canConfirmFigmaPreview.value
  return !canGo.value
})

// figma ready 状态下：点 CTA = 确认预览；其他态 = 走 go()
function onCtaClick() {
  if (busy.value) {
    cancel()
    return
  }
  if (sourceMode.value === 'figma' && previewStatus.value === 'ready') {
    confirmFigmaPreview()
    return
  }
  go()
}

// ═══ 标注预览 URL（分析后切换到带组件边界的 previewHtml）═══
const annotatedPreviewUrl = ref('')
let _annotatedBlobUrl = '' // 跟踪上一次的 blob URL，用于释放

/**
 * 用原始 HTML + 组件列表，在前端生成带标注边界的预览 HTML。
 * 用于 Java 后端不返回 previewHtml 的场景（docx-html 模式）。
 */
function buildClientAnnotatedHtml(originalHtml: string, components: any[]): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(originalHtml, 'text/html')

  // 注入高亮样式（与后端 generatePreviewHtml 一致）
  const style = doc.createElement('style')
  style.textContent = `
[data-split-idx] { transition: outline .15s ease, box-shadow .15s ease, background .15s ease; cursor: pointer; }
[data-split-idx]:hover { outline: 2px solid #3b82f6 !important; outline-offset: 2px; box-shadow: 0 0 0 4px rgba(59,130,246,.1); }
[data-split-idx].highlighted { outline: 3px solid #10b981 !important; outline-offset: 2px; box-shadow: 0 0 0 6px rgba(16,185,129,.15); }
[data-split-idx].clicked-highlighted { outline: 3px solid #f59e0b !important; outline-offset: 3px; box-shadow: 0 0 0 8px rgba(245,158,11,.18); }
/* 选中态持久高亮（用户勾选的组件） */
[data-split-idx].selected-highlighted {
  outline: 3px solid #2563eb !important;
  outline-offset: -1px;
  box-shadow:
    0 0 0 4px rgba(37,99,235,.12),
    inset 0 0 0 1px rgba(37,99,235,.1);
  background: rgba(37,99,235,.06) !important;
  position: relative;
}
/* 选中态角标：左上角蓝底"✓ 已选" */
[data-split-idx].selected-highlighted::before {
  content: '✓';
  position: absolute;
  top: -1px; left: -1px;
  width: 20px; height: 20px;
  background: #2563eb;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0 0 4px 0;
  z-index: 10000;
  line-height: 1;
}
.split-label {
  position:absolute; top:-1px; left:-1px;
  background:linear-gradient(135deg,#3b82f6,#2563eb);
  color:#fff; font-size:10px; font-weight:700;
  padding:1px 6px; border-radius:0 0 4px 0;
  z-index:9999; line-height:1.4; pointer-events:none;
}
`
  doc.head.appendChild(style)

  // 注入 postMessage 脚本（与后端一致的高亮协议）
  const script = doc.createElement('script')
  script.textContent = `
(function(){
  window.addEventListener('message',function(e){
    var d=e.data||{},t=d.type,idx=d.idx;
    if(!idx)return;
    var el=document.querySelector('[data-split-idx="'+idx+'"]');
    if(!el)return;
    if(t==='highlight')el.classList.add('highlighted');
    else if(t==='unhighlight')el.classList.remove('highlighted');
    else if(t==='click-highlight'){
      document.querySelectorAll('[data-split-idx].clicked-highlighted').forEach(function(n){n.classList.remove('clicked-highlighted');n.classList.remove('highlighted');});
      el.classList.add('clicked-highlighted');el.classList.add('highlighted');
      el.scrollIntoView({behavior:'smooth',block:'center'});
    }
    /* 选中态持久高亮 */
    else if(t==='selected-highlight'){ el.classList.add('selected-highlighted'); }
    else if(t==='unselected-highlight'){ el.classList.remove('selected-highlighted'); }
    /* 批量同步选中状态 */
    else if(t==='sync-selected' && Array.isArray(d.indices)){
      var set={};
      (d.indices||[]).forEach(function(i){ set[String(i)]=true; });
      document.querySelectorAll('[data-split-idx]').forEach(function(n){
        var ni=n.getAttribute('data-split-idx');
        if(set[ni]) n.classList.add('selected-highlighted');
        else n.classList.remove('selected-highlighted');
      });
    }
  });
  // 上报文档高度
  window.addEventListener('load',function(){window.parent.postMessage({type:'doc-height',height:document.documentElement.scrollHeight},'*');});
})();
`
  doc.body.appendChild(script)

  // 尝试按组件的 name/strategy 匹配 DOM 元素并标注
  const matchedIndices = new Set<number>()
  for (const comp of components) {
    let target: Element | null = null

    // ── 策略 1：精确选择器（id / class / data 属性）──
    const selectors = [
      `[id="${comp.name}"]`,
      `[class*="${comp.name}"]`,
      comp.strategy === 'class-name' ? `.${comp.name}` : null,
      comp.strategy === 'explicit' ? `[data-component="${comp.name}"]` : null,
    ].filter(Boolean) as string[]

    for (const sel of selectors) {
      const found = doc.querySelector(sel)
      if (found) { target = found; break }
    }

    // ── 策略 2：文本内容匹配（中文组件名）──
    if (!target && /[\u4e00-\u9fff]/.test(comp.name)) {
      // 查找直接或间接包含该文本的可视元素（排除 script/style）
      const walker = doc.createTreeWalker(
        doc.body,
        NodeFilter.SHOW_TEXT,
        { acceptNode: (n) => {
          const t = n.textContent?.trim() || ''
          // 文本必须包含组件名（或被组件名包含），且长度合理
          if (t.length > 0 && t.length < 200 &&
              (t.includes(comp.name) || comp.name.includes(t))) {
            return NodeFilter.FILTER_ACCEPT
          }
          return NodeFilter.FILTER_REJECT
        }}
      )
      let textNode: Text | null = null
      while (walker.nextNode()) { textNode = walker.currentNode as Text }
      if (textNode) {
        // 向上找到最近的块级/语义容器
        let el = textNode.parentElement
        while (el && el !== doc.body) {
          const tag = el.tagName.toLowerCase()
          if (['div','section','article','aside','nav','header','footer','main',
               'li','tr','td','th','figure','details','summary'].includes(tag)) {
            target = el
            break
          }
          el = el.parentElement
        }
        // 如果没找到块级容器，就用父元素
        if (!target) target = textNode.parentElement
      }
    }

    // ── 策略 3：按顺序降级 —— 匹配页面主要区块 ──
    if (!target) {
      // 收集所有候选容器（排除已匹配的）
      // ⚠️ 注意：DOMParser 解析的文档未挂载到视口，
      //   getBoundingClientRect() 全部返回 {width:0, height:0}，不可用于面积判断。
      //   改用 textContent.length + 子元素数作为"内容量"近似值。
      const candidates = Array.from(doc.querySelectorAll('div, section, article, aside, nav, header, footer, main'))
        .filter((el) => !matchedIndices.has(Number(el.getAttribute('data-split-idx'))))
        .filter((el) => {
          // 用文本长度和子元素数代替 getBoundingClientRect
          const textLen = (el.textContent || '').length
          const childCount = el.querySelectorAll('*').length
          return textLen > 20 && childCount >= 2  // 有实际内容的容器
        })
      // 取还没被匹配的最大"内容量"元素
      candidates.sort((a, b) => {
        const sa = (a.textContent || '').length + a.querySelectorAll('*').length
        const sb = (b.textContent || '').length + b.querySelectorAll('*').length
        return sb - sa
      })
      if (candidates.length > 0) target = candidates[0]
    }

    // 诊断：记录每个组件的匹配策略和目标元素标签
    console.log(`[buildClientAnnotatedHtml] 组件[${comp.index}] "${comp.name}" strategy=${target ? (matchedIndices.has(comp.index) ? 'already' : 'NEW') : 'MISS'} tag=${target?.tagName.toLowerCase() || '-'} textLen=${target ? (target.textContent||'').length : 0}`)

    if (target) {
      target.setAttribute('data-split-idx', String(comp.index))
      matchedIndices.add(comp.index)
      // 添加序号标签
      const label = doc.createElement('span')
      label.className = 'split-label'
      label.textContent = String(comp.index + 1)
      ;(target as HTMLElement).style.position = 'relative'
      target.appendChild(label)
    }
  }

  // 汇总诊断
  const totalMatched = matchedIndices.size
  const totalComponents = components.length
  console.log(`[buildClientAnnotatedHtml] 匹配汇总: ${totalMatched}/${totalComponents} 组件成功标注, 未匹配=${totalComponents - totalMatched}`)
  // 列出未匹配组件名（方便排查）
  if (totalMatched < totalComponents) {
    const missed = components.filter(c => !matchedIndices.has(c.index)).map(c => `"${c.name}"`)
    console.warn(`[buildClientAnnotatedHtml] 未匹配组件: ${missed.join(', ')}`)
  }

  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML
}

watch(
  () => splitPreviewHtml.value,
  (html) => {
    // 释放旧的标注 blob
    if (_annotatedBlobUrl) {
      URL.revokeObjectURL(_annotatedBlobUrl)
      _annotatedBlobUrl = ''
    }

    if (html && splitComponents.value.length > 0) {
      // 后端提供了完整标注 HTML → 直接使用（Node 端点）
      _annotatedBlobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
      annotatedPreviewUrl.value = _annotatedBlobUrl
    } else if (splitComponents.value.length > 0 && htmlFile.value?.content) {
      // 后端没给 previewHtml（Java 端点）→ 前端自行标注（基于已内联 CSS/JS 的 HTML）
      const sourceHtml = cachedInlineHtml.value || htmlFile.value.content
      const annotated = buildClientAnnotatedHtml(sourceHtml, splitComponents.value)
      _annotatedBlobUrl = URL.createObjectURL(new Blob([annotated], { type: 'text/html' }))
      annotatedPreviewUrl.value = _annotatedBlobUrl
    } else {
      // 分析前 → 回退到原始 HTML 预览
      annotatedPreviewUrl.value = ''
    }
  },
  { immediate: true }
)

// 兜底：Java 后端不返回 previewHtml 时 splitPreviewHtml 值不变（''→'')，
// watch 不会触发。此 watcher 确保 splitComponents 到达时仍能生成前端标注。
watch(
  () => splitComponents.value.length,
  (len, oldLen) => {
    // 仅当组件从 0 变为 N 且当前没有标注 URL 时触发（避免重复生成）
    if (len > 0 && oldLen === 0 && !annotatedPreviewUrl.value && htmlFile.value?.content && !splitPreviewHtml.value) {
      // 使用已内联 CSS/JS 的 HTML（cachedInlineHtml），而非原始 htmlFile.content
      // 原始 HTML 中的 <link href="style.css"> 在 blob URL 上下文中无法解析，会导致样式丢失
      const sourceHtml = cachedInlineHtml.value || htmlFile.value.content
      const annotated = buildClientAnnotatedHtml(sourceHtml, splitComponents.value)
      if (_annotatedBlobUrl) URL.revokeObjectURL(_annotatedBlobUrl)
      _annotatedBlobUrl = URL.createObjectURL(new Blob([annotated], { type: 'text/html' }))
      annotatedPreviewUrl.value = _annotatedBlobUrl
    }
  }
)

// iframe 实际使用的 src：有标注用标注，无标注用原始
const effectivePreviewUrl = computed(() => annotatedPreviewUrl.value || htmlBlobUrl.value)
const previewUrlKey = computed(() => {
  if (splitPreviewHtml.value || splitComponents.value.length > 0)
    return 'annotated-' + splitComponents.value.length
  return 'raw-' + (htmlFile.value?.name || '') + '-' + (htmlFile.value?.size || 0)
})

// ═══ iframe 联动高亮：向标注预览发送 postMessage ═══
function highlightIframeComp(idx: number, isHover: boolean) {
  const iframe = previewIframeRef.value
  if (!iframe?.contentWindow) return
  iframe.contentWindow.postMessage(
    { type: isHover ? 'highlight' : 'unhighlight', idx: String(idx) },
    '*'
  )
}
function clickIframeComp(idx: number) {
  const iframe = previewIframeRef.value
  if (!iframe?.contentWindow) return
  iframe.contentWindow.postMessage({ type: 'click-highlight', idx: String(idx) }, '*')
}

/** 将当前所有选中组件的索引批量同步到 iframe，使选中态高亮与勾选状态一致 */
function syncSelectedHighlightsToIframe() {
  const iframe = previewIframeRef.value
  if (!iframe?.contentWindow) return
  const selectedIndices = splitComponents.value
    .filter((c) => splitSelections.value[c.index]?.selected)
    .map((c) => c.index)
  iframe.contentWindow.postMessage(
    { type: 'sync-selected', indices: selectedIndices },
    '*'
  )
}

/** iframe 加载完成后同步选中高亮（确保 postMessage 监听器已注册） */
function onPreviewIframeLoad() {
  // 微延时确保 iframe 内脚本执行完毕
  setTimeout(() => syncSelectedHighlightsToIframe(), 80)
}

watch(sourceMode, (value) => {
  localStorage.setItem(SOURCE_MODE_KEY, value)
  showUrlHistory.value = false
  // 切到非 Figma / HTML 来源时，Max 不可选，自动回落到 Lite
  if (!tierAllowedSources.includes(value) && genTier.value === 'max') {
    genTier.value = 'lite'
  }
})

// ─ Figma URL 变化时立即废弃旧请求，再自动加载新预览 ──
watch(figmaUrl, (newUrl) => {
  if (previewDebounce) {
    clearTimeout(previewDebounce)
    previewDebounce = null
  }

  // URL 一变化就令旧请求失效并取消网络请求，不能等新请求开始后才处理。
  previewRequestId += 1
  previewAbortController?.abort()
  previewAbortController = null
  previewConfirmed.value = false
  confirmedPreviewUrl.value = ''
  previewError.value = null

  if (figmaPreview.value?.imageLoaded) {
    retainedPreview.value = {
      imageUrl: figmaPreview.value.imageUrl,
      nodeName: figmaPreview.value.nodeName,
      width: figmaPreview.value.width,
      height: figmaPreview.value.height,
      sourceUrl: figmaPreview.value.sourceUrl
    }
  }
  // 立即清除旧 token，保留的旧预览不包含 token，因此不能被确认或用于生成。
  figmaPreview.value = null

  const normalizedUrl = normalizeFigmaUrl(newUrl)
  if (!normalizedUrl) {
    retainedPreview.value = null
    previewStatus.value = 'idle'
    return
  }
  if (!isValidFigmaUrl.value) {
    retainedPreview.value = null
    previewError.value = createPreviewError('invalid-url')
    previewStatus.value = 'invalid'
    return
  }

  const cached = previewCache.get(normalizedUrl)
  if (cached?.imageLoaded) {
    figmaPreview.value = { ...cached }
    retainedPreview.value = null
    previewStatus.value = 'ready'
    return
  }

  previewStatus.value = 'pending'
  previewDebounce = setTimeout(() => {
    previewDebounce = null
    void loadFigmaPreview()
  }, 700)
})

function createPreviewError(type: PreviewErrorType, detail = ''): PreviewErrorInfo {
  const errors: Record<PreviewErrorType, PreviewErrorInfo> = {
    'invalid-url': {
      type,
      title: '链接格式不正确',
      message: '请输入 Figma 文件、设计稿或节点链接。'
    },
    permission: {
      type,
      title: '无权访问 Figma 文件',
      message: '请检查 Figma Token 权限，或确认文件已向当前账号开放。'
    },
    'node-not-found': {
      type,
      title: '未找到指定节点',
      message: '请确认链接中的 node-id 有效，且节点未被删除。'
    },
    timeout: { type, title: '获取预览超时', message: 'Figma 响应时间过长，请检查网络后重新获取。' },
    'rate-limit': {
      type,
      title: 'Figma 请求频率受限',
      message: '请求过于频繁，请稍等片刻后重新获取。'
    },
    network: {
      type,
      title: '网络连接失败',
      message: '无法连接预览服务，请检查网络或后端服务状态。'
    },
    'image-load': {
      type,
      title: '预览图片加载失败',
      message: '预览信息已返回，但图片无法显示，请重新获取。'
    },
    unknown: { type, title: '预览加载失败', message: detail || '暂时无法获取预览图，请稍后重试。' }
  }
  const error = errors[type]
  return detail && type !== 'unknown'
    ? { ...error, message: `${error.message}（${detail}）` }
    : error
}

function classifyPreviewError(err: any): PreviewErrorInfo {
  const status = Number(err?.response?.status || err?.status || 0)
  const rawMessage = String(
    err?.response?.data?.error || err?.response?.data?.message || err?.message || ''
  )
  const message = rawMessage.toLowerCase()
  if (
    status === 401 ||
    status === 403 ||
    /permission|forbidden|unauthorized|无权|权限/.test(message)
  ) {
    return createPreviewError('permission')
  }
  if (status === 404 || /node.?not.?found|节点.*不存在|not found/.test(message)) {
    return createPreviewError('node-not-found')
  }
  if (status === 429 || /rate.?limit|too many requests|频率|限流/.test(message)) {
    return createPreviewError('rate-limit')
  }
  if (err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT' || /timeout|超时/.test(message)) {
    return createPreviewError('timeout')
  }
  if (!err?.response || /network|fetch failed|连接失败/.test(message)) {
    return createPreviewError('network')
  }
  return createPreviewError('unknown', rawMessage)
}

async function loadFigmaPreview() {
  const requestUrl = normalizeFigmaUrl(figmaUrl.value)
  if (!isValidFigmaUrl.value) {
    retainedPreview.value = null
    previewError.value = createPreviewError('invalid-url')
    previewStatus.value = 'invalid'
    return
  }

  if (previewDebounce) {
    clearTimeout(previewDebounce)
    previewDebounce = null
  }
  const cached = previewCache.get(requestUrl)
  if (cached?.imageLoaded) {
    figmaPreview.value = { ...cached }
    retainedPreview.value = null
    previewError.value = null
    previewStatus.value = 'ready'
    return
  }

  previewAbortController?.abort()
  const controller = new AbortController()
  previewAbortController = controller
  const myId = ++previewRequestId
  previewError.value = null
  figmaPreview.value = null
  previewStatus.value = 'loading'

  try {
    const rawCfg = configStore.config
    const result = await fetchFigmaPreview(
      {
        figmaUrl: requestUrl,
        figmaToken: rawCfg?.figmaToken,
        config: rawCfg
      },
      { signal: controller.signal }
    )
    if (myId !== previewRequestId || controller.signal.aborted) return

    if (!result.success) {
      previewError.value = classifyPreviewError({
        status: result.code || result.status,
        message: result.error || result.message,
        response: { status: result.code || result.status, data: result }
      })
      retainedPreview.value = null
      previewStatus.value = 'error'
      return
    }

    const data = result.data || result
    if (!data.imageUrl || !data.previewToken) {
      previewError.value = createPreviewError('unknown', '服务未返回有效的图片或预览令牌')
      retainedPreview.value = null
      previewStatus.value = 'error'
      return
    }

    // 暂时保持 loading；隐藏探针图片触发 load 后才会进入 ready。
    figmaPreview.value = {
      imageUrl: data.imageUrl,
      nodeName: data.nodeName || 'Figma 节点',
      width: data.width,
      height: data.height,
      previewToken: data.previewToken,
      sourceUrl: requestUrl,
      imageLoaded: false
    }
  } catch (err: any) {
    if (myId !== previewRequestId || controller.signal.aborted || err?.code === 'ERR_CANCELED')
      return
    previewError.value = classifyPreviewError(err)
    retainedPreview.value = null
    previewStatus.value = 'error'
  } finally {
    // 旧请求只能清理自己的 controller，不能关闭或改写新请求的 loading 状态。
    if (myId === previewRequestId && previewAbortController === controller) {
      previewAbortController = null
    }
  }
}

// 组件卸载后置 true：任何挂起的预览图片 load/error 异步回调都应直接放弃，
// 避免对已卸载 DOM 节点 patch（表现为 Vue 内部 null.insertBefore 崩溃）。
let previewDisposed = false

function handlePreviewImageLoad() {
  if (previewDisposed) return
  const preview = figmaPreview.value
  const currentUrl = normalizeFigmaUrl(figmaUrl.value)
  if (!preview || preview.sourceUrl !== currentUrl || previewStatus.value !== 'loading') return
  preview.imageLoaded = true
  previewCache.set(currentUrl, { ...preview })
  retainedPreview.value = null
  previewError.value = null
  previewStatus.value = 'ready'
}

function handlePreviewImageError() {
  if (previewDisposed) return
  const preview = figmaPreview.value
  if (!preview || preview.sourceUrl !== normalizeFigmaUrl(figmaUrl.value)) return
  figmaPreview.value = null
  retainedPreview.value = null
  previewError.value = createPreviewError('image-load')
  previewStatus.value = 'error'
}

function confirmFigmaPreview() {
  if (!canConfirmFigmaPreview.value || !figmaPreview.value) return
  // 把「结构卸载（previewConfirmed=true 卸载输入区）」与「状态卡切换（ready→confirmed）」
  // 拆到不同 patch 批次：先落 previewConfirmed，下一个 tick 再翻 previewStatus，
  // 避免 probe <img> 卸载与画布内状态卡重排在同一 flush 里交错争用父节点
  // （根因：null.insertBefore）。previewDisposed 兜底组件卸载后的滞后回调。
  previewConfirmed.value = true
  confirmedPreviewUrl.value = figmaPreview.value.sourceUrl
  nextTick(() => {
    if (previewDisposed) return
    previewStatus.value = 'confirmed'
  })
}

function changeFigmaSource() {
  previewConfirmed.value = false
  confirmedPreviewUrl.value = ''
  if (figmaPreview.value?.imageLoaded) previewStatus.value = 'ready'
}

// ═══ 输入处理 ═══
function selectSource(value) {
  if (busy.value || value === sourceMode.value) return
  sourceMode.value = value
}
function triggerFile() {
  fileInput.value?.click()
}
function onFile(e) {
  for (const f of e.target?.files || []) {
    if (f.type.startsWith('image/')) readFile(f)
  }
  e.target.value = ''
}
function onDrop(e) {
  drag.value = false
  for (const f of e.dataTransfer?.files || []) {
    if (f.type.startsWith('image/')) readFile(f)
  }
}
function readFile(f) {
  const r = new FileReader()
  r.onload = (ev) => {
    const d = ev.target.result
    const b64 = (d || '').split(',')[1] || ''
    const image = new Image()
    image.onload = () => {
      images.value = [
        {
          name: f.name,
          preview: d,
          base64: b64,
          size: f.size,
          width: image.naturalWidth,
          height: image.naturalHeight
        }
      ]
      sourceMode.value = 'screenshot'
    }
    image.onerror = () => {
      images.value = [{ name: f.name, preview: d, base64: b64, size: f.size }]
      sourceMode.value = 'screenshot'
    }
    image.src = d
  }
  r.readAsDataURL(f)
}
function removeImg(i) {
  images.value.splice(i, 1)
}
function onHtmlFile(e) {
  const files = e.target?.files
  if (files && files.length) readHtmlPackage(files)
  e.target.value = ''
}
async function readHtmlPackage(files) {
  htmlError.value = ''
  const list = Array.from(files)
  const htmlEntry = list.find((f) => /\.html?$/i.test(f.name) || f.type === 'text/html')
  if (!htmlEntry) {
    htmlError.value = '请至少包含一个 .html 文件'
    return
  }
  if (htmlEntry.size > 5 * 1024 * 1024) {
    htmlError.value = 'HTML 文件不能超过 5 MB'
    return
  }
  // 读取 HTML 主体
  const htmlContent = await readAsText(htmlEntry)
  if (!/<(?:html|body|div|main|section|article|header|footer|form|table)\b/i.test(htmlContent)) {
    htmlError.value = '未识别到有效的 HTML 页面结构'
    return
  }
  // 读取配套资源（CSS/JS 读文本，图片用 blob URL）
  const assets = []
  for (const f of list) {
    if (f === htmlEntry) continue
    const isImage = /image\//.test(f.type) || /\.(png|jpe?g|gif|svg|webp|ico|woff2?)$/i.test(f.name)
    if (isImage) {
      assets.push({
        name: f.name,
        isImage: true,
        blobUrl: URL.createObjectURL(f),
        content: ''
      })
    } else {
      const txt = await readAsText(f)
      assets.push({ name: f.name, isImage: false, blobUrl: '', content: txt })
    }
  }
  // 释放旧的预览 blob
  if (htmlBlobUrl.value) URL.revokeObjectURL(htmlBlobUrl.value)
  // 内联外部引用后生成自包含 HTML
  const inlineHtml = buildInlineHtml(htmlContent, assets)
  cachedInlineHtml.value = inlineHtml // 缓存：供 buildClientAnnotatedHtml 复用（避免用原始 HTML 导致 CSS/JS 丢失）
  htmlBlobUrl.value = URL.createObjectURL(new Blob([inlineHtml], { type: 'text/html' }))
  htmlFile.value = {
    name: htmlEntry.name,
    size: htmlEntry.size,
    content: htmlContent,
    lineCount: htmlContent.split(/\r?\n/).length
  }
  htmlAssets.value = assets
  // 选中 HTML 后保持在当前模式：docx-html 模式不切回纯 html
  sourceMode.value = sourceMode.value === 'docx-html' ? 'docx-html' : 'html'
  rawHtmlPreview.value = htmlContent
  analyzeHtml()
}
// 将 HTML 中的外部 <link>/<script src>/<img src> 引用内联为自包含文档
function buildInlineHtml(html, assets) {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  // 构建资源查找表（大小写不敏感，支持多种路径格式）
  const map = new Map() // key(小写) -> asset
  for (const a of assets) {
    const base = a.name.split('/').pop()
    const norm = a.name.replace(/^\.?\//, '')
    // 用小写 key 支持大小写无关匹配
    const keys = [base, decodeURIComponent(base), norm, a.name,
                  norm.toLowerCase(), base.toLowerCase(), a.name.toLowerCase()]
    // 去重：同一文件可能有多个 key 映射
    for (const k of keys) { if (k && !map.has(k)) map.set(k, a) }
  }

  /**
   * 查找资源：按 href/src 值在已上传资源中查找。
   * 匹配策略（优先级从高到低）：
   *  1. 去掉 ?#/ 前缀和 ./ 开头后的精确匹配
   *  2. 仅取文件名（basename）匹配
   *  3. 全部转小写后匹配（容错大小写差异）
   */
  const find = (raw) => {
    if (!raw) return null
    // 跳过绝对 URL（http/https/data: 协议）——这些是外部 CDN 资源
    if (/^(?:https?|data):\/\//i.test(raw)) return null
    const cleaned = raw.replace(/[?#].*$/, '').replace(/^\.?\//, '')
    const base = cleaned.split('/').pop()
    // 精确匹配 → basename 匹配 → 小写匹配
    return map.get(cleaned) || map.get(base) ||
           map.get(cleaned.toLowerCase()) || map.get(base.toLowerCase()) ||
           map.get(decodeURIComponent(cleaned)) || map.get(decodeURIComponent(base)) ||
           null
  }

  let inlinedCss = 0, inlinedJs = 0, inlinedImg = 0
  const skippedResources = [] // 记录未匹配到的外部引用（用于调试）

  // 内联样式表
  doc.querySelectorAll('link[rel~="stylesheet"]').forEach((el) => {
    const href = el.getAttribute('href') || ''
    const asset = find(href)
    if (asset && !asset.isImage) {
      const style = doc.createElement('style')
      // 保留原始 media 属性（如果有）
      if (el.getAttribute('media')) style.setAttribute('media', el.getAttribute('media'))
      const cssContent = asset.content || ''
      style.textContent = cssContent
      el.replaceWith(style)
      inlinedCss++
      // 诊断：输出 CSS 内容长度和前 80 字符，确认 content 确实有值
      console.log(`[buildInlineHtml] CSS内联详情: href="${href}" matched="${asset.name}" contentLen=${cssContent.length} preview="${cssContent.substring(0, 80).replace(/\n/g, '\\n')}"`)
    } else {
      // 未匹配到本地资源：如果是相对路径则移除（blob 上下文中必然 404），
      // 如果是绝对 URL 则保留（可能是 CDN，浏览器会尝试加载）
      if (href && !/^(https?:)?\/\//i.test(href)) {
        skippedResources.push({ tag: 'link[stylesheet]', href })
        el.remove() // 移除无效的相对路径引用，避免阻塞渲染
      }
    }
  })

  // 内联脚本（包括 type="module"）
  doc.querySelectorAll('script[src]').forEach((el) => {
    const src = el.getAttribute('src') || ''
    const asset = find(src)
    if (asset && !asset.isImage) {
      const scriptType = el.getAttribute('type') || ''
      el.removeAttribute('src')
      // module 类型改为普通脚本（blob URL 不支持跨源 module）
      if (scriptType === 'module') el.removeAttribute('type')
      el.textContent = asset.content || ''
      inlinedJs++
    } else {
      if (src && !/^(https?:)?\/\//i.test(src)) {
        skippedResources.push({ tag: 'script[src]', src })
        el.remove()
      }
    }
  })

  // 替换图片为本地 blob
  doc.querySelectorAll('img[src]').forEach((el) => {
    const asset = find(el.getAttribute('src'))
    if (asset && asset.isImage) {
      el.setAttribute('src', asset.blobUrl)
      inlinedImg++
    }
  })

  // 内联 <style> 中的 @import 引用（如果被导入的 CSS 文件也在上传列表中）
  doc.querySelectorAll('style').forEach((el) => {
    const cssText = el.textContent || ''
    // 匹配 @import url(...) 或 @import "..." / @import '...'
    el.textContent = cssText.replace(
      /@import\s+(?:url\(\s*['"]?([^'")]+)['"]?\s*\)|['"]([^'"]+)['"])\s*;?/gi,
      (match, urlFromFunc, urlFromString) => {
        const importUrl = urlFromFunc || urlFromString
        const asset = find(importUrl)
        if (asset && !asset.isImage) {
          inlinedCss++
          return asset.content || '' /* 替换为实际内容 */
        }
        return match /* 保留原样 */
      }
    )
  })

  // 调试日志：输出内联统计和未匹配资源
  // 额外诊断：检查序列化后 <style> 标签的实际内容
  const finalStyles = doc.querySelectorAll('style')
  let styleDiag = ''
  finalStyles.forEach((s, i) => {
    const len = (s.textContent || '').length
    const preview = (s.textContent || '').substring(0, 60).replace(/\n/g, ' ')
    styleDiag += ` | style[${i}]: len=${len} preview="${preview}..."`
  })
  if (inlinedCss > 0 || inlinedJs > 0 || inlinedImg > 0 || skippedResources.length > 0) {
    console.log(
      `[buildInlineHtml] 内联结果: CSS=${inlinedCss}, JS=${inlinedJs}, IMG=${inlinedImg}` +
      (skippedResources.length ? `, 未匹配(${skippedResources.length}): ${JSON.stringify(skippedResources)}` : '') +
      styleDiag
    )
  }

  const result = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML
  // 输出最终 HTML 总长度和 <style 出现次数，确认序列化没丢失
  console.log(`[buildInlineHtml] 最终HTML: totalLen=${result.length} styleTagCount=${finalStyles.length}`)
  return result
}
function readAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = () => reject(r.error)
    r.readAsText(file, 'UTF-8')
  })
}
// ─── HTML + 需求文档：docx 读取 ───
function triggerDocxFile() {
  docxFileInput.value?.click()
}
function onDocxFile(e) {
  const file = e.target?.files?.[0]
  if (file) readDocxFile(file)
  e.target.value = ''
}
function onDocxDrop(e) {
  docxDrag.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) readDocxFile(file)
}
function readDocxFile(file) {
  htmlError.value = ''
  const okName = /\.(docx?|doc)$/i.test(file.name)
  const okType = /wordprocessingml|msword|officedocument/i.test(file.type || '')
  if (!okName && !okType) {
    docxFile.value = null
    htmlError.value = '仅支持 .doc / .docx 需求文档'
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    docxFile.value = null
    htmlError.value = '需求文档不能超过 10 MB'
    return
  }
  const reader = new FileReader()
  reader.onload = (event) => {
    const d = String(event.target?.result || '')
    const base64 = d.split(',')[1] || ''
    docxFile.value = { name: file.name, size: file.size, base64 }
    // DOCX 就绪后重新分析（合并需求文档+HTML）
    if (htmlFile.value?.content && sourceMode.value === 'docx-html') {
      analyzeHtml()
    }
  }
  reader.onerror = () => {
    docxFile.value = null
    htmlError.value = '需求文档读取失败，请重新选择'
  }
  reader.readAsDataURL(file)
}

// ─── 双栏 HTML 原型操作 ───
function triggerHtmlFile() {
  htmlFileInput.value?.click()
}
function onHtmlDrop(e) {
  htmlDrag.value = false
  const files = e.dataTransfer?.files
  if (files && files.length) readHtmlPackage(files)
}
function removeHtmlFile() {
  if (htmlBlobUrl.value) {
    URL.revokeObjectURL(htmlBlobUrl.value)
    htmlBlobUrl.value = ''
  }
  if (_annotatedBlobUrl) {
    URL.revokeObjectURL(_annotatedBlobUrl)
    _annotatedBlobUrl = ''
    annotatedPreviewUrl.value = ''
  }
  htmlAssets.value.forEach((a) => {
    if (a.blobUrl) URL.revokeObjectURL(a.blobUrl)
  })
  htmlAssets.value = []
  htmlFile.value = null
  splitComponents.value = []
  splitSelections.value = {}
  splitPreviewHtml.value = ''
}
function removeDocxFile() {
  docxFile.value = null
}

// ═══ HTML 拆分流程 ═══
async function analyzeHtml() {
  if (!htmlFile.value?.content) return
  const useDocx = sourceMode.value === 'docx-html' && !!docxFile.value
  splitAnalyzing.value = true
  htmlContentCache.value = htmlFile.value.content
  splitComponents.value = []
  splitSelections.value = {}
  splitResults.value = []
  splitPreviewHtml.value = ''
  try {
    const payload = {
      htmlContent: htmlFile.value.content,
      htmlFileName: htmlFile.value.name
    }
    if (useDocx) {
      payload.docxBase64 = docxFile.value.base64
      payload.docxName = docxFile.value.name
    }
    const data = await http.post(
      useDocx ? '/api/component-split/analyze' : '/api/lite/analyze',
      payload
    )
    // 兼容两种响应格式：
    //   Node 信封：{ success, data: { components, fileName, previewHtml } }
    //   Java 平铺：{ components, hasDocx, remark }
    const body = data.data || data
    splitComponents.value = body.components || []
    splitFileName.value = body.fileName || 'screen'
    splitPreviewHtml.value = body.previewHtml || ''
    // 默认全选
    for (const comp of body.components) {
      splitSelections.value[comp.index] = {
        selected: true,
        componentType: compType.value
      }
    }
  } catch (err) {
    htmlError.value = err.message || (useDocx ? '分析需求与 HTML 失败' : '分析 HTML 失败')
  } finally {
    splitAnalyzing.value = false
  }
}

// ═══ 双向联动高亮 ═══
// 监听 iframe 反向 hover 和框选事件
function setupIframeListener() {
  window.addEventListener('message', (event) => {
    const { type, idx, height, cssSelector, htmlContent } = event.data || {}

    // iframe 文档高度上报 → 自适应高度
    if (type === 'doc-height' && typeof height === 'number') {
      const iframe = previewIframeRef.value
      if (iframe) {
        iframe.style.height = Math.max(400, height) + 'px'
      }
      return
    }

    // hover 联动
    if (type === 'hover') {
      hoveredSplitIdx.value = Number(idx)
    } else if (type === 'hover-end') {
      if (hoveredSplitIdx.value === Number(idx)) {
        hoveredSplitIdx.value = null
      }
    }

    // 框选完成
    else if (type === 'selection-complete') {
      manualCompCounter++
      const newIndex = splitComponents.value.length
      const compName = `custom-${manualCompCounter}`

      // 添加到组件列表
      splitComponents.value.push({
        index: newIndex,
        name: compName,
        strategy: 'manual',
        cssSelector: cssSelector,
        htmlContent: htmlContent
      })

      // 默认选中
      splitSelections.value[newIndex] = {
        selected: true,
        componentType: compType.value
      }

      // 退出框选模式
      const iframe = previewIframeRef.value
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'exit-selection-mode' }, '*')
      }
    }
  })
}

// 在组件挂载时设置监听
if (typeof window !== 'undefined') {
  setupIframeListener()
}

async function generateSplit(aiConfig) {
  const selections = []
  for (const comp of splitComponents.value) {
    const sel = splitSelections.value[comp.index]
    if (sel?.selected) {
      selections.push({
        index: comp.index,
        componentType: sel.componentType,
        componentName: `${splitFileName.value}-${comp.index + 1}`
      })
    }
  }
  if (!selections.length) {
    htmlError.value = '请至少选择一个组件'
    return
  }
  splitGenerating.value = true
  htmlError.value = ''
  // 关闭旧的 SSE 连接
  closeSplitResultStreams()
  try {
    const data = await http.post('/api/lite/generate-split', {
      htmlContent: htmlContentCache.value,
      htmlFileName: htmlFile.value?.name,
      groupId: 'default-group',
      config: aiConfig,
      selections
    })
    const batchId = createHtmlSplitBatchId()
    splitResults.value = (data.data.components || []).map((c) => ({
      ...c,
      status: c.status || 'pending',
      progress: c.progress || 0,
      message: c.message || '',
      error: c.error || null,
      previewUrl: null
    }))
    activeHtmlBatchId.value = batchId
    splitOverallProgress.value = {
      total: splitResults.value.length,
      completed: 0,
      failed: 0
    }
    try {
      sessionStorage.setItem(
        `mvgo-html-split-batch:${batchId}`,
        JSON.stringify({
          batchId,
          createdAt: Date.now(),
          htmlFileName: htmlFile.value?.name || splitFileName.value,
          items: splitResults.value.map((item: any) => ({
            ...item,
            name: item.displayName || item.name || item.componentName || item.sessionId
          }))
        })
      )
    } catch {}
    router.replace({ path: `/tasks/html-split/${batchId}` })
  } catch (err) {
    htmlError.value = err.message || '生成失败'
  } finally {
    splitGenerating.value = false
  }
}

function closeSplitResultStreams() {
  Object.values(splitResultStreams.value).forEach((es) => es?.close())
  splitResultStreams.value = {}
}

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function onPaste(e) {
  if (busy.value) return
  for (const item of e.clipboardData?.items || []) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const b = item.getAsFile()
      if (b) readFile(b)
      break
    }
  }
}

// 轻量 toast（本项目无共享 toast 工具）
const toastMsg = ref('')

function startTimer() {
  startAt = Date.now()
  timer = setInterval(() => {
    const s = Math.floor((Date.now() - startAt) / 1000)
    elapsed.value = `${Math.floor(s / 60)}分${s % 60}秒`
  }, 1000)
}
function stopTimer() {
  clearInterval(timer)
  timer = null
}

function nowTime() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function normalizeAiConfig(source = {}) {
  const raw = source?.value !== undefined ? source.value : source
  const cfg = raw || {}
  const trim = (value) => (typeof value === 'string' ? value.trim() : '')
  const unifiedKey = trim(cfg.unifiedApiKey)
  const unifiedBaseURL = trim(cfg.unifiedBaseURL)
  const unifiedModel = trim(cfg.unifiedModel)
  const legacyKey = trim(cfg.aiApiKey)
  const legacyBaseURL = trim(cfg.aiBaseURL)
  const legacyModel = trim(cfg.aiModel)
  const visionApiKey = trim(cfg.visionApiKey) || unifiedKey || legacyKey
  const textApiKey = trim(cfg.textApiKey) || unifiedKey || legacyKey
  const visionBaseURL = trim(cfg.visionBaseURL) || unifiedBaseURL || legacyBaseURL
  const textBaseURL = trim(cfg.textBaseURL) || unifiedBaseURL || legacyBaseURL
  const visionModel = trim(cfg.visionModel) || unifiedModel || legacyModel
  const textModel = trim(cfg.textModel) || unifiedModel || legacyModel
  return { ...cfg, visionApiKey, textApiKey, visionBaseURL, textBaseURL, visionModel, textModel }
}

function getRequiredConfigFields() {
  if (genTier.value === 'lite') {
    return [
      ['visionApiKey', '视觉模型 API Key'],
      ['visionBaseURL', '视觉模型 Base URL'],
      ['visionModel', '视觉模型 Model']
    ]
  }
  return [
    ['visionApiKey', '视觉模型 API Key'],
    ['visionBaseURL', '视觉模型 Base URL'],
    ['visionModel', '视觉模型 Model'],
    ['textApiKey', '文本模型 API Key'],
    ['textBaseURL', '文本模型 Base URL'],
    ['textModel', '文本模型 Model']
  ]
}

function createHtmlSplitBatchId() {
  return `html-split-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

async function validateAiConfig() {
  let cfg = normalizeAiConfig(configStore.config)
  const requiredFields = getRequiredConfigFields()
  const hasMissingField = () => requiredFields.some(([key]) => !cfg[key])

  if (hasMissingField()) {
    try {
      const data = await http.get('/api/config/ai')
      if (data?.success && data.data?.config) {
        cfg = normalizeAiConfig({ ...cfg, ...data.data.config })
        configStore.saveConfig(cfg)
      }
    } catch {
      /* 服务端不可用时继续使用本地配置 */
    }
  }

  const missing = requiredFields.filter(([key]) => !cfg[key]).map(([, label]) => label)
  if (missing.length > 0) {
    alert(`请先在设置面板中配置：${missing.join('、')}`)
    return null
  }
  return cfg
}

// ═══ 生成 ═══
async function go() {
  if (submitting.value || busy.value) return

  // HTML 模式：先分析 → 展示组件列表 → 选择后再生成
  if (sourceMode.value === 'html') {
    if (splitComponents.value.length === 0) {
      // 还没分析过 → 先分析
      await analyzeHtml()
      return
    }
    // 已分析、已选择 → 走拆分生成
    submitting.value = true
    try {
      const aiConfig = await validateAiConfig()
      if (!aiConfig) return
      busy.value = true
      await generateSplit(aiConfig)
    } catch (e) {
      htmlError.value = e?.response?.data?.message || e?.message || '生成失败'
    } finally {
      submitting.value = false
    }
    return
  }

  // 需求文档 + HTML 模式：先分析 → 勾选组件 → 导出组件 MD 交付包
  if (sourceMode.value === 'docx-html') {
    if (splitComponents.value.length === 0) {
      await analyzeHtml()
      return
    }
    await buildSplitPackage()
    return
  }

  submitting.value = true
  try {
    const aiConfig = await validateAiConfig()
    if (!aiConfig) return

    busy.value = true
    genMsg.value = ''
    result.value = false
    previewUrl.value = ''
    resultSessionId.value = ''
    batchProgress.value = null
    batchItems.value = []
    batchEta.value = ''

    if (mode.value === 'single') await goSingle(aiConfig)
    else await goBatch(aiConfig)
  } catch (e) {
    genMsg.value = '失败: ' + (e?.response?.data?.message || e?.message)
    result.value = true
    busy.value = false
    stopTimer()
  } finally {
    submitting.value = false
  }
}

/**
 * 组件拆分交付包：调用 Java 侧 build 接口生成 zip 并触发下载。
 * 产出的是组件需求 MD，不走 AI 代码生成管线，因此无需校验模型配置。
 */
async function buildSplitPackage() {
  const selectedCodes = splitComponents.value
    .filter((comp) => splitSelections.value[comp.index]?.selected)
    .map((comp) => comp.code)
    .filter(Boolean)
  if (selectedCodes.length === 0) {
    htmlError.value = '请至少勾选一个组件'
    return
  }

  splitBuilding.value = true
  htmlError.value = ''
  let objectUrl = ''
  try {
    const blob = await http.download('/api/component-split/build', {
      method: 'POST',
      body: {
        htmlContent: htmlFile.value.content,
        htmlFileName: htmlFile.value.name,
        docxBase64: docxFile.value?.base64,
        docxName: docxFile.value?.name,
        selectedCodes
      }
    })
    objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = `组件拆分交付包_${new Date().toISOString().slice(0, 10)}.zip`
    document.body.appendChild(link)
    link.click()
    link.remove()
  } catch (e) {
    htmlError.value = e?.message || '生成交付包失败'
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    splitBuilding.value = false
  }
}

async function goSingle(aiConfig) {
  startTimer()
  logs.value = [{ time: nowTime(), text: '已提交生成任务' }]
  stages.value.forEach((s) => (s.status = 'pending'))
  const isFigma = sourceMode.value === 'figma'
  const groupId = localStorage.getItem('currentGroupId') || 'default-group'
  const p = {
    componentType: compType.value,
    generationTier: genTier.value,
    componentName: compName.value || undefined,
    groupId,
    config: aiConfig
  }
  if (compType.value === 'microcode') p.panelType = panelType.value
  if (requirementDoc.value.trim().length >= 20) {
    p.requirementDoc = requirementDoc.value
    if (docAnalysis.value) p.docAnalysis = docAnalysis.value
  }
  if (isFigma) {
    const currentUrl = normalizeFigmaUrl(figmaUrl.value)
    if (
      !previewConfirmed.value ||
      previewStatus.value !== 'confirmed' ||
      confirmedPreviewUrl.value !== currentUrl ||
      !figmaPreview.value?.imageLoaded ||
      !figmaPreview.value?.previewToken
    ) {
      throw new Error('请先获取并确认当前 Figma 链接的预览图')
    }
    p.figmaUrl = currentUrl
    p.previewToken = figmaPreview.value.previewToken
    p.previewWidth = figmaPreview.value.width
    p.previewHeight = figmaPreview.value.height
    saveToUrlHistory(currentUrl)
  } else if (sourceMode.value === 'html') {
    p.htmlContent = htmlFile.value.content
    p.htmlFileName = htmlFile.value.name
  } else {
    p.imageBase64 = images.value[0].base64
  }
  const r = await generateLite(p)
  // 兼容全局信封 { success, code, data } 与直出 { sessionId, ... }
  const sessionId = r?.data?.sessionId ?? r?.sessionId
  resultSessionId.value = sessionId
  genMsg.value = r.message || '提交中...'
  router.replace({ path: `/tasks/${sessionId}` })
}

async function goBatch(aiConfig) {
  startTimer()
  const items = images.value.map((img, i) => {
    const item = {
      imageBase64: img.base64,
      componentName: img.name?.replace(/\.[^.]+$/, '') || `comp-${i + 1}`,
      componentType: compType.value,
      generationTier: genTier.value,
      config: aiConfig
    }
    if (compType.value === 'microcode') item.panelType = panelType.value
    if (requirementDoc.value.trim().length >= 20) {
      item.requirementDoc = requirementDoc.value
      if (docAnalysis.value) item.docAnalysis = docAnalysis.value
    }
    return item
  })
  batchProgress.value = { total: items.length, completed: 0, failed: 0, rateLimited: 0 }
  batchItems.value = items.map((it, i) => ({
    name: it.componentName,
    status: 'queued',
    elapsed: '',
    previewUrl: null,
    error: null
  }))
  const r = await batchGenerate({
    items,
    groupId: localStorage.getItem('currentGroupId') || 'default-group'
  })
  if (r.batchId) pollBatch(r.batchId)
}

let pollTimer = null
async function pollBatch(bid) {
  const { batchDetail: api } = await import('@/api/lite')
  pollTimer = setInterval(async () => {
    try {
      const r = await api(bid)
      const b = r.batch
      batchProgress.value = {
        total: b.totalItems,
        completed: b.completedItems,
        failed: b.failedItems,
        rateLimited: b.items.filter((i) => i.status === 'rate_limited').length
      }
      batchItems.value = b.items.map((i) => ({
        name: i.itemId,
        status: i.status,
        elapsed: i.completedAt ? `${Math.floor((i.completedAt - b.createdAt) / 1000)}s` : '',
        previewUrl: null,
        error: i.lastError
      }))
      if (b.completedItems > 0) {
        const avg = (Date.now() - b.createdAt) / b.completedItems
        const rem = b.totalItems - b.completedItems - b.failedItems
        if (rem > 0) {
          const etaSec = Math.floor((avg * rem) / 1000)
          batchEta.value = `${Math.floor(etaSec / 60)}分${etaSec % 60}秒`
        } else batchEta.value = ''
      }
      if (b.status === 'completed' || b.status === 'cancelled' || b.status === 'failed') {
        clearInterval(pollTimer)
        pollTimer = null
        busy.value = false
        stopTimer()
        result.value = true
      }
    } catch {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }, 2000)
}

async function cancel() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (resultSessionId.value) {
    try {
      await cancelTask(resultSessionId.value)
    } catch (e) {
      console.error('[取消任务] 终止失败:', e)
    }
  }
  if (es) {
    es.close()
    es = null
  }
  closeSplitResultStreams()
  busy.value = false
  stopTimer()
  genMsg.value = '已终止'
}

// ═══ 最近任务点击 → 任务详情 ═══
function onTaskSelect(task) {
  if (!task || !task.sessionId) return
  router.push(`/tasks/${task.sessionId}`)
}

// ═══ 生成概览 stat 卡点击 → 任务列表（带筛选）═══
function onStatClick(key) {
  const query = {}
  if (key === 'completed') query.status = 'completed'
  else if (key === 'running') query.status = 'running'
  else if (key === 'failed') query.status = 'failed'
  else if (key === 'today') query.today = '1'
  // 'total' 不传 query，全部任务
  router.push({ path: '/tasks', query })
}

function historyDotClass(status) {
  if (status === 'running') return 'prog'
  if (status === 'failed') return 'fail'
  if (status === 'completed' || status === 'success') return 'done'
  return ''
}

function historyTagClass(task) {
  return task?.componentType === 'microcode' ? 'tag-mc' : 'tag-vue3'
}

function historyTagText(task) {
  return task?.componentType === 'microcode' ? 'MC' : 'V3'
}

// 提取任务实际使用的模型（优先 completionModels 真实调用，兜底 configSnapshot）
function historyModels(task) {
  // 优先：任务完成后记录的实际调用模型
  const cm = task?.completionModels
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
  // 兜底：配置快照（旧任务无 completionModels 时）
  // 注意：只取实际会走请求的字段，不取 providers 备用池
  const snapshot = task?.configSnapshot
  if (!snapshot) return []
  const models = new Set<string>()
  if (snapshot.unifiedModel && snapshot.modelMode === 'unified') {
    models.add(snapshot.unifiedModel)
  } else {
    if (snapshot.visionModel) models.add(snapshot.visionModel)
    if (snapshot.textModel) models.add(snapshot.textModel)
  }
  return Array.from(models)
}

function historyTimeText(task) {
  if (!task) return '—'
  void historyTick.value // 响应式依赖：驱动定时刷新
  // 等待中的状态：显示排队/限流状态，而非「x 分钟前」（此时尚未开始生成）
  if (task.status === 'queued') return '排队中'
  if (task.status === 'rate_limited') return '限流等待中'
  if (task.status === 'retry_scheduled') return '等待重试'
  if (task.status === 'running') return elapsed.value ? `进行中 · ${elapsed.value}` : '进行中'
  if (task.status === 'paused') return '已暂停'
  const ts = task.startTime
  if (!ts) return task.status || '—'
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  return `${day} 天前`
}

// ── 最近生成：来源识别 ──
function getRecentSource(task: any): 'screenshot' | 'figma' | 'html' | 'retry' {
  const source = task?.metadata?.sourceType || task?.sourceType
  if (source === 'screenshot') return 'screenshot'
  if (source === 'figma') return 'figma'
  if (source === 'html') return 'html'
  const parts = (task?.sessionId || '').split('-')
  if (parts.length >= 2) {
    if (parts[1] === 'lite') return 'screenshot'
    if (parts[1] === 'max') return 'figma'
  }
  if ((task?.sessionId || '').startsWith('ml-')) return 'screenshot'
  return 'retry'
}

function sourceLabel(source: 'screenshot' | 'figma' | 'html' | 'retry') {
  const map = { screenshot: '截图', figma: 'Figma', html: 'HTML', retry: '重试' }
  return map[source]
}

function formatRecentDuration(ms?: number) {
  if (!ms) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}min`
}

// 🛡️ 脚本子段降级清单 → 中文标签（state=状态定义 / lifecycle=生命周期逻辑 / charts=图表）
function degradedScriptPartsLabel(parts: string[]) {
  const map: Record<string, string> = { state: '状态定义', lifecycle: '生命周期逻辑', charts: '图表' }
  return (parts || []).map((p) => map[p] || p).join('、')
}

// 🆕 S1-④ checkpoint 缓存状态 → 人话标签（失败卡片「重试秒续」提示）
function checkpointCacheLabel(status?: string) {
  const map: Record<string, string> = {
    'figma-cached': '设计稿数据',
    full: '设计稿与视觉分析',
    'code-generated': '生成代码',
  }
  return (status && map[status]) || '缓存'
}

// ═══ Figma URL 历史记录 ═══
const URL_HISTORY_KEY = 'mvgo_figma_url_history'
const MAX_URL_HISTORY = 5

function loadUrlHistory() {
  try {
    urlHistory.value = JSON.parse(localStorage.getItem(URL_HISTORY_KEY) || '[]')
  } catch {
    urlHistory.value = []
  }
}
function saveToUrlHistory(url) {
  if (!url || !url.trim()) return
  const current = urlHistory.value.filter((u) => u !== url)
  current.unshift(url)
  urlHistory.value = current.slice(0, MAX_URL_HISTORY)
  localStorage.setItem(URL_HISTORY_KEY, JSON.stringify(urlHistory.value))
}
function selectUrlHistory(url) {
  figmaUrl.value = url
  sourceMode.value = 'figma'
  showUrlHistory.value = false
}
function removeUrlHistory(idx) {
  urlHistory.value.splice(idx, 1)
  localStorage.setItem(URL_HISTORY_KEY, JSON.stringify(urlHistory.value))
}
function clearUrlHistory() {
  urlHistory.value = []
  localStorage.removeItem(URL_HISTORY_KEY)
  showUrlHistory.value = false
}

function handleClickOutside(e) {
  const historyBtn = document.querySelector('.history-btn')
  const dropdown = document.querySelector('.url-history-dropdown')
  if (showUrlHistory.value && !historyBtn?.contains(e.target) && !dropdown?.contains(e.target))
    showUrlHistory.value = false
}

// ═══ 最近任务（空闲右栏）═══
async function fetchRecent() {
  try {
    const j = await http.get('/api/tasks/recent', { limit: 10 })
    const list = Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : j.data?.tasks || []
    recent.value = list.slice(0, 10).map((t) => ({
      // 🏷️ 展示优先中文 displayName（后端 tasks 已存；componentName 是语义代码名/回退）
      name: t.displayName || t.componentName || t.sessionId || '未命名',
      status: t.status || 'unknown',
      sessionId: t.sessionId,
      startTime: t.startTime || t.endTime || null,
      error: t.error || '',
      componentType: t.target || t.componentType || t.codeType || 'microcode',
      configSnapshot: t.configSnapshot || null,
      //  P0-3: 视觉分析降级标志（视觉超时→Figma 兜底 或 完全降级）
      visualDegraded: t.visualDegraded === true || !!t.result?._visualDegraded,
      visualLayoutSource: t.visualLayoutSource || t.result?._visualLayoutSource || null,
      visualDegradeReason: t.visualDegradeReason || t.result?._visualDegradeReason || '',
      // 🛡️ 脚本子段降级清单（lifecycle/charts 段失败但已降级兜底）→ 「不完整，可二次生成」标签
      degradedScriptParts: Array.isArray(t.degradedScriptParts) ? t.degradedScriptParts : (Array.isArray(t.result?.degradedScriptParts) ? t.result.degradedScriptParts : []),
      // 🛡️ #10 静默失败降级：合并 gateSkippedFiles（写盘门禁跳过）+degradedFiles（子组件编译剔除）→ 缺失关键文件提示
      missingFiles: (() => {
        const files: string[] = []
        if (Array.isArray(t.gateSkippedFiles)) files.push(...t.gateSkippedFiles)
        if (Array.isArray(t.degradedFiles)) files.push(...t.degradedFiles)
        if (Array.isArray(t.result?.gateSkippedFiles)) files.push(...t.result?.gateSkippedFiles)
        if (Array.isArray(t.result?.degradedFiles)) files.push(...t.result?.degradedFiles)
        return files.length > 0 ? [...new Set(files)] : null
      })()
    }))
  } catch {
    recent.value = []
  }
}

async function fetchSummary() {
  try {
    const j = await http.get('/api/tasks/summary')
    if (j && j.success && j.data?.summary) {
      taskSummary.value = j.data.summary
    }
  } catch {
    taskSummary.value = null
  }
}

onMounted(() => {
  document.addEventListener('paste', onPaste)
  document.addEventListener('click', handleClickOutside)
  loadUrlHistory()
  fetchRecent()
  fetchSummary()
  // 每 15s 重新拉取最近生成列表（反映排队→运行→完成的状态变化）+ 刷新相对时间显示
  // 此前 60s 定时器只自增 historyTick（刷新「x 分钟前」文字），从不重新拉取列表，
  // 导致排队任务的 status 变化（queued→running→completed）永不反映到列表。
  historyTimer = setInterval(() => {
    historyTick.value++
    fetchRecent()
    fetchSummary()
  }, 15000)
})
onUnmounted(() => {
  previewDisposed = true
  if (es) {
    es.close()
    es = null
  }
  closeSplitResultStreams()
  if (previewDebounce) {
    clearTimeout(previewDebounce)
    previewDebounce = null
  }
  previewRequestId += 1
  previewAbortController?.abort()
  previewAbortController = null
  if (pollTimer) clearInterval(pollTimer)
  stopTimer()
  if (historyTimer) clearInterval(historyTimer)
  document.removeEventListener('paste', onPaste)
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
/* 变量挂在组件根元素上（scoped 下 :root 不会匹配） */
.unified-generate.gen-v4 {
  --c-primary: #2563eb;
  --c-primary-soft: #eff6ff;
  --c-cta: #059669;
  --c-cta-hover: #047857;
  --c-danger: #dc2626;
  --c-warn: #d97706;
  --bg: #f5f7fa;
  --surface: #ffffff;
  --surface-2: #f8fafc;
  --surface-3: #f1f5f9;
  --border: #e5e7eb;
  --border-soft: #f1f5f9;
  --txt-1: #0f172a;
  --txt-2: #475569;
  --txt-3: #94a3b8;
  --s1: 4px;
  --s2: 8px;
  --s3: 12px;
  --s4: 16px;
  --s5: 20px;
  --s6: 24px;
  --s7: 32px;
  --s8: 40px;
  --r-sm: 6px;
  --r-md: 8px;
  --r-lg: 12px;
  --r-xl: 16px;
  --r-pill: 9999px;
  --fs-xs: 12px;
  --fs-sm: 14px;
  --fs-base: 15px;
  --fs-lg: 16px;
  --fs-xl: 18px;
  --fs-2xl: 22px;
  --fs-3xl: 28px;
  --right-w: 340px;
  --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', system-ui,
    sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --shadow-xs: 0 1px 2px rgba(15, 23, 42, 0.04);
  --shadow-sm: 0 1px 3px rgba(15, 23, 42, 0.08);
  --shadow-md: 0 4px 12px rgba(15, 23, 42, 0.08);
  --shadow-lg: 0 12px 32px rgba(15, 23, 42, 0.14);
  --focus: 0 0 0 3px rgba(37, 99, 235, 0.18);
  /* 工具型页面：默认禁止误选文本，仅输入框 / 错误提示等恢复可选 */
  -webkit-user-select: none;
  user-select: none;
}

/* 输入框、可编辑区：保持可选（粘贴 / 复制文本） */
.unified-generate.gen-v4 input,
.unified-generate.gen-v4 textarea,
.unified-generate.gen-v4 [contenteditable] {
  -webkit-user-select: text;
  user-select: text;
}
/* 错误提示 / 状态文案：保留可选，便于复制报错排查 */
.unified-generate.gen-v4 .figma-error-msg,
.unified-generate.gen-v4 .app-toast {
  -webkit-user-select: text;
  user-select: text;
}

/* 技术栈 / 规格切换：浅灰页面下增强对比与层次（仅亮色模式，暗色沿用 token 默认） */
html:not([data-theme='dark']) .unified-generate.gen-v4 {
  --codetype-toggle-track: #ffffff;
  --tier-toggle-track: #ffffff;
}
html:not([data-theme='dark']) .unified-generate.gen-v4 :deep(.codetype-toggle),
html:not([data-theme='dark']) .unified-generate.gen-v4 :deep(.tier-toggle) {
  border-color: var(--c-gray-300, #cbd5e1);
  box-shadow:
    0 1px 3px rgba(15, 23, 42, 0.1),
    0 1px 2px rgba(15, 23, 42, 0.06);
}
html:not([data-theme='dark']) .unified-generate.gen-v4 :deep(.codetype-toggle__opt),
html:not([data-theme='dark']) .unified-generate.gen-v4 :deep(.tier-toggle__opt) {
  font-weight: 700;
}

/* ══ 禁用选项 — 明显视觉区分（亮/暗通用） ══ */
.unified-generate.gen-v4 :deep(.tier-toggle__opt[disabled]),
.unified-generate.gen-v4 :deep(.codetype-toggle__opt[disabled]) {
  opacity: 0.38 !important;
  color: var(--txt-3, #9ca3af) !important;
  cursor: not-allowed !important;
  text-decoration: line-through;
  text-decoration-color: var(--c-gray-400, #94a3b8);
}
/* 禁用选项 hover 不响应 */
.unified-generate.gen-v4 :deep(.tier-toggle__opt[disabled]:hover),
.unified-generate.gen-v4 :deep(.codetype-toggle__opt[disabled]:hover) {
  background: transparent !important;
  color: var(--txt-3, #9ca3af) !important;
  transform: none !important;
}

html[data-theme='dark'] .unified-generate.gen-v4 {
  --c-primary: #58a6ff;
  --c-primary-soft: rgba(56, 139, 253, 0.14);
  --c-cta: #3fb950;
  --c-cta-hover: #56d364;
  --c-danger: #f85149;
  --c-warn: #d29922;
  --bg: #0d1117;
  --surface: #161b22;
  --surface-2: #1c2128;
  --surface-3: #21262d;
  --border: #30363d;
  --border-soft: #21262d;
  --txt-1: #e6edf3;
  --txt-2: #8b949e;
  --txt-3: #6e7681;
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.5);
  --shadow-sm: 0 2px 5px rgba(0, 0, 0, 0.55);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.6);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.65);
  --focus: 0 0 0 3px rgba(56, 139, 253, 0.35);
}
.unified-generate.gen-v4 * {
  box-sizing: border-box;
}
.unified-generate.gen-v4 [hidden] {
  display: none !important;
}
.unified-generate.gen-v4 {
  height: calc(100vh - 40px - 64px);
  display: flex;
  flex-direction: column;
  /* background: var(--bg); */
  color: var(--txt-1);
  font-family: var(--font);
  font-size: var(--fs-base);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* ══ workbench ══ */
.workbench {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.main-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: var(--s7) var(--s8);
  overflow-y: auto;
}
.page-title {
  font-size: var(--fs-3xl);
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0 0 var(--s2);
}
.page-sub {
  font-size: var(--fs-base);
  color: var(--txt-2);
  margin: 0 0 var(--s6);
  line-height: 1.6;
}

/* ══ source tabs（flex 等分 100%） ══ */
.source-tabs {
  display: flex;
  gap: var(--s1, 4px);
  padding: var(--s1, 4px);
  border-radius: var(--r-pill, 9999px);
  margin-bottom: var(--s5);
  background: var(--surface-2, var(--surface-3));
}
.source-tab {
  flex: 1;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--s2);
  background: transparent;
  color: var(--txt-2);
  font-size: var(--fs-sm, 13px);
  font-weight: 500;
  border-radius: var(--r-pill, 9999px);
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  border: none;
  position: relative;
  white-space: nowrap;
}
.source-tab:hover {
  background: var(--surface);
  color: var(--txt-1);
}
/* 激活态改为柔和底色 + 主色文字：来源选择是「导航」不是「主操作」，
   避免与「获取预览 / 生成组件」抢主 CTA 的视觉权重。 */
.source-tab.active {
  background: var(--c-primary-soft, rgba(37, 99, 235, 0.1));
  color: var(--c-primary);
  font-weight: 600;
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.18);
}
.source-tab:active {
  transform: scale(0.97);
}
.source-tab:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.source-tab:disabled:hover {
  background: transparent;
  color: var(--txt-2);
}
.source-tab svg {
  width: 15px;
  height: 15px;
  opacity: 0.85;
  flex-shrink: 0;
}
.source-tab.active svg {
  opacity: 1;
}

/* ══ 单一画布 ══ */
.canvas {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-bottom: var(--s6);
}
.canvas-label {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--txt-1);
  margin-bottom: var(--s3);
  display: flex;
  align-items: center;
  gap: var(--s2);
}
.canvas-label::before {
  content: '';
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: var(--c-primary);
}
.field {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 拖拽画布 */
.drop-zone {
  flex: 1;
  /* min-height: 280px; */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--s4);
  border: 2px dashed var(--border);
  border-radius: var(--r-xl, 16px);
  background: radial-gradient(circle at 50% 0%, var(--surface-2), var(--surface) 70%);
  color: var(--txt-2);
  text-align: center;
  padding: var(--s7);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  position: relative;
  overflow: hidden;
}
.drop-zone::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 120%, var(--c-primary-soft), transparent 60%);
  opacity: 0;
  transition: opacity 0.25s;
  pointer-events: none;
}
.drop-zone:hover,
.drop-zone:focus-visible,
.drop-zone.is-dragging {
  border-color: var(--c-primary);
  background: radial-gradient(circle at 50% 0%, var(--c-primary-soft), var(--surface) 70%);
  color: var(--c-primary);
  outline: none;
  box-shadow: var(--focus);
  transform: translateY(-2px);
}
.drop-zone:hover::after,
.drop-zone.is-dragging::after {
  opacity: 1;
}
.drop-zone .upload-icon {
  color: var(--c-primary);
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  border-radius: var(--r-pill);
  background: var(--c-primary-soft);
  box-shadow: 0 4px 16px rgba(37, 99, 235, 0.16);
  transition: transform 0.2s;
}
.drop-zone:hover .upload-icon,
.drop-zone.is-dragging .upload-icon {
  transform: translateY(-4px) scale(1.05);
}
.drop-zone strong {
  font-size: var(--fs-lg);
  font-weight: 700;
  color: var(--txt-1);
  letter-spacing: -0.01em;
}
.drop-zone span {
  font-size: var(--fs-sm);
  max-width: 320px;
  line-height: 1.6;
}
.drop-zone small {
  font-size: var(--fs-xs);
  color: var(--txt-3);
  background: var(--surface-2);
  padding: 4px 10px;
  border-radius: var(--r-pill);
}
.docx-icon {
  color: var(--c-warn);
  opacity: 0.85;
}

/* 截图预览：大图优先，操作栏固定在底部 */
.image-preview-row,
.file-preview-row {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: var(--s3);
  padding: var(--s3);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-xs, 0 1px 2px rgba(15, 23, 42, 0.04));
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.image-preview-row:hover,
.file-preview-row:hover {
  border-color: var(--c-primary);
  box-shadow: var(--shadow-sm, 0 1px 3px rgba(15, 23, 42, 0.08));
}
.image-preview-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: var(--r-md);
  background: var(--surface-2);
}
.image-preview-row img {
  display: block;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  object-fit: contain;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.image-preview-toolbar {
  display: flex;
  align-items: center;
  gap: var(--s3);
  flex: none;
  min-height: 40px;
}
.image-preview-info {
  flex: 1;
  min-width: 0;
}
.image-preview-actions {
  display: flex;
  align-items: center;
  gap: var(--s2);
  flex: none;
}
.image-preview-info strong {
  display: block;
  font-size: var(--fs-sm);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.image-preview-info span {
  font-size: var(--fs-xs);
  color: var(--txt-3);
}
.text-action {
  height: 32px;
  padding: 0 var(--s3);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--txt-2);
  font-size: var(--fs-sm);
  font-weight: 500;
  transition: 0.12s;
}
.text-action:hover {
  border-color: var(--c-primary);
  color: var(--c-primary);
}
.icon-action {
  width: 32px;
  height: 32px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--txt-2);
  display: grid;
  place-items: center;
  transition: 0.12s;
}
.icon-action:hover {
  border-color: var(--c-primary);
  color: var(--c-primary);
}
.icon-action.danger:hover {
  border-color: var(--c-danger);
  color: var(--c-danger);
  background: rgba(220, 38, 38, 0.08);
}
.file-type-icon {
  display: inline-grid;
  place-items: center;
  height: 36px;
  padding: 0 var(--s3);
  border-radius: var(--r-md);
  font-size: var(--fs-xs);
  font-weight: 700;
  background: var(--surface-3);
  color: var(--txt-2);
}
.file-type-icon.docx {
  background: #eff6ff;
  color: var(--c-primary);
}
.file-type-icon.html-tag {
  background: #f0fdf4;
  color: #16a34a;
}

/* ══ 需求文档模式：左右双栏布局 ══ */

/* 双栏容器 */
.docx-dual-panel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s4);
  min-height: 320px;
  height: 100%;
}
/* 紧凑模式：上传区只占顶部一小条，下方让位给预览舞台 */
.docx-dual-panel--compact {
  min-height: 0;
  height: auto;
  gap: var(--s2);
  min-height: 120px;
}
.docx-dual-panel--compact .docx-panel {
  min-height: 0;
}
.docx-dual-panel--compact .docx-panel-header {
  padding: var(--s1) var(--s3);
  font-size: 11px;
}
.docx-dual-panel--compact .docx-drop-zone {
  min-height: 56px;
  padding: var(--s1) var(--s4);
  gap: 0;
  flex-direction: row;
  justify-content: center;
}
.docx-dual-panel--compact .docx-drop-zone .upload-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}
.docx-dual-panel--compact .docx-drop-zone strong {
  font-size: var(--fs-sm);
}
.docx-dual-panel--compact .docx-drop-zone span,
.docx-dual-panel--compact .docx-drop-zone small {
  display: none;
}
/* 已上传文件卡：纯单行（图标+文件名+操作按钮） */
.docx-file-card--compact {
  flex: none;
  padding: var(--s1) var(--s3);
  gap: var(--s2);
}
.docx-file-card--compact .docx-file-meta strong {
  font-size: var(--fs-xs, 12px);
}
.docx-file-card--compact .docx-file-meta span:last-child {
  display: none; /* 隐藏副标题行 */
}

/* 单栏面板 */
.docx-panel {
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--surface);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
/* 面板头部 */
.docx-panel-header {
  display: flex;
  align-items: center;
  gap: var(--s2);
  padding: var(--s2) var(--s3);
  border-bottom: 1px solid var(--border-soft);
  background: var(--surface-2);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--txt-2);
}
/* 状态徽标 */
.docx-badge {
  margin-left: auto;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.03em;
  padding: 2px 8px;
  border-radius: var(--r-pill, 9999px);
  text-transform: uppercase;
}
.docx-badge.pending {
  background: #fef3c7;
  color: #92400e;
}
.docx-badge.done {
  background: #d1fae5;
  color: #065f46;
}
html[data-theme='dark'] .docx-badge.pending {
  background: rgba(217, 119, 6, 0.18);
  color: #d29922;
}
html[data-theme='dark'] .docx-badge.done {
  background: rgba(16, 185, 129, 0.14);
  color: #3fb950;
}

/* 上传区域（双栏内） */
.docx-drop-zone {
  flex: 1;
  min-height: 180px;
  border: none;
  border-radius: 0;
  background: transparent;
  cursor: pointer;
}
.docx-drop-zone.is-dragging {
  background: var(--c-primary-soft, rgba(37, 99, 235, 0.06));
}

/* 文件卡片（已上传状态） */
.docx-file-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s3);
  padding: var(--s3) var(--s4);
  flex: none;
}
/* HTML 实时预览 / 组件拆分标注视图 */
.html-preview-frame {
  position: relative;
  overflow: hidden;
}

/* ══ 预览 + 组件列表：左右并列容器 ═══ */
.html-split-row {
  display: flex;
  flex-direction: row;
  gap: var(--s4);
  min-height: 320px;
  margin-top: var(--s3);
  height: 100%;
}
/* 预览舞台：占据剩余空间，内部 16:9 画布居中缩放 */
.html-preview-stage {
  flex: 1;
  min-width: 0; /* 防止 flex 子项溢出 */
  min-height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--s4);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-xl, 16px);
  overflow: hidden;
  container-type: size;
}
html[data-theme='dark'] .html-preview-stage {
  background: #0d1117;
}
/* 16:9 容器：用容器查询单位保证「宽高都贴合」的等比缩放 */
.html-preview-frame--169 {
  position: relative;
  aspect-ratio: 16 / 9;
  width: min(100cqw, calc(100cqh * 16 / 9));
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--r-lg, 12px);
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}
html[data-theme='dark'] .html-preview-frame--169 {
  background: #111;
}
.html-preview-frame--169 .html-preview-iframe {
  width: 100%;
  height: 100%;
  min-height: 0;
  border: none;
  display: block;
}
/* 分析中：画布中央大加载态 */
.html-preview-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--s3);
  color: var(--txt-2);
  text-align: center;
  padding: var(--s5);
}
.html-loading-spinner {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.html-loading-text {
  font-size: var(--fs-base, 14px);
  font-weight: 500;
  color: var(--txt-1);
  margin: 0;
}
.html-loading-sub {
  font-size: var(--fs-xs, 12px);
  color: var(--txt-3);
  margin: 0;
}
/* 空态 */
.html-preview-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--s3);
  color: var(--txt-3);
  text-align: center;
  font-size: var(--fs-sm);
  padding: var(--s4);
  max-width: 360px;
}
.html-preview-empty svg {
  opacity: 0.5;
}

/* ══ 组件拆分选择面板（右侧栏） ═══ */
.split-components-panel {
  flex: 0 0 340px; /* 固定宽度，不伸缩 */
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--r-lg, 12px);
  background: var(--surface);
  overflow: hidden;
}
.split-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--s2) var(--s4);
  border-bottom: 1px solid var(--border-soft);
  background: var(--surface-2);
}
.split-panel-title {
  display: flex;
  align-items: center;
  gap: var(--s2);
  font-size: var(--fs-sm, 13px);
  font-weight: 600;
  color: var(--txt-1);
}
.split-select-all {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--txt-2);
  cursor: pointer;
  user-select: none;
}
.split-select-all input[type='checkbox'] {
  accent-color: var(--c-primary, #2563eb);
  cursor: pointer;
}
/* 组件列表：填满面板剩余空间 */
.split-comp-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--s1) 0;
}
.split-comp-row {
  display: flex;
  align-items: flex-start;
  gap: var(--s2);
  padding: var(--s3) var(--s4);
  cursor: pointer;
  transition: background 0.12s ease;
  border-left: 3px solid transparent;
}
.split-comp-row:hover {
  background: var(--surface-2);
}
.split-comp--selected {
  border-left-color: var(--c-primary, #2563eb);
  background: rgba(37, 99, 235, 0.04);
}
.split-comp--hover .split-comp-name {
  color: var(--c-primary, #2563eb);
}
.split-comp-check {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.split-comp-check input[type='checkbox'] {
  accent-color: var(--c-primary, #2563eb);
  cursor: pointer;
  width: 14px;
  height: 14px;
}
.split-comp-idx {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #e6f1fb;
  color: #185fa5;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
html[data-theme='dark'] .split-comp-idx {
  background: rgba(55, 138, 221, 0.18);
  color: #5b9cf5;
}
.split-comp-name {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-sm, 13px);
  line-height: 1.4;
  word-break: break-word;
  color: var(--txt-1);
}
.split-comp-strategy {
  flex-shrink: 0;
  font-size: 10px;
  padding: 1px 7px;
  border-radius: var(--r-pill, 9999px);
  background: #eaf3de;
  color: #27500a;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  font-weight: 600;
  white-space: nowrap;
}
html[data-theme='dark'] .split-comp-strategy {
  background: rgba(99, 153, 34, 0.15);
  color: #639922;
}
/* 组件标签叠加层：浮动在 iframe 上方 */
.comp-labels-overlay {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  pointer-events: none; /* 让事件穿透到 iframe */
}
.comp-label-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px 3px 3px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(4px);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 999px;
  font-size: 11.5px;
  color: var(--txt-1, #334155);
  cursor: pointer;
  pointer-events: auto;
  transition: all 0.15s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  user-select: none;
  white-space: nowrap;
  max-width: 180px;
}
.comp-label-badge:hover {
  border-color: var(--c-primary, #3b82f6);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.18);
  transform: translateY(-1px);
}
.comp-label--hover {
  border-color: var(--c-primary, #3b82f6) !important;
  background: rgba(59, 130, 246, 0.08) !important;
  box-shadow: 0 2px 10px rgba(59, 130, 246, 0.22) !important;
}
html[data-theme='dark'] .comp-label-badge {
  background: rgba(17, 24, 39, 0.92);
  border-color: var(--border, #374151);
  color: var(--txt-1, #e2e8f0);
}
html[data-theme='dark'] .comp-label-badge:hover,
html[data-theme='dark'] .comp-label--hover {
  border-color: #60a5fa;
  background: rgba(59, 130, 246, 0.14);
}
.comp-label-num {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.comp-label-name {
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}
.html-preview-iframe {
  width: 100%;
  height: 100%;
  min-height: 200px;
  border: none;
  display: block;
}
.docx-file-info {
  display: flex;
  align-items: center;
  gap: var(--s2);
  min-width: 0;
}
.docx-file-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.docx-file-meta strong {
  font-size: var(--fs-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.docx-file-meta span {
  font-size: var(--fs-xs);
  color: var(--txt-3);
}
.docx-file-actions {
  display: flex;
  align-items: center;
  gap: var(--s2);
  flex-shrink: 0;
}

/* 状态行（分析中 / 成功 / 打包） */
.docx-status-line {
  display: flex;
  align-items: center;
  gap: var(--s2);
  padding: var(--s2) var(--s4);
  font-size: var(--fs-xs);
  font-weight: 500;
  border-top: 1px solid var(--border-soft);
}
.docx-status-line.analyzing {
  color: var(--c-primary);
  background: var(--c-primary-soft, rgba(37, 99, 235, 0.04));
}
.docx-status-line.success {
  color: var(--c-cta, #059669);
  background: rgba(5, 150, 105, 0.04);
}
.docx-status-line.building {
  color: var(--c-warn);
  background: rgba(217, 119, 6, 0.04);
}

/* 小号 spinner */
.spinner--sm {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(0, 0, 0, 0.08);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
html[data-theme='dark'] .spinner--sm {
  border-color: rgba(255, 255, 255, 0.1);
}

/* 响应式：窄屏折叠为上下 */
@media (max-width: 768px) {
  .docx-dual-panel {
    grid-template-columns: 1fr;
  }
  .html-split-row {
    flex-direction: column;
    min-height: auto;
  }
  .split-components-panel {
    flex: none;
    width: 100%;
  }
}
.file-type-icon.small {
  height: 30px;
}
.source-hint {
  font-size: var(--fs-xs);
  color: var(--txt-3);
  margin: var(--s2) 0 0;
  line-height: 1.5;
}

/* ══ Figma 内联（保留原逻辑样式） ══ */
.figma-inline-bar {
  display: flex;
  flex-direction: column;
  gap: var(--s3);
  height: 100%;
}
.figma-inline-input-row {
  display: flex;
  gap: var(--s2);
  align-items: center;
  position: relative; /* 历史下拉框的定位锚点 */
}
.figma-inline-input {
  flex: 1;
  height: 54px;
  padding: 0 var(--s5);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--txt-1);
  font-size: var(--fs-base);
  font-family: var(--mono);
  transition: 0.12s;
}
.figma-inline-input:focus {
  outline: none;
  border-color: var(--c-primary);
  box-shadow: var(--focus);
}
.figma-inline-input::placeholder {
  color: var(--txt-3);
  font-family: var(--font);
}
.history-btn {
  width: 54px;
  height: 54px;
  flex: none;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--txt-2);
  display: grid;
  place-items: center;
  transition: 0.12s;
}
.history-btn:hover,
.history-btn.active {
  border-color: var(--c-primary);
  color: var(--c-primary);
  background: var(--c-primary-soft);
}

/* 确认按钮 — 与输入框同高 */
.figma-inline-input-row .btn.btn-primary {
  height: 54px;
  padding: 0 var(--s5);
  border-radius: var(--r-md);
  font-size: var(--fs-base);
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}
.input-feedback {
  font-size: var(--fs-xs);
  color: var(--c-cta);
}
.input-feedback.invalid {
  color: var(--c-danger);
}
/* ══ Figma 画布容器（始终存在，内部内容随状态切换） ══ */
/* 原为 2px 虚线 + 径向渐变，视觉上像「拖拽上传区」，但这里并非上传区，
   误导用户尝试拖拽；改为平静的实线内容容器，并压缩默认高度。 */
.figma-canvas {
  flex: 1;
  min-height: 200px;
  border: 1px solid var(--border);
  border-radius: var(--r-xl, 16px);
  background: var(--surface-2, var(--surface-3));
  overflow: hidden;
  position: relative;
}

/* ── 状态 B：加载中（居中显示在画布内） ── */
.figma-loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--s3);
  height: 100%;
  min-height: 260px;
  padding: var(--s7);
}
.figma-loading-spinner {
  width: 48px;
  height: 48px;
}
.spinner--lg {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(0, 0, 0, 0.08);
  border-top-color: var(--c-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
html[data-theme='dark'] .spinner--lg {
  border-color: rgba(255, 255, 255, 0.1);
  border-top-color: var(--c-primary);
}
.figma-loading-text {
  font-size: var(--fs-base);
  font-weight: 500;
  color: var(--txt-2);
  margin: 0;
}
.figma-loading-hint,
.figma-pending-state small {
  font-size: var(--fs-xs);
  color: var(--c-warn);
  margin: 0;
}
.figma-loading-sub {
  font-size: var(--fs-xs);
  color: var(--txt-3);
  max-width: 28rem;
  text-align: center;
  word-break: break-all;
  margin: 0;
}

/* ── 状态 D：预览错误 ── */
.figma-error-state,
.figma-pending-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--s3);
  height: 100%;
  min-height: 220px;
  padding: var(--s7);
  color: var(--txt-3);
  text-align: center;
}
.figma-pending-state strong,
.figma-error-state strong {
  color: var(--txt-1);
  font-size: var(--fs-base);
}
.figma-pending-state p {
  margin: 0;
  color: var(--txt-2);
  font-size: var(--fs-sm);
}
.figma-error-state--validation svg {
  color: var(--c-warn);
}
.figma-error-msg {
  font-size: var(--fs-sm);
  color: var(--c-danger);
  margin: 0;
  max-width: 24rem;
  text-align: center;
}
.figma-preview-card {
  border: none;
  border-radius: 0;
  overflow: hidden;
  background: transparent;
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}
.figma-preview-card--retained .preview-thumb img {
  opacity: 0.55;
  filter: saturate(0.65);
}
.preview-transition-mask {
  position: absolute;
  inset: 0 0 34px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--s2);
  padding: var(--s5);
  text-align: center;
  color: var(--txt-1);
  background: color-mix(in srgb, var(--surface) 76%, transparent);
  backdrop-filter: blur(2px);
}
.preview-transition-mask span {
  color: var(--txt-2);
  font-size: var(--fs-xs);
}
.preview-image-probe {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.preview-thumb {
  flex: 1;
  min-height: 0;
  background: var(--surface);
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid var(--border-soft);
}
.preview-thumb img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.preview-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--s2) var(--s4);
  font-size: var(--fs-xs);
  color: var(--txt-2);
}
.preview-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-size {
  color: var(--txt-3);
  flex: none;
}

/* Figma 空态引导（在 .figma-canvas 容器内，不需要自己的边框/背景） */
.figma-empty-guide {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--s3);
  color: var(--txt-3);
  text-align: center;
  padding: var(--s7);
  height: 100%;
}
.figma-empty-icon {
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  border-radius: var(--r-pill);
  background: var(--surface-2);
  color: var(--c-primary);
  opacity: 0.6;
}
.figma-empty-guide strong {
  font-size: 16px;
  font-weight: 600;
  color: var(--txt-1);
}
.figma-empty-guide p {
  font-size: var(--fs-base);
  line-height: 1.65;
  max-width: 340px;
}

/* ══ Figma URL 历史下拉（绝对定位紧跟输入行下方） ══ */
.url-history-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 60;
  border: 1px solid var(--border);
  border-radius: var(--r-lg, 12px);
  background: var(--surface);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.12),
    0 2px 8px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  max-height: 320px;
  overflow-y: auto;
  animation: historyDropIn 0.18s ease-out;
}
@keyframes historyDropIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 头部：标题 + 清空 */
.url-history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--s2) var(--s3);
  border-bottom: 1px solid var(--border-soft);
  background: var(--surface-2);
}
.url-history-title {
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--txt-2);
  letter-spacing: 0.02em;
}

/* 单条记录 */
.url-history-item {
  display: flex;
  align-items: center;
  gap: var(--s2);
  padding: var(--s2) var(--s3);
  cursor: pointer;
  transition: background 0.12s;
  border-bottom: 1px solid var(--border-soft, transparent);
}
.url-history-item:last-child {
  border-bottom: none;
}
.url-history-item:hover {
  background: var(--c-primary-soft, rgba(37, 99, 235, 0.06));
}
/* 链接图标 */
.url-item-icon {
  flex-shrink: 0;
  color: var(--txt-3);
  opacity: 0.7;
}
.url-history-item:hover .url-item-icon {
  color: var(--c-primary);
  opacity: 1;
}
/* 链接文字 */
.url-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-xs);
  font-family: var(--mono);
  color: var(--txt-2);
}
.url-history-item:hover .url-text {
  color: var(--txt-1);
}

/* 删除按钮 — 精致圆形 × 图标 */
.url-del {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--txt-3);
  cursor: pointer;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  opacity: 0;
  transition: all 0.15s ease;
}
.url-history-item:hover .url-del {
  opacity: 1;
}
.url-del:hover {
  background: rgba(220, 38, 38, 0.1);
  color: #ef4444;
  transform: scale(1.1);
}
.url-del:active {
  transform: scale(0.92);
}

/* 底部清空 */
.url-history-clear {
  display: inline-flex;
  padding: var(--s2) var(--s3);
  font-size: var(--fs-xs);
  color: var(--txt-3);
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.12s;
  font-weight: 500;
}
.url-history-clear:hover {
  color: #ef4444;
}
.figma-inline-readonly {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s3) var(--s4);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--c-primary-soft);
}
.figma-readonly-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--c-cta);
  background: #ecfdf5;
  padding: 4px 10px;
  border-radius: var(--r-pill);
}
.figma-readonly-url {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-xs);
  font-family: var(--mono);
  color: var(--txt-2);
}
.figma-readonly-change {
  height: 30px;
  padding: 0 var(--s3);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--txt-2);
  font-size: var(--fs-xs);
  font-weight: 500;
  transition: 0.12s;
}
.figma-readonly-change:hover {
  color: var(--txt-1);
  background: var(--surface-2);
}

/* ══ action row ══ */
.action-row {
  display: flex;
  align-items: center;
  gap: var(--s3);
  flex-wrap: wrap;
  margin-bottom: var(--s3);
}
.tech-chips {
  display: flex;
  gap: var(--s2);
  min-width: 33%;
}
.seg-wrap {
  display: flex;
  min-width: 33%;
}
/* ══ CTA 按钮（:deep 穿透到 RippleButton 子组件） ══ */
:deep(.cta) {
  flex: 1;
  min-width: 200px;
  height: 46px;
  border-radius: var(--r-md);
  background: linear-gradient(135deg, var(--c-cta) 0%, var(--c-cta-hover) 100%);
  color: #fff;
  font-size: var(--fs-lg);
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s2);
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  letter-spacing: 0.01em;
  border: none;
  box-shadow:
    0 4px 14px rgba(5, 150, 105, 0.22),
    0 1px 3px rgba(5, 150, 105, 0.16);
}
:deep(.cta:hover) {
  transform: translateY(-2px);
  box-shadow:
    0 6px 20px rgba(5, 150, 105, 0.3),
    0 2px 6px rgba(5, 150, 105, 0.2);
}
:deep(.cta:active) {
  transform: translateY(0);
}
:deep(.cta:disabled) {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
:deep(.cta.busy) {
  background: linear-gradient(135deg, var(--c-danger) 0%, #f87171 100%);
  box-shadow: 0 4px 14px rgba(239, 68, 68, 0.28);
}
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* status + quota */
.quota-bar {
  font-size: var(--fs-xs);
  color: var(--txt-3);
  margin-bottom: var(--s4);
}

/* ══ right panel — 设计升级 ══ */
.right-panel {
  width: var(--right-w);
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: linear-gradient(180deg, var(--surface) 0%, var(--surface-2) 100%);
  border-left: 1px solid var(--border-soft);
  overflow: hidden;
  padding: var(--s6) var(--s5);
}
.r-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--s4);
}
.r-title {
  font-size: var(--fs-sm);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: var(--s2);
  color: var(--txt-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.r-title svg {
  width: 15px;
  height: 15px;
  color: var(--c-primary);
  opacity: 0.7;
}
.r-link {
  font-size: var(--fs-xs);
  color: var(--c-primary);
  text-decoration: none;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: var(--r-pill);
  transition: 0.12s;
}
.r-link:hover {
  background: var(--c-primary-soft);
  text-decoration: none;
}

/* ── 概览统计卡片 ── */
.ov-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s3);
  margin-bottom: var(--s5);
}
.ov-card {
  border: none;
  border-radius: var(--r-lg);
  padding: var(--s4) var(--s4) var(--s3);
  background: var(--surface);
  box-shadow:
    0 1px 3px rgba(15, 23, 42, 0.06),
    0 1px 2px rgba(15, 23, 42, 0.04);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  position: relative;
  overflow: hidden;
}
.ov-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 2px 0 0 2px;
  opacity: 0.7;
}
.ov-card:hover {
  transform: translateY(-2px);
  box-shadow:
    0 8px 24px rgba(15, 23, 42, 0.1),
    0 2px 6px rgba(15, 23, 42, 0.06);
}
.ov-num {
  font-size: 28px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
  font-feature-settings: 'tnum';
}
.ov-label {
  font-size: var(--fs-xs);
  color: var(--txt-3);
  margin-top: var(--s1);
  font-weight: 500;
}

/* 默认态 — 蓝灰 */
.ov-card {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
}
.ov-card::before {
  background: linear-gradient(180deg, #94a3b8, #cbd5e1);
}
.ov-card .ov-num {
  color: #475569;
}

/* 已完成 — 绿 */
.ov-card.done {
  background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
}
.ov-card.done::before {
  background: linear-gradient(180deg, #059669, #34d399);
}
.ov-card.done .ov-num {
  color: #047857;
}

/* 进行中 — 蓝 */
.ov-card.prog {
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
}
.ov-card.prog::before {
  background: linear-gradient(180deg, #2563eb, #60a5fa);
}
.ov-card.prog .ov-num {
  color: #1d4ed8;
}

/* 失败 — 红 */
.ov-card.fail {
  background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
}
.ov-card.fail::before {
  background: linear-gradient(180deg, #dc2626, #f87171);
}
.ov-card.fail .ov-num {
  color: #b91c1c;
}

/* ── 最近生成 ── */
.recent-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--s3);
}
.recent-title {
  font-size: var(--fs-sm);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: var(--s2);
  color: var(--txt-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.recent-title svg {
  width: 15px;
  height: 15px;
  color: var(--c-primary);
  opacity: 0.7;
}
.task-list {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}
.task-list::-webkit-scrollbar {
  width: 6px;
}
.task-list::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: var(--radius-xs);
}
.task-list:hover::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
}
.task-item {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s3) var(--s4);
  border: none;
  border-radius: var(--r-md);
  background: var(--surface);
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
.task-item:hover {
  transform: translateX(3px);
  box-shadow:
    0 4px 12px rgba(15, 23, 42, 0.08),
    0 1px 3px rgba(15, 23, 42, 0.06);
  background: var(--surface);
}
.state-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--r-pill);
  flex: none;
  background: var(--txt-3);
  transition: 0.12s;
}
.state-dot.done {
  background: var(--c-cta);
  box-shadow: 0 0 6px rgba(5, 150, 105, 0.35);
}
.state-dot.prog {
  background: var(--c-primary);
  box-shadow: 0 0 6px rgba(37, 99, 235, 0.35);
  animation: pulse-dot 2s ease-in-out infinite;
}
.state-dot.fail {
  background: var(--c-danger);
  box-shadow: 0 0 6px rgba(220, 38, 38, 0.35);
}
@keyframes pulse-dot {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(1.25);
  }
}

/* ══ right panel — 暗色覆盖（统一冷蓝灰）══ */
html[data-theme='dark'] .unified-generate.gen-v4 .right-panel {
  background: linear-gradient(180deg, #161b22 0%, #1c2128 100%);
  border-left-color: #30363d;
}
html[data-theme='dark'] .unified-generate.gen-v4 .ov-card {
  background: linear-gradient(135deg, #1c2128 0%, #21262d 100%);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
html[data-theme='dark'] .unified-generate.gen-v4 .ov-card::before {
  background: linear-gradient(180deg, #388bfd, #58a6ff);
  opacity: 0.45;
}
html[data-theme='dark'] .unified-generate.gen-v4 .ov-card .ov-num {
  color: #e6edf3;
}
html[data-theme='dark'] .unified-generate.gen-v4 .ov-card.done {
  background: linear-gradient(135deg, rgba(63, 185, 80, 0.13) 0%, rgba(35, 134, 54, 0.06) 100%);
}
html[data-theme='dark'] .unified-generate.gen-v4 .ov-card.done .ov-num {
  color: #56d364;
}
html[data-theme='dark'] .unified-generate.gen-v4 .ov-card.prog {
  background: linear-gradient(135deg, rgba(56, 139, 253, 0.14) 0%, rgba(38, 103, 179, 0.07) 100%);
}
html[data-theme='dark'] .unified-generate.gen-v4 .ov-card.prog .ov-num {
  color: #58a6ff;
}
html[data-theme='dark'] .unified-generate.gen-v4 .ov-card.fail {
  background: linear-gradient(135deg, rgba(248, 81, 73, 0.14) 0%, rgba(218, 57, 53, 0.07) 100%);
}
html[data-theme='dark'] .unified-generate.gen-v4 .ov-card.fail .ov-num {
  color: #f85149;
}
html[data-theme='dark'] .unified-generate.gen-v4 .task-item {
  background: #161b22;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}
html[data-theme='dark'] .unified-generate.gen-v4 .task-item:hover {
  background: #1c2128;
}

/* ══ source tabs — 暗色 ══ */
html[data-theme='dark'] .unified-generate.gen-v4 .source-tabs {
  background: #21262d;
}
html[data-theme='dark'] .unified-generate.gen-v4 .source-tab:hover {
  background: #30363d;
}
html[data-theme='dark'] .unified-generate.gen-v4 .source-tab.active {
  box-shadow: inset 0 0 0 1px rgba(56, 139, 253, 0.28);
}

/* ══ figma empty guide — 暗色 ══ */
html[data-theme='dark'] .unified-generate.gen-v4 .figma-canvas {
  border-color: #30363d;
  background: #161b22;
}
html[data-theme='dark'] .unified-generate.gen-v4 .figma-empty-icon {
  background: #21262d;
}

.task-main {
  flex: 1;
  min-width: 0;
}
.task-name {
  font-size: var(--fs-sm);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-time {
  font-size: var(--fs-xs);
  color: var(--txt-3);
  margin-top: 2px;
}
.task-meta {
  font-size: var(--fs-xs);
  color: var(--txt-2);
  margin-top: 2px;
  display: flex;
  gap: 6px;
  align-items: center;
}
.task-source {
  color: var(--txt-3);
  opacity: 0.75;
}
.task-duration {
  color: var(--txt-3);
  opacity: 0.75;
}
/*  P0-3: 视觉分析降级警告（黄色，不阻断） */
.task-degraded {
  font-size: var(--fs-xs);
  color: #e6a23c;
  margin-top: 3px;
  line-height: 1.35;
  display: flex;
  align-items: flex-start;
  gap: 4px;
}
/*  S1-④: 可复用缓存提示（绿色，正向——重试会快） */
.task-degraded--retry {
  color: #67c23a;
}
.task-tag {
  font-size: var(--fs-xs);
  font-weight: 500;
  flex: none;
  padding: 2px 8px;
  border-radius: var(--r-pill);
  background: var(--surface-3);
  color: var(--txt-2);
}
.task-tag.done {
  background: #ecfdf5;
  color: var(--c-cta);
}
.task-tag.prog {
  background: var(--c-primary-soft);
  color: var(--c-primary);
}
.task-tag.fail {
  background: #fef2f2;
  color: var(--c-danger);
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s2);
  padding: var(--s6) var(--s4);
  color: var(--txt-3);
  text-align: center;
}
.empty-state svg {
  width: 40px;
  height: 40px;
}
.es-text {
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--txt-2);
}
.es-hint {
  font-size: var(--fs-xs);
}

/* ══ toast ══ */
.app-toast {
  position: fixed;
  left: 50%;
  bottom: 84px;
  transform: translateX(-50%) translateY(20px);
  background: var(--txt-1);
  color: var(--bg);
  padding: var(--s3) var(--s5);
  border-radius: var(--r-pill);
  font-size: var(--fs-sm);
  font-weight: 500;
  box-shadow: var(--shadow-lg);
  opacity: 0;
  pointer-events: none;
  transition: 0.2s;
  z-index: 400;
  max-width: 90vw;
}
.app-toast:not(:empty) {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* ══ 响应式 ══ */
@media (max-width: 1024px) {
  .workbench {
    flex-direction: column;
    overflow: auto;
  }
  .main-col {
    order: 1;
    padding: var(--s5) var(--s4);
  }
  .right-panel {
    order: 2;
    width: auto;
    border-left: none;
    border-top: 1px solid var(--border);
  }
}
@media (max-width: 640px) {
  .image-preview-toolbar {
    align-items: flex-start;
  }
  .image-preview-actions {
    flex-shrink: 0;
  }
  .action-row {
    flex-direction: column;
    align-items: stretch;
  }
  .tech-chips,
  .seg-wrap {
    width: 100%;
  }
  :deep(.cta) {
    width: 100%;
  }
  .page-title {
    font-size: var(--fs-2xl);
  }
  .main-col {
    padding: var(--s5) var(--s4);
  }
}
</style>
