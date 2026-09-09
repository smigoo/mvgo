<template>
  <div class="editor-page">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <select v-model="currentWorkflowName" class="workflow-select" @change="loadSelectedWorkflow">
          <option value="__new__" disabled>-- 选择工作流 --</option>
          <option v-for="w in workflowList" :key="w.name" :value="w.name">
            {{ w.label }} ({{ w.nodeCount }}节点){{ w.isOriginal ? ' ★' : '' }}
          </option>
        </select>
        <button class="btn btn-new" :class="{ active: isNewWorkflow }" @click="newWorkflow">
          + 新建
        </button>
        <div class="original-pipeline-group">
          <button class="btn btn-original" @click="loadOriginalTopology('phase2')">
            组件管线
          </button>
          <button class="btn btn-original" @click="loadOriginalTopology('vue3')">
            Vue3 管线
          </button>
          <button class="btn btn-original btn-original-page" @click="loadOriginalTopology('page-generation')">
            页面管线
          </button>
          <button class="btn btn-original btn-original-api" @click="loadOriginalTopology('apifox-generation')">
            接口管线
          </button>
        </div>
      </div>
      <div class="toolbar-right">
        <!-- ＋ 新建（合并：新建节点 / 配方库 / 存为配方） -->
        <div class="toolbar-dropdown">
          <button class="btn btn-builder" @click="builderMenuOpen = !builderMenuOpen" title="新建节点 / 从配方库创建 / 存为配方">
            ＋ 新建
          </button>
          <div v-if="builderMenuOpen" class="toolbar-menu" @mouseleave="builderMenuOpen = false">
            <div class="toolbar-menu-item" @click="openAgentBuilder">＋ 新建节点（工具 / AI）</div>
            <div class="toolbar-menu-item" @click="openRecipeLibrary">📦 配方库（内置 / 已存模板）</div>
            <div class="toolbar-menu-item" :class="{ 'is-disabled': !elements.length }" @click="openSaveRecipe">💾 存为配方（当前画布 → 模板）</div>
          </div>
        </div>
        <button class="btn btn-run" @click="openRunDialog" :disabled="!currentWorkflowName || isNewWorkflow">▶ 运行</button>
        <button class="btn btn-save" @click="saveCurrentWorkflow" :disabled="!workflowLabel">
          {{ isOriginal ? '另存为' : '保存' }}
        </button>
        <button class="btn btn-delete" @click="deleteCurrentWorkflow" :disabled="!currentWorkflowName || isNewWorkflow || isOriginal" :title="isOriginal ? '原始管线不可删除' : ''">
          删除
        </button>
      </div>
    </div>

    <!-- 配方库弹窗 -->
    <div v-if="recipeVisible" class="builder-overlay" @click.self="recipeVisible = false">
      <div class="builder-dialog recipe-dialog">
        <div class="builder-header">
          <span class="builder-title">📦 场景配方库</span>
          <span class="builder-close" @click="recipeVisible = false">×</span>
        </div>
        <div class="builder-body">
          <div class="builder-row">
            <input v-model="recipeSearch" class="builder-input" placeholder="搜索配方…（按名称/标签/场景）" />
          </div>
          <div class="recipe-list">
            <div v-for="r in filteredRecipes" :key="r.name" class="recipe-item">
              <div class="recipe-item-head">
                <span class="recipe-item-label">{{ r.label }}</span>
                <span class="recipe-tag" :class="r.source === 'builtin' ? 'tag-builtin' : 'tag-user'">
                  {{ r.source === 'builtin' ? '内置' : '我的' }}
                </span>
                <span class="recipe-tag tag-scenario">{{ r.scenario }}</span>
                <span class="recipe-node-count">{{ r.nodeCount }} 节点</span>
              </div>
              <div class="recipe-item-desc">{{ r.description }}</div>
              <div class="recipe-item-actions">
                <button class="btn btn-save" @click="useRecipe(r.name)" :disabled="recipeUsing === r.name">
                  {{ recipeUsing === r.name ? '加载中…' : '使用 → 加载到画布' }}
                </button>
                <button v-if="r.source !== 'builtin'" class="btn btn-delete" @click="removeUserRecipe(r.name)">删除</button>
              </div>
            </div>
            <div v-if="!filteredRecipes.length" class="recipe-empty">没有匹配的配方</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 存为配方弹窗 -->
    <div v-if="saveRecipeVisible" class="builder-overlay" @click.self="saveRecipeVisible = false">
      <div class="builder-dialog">
        <div class="builder-header">
          <span class="builder-title">💾 存为配方（另存为模板）</span>
          <span class="builder-close" @click="saveRecipeVisible = false">×</span>
        </div>
        <div class="builder-body">
          <div class="builder-row">
            <label class="builder-label">配方标识 name（小写字母开头）</label>
            <input v-model="recipeForm.name" class="builder-input" placeholder="competitor-analysis" />
          </div>
          <div class="builder-row">
            <label class="builder-label">显示名称</label>
            <input v-model="recipeForm.label" class="builder-input" placeholder="竞品分析智能体" />
          </div>
          <div class="builder-row">
            <label class="builder-label">场景分类</label>
            <input v-model="recipeForm.scenario" class="builder-input" placeholder="竞品分析 / 数据报表 / 组件生成…" />
          </div>
          <div class="builder-row">
            <label class="builder-label">描述（给复用者看）</label>
            <input v-model="recipeForm.description" class="builder-input" placeholder="输入什么 → 输出什么 → 怎么用" />
          </div>
          <div v-if="recipeError" class="builder-error">{{ recipeError }}</div>
          <div class="builder-footer-inline">
            <button class="btn btn-delete" @click="saveRecipeVisible = false">取消</button>
            <button class="btn btn-save" @click="submitSaveRecipe" :disabled="recipeSaving">
              {{ recipeSaving ? '保存中…' : '保存到配方库' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 新建节点弹窗（Agent Builder · 三步向导） -->
    <div v-if="builderVisible" class="builder-overlay" @click.self="closeAgentBuilder">
      <div class="builder-dialog builder-dialog-wizard">
        <div class="builder-header">
          <span class="builder-title">＋ 新建节点</span>
          <div class="wizard-steps">
            <span :class="{ 'is-active': builderStep === 1, 'is-done': builderStep > 1 }">① 选模板</span>
            <span :class="{ 'is-active': builderStep === 2, 'is-done': builderStep > 2 }">② 配置</span>
            <span :class="{ 'is-active': builderStep === 3 }">③ 试跑</span>
          </div>
          <span class="builder-close" @click="closeAgentBuilder">×</span>
        </div>
        <div class="builder-body">

          <!-- STEP 1：选模板（卡片网格，搜索过滤） -->
          <div v-if="builderStep === 1" class="wizard-step-body">
            <div class="builder-row">
              <input v-model="templateSearch" class="builder-input" placeholder="搜索：解析 / 请求 / AI 分析 / 校验 / 抓取…" />
            </div>
            <div class="tpl-grid">
              <div
                v-for="t in filteredTemplates"
                :key="t.id"
                class="tpl-card"
                :class="{ 'is-selected': builderForm.templateId === t.id }"
                @click="selectTemplate(t)"
              >
                <div class="tpl-card-head">
                  <span class="tpl-card-name">{{ t.label }}</span>
                  <span class="tpl-card-badge" :class="isLlmTemplate(t) ? 'badge-ai' : 'badge-tool'">
                    {{ isLlmTemplate(t) ? 'AI' : '工具' }}
                  </span>
                </div>
                <div class="tpl-card-desc">{{ t.description }}</div>
              </div>
            </div>
            <div v-if="filteredTemplates.length === 0" class="tpl-empty">
              <div class="tpl-empty-title">🔍 没找到「{{ templateSearch }}」相关的模板</div>
              <div class="tpl-empty-actions">
                <button class="btn btn-save" @click="useAiAnalyzer">① 用 AI 通用分析（描述需求，AI 来做）</button>
                <button class="btn btn-save" @click="openRecipeLibrary">② 从配方库找现成组合</button>
              </div>
              <div class="tpl-empty-feedback">
                <input v-model="feedbackText" class="builder-input" placeholder="③ 我想要的能力：例如「解析 Excel 表格」「OCR 识别图片文字」…" @keyup.enter="submitFeedback" />
                <button class="btn btn-builder" @click="submitFeedback" :disabled="feedbackSending || !feedbackText.trim()">
                  {{ feedbackSending ? '提交中…' : '反馈，帮我们加模板' }}
                </button>
              </div>
              <div v-if="feedbackDone" class="tpl-empty-done">✅ 已收到，我们会评估并补充模板，感谢反馈！</div>
            </div>
          </div>

          <!-- STEP 2：配置（自动生成表单，只显示该模板需要的） -->
          <div v-if="builderStep === 2" class="wizard-step-body">
            <div class="builder-row">
              <label class="builder-label">显示名称</label>
              <input v-model="builderForm.label" class="builder-input" placeholder="这个节点叫什么" />
            </div>

            <div class="builder-row">
              <label class="builder-label">输入字段（上游传给它的数据）</label>
              <div v-for="(f, idx) in inputFields" :key="idx" class="field-row">
                <input v-model="f.key" class="builder-input field-key" placeholder="字段名（如 figmaUrl）" />
                <select v-model="f.type" class="builder-input field-type">
                  <option value="string">string</option>
                  <option value="object">object</option>
                  <option value="array">array</option>
                  <option value="number">number</option>
                  <option value="boolean">boolean</option>
                </select>
                <span class="field-remove" @click="inputFields.splice(idx, 1)">✕</span>
              </div>
              <button class="btn btn-add-field" @click="inputFields.push({ key: '', type: 'string' })">＋ 添加输入字段</button>
            </div>

            <div class="builder-row">
              <label class="builder-label">输出字段（它产出什么）</label>
              <div v-for="(f, idx) in outputFields" :key="idx" class="field-row">
                <input v-model="f.key" class="builder-input field-key" placeholder="字段名（如 fileKey）" />
                <select v-model="f.type" class="builder-input field-type">
                  <option value="string">string</option>
                  <option value="object">object</option>
                  <option value="array">array</option>
                  <option value="number">number</option>
                  <option value="boolean">boolean</option>
                </select>
                <span class="field-remove" @click="outputFields.splice(idx, 1)">✕</span>
              </div>
              <button class="btn btn-add-field" @click="outputFields.push({ key: '', type: 'string' })">＋ 添加输出字段</button>
            </div>

            <div v-if="isLlmTemplate(builderForm.templateId)" class="builder-row">
              <label class="builder-label">Prompt 模板（AI 节点必填）</label>
              <textarea v-model="builderForm.prompt" rows="4" class="builder-input" placeholder="你是一流的…分析师。根据输入输出 JSON 字段…"></textarea>
            </div>

            <div v-if="!isLlmTemplate(builderForm.templateId) && currentTemplateResources?.params?.length" class="builder-row">
              <label class="builder-label">模板参数</label>
              <div v-for="p in currentTemplateResources.params" :key="p.key" class="field-row">
                <label class="field-param-label">{{ p.label || p.key }}</label>
                <input v-if="p.type === 'boolean'" type="checkbox" v-model="paramsObj[p.key]" class="field-param-check" />
                <input v-else :type="p.type === 'number' ? 'number' : 'text'" v-model="paramsObj[p.key]" class="builder-input field-param-input" :placeholder="p.desc" />
              </div>
            </div>

            <!-- 更多设置：折叠 -->
            <details class="wizard-more">
              <summary>更多设置（标识 / 模型 / 参考资源 / 描述）</summary>
              <div class="wizard-more-body">
                <div class="builder-row">
                  <label class="builder-label">标识 name（自动生成，可改）</label>
                  <input v-model="builderForm.name" class="builder-input" placeholder="my-agent" @input="builderNameTouched = true" />
                </div>
                <div class="builder-row" v-if="isLlmTemplate(builderForm.templateId)">
                  <label class="builder-label">AI 模型</label>
                  <input v-model="builderForm.model" class="builder-input" placeholder="qwen3.7-plus（留空用默认）" />
                </div>
                <div class="builder-row" v-if="isLlmTemplate(builderForm.templateId)">
                  <label class="builder-label">📎 参考资源（规范/示例文档，自动注入 Prompt）</label>
                  <div class="builder-upload-row">
                    <input type="file" class="builder-input builder-file-input" accept=".md,.txt,.json,.yaml,.yml,.csv,.less,.vue,.js,.ts,.png,.jpg,.jpeg,.gif,.webp,.svg,.pdf" @change="onUploadResource" :disabled="builderUploading" />
                    <span class="builder-upload-hint">{{ builderUploading ? '上传中…' : '支持 md/json/png 等，≤10MB' }}</span>
                  </div>
                  <div v-if="builderForm.referenceFiles.length" class="builder-upload-list">
                    <div v-for="(rf, idx) in builderForm.referenceFiles" :key="idx" class="builder-upload-item">
                      <span class="upload-item-name" :title="rf.url">{{ rf.name }}</span>
                      <span class="upload-item-size">{{ (rf.size / 1024).toFixed(1) }}KB</span>
                      <span class="upload-item-remove" @click="builderForm.referenceFiles.splice(idx, 1)">✕</span>
                    </div>
                  </div>
                </div>
                <div class="builder-row">
                  <label class="builder-label">描述（给复用者看，可选）</label>
                  <input v-model="builderForm.description" class="builder-input" placeholder="这个节点做什么" />
                </div>
                <div class="builder-row">
                  <label class="builder-label">分类（可选）</label>
                  <input v-model="builderForm.category" class="builder-input" placeholder="数据源 / 分析 / 转换…" />
                </div>
              </div>
            </details>

            <div v-if="builderError" class="builder-error">{{ builderError }}</div>
          </div>

          <!-- STEP 3：试跑（创建成功后） -->
          <div v-if="builderStep === 3" class="wizard-step-body">
            <div v-if="builderResult" class="builder-result-line">✅ 创建成功：{{ builderResult }}（已加入可用列表）</div>
            <div class="builder-test">
              <div class="builder-test-title">🧪 即建即测：{{ builderTestName }}</div>
              <div v-if="builderTestKeys.length" class="builder-test-inputs">
                <div v-for="k in builderTestKeys" :key="k" class="builder-test-row">
                  <label class="builder-test-key">{{ k }}</label>
                  <input v-model="builderTestInput[k]" class="builder-input" placeholder="mock 输入值" />
                </div>
              </div>
              <div v-else class="builder-test-empty">该节点无需输入，直接试跑</div>
              <div class="builder-test-actions">
                <button class="btn btn-save" @click="runTest" :disabled="builderTesting">
                  {{ builderTesting ? '试跑中…' : '▶ 试跑' }}
                </button>
                <span v-if="builderTestNote" class="builder-test-note">{{ builderTestNote }}</span>
              </div>
              <pre v-if="builderTestOutput" class="builder-test-output">{{ builderTestOutput }}</pre>
              <div v-if="builderTestError" class="builder-error">{{ builderTestError }}</div>
            </div>
            <div class="wizard-tips">试跑通过后，节点会出现在左侧「可用节点」，拖入画布即可使用</div>
          </div>
        </div>

        <div class="builder-footer">
          <button v-if="builderStep === 1" class="btn btn-delete" @click="closeAgentBuilder">取消</button>
          <button v-else class="btn btn-delete" @click="builderStep--">上一步</button>
          <button v-if="builderStep < 3" class="btn btn-save" :disabled="builderLoading" @click="builderStep < 2 ? goConfig() : submitAgentBuilder()">
            {{ builderLoading ? '创建中…' : builderStep === 1 ? '下一步：配置' : '创建并试跑' }}
          </button>
          <button v-else class="btn btn-save" @click="closeAgentBuilder">完成</button>
        </div>
      </div>
    </div>

    <!-- 名称编辑 -->
    <div class="name-bar" v-if="isNewWorkflow || currentWorkflowName">
      <span v-if="isOriginal" class="original-badge">★ 原始管线（只读，编辑后请另存为）</span>
      <label>工作流标识：</label>
      <input v-model="workflowName" placeholder="my-workflow" @blur="sanitizeName" :disabled="!isNewWorkflow || isOriginal" />
      <label class="name-bar-sep">|</label>
      <label>显示名称：</label>
      <input v-model="workflowLabel" placeholder="我的工作流" :disabled="isOriginal" />
    </div>

    <!-- 主编辑区 -->
    <div class="editor-body">
      <!-- 左侧：Handler 列表（按分类分组收拢） -->
      <div class="sidebar-left">
        <div class="sidebar-title">可用节点</div>
        <div class="handler-groups">
          <div v-for="(keys, cat) in handlerGroups" :key="cat" class="handler-group">
            <div class="handler-group-title" @click="toggleHandlerGroup(cat)">
              <span class="handler-group-arrow">{{ collapsedHandlerGroups.has(cat) ? '▸' : '▾' }}</span>
              <span class="handler-group-name">{{ cat }}</span>
              <span class="handler-group-count">{{ keys.length }}</span>
            </div>
            <div v-show="!collapsedHandlerGroups.has(cat)" class="handler-group-body">
              <div
                v-for="key in keys"
                :key="key"
                class="handler-item"
                :class="{ 'is-selected': selectedHandler === key }"
                @click="selectedHandler = key"
                draggable="true"
                @dragstart="onDragStart($event, key)"
              >
                <span class="handler-dot" :style="{ background: getNodeColor('agent') }"></span>
                <div class="handler-info">
                  <div class="handler-name">{{ handlers[key].label }}</div>
                  <div class="handler-key">{{ key }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Handler 详情面板 -->
        <div v-if="selectedHandler && handlers[selectedHandler]" class="handler-detail-panel">
          <div class="handler-detail-header">
            <!-- <span class="handler-dot" :style="{ background: getNodeColor('agent') }"></span> -->
            <div>
              <div class="handler-detail-name">{{ handlers[selectedHandler].label }}</div>
              <div class="handler-detail-key">{{ selectedHandler }}</div>
            </div>
            <button class="handler-detail-close icon-tooltip" data-tooltip="关闭详情" aria-label="关闭详情" @click="selectedHandler = ''">×</button>
          </div>
          <div class="handler-detail-body">
            <p class="handler-detail-desc">{{ handlers[selectedHandler].description }}</p>
            <div class="handler-detail-meta">
              <span class="handler-tag">{{ handlers[selectedHandler].category }}</span>
            </div>
            <div v-if="handlers[selectedHandler].configSchema && Object.keys(handlers[selectedHandler].configSchema).length" class="handler-detail-config">
              <div class="handler-detail-subtitle">可配置项</div>
              <div v-for="(schema, ck) in handlers[selectedHandler].configSchema" :key="ck" class="handler-config-row">
                <span class="config-row-name">{{ schema.label || ck }}</span>
                <span class="config-row-type">{{ schema.type }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="sidebar-title" style="margin-top:20px">控制节点</div>
        <div class="handler-list">
          <div
            class="handler-item"
            draggable="true"
            @dragstart="onDragStart($event, '__start__')"
          >
            <span class="handler-dot" :style="{ background: getNodeColor('start') }"></span>
            <div class="handler-info">
              <div class="handler-name">入口节点</div>
              <div class="handler-key">start</div>
            </div>
          </div>
          <div
            class="handler-item"
            draggable="true"
            @dragstart="onDragStart($event, '__end__')"
          >
            <span class="handler-dot" :style="{ background: getNodeColor('end') }"></span>
            <div class="handler-info">
              <div class="handler-name">结束节点</div>
              <div class="handler-key">end</div>
            </div>
          </div>
          <div
            class="handler-item"
            draggable="true"
            @dragstart="onDragStart($event, '__condition__')"
          >
            <span class="handler-dot" :style="{ background: getNodeColor('condition') }"></span>
            <div class="handler-info">
              <div class="handler-name">条件分支</div>
              <div class="handler-key">condition</div>
            </div>
          </div>
          <div
            class="handler-item"
            draggable="true"
            @dragstart="onDragStart($event, '__parallel__')"
          >
            <span class="handler-dot" :style="{ background: getNodeColor('parallel') }"></span>
            <div class="handler-info">
              <div class="handler-name">并行组</div>
              <div class="handler-key">parallel</div>
            </div>
          </div>
        </div>

        <!-- 已保存的工作流 -->
        <div class="sidebar-title" style="margin-top:20px">已保存的工作流</div>
        <div class="workflow-list">
          <div
            v-for="w in workflowList"
            :key="w.name"
            class="workflow-list-item"
            :class="{ 'is-active': currentWorkflowName === w.name && !isNewWorkflow, 'is-original': w.isOriginal }"
          >
            <div class="workflow-list-info">
              
              <div class="workflow-list-text">
                <div class="workflow-list-name">
                  {{ w.label }}
                  <span v-if="w.isOriginal" class="original-tag">原始</span>
                </div>
                <div class="workflow-list-meta">{{ w.nodeCount }} 节点 · {{ w.edgeCount }} 连线</div>
              </div>
            </div>
            <div class="workflow-list-actions">
              <button class="action-btn action-view icon-tooltip" data-tooltip="查看/编辑" aria-label="查看/编辑" @click="loadAndEditWorkflow(w.name)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
              <button v-if="!w.isOriginal" class="action-btn action-del icon-tooltip" data-tooltip="删除" aria-label="删除" @click="deleteWorkflowSidebar(w.name, w.label)"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
              <span v-else class="action-btn action-locked icon-tooltip" data-tooltip="原始管线不可删除" aria-label="原始管线不可删除">锁定</span>
            </div>
          </div>
        </div>

        <!-- 图例 -->
        <div class="legend">
          <div class="sidebar-title">图例</div>
          <div v-for="(nt, key) in nodeTypes" :key="key" class="legend-item">
            <span class="legend-dot" :style="{ background: nt.color }"></span>
            <span>{{ nt.label }}</span>
          </div>
        </div>
      </div>

      <!-- 中央：Vue Flow 画布 -->
      <div
        class="canvas-area"
        :class="{ 'has-source': !!sourceMaterial }"
        @drop="onDrop"
        @dragover.prevent="canvasDragOver = true"
        @dragleave="canvasDragOver = false"
        @paste="handleCanvasPaste"
      >
        <VueFlow
          ref="vueFlowRef"
          v-model="elements"
          :node-types="customNodeTypes"
          :default-edge-options="defaultEdgeOptions"
          :connection-line-style="{ stroke: 'var(--brand)', strokeWidth: 2 }"
          :snap-to-grid="true"
          :snap-grid="[20, 20]"
          fit-view-on-init
          @connect="onConnect"
          @edge-click="onEdgeClick"
          @pane-click="onPaneClick"
          @node-click="onNodeClick"
        >
          <Background pattern-color="var(--border-light)" :gap="20" />
          <Controls position="bottom-right" />
          <MiniMap position="bottom-left" :pannable="true" :node-stroke-color="getMinimapNodeColor" />        </VueFlow>

        <!-- 空态引导：仅在工作流为空时显示 -->
        <div v-if="elements.length === 0" class="canvas-hint">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <p class="hint-title">从左侧拖入节点，开始编排</p>
          <p class="hint-sub">或从配方库一键加载完整管线</p>
          <div class="canvas-hint-actions">
            <button class="btn btn-builder" @click="openRecipeLibrary">📦 从配方库开始</button>
            <button class="btn btn-builder" @click="openAgentBuilder">＋ 新建节点</button>
          </div>
          <p class="hint-sub" style="margin-top:6px">上方「＋ 新建」可创建工具 / AI 节点</p>
        </div>

        <!-- 素材来源浮条 -->
        <div v-if="sourceMaterial" class="source-chip" :class="'chip-' + sourceMaterial.kind">
          <span class="chip-icon" aria-hidden="true">
            <template v-if="sourceMaterial.kind === 'image'">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
            </template>
            <template v-else-if="sourceMaterial.kind === 'figma'">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 5a3 3 0 0 1 3-3h3v6H8a3 3 0 0 1-3-3z"/><path d="M11 2h3a3 3 0 0 1 0 6h-3z"/></svg>
            </template>
            <template v-else>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            </template>
          </span>
          <span class="chip-body">
            <span class="chip-label">{{ sourceMaterial.label }}</span>
            <span class="chip-value">{{ sourceMaterial.kind === 'image' ? (sourceMaterial.name || '截图') : sourceMaterial.value }}</span>
          </span>
          <button class="chip-clear" type="button" @click.stop="clearSourceMaterial" aria-label="清除素材来源">×</button>
        </div>

        <!-- 拖拽高亮遮罩 -->
        <div v-if="canvasDragOver" class="canvas-dragover-mask" aria-hidden="true">
          <span>释放以识别素材来源</span>
        </div>
      </div>

      <!-- 右侧：属性面板 -->
      <div class="sidebar-right" v-if="selectedNode">
        <div class="sidebar-title">
          {{ selectedNode.type === 'end' ? '结束节点' : selectedNode.type === 'start' ? '入口节点' : '节点属性' }}
        </div>

        <div class="prop-group">
          <label>节点 ID</label>
          <input :value="selectedNode.id" disabled class="prop-input" />
        </div>

        <div class="prop-group">
          <label>显示标签</label>
          <input v-model="selectedNode.data.label" class="prop-input" @input="updateNodeData" />
        </div>

        <div class="prop-group">
          <label>节点类型</label>
          <select v-model="selectedNode.data.nodeType" class="prop-select" @change="onTypeChange">
            <option value="agent">Agent 节点</option>
            <option value="condition">条件分支</option>
            <option value="parallel">并行组</option>
            <option value="start">入口节点</option>
            <option value="end">结束节点</option>
          </select>
        </div>

        <template v-if="selectedNode.data.nodeType === 'agent' || selectedNode.data.nodeType === 'condition'">
          <div class="prop-group">
            <label>Handler</label>
            <select v-model="selectedNode.data.handler" class="prop-select" @change="updateNodeData">
              <option value="">-- 选择 --</option>
              <option v-for="(info, key) in handlers" :key="key" :value="key">
                {{ info.label }}
              </option>
            </select>
          </div>

          <div v-if="selectedNode.data.handler && handlers[selectedNode.data.handler]?.configSchema" class="prop-group">
            <label>高级配置</label>
            <div v-for="(schema, configKey) in handlers[selectedNode.data.handler].configSchema" :key="configKey" class="config-item">
              <label class="config-label">
                {{ schema.label }}
                <span
                  v-if="schema.help"
                  class="help-icon"
                  @mouseenter="tooltip = { text: schema.help, x: $event.clientX, y: $event.clientY }"
                  @mouseleave="tooltip = null"
                  @mousemove="tooltip && (tooltip.x = $event.clientX, tooltip.y = $event.clientY)"
                >?</span>
              </label>
              <!-- 下拉选择 -->
              <div v-if="schema.type === 'select'" class="model-select-wrap">
                <select
                  :value="selectedNode.data.config?.[configKey] ?? schema.default"
                  class="prop-input prop-input-sm prop-select"
                  @change="setConfig(configKey, ($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="m in models" :key="m.value" :value="m.value">{{ m.label }}</option>
                </select>
                <div class="model-tools">
                  <button class="model-tool-btn icon-tooltip" data-tooltip="添加自定义模型" aria-label="添加自定义模型" @click="showAddModel = !showAddModel">+</button>
                </div>
              </div>
              <!-- 数字输入 -->
              <input
                v-else-if="schema.type === 'number'"
                :value="selectedNode.data.config?.[configKey] ?? schema.default"
                :type="schema.type"
                :min="schema.min"
                :max="schema.max"
                class="prop-input prop-input-sm"
                @input="setConfig(configKey, Number(($event.target as HTMLInputElement).value))"
              />
              <!-- 文本输入 -->
              <input
                v-else
                :value="selectedNode.data.config?.[configKey] ?? schema.default"
                type="text"
                class="prop-input prop-input-sm"
                @input="setConfig(configKey, ($event.target as HTMLInputElement).value)"
              />
            </div>

            <!-- 自定义模型管理面板 -->
            <div v-if="showAddModel" class="model-manage-panel">
              <div class="model-manage-title">添加自定义模型</div>
              <input v-model="newModelValue" placeholder="模型标识（如 qwen-max）" class="prop-input prop-input-sm" />
              <input v-model="newModelLabel" placeholder="显示名称（可选）" class="prop-input prop-input-sm" style="margin-top: 4px" />
              <input v-model="newModelUrl" placeholder="API 地址（如 https://dashscope.aliyuncs.com/compatible-mode/v1）" class="prop-input prop-input-sm" style="margin-top: 4px" />
              <div class="model-key-wrap" style="margin-top: 4px">
                <input v-model="newModelKey" :type="showKey ? 'text' : 'password'" placeholder="API Key" class="prop-input prop-input-sm model-key-input" />
                <button class="model-key-toggle icon-tooltip" @click="showKey = !showKey" :data-tooltip="showKey ? '隐藏' : '显示'" :aria-label="showKey ? '隐藏' : '显示'">{{ showKey ? '隐藏' : '显示' }}</button>
              </div>
              <div class="model-manage-actions">
                <button class="btn-tiny" @click="addCustomModel">添加</button>
                <button class="btn-tiny btn-tiny-cancel" @click="showAddModel = false">取消</button>
              </div>
              <div v-if="customModels.length" class="custom-model-list">
                <div class="custom-model-label">已添加：</div>
                <div v-for="m in customModels" :key="m.value" class="custom-model-item">
                  <div class="custom-model-info">
                    <span class="custom-model-name">{{ m.label }}</span>
                    <span v-if="m.url" class="custom-model-meta" :title="m.url">{{ truncateUrl(m.url) }}</span>
                    <span v-if="m.key" class="custom-model-meta">{{ maskKey(m.key) }}</span>
                  </div>
                  <button class="custom-model-del icon-tooltip" data-tooltip="删除自定义模型" aria-label="删除自定义模型" @click="removeCustomModel(m.value)">×</button>
                </div>
              </div>
            </div>
          </div>

          <!-- 全局浮层：tooltip -->
          <div
            v-if="tooltip"
            class="custom-tooltip"
            :style="{ left: tooltip.x + 14 + 'px', top: tooltip.y + 14 + 'px' }"
          >{{ tooltip.text }}</div>
        </template>

        <div class="prop-group" v-if="selectedNode.data.nodeType === 'parallel'">
          <label>并行子节点（并行执行，结果合并）</label>
          <div class="condition-list">
            <div
              v-for="(h, idx) in parallelHandlers"
              :key="idx"
              class="condition-edge-item"
            >
              <select
                :value="h"
                class="prop-input prop-input-sm prop-select"
                @change="updateParallelHandler(idx, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">-- 选择子节点 --</option>
                <option v-for="(info, key) in handlers" :key="key" :value="key">
                  {{ info.label || key }}
                </option>
              </select>
              <button class="btn btn-delete btn-xs" @click="removeParallelHandler(idx)">×</button>
            </div>
            <button class="btn btn-add" @click="addParallelHandler">＋ 添加子节点</button>
          </div>
          <div class="parallel-hint">提示：子节点并行执行，各自结果合并进 state（可用于 layout-reviewer + style-mapper 等并行）</div>
        </div>

        <div class="prop-group" v-if="selectedNode.data.nodeType === 'condition'">
          <label>条件路由</label>
          <div class="condition-list">
            <div
              v-for="(ce, idx) in conditionEdges"
              :key="idx"
              class="condition-edge-item"
            >
              <input
                v-model="ce.label"
                placeholder="条件标签（如 passed）"
                class="prop-input prop-input-sm"
                @input="updateConditionEdge(ce)"
              />
              <span class="condition-arrow">→</span>
              <select
                v-model="ce.target"
                class="prop-input prop-input-sm prop-select"
                @change="updateConditionEdge(ce)"
              >
                <option value="" disabled>选择目标节点</option>
                <option v-for="n in getTargetNodes()" :key="n.id" :value="n.id">{{ n.label }}</option>
              </select>
              <button class="condition-remove icon-tooltip" data-tooltip="删除此分支" aria-label="删除此分支" @click="removeConditionEdge(idx)">×</button>
            </div>
            <button class="condition-add" @click="addConditionEdge">+ 添加条件分支</button>
          </div>
        </div>

        <div class="prop-group" v-if="selectedNode.data.nodeType !== 'end' && selectedNode.data.nodeType !== 'start'">
          <label>入口节点</label>
          <label class="checkbox-label">
            <input type="checkbox" :checked="selectedNode.id === entryNodeId" @change="setEntryNode(selectedNode.id)" />
            设为工作流入口节点
          </label>
        </div>

        <button class="btn-delete-node" @click="deleteSelectedNode">删除节点</button>
      </div>

      <!-- 右侧：空状态 -->
      <div class="sidebar-right sidebar-empty" v-else>
        <div class="empty-tip">
          <div class="empty-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/></svg></div>
          <div>点击节点查看/编辑属性</div>
          <div class="empty-sub">从左侧拖入 Handler 创建节点</div>
        </div>
      </div>
    </div>

    <!-- 保存提示 -->
    <div class="toast" v-if="toastMessage" :class="toastType">{{ toastMessage }}</div>

    <!-- 运行工作流对话框 -->
    <div class="run-overlay" v-if="showRunDialog" @click.self="showRunDialog = false">
      <div class="run-dialog">
        <div class="run-dialog-header">
          <h3>运行工作流：{{ workflowLabel }}</h3>
          <button class="run-close icon-tooltip" data-tooltip="关闭" aria-label="关闭" @click="showRunDialog = false">×</button>
        </div>
        <div class="run-dialog-body">
          <div class="prop-group">
            <label>Figma URL</label>
            <input v-model="runForm.figmaUrl" class="prop-input" placeholder="https://www.figma.com/design/xxx?node-id=2-8417" @input="parseFigmaUrl" />
          </div>
          <div class="run-row">
            <div class="prop-group">
              <label>File Key</label>
              <input v-model="runForm.fileKey" class="prop-input" placeholder="从 URL 自动解析" />
            </div>
            <div class="prop-group">
              <label>Node ID</label>
              <input v-model="runForm.nodeId" class="prop-input" placeholder="2-8417" />
            </div>
          </div>
          <div class="prop-group">
            <label>组件名</label>
            <input v-model="runForm.componentName" class="prop-input" placeholder="c-my-component" />
          </div>
          <div class="run-hint" v-if="runResult">
            已启动，Session: <code>{{ runResult }}</code><br/>
            可前往 <router-link to="/tasks" class="run-link">任务列表</router-link> 查看任务进度
            <br/>
            <button class="btn btn-run-confirm" style="margin-top:8px" @click="openSnapshots" :disabled="snapshotLoading">
              {{ snapshotLoading ? '拉取中…' : '🔍 查看节点快照（运行后）' }}
            </button>
          </div>
        </div>
        <div class="run-dialog-footer">
          <button class="btn btn-run-cancel" @click="showRunDialog = false">关闭</button>
          <button class="btn btn-run-confirm" @click="executeRun" :disabled="!canRun || runLoading">
            {{ runLoading ? '启动中...' : '▶ 启动生成' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 节点快照弹窗（可观测性：每节点输入/输出调试） -->
    <div v-if="snapshotVisible" class="builder-overlay" @click.self="snapshotVisible = false">
      <div class="builder-dialog snapshot-dialog">
        <div class="builder-header">
          <span class="builder-title">🔍 节点快照：{{ snapshotSession }}</span>
          <span class="builder-close" @click="snapshotVisible = false">×</span>
        </div>
        <div class="builder-body">
          <div v-if="!snapshots.length && !snapshotLoading" class="snapshot-empty">暂无快照——运行完成后点击「刷新」</div>
          <button class="btn btn-save" style="margin-bottom:8px" @click="openSnapshots" :disabled="snapshotLoading">
            {{ snapshotLoading ? '拉取中…' : '🔄 刷新' }}
          </button>
          <div class="snapshot-list">
            <div v-for="(s, idx) in snapshots" :key="idx" class="snapshot-item" @click="snapshotExpand = snapshotExpand === idx ? -1 : idx">
              <div class="snapshot-item-head">
                <span class="snapshot-status" :class="'st-' + (s.status || 'unknown')"></span>
                <span class="snapshot-label">{{ s.nodeLabel }}</span>
                <code class="snapshot-handler">{{ s.handler }}</code>
                <span class="snapshot-meta">{{ (s.durationMs / 1000).toFixed(2) }}s · 输入 {{ s.inputKeys?.length || 0 }} 字段</span>
                <span class="snapshot-toggle">{{ snapshotExpand === idx ? '▾' : '▸' }}</span>
              </div>
              <div v-if="snapshotExpand === idx" class="snapshot-detail">
                <div class="snapshot-sub">输入字段：<code>{{ (s.inputKeys || []).join(', ') || '(无)' }}</code></div>
                <div class="snapshot-sub">输出：</div>
                <pre class="snapshot-output">{{ JSON.stringify(s.output || {}, null, 2) }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 另存为 Modal（替换原生 prompt，适配深色主题） -->
    <a-modal
      v-model:open="saveAsModalVisible"
      title="另存为"
      :ok-text="'确定'"
      :cancel-text="'取消'"
      @ok="confirmSaveAs"
      @cancel="saveAsModalVisible = false"
      :keyboard="true"
      :mask-closable="false"
    >
      <p class="save-as-hint">原始管线拓扑不可覆盖，请输入新的工作流名称（英文标识）：</p>
      <a-input
        v-model:value="saveAsNewName"
        placeholder="例如：original-phase2-custom"
        @press-enter="confirmSaveAs"
      />
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, markRaw, computed } from 'vue'
import AgentNode from '@/components/workflow/AgentNode.vue'
import { VueFlow, Handle } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import {
  fetchWorkflowMeta,
  listWorkflows,
  saveWorkflow as apiSaveWorkflow,
  deleteWorkflow as apiDeleteWorkflow,
  loadWorkflow as apiLoadWorkflow,
  fetchGraphTopology,
  fetchModels,
  runWorkflow,
  type HandlerInfo,
  type NodeTypeInfo,
  type ModelOption,
  type Workflow,
  fetchAgentTemplates,
  createAgent,
  uploadAgentResource,
  testAgent,
  fetchRecipes,
  fetchRecipe,
  saveRecipe as apiSaveRecipe,
  deleteRecipe,
  fetchNodeSnapshots,
  submitAgentFeedback,
  type AgentTemplateInfo
} from '@/api/workflow'

// Vue Flow 实例
const vueFlowRef = ref()
let nodeIdCounter = 0

// ── Agent Builder（新建节点）状态 ──
const builderVisible = ref(false)
const builderLoading = ref(false)
const builderError = ref('')
const builderResult = ref('')
const agentTemplates = ref<{ tool: AgentTemplateInfo[]; llm: AgentTemplateInfo[] }>({ tool: [], llm: [] })
const builderForm = ref({
  logicType: 'tool' as 'tool' | 'llm',
  name: '',
  label: '',
  description: '',
  category: '',
  templateId: 'url-parser',
  prompt: '',
  inputsText: '',
  outputsText: '',
  paramsText: '',
  model: '',
  referenceFiles: [] as Array<{ name: string; url: string; type: string; size: number }>,
})
const builderUploading = ref(false)
const templateSearch = ref('')

// ④ 模板搜索：全量模板（工具 + AI）按名称/描述过滤
const filteredTemplates = computed(() => {
  const all = [...agentTemplates.value.tool, ...agentTemplates.value.llm]
  const q = templateSearch.value.trim().toLowerCase()
  if (!q) return all
  return all.filter(
    (t) =>
      (t.id || '').toLowerCase().includes(q) ||
      (t.label || '').toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q),
  )
})
// 即建即测状态
const builderTestOpen = ref(false)
const builderTestName = ref('')
const builderTestKeys = ref<string[]>([])
const builderTestInput = ref<Record<string, string>>({})
const builderTestOutput = ref('')
const builderTestError = ref('')
const builderTestNote = ref('')
const builderTesting = ref(false)
// 配方库状态
const recipeVisible = ref(false)
const recipeSearch = ref('')
const recipes = ref<any[]>([])
const recipeUsing = ref('')
const saveRecipeVisible = ref(false)
const recipeError = ref('')
const recipeSaving = ref(false)
const recipeForm = ref({ name: '', label: '', scenario: '', description: '' })

// ⑦ 节点快照状态
const snapshotVisible = ref(false)
const snapshotLoading = ref(false)
const snapshotSession = ref('')
const snapshots = ref<any[]>([])
const snapshotExpand = ref(-1)

async function openSnapshots() {
  if (!runResult.value) return
  snapshotVisible.value = true
  snapshotSession.value = runResult.value
  snapshotLoading.value = true
  snapshotExpand.value = -1
  try {
    snapshots.value = await fetchNodeSnapshots(runResult.value)
  } catch (e) {
    showToast('拉取节点快照失败：' + (e as Error).message, 'error')
  } finally {
    snapshotLoading.value = false
  }
}

// ⑧ 连线字段依赖提示：尽力而为计算上游输出 → 下游输入 的传递字段
function edgeContract(srcNode: any, tgtNode: any): { label?: string; warn?: boolean } {
  if (!srcNode || !tgtNode) return {}
  const src = handlers.value[srcNode.handler || ''] as any
  const tgt = handlers.value[tgtNode.handler || ''] as any
  if (!src || !tgt) return {}
  const outs: string[] = src.outputs || []
  const ins: string[] = tgt.inputs || []
  if (!outs.length && !ins.length) return {}
  const matched = outs.filter((o) => ins.includes(o))
  if (matched.length) return { label: matched.slice(0, 4).join(',') }
  if (outs.length && ins.length) return { label: '⚠ 契约不匹配', warn: true }
  if (outs.length) return { label: outs.slice(0, 3).join(',') }
  return { label: '→ ' + ins.slice(0, 3).join(',') }
}

const filteredRecipes = computed(() => {
  const q = recipeSearch.value.trim().toLowerCase()
  if (!q) return recipes.value
  return recipes.value.filter(
    (r) =>
      (r.name || '').toLowerCase().includes(q) ||
      (r.label || '').toLowerCase().includes(q) ||
      (r.scenario || '').toLowerCase().includes(q),
  )
})

async function openRecipeLibrary() {
  recipeVisible.value = true
  recipeSearch.value = ''
  try {
    recipes.value = await fetchRecipes()
  } catch (e) {
    showToast('加载配方库失败：' + (e as Error).message, 'error')
  }
}

/** 使用配方：拉取详情 → 拓扑加载到画布（新工作流模式） */
async function useRecipe(name: string) {
  recipeUsing.value = name
  try {
    const r = await fetchRecipe(name)
    const wf = r.workflow
    currentWorkflowName.value = ''
    isNewWorkflow.value = true
    isOriginal.value = false
    workflowName.value = ''
    workflowLabel.value = `${r.label}（来自配方）`
    entryNodeId.value = wf.entryNode
    nodeIdCounter = 0
    elements.value = [
      ...(wf.nodes || []).map((n: any) => ({
        id: n.id,
        type: 'custom',
        position: n.position || { x: 100, y: 100 },
        data: {
          label: n.label,
          nodeType: n.type,
          handler: n.handler || '',
          config: n.config || {},
          color: getNodeColor(n.type),
        },
      })),
      ...(wf.edges || []).map((e: any) => {
        const srcN = (wf.nodes || []).find((n: any) => n.id === e.source)
        const tgtN = (wf.nodes || []).find((n: any) => n.id === e.target)
        const contract = e.condition ? {} : edgeContract(srcN, tgtN)
        const label = e.condition || e.label || contract.label || ''
        const stroke = contract.warn ? 'var(--danger, #E24B4A)' : e.condition ? 'var(--warning-light)' : 'var(--brand)'
        return {
          id: e.id || `edge-${e.source}-${e.target}`,
          source: e.source,
          target: e.target,
          label,
          animated: true,
          style: { stroke, strokeWidth: 2 },
          markerEnd: { type: 'arrowclosed' as const, color: stroke },
        }
      }),
    ]
    selectedNode.value = null
    conditionEdges.value = []
    recipeVisible.value = false
    showToast(`已加载配方：${r.label}（${(wf.nodes || []).length} 节点），保存后即可运行`)
  } catch (e) {
    showToast('使用配方失败：' + (e as Error).message, 'error')
  } finally {
    recipeUsing.value = ''
  }
}

/** 存为配方：弹窗表单 */
function openSaveRecipe() {
  if (!elements.value.length) return
  recipeError.value = ''
  recipeForm.value = {
    name: (workflowName.value || 'recipe') + '-tpl',
    label: workflowLabel.value ? `${workflowLabel.value}（配方）` : '未命名配方',
    scenario: '通用',
    description: '当前画布拓扑另存为模板，可复用/衍生',
  }
  saveRecipeVisible.value = true
}

/** 提交另存为配方（复用保存序列化逻辑） */
async function submitSaveRecipe() {
  recipeError.value = ''
  const f = recipeForm.value
  if (!f.name || !f.label) {
    recipeError.value = '请填写配方标识与显示名称'
    return
  }
  const nodes = elements.value
    .filter((el: any) => el.id && !el.source)
    .map((el: any) => ({
      id: el.id,
      label: el.data.label,
      type: el.data.nodeType,
      handler: el.data.handler || undefined,
      position: el.position,
      config: el.data.config || undefined,
    }))
  const edges = elements.value
    .filter((el: any) => el.source)
    .map((el: any) => ({
      id: el.id.startsWith('edge-') ? el.id : `edge-${el.id}`,
      source: el.source,
      target: el.target,
      condition: !el.label ? undefined : ['passed', 'failed', 'success', 'error'].includes(el.label?.toString() || '') ? el.label?.toString() : undefined,
      label: el.label || undefined,
    }))
  recipeSaving.value = true
  try {
    const res = await apiSaveRecipe({
      name: f.name.trim().replace(/[^a-z0-9-]/g, '-').toLowerCase(),
      label: f.label.trim(),
      scenario: f.scenario.trim() || '通用',
      description: f.description.trim(),
      workflow: {
        entryNode: entryNodeId.value || nodes[0]?.id || '',
        nodes,
        edges,
      },
    })
    if (res.success) {
      saveRecipeVisible.value = false
      showToast(`已存入配方库：${res.data?.label || f.label}（可在配方库中使用）`)
    } else {
      recipeError.value = res.message || '保存失败'
    }
  } catch (e) {
    recipeError.value = '保存请求失败：' + (e as Error).message
  } finally {
    recipeSaving.value = false
  }
}

/** 删除用户配方 */
async function removeUserRecipe(name: string) {
  if (!window.confirm(`删除配方 ${name}？`)) return
  try {
    const res = await deleteRecipe(name)
    if (res.success) {
      recipes.value = recipes.value.filter((r) => r.name !== name)
      showToast('配方已删除')
    } else {
      showToast(res.message || '删除失败', 'error')
    }
  } catch (e) {
    showToast('删除失败：' + (e as Error).message, 'error')
  }
}
const currentTemplates = computed(() =>
  builderForm.value.logicType === 'llm' ? agentTemplates.value.llm : agentTemplates.value.tool,
)
const currentTemplateResources = computed(() =>
  currentTemplates.value.find((t) => t.id === builderForm.value.templateId)?.resources || null,
)

// P1 三步向导：步骤 + 字段列表 + 参数对象
const builderStep = ref(1)
const inputFields = ref<Array<{ key: string; type: string }>>([])
const outputFields = ref<Array<{ key: string; type: string }>>([])
const paramsObj = ref<Record<string, any>>({})
const builderNameTouched = ref(false)
// 能力缺口反馈
const feedbackText = ref('')
const feedbackSending = ref(false)
const feedbackDone = ref(false)

/** 没找到模板 → 跳到 LLM 通用分析（万能大脑）配置步 */
function useAiAnalyzer() {
  const t = agentTemplates.value.llm.find((x) => x.id === 'llm-analyzer')
  if (t) selectTemplate(t)
  else {
    builderError.value = 'LLM 通用分析模板不可用'
  }
}

/** 提交能力缺口反馈 */
async function submitFeedback() {
  const need = feedbackText.value.trim()
  if (!need || feedbackSending.value) return
  feedbackSending.value = true
  try {
    const res = await submitAgentFeedback(need, templateSearch.value)
    if (res.success) {
      feedbackDone.value = true
      feedbackText.value = ''
    } else {
      builderError.value = res.message || '反馈失败'
    }
  } catch (e) {
    builderError.value = '反馈请求失败: ' + (e as Error).message
  } finally {
    feedbackSending.value = false
  }
}

function isLlmTemplate(idOrTpl: any) {
  const id = typeof idOrTpl === 'string' ? idOrTpl : idOrTpl?.id
  return agentTemplates.value.llm.some((t) => t.id === id)
}

/** 选中模板：定逻辑类型 + 名称 + 预填字段 → 进配置步 */
function selectTemplate(t: any) {
  const isLlm = agentTemplates.value.llm.some((x) => x.id === t.id)
  builderForm.value.logicType = isLlm ? 'llm' : 'tool'
  builderForm.value.templateId = t.id
  builderForm.value.label = t.label
  // 标识自动生成：label 转 slug；纯中文 label 兜底用模板 id（否则 name 为空导致无法提交）
  const slug = t.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  builderForm.value.name = slug || t.id
  builderNameTouched.value = false
  const legal = (k: string) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)
  const res = t.resources || {}
  inputFields.value = (res.inputs || [])
    .filter((i: any) => legal(i.key))
    .map((i: any) => ({ key: i.key, type: i.type || 'string' }))
  outputFields.value = (res.outputs || [])
    .filter((o: any) => legal(o.key))
    .map((o: any) => ({ key: o.key, type: o.type || 'string' }))
  paramsObj.value = {}
  builderError.value = ''
  builderStep.value = 2
}

function goConfig() {
  if (!builderForm.value.templateId) {
    builderError.value = '请先选择一个模板'
    return
  }
  builderError.value = ''
  builderStep.value = 2
}

// 显示名称变化 → 标识自动跟随（用户手动改过标识则不再覆盖）
watch(
  () => builderForm.value.label,
  (v) => {
    if (builderStep.value === 2 && !builderNameTouched.value) {
      const slug = (v || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      if (slug) builderForm.value.name = slug
    }
  },
)

// ① 三步使用步骤：由模板资源清单生成"准备输入 → 配置 → 使用"
const templateSteps = computed(() => {
  const r = currentTemplateResources.value
  if (!r) return []
  const legal = (k: string) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)
  const ins = (r.inputs || []).filter((i) => legal(i.key))
  const params = r.params || []
  const steps: Array<{ n: number; t: string; d: string }> = []
  steps.push({
    n: 1,
    t: '准备输入',
    d: ins.length ? ins.map((i) => `${i.key}(${i.type})`).join('、') : '透传，无需输入',
  })
  steps.push({
    n: 2,
    t: '配置',
    d: params.length
      ? params.map((p) => p.key).join('、')
      : r.requires?.prompt
        ? 'Prompt + 模型'
        : '无需参数',
  })
  steps.push({ n: 3, t: '使用', d: '拖入画布连线 → 运行验证' })
  return steps
})

// ②（P1 已并入 selectTemplate 的字段预填：选中模板即带出合法字段，此处 watch 移除）

// ③ 即建即测：调用后端单节点试跑（兼容统一响应信封：成功解包为直接结果 / 失败带 {ok:false,error}）
async function runTest() {
  builderTesting.value = true
  builderTestError.value = ''
  builderTestOutput.value = ''
  try {
    const res = (await testAgent(builderTestName.value, builderTestInput.value)) as any
    if (!res || res.success === false) {
      builderTestError.value = res?.message || '试跑失败'
      return
    }
    const payload = res.data
    if (payload && payload.ok === false) {
      builderTestError.value = payload.error || '试跑失败'
      return
    }
    builderTestOutput.value = JSON.stringify(payload && payload.ok === true ? payload.data : payload, null, 2)
  } catch (e) {
    builderTestError.value = '试跑请求失败: ' + (e as Error).message
  } finally {
    builderTesting.value = false
  }
}

function parseFields(text: string, fallbackKey = 'value') {
  return (text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [key, type] = l.split(':')
      const k = (key || '').trim()
      return { key: k || fallbackKey, type: (type || 'string').trim() || 'string' }
    })
    .filter((f) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(f.key))
}

async function openAgentBuilder() {
  builderVisible.value = true
  builderError.value = ''
  builderResult.value = ''
  templateSearch.value = ''
  builderForm.value.referenceFiles = []
  builderTestOpen.value = false
  builderTestOutput.value = ''
  builderTestError.value = ''
  // P1 向导：回到第 1 步
  builderStep.value = 1
  inputFields.value = []
  outputFields.value = []
  paramsObj.value = {}
  builderNameTouched.value = false
  if (!agentTemplates.value.tool.length) {
    try {
      const t = await fetchAgentTemplates()
      agentTemplates.value = t
      builderForm.value.templateId = t.tool[0]?.id || 'url-parser'
    } catch (e) {
      builderError.value = '加载模板目录失败: ' + (e as Error).message
    }
  }
}

/** 上传参考资源（文档/图片 → agent-resources 目录 → 存入 referenceFiles） */
async function onUploadResource(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  builderUploading.value = true
  builderError.value = ''
  try {
    const res = await uploadAgentResource(file)
    if (res.success && res.data) {
      builderForm.value.referenceFiles.push(res.data)
    } else {
      builderError.value = '上传失败: ' + (res.error || '未知错误')
    }
  } catch (err) {
    builderError.value = '上传请求失败: ' + (err as Error).message
  } finally {
    builderUploading.value = false
  }
}

function closeAgentBuilder() {
  if (builderLoading.value) return
  builderVisible.value = false
}

async function submitAgentBuilder() {
  builderError.value = ''
  builderResult.value = ''
  const f = builderForm.value
  if (!f.templateId) {
    builderError.value = '请先选择一个模板'
    return
  }
  if (!f.label) {
    builderError.value = '请填写显示名称'
    return
  }
  if (!f.name) {
    builderError.value = '请填写标识 name（在「更多设置」中）'
    return
  }
  const legal = (k: string) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)
  const inputs = inputFields.value
    .filter((i) => legal(i.key))
    .map((i) => ({ key: i.key, type: i.type || 'string', required: false }))
  const outputs = outputFields.value
    .filter((o) => legal(o.key))
    .map((o) => ({ key: o.key, type: o.type || 'string' }))
  // 参数：AI → {prompt}；工具 → 表单生成的 paramsObj
  const params: Record<string, any> =
    f.logicType === 'llm' ? { prompt: f.prompt } : { ...paramsObj.value }
  const payload: Parameters<typeof createAgent>[0] = {
    name: f.name.trim(),
    label: f.label.trim(),
    description: f.description.trim(),
    category: f.category.trim() || '自定义',
    logicType: f.logicType,
    templateId: f.templateId,
    inputs,
    outputs,
    params,
    ...(f.logicType === 'llm'
      ? { model: f.model || undefined, params: { prompt: f.prompt }, referenceFiles: f.referenceFiles }
      : {}),
  }
  builderLoading.value = true
  try {
    const res = await createAgent(payload)
    if (res.success && res.data) {
      builderResult.value = `${res.data.label}（${res.data.name}）· 冒烟 ${res.data.smoke}`
      builderForm.value.name = ''
      builderForm.value.prompt = ''
      builderForm.value.referenceFiles = []
      // 即建即测：初始化试跑面板（跳第 3 步）
      builderStep.value = 3
      builderTestOpen.value = true
      builderTestName.value = res.data.name
      const keys = (payload.inputs || []).map((i) => i.key).filter((k) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k))
      builderTestKeys.value = keys
      builderTestInput.value = Object.fromEntries(keys.map((k) => [k, '']))
      builderTestOutput.value = ''
      builderTestError.value = ''
      builderTestNote.value = res.data.logicType === 'llm' ? 'AI 节点试跑需环境模型 Key，如失败请拖入画布运行' : ''
      // 刷新可用节点列表（新建节点立即出现在左侧）
      await loadMeta()
    } else {
      builderError.value = res.message || '创建失败'
    }
  } catch (e) {
    builderError.value = '创建请求失败: ' + (e as Error).message
  } finally {
    builderLoading.value = false
  }
}

// 元数据
const handlers = ref<Record<string, HandlerInfo>>({})
const nodeTypes = ref<Record<string, NodeTypeInfo>>({})
const models = ref<ModelOption[]>([])

// 顶栏「＋ 新建」菜单
const builderMenuOpen = ref(false)

// 左侧 Agent 按分类分组（P0 简化：列表收拢）
const handlerGroups = computed<Record<string, string[]>>(() => {
  const groups: Record<string, string[]> = {}
  for (const [key, info] of Object.entries(handlers.value)) {
    const cat = info.category || '其他'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(key)
  }
  return groups
})
const collapsedHandlerGroups = ref<Set<string>>(new Set())
function toggleHandlerGroup(cat: string) {
  const next = new Set(collapsedHandlerGroups.value)
  if (next.has(cat)) next.delete(cat)
  else next.add(cat)
  collapsedHandlerGroups.value = next
}

// 自定义模型（用户添加的，持久化到 localStorage）
const customModels = ref<ModelOption[]>([])
const showAddModel = ref(false)
const newModelValue = ref('')
const newModelLabel = ref('')
const newModelUrl = ref('')
const newModelKey = ref('')
const showKey = ref(false)

// 浮动 tooltip
const tooltip = ref<{ text: string; x: number; y: number } | null>(null)

// 加载/保存自定义模型
function loadCustomModels() {
  try {
    const raw = localStorage.getItem('workflow_custom_models')
    if (raw) customModels.value = JSON.parse(raw)
  } catch (e) { /* ignore */ }
}
function saveCustomModels() {
  localStorage.setItem('workflow_custom_models', JSON.stringify(customModels.value))
}

function addCustomModel() {
  const v = newModelValue.value.trim()
  const l = newModelLabel.value.trim() || v
  const url = newModelUrl.value.trim()
  const key = newModelKey.value.trim()
  if (!v) return
  if (models.value.some(m => m.value === v)) {
    showToast('该模型已存在', 'error')
    return
  }
  customModels.value.push({ value: v, label: l + ' (自定义)', url: url || undefined, key: key || undefined })
  saveCustomModels()
  newModelValue.value = ''
  newModelLabel.value = ''
  newModelUrl.value = ''
  newModelKey.value = ''
  showAddModel.value = false
  refreshModelList()
  showToast('已添加自定义模型')
}

function removeCustomModel(value: string) {
  customModels.value = customModels.value.filter(m => m.value !== value)
  saveCustomModels()
  refreshModelList()
  showToast('已删除')
}

// 刷新模型下拉列表（内置 + 自定义）
function refreshModelList() {
  // models 初始部分来自内置列表，重建时保持内置不变，替换自定义部分
  const builtin = models.value.filter(m => !customModels.value.some(cm => cm.value === m.value))
  models.value = [...builtin, ...customModels.value]
}

// 辅助：截断 URL 用于显示
function truncateUrl(url: string): string {
  if (!url) return ''
  return url.length > 30 ? url.substring(0, 28) + '…' : url
}

// 辅助：脱敏显示 API Key
function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return '****'
  return key.substring(0, 4) + '****' + key.substring(key.length - 4)
}

// 工作流列表
const workflowList = ref<any[]>([])
const currentWorkflowName = ref('')
const isNewWorkflow = ref(false)
const workflowName = ref('')
const workflowLabel = ref('')
const isOriginal = ref(false)  // 当前加载的是否是原始管线拓扑

// 另存为 Modal（替换原生 prompt）
const saveAsModalVisible = ref(false)
const saveAsNewName = ref('')

// 编辑器数据
const elements = ref<any[]>([])
const selectedNode = ref<any>(null)
const selectedHandler = ref<string>('')
const entryNodeId = ref<string>('')

// 条件边管理
const conditionEdges = ref<{ edgeId: string; label: string; target: string }[]>([])

// Toast
const toastMessage = ref('')
const toastType = ref('success')

// 运行工作流
const showRunDialog = ref(false)
const runLoading = ref(false)
const runResult = ref('')
const runForm = ref({ figmaUrl: '', fileKey: '', nodeId: '', componentName: '' })
const canRun = computed(() => runForm.value.fileKey && runForm.value.nodeId && runForm.value.componentName)

/* ─── 画布素材来源：拖拽 / 粘贴图片或 URL 识别 ─── */
type SourceMaterial = {
  kind: 'figma' | 'url' | 'image' | 'html'
  label: string
  value: string
  dataUrl?: string
  name?: string
}
const sourceMaterial = ref<SourceMaterial | null>(null)
const canvasDragOver = ref(false)

function isValidFigmaUrl(v: string): boolean {
  return /^https?:\/\/(www\.)?figma\.com\/(file|design|proto)\/[\w-]+/i.test(v.trim())
}

function classifyClipboardText(text: string): 'figma' | 'url' | 'image' | 'html' | 'text' {
  const t = text.trim()
  if (/^https?:\/\//i.test(t)) {
    if (/figma\.com/i.test(t)) return 'figma'
    if (/\.(png|jpe?g|gif|webp|svg)$/i.test(t)) return 'image'
    return 'url'
  }
  if (/<[a-z][\s\S]*>/i.test(t) && /<(div|html|template|style|body|section|button)/i.test(t)) return 'html'
  return 'text'
}

function applySourceMaterialFromUrl(url: string) {
  const kind = classifyClipboardText(url)
  if (kind === 'figma') {
    runForm.value.figmaUrl = url.trim()
    parseFigmaUrl()
    sourceMaterial.value = { kind: 'figma', label: 'Figma 链接', value: url.trim() }
    showToast('已识别 Figma 链接，已自动填入运行参数')
  } else if (kind === 'image') {
    sourceMaterial.value = { kind: 'image', label: '图片链接', value: url.trim() }
    showToast('已识别图片链接，已作为素材来源')
  } else if (kind === 'url') {
    sourceMaterial.value = { kind: 'url', label: '网页链接', value: url.trim() }
    showToast('已识别网页链接，已作为素材来源')
  } else if (kind === 'html') {
    sourceMaterial.value = { kind: 'html', label: 'HTML 片段', value: url.trim() }
    showToast('已识别 HTML 片段，已作为素材来源')
  }
}

function applySourceMaterialFromImage(file: File) {
  if (!file.type.startsWith('image/')) {
    showToast('仅支持图片文件', 'error')
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = reader.result as string
    sourceMaterial.value = {
      kind: 'image',
      label: file.name || '截图',
      value: dataUrl,
      dataUrl,
      name: file.name
    }
    showToast('已识别截图，已作为素材来源')
  }
  reader.readAsDataURL(file)
}

function clearSourceMaterial() {
  sourceMaterial.value = null
}

// 画布上的「外部拖拽」（来自浏览器文件 / 文本，而非左侧栏节点）
function handleCanvasExternalDrop(event: DragEvent) {
  const file = event.dataTransfer?.files?.[0]
  if (file) {
    event.preventDefault()
    applySourceMaterialFromImage(file)
    return
  }
  const text = event.dataTransfer?.getData('text/plain')?.trim()
  if (text) {
    event.preventDefault()
    applySourceMaterialFromUrl(text)
  }
}

// 画布上粘贴（剪贴板图片 / 链接）
function handleCanvasPaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items
  const imgItem = items && Array.from(items).find((i) => i.type.startsWith('image/'))
  if (imgItem) {
    const file = imgItem.getAsFile()
    if (file) {
      event.preventDefault()
      applySourceMaterialFromImage(file)
      return
    }
  }
  const text = event.clipboardData?.getData('text')?.trim()
  if (text) {
    event.preventDefault()
    applySourceMaterialFromUrl(text)
  }
}

function openRunDialog() {
  runResult.value = ''
  runForm.value = { figmaUrl: '', fileKey: '', nodeId: '', componentName: '' }
  showRunDialog.value = true
}

function parseFigmaUrl() {
  const url = runForm.value.figmaUrl
  if (!url) return
  try {
    const u = new URL(url)
    const m = u.pathname.match(/\/(file|design)\/([^/]+)/)
    if (m) runForm.value.fileKey = m[2]
    const nid = u.searchParams.get('node-id')
    if (nid) runForm.value.nodeId = nid.replace('-', '-')
  } catch { /* ignore */ }
}

async function executeRun() {
  if (!canRun.value || !currentWorkflowName.value) return
  runLoading.value = true
  runResult.value = ''
  try {
    const res = await runWorkflow(currentWorkflowName.value, {
      componentName: runForm.value.componentName,
      fileKey: runForm.value.fileKey,
      nodeId: runForm.value.nodeId,
      figmaUrl: runForm.value.figmaUrl || undefined
    })
    if (res.success) {
      runResult.value = res.sessionId
      showToast('工作流已启动')
    } else {
      showToast('启动失败：' + (res.error || '未知错误'), 'error')
    }
  } catch (e: any) {
    showToast('启动失败：' + (e.message || '网络错误'), 'error')
  } finally {
    runLoading.value = false
  }
}

// 边默认选项
const defaultEdgeOptions = {
  animated: true,
  style: { stroke: 'var(--brand)', strokeWidth: 2 },
  markerEnd: { type: 'arrowclosed' as const, color: 'var(--brand)' }
}

const customNodeTypes = {
  custom: markRaw(AgentNode)
}

// 获取节点颜色
function getNodeColor(type: string): string {
  const colors: Record<string, string> = {
    agent: 'var(--brand)',
    condition: 'var(--warning-light)',
    parallel: '#1D9E75',
    start: 'var(--brand-light)',
    end: '#9E9E9E'
  }
  return colors[type] || 'var(--brand)'
}

// Minimap 节点颜色
function getMinimapNodeColor(node: any): string {
  return node.data?.color || 'var(--brand)'
}

// 显示 Toast
function showToast(msg: string, type: 'success' | 'error' = 'success') {
  toastMessage.value = msg
  toastType.value = type
  setTimeout(() => { toastMessage.value = '' }, 2500)
}

// 名称清理
function sanitizeName() {
  workflowName.value = workflowName.value.replace(/[^a-z0-9_-]/g, '-').replace(/--+/g, '-').toLowerCase()
}

// 加载元数据
async function loadMeta() {
  try {
    const meta = await fetchWorkflowMeta()
    handlers.value = meta.handlers
    nodeTypes.value = meta.nodeTypes
  } catch (e) {
    console.error('加载元数据失败', e)
  }
}

// 加载可用模型列表
async function loadModels() {
  try {
    const builtin = await fetchModels()
    loadCustomModels()
    // 合并：内置 + 自定义，自定义在后
    models.value = [...builtin, ...customModels.value]
  } catch (e) {
    console.error('加载模型列表失败', e)
  }
}

// 加载工作流列表
async function loadWorkflowList() {
  try {
    workflowList.value = await listWorkflows()
  } catch (e) {
    console.error('加载工作流列表失败', e)
  }
}

// 选中加载工作流
async function loadSelectedWorkflow() {
  if (!currentWorkflowName.value || currentWorkflowName.value === '__new__') return
  isNewWorkflow.value = false

  try {
    const wf = await apiLoadWorkflow(currentWorkflowName.value)
    workflowName.value = wf.name
    workflowLabel.value = wf.label
    entryNodeId.value = wf.entryNode
    isOriginal.value = !!(wf as any).isOriginal

    elements.value = [
      ...wf.nodes.map((n: any) => ({
        id: n.id,
        type: 'custom',
        position: n.position || { x: 100, y: 100 },
        data: {
          label: n.label,
          nodeType: n.type,
          handler: n.handler || '',
          config: n.config || {},
          color: getNodeColor(n.type)
        }
      })),
      ...wf.edges.map((e: any) => {
        const srcN = wf.nodes.find((n: any) => n.id === e.source)
        const tgtN = wf.nodes.find((n: any) => n.id === e.target)
        const contract = e.condition ? {} : edgeContract(srcN, tgtN)
        const label = e.label || e.condition || contract.label || ''
        const stroke = contract.warn ? 'var(--danger, #E24B4A)' : e.condition ? 'var(--warning-light)' : 'var(--brand)'
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label,
          animated: true,
          style: {
            stroke,
            strokeWidth: 2
          },
          markerEnd: { type: 'arrowclosed' as const, color: stroke }
        }
      })
    ]

    showToast(`已加载工作流：${wf.label}`)
  } catch (e: any) {
    showToast('加载失败：' + (e.message || '未知错误'), 'error')
  }
}

// 加载原始管线拓扑
async function loadOriginalTopology(type: 'phase2' | 'vue3' | 'page-generation' | 'apifox-generation') {
  try {
    const wf = await fetchGraphTopology(type)
    currentWorkflowName.value = wf.name
    isNewWorkflow.value = false
    isOriginal.value = true
    workflowName.value = wf.name
    workflowLabel.value = wf.label
    entryNodeId.value = wf.entryNode

    elements.value = [
      ...wf.nodes.map((n: any) => ({
        id: n.id,
        type: 'custom',
        position: n.position || { x: 100, y: 100 },
        data: {
          label: n.label,
          nodeType: n.type,
          handler: n.handler || '',
          config: n.config || {},
          color: getNodeColor(n.type)
        }
      })),
      ...wf.edges.map((e: any) => {
        const srcN = wf.nodes.find((n: any) => n.id === e.source)
        const tgtN = wf.nodes.find((n: any) => n.id === e.target)
        const contract = e.condition ? {} : edgeContract(srcN, tgtN)
        const label = e.label || e.condition || contract.label || ''
        const stroke = contract.warn ? 'var(--danger, #E24B4A)' : e.condition ? 'var(--warning-light)' : 'var(--brand)'
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label,
          animated: true,
          style: {
            stroke,
            strokeWidth: 2
          },
          markerEnd: { type: 'arrowclosed' as const, color: stroke }
        }
      })
    ]

    selectedNode.value = null
    showToast(`已加载原始管线：${wf.label}`)
  } catch (e: any) {
    showToast('加载原始管线失败：' + (e.message || '未知错误'), 'error')
  }
}

// 新建工作流
function newWorkflow() {
  currentWorkflowName.value = ''
  isNewWorkflow.value = true
  isOriginal.value = false
  workflowName.value = ''
  workflowLabel.value = '未命名工作流'
  elements.value = []
  selectedNode.value = null
  entryNodeId.value = ''
  nodeIdCounter = 0
  conditionEdges.value = []
}

// 另存为确认（Modal 回调）
function confirmSaveAs() {
  const newName = saveAsNewName.value.trim()
  if (!newName) {
    showToast('请输入工作流名称', 'error')
    return
  }
  const sanitized = newName.replace(/[^a-z0-9_-]/g, '-').replace(/--+/g, '-').toLowerCase()
  if (sanitized === workflowName.value) {
    showToast('新名称不能与原始管线相同', 'error')
    return
  }
  workflowName.value = sanitized
  workflowLabel.value = workflowLabel.value + ' (副本)'
  isOriginal.value = false
  currentWorkflowName.value = sanitized
  saveAsModalVisible.value = false
  // 名称已更新，继续执行保存
  saveCurrentWorkflow()
}

// 保存工作流
async function saveCurrentWorkflow() {
  // 原始管线不可直接覆盖，弹出 Modal 让用户输入新名称
  if (isOriginal.value) {
    saveAsNewName.value = `${workflowName.value}-custom`
    saveAsModalVisible.value = true
    return
  }

  if (!workflowName.value || !workflowLabel.value) {
    showToast('请输入工作流名称', 'error')
    return
  }

  const nodes = elements.value
    .filter(el => el.id && !el.source) // 排除边（边有 source 属性）
    .map(el => ({
      id: el.id,
      label: el.data.label,
      type: el.data.nodeType,
      handler: el.data.handler || undefined,
      position: el.position,
      config: el.data.config || undefined
    }))

  const edges = elements.value
    .filter(el => el.source) // 边有 source 属性
    .map(el => ({
      id: el.id.startsWith('edge-') ? el.id : `edge-${el.id}`,
      source: el.source,
      target: el.target,
      condition: !el.label ? undefined : (
        ['passed', 'failed', 'success', 'error'].includes(el.label?.toString() || '')
          ? el.label?.toString()
          : undefined
      ),
      label: el.label || undefined
    }))

  const workflow: Workflow = {
    name: workflowName.value,
    label: workflowLabel.value,
    entryNode: entryNodeId.value || nodes[0]?.id || '',
    nodes,
    edges
  }

  try {
    const result = await apiSaveWorkflow(workflow)
    if (result.success) {
      isNewWorkflow.value = false
      currentWorkflowName.value = workflowName.value
      showToast('保存成功')
      await loadWorkflowList()
    } else {
      showToast('保存失败：' + result.error, 'error')
    }
  } catch (e: any) {
    showToast('保存失败：' + (e.message || '网络错误'), 'error')
  }
}

// 侧边栏：加载并编辑工作流
async function loadAndEditWorkflow(name: string) {
  currentWorkflowName.value = name
  isNewWorkflow.value = false
  await loadSelectedWorkflow()
}

// 侧边栏：删除工作流
async function deleteWorkflowSidebar(name: string, label: string) {
  // 原始管线不可删除（后端也会拒绝，这里前端提前拦截）
  if (name === 'original-phase2' || name === 'original-vue3') {
    showToast('原始管线拓扑不可删除', 'error')
    return
  }
  if (!confirm(`确定删除工作流「${label}」？`)) return
  try {
    const result = await apiDeleteWorkflow(name)
    if (result.success) {
      showToast('删除成功')
      if (currentWorkflowName.value === name) {
        newWorkflow()
      }
      await loadWorkflowList()
    } else {
      showToast('删除失败：' + result.error, 'error')
    }
  } catch (e: any) {
    showToast('删除失败', 'error')
  }
}

// 删除工作流
async function deleteCurrentWorkflow() {
  if (!currentWorkflowName.value || isNewWorkflow.value) return
  if (isOriginal.value) {
    showToast('原始管线拓扑不可删除', 'error')
    return
  }
  if (!confirm(`确定删除工作流「${workflowLabel.value}」？`)) return

  try {
    const result = await apiDeleteWorkflow(currentWorkflowName.value)
    if (result.success) {
      showToast('删除成功')
      newWorkflow()
      await loadWorkflowList()
    } else {
      showToast('删除失败：' + result.error, 'error')
    }
  } catch (e: any) {
    showToast('删除失败', 'error')
  }
}

// 拖拽支持
const dragHandler = ref('')

function onDragStart(event: DragEvent, handlerKey: string) {
  dragHandler.value = handlerKey
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', handlerKey)
  }
}

function onDrop(event: DragEvent) {
  const handlerKey = dragHandler.value
  if (!handlerKey) {
    // 非左侧栏节点拖拽：来自浏览器的文件 / 链接，作为素材来源识别
    handleCanvasExternalDrop(event)
    return
  }

  const bounds = (event.currentTarget as HTMLElement).querySelector('.vue-flow')?.getBoundingClientRect()
  if (!bounds) return

  // 计算相对于 Flow 画布的位置
  const vueFlowInstance = vueFlowRef.value
  const position = vueFlowInstance?.screenToFlowCoordinate
    ? vueFlowInstance.screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
    : { x: event.clientX - bounds.left, y: event.clientY - bounds.top }

  // 确定节点类型和 Handler
  let nodeType: string, handlerValue: string, label: string
  if (handlerKey === '__start__') {
    nodeType = 'start'
    handlerValue = ''
    label = '入口'
  } else if (handlerKey === '__end__') {
    nodeType = 'end'
    handlerValue = ''
    label = '完成'
  } else if (handlerKey === '__condition__') {
    nodeType = 'condition'
    handlerValue = 'adversarial-checker'
    label = '条件判断'
  } else if (handlerKey === '__parallel__') {
    nodeType = 'parallel'
    handlerValue = ''
    label = '并行组'
  } else {
    nodeType = 'agent'
    handlerValue = handlerKey
    label = handlers.value[handlerKey]?.label || handlerKey
  }

  const nodeId = `node-${Date.now()}-${++nodeIdCounter}`
  const color = getNodeColor(nodeType)

  const newNode = {
    id: nodeId,
    type: 'custom',
    position,
    data: {
      label,
      nodeType,
      handler: handlerValue,
      config: {},
      color
    }
  }

  elements.value.push(newNode)
  dragHandler.value = ''

  // 如果是第一个节点，自动设为入口
  if (!entryNodeId.value || elements.value.filter(el => el.id && !el.source).length === 1) {
    entryNodeId.value = nodeId
  }
}

// 连线
function onConnect(connection: any) {
  const edgeId = `edge-${Date.now()}-${++nodeIdCounter}`
  // ⑧ 连线字段依赖提示：上游输出 → 下游输入
  const srcNode = elements.value.find((el: any) => el.id === connection.source)
  const tgtNode = elements.value.find((el: any) => el.id === connection.target)
  const contract = edgeContract(srcNode?.data, tgtNode?.data)
  const newEdge = {
    id: edgeId,
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle,
    targetHandle: connection.targetHandle,
    label: contract.label || '',
    animated: true,
    style: {
      stroke: contract.warn ? 'var(--danger, #E24B4A)' : 'var(--brand)',
      strokeWidth: 2,
    },
    markerEnd: { type: 'arrowclosed' as const, color: contract.warn ? 'var(--danger, #E24B4A)' : 'var(--brand)' }
  }
  elements.value.push(newEdge)
}

// 点击事件
function onPaneClick() {
  selectedNode.value = null
  conditionEdges.value = []
}

function onNodeClick({ node }: any) {
  selectedNode.value = node

  if (node.data.nodeType === 'condition') {
    const connected = elements.value.filter(
      el => el.source === node.id && el.type !== 'custom'
    )
    conditionEdges.value = connected.map(e => ({
      edgeId: e.id,
      label: e.label?.toString() || '',
      target: e.target
    }))
  } else {
    conditionEdges.value = []
  }
}

function onEdgeClick({ edge }: any) {
  // 点击边可以删除
  if (confirm('删除这条连线？')) {
    elements.value = elements.value.filter(el => el.id !== edge.id)
  }
}

// 更新节点数据
function updateNodeData() {
  if (selectedNode.value) {
    selectedNode.value.data.color = getNodeColor(selectedNode.value.data.nodeType)
    const idx = elements.value.findIndex(el => el.id === selectedNode.value.id)
    if (idx >= 0) {
      elements.value[idx] = { ...selectedNode.value }
    }
  }
}

// 类型变更
function onTypeChange() {
  if (selectedNode.value) {
    selectedNode.value.data.handler = selectedNode.value.data.nodeType === 'agent' || selectedNode.value.data.nodeType === 'condition'
      ? selectedNode.value.data.handler
      : ''
    updateNodeData()
  }
}

// ── 并行组配置 ──
const parallelHandlers = computed<string[]>(() => {
  const hs = selectedNode.value?.data?.config?.handlers
  return Array.isArray(hs) ? hs : []
})

function addParallelHandler() {
  if (!selectedNode.value) return
  if (!selectedNode.value.data.config) selectedNode.value.data.config = {}
  const cur = Array.isArray(selectedNode.value.data.config.handlers)
    ? selectedNode.value.data.config.handlers
    : []
  selectedNode.value.data.config.handlers = [...cur, '']
  updateNodeData()
}

function removeParallelHandler(idx: number) {
  if (!selectedNode.value?.data?.config?.handlers) return
  selectedNode.value.data.config.handlers = selectedNode.value.data.config.handlers.filter(
    (_: string, i: number) => i !== idx,
  )
  updateNodeData()
}

function updateParallelHandler(idx: number, value: string) {
  if (!selectedNode.value?.data?.config?.handlers) return
  selectedNode.value.data.config.handlers[idx] = value
  updateNodeData()
}

// 配置变更
function setConfig(key: string, value: any) {
  if (selectedNode.value) {
    if (!selectedNode.value.data.config) selectedNode.value.data.config = {}
    selectedNode.value.data.config[key] = value
    // 如果是 model 配置项，自动附带自定义模型的 URL/Key
    if (key === 'model') {
      const modelInfo = models.value.find(m => m.value === value)
      if (modelInfo?.url) {
        selectedNode.value.data.config.modelUrl = modelInfo.url
      } else {
        delete selectedNode.value.data.config.modelUrl
      }
      if (modelInfo?.key) {
        selectedNode.value.data.config.modelKey = modelInfo.key
      } else {
        delete selectedNode.value.data.config.modelKey
      }
    }
    updateNodeData()
  }
}

// 设置入口节点
function setEntryNode(id: string) {
  entryNodeId.value = id
  // 取消其他节点的入口标记
  elements.value.forEach(el => {
    if (el.data && el.data.isEntry) {
      el.data.isEntry = false
    }
  })
  const node = elements.value.find(el => el.id === id)
  if (node?.data) {
    node.data.isEntry = true
  }
}

// 条件边管理
function addConditionEdge() {
  // 新增一个空白条件分支，等待用户填标签和选目标
  const tempId = `edge-temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  conditionEdges.value.push({ edgeId: tempId, label: 'passed', target: '' })
}

function removeConditionEdge(index: number) {
  const ce = conditionEdges.value[index]
  // 同步删除画布上对应的边
  if (ce?.edgeId) {
    const idx = elements.value.findIndex(el => el.id === ce.edgeId)
    if (idx >= 0) elements.value.splice(idx, 1)
  }
  conditionEdges.value.splice(index, 1)
}

function updateConditionEdge(ce: any) {
  // 回写到画布的 elements（label / target）
  if (!ce?.edgeId) return
  const el = elements.value.find(e => e.id === ce.edgeId)
  if (el) {
    el.label = ce.label
    if (ce.target) el.target = ce.target
  }
}

// 获取可选的目标节点（排除自身和入口节点）
function getTargetNodes() {
  if (!selectedNode.value) return []
  return elements.value
    .filter(el => el.id && !el.source && el.id !== selectedNode.value!.id)
    .map(el => ({ id: el.id, label: el.data?.label || el.id }))
}

// 删除节点
function deleteSelectedNode() {
  if (!selectedNode.value) return
  if (!confirm(`确定删除节点「${selectedNode.value.data.label}」？`)) return

  const nodeId = selectedNode.value.id
  elements.value = elements.value.filter(el => el.id !== nodeId && el.source !== nodeId && el.target !== nodeId)
  if (entryNodeId.value === nodeId) {
    entryNodeId.value = ''
  }
  selectedNode.value = null
}

// 初始化
onMounted(async () => {
  await loadModels()
  await loadMeta()
  await loadWorkflowList()
  // 默认展示微码管线
  await loadOriginalTopology('phase2')
})
</script>

<style scoped>
/* 页面布局 — 全高填充（与 TaskCenter 一致） */
.editor-page {
  margin: 0;
  width: 100%;
  padding: 16px 24px 24px;
  height: calc(100vh - 104px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.page-header {
  text-align: center;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.page-header h1 {
  font-size: 36px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -1px;
  line-height: 1.2;
}

.subtitle {
  font-size: 15px;
  color: var(--text-secondary);
  margin-top: 12px;
  line-height: 1.6;
}

.header-links {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

.header-link {
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-secondary);
  text-decoration: none;
  transition: all 0.2s;
}

.header-link:hover {
  background: var(--brand-bg-hover);
  border-color: var(--brand);
  color: var(--brand);
}

/* 工具栏 — 浮动卡片风格（与 TaskCenter 筛选栏一致） */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  margin-bottom: 14px;
  flex-shrink: 0;
}

.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.workflow-select {
  height: 32px;
  padding: 0 28px 0 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
  font-size: 13px;
  background: var(--bg-card);
  color: var(--text-primary);
  min-width: 200px;
  cursor: pointer;
  outline: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%239ca3af' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.workflow-select:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 18%, transparent);
}

/* 按钮体系 — pill 圆角 + 统一风格 */
.btn {
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
  font-size: 12.5px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.16s ease;
  background: transparent;
  color: var(--text-secondary);
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.btn:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.btn:active:not(:disabled) {
  transform: scale(0.97);
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 新建按钮 — 品牌色描边 */
.btn-new {
  border-color: var(--brand);
  color: var(--brand);
  background: transparent;
}
.btn-new:hover:not(:disabled) {
  background: color-mix(in srgb, var(--brand) 8%, transparent);
}

/* 保存按钮 — 黑底白字（与 TaskCenter Playground 一致） */
.btn-save {
  background: #1a1a1a;
  color: #fff;
  border-color: #2a2a2a;
}
.btn-save:hover:not(:disabled) {
  background: #333;
  border-color: #444;
}

/* 运行按钮 — 品牌蓝实心 */
.btn-run {
  background: var(--brand);
  color: #fff;
  border-color: var(--brand);
}
.btn-run:hover:not(:disabled) {
  filter: brightness(1.08);
  box-shadow: 0 2px 8px -2px color-mix(in srgb, var(--brand) 45%, transparent);
}

/* 删除按钮 — 文字红 */
.btn-delete {
  color: var(--error-text);
  border-color: color-mix(in srgb, var(--error) 30%, var(--border-default));
  background: transparent;
}
.btn-delete:hover:not(:disabled) {
  background: color-mix(in srgb, var(--error-bg) 40%, var(--bg-card));
  border-color: color-mix(in srgb, var(--error) 50%, var(--border-default));
}

/* 名称栏 — 紧凑行内 */
.name-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px 10px;
  font-size: 12.5px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.name-bar label {
  color: var(--text-tertiary);
  font-weight: 500;
}

.name-bar input {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
  font-size: 12.5px;
  outline: none;
  width: 170px;
  background: var(--bg-card);
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.name-bar input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 18%, transparent);
}

.name-bar input:disabled {
  background: var(--bg-alt);
  color: var(--text-tertiary);
}

.name-bar-sep {
  color: var(--border-default);
  margin: 0 4px;
}

/* 原始管线按钮组 */
.original-pipeline-group {
  display: flex;
  gap: 5px;
  margin-left: 6px;
  padding-left: 10px;
  border-left: 1px solid var(--border-light);
}

.btn-original {
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--feature);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--feature) 6%, transparent);
  color: var(--feature);
  font-size: 11.5px;
  cursor: pointer;
  transition: all 0.16s ease;
  white-space: nowrap;
  font-weight: 500;
}

.btn-original:hover {
  background: color-mix(in srgb, var(--feature) 14%, transparent);
  box-shadow: 0 1px 4px -1px color-mix(in srgb, var(--feature) 25%, transparent);
}

.btn-original-page {
  border-color: var(--success);
  color: var(--success);
  background: color-mix(in srgb, var(--success) 6%, transparent);
}
.btn-original-page:hover {
  background: color-mix(in srgb, var(--success) 14%, transparent);
  box-shadow: 0 1px 4px -1px color-mix(in srgb, var(--success) 25%, transparent);
}

.btn-original-api {
  border-color: var(--warning);
  color: var(--warning);
  background: color-mix(in srgb, var(--warning) 6%, transparent);
}
.btn-original-api:hover {
  background: color-mix(in srgb, var(--warning) 14%, transparent);
  box-shadow: 0 1px 4px -1px color-mix(in srgb, var(--warning) 25%, transparent);
}

.original-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  background: linear-gradient(135deg, var(--feature), #9333EA);
  color: white;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  letter-spacing: 0.2px;
}

.original-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  background: var(--feature);
  color: white;
  border-radius: var(--radius-full);
  font-size: 10px;
  font-weight: 600;
  margin-left: 4px;
  vertical-align: middle;
}

.workflow-list-item.is-original {
  border-color: rgba(124, 58, 237, 0.2);
  background: rgba(124, 58, 237, 0.02);
}

.workflow-list-item.is-original.is-active {
  background: rgba(124, 58, 237, 0.08);
  border-color: var(--feature);
}

.action-locked {
  opacity: 0.4;
  cursor: not-allowed;
  font-size: 14px;
}

/* 编辑器主体 */
.editor-body {
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 左侧栏 — 浮动卡片 */
.sidebar-left {
  width: 252px;
  flex-shrink: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  height: 100%;
  box-shadow: var(--shadow-sm);
}

.sidebar-title {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text-tertiary);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-light);
}

.handler-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  cursor: grab;
  transition: all 0.15s ease;
  border: 1px solid transparent;
}

.handler-item:hover {
  background: var(--bg-hover);
  border-color: var(--border-light);
}

.handler-item.is-selected {
  background: color-mix(in srgb, var(--brand) 8%, var(--bg-card));
  border-color: color-mix(in srgb, var(--brand) 35%, var(--border-default));
}

.handler-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
  box-shadow: 0 0 0 2px color-mix(in srgb, currentColor 18%, transparent);
}

.handler-info {
  flex: 1;
  min-width: 0;
}

.handler-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.handler-key {
  font-size: 11px;
  color: var(--text-tertiary);
  font-family: monospace;
}

.handler-category {
  font-size: 10px;
  color: var(--text-quaternary);
  background: var(--bg-alt);
  padding: 2px 7px;
  border-radius: var(--radius-full);
  font-weight: 500;
}

.handler-desc {
  font-size: 10px;
  color: var(--text-tertiary);
  margin-top: 2px;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Handler 详情面板 */
.handler-detail-panel {
  margin-top: 10px;
  padding: 12px;
  background: var(--bg-hover);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
}

.handler-detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.handler-detail-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.handler-detail-key {
  font-size: 10px;
  color: var(--text-quaternary);
  font-family: monospace;
}

.handler-detail-close {
  margin-left: auto;
  background: none;
  border: none;
  font-size: 16px;
  color: var(--text-quaternary);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.handler-detail-close:hover {
  color: var(--text-secondary);
}

.handler-detail-body {
  font-size: 12px;
}

.handler-detail-desc {
  margin: 0 0 8px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.handler-detail-meta {
  margin-bottom: 10px;
}

.handler-tag {
  display: inline-block;
  font-size: 10px;
  color: var(--brand);
  background: var(--brand-bg);
  padding: 2px 8px;
  border-radius: var(--radius-xs);
}

.handler-detail-config {
  border-top: 1px dashed var(--border-default);
  padding-top: 8px;
}

.handler-detail-subtitle {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-tertiary);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.handler-config-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  font-size: 11px;
}

.config-row-name {
  color: var(--text-secondary);
  font-weight: 500;
}

.config-row-type {
  color: var(--text-quaternary);
  background: var(--border-light);
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  font-size: 10px;
  font-family: monospace;
}

/* 已保存的工作流列表 */
.workflow-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.workflow-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  transition: all 0.15s ease;
}

.workflow-list-item:hover {
  background: var(--bg-hover);
  border-color: var(--border-light);
}

.workflow-list-item.is-active {
  background: color-mix(in srgb, var(--brand) 6%, var(--bg-card));
  border-color: color-mix(in srgb, var(--brand) 30%, var(--border-default));
}

.workflow-list-info {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.workflow-list-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.workflow-list-text {
  min-width: 0;
}

.workflow-list-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workflow-list-meta {
  font-size: 10.5px;
  color: var(--text-quaternary);
}

.workflow-list-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.workflow-list-item:hover .workflow-list-actions,
.workflow-list-item.is-active .workflow-list-actions {
  opacity: 1;
}

.action-btn {
  background: none;
  border: none;
  font-size: 13px;
  padding: 3px 5px;
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all 0.15s ease;
  line-height: 1;
  color: var(--text-tertiary);
}

.action-view:hover {
  background: var(--brand-bg);
}

.action-del:hover {
  background: rgba(231, 76, 60, 0.1);
}

/* 图例 */
.legend {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--border-light);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: var(--text-tertiary);
  padding: 3px 0;
}

.legend-dot {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-full);
}

/* 画布 — 精致卡片 */
.canvas-area {
  flex: 1;
  min-width: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
  position: relative;
  box-shadow: var(--shadow-sm);
}

.canvas-area :deep(.vue-flow) {
  height: 100%;
}

/* 画布空态引导 — 更精致 */
.canvas-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  color: var(--text-quaternary);
  pointer-events: none;
  user-select: none;
  width: 75%;
}

.canvas-hint .hint-title {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text-tertiary);
}

.canvas-hint .hint-sub {
  font-size: 11.5px;
  color: var(--text-quaternary);
}

.canvas-hint-actions {
  display: flex;
  gap: 10px;
  pointer-events: auto;
}
.canvas-hint-actions .btn {
  padding: 8px 16px;
  font-size: 13px;
}

/* 素材来源浮条 */
.source-chip {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 320px;
  padding: 8px 10px 8px 12px;
  border-radius: var(--radius-md);
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  box-shadow: var(--shadow-md);
}
.chip-icon {
  display: inline-flex;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
}
.chip-figma .chip-icon { background: var(--module-microcode-bg); color: var(--module-microcode-text); }
.chip-image .chip-icon { background: var(--component-vue3-bg); color: var(--component-vue3-strong); }
.chip-url .chip-icon,
.chip-html .chip-icon { background: var(--brand-bg); color: var(--brand-text); }
.chip-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}
.chip-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}
.chip-value {
  font-size: 11px;
  color: var(--text-tertiary);
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip-clear {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}
.chip-clear:hover { color: var(--text-primary); }

/* 拖拽高亮遮罩 */
.canvas-dragover-mask {
  position: absolute;
  inset: 8px;
  z-index: 6;
  border: 2px dashed var(--brand);
  border-radius: var(--radius-lg);
  background: var(--brand-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--brand-text);
  font-size: 14px;
  font-weight: 500;
  pointer-events: none;
}

/* 右侧栏 — 浮动卡片 */
.sidebar-right {
  width: 264px;
  flex-shrink: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  height: 100%;
  box-shadow: var(--shadow-sm);
}

.sidebar-empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-tip {
  text-align: center;
  color: var(--text-quaternary);
  font-size: 13px;
  line-height: 1.8;
}

.empty-icon {
  font-size: 28px;
  margin-bottom: 10px;
  opacity: 0.35;
  color: var(--text-tertiary);
}

.empty-sub {
  font-size: 11.5px;
  color: var(--text-quaternary);
}

/* 属性面板 */
.prop-group {
  margin-bottom: 14px;
}

.prop-group > label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.prop-input {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
  font-size: 12.5px;
  outline: none;
  box-sizing: border-box;
  background: var(--bg-card);
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.prop-input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 18%, transparent);
}

.prop-input:disabled {
  background: var(--bg-alt);
  color: var(--text-tertiary);
}

.prop-input-sm {
  height: 28px;
  padding: 0 8px;
  font-size: 12px;
}

.prop-select {
  width: 100%;
  height: 32px;
  padding: 0 28px 0 10px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
  font-size: 12.5px;
  outline: none;
  background: var(--bg-card);
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%239ca3af' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.prop-select:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 18%, transparent);
}

.checkbox-label {
  display: flex !important;
  align-items: center;
  gap: 6px;
  font-size: 12px !important;
  font-weight: 400 !important;
  color: var(--text-secondary) !important;
  cursor: pointer;
  text-transform: none !important;
}

.checkbox-label input[type="checkbox"] {
  accent-color: var(--brand);
  width: 14px;
  height: 14px;
}

.config-item {
  margin-bottom: 8px;
}

.config-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-tertiary);
  margin-bottom: 3px;
}

.help-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  border-radius: var(--radius-full);
  background: var(--border-light);
  color: var(--text-tertiary);
  font-size: 9px;
  font-weight: bold;
  cursor: help;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.help-icon:hover {
  background: var(--brand);
  color: #fff;
}

.prop-select {
  appearance: auto;
  cursor: pointer;
}

.model-select-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
}

.model-select-wrap .prop-select {
  flex: 1;
}

.model-tools {
  display: flex;
  gap: 2px;
}

.model-tool-btn {
  width: 22px;
  height: 22px;
  border: 1px solid var(--border-default);
  background: var(--bg-hover);
  border-radius: var(--radius-xs);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  color: var(--brand);
  font-weight: bold;
  transition: all 0.15s;
}

.model-tool-btn:hover {
  background: var(--brand);
  color: var(--text-inverse);
  border-color: var(--brand);
}

.model-manage-panel {
  margin-top: 8px;
  padding: 10px;
  background: var(--bg-hover);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
}

.model-manage-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.model-manage-actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

.btn-tiny {
  padding: 3px 10px;
  font-size: 11px;
  background: var(--brand);
  color: var(--text-inverse);
  border: none;
  border-radius: var(--radius-xs);
  cursor: pointer;
}

.btn-tiny-cancel {
  background: var(--border-default);
  color: var(--text-secondary);
}

.custom-model-list {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-default);
}

.custom-model-label {
  font-size: 10px;
  color: var(--text-tertiary);
  margin-bottom: 4px;
}

.custom-model-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 6px;
  background: var(--bg-card);
  border-radius: var(--radius-xs);
  font-size: 11px;
  margin-bottom: 2px;
}

.custom-model-del {
  background: none;
  border: none;
  color: var(--error);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 4px;
}

/* 自定义模型：Key 输入框 + 显示切换 */
.model-key-wrap {
  display: flex;
  gap: 4px;
}

.model-key-input {
  flex: 1;
}

.model-key-toggle {
  background: none;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xs);
  cursor: pointer;
  padding: 0 6px;
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;
}

.model-key-toggle:hover {
  background: var(--border-light);
}

/* 自定义模型列表项信息 */
.custom-model-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px;
  background: var(--bg-card);
  border-radius: var(--radius-xs);
  font-size: 11px;
  margin-bottom: 2px;
}

.custom-model-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.custom-model-name {
  font-weight: 500;
  color: var(--text-primary);
}

.custom-model-meta {
  font-size: 9px;
  color: var(--text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.custom-tooltip {
  position: fixed;
  z-index: 9999;
  max-width: 260px;
  padding: 8px 12px;
  background: var(--text-primary);
  color: var(--text-inverse);
  font-size: 12px;
  line-height: 1.5;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  pointer-events: none;
}

/* 条件边 */
.condition-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.condition-edge-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.condition-edge-item .prop-input-sm {
  flex: 1;
  min-width: 0;
}

.condition-edge-item .prop-select {
  flex: 1.4;
  min-width: 0;
}

.condition-arrow {
  color: var(--brand);
  font-weight: bold;
}

.condition-target {
  font-size: 12px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.condition-remove {
  background: none;
  border: none;
  color: var(--error);
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.condition-add {
  background: none;
  border: 1px dashed var(--border-strong);
  padding: 6px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--brand);
  cursor: pointer;
  text-align: center;
}

.condition-add:hover {
  background: var(--brand-bg-hover);
}

.btn-delete-node {
  margin-top: auto;
  height: 32px;
  padding: 0 14px;
  background: var(--error);
  border: none;
  color: #fff;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.16s ease;
}

.btn-delete-node:hover {
  filter: brightness(1.08);
  box-shadow: 0 2px 8px -2px color-mix(in srgb, var(--error) 40%, transparent);
}

/* Toast — 现代胶囊提示 */
.toast {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 20px;
  border-radius: var(--radius-full);
  font-size: 12.5px;
  font-weight: 600;
  z-index: 9999;
  animation: toast-in 0.25s ease;
  box-shadow: var(--shadow-md);
}

.toast.success {
  background: #1a1a1a;
  color: #fff;
}

.toast.error {
  background: var(--error);
  color: #fff;
}

@keyframes toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

/* 流程节点样式 (注入到全局) */
.editor-page :deep(.flow-node) {
  background: var(--bg-card);
  border: 2px solid var(--brand);
  border-radius: var(--radius-lg);
  min-width: 160px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  transition: box-shadow 0.2s;
}

.editor-page :deep(.flow-node:hover) {
  box-shadow: var(--shadow-md);
}

.editor-page :deep(.flow-node.node-condition) {
  border-radius: var(--radius-md);
  min-width: 140px;
}

.editor-page :deep(.flow-node.node-start) {
  border-radius: var(--radius-full);
  min-width: 120px;
}

.editor-page :deep(.flow-node.node-end) {
  border-radius: var(--radius-full);
  min-width: 120px;
}

.editor-page :deep(.flow-node-header) {
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  color: white;
  display: flex;
  align-items: center;
  gap: 6px;
}

.editor-page :deep(.flow-node-body) {
  padding: 6px 14px 8px;
}

.editor-page :deep(.flow-handler) {
  font-size: 11px;
  color: var(--text-tertiary);
  font-family: monospace;
  background: var(--bg-alt);
  padding: 2px 6px;
  border-radius: var(--radius-xs);
}

.editor-page :deep(.vue-flow__minimap) {
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border-default);
}

.editor-page :deep(.vue-flow__controls-button) {
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-default);
  background: var(--bg-card);
  color: var(--text-primary);
}

.editor-page :deep(.vue-flow__controls-button:hover) {
  background: var(--brand-bg-hover);
  color: var(--brand);
}

.editor-page :deep(.vue-flow__controls-button svg) {
  fill: currentColor;
}

/* 运行工作流对话框 — 现代卡片风格 */
.run-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(4px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.run-dialog {
  width: 500px;
  max-width: 92vw;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow:
    0 20px 60px -12px rgba(0, 0, 0, 0.18),
    0 0 0 1px color-mix(in srgb, var(--border-default) 50%, transparent);
}

.run-dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
}

.run-dialog-header h3 {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.run-close {
  background: transparent;
  border: 1px solid var(--border-light);
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  font-size: 16px;
  cursor: pointer;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.run-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.run-dialog-body {
  padding: 18px 20px;
}

.run-row {
  display: flex;
  gap: 10px;
}

.run-row .prop-group {
  flex: 1;
}

.run-hint {
  margin-top: 12px;
  padding: 10px 14px;
  background: color-mix(in srgb, var(--task-success) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--task-success) 25%, var(--border-default));
  border-radius: var(--radius-md);
  font-size: 12.5px;
  color: var(--task-success-text, #166534);
  line-height: 1.6;
}

.run-hint code {
  background: color-mix(in srgb, var(--task-success) 15%, transparent);
  padding: 1px 6px;
  border-radius: var(--radius-full);
  font-size: 11.5px;
}

.run-link {
  color: var(--brand);
  font-weight: 600;
}

.run-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 20px;
  border-top: 1px solid var(--border-light);
}

.btn-run-cancel {
  height: 32px;
  padding: 0 16px;
  background: transparent;
  color: var(--text-secondary);
  border-color: var(--border-default);
}

.btn-run-confirm {
  height: 32px;
  padding: 0 20px;
  background: var(--brand);
  color: #fff;
  border-color: var(--brand);
  font-weight: 600;
}

.btn-run-confirm:hover:not(:disabled) {
  filter: brightness(1.08);
  box-shadow: 0 2px 8px -2px color-mix(in srgb, var(--brand) 40%, transparent);
}

.btn-run-confirm:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ── Agent Builder 弹窗 ── */
.builder-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.builder-dialog {
  width: 560px;
  max-width: calc(100vw - 40px);
  max-height: calc(100vh - 60px);
  overflow-y: auto;
  background: var(--bg-card, #fff);
  border-radius: var(--radius-lg, 12px);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.builder-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.builder-title {
  font-size: 15px;
  font-weight: 500;
}
.builder-close {
  font-size: 18px;
  cursor: pointer;
  color: var(--text-tertiary, #999);
  padding: 0 6px;
}
.builder-close:hover {
  color: var(--text-primary, #333);
}
.builder-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.builder-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.builder-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.builder-label {
  font-size: 12px;
  color: var(--text-secondary, #666);
}
.builder-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 10px;
  border: 1px solid var(--border-color, #d9d9d9);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-input, #fff);
  color: var(--text-primary, #333);
}
.builder-radio-group {
  display: flex;
  gap: 16px;
}
.builder-radio {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
}
.builder-error {
  color: #ff4d4f;
  font-size: 12px;
}

.builder-upload-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.builder-file-input {
  flex: 1;
  padding: 6px 8px;
  font-size: 12px;
}

.builder-upload-hint {
  font-size: 11px;
  color: var(--text-secondary, #8b949e);
  white-space: nowrap;
}

.builder-upload-list {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.builder-upload-item {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-secondary, #f6f8fa);
  border: 1px solid var(--border-color, #d0d7de);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
}

.upload-item-icon { font-size: 12px; }
.upload-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.upload-item-size { color: var(--text-secondary, #8b949e); font-size: 11px; }
.upload-item-remove {
  cursor: pointer;
  color: #ff4d4f;
  padding: 0 2px;
  font-size: 12px;
}
.upload-item-remove:hover { opacity: 0.7; }

.builder-steps {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 8px 0 10px;
  padding: 8px 10px;
  background: var(--bg-secondary, #f6f8fa);
  border: 1px dashed var(--border-color, #d0d7de);
  border-radius: 8px;
}
.builder-step {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.step-num {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--brand, #185FA5);
  color: #fff;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.step-t {
  font-weight: 500;
  color: var(--text-primary, #24292f);
  flex-shrink: 0;
}
.step-d {
  color: var(--text-secondary, #57606a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.builder-test {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-success, #3b6d11);
  border-radius: 8px;
  background: var(--success-bg, #f0faf0);
}
.builder-test-title {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 8px;
}
.builder-test-inputs {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}
.builder-test-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.builder-test-key {
  width: 130px;
  font-size: 12px;
  color: var(--text-secondary, #57606a);
  text-align: right;
  flex-shrink: 0;
}
.builder-test-empty {
  font-size: 12px;
  color: var(--text-secondary, #57606a);
  margin-bottom: 8px;
}
.builder-test-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.builder-test-note {
  font-size: 11px;
  color: var(--warning, #9a6700);
}
.builder-test-output {
  margin-top: 8px;
  max-height: 200px;
  overflow: auto;
  background: #0d1117;
  color: #7ee787;
  font-size: 12px;
  padding: 8px 10px;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-all;
}

.btn-recipe {
  background: var(--brand-light, #185FA5);
  color: #fff;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.btn-recipe:hover { opacity: 0.88; }

/* 顶栏「＋ 新建」下拉菜单 */
.toolbar-dropdown {
  position: relative;
  display: inline-block;
}
.toolbar-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 100;
  min-width: 220px;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-color, #d0d7de);
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}
.toolbar-menu-item {
  padding: 8px 10px;
  font-size: 13px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-primary, #24292f);
}
.toolbar-menu-item:hover { background: var(--bg-secondary, #f6f8fa); }
.toolbar-menu-item.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}

/* 左侧 Agent 分组 */
.handler-groups { display: flex; flex-direction: column; gap: 2px; }
.handler-group { border-radius: 6px; }
.handler-group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary, #57606a);
  cursor: pointer;
  border-radius: 6px;
  user-select: none;
}
.handler-group-title:hover { background: var(--bg-secondary, #f6f8fa); }
.handler-group-arrow { font-size: 10px; width: 12px; }
.handler-group-name { flex: 1; }
.handler-group-count {
  font-size: 11px;
  background: var(--bg-secondary, #f6f8fa);
  border-radius: 8px;
  padding: 0 6px;
  color: var(--text-tertiary, #8b949e);
}
.handler-group-body { display: flex; flex-direction: column; gap: 1px; margin: 2px 0 4px; }

.recipe-dialog { width: 640px; max-width: 92vw; }
.recipe-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 420px;
  overflow: auto;
}
.recipe-item {
  border: 1px solid var(--border-color, #d0d7de);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-secondary, #f6f8fa);
}
.recipe-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.recipe-item-label { font-size: 13px; font-weight: 500; }
.recipe-tag {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
}
.tag-builtin { background: #185FA5; color: #fff; }
.tag-user { background: #0F6E56; color: #fff; }
.tag-scenario { background: #FAEEDA; color: #854F0B; }
.recipe-node-count { margin-left: auto; font-size: 11px; color: var(--text-secondary, #57606a); }
.recipe-item-desc {
  font-size: 12px;
  color: var(--text-secondary, #57606a);
  margin: 6px 0 8px;
}
.recipe-item-actions { display: flex; gap: 8px; }
.recipe-empty {
  text-align: center;
  color: var(--text-secondary, #57606a);
  padding: 24px 0;
  font-size: 13px;
}
.builder-footer-inline {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.builder-tpl-search {
  margin-bottom: 6px;
}
.builder-tpl-empty {
  font-size: 12px;
  color: var(--text-secondary, #57606a);
  padding: 4px 0;
}

/* 模板搜索空态：三按钮引导 */
.tpl-empty {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border: 1px dashed var(--border-color, #d0d7de);
  border-radius: 10px;
}
.tpl-empty-title { font-size: 13px; font-weight: 500; color: var(--text-primary, #24292f); }
.tpl-empty-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.tpl-empty-feedback { display: flex; gap: 8px; }
.tpl-empty-feedback .builder-input { flex: 1; }
.tpl-empty-done { font-size: 12px; color: #3b6d11; }

/* P1 三步向导 */
.builder-dialog-wizard { width: 620px; max-width: 94vw; }
.wizard-steps {
  display: flex;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary, #57606a);
}
.wizard-steps span { padding: 2px 8px; border-radius: 10px; }
.wizard-steps .is-active { background: var(--brand, #185FA5); color: #fff; }
.wizard-steps .is-done { color: var(--brand, #185FA5); }
.wizard-step-body { display: flex; flex-direction: column; gap: 10px; }

.tpl-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  max-height: 320px;
  overflow: auto;
}
.tpl-card {
  border: 1px solid var(--border-color, #d0d7de);
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  background: var(--bg-secondary, #f6f8fa);
  transition: border-color 0.15s;
}
.tpl-card:hover { border-color: var(--brand, #185FA5); }
.tpl-card.is-selected {
  border-color: var(--brand, #185FA5);
  background: var(--info-bg, #e6f1fb);
}
.tpl-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.tpl-card-name { font-size: 13px; font-weight: 500; flex: 1; }
.tpl-card-badge { font-size: 11px; padding: 0 8px; border-radius: 8px; }
.badge-tool { background: #F1EFE8; color: #5F5E5A; }
.badge-ai { background: #EEEDFE; color: #534AB7; }
.tpl-card-desc {
  font-size: 12px;
  color: var(--text-secondary, #57606a);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.field-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.field-key { flex: 2; }
.field-type { flex: 1; }
.field-remove {
  cursor: pointer;
  color: #ff4d4f;
  font-size: 12px;
  padding: 4px;
}
.field-remove:hover { opacity: 0.7; }
.field-param-label { width: 110px; font-size: 12px; color: var(--text-secondary, #57606a); flex-shrink: 0; }
.field-param-input { flex: 1; }
.field-param-check { width: 16px; height: 16px; }
.btn-add-field {
  border: 1px dashed var(--border-color, #d0d7de);
  background: transparent;
  color: var(--brand, #185FA5);
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
}
.btn-add-field:hover { border-color: var(--brand, #185FA5); }

.wizard-more { border: 1px solid var(--border-color, #d0d7de); border-radius: 8px; }
.wizard-more summary {
  font-size: 12px;
  color: var(--text-secondary, #57606a);
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
}
.wizard-more-body { padding: 4px 12px 12px; }

.builder-result-line {
  font-size: 13px;
  color: #3b6d11;
  margin-bottom: 8px;
}
.wizard-tips {
  font-size: 12px;
  color: var(--text-secondary, #57606a);
  text-align: center;
  padding-top: 6px;
}

.snapshot-dialog { width: 680px; max-width: 94vw; }
.snapshot-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 420px;
  overflow: auto;
}
.snapshot-item {
  border: 1px solid var(--border-color, #d0d7de);
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  background: var(--bg-secondary, #f6f8fa);
}
.snapshot-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.snapshot-status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.st-completed { background: #3b6d11; }
.st-failed { background: #E24B4A; }
.st-warning { background: #BA7517; }
.st-unknown { background: #888780; }
.snapshot-label { font-size: 13px; font-weight: 500; }
.snapshot-handler { font-size: 11px; color: var(--text-secondary, #57606a); }
.snapshot-meta { margin-left: auto; font-size: 11px; color: var(--text-secondary, #57606a); }
.snapshot-toggle { font-size: 12px; color: var(--text-secondary, #57606a); }
.snapshot-detail { margin-top: 8px; }
.snapshot-sub { font-size: 12px; color: var(--text-secondary, #57606a); margin-bottom: 4px; }
.snapshot-output {
  max-height: 220px;
  overflow: auto;
  background: #0d1117;
  color: #7ee787;
  font-size: 12px;
  padding: 8px 10px;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-all;
}
.snapshot-empty {
  text-align: center;
  color: var(--text-secondary, #57606a);
  padding: 20px 0;
  font-size: 13px;
}
.builder-resources {
  border: 1px solid var(--border-color, #e6edf4);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--bg-alt, #f8fafc);
}
.builder-resources-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary, #333);
  margin-bottom: 8px;
}
.builder-resources-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.builder-resources-sub {
  font-size: 11px;
  color: var(--text-tertiary, #888);
  margin-bottom: 4px;
}
.builder-resources-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.builder-resources-item {
  font-size: 12px;
  line-height: 1.5;
}
.builder-resources-item code {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  background: var(--bg-secondary, #f0f0f0);
  padding: 1px 4px;
  border-radius: 3px;
}
.builder-resources-empty {
  font-size: 12px;
  color: var(--text-tertiary, #999);
}
.t-type {
  color: var(--text-tertiary, #888);
  font-size: 11px;
  margin-left: 4px;
}
.t-required {
  color: #ff4d4f;
  font-size: 11px;
  margin-left: 4px;
}
.t-optional {
  color: #999;
  font-size: 11px;
  margin-left: 4px;
}
.t-desc {
  color: var(--text-tertiary, #888);
  font-size: 11px;
  margin-left: 6px;
}
.t-example {
  color: #185fa5;
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  padding-left: 10px;
}
.builder-result {
  color: #52c41a;
  font-size: 12px;
}
.builder-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
}
.builder-footer .builder-result {
  margin-right: auto;
}
.btn-builder {
  border-color: var(--brand, #1890ff);
  color: var(--brand, #1890ff);
}

/* 另存为 Modal 提示文字 */
.save-as-hint {
  margin-bottom: 12px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}
</style>
