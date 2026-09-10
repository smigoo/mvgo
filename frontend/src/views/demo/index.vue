<!--
 * @Description: 微码demo页面（可本地对单个组件进行预览测试）
 * @Author: 朱琦 1972662943@qq.com
 * @Date: 2025-07-05 15:24:39
 * @LastEditors: 张从枚 1024243772@qq.com
 * @LastEditTime: 2026-03-25 11:07:48
 * @FilePath: /mc-component-warehouse/src/views/demo/index.vue
-->
<template>
  <div class="demo-wrapper" :class="{ 'vue3-mode': !isMcComponent }" :style="{ gridTemplateColumns }">
    <!-- P2: 质量检查未通过警告横幅 -->
    <div v-if="isTaskFailed" class="quality-warning-banner">
      <span class="warning-icon" aria-hidden="true">!</span>
      <span class="warning-text">
        此任务质量检查未通过，代码可能存在错误。你可以在 Playground 中查看和修复代码。
      </span>
      <button class="warning-close icon-tooltip" data-tooltip="关闭提示" aria-label="关闭提示" @click="dismissWarning">×</button>
    </div>

    <!-- 🛡️ A 方案：生成进行中进入 PG 为草稿模式，主组件锁定不可编辑 -->
    <div v-if="isTaskRunningPartial" class="running-draft-banner">
      <span class="warning-icon" aria-hidden="true">⚠</span>
      <span class="warning-text">
        生成进行中：当前为草稿模式，主组件(index.vue)尚未生成完，已被锁定不可编辑（避免被生成覆盖）；子组件可正常编辑，生成完成后自动解锁。
      </span>
    </div>

    <!-- 左侧：文件列表 -->
    <div class="file-sidebar">
      <div class="file-header">
        <span class="file-header-title">
          当前文件
          <span class="file-type-badge" :class="isMcComponent ? 'phase2' : 'vue3'">
            {{ isPageMode ? '页面' : (isMcComponent ? '微码' : 'Vue3') }}
          </span>
        </span>
        <button class="file-header-gear" title="设置 / 快捷键" @click="openSettings">⚙</button>
      </div>
      <!-- VS Code 风格搜索面板（紧凑） -->
      <div class="vscode-search-panel">
        <!-- 搜索行：图标 + 输入框(含清除) + 紧凑选项 -->
        <div class="vscode-search-row">
          <span class="vscode-search-icon">⌕</span>
          <div class="vscode-input-wrap">
            <input
              ref="codeSearchInputRef"
              v-model="codeSearchQuery"
              type="text"
              placeholder="搜索"
              class="vscode-search-input"
              @input="onSearchInput"
              @keydown.enter="executeCodeSearch(true)"
              @keydown.esc="clearSearch"
            />
            <span v-if="codeSearchQuery" class="vscode-clear-btn" @click="clearSearch">✕</span>
          </div>
          <!-- 紧凑选项：小字内联按钮 -->
          <button class="vscode-opt" :class="{ active: searchCaseSensitive }" @click="searchCaseSensitive = !searchCaseSensitive; executeCodeSearch(true)" title="区分大小写">Aa</button>
          <button class="vscode-opt" :class="{ active: searchWholeWord }" @click="searchWholeWord = !searchWholeWord; executeCodeSearch(true)" title="全字匹配">AaBb</button>
          <button class="vscode-opt" :class="{ active: searchUseRegex }" @click="toggleRegex()" title="正则表达式">.*</button>
          <button class="vscode-opt" :class="{ active: showReplaceRow }" @click="showReplaceRow = !showReplaceRow" title="替换">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M13.5 2h-11C1.67 2 1 2.67 1 3.5v9c0 .83.67 1.5 1.5 1.5H6l2 2 2-2h3.5c.83 0 1.5-.67 1.5-1.5v-9c0-.83-.67-1.5-1.5-1.5zM5 8V6h2v2H5zm4 0V6h2v2H9z"/></svg>
          </button>
          <!-- 结果计数内联 -->
          <span v-if="codeSearchQuery.trim() && codeSearchResults.length && !codeSearchLoading" class="vscode-count-inline">{{ codeSearchResults.length }}</span>
        </div>

        <!-- 替换行 -->
        <div v-if="showReplaceRow" class="vscode-replace-row">
          <span class="vscode-replace-icon">↩</span>
          <div class="vscode-input-wrap">
            <input v-model="codeReplaceQuery" type="text" placeholder="替换为" class="vscode-replace-input" @keydown.enter="replaceAll()" />
          </div>
        </div>

        <!-- 搜索范围（在文件夹 / 文件中查找） -->
        <div v-if="codeSearchScope" class="search-scope-chip">
          <span class="scope-label">范围</span>
          <span class="scope-path">{{ codeSearchScope.path }}</span>
          <button class="scope-clear" title="清除范围" @click="clearSearchScope">✕</button>
        </div>

        <!-- 文件树容器（搜索时完全隐藏） -->
        <div v-if="!codeSearchQuery.trim()" class="file-tree-container">
          <a-tree
            v-if="fileTree.length > 0"
            :tree-data="fileTree"
          :show-icon="true"
          :expanded-keys="expandedFileKeys"
          :selected-keys="[activeFile]"
          @expand="onTreeExpand"
          @select="onTreeNodeSelect"
          @rightClick="onTreeRightClick"
        >
          <template #switcherIcon="{ expanded }">
            <span class="tree-switcher-icon">{{ expanded ? '▾' : '▸' }}</span>
          </template>
          <template #icon="{ icon }">
            <span class="tree-node-icon" :class="iconClass(icon)">{{ icon }}</span>
          </template>
          <template #title="{ title, _modified }">
            <span class="tree-title-text" :class="{ 'is-modified': _modified }">{{ title }}</span>
          </template>
        </a-tree>
        <div v-else class="empty-state">暂无文件</div>
      </div>
      </div><!-- /vscode-search-panel -->

      <!-- VS Code 风格搜索结果（按文件分组） -->
      <div v-if="codeSearchQuery.trim()" class="vscode-results-panel">
        <div v-if="codeSearchLoading" class="vscode-search-status">搜索中...</div>
        <div v-else-if="codeSearchResults.length === 0" class="vscode-search-status">未找到匹配结果</div>
        <template v-else>
          <div
            v-for="(group, gIdx) in groupedSearchResults"
            :key="group.path"
            class="vscode-file-group"
          >
            <!-- 文件头：单行紧凑 -->
            <div
              class="vscode-file-header"
              :class="{ collapsed: group.collapsed }"
              @click="group.collapsed = !group.collapsed"
            >
              <span class="vscode-collapse-icon">{{ group.collapsed ? '▸' : '▾' }}</span>
              <span class="vscode-file-icon" :class="getFileExtClass(group.name)">{{ getFileExtIcon(group.name) }}</span>
              <span class="vscode-file-name" :title="group.path" @click.stop="openFileInEditor(group)">{{ group.name }}</span>
              <span class="vscode-match-count">{{ group.matches.length }}</span>
              <button v-if="showReplaceRow && codeReplaceQuery" class="vscode-replace-file-btn" title="替换此文件" @click.stop="replaceInFile(group)">替换</button>
              <button class="vscode-ignore-btn" title="忽略此文件" @click.stop="removeFileFromResults(gIdx)">✕</button>
            </div>
            <!-- 匹配行 -->
            <div v-show="!group.collapsed" class="vscode-match-list">
              <div
                v-for="match in group.matches"
                :key="`${match.line}:${match.column}`"
                class="vscode-match-item"
                @click="goToSearchResult(match)"
              >
                <span class="vscode-line-num">{{ match.line }}</span>
                <span class="vscode-match-text" v-html="highlightMatch(match.preview, codeSearchQuery)"></span>
              </div>
            </div>
          </div>
        </template>
        <!-- 底部操作栏 -->
        <div v-if="codeSearchResults.length > 0 && showReplaceRow && codeReplaceQuery" class="vscode-results-footer">
          <button class="vscode-replace-all-btn" @click="replaceAll()">
            全部替换 ({{ codeSearchResults.length }})
          </button>
        </div>
      </div>
    </div>

    <!-- 左侧分隔条 -->
    <div
      class="resizer resizer-left"
      :class="{ dragging: isDragging && dragTarget === 'left' }"
      @mousedown="startDrag($event, 'left')"
    ></div>

    <!-- 中间：画布+配置 -->
    <div class="main-content" :style="mainContentGridStyle">
      <!-- 上：画布区域（多Tab） -->
      <div class="canvas-area">
        <!-- 画布顶部全局操作栏（所有标签页共享：组件信息 + 推送/下载） -->
        <div class="canvas-toolbar">
          <!-- 组件信息区（左侧）：组件名称 + 任务号 + 组件ID -->
          <div class="canvas-info">
            <span class="info-item component-name" :title="componentId">
              {{ declareConfig?.componentName || componentId }}
            </span>
            <span v-if="taskId" class="info-item task-id" :title="taskId">
              #{{ taskId }}
            </span>
            <span class="info-item component-id" :title="componentId">
              {{ componentId }}
            </span>
            <span class="info-item file-type-badge" :class="isMcComponent ? 'phase2' : 'vue3'">
              {{ isPageMode ? '页面' : (isMcComponent ? '微码' : 'Vue3') }}
            </span>
          </div>
          <a-space :size="8">
            <McSpecCheckButton
              v-if="isMcComponent && !isPageMode"
              :component-id="componentId"
              :disabled="componentId === 'mc-demo'"
              :title="componentId === 'mc-demo' ? '当前为占位组件 mc-demo（无产物目录），请先打开具体组件' : undefined"
            />
            <a-button
              type="primary"
              size="small"
              :disabled="!canPushGit"
              :title="canPushGit ? '推送到GitLab' : '推送到GitLab暂不开放'"
              @click="openGitLabModal"
            >
              推送到 GitLab
            </a-button>
            <!-- 推送到 GitLab 已通过顶部入口提供，此处不再重复"下载组件"按钮：
               旧版下载 ZIP/下载组件入口已下线（截图标记位置移除），能力仍由 downloadComponent 函数保留 -->
        </a-space>
        </div>
        <div class="editor-split-row" :class="{ 'split-on': splitView }">
        <div class="editor-pane-main">
        <a-tabs v-model:activeKey="activeCanvasTab" type="editable-card" @edit="onCanvasTabEdit">
          <!-- 预览Tab -->
          <a-tab-pane key="preview" tab="预览" :closable="false">
            <!-- 预览控制工具栏（分辨率/缩放，仅预览页） -->
            <div class="preview-controls">
              <a-space :size="16">
                <a-space :size="8">
                  <span class="control-label">容器尺寸:</span>
                  <span class="control-value">{{ previewContainerWidth }} × {{ previewContainerHeight }}</span>
                  <button
                    v-if="customPreviewWidth > 0 || customPreviewHeight > 0"
                    class="fit-btn"
                    @click="resetPreviewSize"
                    title="恢复 Figma 原始尺寸"
                  >
                    重置
                  </button>
                </a-space>
                <a-space :size="8">
                  <span class="control-label">缩放:</span>
                  <a-select v-model:value="previewScale" style="width: 110px" size="small">
                    <a-select-option value="fit">自适应</a-select-option>
                    <a-select-option :value="50">50%</a-select-option>
                    <a-select-option :value="75">75%</a-select-option>
                    <a-select-option :value="100">100%</a-select-option>
                    <a-select-option :value="125">125%</a-select-option>
                    <a-select-option :value="150">150%</a-select-option>
                  </a-select>
                  <button class="fit-btn" @click="previewScale = 'fit'" title="适应窗口">Fit</button>
                </a-space>
              </a-space>
            </div>

            <!-- 预览容器 -->
            <div class="preview-wrapper" ref="previewWrapperRef">
              <div class="preview-box" :style="previewStyle">
                <!-- P0: 预览失败时显示友好错误卡片（替代空白iframe） -->
                <div v-if="previewError && !previewErrorDismissed" class="preview-error-card">
                  <!-- P1: AI修复进行中覆盖层 -->
                  <div v-if="previewAiFixing" class="preview-ai-fix-overlay">
                    <span class="preview-ai-fix-spinner"></span>
                    <div class="preview-ai-fix-title">AI 正在修复组件…</div>
                    <div class="preview-ai-fix-sub">
                      预计需要 1–3 分钟，请耐心等待（已等待 {{ previewAiFixSeconds }} 秒）
                    </div>
                    <button
                      class="preview-error-btn ghost"
                      :disabled="previewAiFixCancelling"
                      @click="cancelPreviewAiFix"
                    >
                      {{ previewAiFixCancelling ? '取消中…' : '取消修复' }}
                    </button>
                  </div>
                  
                  <template v-else>
                    <div class="preview-error-icon">
                      <svg
                        viewBox="0 0 24 24"
                        width="32"
                        height="32"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path
                          d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                        />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    </div>
                    <div class="preview-error-title">组件加载失败</div>
                    <div class="preview-error-desc">
                      这是
                      <strong>组件自身的问题</strong>
                      （如文件缺失、样式编译错误或引用了不支持的资源），
                      <strong>不会影响系统其他功能</strong>
                      。
                    </div>
                    <pre class="preview-error-detail">{{ previewError }}</pre>
                    
                    <!-- P2: 智能诊断建议 -->
                    <div v-if="previewDiagnostic" class="preview-error-location">
                      {{ previewDiagnostic.file }}:{{ previewDiagnostic.line }}:{{ previewDiagnostic.column }}
                    </div>
                    <div v-if="previewSmartSuggestion" class="preview-smart-suggestion">
                      <span class="suggestion-icon">💡</span>
                      <span class="suggestion-text">{{ previewSmartSuggestion }}</span>
                    </div>
                    
                    <div class="preview-error-actions">
                      <!-- P1: AI一键修复按钮 -->
                      <button class="preview-error-btn primary" @click="handlePreviewAiFix">
                        AI 一键修复
                      </button>
                      <button class="preview-error-btn" @click="reloadPreview">重新加载</button>
                      <button v-if="previewDiagnostic" class="preview-error-btn" @click="revealDiagnosticFile">
                        定位错误
                      </button>
                      <button class="preview-error-btn ghost" @click="dismissPreviewError">
                        关闭提示
                      </button>
                    </div>
                    
                    <div v-if="previewAiFixMessage" class="preview-ai-fix-status" :class="previewAiFixLevel">
                      {{ previewAiFixMessage }}
                      <button
                        v-if="previewAiFixLevel === 'error'"
                        class="preview-ai-fix-retry"
                        @click="handlePreviewAiFix"
                      >
                        重试
                      </button>
                    </div>
                  </template>
                </div>
                
                <!-- P1: 降级显示Figma截图（预览失败且有截图时） -->
                <div v-else-if="previewFallbackScreenshot" class="preview-fallback-screenshot">
                  <img :src="previewFallbackScreenshot" alt="Figma 设计截图" />
                  <div class="fallback-hint">预览不可用，显示 Figma 设计截图</div>
                </div>
                
                <iframe
                  v-else-if="load && !previewError"
                  ref="previewFrame"
                  :key="previewKey"
                  :src="previewUrl"
                  sandbox="allow-scripts allow-same-origin allow-popups"
                  class="preview-iframe"
                  @load="onPreviewFrameLoad"
                ></iframe>
                <div v-else-if="previewArtifactBlocked" class="preview-artifact-blocked">
                  <strong>预览不可用</strong>
                  <span>生成任务已中断，尚未写出 declare.json 和 package/index.vue。</span>
                </div>

                <!-- 保留底部提示条（兼容旧逻辑） -->
                <PreviewErrorBanner :message="previewErrorBannerMessage" @dismiss="clearPreviewError" />
                
                <!-- 拖拽调整手柄 -->
                <div 
                  class="resize-handle resize-handle-right"
                  @mousedown="startPreviewResize($event, 'right')"
                  title="拖拽调整宽度"
                ></div>
                <div 
                  class="resize-handle resize-handle-bottom"
                  @mousedown="startPreviewResize($event, 'bottom')"
                  title="拖拽调整高度"
                ></div>
                <div 
                  class="resize-handle resize-handle-corner"
                  @mousedown="startPreviewResize($event, 'corner')"
                  title="拖拽调整宽高"
                ></div>
              </div>
            </div>
          </a-tab-pane>
          <!-- 动态文件Tab -->
          <a-tab-pane
            v-for="file in openedFiles"
            :key="file.path"
            :closable="true"
          >
            <template #tab>
              <span class="pg-tab-label" @contextmenu.prevent.stop="onTabContextMenu($event, file)">{{ file.name }}</span>
            </template>
            <!-- 图片文件预览 -->
            <div v-if="file.isImage" class="image-preview">
              <div class="editor-toolbar">
                <span class="file-path">{{ file.path }}</span>
              </div>
              <div class="image-container">
                <img :src="file.imageUrl" :alt="file.name" />
              </div>
            </div>

            <!-- 图片文件预览 -->
            <div v-else-if="isImageFile(file.name)" class="image-preview">
              <div class="editor-toolbar">
                <span class="file-path">{{ file.path }}</span>
              </div>
              <div class="image-container">
                <img
                  :src="file.imageUrl || getRawFileUrl(file.path)"
                  :alt="file.name"
                />
              </div>
            </div>

            <!-- 文本文件编辑器 -->
            <div v-else class="code-editor">
              <div class="editor-toolbar">
                <span class="file-path">{{ file.path }}</span>
                <div class="editor-actions">
                  <button
                    class="editor-btn save-btn"
                    :class="{ disabled: !file.modified || isMainEntryLocked(file) }"
                    :disabled="!file.modified || file.saving || isMainEntryLocked(file)"
                    :title="file.snapshotOnly ? '当前文件来自候选快照，保存后会创建新的候选 revision' : isMainEntryLocked(file) ? '生成进行中，主组件(index.vue)被锁定，避免被生成覆盖' : ''"
                    @click="saveFile(file)"
                  >
                    保存{{ file.modified ? ' *' : '' }}
                  </button>
                  <button
                    class="editor-btn revert-btn"
                    :class="{ disabled: !file.modified }"
                    :disabled="!file.modified"
                    @click="revertFile(file)"
                  >
                    ↶ 撤销修改
                  </button>
                </div>
              </div>
              <MonacoEditor
                :ref="el => setEditorRef(file.path, el)"
                v-model="file.content"
                :language="getFileLanguage(file.name)"
                theme="vs-dark"
                :options="{ lineNumbers: 'on', lineNumbersMinChars: 5 }"
                @update:modelValue="onCodeChange(file)"
              />
            </div>
          </a-tab-pane>
        </a-tabs>
      </div>

      <!-- 侧边分屏编辑器 -->
      <div v-if="splitView" class="editor-pane-side">
        <div class="side-toolbar">
          <span class="side-file-path" :title="sideFile ? sideFile.path : ''">{{ sideFile ? sideFile.name : '' }}</span>
          <button class="side-btn" @click="closeSplit" title="关闭分屏">✕</button>
        </div>
        <MonacoEditor
          v-if="sideFile"
          v-model="sideFile.content"
          :language="getFileLanguage(sideFile.name)"
          theme="vs-dark"
          :options="{ lineNumbers: 'on', lineNumbersMinChars: 5 }"
        />
        <div v-else class="side-empty">未选择文件</div>
      </div>
      </div>
      </div>

      <!-- 水平分隔条（画布/配置 可拖拽调整） -->
      <div
        v-if="isMcComponent"
        class="resizer resizer-horizontal"
        :class="{ dragging: isDragging && dragTarget === 'horizontal' }"
        @mousedown="startDrag($event, 'horizontal')"
      ></div>

      <!-- 下：配置面板（微码组件常驻，可折叠） -->
      <div v-if="isMcComponent" class="config-area" :class="{ 'config-collapsed': configCollapsed }">
        <!-- 折叠/展开切换条 -->
        <div class="config-toggle-bar" @click="configCollapsed = !configCollapsed">
          <span class="config-toggle-label">组件配置</span>
          <span class="config-toggle-icon">{{ configCollapsed ? '▶' : '▼' }}</span>
        </div>
        <!-- 配置内容（折叠时隐藏） -->
        <div v-show="!configCollapsed" class="config-body">
        <a-tabs v-model:activeKey="activeTab" type="card">
          <a-tab-pane v-if="hasStyleConfig" key="settings" tab="样式设置">
            <div class="config-box">
              <a-form :model="formState" layout="vertical" class="style-config-form">
                <a-divider>基础设置</a-divider>
                <a-form-item v-if="layoutConfig.list?.length" label="内容布局">
                  <a-select
                    ref="select"
                    v-model:value="formState.layoutType"
                    @change="(e) => change('layoutType', e)"
                  >
                    <a-select-option
                      v-for="item in layoutConfig.list"
                      :key="item.key"
                      :value="item.key"
                    >
                      {{ item.name }}
                    </a-select-option>
                  </a-select>
                </a-form-item>
                <a-form-item v-if="themeConfig.list?.length" label="内容主题">
                  <a-select
                    ref="select"
                    v-model:value="formState.themeType"
                    @change="(e) => change('themeType', e)"
                  >
                    <a-select-option
                      v-for="item in themeConfig.list"
                      :key="item.key"
                      :value="item.key"
                    >
                      {{ item.name }} {{ item.key }}
                    </a-select-option>
                  </a-select>
                </a-form-item>
                <template v-if="formState.cssVariableConfig?.length">
                  <a-divider>CSS 变量设置</a-divider>
                  <template v-for="(item, index) in formState.cssVariableConfig" :key="item.key">
                  <a-form-item
                    :label="item.name"
                    :name="['cssVariableConfig', index, 'value']"
                    v-if="!item.layoutTypes || item.layoutTypes.includes(formState.layoutType)"
                  >
                    <a-space>
                      <template v-if="item.type === 'size'">
                        <a-input-number
                          v-model:value="item.value"
                          placeholder="数字"
                          style="width: 200px"
                          :min="0"
                        >
                          <template #addonAfter>
                            <a-select v-model:value="item.unit" width="40">
                              <a-select-option value="px">px</a-select-option>
                              <a-select-option value="em">em</a-select-option>
                              <a-select-option value="rem">rem</a-select-option>
                              <a-select-option value="vh">vh</a-select-option>
                            </a-select>
                          </template>
                        </a-input-number>
                      </template>
                      <template v-else-if="item.type === 'weight'">
                        <a-select v-model:value="item.value" style="width: 200px">
                          <a-select-option value="normal">normal 默认</a-select-option>
                          <a-select-option value="bold">bold 粗体</a-select-option>
                          <a-select-option value="bolder">bolder 更粗的</a-select-option>
                          <a-select-option value="lighter">lighter 更细的</a-select-option>
                        </a-select>
                      </template>
                      <template v-else-if="item.type === 'color'">
                        <!-- <ColorPicker v-model:pureColor="item.value" style="width: 200px">
                        <template #extra>
                          <a-button
                            style="width: 100%"
                            @click="
                              () => {
                                item.value = undefined
                              }
                            "
                          >
                            close
                          </a-button>
                        </template>
                      </ColorPicker> -->
                        <McColorPicker
                          v-model:pureColor="item.value"
                          v-model:gradientColor="item.value"
                        ></McColorPicker>
                      </template>
                      <template v-else-if="item.type === 'select'">
                        <a-select v-model:value="item.value" style="width: 200px">
                          <a-select-option :value="opt.key" v-for="opt in item.list" :key="opt">
                            {{ opt.name }}
                          </a-select-option>
                        </a-select>
                      </template>
                      <template v-else-if="item.type === 'string'">
                        <a-input v-model:value="item.value" style="width: 200px"></a-input>
                      </template>
                      <a-tag color="var(--brand)">{{ item.key }}</a-tag>
                    </a-space>
                  </a-form-item>
                </template>
              </template>
              </a-form>
            </div>
          </a-tab-pane>

          <a-tab-pane key="json-editor" tab="声明文件设置">
            <declare-editor :componentId="componentId" />
          </a-tab-pane>
        </a-tabs>
      </div>
    </div>
    </div>

    <!-- 右侧分隔条 -->
    <div
      class="resizer resizer-right"
      :class="{ dragging: isDragging && dragTarget === 'right' }"
      @mousedown="startDrag($event, 'right')"
    ></div>

    <!-- 右侧：AI助手 -->
    <div class="ai-sidebar">
      <div class="ai-output-area">
        <div class="ai-header">AI 助手输出</div>
        <div class="ai-messages" ref="aiMessagesRef">
          <div v-for="msg in aiMessages" :key="msg.id" class="ai-message" :class="msg.role">
            <div class="message-content" v-html="renderMessageContent(msg.content)"></div>
          </div>
          <div v-if="aiLoading" class="ai-message assistant">
            <a-spin size="small" />
            思考中...
          </div>
        </div>
      </div>

      <div class="ai-input-area">
        <!-- 版本控制工具栏 -->
        <div class="version-toolbar">
          <a-button size="small" :loading="undoLoading" :disabled="modificationCount === 0" @click="undoLastModification">
            ← 后退
          </a-button>
          <a-button size="small" :loading="restoreLoading" :disabled="modificationCount === 0" @click="restoreToInitial">
            ⟲ 恢复初始
          </a-button>
          <a-popconfirm
            title="确定清空当前对话？"
            ok-text="确定"
            cancel-text="取消"
            @confirm="clearChatHistory"
          >
            <a-button size="small" v-if="aiMessages.length > 0">清空对话</a-button>
          </a-popconfirm>
          <span v-if="modificationCount > 0" class="mod-count">{{ modificationCount }} 步修改</span>
        </div>

        <div class="ai-mode-switches">
          <a-space :size="4">
            <a-switch v-model:checked="memoryEnabled" size="small" />
            <span class="switch-label">记忆功能</span>
          </a-space>
        </div>

        <!-- 文件选择器 -->
        <div class="file-selector-section">
          <div class="file-selector-header" @click="showFileSelector = !showFileSelector">
            <span>选择文件 ({{ selectedFiles.length }})</span>
            <span class="toggle-icon">{{ showFileSelector ? '▼' : '▶' }}</span>
          </div>
          <div v-show="showFileSelector" class="file-selector-list">
            <div class="file-selector-actions">
              <a-button size="small" type="link" @click="selectedFiles = componentFiles.map(f => f.path)">全选</a-button>
              <a-button size="small" type="link" @click="selectedFiles = []">取消</a-button>
            </div>
            <a-checkbox-group v-model:value="selectedFiles" style="width: 100%">
              <div v-for="file in componentFiles" :key="file.path" class="file-selector-item">
                <a-checkbox :value="file.path">
                  <span class="file-icon">{{ getFileIcon(file.name) }}</span>
                  <span class="file-name">{{ file.name }}</span>
                </a-checkbox>
              </div>
            </a-checkbox-group>
          </div>
        </div>

        <div v-if="chatAttachments.length > 0" class="chat-attachments">
          <div v-for="attachment in chatAttachments" :key="attachment.id" class="chat-attachment">
            <img :src="attachment.dataUrl" :alt="attachment.name" />
            <div class="attachment-meta">
              <span class="attachment-name">{{ attachment.name }}</span>
              <span class="attachment-size">{{ formatFileSize(attachment.size) }}</span>
            </div>
            <button
              class="attachment-remove icon-tooltip"
              type="button"
              data-tooltip="移除截图"
              aria-label="移除截图"
              @click="removeChatAttachment(attachment.id)"
            >
              ×
            </button>
          </div>
        </div>
        <a-textarea
          v-model:value="aiInput"
          placeholder="输入您的问题或修改要求，支持直接粘贴截图... (Ctrl+Enter发送)"
          :rows="3"
          @paste="handleChatPaste"
          @keydown.enter.ctrl="sendAIMessage"
        />
        <a-button
          v-if="aiLoading"
          danger
          block
          @click="stopAIMessage"
        >
          停止
        </a-button>
        <a-button
          v-else
          type="primary"
          block
          :disabled="!aiInput.trim() && chatAttachments.length === 0"
          @click="sendAIMessage"
        >
          发送
        </a-button>
      </div>
    </div>

    <!-- GitLab推送对话框（公共组件） -->
    <GitLabPushModal
      ref="gitLabPushModalRef"
      :component-id="String(componentId)"
      :is-running="!!taskId && taskStatus === 'running'"
      @success="handleGitLabPushSuccess"
    />

    <!-- 右键上下文菜单（vs code 风格） -->
    <div
      v-if="contextMenu.visible"
      class="pg-context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      @contextmenu.prevent
    >
      <div
        v-for="(item, i) in contextMenu.items"
        :key="i"
        :class="['pg-menu-item', { 'is-divider': item.divider, 'is-disabled': item.disabled, 'is-danger': item.danger }]"
        @click="!item.divider && runContextItem(item)"
      >
        <template v-if="!item.divider">
          <span class="pg-menu-label">{{ item.label }}</span>
          <span v-if="item.danger" class="pg-menu-danger-mark">⚠</span>
        </template>
      </div>
    </div>

    <!-- 提示输入弹窗（新建文件 / 新建文件夹 / 重命名） -->
    <a-modal
      v-model:visible="promptModal.visible"
      :title="promptModal.title"
      :confirm-loading="promptModal.loading"
      ok-text="确定"
      cancel-text="取消"
      @ok="confirmPrompt"
      @cancel="promptModal.visible = false"
    >
      <a-input
        v-model:value="promptModal.value"
        :placeholder="promptModal.placeholder"
        autofocus
        @pressEnter="confirmPrompt"
      />
    </a-modal>

    <!-- 设置 / 快捷键面板 -->
    <a-modal
      v-model:visible="settingsVisible"
      title="设置 / 快捷键"
      :footer="null"
      width="420"
      @cancel="closeSettings"
    >
      <div class="pg-settings">
        <div class="pg-settings-section">
          <div class="pg-settings-row">
            <span class="pg-settings-label">保存时自动格式化</span>
            <a-switch :checked="formatOnSave" @change="setFormatOnSave" />
          </div>
          <div class="pg-settings-hint">保存文件前自动按 Prettier 规则格式化（JSON / Vue 同样生效）。</div>
        </div>
        <div class="pg-settings-section">
          <div class="pg-settings-title">快捷键速查</div>
          <div v-for="s in SHORTCUT_LIST" :key="s.keys" class="pg-shortcut-row">
            <kbd class="pg-kbd">{{ s.keys }}</kbd>
            <span class="pg-shortcut-desc">{{ s.desc }}</span>
          </div>
        </div>
      </div>
    </a-modal>

  </div>
</template>

<script setup>
import { McColorPicker } from '@microcode/designer'
import { ColorPicker } from 'vue3-colorpicker'
import { componentStore } from '@microcode/microcode-framework'
import DeclareEditor from '@/components/base-components/declare-editor/index.vue'
import MonacoEditor from '@/components/MonacoEditor.vue'
import FileDiffViewer from '@/components/FileDiffViewer.vue'
import { preloadMonaco } from '@/utils/monaco-loader'
import { message, Modal } from 'ant-design-vue'
import 'vue3-colorpicker/style.css'

import { getThemeConfig, getCssVarsConfig } from '@/core/microcode/utils'
import { useConfigStore } from '@/stores/config'
import { useFeatureFlag } from '@/composables/useFeatureFlag'
import { useDragResize } from './composables/useDragResize.js'
import { useSnapshots } from './composables/useSnapshots.js'
import PreviewErrorBanner from '@/components/PreviewErrorBanner.vue'
import McSpecCheckButton from '@/components/McSpecCheckButton.vue'
import GitLabPushModal from '@/components/GitLabPushModal.vue'
import { usePreviewErrorBridge } from '@/composables/usePreviewErrorBridge'

// 格式化文档：prettier/standalone（纯前端，无需后端）
import * as prettier from 'prettier/standalone'
import babelPlugin from 'prettier/plugins/babel'
import typescriptPlugin from 'prettier/plugins/typescript'
import estreePlugin from 'prettier/plugins/estree'
import postcssPlugin from 'prettier/plugins/postcss'
import htmlPlugin from 'prettier/plugins/html'
import markdownPlugin from 'prettier/plugins/markdown'
import yamlPlugin from 'prettier/plugins/yaml'
import {
  fetchTaskStatus,
  fetchLatestTaskCodeSnapshot,
  fetchTaskCodeSnapshotFile,
  fetchTaskCodeSnapshotFileBlob,
  editTaskCodeSnapshotFile,
} from '@/api/generator/generator'
import { buildPreviewUrl as buildResolvedPreviewUrl, resolvePreviewDescriptor } from '@/utils/preview-resolver'
import http from '@/core/http'

const route = useRoute()
const router = useRouter()
const { isEnabled } = useFeatureFlag()
const { pxtorem, defaultCssVars } = $config

// 🎯 进入 Playground 立刻后台预热 Monaco，与 iframe/file load 并行。
//    用户从「点 Playground → 代码出现」≈ 首个文件解析耗时，
//    不再叠加 3MB 编辑器的下载耗时（典型 5–15s → 0–2s）。
preloadMonaco()

// 组件 ID（必须在 useSnapshots 等依赖它之前声明）
const componentId = ref(route.params.componentId || 'mc-demo')
// 任务号（从 URL query 读取，可能为空）
const taskId = computed(() => route.query.taskId || '')
// 组件类型权威来源优先由路由 query 显式传入；前缀只作为历史链接兜底。
const explicitComponentType = computed(() => {
  const type = route.query.type
  return type === 'vue3' || type === 'microcode' || type === 'page' ? type : ''
})

// ── Playground 文件 API 抽象 ──
// 组件模式走 /api/component，页面(page)模式走 /api/page-skeleton/:groupId/:id。
// 两端接口契约一致（列表 / 读 / 写 / 建目录 / 重命名 / 删除），仅 URL 前缀不同，
// vue3 / 微码 既有逻辑零改动。
const isPageMode = computed(() => explicitComponentType.value === 'page')
function playgroundGroupId() {
  const g = route.query.groupId
  return typeof g === 'string' && g ? g : 'default-group'
}
function fileApiBase() {
  return isPageMode.value
    ? `/api/page-skeleton/${playgroundGroupId()}/${componentId.value}`
    : `/api/component/${componentId.value}`
}
// 保存文件：组件模式 path 走 query；页面模式 path 走 body（与后端契约对齐）
async function saveFileRemote(filePath, content) {
  if (isPageMode.value) {
    return http.post(`${fileApiBase()}/file`, { path: filePath, content: content ?? '' })
  }
  return http.post(`${fileApiBase()}/file?path=${encodeURIComponent(filePath)}`, { content: content ?? '' })
}

// 预览 iframe 内组件加载失败/自动修复成功的非阻塞通知（来自 postMessage）
const { previewError, previewDiagnostic, clearPreviewError } = usePreviewErrorBridge({
  onFixed: handlePreviewFixed,
})

// P0: 错误卡片状态管理
const previewErrorDismissed = ref(false)
const previewErrorBannerMessage = computed(() => {
  // 错误卡片显示时，底部提示条不再显示
  return previewErrorDismissed.value ? '' : previewError.value
})

// P1: AI修复状态
const previewAiFixing = ref(false)
const previewAiFixSeconds = ref(0)
const previewAiFixCancelling = ref(false)
const previewAiFixMessage = ref('')
const previewAiFixLevel = ref<'info' | 'success' | 'error'>('info')
let previewAiFixTimer = null

// P1: Figma截图降级显示
const previewFallbackScreenshot = computed(() => {
  if (!previewError.value || previewErrorDismissed.value) return ''
  // 从任务快照或组件元数据中获取Figma截图URL
  const taskId = route.query.taskId
  if (!taskId) return ''
  // 尝试从快照中获取截图
  if (taskSnapshot.value?.figmaScreenshot) {
    return taskSnapshot.value.figmaScreenshot
  }
  // 兜底：构造默认截图URL（假设后端有mc-preview.png）
  return `/api/component/${componentId.value}/preview-image`
})

// P2: 智能诊断建议
const previewSmartSuggestion = computed(() => {
  if (!previewDiagnostic.value) return ''
  const msg = previewDiagnostic.value.message || ''
  // 基于错误类型给出建议
  if (msg.includes('import') || msg.includes('module')) {
    return '可能是导入路径错误或资源未正确注入，尝试检查 import 语句'
  }
  if (msg.includes('undefined') || msg.includes('null')) {
    return '可能是变量未定义或为空，检查组件 props 和数据源'
  }
  if (msg.includes('style') || msg.includes('less')) {
    return '样式编译错误，检查 LESS 变量或 mixin 是否正确引入'
  }
  if (msg.includes('component') || msg.includes('register')) {
    return '组件注册失败，检查子组件是否正确导入和注册'
  }
  return ''
})

// P1: AI一键修复
async function handlePreviewAiFix() {
  if (previewAiFixing.value) return
  previewAiFixing.value = true
  previewAiFixSeconds.value = 0
  previewAiFixMessage.value = '正在启动AI修复...'
  previewAiFixLevel.value = 'info'
  
  // 启动计时器
  previewAiFixTimer = setInterval(() => {
    previewAiFixSeconds.value++
  }, 1000)
  
  try {
    const response = await http.post(`/api/component/${componentId.value}/ai-fix-render-error`, {
      errorMessage: previewError.value,
      diagnostic: previewDiagnostic.value,
    })
    
    if (response.success) {
      previewAiFixMessage.value = 'AI修复成功，正在重新加载预览...'
      previewAiFixLevel.value = 'success'
      // 重新加载预览
      await nextTick()
      reloadPreview()
      // 2秒后清除提示
      setTimeout(() => {
        previewAiFixing.value = false
        previewAiFixMessage.value = ''
        previewErrorDismissed.value = false
      }, 2000)
    } else {
      throw new Error(response.message || 'AI修复失败')
    }
  } catch (error) {
    previewAiFixMessage.value = `AI修复失败: ${error.message || '未知错误'}`
    previewAiFixLevel.value = 'error'
    previewAiFixing.value = false
  } finally {
    if (previewAiFixTimer) {
      clearInterval(previewAiFixTimer)
      previewAiFixTimer = null
    }
  }
}

// P1: 取消AI修复
async function cancelPreviewAiFix() {
  if (!previewAiFixing.value) return
  previewAiFixCancelling.value = true
  try {
    await http.post(`/api/component/${componentId.value}/ai-fix-cancel`)
    previewAiFixing.value = false
    previewAiFixMessage.value = '已取消AI修复'
    previewAiFixLevel.value = 'info'
  } catch (error) {
    console.error('取消AI修复失败:', error)
  } finally {
    previewAiFixCancelling.value = false
    if (previewAiFixTimer) {
      clearInterval(previewAiFixTimer)
      previewAiFixTimer = null
    }
  }
}

// P0: 关闭错误提示
function dismissPreviewError() {
  previewErrorDismissed.value = true
  clearPreviewError()
}

// P0: 重新加载预览
function reloadPreview() {
  previewErrorDismissed.value = false
  clearPreviewError()
  // 强制刷新iframe
  if (previewFrame.value) {
    previewFrame.value.src = previewUrl.value
  }
}

// P2: 定位错误文件
async function revealDiagnosticFile() {
  if (!previewDiagnostic.value?.file) return
  const filePath = previewDiagnostic.value.file
  // 打开文件并定位到错误行
  await openFile({ path: filePath, name: filePath.split('/').pop() })
  await nextTick()
  const editor = editorRefs.get(filePath)
  if (editor && previewDiagnostic.value.line) {
    editor.revealLineInCenter(previewDiagnostic.value.line)
    editor.setDiagnosticMarker?.(previewDiagnostic.value)
  }
}

// 失败/取消任务仍允许进入 Playground 查看代码，但必须明确提示代码未经质量门禁放行。
const taskStatus = ref('')
const taskArtifactReady = ref(true)
const taskArtifactReadyLevel = ref<'' | 'full' | 'partial' | false>('')
const taskSnapshot = ref(null)
const warningDismissed = ref(false)
const previewArtifactBlocked = computed(() =>
  !!route.query.taskId && !taskArtifactReady.value && !taskSnapshot.value
)
const isTaskFailed = computed(() =>
  !warningDismissed.value && ['failed', 'cancelled'].includes(taskStatus.value)
)
// 🛡️ A 方案：生成进行中 + 渐进式草稿（主组件未完）→ 展示草稿模式提示
const isTaskRunningPartial = computed(() => taskStatus.value === 'running' && taskArtifactReadyLevel.value === 'partial')

async function loadTaskStatus() {
  warningDismissed.value = false
  if (!route.query.taskId) {
    taskArtifactReady.value = true
    load.value = true
    return true
  }

  const localTaskId = typeof route.query.taskId === 'string' ? route.query.taskId : componentId.value
  try {
    const response = await fetchTaskStatus(localTaskId)
    const task = response?.data?.task || response?.task
    taskStatus.value = response?.success !== false ? task?.status || '' : ''
    taskArtifactReady.value = response?.success !== false && task?.artifactReady === true
    taskArtifactReadyLevel.value = response?.success !== false ? (task?.artifactReadyLevel ?? '') : ''

    // 任务状态可能是 failed/blocked，但 candidate 或 partial 快照仍可预览和人工编辑。
    // 先拉快照，再决定是否阻断，避免“后端已保留产物、前端却显示不可用”。
    if (response?.success !== false) {
      try {
        const snapshotResponse = await fetchLatestTaskCodeSnapshot(localTaskId)
        taskSnapshot.value = snapshotResponse?.candidate
          || snapshotResponse?.partial
          || snapshotResponse?.lastGood
          || null
      } catch {
        taskSnapshot.value = null
      }
    }
    load.value = taskArtifactReady.value || !!taskSnapshot.value
    const taskDiagnostic = task?.result?.lessCompileGate?.diagnostics?.[0]
    if (taskDiagnostic && !previewDiagnostic.value) {
      previewDiagnostic.value = taskDiagnostic
    }
    return load.value
  } catch {
    taskStatus.value = typeof route.query.taskStatus === 'string' ? route.query.taskStatus : ''
    taskArtifactReady.value = false
    taskSnapshot.value = null
    try {
      const snapshotResponse = await fetchLatestTaskCodeSnapshot(localTaskId)
      taskSnapshot.value = snapshotResponse?.candidate
        || snapshotResponse?.partial
        || snapshotResponse?.lastGood
        || null
    } catch {
      taskSnapshot.value = null
    }
    load.value = !!taskSnapshot.value
    return load.value
  }
}

function dismissWarning() {
  warningDismissed.value = true
}

const activeTab = ref('settings')
const activeCanvasTab = ref('preview')
const activeFile = ref(null)
const configCollapsed = ref(false) // 配置面板折叠状态（微码组件常驻可折叠）

// 文件管理（空数组，由 loadComponentFiles() 从后端加载）
const componentFiles = ref([])
const openedFiles = ref([])
const editorRefs = new Map()

function setEditorRef(filePath, instance) {
  if (instance) editorRefs.set(filePath, instance)
  else editorRefs.delete(filePath)
}

async function revealDiagnostic(filePath, diagnostic) {
  await nextTick()
  const editor = editorRefs.get(filePath)
  if (!editor || !diagnostic) return
  editor.setDiagnosticMarker?.(diagnostic)
}
const expandedFileKeys = ref([])

// ── VS Code 风格文件/代码搜索 ──
const codeSearchInputRef = ref(null)
const codeSearchQuery = ref('')
const codeReplaceQuery = ref('')
const codeSearchResults = ref([])
const codeSearchLoading = ref(false)
const activeSearchResultIndex = ref(-1)

// 搜索选项
const searchCaseSensitive = ref(false)   // Aa 大小写敏感
const searchWholeWord = ref(false)       // 全词匹配
const searchUseRegex = ref(false)        // 正则表达式
const showReplaceRow = ref(false)        // 显示替换行

// 按文件分组后的结果（computed）
const groupedSearchResults = computed(() => {
  const map = {}
  for (const r of codeSearchResults.value) {
    if (!map[r.path]) {
      // 提取短路径（去掉前面公共前缀）
      const parts = r.path.split('/')
      const shortPath = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
      map[r.path] = {
        path: r.path,
        name: r.name,
        shortPath,
        matches: [],
        collapsed: false,
      }
    }
    map[r.path].matches.push(r)
  }
  return Object.values(map)
})

function toggleRegex() {
  searchUseRegex.value = !searchUseRegex.value
  executeCodeSearch(true)
}

// 构建搜索正则（根据选项）
function buildSearchRegex(query) {
  if (!query) return null
  let pattern = query
  if (!searchUseRegex.value) {
    // 转义正则特殊字符
    pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  if (searchWholeWord.value) {
    pattern = `\\b${pattern}\\b`
  }
  try {
    return new RegExp(pattern, searchCaseSensitive.value ? 'g' : 'gi')
  } catch (e) {
    // 正则语法错误时回退到字符串搜索
    console.warn('[搜索] 正则无效:', e.message)
    return null
  }
}

// 防抖触发搜索
let searchDebounceTimer = null
function onSearchInput() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    executeCodeSearch()
  }, 300)
}

function clearSearch() {
  codeSearchQuery.value = ''
  codeReplaceQuery.value = ''
  codeSearchResults.value = []
  codeSearchScope.value = null
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
}

// 全局代码搜索（跨所有文件内容，支持 Aa/全词/正则）
async function executeCodeSearch(force = false) {
  const q = codeSearchQuery.value.trim()
  if (!q) {
    codeSearchResults.value = []
    return
  }

  codeSearchLoading.value = true
  activeSearchResultIndex.value = -1

  const regex = buildSearchRegex(q)

  // 全局搜索：遍历组件所有文件
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico']
  let textFiles = componentFiles.value.filter(
    (f) => !imageExtensions.some((ext) => f.name.toLowerCase().endsWith(ext))
  )
  // 搜索范围（在文件夹 / 文件中查找）
  if (codeSearchScope.value) {
    const scope = codeSearchScope.value
    textFiles = textFiles.filter((f) =>
      scope.isFolder ? f.path.startsWith(scope.path + '/') : f.path === scope.path,
    )
  }

  // 分批并发加载内容
  const contentMap = {}
  const CONCURRENCY = 6
  for (let i = 0; i < textFiles.length; i += CONCURRENCY) {
    const batch = textFiles.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.all(
      batch.map(async (file) => {
        const opened = openedFiles.value.find((f) => f.path === file.path)
        if (opened && opened.content) {
          return { path: file.path, name: file.name, content: opened.content }
        }
        const cached = fileContentCache[file.path]
        if (cached && cached.content) {
          return { path: file.path, name: file.name, content: cached.content }
        }
        try {
          const data = await http.get(`${fileApiBase()}/file`, {
            path: file.path,
          })
          if (data.success && data.content) {
            if (!fileContentCache[file.path]) {
              fileContentCache[file.path] = {
                content: data.content,
                originalContent: data.content,
                isImage: false,
                imageUrl: null,
              }
            }
            return { path: file.path, name: file.name, content: data.content }
          }
        } catch (err) {
          console.warn('[搜索] 加载文件失败:', file.path, err)
        }
        return null
      })
    )
    for (const r of batchResults) {
      if (r) contentMap[r.path] = r
    }
  }

  // 逐行/逐匹配搜索
  const results = []
  for (const src of Object.values(contentMap)) {
    const lines = src.content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (regex) {
        // 正则模式：找出所有匹配位置
        let match
        regex.lastIndex = 0 // 重置全局正则
        while ((match = regex.exec(line)) !== null) {
          results.push({
            path: src.path,
            name: src.name,
            line: i + 1,
            column: match.index + 1,
            text: line.trim(),
            preview: line.trim().substring(0, 100),
            matchedText: match[0],
          })
          // 零宽匹配防止死循环
          if (match[0].length === 0) regex.lastIndex++
        }
      } else {
        // 正则构建失败时的回退：简单大小写敏感/不敏感 indexOf
        const searchStr = searchCaseSensitive.value ? q : q.toLowerCase()
        const targetLine = searchCaseSensitive.value ? line : line.toLowerCase()
        let idx = targetLine.indexOf(searchStr)
        while (idx !== -1) {
          if (searchWholeWord.value) {
            // 手动检查词边界
            const before = idx > 0 ? targetLine[idx - 1] : ' '
            const after = idx + searchStr.length < targetLine.length ? targetLine[idx + searchStr.length] : ' '
            if (/\w/.test(before) || /\w/.test(after)) {
              idx = targetLine.indexOf(searchStr, idx + 1)
              continue
            }
          }
          results.push({
            path: src.path,
            name: src.name,
            line: i + 1,
            column: idx + 1,
            text: line.trim(),
            preview: line.trim().substring(0, 100),
            matchedText: q,
          })
          idx = targetLine.indexOf(searchStr, idx + 1)
        }
      }
    }
  }

  codeSearchResults.value = results
  codeSearchLoading.value = false
}

// 文件图标辅助函数
function getFileExtIcon(name) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['vue', 'html'].includes(ext)) return 'V'
  if (['js', 'ts', 'jsx', 'tsx'].includes(ext)) return 'JS'
  if (['css', 'less', 'scss'].includes(ext)) return '#'
  if (['json'].includes(ext)) return '{'
  if (['md'].includes(ext)) return 'M'
  return '·'
}
function getFileExtClass(name) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return `ext-${ext}` || ''
}

// 在编辑器中打开文件（不定位行号，用于「在编辑器中打开」链接）
async function openFileInEditor(group) {
  const file = componentFiles.value.find(f => f.path === group.path)
  if (file) openFile(file)
}

// 从结果中移除某文件（忽略）
function removeFileFromResults(gIdx) {
  const group = groupedSearchResults.value[gIdx]
  if (!group) return
  codeSearchResults.value = codeSearchResults.value.filter(r => r.path !== group.path)
}

// 替换功能
async function replaceInFile(group) {
  const replacement = codeReplaceQuery.value.trim()
  if (!replacement || !group.matches.length) return

  // 打开目标文件
  const file = componentFiles.value.find(f => f.path === group.path)
  if (!file) return
  openFile(file)
  await nextTick()

  // 在编辑器中执行替换
  const opened = openedFiles.value.find(f => f.path === group.path)
  if (!opened?.content) return

  const regex = buildSearchRegex(codeSearchQuery.value.trim())
  let newContent
  if (regex) {
    regex.lastIndex = 0
    newContent = opened.content.replace(regex, replacement)
  } else {
    const q = codeSearchQuery.value.trim()
    newContent = searchCaseSensitive.value
      ? opened.content.split(q).join(replacement)
      : opened.content.split(new RegExp(q, 'gi')).join(replacement)
  }

  // 更新内容
  opened.content = newContent
  opened.modified = true
  if (fileContentCache[group.path]) {
    fileContentCache[group.path].content = newContent
  }

  // 刷新 Monaco
  const editorRef = editorRefs.get(group.path)
  if (editorRef?.editor) {
    editorRef.editor.setValue(newContent)
  }

  // 移除该文件的搜索结果，重新搜索
  removeFileFromResults(groupedSearchResults.value.indexOf(group))
  if (codeSearchQuery.value.trim()) {
    executeCodeSearch(true)
  }
}

async function replaceAll() {
  const replacement = codeReplaceQuery.value.trim()
  if (!replacement || !codeSearchResults.value.length) return

  // 按文件逐一替换
  const groups = [...groupedSearchResults.value]
  for (const group of groups) {
    await replaceInFile(group)
  }
}

// 点击搜索结果 → 打开文件并定位行号
async function goToSearchResult(result) {
  // 找到或打开目标文件
  const file = componentFiles.value.find(f => f.path === result.path)
  if (file) {
    openFile(file)
    // 等待 Monaco 渲染后跳转到目标行
    await nextTick()
    const editor = editorRefs.get(result.path)
    if (editor && editor.editor) {
      editor.editor.revealLineInCenter(result.line)
      editor.editor.setPosition({ lineNumber: result.line, column: result.column })
      editor.editor.focus()
    }
  }
  activeSearchResultIndex.value = codeSearchResults.value.indexOf(result)
}

function getFolderKeys(files) {
  const keys = new Set()
  for (const file of files || []) {
    const parts = file.path.split('/')
    for (let index = 1; index < parts.length; index += 1) {
      keys.add(parts.slice(0, index).join('/'))
    }
  }
  return Array.from(keys)
}

function onTreeExpand(keys) {
  expandedFileKeys.value = keys
}

// 🆕 文件图标 → 着色 class 映射
function iconClass(icon) {
  if (icon === '▣') return 'icon-dir'
  if (icon === '◆') return 'icon-declare'
  if (icon === '⌘') return 'icon-vue'
  if (icon === '⌗') return 'icon-less'
  if (icon === '◇') return 'icon-json'
  if (icon === '◐') return 'icon-image'
  if (icon === '⌬') return 'icon-js'
  return ''
}

// 搜索结果关键词高亮（使用实际匹配文本）
function highlightMatch(text, query) {
  if (!query || !text) return text
  const regex = buildSearchRegex(query)
  if (regex) {
    // 用临时正则做替换（避免污染全局状态）
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(${escaped})`, searchCaseSensitive.value ? 'g' : 'gi')
    return text.replace(re, '<mark class="search-highlight">$1</mark>')
  }
  // 回退：简单文本替换
  const q = searchCaseSensitive.value ? query : query.toLowerCase()
  const target = searchCaseSensitive.value ? text : text.toLowerCase()
  const idx = target.indexOf(q)
  if (idx === -1) return text
  const before = text.substring(0, idx)
  const match = text.substring(idx, idx + query.length)
  const after = text.substring(idx + query.length)
  return `${before}<mark class="search-highlight">${match}</mark>${after}`
}

// 聚焦搜索框
function focusSearchBox() {
  codeSearchInputRef.value?.focus()
}

// 快捷键：Ctrl+Shift+F 聚焦代码搜索框
onMounted(() => {
  const handler = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
      e.preventDefault()
      focusSearchBox()
    }
  }
  window.addEventListener('keydown', handler)
  onUnmounted(() => window.removeEventListener('keydown', handler))
})

// ===== Playground IDE 体验增强：右键上下文菜单 + 文件操作 =====

// 右键菜单状态
const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  items: [],
})

// 提示输入弹窗（新建文件 / 新建文件夹 / 重命名）
const promptModal = reactive({
  visible: false,
  title: '',
  value: '',
  placeholder: '',
  loading: false,
  onConfirm: null,
})

// 搜索范围（在文件夹 / 文件中查找）
const codeSearchScope = ref(null)

// 打开右键菜单（带视口边界保护）
function openContextMenu(e, items) {
  e.preventDefault()
  e.stopPropagation()
  const menuW = 190
  const menuH = items.filter(Boolean).length * 30 + 8
  let x = e.clientX
  let y = e.clientY
  if (x + menuW > window.innerWidth) x = window.innerWidth - menuW
  if (y + menuH > window.innerHeight) y = window.innerHeight - menuH
  contextMenu.x = x
  contextMenu.y = y
  contextMenu.items = items
  contextMenu.visible = true
}

function closeContextMenu() {
  contextMenu.visible = false
}

function runContextItem(item) {
  if (!item || item.disabled || item.divider) return
  closeContextMenu()
  if (typeof item.action === 'function') item.action()
}

// 全局关闭监听（点击菜单外部 / 滚动时关闭）
function onGlobalMouseDown(e) {
  if (contextMenu.visible && !e.target.closest('.pg-context-menu')) {
    closeContextMenu()
  }
}
onMounted(() => {
  window.addEventListener('mousedown', onGlobalMouseDown)
  window.addEventListener('scroll', closeContextMenu, true)
})
onUnmounted(() => {
  window.removeEventListener('mousedown', onGlobalMouseDown)
  window.removeEventListener('scroll', closeContextMenu, true)
})

// 复制文本到剪贴板（兼容非安全上下文）
async function copyText(text, successMsg = '已复制路径') {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    message.success(successMsg)
  } catch (err) {
    message.error('复制失败')
  }
}

// 父目录
function parentDir(path) {
  const parts = path.split('/')
  parts.pop()
  return parts.join('/')
}

// 打开提示输入弹窗
function openPrompt({ title, value = '', placeholder = '', onConfirm }) {
  promptModal.title = title
  promptModal.value = value
  promptModal.placeholder = placeholder
  promptModal.loading = false
  promptModal.onConfirm = onConfirm
  promptModal.visible = true
}

async function confirmPrompt() {
  const cb = promptModal.onConfirm
  if (typeof cb !== 'function') {
    promptModal.visible = false
    return
  }
  promptModal.loading = true
  try {
    await cb(promptModal.value.trim())
  } catch (err) {
    message.error(err?.message || '操作失败')
  } finally {
    promptModal.loading = false
    promptModal.visible = false
  }
}

// 关闭匹配的已打开 Tab（删除文件/文件夹时清理）
function closeOpenedByPath(path, isFolder) {
  const toRemove = openedFiles.value.filter(
    (f) => f.path === path || (isFolder && f.path.startsWith(path + '/')),
  )
  toRemove.forEach((f) => {
    const i = openedFiles.value.findIndex((x) => x.path === f.path)
    if (i >= 0) openedFiles.value.splice(i, 1)
  })
  if (toRemove.some((f) => f.path === activeCanvasTab.value)) {
    activeCanvasTab.value = 'preview'
  }
}

// 新建文件
function createNewFile(parentPath) {
  openPrompt({
    title: '新建文件',
    placeholder: '文件名，如 utils.js',
    onConfirm: async (name) => {
      if (!name) return
      const full = parentPath ? `${parentPath}/${name}` : name
      await saveFileRemote(full, '')
      await loadComponentFiles()
      message.success(`已创建 ${full}`)
      const f = componentFiles.value.find((x) => x.path === full)
      if (f) openFile(f)
    },
  })
}

// 新建文件夹
function createNewFolder(parentPath) {
  openPrompt({
    title: '新建文件夹',
    placeholder: '文件夹名',
    onConfirm: async (name) => {
      if (!name) return
      const full = parentPath ? `${parentPath}/${name}` : name
      await http.post(`${fileApiBase()}/folder`, { path: full })
      await loadComponentFiles()
      message.success(`已创建文件夹 ${full}`)
    },
  })
}

// 重命名
function renamePath(oldPath, isFolder) {
  const base = parentDir(oldPath)
  const oldName = oldPath.split('/').pop()
  openPrompt({
    title: isFolder ? '重命名文件夹' : '重命名文件',
    value: oldName,
    placeholder: '新名称',
    onConfirm: async (newName) => {
      if (!newName || newName === oldName) return
      const newPath = base ? `${base}/${newName}` : newName
      // 保留已打开文件的编辑态，重命名后在新路径重新打开
      const openedIdx = openedFiles.value.findIndex((f) => f.path === oldPath)
      const openedSnap = openedIdx >= 0 ? openedFiles.value[openedIdx] : null
      if (openedSnap) {
        openedFiles.value.splice(openedIdx, 1)
        if (activeCanvasTab.value === oldPath) activeCanvasTab.value = 'preview'
      }
      await http.post(`${fileApiBase()}/rename`, { oldPath, newPath })
      await loadComponentFiles()
      if (openedSnap) {
        const f = componentFiles.value.find((x) => x.path === newPath)
        if (f) openFile(f)
      }
      message.success('已重命名')
    },
  })
}

// 删除
async function deletePath(targetPath, isFolder) {
  const ok = await new Promise((resolve) => {
    Modal.confirm({
      title: `确认删除${isFolder ? '文件夹' : '文件'}？`,
      content: targetPath,
      okText: '删除',
      okType: 'danger',
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    })
  })
  if (!ok) return
  try {
    await http.post(
      `${fileApiBase()}/file/delete?path=${encodeURIComponent(targetPath)}`,
    )
    closeOpenedByPath(targetPath, isFolder)
    await loadComponentFiles()
    message.success('已删除')
  } catch (err) {
    message.error(err?.message || '删除失败')
  }
}

// 设置搜索范围（在文件夹 / 文件中查找）
function setSearchScope(path, isFolder) {
  codeSearchScope.value = { path, isFolder }
  focusSearchBox()
}
function clearSearchScope() {
  codeSearchScope.value = null
}

// ── 文件操作增强：复制内容 / 剪切粘贴 / 比较 / 引用 / 信息 / 分屏 ──

// 取文件内容：优先已打开 / 缓存，否则按需 HTTP 加载
async function fetchFileContent(path) {
  const opened = openedFiles.value.find((f) => f.path === path)
  if (opened && opened.content != null) return opened.content
  if (fileContentCache[path] && fileContentCache[path].content != null) return fileContentCache[path].content
  try {
    const data = await http.get(`${fileApiBase()}/file?path=${encodeURIComponent(path)}`)
    return data?.content ?? data ?? ''
  } catch {
    return ''
  }
}

async function copyFileContent(file) {
  const content = await fetchFileContent(file.path)
  if (content == null || content === '') { message.warning('暂无可复制的内容'); return }
  await copyText(content, '已复制文件内容')
}

// 剪切 / 粘贴移动（移动走后端 rename，需重启后端激活）
const cutPath = ref('')
function cutFile(path) {
  cutPath.value = path
  message.info(`已剪切：${path.split('/').pop()}`)
}
async function pasteToFolder(folderPath) {
  if (!cutPath.value) return
  const src = cutPath.value
  const name = src.split('/').pop()
  const dest = folderPath ? `${folderPath}/${name}` : name
  if (dest === src) { message.warning('不能移动到原位置'); return }
  try {
    await http.post(`${fileApiBase()}/rename`, { oldPath: src, newPath: dest })
    cutPath.value = ''
    if (activeCanvasTab.value === src) activeCanvasTab.value = 'preview'
    await loadComponentFiles()
    message.success('已移动文件')
  } catch (e) {
    message.error(e?.message || '移动失败')
  }
}

// 查找引用：以文件名(去扩展名)为词根构造正则，全局搜索
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
function findReferences(file) {
  const stem = file.name.replace(/\.[^.]+$/, '')
  if (!stem) { message.info('无法推断引用名'); return }
  searchUseRegex.value = true
  searchCaseSensitive.value = false
  searchWholeWord.value = false
  codeSearchScope.value = null
  codeSearchQuery.value = `\\b${escapeRegExp(stem)}\\b`
  focusSearchBox()
  executeCodeSearch(true)
  message.info(`查找对 ${file.name} 的引用`)
}

// 文件信息面板
const infoFile = ref(null)
const infoVisible = ref(false)
function showFileInfo(file) {
  const opened = openedFiles.value.find((f) => f.path === file.path)
  const content = opened?.content ?? fileContentCache[file.path]?.content ?? null
  const bytes = content != null ? new Blob([content]).size : (file.size ?? 0)
  const lines = content != null ? content.split(/\r\n|\n|\r/).length : 0
  infoFile.value = {
    name: file.name,
    path: file.path,
    language: getFileLanguage(file.name),
    bytes,
    lines,
    modified: !!opened?.modified,
    isImage: file.isImage || isImageFile(file.name),
  }
  infoVisible.value = true
}

// 文件比较（Diff）
const compareSourcePath = ref('')
function selectForCompare(file) {
  compareSourcePath.value = file.path
  message.info(`已选择比较基准：${file.name}`)
}
const diffVisible = ref(false)
const diffLeftPath = ref('')
const diffRightPath = ref('')
const diffLeft = ref(null)
const diffRight = ref(null)
async function buildDiffFile(path) {
  const name = path.split('/').pop()
  const content = await fetchFileContent(path)
  return { name, content, language: getFileLanguage(name) }
}
async function openDiff(rightPath, leftPath) {
  const lp = leftPath || compareSourcePath.value || ''
  if (!lp) { message.warning('请先右键「选择以进行比较」设定基准'); return }
  diffLeftPath.value = lp
  diffRightPath.value = rightPath
  diffLeft.value = await buildDiffFile(lp)
  diffRight.value = await buildDiffFile(rightPath)
  diffVisible.value = true
}

// 分屏编辑器（在侧边打开，不切换主 Tab）
async function ensureOpened(file) {
  if (openedFiles.value.find((f) => f.path === file.path)) return
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico']
  const isImage = imageExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))
  let newFile
  if (isImage) {
    const imageUrl = await resolveImageUrl(componentId.value, file.path)
    newFile = { ...file, isImage: true, imageUrl: imageUrl || getRawFileUrl(file.path), content: '' }
  } else {
    try {
      const data = await http.get(`${fileApiBase()}/file`, { path: file.path })
      newFile = { ...file, content: data.success ? data.content : `// 加载失败: ${data.error}`, originalContent: data.success ? data.content : '' }
    } catch (e) {
      newFile = { ...file, content: `// 加载失败: ${e.message}` }
    }
  }
  openedFiles.value.push(newFile)
}
const splitView = ref(false)
const sideFilePath = ref(null)
const sideFile = computed(() => (sideFilePath.value ? openedFiles.value.find((f) => f.path === sideFilePath.value) : null))
async function openToSide(file) {
  await ensureOpened(file)
  sideFilePath.value = file.path
  splitView.value = true
}
function closeSplit() {
  splitView.value = false
  sideFilePath.value = null
}

// 文件树右键
function onTreeRightClick({ event, node }) {
  const n = node || {}
  const file = n.file || (n.dataRef && n.dataRef.file)
  const isLeaf = n.isLeaf ?? (n.dataRef && n.dataRef.isLeaf)
  const key = n.key ?? n.eventKey
  if (isLeaf && file) {
    openContextMenu(event, buildFileMenu(file))
  } else if (key) {
    openContextMenu(event, buildFolderMenu(key))
  }
}

function buildFileMenu(file) {
  return [
    { label: '打开', action: () => openFile(file) },
    { label: '在侧边打开', action: () => openToSide(file) },
    { label: '在文件中查找', action: () => setSearchScope(file.path, false) },
    { label: '格式化文档', action: () => formatDocument(file.path) },
    { divider: true },
    { label: '复制路径', action: () => copyText(file.path) },
    { label: '复制相对路径', action: () => copyText(file.path) },
    { label: '复制文件名', action: () => copyText(file.name, '已复制文件名') },
    { label: '复制文件内容', action: () => copyFileContent(file) },
    { divider: true },
    { label: '选择以进行比较', action: () => selectForCompare(file) },
    { label: '与已选项比较', disabled: !compareSourcePath.value || compareSourcePath.value === file.path, action: () => openDiff(file.path) },
    { label: '查找引用', action: () => findReferences(file) },
    { label: '文件信息', action: () => showFileInfo(file) },
    { divider: true },
    { label: '重命名', action: () => renamePath(file.path, false) },
    { label: '剪切', action: () => cutFile(file.path) },
    { label: '删除', danger: true, action: () => deletePath(file.path, false) },
    { divider: true },
    { label: '在文件夹中查找', action: () => setSearchScope(parentDir(file.path), true) },
    { label: '刷新文件树', action: () => loadComponentFiles() },
  ]
}

function buildFolderMenu(folderPath) {
  return [
    { label: '新建文件', action: () => createNewFile(folderPath) },
    { label: '新建文件夹', action: () => createNewFolder(folderPath) },
    { label: '粘贴', disabled: !cutPath.value, action: () => pasteToFolder(folderPath) },
    { divider: true },
    { label: '在文件夹中查找', action: () => setSearchScope(folderPath, true) },
    { divider: true },
    { label: '重命名', action: () => renamePath(folderPath, true) },
    { label: '删除', danger: true, action: () => deletePath(folderPath, true) },
    { divider: true },
    { label: '刷新文件树', action: () => loadComponentFiles() },
  ]
}

// Tab 右键
function onTabContextMenu(e, file) {
  openContextMenu(e, buildTabMenu(file))
}

function buildTabMenu(file) {
  const idx = openedFiles.value.findIndex((f) => f.path === file.path)
  const paths = openedFiles.value.map((f) => f.path)
  const after = paths.slice(idx + 1)
  const before = paths.slice(0, idx)
  const items = [
    { label: '在侧边打开', action: () => openToSide(file) },
    { label: '关闭', action: () => onCanvasTabEdit(file.path, 'remove') },
    { label: '关闭其他', action: () => closeOpenedByPathExclude(file.path) },
    { label: '关闭右侧', disabled: after.length === 0, action: () => closePaths(after) },
    { label: '关闭左侧', disabled: before.length === 0, action: () => closePaths(before) },
    { label: '关闭全部', action: () => closeAllTabs() },
    { divider: true },
    { label: '格式化文档', action: () => formatDocument(file.path) },
    { label: '格式化选区', action: () => formatSelection(file.path) },
  ]
  if (file.modified) {
    items.push({ label: '保存', action: () => saveFile(file) })
    items.push({ label: '撤销修改', action: () => revertFile(file) })
    items.push({ divider: true })
  }
  items.push({ label: '复制路径', action: () => copyText(file.path) })
  items.push({ label: '复制文件名', action: () => copyText(file.name, '已复制文件名') })
  items.push({ label: '复制文件内容', action: () => copyFileContent(file) })
  items.push({ label: '查找引用', action: () => findReferences(file) })
  items.push({ label: '文件信息', action: () => showFileInfo(file) })
  items.push({ label: '选择以进行比较', action: () => selectForCompare(file) })
  items.push({ label: '剪切', action: () => cutFile(file.path) })
  return items
}

function closePaths(list) {
  list.forEach((p) => {
    const i = openedFiles.value.findIndex((f) => f.path === p)
    if (i >= 0) openedFiles.value.splice(i, 1)
  })
  if (list.includes(activeCanvasTab.value)) activeCanvasTab.value = 'preview'
}
function closeOpenedByPathExclude(keepPath) {
  openedFiles.value
    .map((f) => f.path)
    .filter((p) => p !== keepPath)
    .forEach((p) => {
      const i = openedFiles.value.findIndex((f) => f.path === p)
      if (i >= 0) openedFiles.value.splice(i, 1)
    })
  if (activeCanvasTab.value !== keepPath) activeCanvasTab.value = 'preview'
}
function closeAllTabs() {
  openedFiles.value = []
  activeCanvasTab.value = 'preview'
}

// ── 格式化文档（纯前端，prettier/standalone，无需后端） ──
const FORMAT_PARSER_MAP = {
  js: 'babel', mjs: 'babel', cjs: 'babel', jsx: 'babel',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'typescript',
  css: 'css', less: 'less', scss: 'scss', postcss: 'postcss',
  html: 'html', htm: 'html',
  md: 'markdown', markdown: 'markdown',
  yml: 'yaml', yaml: 'yaml',
}
const PRETTIER_PLUGIN_MAP = {
  babel: [babelPlugin, estreePlugin],
  typescript: [typescriptPlugin, estreePlugin],
  css: [postcssPlugin], less: [postcssPlugin], scss: [postcssPlugin], postcss: [postcssPlugin],
  html: [htmlPlugin],
  markdown: [markdownPlugin],
  yaml: [yamlPlugin],
}
const FORMAT_PRETTIER_OPTS = { semi: true, singleQuote: false, printWidth: 120, tabWidth: 2, endOfLine: 'lf' }

// 对 .vue 做确定性格式化：抽取 <script>/<style> 块分别用 prettier，<template> 保留原样
// 注意：SFC 解析器按字面闭合脚本标签切分脚本块，故标签均用拼接构造，源码不得出现该闭合序列
const LT = '<'
const SCRIPT_OPEN = LT + 'script'
const STYLE_OPEN = LT + 'style'
const SCRIPT_CLOSE_RE = LT + '\\/script>'
const STYLE_CLOSE_RE = LT + '\\/style>'
const SCRIPT_CLOSE_TAG = LT + '/script>'
const STYLE_CLOSE_TAG = LT + '/style>'
function formatVueSfc(source) {
  const fmtBlock = (attrs, body, langMap) => {
    const lang = (attrs.match(/lang=["']([^"']+)["']/i) || [])[1] || ''
    const parser = langMap[lang.toLowerCase()]
    if (!parser) return null
    try {
      return prettier.format(body, { parser, plugins: PRETTIER_PLUGIN_MAP[parser], ...FORMAT_PRETTIER_OPTS })
    } catch {
      return null
    }
  }
  let out = source.replace(
    new RegExp(SCRIPT_OPEN + '\\b([^>]*)>([\\s\\S]*?)' + SCRIPT_CLOSE_RE, 'gi'),
    (m, attrs, body) => {
      const formatted = fmtBlock(attrs, body, { js: 'babel', javascript: 'babel', ts: 'typescript', typescript: 'typescript' })
      return formatted == null ? m : SCRIPT_OPEN + attrs + '>' + formatted + SCRIPT_CLOSE_TAG
    }
  )
  out = out.replace(
    new RegExp(STYLE_OPEN + '\\b([^>]*)>([\\s\\S]*?)' + STYLE_CLOSE_RE, 'gi'),
    (m, attrs, body) => {
      const formatted = fmtBlock(attrs, body, { css: 'css', less: 'less', scss: 'scss', postcss: 'postcss' })
      return formatted == null ? m : STYLE_OPEN + attrs + '>' + formatted + STYLE_CLOSE_TAG
    }
  )
  return out
}

// 用 executeEdits 应用文本，保留撤销栈（确定性，不像 setValue 那样清空历史）
function applyEditorText(editor, text) {
  const model = editor.getModel()
  if (!model) return
  const fullRange = model.getFullModelRange()
  editor.executeEdits('pg-format', [{ range: fullRange, text }])
  editor.pushUndoStop()
}

// 核心：按 path 推断 parser 对文本做格式化，返回格式化后文本；不支持返回 null
async function formatTextByPath(path, text) {
  const ext = (path.split('.').pop() || '').toLowerCase()
  if (ext === 'vue') return formatVueSfc(text)
  if (ext === 'json') {
    // standalone 不含 json parser，用原生 JSON 兜底（确定性，2 空格缩进）
    return JSON.stringify(JSON.parse(text), null, 2) + (text.endsWith('\n') ? '\n' : '')
  }
  const parser = FORMAT_PARSER_MAP[ext]
  if (!parser) return null
  return await prettier.format(text, { parser, plugins: PRETTIER_PLUGIN_MAP[parser], ...FORMAT_PRETTIER_OPTS })
}

async function formatDocument(filePath) {
  const target = filePath || (activeCanvasTab.value && activeCanvasTab.value !== 'preview' ? activeCanvasTab.value : null)
  if (!target) { message.info('请先打开一个文件'); return }
  const comp = editorRefs.get(target)
  const editor = comp && comp.editor
  if (!editor) { message.warning('编辑器尚未就绪，请稍候重试'); return }
  const model = editor.getModel()
  const text = model ? model.getValue() : ''
  if (!text.trim()) { message.info('文件为空，无需格式化'); return }
  try {
    const formatted = await formatTextByPath(target, text)
    if (formatted == null) { message.info(`暂不支持格式化该文件类型：${target.split('.').pop()}`); return }
    if (formatted === text) { message.info('已是最优格式，无需改动'); return }
    applyEditorText(editor, formatted)
    message.success('已格式化文档')
  } catch (e) {
    console.error('[formatDocument]', e)
    message.error('格式化失败：' + (e && e.message ? e.message : e))
  }
}

// 格式化选区：仅格式化 Monaco 当前选区（prettier rangeStart/rangeEnd）
async function formatSelection(filePath) {
  const target = filePath || (activeCanvasTab.value && activeCanvasTab.value !== 'preview' ? activeCanvasTab.value : null)
  if (!target) { message.info('请先打开一个文件'); return }
  const comp = editorRefs.get(target)
  const editor = comp && comp.editor
  if (!editor) { message.warning('编辑器尚未就绪，请稍候重试'); return }
  const selection = editor.getSelection()
  if (!selection || selection.isEmpty()) { message.info('请先选中要格式化的代码'); return }
  const model = editor.getModel()
  const full = model ? model.getValue() : ''
  const ext = (target.split('.').pop() || '').toLowerCase()
  if (ext === 'vue' || ext === 'json') {
    message.info(ext === 'vue' ? 'Vue/JSON 建议格式化整个文档' : 'JSON 不支持局部格式化')
    return formatDocument(target)
  }
  const parser = FORMAT_PARSER_MAP[ext]
  if (!parser) { message.info('暂不支持该文件类型的选区格式化'); return }
  try {
    const start = model.getOffsetAt(selection.getStartPosition())
    const end = model.getOffsetAt(selection.getEndPosition())
    const formatted = await prettier.format(full, {
      parser, plugins: PRETTIER_PLUGIN_MAP[parser], ...FORMAT_PRETTIER_OPTS,
      rangeStart: start, rangeEnd: end,
    })
    if (formatted === full) { message.info('已是最优格式'); return }
    applyEditorText(editor, formatted)
    message.success('已格式化选区')
  } catch (e) {
    console.error('[formatSelection]', e)
    message.error('选区格式化失败：' + (e && e.message ? e.message : e))
  }
}

// ── 保存时自动格式化（localStorage 持久化） ──
const FORMAT_ON_SAVE_KEY = 'pg-format-on-save'
const formatOnSave = ref(localStorage.getItem(FORMAT_ON_SAVE_KEY) === '1')
function setFormatOnSave(v) {
  formatOnSave.value = v
  localStorage.setItem(FORMAT_ON_SAVE_KEY, v ? '1' : '0')
}

// ── 设置 / 快捷键面板 ──
const settingsVisible = ref(false)
function openSettings() { settingsVisible.value = true }
function closeSettings() { settingsVisible.value = false }

// 快捷键速查（设置面板展示，只读）
const SHORTCUT_LIST = [
  { keys: 'Ctrl/⌘ + S', desc: '保存当前文件' },
  { keys: 'Ctrl/⌘ + Shift + F', desc: '聚焦全局代码搜索' },
  { keys: 'Ctrl/⌘ + PageDown / PageUp', desc: '切换下一个 / 上一个 Tab' },
  { keys: 'Alt + W', desc: '关闭当前文件 Tab' },
  { keys: 'Alt + R', desc: '刷新预览' },
  { keys: 'Alt + Shift + F', desc: '格式化文档 / 选区' },
]

const gitLabPushModalRef = ref(null)
const canPushGit = computed(() => isEnabled('git.push'))

function openGitLabModal() {
  if (!canPushGit.value) {
    message.warning('「推送到GitLab」暂不开放')
    return
  }
  gitLabPushModalRef.value?.open()
}

function handleGitLabPushSuccess() {
  message.success('推送成功！')
}

// AI助手
const aiMessages = ref([])
const aiInput = ref('')
const memoryEnabled = ref(false)
const aiLoading = ref(false)
const aiMessagesRef = ref(null)
const selectedFiles = ref([]) // AI可读取的文件列表
const showFileSelector = ref(false) // 是否显示文件选择器
const chatAttachments = ref([]) // 当前待发送的截图附件
const MAX_CHAT_ATTACHMENT_SIZE = 5 * 1024 * 1024
let aiRequestController = null

const HIDDEN_CODE_LANGUAGES = new Set(['', 'text', 'txt', 'plain', 'plaintext'])
const CODE_LANGUAGE_LABELS = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  json: 'JSON',
  bash: 'Shell',
  sh: 'Shell',
  shell: 'Shell',
  vue: 'Vue',
  html: 'HTML',
  css: 'CSS',
  less: 'Less'
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br />')
}

function renderMessageContent(content) {
  const source = String(content || '')
  const blocks = []
  const placeholderPrefix = '%%MVGO_CODE_BLOCK_'
  const withoutCode = source.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_, rawLang, code) => {
    const lang = String(rawLang || '').trim().toLowerCase()
    const label = CODE_LANGUAGE_LABELS[lang] || lang
    const header = HIDDEN_CODE_LANGUAGES.has(lang) ? '' : `<div class="code-block-header">${escapeHtml(label)}</div>`
    const html = `<div class="ai-code-block">${header}<pre><code>${escapeHtml(code.replace(/\n$/, ''))}</code></pre></div>`
    const placeholder = `${placeholderPrefix}${blocks.length}%%`
    blocks.push(html)
    return placeholder
  })

  let html = renderInlineMarkdown(withoutCode)
  blocks.forEach((block, index) => {
    html = html.replace(`${placeholderPrefix}${index}%%`, block)
  })
  return html
}

// AI 对话历史持久化（按 componentId 存 sessionStorage，页面刷新可恢复）
const CHAT_STORAGE_PREFIX = 'playground_chat_'
function saveChatHistory() {
  try {
    sessionStorage.setItem(
      CHAT_STORAGE_PREFIX + componentId.value,
      JSON.stringify(aiMessages.value.slice(-50)) // 最多保留 50 条
    )
  } catch {}
}
function loadChatHistory() {
  try {
    const raw = sessionStorage.getItem(CHAT_STORAGE_PREFIX + componentId.value)
    if (raw) aiMessages.value = JSON.parse(raw)
  } catch {}
}
function clearChatHistory() {
  aiMessages.value = []
  try {
    sessionStorage.removeItem(CHAT_STORAGE_PREFIX + componentId.value)
  } catch {}
}

function formatFileSize(size) {
  if (!Number.isFinite(size)) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function removeChatAttachment(id) {
  chatAttachments.value = chatAttachments.value.filter((item) => item.id !== id)
}

function readImageAsAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name || `screenshot-${Date.now()}.png`,
        type: file.type || 'image/png',
        size: file.size,
        dataUrl: reader.result,
      })
    }
    reader.onerror = () => reject(reader.error || new Error('截图读取失败'))
    reader.readAsDataURL(file)
  })
}

async function handleChatPaste(event) {
  const items = Array.from(event.clipboardData?.items || [])
  const imageItems = items.filter((item) => item.type.startsWith('image/'))
  if (imageItems.length === 0) return

  event.preventDefault()
  const attachments = []
  for (const item of imageItems) {
    const file = item.getAsFile()
    if (!file) continue
    if (file.size > MAX_CHAT_ATTACHMENT_SIZE) {
      message.warning(`截图超过 ${formatFileSize(MAX_CHAT_ATTACHMENT_SIZE)}，请压缩后再粘贴`)
      continue
    }
    try {
      attachments.push(await readImageAsAttachment(file))
    } catch (error) {
      message.error(error.message || '截图读取失败')
    }
  }

  if (attachments.length > 0) {
    chatAttachments.value = [...chatAttachments.value, ...attachments].slice(-3)
    message.success(`已添加 ${attachments.length} 张截图`)
  }
}

// 版本控制
const { modificationCount, undoLoading, restoreLoading,
  initializeSnapshot, undoLastModification, restoreToInitial,
  updateModificationCount } = useSnapshots(componentId, reloadAllFiles, refreshPreview)
const downloadLoading = ref(false)

// 文件内容缓存：key = filePath, value = { content, isImage, imageUrl }
// 关闭 Tab 后保留缓存，重新打开时无需再次 HTTP 请求
const fileContentCache = reactive({})

// 用户信息
const currentUser = ref({ username: '加载中...', displayName: '加载中...' })
const currentGroup = ref({ name: '加载中...' })
const currentProject = ref({ name: '加载中...' })
const devMode = ref(false)
const showMenu = ref(false)
let hideTimer = null

function handleMenuEnter() {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
  showMenu.value = true
}

function handleMenuLeave() {
  hideTimer = setTimeout(() => {
    showMenu.value = false
  }, 200)
}

// 处理登出
async function handleLogout() {
  try {
    await http.post('/api/auth/logout')
    // 清除本地存储的用户信息
    localStorage.removeItem('user')
    message.success('已登出')
    // 门户内刷新父页面重新鉴权；非门户刷新当前页反映登出（登录页已移除）
    if (window.parent !== window && typeof window.parent.getToken === 'function') {
      window.parent.location.reload()
    } else {
      window.location.reload()
    }
  } catch (error) {
    console.error('登出失败:', error)
    message.error('登出失败')
  }
}

// 微码组件识别优先级：
// 1. URL 显式 type 参数（最权威，无论文件列表状态）
// 2. 组件 ID 前缀（mc- / mv-）
// 3. 文件列表中有 declare.json（历史数据兜底）
const isMcComponent = computed(() => {
  // 优先级 1：URL 显式传入的 type 参数
  if (explicitComponentType.value) {
    return explicitComponentType.value === 'microcode'
  }
  // 优先级 2：组件 ID 前缀兜底
  if (componentId.value.startsWith('mc-')) return true
  if (componentId.value.startsWith('mv-')) return false
  // 优先级 3：文件列表中有 declare.json（历史数据兜底）
  if (componentFiles.value.length > 0) {
    return componentFiles.value.some(f => f.path === 'declare.json')
  }
  // 默认微码
  return true
})

// workspace 图片资源映射（用于 Playground 文件树中的图片预览，不依赖后端二进制接口）
// custom-components 仅本地/测试预览使用，生产构建不纳入打包，避免临时组件资源阻断正式发版
const imageModulesVue3 = import.meta.glob(
  '../../../workspace/vue3-components/**/*.{png,jpg,jpeg,gif,svg,webp}',
  { eager: false, query: '?url', import: 'default' }
)
const imageModulesCustom = import.meta.env.DEV
  ? import.meta.glob('../../../workspace/custom-components/**/*.{png,jpg,jpeg,gif,svg,webp}', {
      eager: false,
      query: '?url',
      import: 'default'
    })
  : {}
const imageModules = { ...imageModulesVue3, ...imageModulesCustom }

function getRawFileUrl(filePath) {
  return `${fileApiBase()}/file?path=${encodeURIComponent(filePath)}&raw=1`
}

async function resolveImageUrl(componentId, filePath) {
  const fileName = filePath.split('/').pop()
  const keys = Object.keys(imageModules)

  // 优先按 componentId + 完整相对路径匹配
  const exactMatch = keys.find((key) =>
    key.includes(`/${componentId}/`) && key.endsWith(`/${filePath}`)
  )

  // 其次按 componentId + 文件名匹配
  const filenameMatch = keys.find((key) =>
    key.includes(`/${componentId}/`) && key.endsWith(`/${fileName}`)
  )

  const moduleKey = exactMatch || filenameMatch
  if (!moduleKey) return null

  const mod = await imageModules[moduleKey]()
  return mod
}

// 预览控制
const previewResolution = ref('1920x1080') // 预览分辨率（兜底值，Figma 尺寸加载后会被覆盖）
const previewScale = ref(100) // 缩放比例（默认 100%，不压缩）

// Figma 原始尺寸（从 _figma-size.json 读取）
const figmaWidth = ref(0)
const figmaHeight = ref(0)

// 动态分辨率选项列表（含 Figma 原始尺寸）
const resolutionOptions = ref([
  { value: '1920x1080', label: '1920 x 1080 (FHD)' },
  { value: '1366x768', label: '1366 x 768 (HD)' },
  { value: '1440x900', label: '1440 x 900' },
  { value: '1280x720', label: '1280 x 720 (HD)' },
  { value: '375x667', label: '375 x 667 (iPhone SE)' },
  { value: '414x896', label: '414 x 896 (iPhone XR)' },
  { value: '768x1024', label: '768 x 1024 (iPad)' },
])

// 预览容器尺寸（可拖拽调整）
// 优先级：用户拖拽自定义 > Figma 原始尺寸 > 默认 420x300
const customPreviewWidth = ref(0)
const customPreviewHeight = ref(0)

// 预览容器实际尺寸（计算属性）
const previewContainerWidth = computed(() => {
  if (customPreviewWidth.value > 0) return customPreviewWidth.value
  if (figmaWidth.value > 0) return figmaWidth.value
  return 420 // 兜底默认宽度
})

const previewContainerHeight = computed(() => {
  if (customPreviewHeight.value > 0) return customPreviewHeight.value
  if (figmaHeight.value > 0) return figmaHeight.value
  return 300 // 兜底默认高度
})

// 拖拽调整状态
const isResizingPreview = ref(false)
let resizeStartX = 0
let resizeStartY = 0
let resizeStartWidth = 0
let resizeStartHeight = 0

// 可调整的面板宽度/高度
const leftPanelWidth = ref(250) // 左侧文件列表宽度
const rightPanelWidth = ref(380) // 右侧AI助手宽度
const configAreaHeight = ref(300) // 配置面板高度（px），可拖拽调整
const { isDragging, dragTarget, startDrag } = useDragResize(leftPanelWidth, rightPanelWidth, configAreaHeight)

// declareConfig：优先从 componentStore（已注册组件），其次从后端 API（临时组件）
const declareConfig = ref(componentStore().getComponent(componentId.value)?.declareInfo || {})
const panelsList = componentStore().getBusinessPanelComponent()

/**
 * 从后端 API 兜底加载 declare.json（用于不在 componentStore 中的临时组件）
 */
async function loadDeclareConfig() {
  // 页面骨架无 declare.json，跳过（避免 404）
  if (isPageMode.value) return
  // 如果 componentStore 已有数据，不重复请求
  const storeData = componentStore().getComponent(componentId.value)?.declareInfo
  if (storeData && Object.keys(storeData).length > 0) return

  try {
    const data = await http.get(`/api/component/${componentId.value}/declare`)
    if (data.success && data.data.declare) {
      declareConfig.value = data.data.declare
      // 同步更新 formState.cssVariableConfig
      if (data.data.declare.cssVariableConfig) {
        formState.cssVariableConfig = data.data.declare.cssVariableConfig.map(item => ({...item}))
      }
      console.log('declare.json 从后端兜底加载成功')
    }
  } catch (err) {
    console.warn('declare.json 兜底加载失败（组件可能无声明文件）:', err.message)
  }
}

/**
 * 加载 Figma 原始尺寸（用于预览容器比例）
 * 参考 preview/index.vue 实现：
 * 1. 先从 _figma-size.json 读取
 * 2. 失败则从 declare.json 读取 size
 * 3. 兜底使用默认值
 */
async function loadFigmaSize() {
  try {
    // 页面模式无 Figma 尺寸
    if (isPageMode.value) return

    let figmaData = null

    // 【第一步】从 _figma-size.json 读取
    // dev 环境使用 /__raw/workspace/ 直接访问文件，不需要认证
    if (import.meta.env.DEV) {
      const figmaSizeUrl = `/__raw/workspace/custom-components/${componentId.value}/_figma-size.json`
      try {
        const resp = await fetch(figmaSizeUrl)
        if (resp.ok) {
          figmaData = await resp.json()
        }
      } catch (e) {
        // 文件不存在
      }
    } else {
      // prod 环境走 API
      try {
        const workspaceResp = await http.get(`/api/component/${componentId.value}/file?path=_figma-size.json`)
        if (workspaceResp.success && workspaceResp.data?.content) {
          figmaData = JSON.parse(workspaceResp.data.content)
        }
      } catch (e) {
        // workspace 也读取失败
      }
    }

    // 解析 Figma 尺寸
    const bbox = figmaData?.document?.absoluteBoundingBox
    if (bbox?.width > 0 && bbox?.height > 0) {
      figmaWidth.value = Math.round(bbox.width)
      figmaHeight.value = Math.round(bbox.height)
      console.log(`[loadFigmaSize] 从 _figma-size.json 读取: ${figmaWidth.value}×${figmaHeight.value}`)
      return
    }

    // 【第二步】从 declare.json 读取 size
    const declare = declareConfig.value
    const size = declare?.size
    if (size?.width > 0 && size?.height > 0) {
      figmaWidth.value = size.width
      figmaHeight.value = size.height
      console.log(`[loadFigmaSize] 从 declare.json 读取: ${figmaWidth.value}×${figmaHeight.value}`)
      return
    }

    // 【兜底】使用默认值
    console.warn('[loadFigmaSize] 无法读取 Figma 尺寸，使用默认值 420×300')
    figmaWidth.value = 420
    figmaHeight.value = 300
  } catch (err) {
    console.warn('[loadFigmaSize] 加载失败:', err.message)
    figmaWidth.value = 420
    figmaHeight.value = 300
  }
}

// 从 declareConfig 派生（使模板对异步加载的 declareConfig 保持响应式）
const layoutConfig = computed(() => declareConfig.value.layoutConfig || {})
const themeConfig = computed(() => declareConfig.value.themeConfig || {})
const cssVariableConfig = computed(() => declareConfig.value.cssVariableConfig || [])

// 是否有样式配置可用（决定是否显示「样式设置」Tab）
const hasStyleConfig = computed(() => {
  const dc = declareConfig.value
  return !!(dc.layoutConfig?.list?.length || dc.themeConfig?.list?.length || dc.cssVariableConfig?.length)
})

// 当组件无样式配置时，「样式设置」面板会被 v-if 移除；
// 此时若 activeTab 仍指向 'settings'，a-tabs 找不到匹配面板 → 内容区域空白。
// 这里自动在可用面板间切换，保证配置面板始终有可见内容。
watch(
  hasStyleConfig,
  (val) => {
    if (val && activeTab.value === 'json-editor') {
      activeTab.value = 'settings'
    } else if (!val && activeTab.value === 'settings') {
      activeTab.value = 'json-editor'
    }
  },
  { immediate: true }
)

const actions = ref('clear')
const load = ref(!route.query.taskId)
const previewKey = ref(0) // 递增此值即可无闪烁刷新预览组件
const previewCacheKey = ref(Date.now()) // 缓存破坏参数：保存/手动刷新时更新
const previewFrame = ref(null) // 预览 iframe 引用
const previewWrapperRef = ref(null) // 预览容器引用（用于自适应缩放计算）

// 预览 iframe 地址：加载独立预览页（自带 ErrorBoundary + sandbox 隔离）
// 末尾追加 _t= 时间戳绕过浏览器/SPA 运行时缓存，确保保存代码后预览实时刷新
const previewUrl = computed(() => {
  const descriptor = resolvePreviewDescriptor(
    {
      componentId: String(componentId.value),
      sessionId: String(taskId.value || componentId.value),
      groupId: playgroundGroupId(),
      target: explicitComponentType.value || (isMcComponent.value ? 'microcode' : 'vue3'),
      artifactReady: taskArtifactReady.value,
    },
    { candidate: taskSnapshot.value, partial: null, lastGood: null },
  )
  if (!descriptor) return ''
  // 2026-09-10：Playground 是编辑态，代码与 AI 修复都写 workspace；
  // 只要 workspace 已读到文件就强制走 workspace 源（snapshot=0），
  // 否则「保存/AI 修复成功但预览还是旧的」（快照是生成时内容）。
  // 生成中 workspace 尚无产物时仍走快照源。
  const useWorkspaceSource = componentFiles.value.length > 0
  return import.meta.env.BASE_URL + buildResolvedPreviewUrl(descriptor, {
    width: previewContainerWidth.value,
    height: previewContainerHeight.value,
    cacheKey: previewCacheKey.value,
    snapshot: useWorkspaceSource ? '0' : undefined,
  }).replace(/^\//, '')
})

// iframe 加载完成后，推送当前 cssVars 到预览页（postMessage 桥接实时联动）
function onPreviewFrameLoad() {
  sendStyleToPreview()
}

// ⚠️ 必须在使用 styles 的函数/watch 之前声明，避免 setup 期 TDZ 崩溃
const styles = ref({})

// 将配置面板的 cssVars 推送到预览 iframe（:root 自定义属性）
function sendStyleToPreview() {
  const frame = previewFrame.value
  if (!frame || !frame.contentWindow) return
  const raw = (styles.value && styles.value.cssVars) || {}
  // 只保留可结构化克隆的基础类型值（string/number/boolean）。
  // styles.value.cssVars 是 Vue 响应式 Proxy；formState.cssVariableConfig 会被后端 declare 整块覆写，
  // 若某项的 value 是对象/数组，原样塞进 cssVars 后 postMessage 的结构化克隆会抛 DataCloneError。
  // CSS 自定义属性本质都是字符串，非基础类型值对预览无意义，直接丢弃。
  const cssVars = {}
  for (const [k, v] of Object.entries(raw)) {
    if (v !== null && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
      cssVars[k] = v
    }
  }
  try {
    frame.contentWindow.postMessage({ type: 'apply-css-vars', cssVars }, '*')
  } catch (e) {
    console.warn('[sendStyleToPreview] postMessage 失败（已跳过非克隆值）:', e)
  }
}

// 配置面板（主题/CSS变量）改动 → 推送到预览 iframe
watch(
  () => styles.value && styles.value.cssVars,
  () => sendStyleToPreview(),
  { deep: true }
)

// 默认存在
const cssConfig = [
  { name: '字体大小', key: 'fontSize', type: 'size' },
  { name: '字体颜色', key: 'colorTextBase', type: 'color' },
  { name: '字体粗细', key: 'fontWeightStrong', type: 'weight' },
  { name: '主色', key: 'colorPrimary', type: 'color' },
  { name: '主色的激活色', key: 'colorPrimaryActive', type: 'color' },
  { name: '主背景色', key: 'colorPrimaryBg', type: 'color' },
  { name: '主背景色的悬浮态色', key: 'colorPrimaryBgHover', type: 'color' }
]
const formState = reactive({
  panelType: route.query.panelType || '',
  layoutType: route.query.layoutType || layoutConfig.value.default
})

const loadDebounce = $radash.debounce(
  { delay: 1000 },
  () => {
    styles.value = getStyleConfig()
    load.value = false
    nextTick(() => {
      load.value = true
    })
  }
)

watch(
  () => formState,
  () => {
    loadDebounce()
  },
  {
    deep: true
  }
)

// AI助手样式应用处理
const handleApplyStyle = (styleData) => {
  Object.assign(formState, styleData)
}

const unitData = computed(() => {
  let unitobj = {}
  const unitlist = formState.cssVariableConfig.filter((item) => item.unit && item)

  unitlist.map((item) => {
    unitobj[item.key] = item.unit
  })
  console.log(unitobj)

  return unitobj
})

// 比例适配
const aspectRatio = computed(() => {
  const ar = declareConfig.value.attribute?.aspectRatio
  if (Array.isArray(ar) && ar.length >= 2 && ar[1] !== 0) {
    return ar[0] / ar[1]
  }
  return 16 / 9
})

// 动态grid布局
const gridTemplateColumns = computed(() => {
  return `${leftPanelWidth.value}px 4px 1fr 4px ${rightPanelWidth.value}px`
})

// 中间区域（画布+配置）的 grid 行高：微码组件用动态高度，Vue3 组件只有一行
const mainContentGridStyle = computed(() => {
  if (!isMcComponent.value) {
    return { gridTemplateRows: '1fr' }
  }
  // 配置面板折叠时第三行收起为切换条高度（36px），画布区 1fr 自动撑满
  const configRow = configCollapsed.value ? '36px' : `${configAreaHeight.value}px`
  return { gridTemplateRows: `1fr auto ${configRow}` }
})

// 将文件列表转换为树形结构
const fileTree = computed(() => {
  const tree = []
  const map = {}

  // 收集已修改的文件路径
  const modifiedPaths = new Set(
    openedFiles.value
      .filter(f => f.content !== f.originalContent)
      .map(f => f.path)
  )

  componentFiles.value.forEach((file) => {
    const parts = file.path.split('/')
    let currentLevel = tree

    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1
      const key = parts.slice(0, index + 1).join('/')

      if (!map[key]) {
        const node = {
          title: isFile && modifiedPaths.has(file.path) ? `● ${part}` : part,
          key: key,
          isLeaf: isFile,
          icon: isFile ? '≡' : '', // VS Code风格：文件用≡，文件夹不显示图标
          children: isFile ? undefined : [],
          file: isFile ? file : null
        }

        map[key] = node
        currentLevel.push(node)

        if (!isFile) {
          currentLevel = node.children
        }
      } else if (!isFile) {
        currentLevel = map[key].children
      }
    })
  })

  return tree
})

// 拖拽调整预览容器尺寸
function startPreviewResize(event, direction) {
  event.preventDefault()
  isResizingPreview.value = true
  resizeStartX = event.clientX
  resizeStartY = event.clientY
  resizeStartWidth = previewContainerWidth.value
  resizeStartHeight = previewContainerHeight.value
  
  const onMouseMove = (e) => {
    if (!isResizingPreview.value) return
    
    const deltaX = e.clientX - resizeStartX
    const deltaY = e.clientY - resizeStartY
    
    if (direction === 'right' || direction === 'corner') {
      customPreviewWidth.value = Math.max(100, resizeStartWidth + deltaX)
    }
    if (direction === 'bottom' || direction === 'corner') {
      customPreviewHeight.value = Math.max(100, resizeStartHeight + deltaY)
    }
  }
  
  const onMouseUp = () => {
    isResizingPreview.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  document.body.style.cursor = direction === 'right' ? 'ew-resize' : direction === 'bottom' ? 'ns-resize' : 'nwse-resize'
  document.body.style.userSelect = 'none'
}

// 重置为 Figma 原始尺寸
function resetPreviewSize() {
  customPreviewWidth.value = 0
  customPreviewHeight.value = 0
}

/** 自适应缩放：根据容器可用空间自动计算最佳 fit scale */
const autoFitScale = ref(1)
let resizeObserver = null

function updateAutoFitScale() {
  const el = previewWrapperRef.value
  if (!el) return
  const { clientWidth: cw, clientHeight: ch } = el
  if (cw <= 0 || ch <= 0) return
  // 预留 padding（preview-wrapper 的 padding）
  const pad = 24 * 2
  const availW = cw - pad
  const availH = ch - pad
  if (availW <= 0 || availH <= 0) return
  const scaleX = availW / previewContainerWidth.value
  const scaleY = availH / previewContainerHeight.value
  // 取较小值确保完整可见，上限 1（不放大）
  autoFitScale.value = Math.min(scaleX, scaleY, 1)
}

/** 当前实际生效的缩放值（'fit' 时用自动计算的，否则用用户选择的） */
const effectiveScale = computed(() => {
  return previewScale.value === 'fit' ? autoFitScale.value : previewScale.value / 100
})

// 预览盒子样式：宽度、高度、可选缩放
const previewStyle = computed(() => {
  const style = {
    width: `${previewContainerWidth.value}px`,
    height: `${previewContainerHeight.value}px`,
  }
  // 只有非 100% 缩放时才应用 transform（用于模拟不同设备分辨率查看效果）
  if (effectiveScale.value !== 1) {
    style.transform = `scale(${effectiveScale.value})`
    style.transformOrigin = 'top left'
  }
  return style
})

/**
 * @description: 初始化demo组件配置
 * @return {*}
 */
function init() {
  const { themeType, themeVars } = getThemeConfig(
    route.query.themeType || themeConfig.value?.default,
    declareConfig.value
  )

  const { styles, cssVars } = getCssVarsConfig({}, themeVars)

  formState.themeType = themeType

  formState.cssVariableConfig = [...cssConfig, ...cssVariableConfig.value].map((item) => {
    const config = {
      ...item
    }
    if (item.type === 'size') {
      const { number, unit } = splitCssNumber(cssVars[item.key])
      config.value = number
      config.unit = unit
    } else if (item.type === 'weight') {
      config.value = weightNumberToString(cssVars[item.key])
    } else {
      config.value = cssVars[item.key]
    }
    return config
  })
}

onMounted(async () => {
  init()
  const artifactReady = await loadTaskStatus()
  if (artifactReady) {
    await loadComponentFiles()
    initializeSnapshot()
    // 加载 Figma 原始尺寸（用于预览容器比例）
    await loadFigmaSize()
  }
  loadChatHistory()
  const optimizeStorageKey = `mvgo-optimize-prompt:${componentId.value}`
  const optimizePrompt = sessionStorage.getItem(optimizeStorageKey)?.trim() || ''
  if (route.query.optimize === '1' && optimizePrompt) {
    aiInput.value = optimizePrompt
    activeCanvasTab.value = 'preview'
    sessionStorage.removeItem(optimizeStorageKey)
  }
  loadUserInfo()

  // Ctrl+S / Cmd+S 等快捷键：保存当前打开的文件 + 切 Tab / 关 Tab / 刷新预览
  window.addEventListener('keydown', handleKeyDown, true)

  // 自适应缩放：监听容器尺寸变化自动重算 fit scale
  nextTick(() => updateAutoFitScale())
  if (previewWrapperRef.value) {
    resizeObserver = new ResizeObserver(() => {
      updateAutoFitScale()
    })
    resizeObserver.observe(previewWrapperRef.value)
  }
  window.addEventListener('resize', updateAutoFitScale)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown, true)
  loadDebounce.cancel()
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null }
  window.removeEventListener('resize', updateAutoFitScale)
})

// Ctrl+S / Cmd+S 快捷键处理（捕获阶段注册，确保编辑器聚焦时也能命中）
function handleKeyDown(e) {
  const mod = e.ctrlKey || e.metaKey
  // Ctrl/Cmd+S：保存当前文件
  if (mod && e.key === 's') {
    e.preventDefault()
    const currentFile = openedFiles.value.find(f => f.path === activeCanvasTab.value)
    if (currentFile && currentFile.modified) saveFile(currentFile)
    return
  }
  // Ctrl/Cmd+PageDown / PageUp：切换下一个/上一个 Tab
  if (mod && e.key === 'PageDown') { e.preventDefault(); switchCanvasTab(1); return }
  if (mod && e.key === 'PageUp') { e.preventDefault(); switchCanvasTab(-1); return }
  // Alt+W：关闭当前文件 Tab（IDE 风格关闭）
  if (!mod && e.altKey && (e.key === 'w' || e.key === 'W')) { e.preventDefault(); closeCurrentCanvasTab(); return }
  // Alt+R：刷新预览
  if (!mod && e.altKey && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); refreshPreview(); return }
  // Alt+Shift+F：格式化文档 / 选区（捕获阶段优先于 Monaco 自带格式化，避免双格式化）
  if (!mod && e.altKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
    e.preventDefault()
    e.stopPropagation()
    const comp = editorRefs.get(activeCanvasTab.value)
    const ed = comp && comp.editor
    const sel = ed && ed.getSelection && ed.getSelection()
    if (sel && !sel.isEmpty()) formatSelection()
    else formatDocument()
    return
  }
}

// 切换画布 Tab（preview + 所有已打开文件循环）
function switchCanvasTab(dir) {
  const panes = ['preview', ...openedFiles.value.map(f => f.path)]
  if (panes.length <= 1) return
  const cur = panes.indexOf(activeCanvasTab.value)
  const next = (cur + dir + panes.length) % panes.length
  activeCanvasTab.value = panes[next]
}

// 关闭当前文件 Tab
function closeCurrentCanvasTab() {
  const key = activeCanvasTab.value
  if (key === 'preview') return
  onCanvasTabEdit(key, 'remove')
}

// startDrag 已迁移到 useDragResize composable

/**
 * @description: 加载组件文件列表
 */
function applySnapshotFilesFallback() {
  if (!taskSnapshot.value?.files?.length) return false
  const nextFiles = taskSnapshot.value.files.map((file) => ({
    name: file.path.split('/').pop() || file.path,
    path: file.path,
    type: file.path.endsWith('.vue')
      ? 'vue'
      : file.path.endsWith('.json')
        ? 'json'
        : file.path.match(/\.(less|css)$/i)
          ? 'css'
          : file.path.match(/\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i)
            ? 'image'
            : 'text',
    snapshotOnly: true,
    content: '',
  }))
  componentFiles.value = nextFiles
  return true
}

async function loadComponentFiles() {
  try {
    const data = await http.get(`${fileApiBase()}/files`)
    const previousPaths = new Set(componentFiles.value.map((file) => file.path))
    const workspaceFiles = data.success && Array.isArray(data.data?.files)
      ? data.data.files
      : []
    const loadedFromSnapshot = workspaceFiles.length === 0 && applySnapshotFilesFallback()
    const rawFiles = workspaceFiles.length > 0 ? workspaceFiles : (loadedFromSnapshot ? componentFiles.value : [])
    const nextFiles = rawFiles.map((file) => ({
      name: file.name,
      path: file.path,
      type: file.type,
      snapshotOnly: file.snapshotOnly === true,
      content: '' // 内容将在打开时加载
    }))
    componentFiles.value = nextFiles

    if (!data.success && !loadedFromSnapshot) {
      console.error('加载文件列表失败:', data.data?.error || data.error || '文件接口返回失败')
    }

    // 首次加载展开全部目录；AI 新增文件时只自动展开新增文件所在的目录，保留用户手动折叠状态。
    const nextFolderKeys = getFolderKeys(nextFiles)
    const newFileFolderKeys = getFolderKeys(
      nextFiles.filter((file) => !previousPaths.has(file.path)),
    )
    expandedFileKeys.value = previousPaths.size === 0
      ? nextFolderKeys
      : Array.from(new Set([...expandedFileKeys.value, ...newFileFolderKeys]))

    console.log('文件列表加载成功', componentFiles.value)

    // 兜底加载 declare.json（临时组件可能不在 componentStore 中）
    await loadDeclareConfig()

    // 支持从预览错误卡片携带 file/line/column 跳转并精确定位。
    const requestedPath = typeof route.query.file === 'string' ? route.query.file : ''
    const requestedFile = requestedPath
      ? componentFiles.value.find(file => file.path === requestedPath || file.path.endsWith(`/${requestedPath}`))
      : null
    const mainVue = componentFiles.value.find((f) => f.path === 'package/index.vue' || f.path === 'index.vue')
    const autoOpen = requestedFile || mainVue || componentFiles.value.find((f) => f.path === 'declare.json') || componentFiles.value[0]
    if (autoOpen) {
      await openFile(autoOpen)
      const line = Number(route.query.line || previewDiagnostic.value?.line || 0)
      if (line > 0) {
        await revealDiagnostic(autoOpen.path, {
          ...(previewDiagnostic.value || {}),
          line,
          column: Number(route.query.column || previewDiagnostic.value?.column || 1),
          message: previewDiagnostic.value?.message || 'LESS 编译失败',
        })
      }
    }

    // 智能选中核心文件供 AI 使用
    const corePatterns = ['package/index.vue', 'index.vue', 'component.js', 'declare.json', 'package/config.less', 'config.less']
    selectedFiles.value = componentFiles.value
      .filter(f => corePatterns.some(p => f.path === p || f.path.endsWith('/' + p)))
      .map(f => f.path)
  } catch (error) {
    if (applySnapshotFilesFallback()) {
      console.warn('组件文件接口不可用，已回退到任务快照文件列表')
      const mainVue = componentFiles.value.find((f) => f.path === 'package/index.vue' || f.path === 'index.vue')
      const autoOpen = mainVue || componentFiles.value.find((f) => f.path === 'declare.json') || componentFiles.value[0]
      if (autoOpen) await openFile(autoOpen)
      selectedFiles.value = componentFiles.value
        .filter(f => ['package/index.vue', 'index.vue', 'component.js', 'declare.json'].includes(f.path))
        .map(f => f.path)
      return
    }
    console.error('加载文件列表失败:', error)
  }
}

/**
 * @description: 获取样式配置
 * @return {*}
 */
function getStyleConfig() {
  const style = {},
    cssVars = {}
  formState.cssVariableConfig.forEach((item) => {
    if (item.value === undefined) {
      return
    }
    if (item.type === 'size') {
      style['--' + item.key] = item.value + item.unit
      cssVars[item.key] = item.value + item.unit
    } else {
      style['--' + item.key] = item.value
      cssVars[item.key] = item.value
    }
  })
  return {
    style,
    cssVars
  }
}

/**
 * @description: 分割css属性值,获取数字和单位
 * @param {*} val
 * @return {*}
 */
function splitCssNumber(val) {
  // 分割css属性值字符串,获取数字和单位
  if (typeof val !== 'string') return { number: val, unit: '' }
  const match = val.match(/^(-?\d*\.?\d+)([a-zA-Z%]*)$/)
  if (match) {
    return {
      number: parseFloat(match[1]),
      unit: match[2] || ''
    }
  }
  return { number: val, unit: '' }
}

/**
 * @description: css weight 数字 转换为字符串
 * @param {number|string} weight
 * @return {string}
 */
function weightNumberToString(weight = 'normal') {
  if (typeof weight === 'string') return weight
  switch (weight) {
    case 400:
      return 'normal'
    case 700:
      return 'bold'
    case 100:
      return 'lighter'
    case 900:
      return 'bolder'
    default:
      return String(weight)
  }
}

/**
 * @description: 切换配置
 * @param {*} type
 * @return {*}
 */
function change(type, val) {
  router
    .push({
      path: route.path,
      query: {
        ...route.query,
        [type]: val
      }
    })
    .then((res) => {
      if (type === 'themeType') init()
    })
}

/**
 * @description: 打开文件
 * @param {*} file
 */
async function openFile(file) {
  activeFile.value = file.path

  // 检查文件是否已打开
  const isOpened = openedFiles.value.find((f) => f.path === file.path)
  if (!isOpened) {
    // 优先从缓存恢复（之前关闭过的 Tab）
    const cached = fileContentCache[file.path]
    if (cached) {
      const restoredFile = {
        ...file,
        content: cached.content,
        originalContent: cached.originalContent,
        isImage: cached.isImage || false,
        imageUrl: cached.imageUrl || null,
      }
      openedFiles.value.push(restoredFile)
      console.log('文件从缓存恢复:', file.name)
    } else {
      // 检测是否为图片文件
      const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico']
      const isImage = imageExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))

      if (isImage) {
        // 图片文件：快照文件优先走 revision API，workspace 文件继续走 Vite 资源 URL。
        let imageUrl = ''
        if (file.snapshotOnly && taskSnapshot.value?.revision && taskId.value) {
          try {
            const blob = await fetchTaskCodeSnapshotFileBlob(
              String(taskId.value),
              taskSnapshot.value.revision,
              file.path,
            )
            imageUrl = URL.createObjectURL(blob)
          } catch (error) {
            console.warn('快照图片加载失败:', error)
          }
        }
        if (!imageUrl) imageUrl = await resolveImageUrl(componentId.value, file.path) || getRawFileUrl(file.path)
        const newFile = {
          ...file,
          isImage: true,
          imageUrl,
          content: '' // 图片不需要文本内容
        }
        openedFiles.value.push(newFile)
        console.log('图片文件已打开:', file.name, imageUrl)
      } else {
        // 文本文件：snapshot-only 走 revision API，workspace 文件走组件文件 API。
        try {
          let content = ''
          if (file.snapshotOnly && taskSnapshot.value?.revision && taskId.value) {
            content = await fetchTaskCodeSnapshotFile(
              String(taskId.value),
              taskSnapshot.value.revision,
              file.path,
            )
          } else {
            const data = await http.get(`${fileApiBase()}/file`, { path: file.path })
            if (!data.success) throw new Error(data.error || '文件接口返回失败')
            content = data.content
          }
          const newFile = {
            ...file,
            content,
            originalContent: content // 保存原始内容用于检测修改
          }
          openedFiles.value.push(newFile)
          console.log('文件加载成功:', file.name, file.snapshotOnly ? '(snapshot)' : '')
        } catch (error) {
          console.error('加载文件失败:', error)
          const newFile = {
            ...file,
            content: `// 加载失败: ${error.message}`
          }
          openedFiles.value.push(newFile)
        }
      }
    }
  }

  // 切换到该文件的Tab
  activeCanvasTab.value = file.path
}

/**
 * @description: 树节点选择回调
 */
function onTreeNodeSelect(selectedKeys, info) {
  const node = info.node
  console.log('[demo] 文件树点击:', node?.key, node?.isLeaf, node?.file?.name)

  // 只处理文件节点，文件夹节点只展开/折叠
  if (node.isLeaf && node.file) {
    openFile(node.file)
  }
}

/**
 * @description: Tab编辑回调（关闭Tab）
 */
function onCanvasTabEdit(targetKey, action) {
  if (action === 'remove') {
    const index = openedFiles.value.findIndex((f) => f.path === targetKey)
    if (index !== -1) {
      const file = openedFiles.value[index]
      // 保留文件内容到缓存，避免重新打开时重复 HTTP 请求
      if (file.content && !fileContentCache[file.path]) {
        fileContentCache[file.path] = {
          content: file.content,
          originalContent: file.originalContent,
          isImage: file.isImage || false,
          imageUrl: file.imageUrl || null,
        }
      }
      openedFiles.value.splice(index, 1)
      // 如果关闭的是当前Tab，切换到预览
      if (activeCanvasTab.value === targetKey) {
        activeCanvasTab.value = 'preview'
      }
    }
  }
}

/**
 * @description: 代码修改回调
 */
function onCodeChange(file) {
  // 标记文件为已修改
  file.modified = file.content !== file.originalContent
}

/**
 * 🛡️ A/B 方案：生成进行中主组件(index.vue)锁定——禁止保存（避免被生成覆盖）。子组件可编辑。
 */
function isMainEntryLocked(file) {
  if (taskStatus.value !== 'running') return false
  return /(^|\/)package\/index\.vue$/.test(file.path) || file.path === 'index.vue' || file.name === 'index.vue'
}

/**
 * @description: 保存文件
 */
async function saveFile(file) {
  if (!file.modified) return
  if (file.snapshotOnly && (!taskSnapshot.value?.revision || !taskId.value)) {
    alert('当前快照缺少有效 revision，无法保存，请刷新后重试。')
    return
  }

  // 🛡️ A/B 方案：生成进行中禁止保存主组件 index.vue（后端亦返回 409 双保险）
  if (isMainEntryLocked(file)) {
    alert('组件正在生成中，主组件(index.vue)被锁定，保存会被生成覆盖。请等待生成完成后再编辑主组件；子组件可正常编辑。')
    return
  }

  file.saving = true

  // 保存时自动格式化
  if (formatOnSave.value) {
    const comp = editorRefs.get(file.path)
    const editor = comp && comp.editor
    if (editor) {
      try {
        const cur = editor.getModel().getValue()
        const formatted = await formatTextByPath(file.path, cur)
        if (formatted != null && formatted !== cur) {
          applyEditorText(editor, formatted)
          file.content = formatted
        }
      } catch (e) {
        console.warn('[formatOnSave] 跳过自动格式化：', e)
      }
    }
  }

  try {
    const snapshotRevision = taskSnapshot.value?.revision
    const data = file.snapshotOnly
      ? await editTaskCodeSnapshotFile(
        String(taskId.value),
        String(snapshotRevision),
        file.path,
        file.content,
      )
      : await saveFileRemote(file.path, file.content)

    if (data?.success !== false) {
      if (file.snapshotOnly && data?.revision) {
        taskSnapshot.value = data
        fileContentCache[file.path] = {
          content: file.content,
          originalContent: file.content,
          isImage: file.isImage || false,
          imageUrl: file.imageUrl || null,
        }
        componentFiles.value = componentFiles.value.map((item) => ({
          ...item,
          snapshotOnly: true,
        }))
      }
      // 更新原始内容
      file.originalContent = file.content
      file.modified = false
      console.log('文件保存成功:', file.name, file.snapshotOnly ? '(new snapshot revision)' : '')

      // 🔧 任何文件保存后都要刷新预览（2026-09-10 修复）
      // 此前仅在 file.name === 'index.vue' 时刷新 → 改子组件（package/components/*.vue）
      // 或样式文件后保存成功但预览纹丝不动，用户只能手动整页刷新。
      // dev：失效 Vite 模块缓存。微码组件预览用 @vite-ignore 原生 import
      // /workspace/.../component.js（不进 Vite 模块图、无 HMR 追踪），
      // 文件变化不触发 transform 缓存失效 → 保存后 Vite 仍返回旧 transform。
      // /__invalidate（vite.config.js）清空缓存，让下次 import 重新 transform。
      // Vue3 走 /__raw 直读磁盘，无此问题；此处调用对 Vue3 无害。
      try {
        await fetch('/__invalidate', { method: 'GET' })
      } catch {}
      refreshPreview()
    } else {
      console.error('保存失败:', data.data.error)
      alert('保存失败: ' + data.data.error)
    }
  } catch (error) {
    console.error('保存失败:', error)
    alert('保存失败: ' + error.message)
  } finally {
    file.saving = false
  }
}

/**
 * @description: 撤销修改
 */
function revertFile(file) {
  if (!file.modified) return

  if (confirm('确定要撤销对 ' + file.name + ' 的修改吗？')) {
    file.content = file.originalContent
    file.modified = false
  }
}

/**
 * @description: 刷新预览
 */
function refreshPreview() {
  clearPreviewError() // iframe 即将重载，清除旧的错误提示
  // 先更新缓存破坏参数（URL 变化），再递增 key 触发 iframe 重建
  previewCacheKey.value = Date.now()
  previewKey.value++
  console.log('预览已刷新（无闪烁）')
}

async function handlePreviewFixed(payload) {
  if (payload?.componentId && payload.componentId !== componentId.value) return
  clearPreviewError()
  await reloadAllFiles()
  await loadTaskStatus()
  await updateModificationCount()
  refreshPreview()
  const msg = payload?.success === false
    ? 'AI 修复已应用，但预览仍有问题，请检查组件代码'
    : (payload?.summary || 'AI 修复已生效')
  message.success(msg)
}

/**
 * @description: 获取文件图标
 */
function getFileIcon(filename) {
  const ext = filename.split('.').pop()
  const iconMap = {
    vue: 'VUE',
    js: 'JS',
    json: 'JSON',
    md: 'MD',
    css: 'CSS',
    png: 'PNG',
    jpg: 'JPG',
    svg: 'SVG'
  }
  return iconMap[ext] || 'FILE'
}

/**
 * @description: 获取文件对应的Monaco编辑器语言
 */
function getFileLanguage(filename) {
  const ext = filename.split('.').pop().toLowerCase()
  const languageMap = {
    vue: 'html',
    js: 'javascript',
    ts: 'typescript',
    json: 'json',
    md: 'markdown',
    css: 'css',
    less: 'less',
    scss: 'scss',
    html: 'html',
    xml: 'xml'
  }
  return languageMap[ext] || 'plaintext'
}

// 判断是否是图片文件
function isImageFile(filename) {
  const ext = filename.split('.').pop().toLowerCase()
  return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)
}

/**
 * @description: 发送AI消息
 */
async function sendAIMessage() {
  if (!aiInput.value.trim() && chatAttachments.value.length === 0) return
  // 防重复请求：loading 中再次点击/按 Ctrl+Enter 直接忽略
  if (aiLoading.value) return

  const userInput = aiInput.value.trim()
  const attachments = chatAttachments.value.map((item) => ({ ...item }))
  const attachmentSummary = attachments.length > 0
    ? `<div class="message-attachments-summary">已附加 ${attachments.length} 张截图</div>`
    : ''
  const userMessage = {
    id: Date.now(),
    role: 'user',
    content: `${userInput || '请根据截图分析并修改'}${attachmentSummary}`
  }
  aiMessages.value.push(userMessage)
  saveChatHistory()

  aiInput.value = ''
  chatAttachments.value = []
  aiLoading.value = true
  aiRequestController = new AbortController()

  try {
    // 获取选中的文件内容
    const selectedFilesContent = []
    for (const filePath of selectedFiles.value) {
      const file = componentFiles.value.find((f) => f.path === filePath)
      if (file) {
        // 如果文件已打开，使用内存中的内容
        const openedFile = openedFiles.value.find((f) => f.path === filePath)
        const content = openedFile ? openedFile.content : file.content

        // 如果文件内容为空，需要加载
        if (!content && !openedFile) {
          try {
            const data = await http.get(`${fileApiBase()}/file`, {
              path: filePath
            })
            if (data.success) {
              selectedFilesContent.push({
                path: filePath,
                name: file.name,
                content: data.content
              })
            }
          } catch (err) {
            console.error('加载文件失败:', filePath, err)
          }
        } else {
          selectedFilesContent.push({
            path: filePath,
            name: file.name,
            content: content || ''
          })
        }
      }
    }

    // 读取全局配置
    const configStore = useConfigStore()
    const globalConfig = configStore.config || {}
    const llmConfig = {
      apiKey: globalConfig.textApiKey || globalConfig.aiApiKey || undefined,
      baseURL: globalConfig.textBaseURL || globalConfig.aiBaseURL || undefined,
      model: globalConfig.textModel || globalConfig.aiModel || undefined,
    }

    // 调用后端AI接口（SSE 流式响应）
    const response = await http.stream(
      '/api/demo/ai-chat/stream',
      {
        message: userInput || '请根据截图分析并修改',
        componentId: componentId.value,
        selectedFiles: selectedFilesContent,
        attachments,
        history: memoryEnabled.value ? aiMessages.value : [],
        llmConfig,
      },
      { signal: aiRequestController.signal }
    )

    if (!response.body) {
      throw new Error('响应流为空')
    }

    // 读取 SSE 流
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let assistantContent = ''
    let aiSucceeded = true
    let aiModifiedFiles = []
    let aiToolErrors = []

    // 创建占位消息用于流式更新 —— 不立即 push；首帧真实文本到达后再 push
    // 修复：原先 SSE 起始即 aiMessages.push({content:'思考中...'})，会与模板
    // <div v-if="aiLoading">思考中...</div> 同时渲染出两个"思考中..."气泡。
    const streamMessage = {
      id: Date.now() + 1,
      role: 'assistant',
      content: ''
    }
    let isStreamMessagePushed = false
    const commitStreamMessage = () => {
      if (isStreamMessagePushed) return
      // 占位文案、空串、纯空白都不算"有真实内容"，等真实文字到位再上屏
      const txt = (streamMessage.content || '').trim()
      if (!txt || txt === '思考中...') return
      aiMessages.value.push(streamMessage)
      isStreamMessagePushed = true
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const chunks = buffer.split('\n\n')
      buffer = chunks.pop() || '' // 保留未完成的 SSE 事件块

      for (const chunk of chunks) {
        if (!chunk.trim()) continue
        const chunkLines = chunk.split('\n')
        const eventName = chunkLines
          .find((line) => line.startsWith('event: '))
          ?.slice(7)
        const dataText = chunkLines
          .filter((line) => line.startsWith('data: '))
          .map((line) => line.slice(6))
          .join('\n')
        if (!dataText) continue

        const eventData = JSON.parse(dataText)

        if (eventName === 'error' || eventData.type === 'error') {
          throw new Error(eventData.message || 'AI 对话失败')
        } else if (eventName === 'tool_call' || eventData.type === 'tool_call' || (eventData.name && eventData.args)) {
          // 工具调用事件
          streamMessage.content = assistantContent || `🔧 正在调用 ${eventData.name || eventData.type}...`
        } else if (eventName === 'done' || eventData.type === 'done' || eventData.content !== undefined) {
          // 完成，同时接收后端真实写入结果，避免把纯文字回复误判成已修改。
          if (typeof eventData.content === 'string') {
            assistantContent = eventData.content
          }
          aiSucceeded = eventData.success !== false
          aiModifiedFiles = Array.isArray(eventData.modifiedFiles) ? eventData.modifiedFiles : []
          aiToolErrors = Array.isArray(eventData.toolErrors) ? eventData.toolErrors : []
        } else if (eventName === 'status' || eventData.type === 'status' || eventData.message) {
          streamMessage.content = eventData.message || streamMessage.content
        }
      }

      streamMessage.content = assistantContent || streamMessage.content
      // 内容真有值（非占位文案）后才把 streamMessage 推到 aiMessages，
      // 避免与模板 v-if="aiLoading" 的「思考中...」重复显示。
      commitStreamMessage()
    }

    // 最终更新
    streamMessage.content = assistantContent || '处理完成'
    // 兜底：极端场景 SSE 0 帧直达 done，未在 while 内 commit；这里补一次 push
    commitStreamMessage()

    saveChatHistory()

    // 只有后端确认存在成功 write_file 时，才把本轮当作代码修改并刷新文件树/预览。
    const hasFileChanges = aiModifiedFiles.length > 0
    if (hasFileChanges) {
      await reloadAllFiles()
      refreshPreview()
      await updateModificationCount()
    }
    if (aiToolErrors.length > 0) {
      streamMessage.content += `\n\n⚠️ 文件写入未完整完成：${aiToolErrors.join('；')}`
    } else if (!aiSucceeded) {
      streamMessage.content += '\n\n⚠️ 本轮未完成实际文件修改，请根据提示重试。'
    }

    // 滚动到底部
    nextTick(() => {
      if (aiMessagesRef.value) {
        aiMessagesRef.value.scrollTop = aiMessagesRef.value.scrollHeight
      }
    })
  } catch (error) {
    if (error.name === 'AbortError') {
      aiMessages.value.push({
        id: Date.now() + 1,
        role: 'assistant',
        content: '已停止当前对话。'
      })
      saveChatHistory()
      return
    }
    console.error('AI请求失败:', error)
    aiMessages.value.push({
      id: Date.now() + 1,
      role: 'assistant',
      content: `抱歉，请求失败：${error.message}`
    })
  } finally {
    aiLoading.value = false
    aiRequestController = null
  }
}

function stopAIMessage() {
  if (!aiRequestController) return
  aiRequestController.abort()
}

/**
 * @description: 下载组件 ZIP
 */
async function downloadComponent() {
  downloadLoading.value = true
  try {
    const blob = await http.download(
      isPageMode.value
        ? `/api/page-skeleton/${playgroundGroupId()}/${componentId.value}/download`
        : `/api/demo/download/${componentId.value}`,
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${componentId.value}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    message.success('下载已开始')
  } catch (err) {
    message.error('下载失败: ' + err.message)
  } finally {
    downloadLoading.value = false
  }
}

/**
 * @description: 重载所有已打开文件的内容（AI 修改后调用）
 */
async function reloadAllFiles() {
  // AI 工具写盘后立即扫描可能遇到文件系统/双 workspace 同步时序，短暂重扫一次确保新子组件出现。
  await loadComponentFiles()
  await new Promise((resolve) => window.setTimeout(resolve, 180))
  await loadComponentFiles()

  // 重新加载已打开文件的内容
  for (const file of openedFiles.value) {
    if (file.isImage || isImageFile(file.name)) {
      file.imageUrl = `${getRawFileUrl(file.path)}&_t=${Date.now()}`
      continue
    }

    try {
      const data = await http.get(`${fileApiBase()}/file`, {
        path: file.path
      })
      if (data.success) {
        file.content = data.content
        file.originalContent = data.content
        file.modified = false
      }
    } catch (err) {
      console.error('重载文件失败:', file.path, err)
    }
  }
  // 失效 Vite transform 缓存：AI 修改文件（通常发生在后端工具调用），与 demo 页手动保存
  // 走同一链路（后端 saveFileContent 已双写前后端 workspace），但不走 demo 页 saveFile，
  // 因此必须在此显式 /__invalidate，下一次预览 iframe import 才能读到新 transform。
  try {
    await fetch('/__invalidate', { method: 'GET' })
  } catch {}
}


// 加载用户信息
async function loadUserInfo() {
  try {
    const data = await http.get('/api/auth/current')

    if (data.success) {
      currentUser.value = data.data.user
      currentGroup.value = data.data.group || { name: '未分配群组' }
      currentProject.value = data.data.project || { name: '未分配项目' }
      devMode.value = data.data.devMode || false

      if (devMode.value) {
        console.log('[开发模式] 自动登录成功:', currentUser.value.username)
      }
    }
  } catch (error) {
    console.error('加载用户信息失败:', error)
    currentUser.value = { username: '未登录', displayName: '未登录' }
    currentGroup.value = { name: '未登录' }
    currentProject.value = { name: '未登录' }
  }
}

// 监听路由参数变化，切换组件时重新加载
watch(
  () => route.params.componentId,
  (newId) => {
    if (newId && newId !== componentId.value) {
      componentId.value = newId
      openedFiles.value = []
      activeCanvasTab.value = 'preview'
      loadComponentFiles()
      loadTaskStatus()
    }
  }
)
</script>

<style scoped lang="less">
/* 🎨 亮色清爽主题 */
.demo-wrapper {
  position: relative;
  display: grid;
  grid-template-rows: 1fr;
  grid-template-columns: 250px 4px 1fr 4px 380px;
  width: 100%;
  max-width: 100%;
  height: calc(100vh - 64px);
  gap: 0;
  background: var(--bg-card);
  color: var(--text-primary);
  overflow: hidden;

  > * {
    min-height: 0;
  }

  .quality-warning-banner,
  .running-draft-banner {
    position: absolute;
    z-index: 20;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    width: min(760px, calc(100% - 40px));
    min-height: 40px;
    padding: 9px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--warning-border);
    border-radius: var(--radius-sm);
    background: var(--warning-bg);
    box-shadow: var(--shadow-md);
    color: var(--text-primary);
  }

  .warning-icon {
    flex: 0 0 auto;
    width: 20px;
    height: 20px;
    border-radius: var(--radius-full);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--warning);
    color: var(--text-on-brand);
    font-size: 12px;
    font-weight: 700;
  }

  .warning-text {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    line-height: 20px;
  }

  .warning-close {
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    font-size: 20px;
    line-height: 28px;
    cursor: pointer;
  }

  /* P0: 预览失败友好错误卡片 */
  .preview-error-card {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(500px, 90%);
    background: var(--bg-card);
    border: 1px solid var(--task-failed-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    padding: 24px;
    z-index: 10;
    text-align: center;
  }

  .preview-ai-fix-overlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 20px 0;
  }

  .preview-ai-fix-spinner {
    width: 48px;
    height: 48px;
    border: 3px solid var(--border-default);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: preview-spin 1s linear infinite;
  }

  .preview-ai-fix-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .preview-ai-fix-sub {
    font-size: 13px;
    color: var(--text-secondary);
  }

  .preview-error-icon {
    color: var(--task-failed);
    margin-bottom: 12px;
  }

  .preview-error-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  .preview-error-desc {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.6;
    margin-bottom: 16px;

    strong {
      color: var(--text-primary);
      font-weight: 600;
    }
  }

  .preview-error-detail {
    background: var(--bg-code);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    padding: 12px;
    font-size: 12px;
    color: var(--task-failed-text);
    text-align: left;
    overflow-x: auto;
    max-height: 120px;
    margin-bottom: 12px;
    font-family: 'Courier New', monospace;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .preview-error-location {
    font-size: 12px;
    color: var(--text-tertiary);
    margin-bottom: 12px;
    font-family: 'Courier New', monospace;
  }

  .preview-smart-suggestion {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    background: var(--info-bg, #e6f7ff);
    border: 1px solid var(--info-border, #91d5ff);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    margin-bottom: 16px;
    text-align: left;
  }

  .suggestion-icon {
    flex: 0 0 auto;
    font-size: 16px;
  }

  .suggestion-text {
    flex: 1;
    font-size: 13px;
    color: var(--text-primary);
    line-height: 1.5;
  }

  .preview-error-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    margin-bottom: 12px;
  }

  .preview-error-btn {
    padding: 6px 14px;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text-primary);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      border-color: var(--brand);
      color: var(--brand);
    }

    &.primary {
      background: var(--brand);
      border-color: var(--brand);
      color: var(--text-on-brand);

      &:hover {
        background: var(--brand-hover);
        border-color: var(--brand-hover);
      }
    }

    &.ghost {
      background: transparent;
      border-color: var(--border-default);
      color: var(--text-secondary);

      &:hover {
        border-color: var(--text-secondary);
        color: var(--text-primary);
      }
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .preview-ai-fix-status {
    font-size: 13px;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    margin-top: 12px;

    &.info {
      background: var(--info-bg, #e6f7ff);
      color: var(--info-text, #0050b3);
    }

    &.success {
      background: var(--success-bg, #f6ffed);
      color: var(--success-text, #389e0d);
    }

    &.error {
      background: var(--task-failed-bg);
      color: var(--task-failed-text);
    }
  }

  .preview-ai-fix-retry {
    margin-left: 8px;
    padding: 2px 8px;
    border: 1px solid currentColor;
    border-radius: var(--radius-sm);
    background: transparent;
    color: inherit;
    font-size: 12px;
    cursor: pointer;

    &:hover {
      opacity: 0.8;
    }
  }

  /* P1: Figma截图降级显示 */
  .preview-fallback-screenshot {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(400px, 80%);
    text-align: center;

    img {
      width: 100%;
      height: auto;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-md);
    }

    .fallback-hint {
      margin-top: 12px;
      font-size: 13px;
      color: var(--text-secondary);
    }
  }

  @keyframes preview-spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* 分隔条 */
  .resizer {
    width: 4px;
    background: var(--border-default);
    cursor: col-resize;
    position: relative;
    transition: background 0.2s;
    user-select: none;

    &:hover,
    &.dragging {
      background: var(--brand);
    }

    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: -3px;
      right: -3px;
      bottom: 0;
    }
  }

  /* ── 左侧：文件列表（浅色侧栏） ── */
  .file-sidebar {
    background: var(--bg-sidebar);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-right: 1px solid var(--border-default);

      .file-header {
        padding: 10px 16px;
        font-weight: 600;
        font-size: 13px;
        border-bottom: 1px solid var(--border-default);
        background: var(--bg-elevated);
        color: var(--text-primary);
        display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .file-header-gear {
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--text-secondary);
      font-size: 14px;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;

      &:hover {
        background: var(--brand-soft, rgba(22, 119, 255, 0.12));
        color: var(--brand, #1677ff);
      }
    }

    .file-type-badge {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 3px 9px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.3px;
      line-height: 1.2;

      &.vue3 {
        background: var(--component-vue3);
        color: var(--component-vue3-contrast);
        border: 1px solid var(--component-vue3-strong);
      }

      &.phase2 {
        background: var(--component-microcode);
        color: var(--component-microcode-contrast);
        border: 1px solid var(--component-microcode-strong);
      }
    }

    .file-tree-container {
      flex: 1;
      overflow-y: auto;
      padding: 4px 0;

        .empty-state {
          padding: 24px;
          text-align: center;
          color: var(--text-tertiary);
          font-size: 13px;
        }

      :deep(.ant-tree) {
        background: transparent;
        color: var(--text-primary);            /* 提高默认对比度：二级字色对树标题偏暗 */
        font-size: 13px;

        /* 文件修改标记：橙色圆点前缀 */
        .ant-tree-title {
          &[data-modified="true"] {
            color: #60a5fa;
          }
        }
        line-height: 32px;

        .ant-tree-treenode {
          padding: 0;
          position: relative;
          display: flex;
          align-items: center;
          min-height: 32px;

          &:hover { background: var(--bg-hover); }

          &.ant-tree-treenode-selected::before {
            content: '';
            position: absolute;
            left: 0;
            top: 4px;
            bottom: 4px;
            width: 3px;
            background: linear-gradient(180deg, #1677ff, #4096ff);
            border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
            box-shadow: none;
          }
        }

        /* 缩进引导线 ── 整体改成"连续竖虚线 + 横向小弯折", */
        /*   让父-子层级一眼能看出。原先 rgba 0.18 几乎看不见，是看不清的根本原因。 */
        .ant-tree-indent {
          position: relative;
          height: 100%;

          &::before {
            content: '';
            position: absolute;
            left: 50%;
            top: 0;
            bottom: 0;
            border-left: 1px dashed rgba(148, 163, 184, 0.55);
          }
        }

        /* 横向小弯折：父级"└" 的水平线 + 短竖线 */
        .ant-tree-indent-unit {
          width: 22px;                     /* 18 → 22，层级关系更宽松、更易辨认 */
          position: relative;
          height: 100%;

          &::before {
            content: '';
            position: absolute;
            right: 0;
            top: 0;
            bottom: 50%;
            border-left: 1px dashed rgba(148, 163, 184, 0.55);
          }
          &::after {
            content: '';
            position: absolute;
            right: 0;
            top: 50%;
            bottom: 50%;
            width: 8px;
            border-top: 1px dashed rgba(148, 163, 184, 0.55);
          }
        }

        .ant-tree-node-content-wrapper {
          display: flex;
          align-items: center;
          padding: 0 8px;
          height: 32px;
          color: var(--text-primary);      /* 文件标题默认主色，可读性 ↑
                                          （目录 500 加粗，见下方 :has 规则） */
          border-radius: var(--radius-sm);
          transition: all 0.15s;
          min-width: 0; /* 关键：允许 flex 子项收缩，使 text-overflow 生效 */
          overflow: hidden;
          flex: 1;

          &:hover { background: transparent; color: var(--text-primary); }

          &.ant-tree-node-selected {
            background: linear-gradient(90deg, rgba(22, 119, 255, 0.22) 0%, rgba(22, 119, 255, 0.06) 100%) !important;
            color: #ffffff !important;
            box-shadow: inset 0 0 0 1px rgba(22, 119, 255, 0.35);
          }
        }

        .ant-tree-switcher {
          width: 22px;
          height: 32px;
          line-height: 32px;
          color: var(--text-secondary);    /* 展开箭头用二级字色，主次分明 */
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.15s;

          &:hover { color: #60a5fa; }

          .tree-switcher-icon {
            font-size: 15px;        /* ▾/▸ Unicode 字形偏小，同号显示不足 */
            font-weight: 700;
            line-height: 1;
            display: inline-block;
          }
        }

        .ant-tree-iconEle {
          width: 22px;
          height: 32px;
          line-height: 32px;
          margin-right: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;

          .tree-node-icon {
            font-size: 13px;
            color: var(--text-secondary);  /* 文件图标用二级字色，与文件名字色差拉大 */
            line-height: 1;
            display: inline-block;
          }
        }

        .ant-tree-title {
          color: var(--text-primary);       /* 文件名默认主色，最高可读性 */
          font-size: 13px;
          font-weight: 400;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
          min-width: 0;
          padding-right: 8px;
        }

        /* 目录节点：颜色加深 + 字号略增 + 500 字重，与文件页视觉差更清晰 */
        .ant-tree-treenode:has(.ant-tree-iconEle .tree-node-icon.icon-dir) {
          .ant-tree-title { color: var(--text-primary); font-weight: 500; font-size: 13.5px; }
        }

        /* 不同文件类型的图标配色 — 用 SVG-style 符号着色 */
        .tree-node-icon {
          &.icon-dir { color: #60a5fa; font-size: 14px; }
          &.icon-vue { color: #42b883; }
          &.icon-less { color: #1d4ed8; }
          &.icon-json { color: #c084fc; }
          &.icon-declare { color: #f59e0b; font-weight: 700; }
          &.icon-image { color: #f97316; }
          &.icon-js { color: #fbbf24; }
        }

        /* 修改标记圆点：使用真实 CSS 伪元素，大小可控 */
        .tree-title-text {
          color: inherit;
          font-size: 13px;
          display: inline-flex;
          align-items: center;

          &.is-modified::before {
            content: '';
            display: inline-block;
            width: 6px;
            height: 6px;
            background: #f59e0b;
            border-radius: var(--radius-full);
            margin-right: 7px;
            flex-shrink: 0;
          }
        }
      }

      /* 滚动条美化 */
      &::-webkit-scrollbar { width: 6px; }
      &::-webkit-scrollbar-thumb {
        background: rgba(148, 163, 184, 0.25);
        border-radius: var(--radius-xs);
      }
      &::-webkit-scrollbar-thumb:hover {
        background: rgba(148, 163, 184, 0.45);
      }
    }

    /* ── VS Code 搜索（紧凑） ── */
    .vscode-search-panel {
      flex-shrink: 0;
      background: var(--bg-elevated);

      .vscode-search-row {
        display: flex;
        align-items: center;
        padding: 3px 6px;
        gap: 2px;

        .vscode-search-icon { color: var(--text-tertiary); font-size: 13px; flex-shrink: 0; margin-right: 2px; }

        .vscode-input-wrap {
          flex: 1; min-width: 0; position: relative;

          .vscode-search-input, .vscode-replace-input {
            width: 100%; height: 24px; border: 1px solid var(--border-default,#d1d5db);
            border-radius: 3px; padding: 0 20px 0 6px; font-size: 12px;
            background: var(--bg-base,#fff); color: var(--text-primary);
            outline: none; box-sizing: border-box;
            &::placeholder { color: var(--text-tertiary); opacity: 0.55; }
            &:focus { border-color: var(--brand,#1677ff); }
          }
          .vscode-clear-btn {
            position: absolute; right: 3px; top: 50%; transform: translateY(-50%);
            width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;
            color: var(--text-tertiary); cursor: pointer; font-size: 10px; border-radius: 50%; line-height: 1;
            &:hover { background: rgba(0,0,0,0.08); color: var(--text-secondary); }
          }
        }

        .vscode-opt {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 22px; height: 22px; padding: 0 3px; border: none; border-radius: 3px;
          background: transparent; color: var(--text-tertiary); font-size: 10px;
          font-weight: 600; cursor: pointer; flex-shrink: 0; transition: all 0.1s;
          &:hover { background: rgba(0,0,0,0.06); color: var(--text-secondary); }
          &.active { background: rgba(22,119,255,0.1); color: var(#1677ff); }
          & svg { opacity: 0.7; } &.active svg { opacity: 1; }
        }

        .vscode-count-inline { font-size: 10px; color: var(--text-tertiary); flex-shrink: 0; margin-left: 4px; white-space: nowrap; }
      }

      .vscode-replace-row {
        display: flex; align-items: center; padding: 1px 6px 3px; gap: 4px;
        .vscode-replace-icon { color: var(--text-tertiary); font-size: 11px; flex-shrink: 0; margin-right: 2px; }
        .vscode-input-wrap {
          flex: 1; min-width: 0;
          .vscode-replace-input {
            width: 100%; height: 22px; border: 1px solid var(--border-default,#d1d5db);
            border-radius: 3px; padding: 0 6px; font-size: 12px;
            background: var(--bg-base,#fff); outline: none; box-sizing: border-box;
            &::placeholder { color: var(--text-tertiary); opacity: 0.55; }
            &:focus { border-color: var(--brand,#1677ff); }
          }
        }
      }
    }

    /* 文件树 */
    .file-tree-container { flex: 1; min-height: 0; overflow-y: auto; }

        /* ── 搜索结果（紧凑） ── */
    .vscode-results-panel {
      display: flex; flex-direction: column; flex: 1; min-height: 0;
      overflow-y: auto; border-top: 1px solid var(--border-default);
      background: var(--bg-elevated);

      .vscode-search-status { padding: 16px 12px; text-align: center; font-size: 11px; color: var(--text-tertiary); }

      .vscode-file-group {
        border-bottom: 1px solid var(--border-light,#f0f0f0);

        .vscode-file-header {
          display: flex; align-items: center; gap: 3px; padding: 2px 6px;
          cursor: pointer; user-select: none; font-size: 11px; transition: background 0.08s;
          &:hover { background: var(--bg-hover,rgba(0,0,0,0.04)); }
          &.collapsed { .vscode-collapse-icon { opacity: 0.5; } }

          .vscode-collapse-icon { font-size: 9px; color: var(--text-tertiary); width: 12px; flex-shrink: 0; line-height: 1; }
          .vscode-file-icon {
            display: inline-flex; align-items: center; justify-content: center;
            width: 14px; height: 14px; border-radius: 2px; font-size: 8px;
            font-weight: 700; flex-shrink: 0; letter-spacing: -0.3px;
            &.ext-vue{background:#41b883;color:#fff} &.ext-html{background:#e44d26;color:#fff}
            &.ext-js,&.ext-ts,&.ext-jsx,&.ext-tsx{background:#f7df1e;color:#333}
            &.ext-css,&.ext-less,&.ext-scss{background:#264de4;color:#fff}
            &.ext-json{background:#f5a623;color:#fff} &.ext-md{background:#519aba;color:#fff}
          }
          .vscode-file-name {
            font-weight: 600; color: var(--text-secondary); white-space: nowrap;
            overflow: hidden; text-overflow: ellipsis; max-width: 120px; cursor: pointer;
            &:hover { color: #1677ff; }
          }
          .vscode-match-count {
            background: rgba(22,119,255,0.1); color: #1677ff; font-size: 9px;
            font-weight: 700; padding: 0 4px; border-radius: 8px; flex-shrink: 0;
            min-width: 14px; text-align: center;
          }
          .vscode-replace-file-btn {
            font-size: 9px; color: #1677ff; background: none; border: 1px solid #1677ff;
            border-radius: 2px; padding: 0 4px; cursor: pointer; flex-shrink: 0;
            opacity: 0; margin-left: auto; transition: opacity 0.1s;
            .vscode-file-header:hover & { opacity: 1; } &:hover { background: #1677ff; color: #fff; }
          }
          .vscode-ignore-btn {
            font-size: 10px; color: var(--text-tertiary); background: none; border: none;
            cursor: pointer; padding: 0 2px; line-height: 1; flex-shrink: 0;
            opacity: 0; transition: all 0.1s;
            .vscode-file-header:hover & { opacity: 1; } &:hover { color: #e74c3c; }
          }
        }

        .vscode-match-list {
          .vscode-match-item {
            display: flex; align-items: center; gap: 4px; padding: 1px 6px 1px 22px;
            cursor: pointer; font-size: 11px; line-height: 1.45; transition: background 0.06s;
            &:hover { background: rgba(0,0,0,0.03); }
            .vscode-line-num {
              color: #aaa; flex-shrink: 0; font-size: 10px;
              user-select: none; min-width: 24px; text-align: right;
              font-variant-numeric: tabular-nums;
            }
            .vscode-match-text {
              color: var(--text-primary); overflow: hidden; text-overflow: ellipsis;
              white-space: nowrap; flex: 1; min-width: 0;
              :deep(.search-highlight) { background:#ffdd33;color:inherit;border-radius:1px;padding:0 1px; }
            }
          }
        }
      }

      .vscode-results-footer {
        display: flex; justify-content: flex-end; padding: 4px 8px;
        border-top: 1px solid var(--border-light);
        .vscode-replace-all-btn {
          font-size: 11px; color: #fff; background: #1677ff; border: none;
          border-radius: 3px; padding: 3px 10px; cursor: pointer; font-weight: 600;
          &:hover { opacity: 0.88; }
        }
      }

      &::-webkit-scrollbar { width: 4px; }
      &::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.2); border-radius: 2px; }
    }    }
  }

  /* ── 中间：画布+配置 ── */
  .main-content {
    display: grid;
    grid-template-rows: 1fr auto 1fr; /* 上画布 + 中分隔条 + 下配置（高度由内联 style 覆盖） */
    gap: 0;
    background: var(--bg-card);
    overflow: hidden; /* 关键：约束在 demo-wrapper 高度内，不让子项撑破 */
    min-height: 0;   /* 关键：grid 子项允许收缩 */

    .canvas-area {
      background: var(--bg-alt);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-height: 0; /* 关键：grid 子项允许收缩到小于内容高度 */

      /* 分屏行容器：主编辑器 + 可选侧边编辑器 */
      .editor-split-row {
        flex: 1;
        min-height: 0;
        display: flex;
        overflow: hidden;
      }

      .editor-pane-main {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .editor-pane-side {
        width: 50%;
        min-width: 200px;
        border-left: 1px solid var(--border-light);
        display: flex;
        flex-direction: column;
        overflow: hidden;

        .side-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 4px 8px;
          background: var(--bg-card);
          border-bottom: 1px solid var(--border-light);
          flex-shrink: 0;
          font-size: 12px;

          .side-file-path {
            color: var(--text-secondary);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .side-btn {
            background: none;
            border: none;
            color: var(--text-tertiary);
            cursor: pointer;
            font-size: 14px;
            padding: 2px 6px;
            &:hover { color: var(--text-primary); }
          }
        }

        .side-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-tertiary);
          font-size: 13px;
          flex: 1;
        }
      }

      :deep(.ant-tabs) {
        height: 100%;
        display: flex;
        flex-direction: column;
        min-height: 0;

        .ant-tabs-nav {
          background: var(--bg-card);
          margin: 0;
          padding: 0 12px;
          &::before { border-bottom: 1px solid var(--border-light); }
        }

        .ant-tabs-tab {
          background: transparent;
          border: none;
          color: var(--text-tertiary);
          padding: 10px 16px;
          margin: 0 2px 0 0;
          font-size: 13px;
          transition: all 0.2s;

          &:hover { color: var(--brand); }

          &.ant-tabs-tab-active {
            color: var(--brand);
            background: transparent;
            border-bottom: 2px solid var(--brand);

            .ant-tabs-tab-btn { color: var(--brand); }
          }
        }

        .ant-tabs-content-holder {
          flex: 1;
          overflow: hidden;
          background: var(--bg-alt);
          min-height: 0; /* 关键：flex 子项允许收缩 */
          display: flex;
          flex-direction: column;
          .ant-tabs-content{
            height: 100%;
          }
        }

        .ant-tabs-nav-add { display: none !important; }
      }

      :deep(.ant-tabs-tab-remove) { color: var(--text-tertiary); &:hover { color: var(--error); } }

      /* 画布顶部全局工具栏（组件信息 + 推送/下载，所有标签页共享） */
      .canvas-toolbar {
        flex-shrink: 0;
        padding: 8px 16px;
        background: var(--bg-card);
        border-bottom: 1px solid var(--border-light);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      /* 组件信息区（左侧） */
      .canvas-info {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-shrink: 0;

        .info-item {
          font-size: 12px;
          color: var(--text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 200px;

          &.component-name {
            font-weight: 600;
            color: var(--text-primary);
            font-size: 13px;
          }

          &.task-id {
            color: var(--text-tertiary);
            font-family: monospace;
          }

          &.component-id {
            color: var(--text-tertiary);
            font-family: monospace;
            font-size: 11px;
          }
        }
      }

      /* 预览控制工具栏 */
      .preview-controls {
        padding: 8px 16px;
        background: var(--bg-card);
        border-bottom: 1px solid var(--border-light);
        display: flex;
        align-items: center;
        justify-content: center;

        .control-label { font-size: 12px; color: var(--text-secondary); }

        .fit-btn {
          padding: 2px 10px;
          font-size: 12px;
          font-weight: 600;
          color: #fff;
          background: #1890ff;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: opacity 0.15s;
          line-height: 1.6;
        }
        .fit-btn:hover { opacity: 0.85; }

        :deep(.ant-select) {
          .ant-select-selector,
          .ant-select-selection-search-input {
            height: 30px !important;
            font-size: 12px;
          }
        }
      }

      /* 预览容器 —— 默认居中，留 padding 给"画框"视觉 */
      .preview-wrapper {
        flex: 1;
        overflow: hidden; /* 去掉滚动条，画布通过 scale 自适应 */
        background: var(--bg-alt);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }

      .preview-box {
        background: var(--bg-card);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        box-shadow: 0 2px 8px var(--shadow-sm);
        /* 去掉 overflow 避免双滚动条（wrapper 已负责滚动） */
        /* 去掉 min-height 避免强制撑高破坏 Figma 原始比例 */
        position: relative;

        > div { max-width: 100%; }
      }

      /* 拖拽调整手柄 */
      .resize-handle {
        position: absolute;
        z-index: 10;
        transition: background-color 0.2s;

        &:hover {
          background-color: var(--primary-color, #1890ff);
          opacity: 0.3;
        }
      }

      .resize-handle-right {
        top: 0;
        right: -4px;
        width: 8px;
        height: 100%;
        cursor: ew-resize;
      }

      .resize-handle-bottom {
        bottom: -4px;
        left: 0;
        width: 100%;
        height: 8px;
        cursor: ns-resize;
      }

      .resize-handle-corner {
        bottom: -4px;
        right: -4px;
        width: 12px;
        height: 12px;
        cursor: nwse-resize;
        background: linear-gradient(135deg, transparent 50%, var(--border-default, #d9d9d9) 50%);
        
        &:hover {
          background: linear-gradient(135deg, transparent 50%, var(--primary-color, #1890ff) 50%);
          opacity: 0.5;
        }
      }

      /* 预览 iframe：加载独立预览页，sandbox 隔离错误 */
      .preview-iframe {
        width: 100%;
        height: 100%;
        border: 0;
        display: block;
        background: #fff;
      }

      .preview-artifact-blocked {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 24px;
        text-align: center;
        color: var(--text-secondary);
        background: var(--bg-card);

        strong {
          color: var(--text-primary);
          font-size: 15px;
        }

        span {
          max-width: 420px;
          font-size: 13px;
          line-height: 1.6;
        }
      }

      /* 代码编辑器 */
      .code-editor {
        padding: 0;
        flex: 1;
        min-height: 0; /* 关键：允许在 flex 容器中收缩 */
        display: flex;
        flex-direction: column;
        overflow: hidden;
        height: 100%;

        .editor-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 16px;
          background: var(--bg-hover);
          border-bottom: 1px solid var(--border-light);

          .file-path {
            font-size: 12px;
            color: var(--text-tertiary);
            font-family: 'SF Mono', 'Consolas', monospace;
          }

          .editor-actions { display: flex; gap: 8px; }

          .editor-btn {
            padding: 4px 12px;
            font-size: 12px;
            background: var(--bg-card);
            color: var(--text-secondary);
            border: 1px solid var(--border-strong);
            border-radius: var(--radius-xs);
            cursor: pointer;
            transition: all 0.15s;
            display: flex;
            align-items: center;
            gap: 4px;

            &:hover:not(.disabled) {
              border-color: var(--brand);
              color: var(--brand);
            }

            &:active:not(.disabled) { background: var(--bg-alt); }

            &.disabled { opacity: 0.45; cursor: not-allowed; }

            &.save-btn:not(.disabled) {
              background: var(--brand);
              border-color: var(--brand);
              color: var(--text-inverse);
              &:hover { background: var(--brand-light); border-color: var(--brand-light); }
            }
          }
        }

        :deep(.ant-textarea) {
          flex: 1;
          border: none;
          resize: none;

          textarea {
            font-family: 'SF Mono', 'Consolas', monospace;
            font-size: 13px;
            line-height: 1.6;
            background: var(--bg-card);
            color: var(--text-primary);
          }
        }
      }

      /* 图片预览 */
      .image-preview {
        padding: 0;
        height: 100%;
        display: flex;
        flex-direction: column;
        background: var(--bg-alt);

        .editor-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 16px;
          background: var(--bg-hover);
          border-bottom: 1px solid var(--border-light);

          .file-path {
            font-size: 12px;
            color: var(--text-tertiary);
            font-family: 'SF Mono', 'Consolas', monospace;
          }
        }

        .image-container {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          overflow: auto;

          img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            border: 1px solid var(--border-default);
            border-radius: var(--radius-md);
            background: white;
          }
        }
      }
    }

    /* ── 水平拖拽分隔条（画布/配置 之间）── */
    .resizer-horizontal {
      height: 4px;
      width: 100%;
      background: var(--border-default);
      cursor: row-resize;
      position: relative;
      transition: background 0.2s;
      user-select: none;
      flex-shrink: 0;

      &:hover,
      &.dragging {
        background: var(--brand);
      }

      &::before {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        top: -3px;
        bottom: -3px;
      }
    }

    /* ── 底部配置面板（微码组件常驻可折叠）── */
    .config-area {
      background: var(--bg-card);
      border-top: none; /* 上方已有水平分隔条 */
      font-size: 12px;
      color: var(--text-primary);
      display: flex;
      flex-direction: column;
      /* 高度由 grid 行内联 style 控制（configAreaHeight），不再用 max-height */
      flex: 0 0 auto;
      min-height: 36px; /* 折叠时只显示切换条 */
      overflow: hidden;

      &.config-collapsed {
        max-height: 36px;
      }

      .config-toggle-bar {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 36px;
        padding: 0 14px;
        background: var(--bg-hover);
        border-bottom: 1px solid var(--border-light);
        cursor: pointer;
        user-select: none;

        &:hover {
          background: var(--brand-bg);
        }

        .config-toggle-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .config-toggle-icon {
          font-size: 10px;
          color: var(--text-tertiary);
          transition: transform 0.2s;
        }
      }

      .config-body {
        flex: 1;
        overflow: auto;
        min-height: 0;
      }

      .config-box {
        padding: 18px 20px 20px;
        background: var(--bg-card);
        width: 100%;
        box-sizing: border-box;

        /* 声明文件设置：declare-editor 撑满 */
        :deep(.json-editor),
        :deep(.declare-editor-form) {
          width: 100%;
        }

        :deep(.style-config-form) {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px 28px;
          align-items: stretch;
        }

        :deep(.ant-divider) {
          grid-column: 1 / -1;
          margin: 2px 0 4px;
        }
      }

      :deep(.style-config-form .ant-form-item) {
        margin-bottom: 0;
        min-height: 112px;
        padding: 18px 18px 16px;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        background: var(--bg-alt);
        border: 1px solid var(--border-light);
        border-radius: var(--radius-lg);
      }

      :deep(.style-config-form .ant-form-item-row),
      :deep(.style-config-form .ant-form-item-control),
      :deep(.style-config-form .ant-form-item-control-input),
      :deep(.style-config-form .ant-form-item-control-input-content) {
        width: 100%;
      }

      :deep(.style-config-form .ant-form-item-label) {
        padding-bottom: 10px;
        font-size: 13px;
        color: var(--text-secondary);

        > label {
          color: var(--text-secondary);
          font-size: 13px;
          height: auto;
        }
      }

      :deep(.style-config-form .ant-form-item-control-input) {
        min-height: 44px;
      }

      :deep(.ant-input),
      :deep(.ant-select-selector),
      :deep(.ant-input-number),
      :deep(.ant-input-number-input) {
        font-size: 13px;
        height: 40px;
        line-height: 38px;
        background: var(--bg-card);
        border-color: var(--border-strong);
        color: var(--text-primary);
        border-radius: var(--radius-md);

        &:hover { border-color: var(--brand); }
        &:focus,
        &.ant-input-focused { border-color: var(--brand); box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.1); }
      }

      :deep(.ant-select-selection-item) { line-height: 38px !important; color: var(--text-primary); }

      :deep(.style-config-form .ant-select),
      :deep(.style-config-form .ant-input-number),
      :deep(.style-config-form .ant-input-number-group-wrapper),
      :deep(.style-config-form .mc-color-picker) {
        width: 100%;
      }

      :deep(.ant-btn) {
        font-size: 12px;
        height: 32px;
        padding: 0 15px;
        border-radius: var(--radius-sm);
        background: var(--bg-card);
        border-color: var(--border-strong);
        color: var(--text-secondary);

        &:hover { color: var(--brand); border-color: var(--brand); }

        &.ant-btn-primary {
          background: var(--brand);
          border-color: var(--brand);
          color: var(--text-inverse);
          &:hover { background: var(--brand-light); border-color: var(--brand-light); }
        }

        &.ant-btn-dangerous {
          background: var(--bg-card);
          border-color: var(--error-border);
          color: var(--error);
          &:hover { background: var(--error-bg); border-color: var(--error); }
        }
      }

      :deep(.ant-divider) {
        margin: 12px 0;
        border-color: var(--border-light);
        font-size: 12px;

        .ant-divider-inner-text { color: var(--text-tertiary); }
      }

      @media (max-width: 1360px) {
        .config-box {
          :deep(.style-config-form) {
            grid-template-columns: 1fr;
          }
        }
      }

      :deep(.ant-tabs-tab) {
        padding: 8px 16px;
        font-size: 13px;
        color: var(--text-tertiary);
        background: transparent;
        border: none;

        &:hover { color: var(--brand); }

        &.ant-tabs-tab-active {
          color: var(--brand);
          background: transparent;
          border-bottom: 2px solid var(--brand);
        }
      }

      :deep(.ant-tabs-nav) {
        background: var(--bg-card);
        border-bottom: 1px solid var(--border-light);
        margin-bottom: 0;
        padding: 0 12px;
      }

      :deep(.ant-tabs-ink-bar) { display: none; }

      :deep(.ant-input-number-group-addon) {
        background: var(--bg-hover);
        border-color: var(--border-strong);
        color: var(--text-secondary);
        font-size: 12px;
      }

      :deep(.ant-space) { gap: 8px !important; }

      :deep(.ant-color-picker-trigger) { width: 32px; height: 32px; border-radius: var(--radius-sm); }
    }
  }

  /* ── 右侧：AI 助手（浅色侧栏） ── */
  .ai-sidebar {
    background: var(--bg-sidebar);
    display: grid;
    grid-template-rows: 1fr auto;
    gap: 0;
    overflow: hidden;
    border-left: 1px solid var(--border-default);

    .ai-output-area {
      display: flex;
      flex-direction: column;
      overflow: hidden;

      .ai-header {
        padding: 14px 16px;
        font-weight: 600;
        font-size: 14px;
        border-bottom: 1px solid var(--border-default);
        background: var(--bg-elevated);
        color: var(--text-primary);
      }

        .ai-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          background: var(--bg-sidebar);

        .ai-message {
          margin-bottom: 14px;
          padding: 12px 14px;
          border-radius: var(--radius-md);
          font-size: 13px;
          line-height: 1.7;

          &.user {
            background: var(--brand-bg);
            margin-left: 16px;
            color: var(--brand-text);
            border: 1px solid var(--brand-border);
          }

          &.assistant {
            background: var(--bg-alt);
            margin-right: 16px;
            color: var(--text-primary);
            border: 1px solid var(--border-default);
          }

          .message-content {
            word-wrap: break-word;
            line-height: 1.6;

            p { margin-bottom: 6px; }

            code {
              background: var(--bg-alt);
              padding: 2px 6px;
              border-radius: var(--radius-xs);
              font-family: 'SF Mono', 'Consolas', monospace;
              font-size: 12px;
              color: var(--text-brand);
            }

            .ai-code-block {
              overflow: hidden;
              margin: 10px 0;
              border: 1px solid var(--border-default);
              border-radius: var(--radius-md);
              background: var(--bg-alt);
            }

            .code-block-header {
              padding: 7px 12px;
              border-bottom: 1px solid var(--border-default);
              background: var(--bg-hover);
              color: var(--text-secondary);
              font-size: 12px;
              line-height: 1.4;
            }

            pre {
              margin: 0;
              padding: 12px;
              overflow-x: auto;
              white-space: pre;

              code {
                background: none;
                padding: 0;
                color: var(--text-primary);
                white-space: inherit;
              }
            }

            .message-attachments-summary {
              margin-top: 6px;
              color: var(--text-brand);
              font-size: 12px;
            }
          }
        }
      }
    }

    .ai-input-area {
      padding: 14px 16px;
      border-top: 1px solid var(--border-default);
      background: var(--bg-sidebar);
      overflow: hidden;
      width: 100%;
      box-sizing: border-box;
      min-width: 0; /* flex 子项关键：允许收缩到小于内容宽度 */

        .version-toolbar {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
          padding: 8px 12px;
          background: var(--bg-alt);
          border-radius: var(--radius-sm);
          flex-wrap: wrap;

        .mod-count {
          margin-left: auto;
          font-size: 12px;
          color: var(--warning);
          white-space: nowrap;
        }
      }

      .model-selector { margin-bottom: 10px; }

      .ai-mode-switches {
        margin-bottom: 10px;
        padding: 8px 12px;
        background: var(--bg-alt);
        border-radius: var(--radius-md);
        border: 1px solid var(--border-default);

        .switch-label { font-size: 12px; color: var(--text-tertiary); }
      }

      .file-selector-section {
        margin-bottom: 10px;
        background: var(--bg-alt);
        border-radius: var(--radius-md);
        border: 1px solid var(--border-default);

        .file-selector-header {
          padding: 8px 12px;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          color: var(--text-secondary);
          transition: background 0.15s;

          &:hover { background: var(--bg-hover); }

          .toggle-icon {
            font-size: 10px;
            color: var(--text-tertiary);
            transition: transform 0.15s;
            display: inline-block;

            &.expanded { transform: rotate(90deg); }
          }
        }

        .file-selector-list {
          padding: 8px 12px;
          border-top: 1px solid var(--border-default);
          max-height: 140px;
          overflow-y: auto;

          .file-selector-actions {
            display: flex;
            gap: 4px;
            margin-bottom: 4px;
            padding-bottom: 4px;
            border-bottom: 1px solid var(--border-light);

            :deep(.ant-btn-link) {
              padding: 0 4px;
              font-size: 11px;
              height: auto;
            }
          }

          .file-selector-item {
            padding: 4px 0;
            font-size: 12px;

            .file-icon { margin-right: 6px; }
            .file-name { color: var(--text-secondary); }
          }
        }
      }

      .chat-attachments {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 10px;
      }

      .chat-attachment {
        position: relative;
        display: grid;
        grid-template-columns: 52px 1fr auto;
        align-items: center;
        gap: 10px;
        padding: 8px;
        background: var(--bg-alt);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        min-width: 0;

        img {
          width: 52px;
          height: 40px;
          object-fit: cover;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-default);
          background: var(--bg-alt);
        }

        .attachment-meta {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .attachment-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--text-secondary);
          font-size: 12px;
        }

        .attachment-size {
          color: var(--text-tertiary);
          font-size: 11px;
        }

        .attachment-remove {
          width: 24px;
          height: 24px;
          border: 0;
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          background: transparent;
          cursor: pointer;
          line-height: 1;

          &:hover {
            color: #fff;
            background: rgba(239, 68, 68, 0.28);
          }
        }
      }

      /* ant-design-vue textarea 多层嵌套：affix-wrapper > textarea，全部约束 */
      :deep(.ant-input),
      :deep(.textarea-affix-wrapper),
      :deep(.ant-input-textarea-wrapper) {
        width: 100% !important;
        max-width: 100%;
        box-sizing: border-box;
      }

      :deep(textarea) {
        width: 100% !important;
        max-width: 100%;
        box-sizing: border-box;
        min-width: 0;
      }

      :deep(.ant-btn) {
        margin-top: 8px;
        border-radius: var(--radius-md);
        height: 38px;
      }

      :deep(.ant-btn-primary) {
        background: var(--brand) !important;
        border-color: var(--brand) !important;
        color: var(--text-inverse) !important;
        font-weight: 500;
        border-radius: var(--radius-md);
        height: 38px;

        &:hover:not(:disabled) { background: var(--brand-light) !important; border-color: var(--brand-light) !important; }

        &:disabled {
          background: var(--button-disabled-bg) !important;
          border-color: var(--button-disabled-border) !important;
          color: var(--button-disabled-text) !important;
        }
      }
    }
  }

/* ── Vue3 组件模式：画布区独占全高，代码/预览拉伸填充 ── */
.demo-wrapper.vue3-mode {
  .main-content {
    /* 无配置面板，画布占满全部高度 */
    grid-template-rows: 1fr;

    .canvas-area {
      /* 分屏容器同样需要 flex 撑满 */
      .editor-split-row {
        flex: 1;
        min-height: 0;
        display: flex;
        overflow: hidden;
      }

      .editor-pane-main {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      /* tabs 内容撑满（ant-tabs 内容链需要每层都 flex/stretch） */
      :deep(.ant-tabs) {
        height: 100%;
        .ant-tabs-content-holder {
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .ant-tabs-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .ant-tabs-tabpane {
          flex: 1;
          display: flex;
          flex-direction: column;
          height: 0; /* 关键：让 flex:1 在嵌套 flex 中正确收缩 */
        }
      }

      /* 预览容器：拉伸填满，无内边距浪费空间 */
      .preview-wrapper {
        align-items: stretch;
        justify-content: stretch;
        padding: 0;
        overflow: hidden;

        .preview-box {
          width: 100%;
          height: 100%;
          border: none;
          border-radius: 0;
          box-shadow: none;
          overflow: hidden;
        }
      }

      /* 代码编辑器 tab 内容也撑满 */
      .code-editor {
        flex: 1;
        min-height: 0;
      }
    }
  }
}

/* 响应式 */
@media (max-width: 1024px) {
  .demo-wrapper {
    grid-template-columns: 200px 4px 1fr 4px 300px;
  }
}

/* ===== Playground IDE 体验增强：右键菜单 / Tab 右键 / 搜索范围 ===== */
.pg-tab-label {
  display: inline-block;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: none;
}

.pg-context-menu {
  position: fixed;
  z-index: 2000;
  min-width: 180px;
  padding: 4px;
  background: var(--bg-elevated, #252526);
  border: 1px solid var(--border-color, #3c3c3c);
  border-radius: 6px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
  font-size: 12px;
  color: var(--text-primary, #e6e6e6);
  user-select: none;
}

.pg-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 28px;
  padding: 0 10px;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
}

.pg-menu-item:hover {
  background: var(--brand, #1677ff);
  color: #fff;
}

.pg-menu-item.is-divider {
  height: 1px;
  padding: 0;
  margin: 4px 6px;
  background: var(--border-color, #3c3c3c);
  cursor: default;
  pointer-events: none;
}

.pg-menu-item.is-divider:hover {
  background: var(--border-color, #3c3c3c);
}

.pg-menu-item.is-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pg-menu-item.is-disabled:hover {
  background: transparent;
  color: var(--text-primary, #e6e6e6);
}

.pg-menu-item.is-danger {
  color: #ff7875;
}

.pg-menu-item.is-danger:hover {
  background: #cf1322;
  color: #fff;
}

.pg-menu-danger-mark {
  margin-left: 12px;
  font-size: 11px;
}

.search-scope-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 6px 2px;
  padding: 2px 6px;
  font-size: 11px;
  color: var(--text-secondary, #9aa0a6);
  background: rgba(22, 119, 255, 0.1);
  border: 1px solid rgba(22, 119, 255, 0.35);
  border-radius: 4px;
}

.search-scope-chip .scope-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary, #e6e6e6);
}

.search-scope-chip .scope-clear {
  border: none;
  background: transparent;
  color: var(--text-secondary, #9aa0a6);
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 0 2px;
}

.search-scope-chip .scope-clear:hover {
  color: #fff;
}

/* 设置 / 快捷键面板 */
.pg-settings {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.pg-settings-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pg-settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pg-settings-label {
  font-size: 13px;
  color: var(--text-primary, #1f2329);
  font-weight: 500;
}
.pg-settings-hint {
  font-size: 12px;
  color: var(--text-secondary, #9aa0a6);
  line-height: 1.5;
}
.pg-settings-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #9aa0a6);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 2px;
}
.pg-shortcut-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
  border-bottom: 1px dashed var(--border-default, #e8eaed);
}
.pg-shortcut-row:last-child {
  border-bottom: none;
}
.pg-kbd {
  flex-shrink: 0;
  min-width: 130px;
  display: inline-block;
  padding: 3px 10px;
  text-align: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  /* 深色/浅色双主题兼容：用半透明底 + 边框确保可见 */
  color: var(--text-primary);
  background: var(--bg-elevated, rgba(255,255,255,0.08));
  border: 1px solid var(--border-default, rgba(255,255,255,0.15));
  border-bottom-width: 2px;
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.08);
}
.pg-shortcut-desc {
  font-size: 13px;
  color: var(--text-primary, #1f2329);
}
</style>
