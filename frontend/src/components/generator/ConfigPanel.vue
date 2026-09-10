<template>
  <div>
    <!-- 遮罩层 -->
    <div class="overlay" :class="{ show: visible }" @click="close"></div>

    <!-- 配置面板 -->
    <div class="config-panel" :class="{ open: visible }">
      <div class="config-panel-header">
        <h2>配置</h2>
        <div class="header-actions">
          <button class="help-btn icon-btn icon-tooltip tooltip-below" type="button" @click="openHelp" data-tooltip="配置帮助" aria-label="配置帮助">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12" y2="17"/></svg>
          </button>
          <button class="close-btn icon-btn icon-tooltip tooltip-below" @click="close" data-tooltip="关闭" aria-label="关闭">×</button>
        </div>
      </div>

      <!-- Tab 导航 -->
      <div class="config-tabs">
        <button
          class="config-tab"
          :class="{ active: activeTab === 'model' }"
          @click="activeTab = 'model'"
        >
          <span class="tab-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg></span>
          <span class="tab-label">模型</span>
        </button>
        <button
          class="config-tab"
          :class="{ active: activeTab === 'service' }"
          @click="activeTab = 'service'"
        >
          <span class="tab-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span>
          <span class="tab-label">外部服务</span>
        </button>
      </div>

      <div class="config-panel-body">
        <!-- ==================== 模型 Tab ==================== -->
        <template v-if="activeTab === 'model'">
          <!-- ==================== 模型库（一等公民） ==================== -->
          <div class="config-section-title">
            <span class="section-badge model">模型库</span>
            <span class="section-desc">
              {{ (formData.models?.length || 0) ? `已添加 ${formData.models.length} 个模型，供槽位引用` : '添加模型，槽位从库中引用' }}
            </span>
            <button type="button" class="add-model-inline-btn" @click="addModel">+ 添加</button>
          </div>

          <div v-if="(formData.models?.length || 0) > 10" class="model-search">
            <input type="text" v-model="modelSearch" placeholder="按名称筛选模型" autocomplete="off" spellcheck="false" />
          </div>

          <div v-if="!formData.models || formData.models.length === 0" class="model-empty">
            暂无模型，点击上方「+ 添加」创建
          </div>

          <div v-for="(m, idx) in displayedModels" :key="m.id" class="model-card" :class="{ 'is-collapsed': !expandedModels[m.id] }">
            <div class="model-card-header">
              <button type="button" class="model-collapse" @click="toggleModelExpand(m.id)">
                <span class="model-collapse-arrow">{{ expandedModels[m.id] ? '▾' : '▸' }}</span>
                <span class="model-title-group">
                  <span class="model-index" :title="m.name || m.model">
                    模型 #{{ idx + 1 }}<span v-if="m.name || m.model"> · {{ m.name || m.model }}</span>
                  </span>
                  <span class="capability-badge capability-badge--mini" :class="(m.verified && m.capability) ? m.capability : 'unknown'">{{ modelStatusLabel(m) }}</span>
                  <span v-if="isModelInUse(m.id)" class="used-dot" title="已被槽位引用">●</span>
                </span>
              </button>
            </div>

            <div v-show="expandedModels[m.id]" class="model-card-body">
            <!-- 展开态工具条：自动识别能力 / 编辑 / 删除 -->
            <div class="model-card-toolbar">
              <button type="button" class="model-detect" :disabled="detecting[m.id]" @click="detectModelCapability(m)">
                {{ detecting[m.id] ? '识别中…' : '自动识别能力' }}
              </button>
              <button type="button" class="model-edit" @click="focusModelName(m.id)">编辑</button>
              <button type="button" class="model-remove-icon" :disabled="detecting[m.id]" @click="confirmRemoveModel(m.id)" title="删除模型" aria-label="删除模型">🗑</button>
            </div>


            <div class="config-row">
              <div class="config-group">
                <label>名称</label>
                <input :id="'model-name-' + m.id" type="text" v-model="m.name" placeholder="主 Key（可选）" autocomplete="off" />
              </div>
              <div class="config-group">
                <label>Model <span class="required">*</span></label>
                <input type="text" v-model="m.model" placeholder="claude-opus-4-8" autocomplete="off" autocapitalize="off" spellcheck="false" @input="markUnverified(m)" />
              </div>
            </div>

            <div class="config-group">
              <label>Base URL</label>
              <input type="text" v-model="m.baseURL" placeholder="https://api.anthropic.com" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" @input="markUnverified(m)" />
            </div>

            <div class="config-group">
              <label>API Key <span class="required">*</span></label>
              <div class="input-with-toggle">
                <input
                  :type="passwordVisible['modelApiKey:' + m.id] ? 'text' : 'password'"
                  v-model="m.apiKey"
                  placeholder="sk-ant-oat01-..."
                  autocomplete="new-password"
                  autocapitalize="off"
                  spellcheck="false"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  @input="markUnverified(m)"
                />
                <button
                  type="button"
                  class="toggle-visibility-btn icon-tooltip"
                  @click="togglePasswordVisibility('modelApiKey:' + m.id)"
                  :data-tooltip="passwordVisible['modelApiKey:' + m.id] ? '隐藏' : '显示'"
                  :aria-label="passwordVisible['modelApiKey:' + m.id] ? '隐藏 API Key' : '显示 API Key'"
                >
                  <svg v-if="!passwordVisible['modelApiKey:' + m.id]" class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </button>
              </div>
            </div>

            <div class="config-row">
              <div class="config-group">
                <label>接口协议</label>
                <select v-model="m.providerType" class="provider-select" @change="markUnverified(m)">
                  <option value="openai-compatible">OpenAI 兼容（/v1/chat/completions）</option>
                  <option value="anthropic">Anthropic 原生协议</option>
                  <option value="auto">Auto（自动识别）</option>
                </select>
              </div>
              <div class="config-group">
                <label>能力</label>
                <div class="capability-display">
                  <span class="capability-badge" :class="(m.verified && m.capability) ? m.capability : 'unknown'">
                    <svg class="capability-badge-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    {{ modelStatusLabel(m) }}
                  </span>
                </div>
                <p v-if="!detectResults[m.id]" class="capability-hint">
                  不确定模型能力？点击右上角「自动识别能力」按钮进行检测。
                </p>
                <div v-if="detectResults[m.id]" class="detect-results">
                  <span class="detect-tag" :class="detectResults[m.id].vision?.success ? 'ok' : 'fail'">视觉 {{ detectResults[m.id].vision?.success ? '✓' : '✗' }}</span>
                  <span class="detect-tag" :class="detectResults[m.id].text?.success ? 'ok' : 'fail'">文本 {{ detectResults[m.id].text?.success ? '✓' : '✗' }}</span>
                  <span class="detect-tag" :class="detectResults[m.id].reasoning?.success ? 'ok' : 'fail'">推理 {{ detectResults[m.id].reasoning?.success ? '✓' : '✗' }}</span>
                  <span v-if="detectResults[m.id].reasoning?.success" class="detect-hint">推理模型</span>
                </div>
              </div>
            </div>

            <div class="config-row">
              <div class="config-group">
                <label>RPM（0=不限）</label>
                <input type="number" min="0" v-model.number="m.rpm" placeholder="0" />
              </div>
              <div class="config-group">
                <label>权重</label>
                <input type="number" min="1" v-model.number="m.weight" placeholder="10" />
              </div>
              <div class="config-group">
                <label>Temperature</label>
                <input type="number" step="0.1" min="0" max="2" v-model.number="m.temperature" placeholder="自动" />
              </div>
            </div>
            </div>
          </div>

          <button type="button" class="add-model-btn" @click="addModel">+ 添加模型</button>

          <!-- 模式选择器 -->
          <div class="mode-selector">
            <button
              class="mode-btn"
              :class="{ active: modelMode === 'unified' }"
              @click="switchMode('unified')"
              type="button"
            >
              <span class="mode-radio"></span>
              <span class="mode-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg></span>
              <span class="mode-label">统一大模型</span>
              <span class="mode-hint">一组密钥同时处理视觉+文本</span>
            </button>
            <button
              class="mode-btn"
              :class="{ active: modelMode === 'separate' }"
              @click="switchMode('separate')"
              type="button"
            >
              <span class="mode-radio"></span>
              <span class="mode-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="3"/><path d="M12 8a4 4 0 0 1 4-4h4"/><path d="M12 16a4 4 0 0 1-4 4H4"/><path d="M12 8a4 4 0 0 0-4-4H4"/><path d="M12 16a4 4 0 0 0 4 4h4"/></svg></span>
              <span class="mode-label">分别配置</span>
              <span class="mode-hint">视觉和文本使用不同模型</span>
            </button>
          </div>

          <!-- ==================== 槽位绑定：统一模式 ==================== -->
          <template v-if="modelMode === 'unified'">
            <div class="unified-notice">
              统一模式下请确保所选模型<strong>具备视觉能力</strong>（支持图像输入），否则 Preview 阶段会失败
            </div>

            <div class="slot-card">
              <div class="slot-card-header">
                <span class="sub-title-badge vision">统一槽位</span>
                <span class="sub-title-desc">同一模型处理视觉 + 文本</span>
              </div>

              <div class="config-group">
                <label>主模型 <span class="required">*</span></label>
                <select v-model="formData.binding.unified.primaryId" class="provider-select">
                  <option value="" disabled>请选择主模型</option>
                  <option v-for="c in slotOptions('unified')" :key="c.id" :value="c.id">{{ c.name || c.model || c.id }}</option>
                </select>
              </div>

              <div class="config-group">
                <label>模型池（可选）</label>
                <div v-if="poolCandidates('unified').length" class="pool-check-list">
                  <label v-for="c in poolCandidates('unified')" :key="c.id" class="pool-check-item">
                    <input type="checkbox" :value="c.id" v-model="formData.binding.unified.poolIds" />
                    <span>{{ c.name || c.model || c.id }}</span>
                  </label>
                </div>
                <div v-else class="hint">暂无其他可加入池的模型（池成员须支持视觉）</div>
                <div class="hint">勾选后与主模型一起加权轮询 + 熔断故障转移；留空则只用主模型</div>
              </div>
            </div>
          </template>

          <!-- ==================== 槽位绑定：分类模式 ==================== -->
          <template v-else>
            <div class="slot-card">
              <div class="slot-card-header">
                <span class="sub-title-badge text">文本槽位</span>
                <span class="sub-title-desc">Figma/req 代码生成与审查</span>
              </div>

              <div class="config-group">
                <label>主模型 <span class="required">*</span></label>
                <select v-model="formData.binding.text.primaryId" class="provider-select">
                  <option value="" disabled>请选择主模型</option>
                  <option v-for="c in slotOptions('text')" :key="c.id" :value="c.id">{{ c.name || c.model || c.id }}</option>
                </select>
              </div>

              <div class="config-group">
                <label>模型池（可选）</label>
                <div v-if="poolCandidates('text').length" class="pool-check-list">
                  <label v-for="c in poolCandidates('text')" :key="c.id" class="pool-check-item">
                    <input type="checkbox" :value="c.id" v-model="formData.binding.text.poolIds" />
                    <span>{{ c.name || c.model || c.id }}</span>
                  </label>
                </div>
                <div v-else class="hint">暂无其他可加入池的模型</div>
              </div>
            </div>

            <div class="slot-card">
              <div class="slot-card-header">
                <span class="sub-title-badge vision">视觉槽位</span>
                <span class="sub-title-desc">Preview 阶段图像分析</span>
              </div>

              <div class="config-group">
                <label>主模型 <span class="required">*</span></label>
                <select v-model="formData.binding.vision.primaryId" class="provider-select">
                  <option value="" disabled>请选择主模型</option>
                  <option v-for="c in slotOptions('vision')" :key="c.id" :value="c.id">{{ c.name || c.model || c.id }}</option>
                </select>
              </div>

              <div class="config-group">
                <label>模型池（可选）</label>
                <div v-if="poolCandidates('vision').length" class="pool-check-list">
                  <label v-for="c in poolCandidates('vision')" :key="c.id" class="pool-check-item">
                    <input type="checkbox" :value="c.id" v-model="formData.binding.vision.poolIds" />
                    <span>{{ c.name || c.model || c.id }}</span>
                  </label>
                </div>
                <div v-else class="hint">暂无其他可加入池的模型</div>
              </div>
            </div>
          </template>

        </template>

        <!-- ==================== 外部服务 Tab ==================== -->
        <template v-if="activeTab === 'service'">
          <!-- 连接状态总览 -->
          <div class="service-status-overview">
            <div class="service-status-item">
              <span class="status-icon">
                {{ formData.figmaToken ? '✓' : '✗' }}
              </span>
              <span class="status-label">Figma</span>
              <span class="status-desc">{{ formData.figmaToken ? '已配置' : '未配置' }}</span>
              <button
                v-if="!formData.figmaToken"
                class="status-action-btn"
                @click="scrollToField('figmaToken')"
              >
                去配置
              </button>
              <button class="status-help-link" type="button" @click="openTokenGuide('figma')">
                获取教程 ›
              </button>
            </div>
            <div class="service-status-item">
              <span class="status-icon">
                {{ formData.apifoxToken ? '✓' : '✗' }}
              </span>
              <span class="status-label">Apifox</span>
              <span class="status-desc">{{ formData.apifoxToken ? '已配置' : '未配置' }}</span>
              <button
                v-if="!formData.apifoxToken"
                class="status-action-btn"
                @click="scrollToField('apifoxToken')"
              >
                去配置
              </button>
              <button class="status-help-link" type="button" @click="openTokenGuide('apifox')">
                获取教程 ›
              </button>
            </div>
            <div class="service-status-item">
              <span class="status-icon">
                {{ formData.gitlabToken ? '✓' : '✗' }}
              </span>
              <span class="status-label">GitLab</span>
              <span class="status-desc">{{ formData.gitlabToken ? '已配置' : '未配置' }}</span>
              <button
                v-if="!formData.gitlabToken"
                class="status-action-btn"
                @click="scrollToField('gitlabToken')"
              >
                去配置
              </button>
              <button class="status-help-link" type="button" @click="openTokenGuide('gitlab')">
                获取教程 ›
              </button>
            </div>
          </div>

          <!-- Figma 配置 -->
          <div class="config-section-title" v-feature="'figma.integration'">
            <span class="section-badge figma">Figma</span>
            <span class="section-desc">设计稿访问令牌</span>
          </div>

          <div class="config-group" v-feature="'figma.integration'">
            <label for="figmaToken">Figma Access Token</label>
            <div class="input-with-toggle">
              <input
                :type="passwordVisible.figmaToken ? 'text' : 'password'"
                id="figmaToken"
                name="mcFigmaAccessToken"
                v-model="formData.figmaToken"
                placeholder="figd_..."
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
              />
              <button
                type="button"
                class="toggle-visibility-btn icon-tooltip"
                @click="togglePasswordVisibility('figmaToken')"
                :data-tooltip="passwordVisible.figmaToken ? '隐藏' : '显示'"
                :aria-label="passwordVisible.figmaToken ? '隐藏' : '显示'"
              >
                <svg v-if="!passwordVisible.figmaToken" class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              </button>
            </div>
            <div class="hint">从 Figma Settings → Account → Personal Access Tokens 获取</div>
            <!-- 测试按钮 -->
            <div class="test-section">
              <button
                type="button"
                class="test-btn"
                @click="runTest('figma', 'test-figma', { token: formData.figmaToken })"
                :disabled="testResults.figma.loading || !formData.figmaToken"
              >
                <span v-if="testResults.figma.loading" class="spinner"></span>
                <span v-else>测试 Figma Token</span>
              </button>
              <div v-if="testResults.figma.success !== undefined" class="test-results">
                <div class="test-result-item" :class="{ success: testResults.figma.success, error: !testResults.figma.success }">
                  <span class="result-icon">{{ testResults.figma.success ? '✓' : '✗' }}</span>
                  <span class="result-text">
                    {{ testResults.figma.message }}
                    <span v-if="testResults.figma.latency" class="latency">({{ testResults.figma.latency }}ms)</span>
                    <div v-if="testResults.figma.detail" class="test-result-detail">{{ testResults.figma.detail }}</div>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Apifox 配置 -->
          <div class="config-section-title">
            <span class="section-badge apifox">Apifox</span>
            <span class="section-desc">接口文档访问令牌</span>
          </div>

          <div class="config-group">
            <label for="apifoxToken">Apifox Access Token</label>
            <div class="input-with-toggle">
              <input
                :type="passwordVisible.apifoxToken ? 'text' : 'password'"
                id="apifoxToken"
                name="mcApifoxAccessToken"
                v-model="formData.apifoxToken"
                placeholder="Apifox 个人访问令牌"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
              />
              <button
                type="button"
                class="toggle-visibility-btn icon-tooltip"
                @click="togglePasswordVisibility('apifoxToken')"
                :data-tooltip="passwordVisible.apifoxToken ? '隐藏' : '显示'"
                :aria-label="passwordVisible.apifoxToken ? '隐藏' : '显示'"
              >
                <svg v-if="!passwordVisible.apifoxToken" class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              </button>
            </div>
            <div class="hint">头像 → 账号设置 → API 访问令牌</div>
            <!-- 测试按钮 -->
            <div class="test-section">
              <button
                type="button"
                class="test-btn"
                @click="runTest('apifox', 'test-apifox', { token: formData.apifoxToken })"
                :disabled="testResults.apifox.loading || !formData.apifoxToken"
              >
                <span v-if="testResults.apifox.loading" class="spinner"></span>
                <span v-else>测试 Apifox Token</span>
              </button>
              <div v-if="testResults.apifox.success !== undefined" class="test-results">
                <div class="test-result-item" :class="{ success: testResults.apifox.success, error: !testResults.apifox.success }">
                  <span class="result-icon">{{ testResults.apifox.success ? '✓' : '' }}</span>
                  <span class="result-text">
                    {{ testResults.apifox.message }}
                    <span v-if="testResults.apifox.latency" class="latency">({{ testResults.apifox.latency }}ms)</span>
                    <div v-if="testResults.apifox.detail" class="test-result-detail">{{ testResults.apifox.detail }}</div>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- GitLab 配置 -->
          <div class="config-section-title">
            <span class="section-badge gitlab">GitLab</span>
            <span class="section-desc">代码仓库访问令牌（推送组件）</span>
          </div>

          <div class="config-group">
            <label for="gitlabToken">GitLab Access Token</label>
            <div class="input-with-toggle">
              <input
                :type="passwordVisible.gitlabToken ? 'text' : 'password'"
                id="gitlabToken"
                name="mcGitlabAccessToken"
                v-model="formData.gitlabToken"
                placeholder="glpat-xxxxxxxxxxxx"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
              />
              <button
                type="button"
                class="toggle-visibility-btn icon-tooltip"
                @click="togglePasswordVisibility('gitlabToken')"
                :data-tooltip="passwordVisible.gitlabToken ? '隐藏' : '显示'"
                :aria-label="passwordVisible.gitlabToken ? '隐藏' : '显示'"
              >
                <svg v-if="!passwordVisible.gitlabToken" class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              </button>
            </div>
            <div class="hint">从 GitLab Settings → Access Tokens 获取（勾选 api 权限）</div>
            <!-- 测试按钮 -->
            <div class="test-section">
              <button
                type="button"
                class="test-btn"
                @click="runTest('gitlab', 'test-gitlab', { token: formData.gitlabToken })"
                :disabled="testResults.gitlab.loading || !formData.gitlabToken"
              >
                <span v-if="testResults.gitlab.loading" class="spinner"></span>
                <span v-else>测试 GitLab Token</span>
              </button>
              <div v-if="testResults.gitlab.success !== undefined" class="test-results">
                <div class="test-result-item" :class="{ success: testResults.gitlab.success, error: !testResults.gitlab.success }">
                  <span class="result-icon">{{ testResults.gitlab.success ? '✓' : '✗' }}</span>
                  <span class="result-text">
                    {{ testResults.gitlab.message }}
                    <span v-if="testResults.gitlab.latency" class="latency">({{ testResults.gitlab.latency }}ms)</span>
                    <div v-if="testResults.gitlab.detail" class="test-result-detail">{{ testResults.gitlab.detail }}</div>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- 固定底部操作区 -->
      <div class="config-panel-footer">
        <button class="btn btn-primary save-config-btn" @click="saveConfig">保存配置</button>
        <button class="btn btn-text clear-config-btn" @click="clearConfig">清除配置</button>
      </div>
    </div>
  </div>

  <!-- Teleport tooltip to body to escape overflow clipping -->
  <Teleport to="body">
    <div
      v-if="tempTooltipVisible"
      class="mc-tooltip-popup"
      :style="{ top: tooltipPos.y + 'px', left: tooltipPos.x + 'px' }"
    >
      常见模型 Temperature 推荐：<br>
      • claude 系列：0（默认，不填即 0）<br>
      • gpt-4o / gpt-5 / gpt-5.5：0<br>
      • qwen-vl-max：0<br>
      • <strong>kimi-k3：1</strong>（推理模型，强制）<br>
      • <strong>deepseek-reasoner：1</strong>（推理模型，强制）<br>
      • glm-4v：0.7<br>
      <br>
      留空 = 自动（默认 0）
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/config'
import type { ApiConfig, ProviderConfig, ModelEntry } from '@/types/api'
import { Modal, message } from 'ant-design-vue'
import http from '@/core/http'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const configStore = useConfigStore()
const router = useRouter()

// Temperature tooltip state (teleported to body)
const tempTooltipVisible = ref(false)
const tooltipPos = ref({ x: 0, y: 0 })

function showUnifiedTempTooltip(e: MouseEvent) {
  const rect = (e.target as HTMLElement).getBoundingClientRect()
  tooltipPos.value = { x: rect.left + rect.width / 2 - 160, y: rect.top + rect.height + 8 }
  tempTooltipVisible.value = true
}
function showProviderTempTooltip(e: MouseEvent) {
  const rect = (e.target as HTMLElement).getBoundingClientRect()
  tooltipPos.value = { x: rect.left + rect.width / 2 - 160, y: rect.top + rect.height + 8 }
  tempTooltipVisible.value = true
}
function hideUnifiedTempTooltip() { tempTooltipVisible.value = false }
function hideProviderTempTooltip() { tempTooltipVisible.value = false }

// Tab 状态
const activeTab = ref<'model' | 'service'>('model')

// 环境判定：dev 模式保留「本地 + 后端合并」兜底，保护个人模型库不被共享 dev-local 覆盖；
// prod 模式永远以后端为唯一源头，不先渲染 localStorage（避免错误数据闪烁）。
const isDev = import.meta.env.DEV

// 模型配置模式：'separate'（分别配置）或 'unified'（统一大模型）
const modelMode = ref<'separate' | 'unified'>('separate')

// 供应商池折叠状态
const providerPoolOpen = ref(false)

// 切换供应商池展开/折叠
function toggleProviderPool() {
  providerPoolOpen.value = !providerPoolOpen.value
}

// 字段错误信息
const fieldErrors = ref<Record<string, string>>({})

// ─── 配置测试状态 ───
interface TestResultInfo {
  loading: boolean
  success?: boolean
  message?: string
  detail?: string
  latency?: number
}

const testResults = ref<Record<string, TestResultInfo>>({
  unifiedText: { loading: false },
  unifiedVision: { loading: false },
  vision: { loading: false },
  text: { loading: false },
  figma: { loading: false },
  apifox: { loading: false },
  gitlab: { loading: false },
})

async function runTest(
  type: string,
  endpoint: string,
  payload: Record<string, string | number | undefined>
) {
  const r = testResults.value[type]
  r.loading = true
  r.success = undefined
  r.message = undefined
  r.detail = undefined
  r.latency = undefined
  try {
    const res = await http.post(`/api/config/${endpoint}`, payload)
    // 兼容统一响应体 { success, data: { latency, detail } } 与旧扁平结构
    const outer = res && typeof res === 'object' && 'success' in res ? res : null
    const body = outer?.data ?? res
    const ok = outer ? outer.success === true : body?.success === true
    r.loading = false
    r.success = ok
    r.latency = body?.latency
    r.message = ok
      ? body?.detail || '连接正常'
      : body?.error || outer?.message || '测试失败'
    r.detail = ok ? undefined : body?.detail || undefined
  } catch (e: any) {
    r.loading = false
    r.success = false
    const errMsg = e?.data?.message || e?.message || String(e)
    const msg = typeof errMsg === 'string' ? errMsg : String(errMsg)
    r.message = `网络错误: ${msg}`
  }
}

function testUnified() {
  runTest('unifiedText', 'test-text', {
    apiKey: formData.value.unifiedApiKey,
    baseURL: formData.value.unifiedBaseURL,
    model: formData.value.unifiedModel,
    temperature: formData.value.unifiedTemperature,
    providerType: formData.value.unifiedProviderType || 'auto',
  })

  runTest('unifiedVision', 'test-vision', {
    apiKey: formData.value.unifiedApiKey,
    baseURL: formData.value.unifiedBaseURL,
    model: formData.value.unifiedModel,
    temperature: formData.value.unifiedTemperature,
    providerType: formData.value.unifiedProviderType || 'auto',
  })
}

// ─── 供应商池测试状态 ───
interface ProviderTestState {
  loading: boolean
  text?: TestResultInfo
  vision?: TestResultInfo
}

const providerTestStates = ref<Record<string, ProviderTestState>>({})

function providerTestLoading(id: string): boolean {
  return providerTestStates.value[id]?.loading ?? false
}

function providerTestResult(id: string): ProviderTestState | undefined {
  return providerTestStates.value[id]
}

async function testProvider(p: ProviderConfig) {
  if (!p.apiKey || !p.baseURL || !p.model) {
    message.warning('请先填写 API Key、Base URL 和 Model')
    return
  }

  // 先写入 loading 状态（让按钮显示 spinner）
  providerTestStates.value[p.id] = { loading: true }

  try {
    const data = await http.post('/api/config/test-provider', {
      apiKey: p.apiKey,
      baseURL: p.baseURL,
      model: p.model,
      temperature: p.temperature,
      providerType: p.providerType || 'auto',
    })
    // Node 后端会把业务字段统一包进 data，供应商池测试需兼容 { data: { text, vision } } 与旧扁平结构
    const result = data?.data || data
    const textResult = result?.text || {}
    const visionResult = result?.vision || {}

    // 整体替换（不用 mutate），确保 Vue 响应式一定触发模板重渲染
    providerTestStates.value[p.id] = {
      loading: false,
      text: {
        loading: false,
        success: textResult.success,
        message: textResult.success ? (textResult.detail || '连接正常') : (textResult.error || '测试失败'),
        detail: textResult.detail,
        latency: textResult.latency,
      },
      vision: {
        loading: false,
        success: visionResult.success,
        message: visionResult.success ? (visionResult.detail || '识图能力正常') : (visionResult.error || '不支持识图'),
        detail: visionResult.detail,
        latency: visionResult.latency,
      },
    }

    const textOk = textResult.success === true
    const visionOk = visionResult.success === true

    if (textOk && visionOk) {
      message.success(`供应商 ${p.name || '未命名'} 测试通过：文本 + 识图均正常`)
    } else if (textOk && !visionOk) {
      message.warning(`供应商 ${p.name || '未命名'} 文本模型正常，但不支持识图能力`)
    } else if (!textOk && visionOk) {
      message.warning(`供应商 ${p.name || '未命名'} 识图能力正常，但文本模型连接失败`)
    } else {
      message.error(`供应商 ${p.name || '未命名'} 测试失败：文本和识图均异常`)
    }
  } catch (e: any) {
    // 整体替换（同上）
    providerTestStates.value[p.id] = {
      loading: false,
      text: { loading: false, success: false, message: `网络错误: ${e.message}` },
      vision: { loading: false, success: false, message: `网络错误: ${e.message}` },
    }
    message.error(`测试请求失败: ${e.message}`)
  }
}

// 密码字段可见性状态
const passwordVisible = ref<Record<string, boolean>>({
  unifiedApiKey: false,
  visionApiKey: false,
  textApiKey: false,
  figmaToken: false,
  apifoxToken: false,
  gitlabToken: false,
})

// 切换密码字段可见性
function togglePasswordVisibility(fieldId: string) {
  passwordVisible.value[fieldId] = !passwordVisible.value[fieldId]
}

// 表单数据
const formData = ref<ApiConfig & {
  modelMode?: string
  unifiedApiKey?: string
  unifiedBaseURL?: string
  unifiedModel?: string
  unifiedProviderType?: string
  unifiedTemperature?: number
  visionTemperature?: number
  textTemperature?: number
  visionProviderType?: string
  textProviderType?: string
  apifoxToken?: string
  gitlabToken?: string
}>({
  figmaToken: '',
  apifoxToken: '',
  gitlabToken: '',
  visionApiKey: '',
  visionBaseURL: '',
  visionModel: '',
  visionProviderType: 'auto',
  textApiKey: '',
  textBaseURL: '',
  textModel: '',
  textProviderType: 'auto',
  outputPath: '',
  modelMode: 'separate',
  unifiedApiKey: '',
  unifiedBaseURL: '',
  unifiedModel: '',
  unifiedProviderType: 'auto',
  unifiedTemperature: undefined,
  visionTemperature: undefined,
  textTemperature: undefined,
  providers: [],
  models: [],
  binding: {
    unified: { primaryId: '', poolIds: [] as string[] },
    text: { primaryId: '', poolIds: [] as string[] },
    vision: { primaryId: '', poolIds: [] as string[] },
  }
})

// 清理已删除供应商的测试状态
watch(
  () => formData.value.providers?.map(p => p.id),
  (ids) => {
    const idSet = new Set(ids || [])
    for (const key of Object.keys(providerTestStates.value)) {
      if (!idSet.has(key)) {
        delete providerTestStates.value[key]
      }
    }
  }
)

// 🆕 模型方案（Profile）状态
// 🆕 前端兜底迁移：legacy 字段 → models/binding（后端 getAiConfigWithProfiles 已迁移，
// 此处兜底 localStorage 旧配置）。确定性 id（legacy-* 前缀）保证幂等。
function migrateLegacyToModelsLocal(cfg: any): { models: ModelEntry[]; binding: any } {
  if (Array.isArray(cfg.models) && cfg.models.length) {
    return { models: cfg.models.map((m: any) => ({ ...m })), binding: cfg.binding || {} }
  }
  const models: ModelEntry[] = []
  const binding: any = {}
  const toEntry = (prefix: string, capability: 'both' | 'text' | 'vision', name: string): ModelEntry => ({
    id: `legacy-${prefix}`,
    name,
    apiKey: cfg[`${prefix}ApiKey`] ?? '',
    baseURL: cfg[`${prefix}BaseURL`] ?? '',
    model: cfg[`${prefix}Model`] ?? '',
    providerType: (cfg[`${prefix}ProviderType`] || 'auto') as any,
    capability,
    ...(cfg[`${prefix}Temperature`] != null ? { temperature: Number(cfg[`${prefix}Temperature`]) } : {}),
  })
  const providers = Array.isArray(cfg.providers) ? cfg.providers : []
  const providerToEntry = (p: any): ModelEntry => ({
    id: p.id || `legacy-provider-${models.length}`,
    name: p.name,
    apiKey: p.apiKey ?? '',
    baseURL: p.baseURL ?? '',
    model: p.model ?? '',
    providerType: (p.providerType || 'auto') as any,
    capability: (p.role === 'text' ? 'text' : p.role === 'vision' ? 'vision' : 'both') as any,
    ...(p.temperature != null ? { temperature: Number(p.temperature) } : {}),
    ...(p.rpm != null ? { rpm: Number(p.rpm) } : {}),
    ...(p.tpm != null ? { tpm: Number(p.tpm) } : {}),
    ...(p.weight != null ? { weight: Number(p.weight) } : {}),
  })

  if (cfg.modelMode === 'unified') {
    const primary = toEntry('unified', 'both', '主模型')
    models.push(primary)
    const poolIds: string[] = []
    for (const p of providers) {
      const e = providerToEntry(p)
      models.push(e)
      poolIds.push(e.id)
    }
    binding.unified = { primaryId: primary.id, poolIds }
  } else {
    const textPrimary = toEntry('text', 'text', '文本模型')
    const visionPrimary = toEntry('vision', 'vision', '视觉模型')
    models.push(textPrimary, visionPrimary)
    const textPool: string[] = []
    const visionPool: string[] = []
    for (const p of providers) {
      const role = p.role || 'both'
      const e = providerToEntry(p)
      if (!models.some((m) => m.id === e.id)) models.push(e)
      if (role === 'vision') visionPool.push(e.id)
      else if (role === 'text') textPool.push(e.id)
      else { textPool.push(e.id); visionPool.push(e.id) }
    }
    binding.text = { primaryId: textPrimary.id, poolIds: textPool }
    binding.vision = { primaryId: visionPrimary.id, poolIds: visionPool }
  }
  return { models, binding }
}

// 将一份配置对象映射到表单（localStorage / 后端方案共用）
function applyConfigToForm(cfg: any) {
  if (!cfg) return
  // 🆕 模型库 + 槽位绑定：优先读新结构，旧结构兜底迁移
  const { models, binding } = migrateLegacyToModelsLocal(cfg)
  // 🐛 用 ?? 不用 ||：空字符串是有意清空，不应 fallback
  formData.value = {
    figmaToken: cfg.figmaToken ?? '',
    apifoxToken: cfg.apifoxToken ?? '',
    gitlabToken: cfg.gitlabToken ?? '',
    visionApiKey: cfg.visionApiKey ?? '',
    visionBaseURL: cfg.visionBaseURL ?? '',
    visionModel: cfg.visionModel ?? '',
    visionProviderType: cfg.visionProviderType || 'auto',
    visionTemperature: cfg.visionTemperature ?? undefined,
    textApiKey: cfg.textApiKey ?? '',
    textBaseURL: cfg.textBaseURL ?? '',
    textModel: cfg.textModel ?? '',
    textProviderType: cfg.textProviderType || 'auto',
    textTemperature: cfg.textTemperature ?? undefined,
    outputPath: cfg.outputPath ?? '',
    modelMode: cfg.modelMode || 'separate',
    unifiedApiKey: cfg.unifiedApiKey ?? '',
    unifiedBaseURL: cfg.unifiedBaseURL ?? '',
    unifiedModel: cfg.unifiedModel ?? '',
    unifiedProviderType: cfg.unifiedProviderType || 'auto',
    unifiedTemperature: cfg.unifiedTemperature ?? undefined,
    providers: Array.isArray(cfg.providers) ? cfg.providers.map((p: any) => ({ ...p })) : [],
    models,
    binding: {
      unified: { primaryId: binding.unified?.primaryId ?? '', poolIds: Array.isArray(binding.unified?.poolIds) ? binding.unified.poolIds : [] },
      text: { primaryId: binding.text?.primaryId ?? '', poolIds: Array.isArray(binding.text?.poolIds) ? binding.text.poolIds : [] },
      vision: { primaryId: binding.vision?.primaryId ?? '', poolIds: Array.isArray(binding.vision?.poolIds) ? binding.vision.poolIds : [] },
    }
  }

  // 自动检测模式：如果已保存过 modelMode 就用保存的，否则根据 vision/text 是否一致推断
  if (cfg.modelMode) {
    modelMode.value = cfg.modelMode as 'separate' | 'unified'
  } else if (cfg.visionApiKey && cfg.textApiKey &&
             cfg.visionApiKey === cfg.textApiKey &&
             cfg.visionBaseURL === cfg.textBaseURL &&
             cfg.visionModel === cfg.visionModel) {
    // vision 和 text 完全一致 → 识别为统一模式
    modelMode.value = 'unified'
    formData.value.unifiedApiKey = cfg.visionApiKey
    formData.value.unifiedBaseURL = cfg.visionBaseURL || ''
    formData.value.unifiedModel = cfg.visionModel || ''
    formData.value.unifiedTemperature = cfg.visionTemperature ?? undefined
  } else {
    modelMode.value = 'separate'
  }
}

// 从后端加载配置（含模型库），异步与 localStorage 合并。
// 🐛 关键修复（2026-09-10）：dev 模式下后端固定返回 dev-local 共享配置（1 个模型），
// 若直接覆盖会清空用户 personal localStorage 里的 12 个模型（用户报「刷新后模型库变 1 个」）。
// 规则：后端模型与本地模型按 id 合并；同 id 后端字段优先；本地独有模型保留；binding 同理优先后端，
// 🏭 prod：后端为唯一源头，直接采用；🧪 dev：合并本地 + 后端，保护个人模型库不被共享 dev-local 覆盖。
async function loadConfigFromBackend(localCfg: any) {
  try {
    const d: any = await http.get('/api/config/ai')
    const data = d?.data ?? d
    if (data?.config) {
      const cfg = data.config
      const backendModels = Array.isArray(cfg.models) ? cfg.models : []
      const localModels = Array.isArray(localCfg?.models) ? localCfg.models : []
      const backendHasLegacy = !!(cfg.textModel || cfg.visionModel || cfg.unifiedModel)

      if (isDev) {
        // 🧪 dev 合并：后端 id 为基准，本地独有的模型追加保留（避免 dev-local 共享配置覆盖用户个人模型）
        const mergedModelsMap = new Map<string, any>([...localModels, ...backendModels].map((m: any) => [m.id, m]))
        const mergedModels = Array.from(mergedModelsMap.values())
        const backendHasBinding = !!(cfg.binding?.unified?.primaryId || cfg.binding?.text?.primaryId || cfg.binding?.vision?.primaryId)
        const mergedBinding = backendHasBinding ? cfg.binding : (localCfg?.binding || cfg.binding)
        const mergedCfg = { ...cfg, models: mergedModels, binding: mergedBinding }
        applyConfigToForm(mergedCfg)
        console.log('[ConfigPanel] dev 已合并后端+本地模型库：后端', backendModels.length, '个，本地', localModels.length, '个，合并后', mergedModels.length, '个')
      } else {
        // 🏭 prod：后端唯一源头，不再合并本地（localStorage 仅作失败兜底）
        applyConfigToForm(cfg)
        console.log('[ConfigPanel] prod 已采用后端配置（后端', backendModels.length, '个模型）')
      }
    }
  } catch (e: any) {
    // 后端拉取失败：fallback 到本地（dev/prod 通用），保证面板至少能渲染已保存数据
    if (localCfg?.models?.length) {
      applyConfigToForm(localCfg)
      console.warn('[ConfigPanel] 后端加载失败，回退本地 localStorage:', e?.message)
    } else {
      console.warn('[ConfigPanel] 从后端加载配置失败且无本地兜底:', e?.message)
    }
  }
}

// 加载配置到表单
watch(() => props.visible, (isVisible) => {
  if (isVisible) {
    // 重置 Tab 到模型（默认高频操作）
    activeTab.value = 'model'
    
    // 清除字段错误
    fieldErrors.value = {}

    // 🐛 直接从 localStorage 读取，绕过 Pinia reactive proxy 问题
    const saved = localStorage.getItem('mc_generator_config')
    let cfg: any = {}
    if (saved) {
      try { cfg = JSON.parse(saved) } catch(e) {}
    }
    console.log('[ConfigPanel] 面板打开, localStorage 原始值:', saved?.substring(0, 200))
    console.log('[ConfigPanel] 解析后 cfg.modelMode:', cfg.modelMode, '| visionApiKey:', !!cfg.visionApiKey, '| textApiKey:', !!cfg.textApiKey)

    if (isDev) {
      // 🧪 dev：先以本地即时渲染（避免空面板），再由 loadConfigFromBackend 合并后端（保护个人模型库）
      applyConfigToForm(cfg)
      console.log('[ConfigPanel] dev 模式：本地即时渲染 + 后端合并兜底')
      loadConfigFromBackend(cfg)
    } else {
      // 🏭 prod：永远以后端为唯一源头，不先渲染 localStorage（避免错误数据闪烁）。
      // 仅当后端拉取失败才回退本地（loadConfigFromBackend 内部处理）。
      console.log('[ConfigPanel] prod 模式：仅以后端为源头加载（localStorage 仅作失败兜底）')
      loadConfigFromBackend(cfg)
    }

    // 🆕 从后端加载 GitLab Token（加密存储）
    http
      .get('/api/user/git-credential/token')
      .then((d) => {
        if (d?.success && d?.data?.configured && d?.data?.token) {
          formData.value.gitlabToken = d.data.token
          console.log('[ConfigPanel] ✅ 已从后端加载 GitLab Token')
        }
      })
      .catch((e) => console.warn('[ConfigPanel] 加载 GitLab Token 失败:', e.message))
  }
}, { immediate: true })

// 关闭面板
function close() {
  emit('update:visible', false)
}

// 滚动到指定字段（可指定目标 Tab，若字段不在当前 Tab 则自动切换）
async function scrollToField(fieldId: string, targetTab?: 'model' | 'service') {
  if (targetTab && activeTab.value !== targetTab) {
    activeTab.value = targetTab
    await nextTick()
  }
  const el = document.getElementById(fieldId)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.focus()
  }
}

// 打开密钥接入指南（带锚点定位到对应章节）
function openTokenGuide(key: 'figma' | 'apifox' | 'gitlab') {
  router.push(`/help/tokens#${key}`)
}

// 打开配置帮助页（进入密钥接入指南顶部）
function openHelp() {
  router.push('/help/tokens')
}

// 切换模型配置模式
// 切换模型配置模式（模型库下槽位数据独立，仅切换展示；切换时预填目标槽位提升体验）
function switchMode(mode: 'unified' | 'separate') {
  if (mode === modelMode.value) return
  const b = formData.value.binding || (formData.value.binding = {})
  if (mode === 'separate') {
    // 切到分类：若 text/vision 槽位为空，预填统一主模型
    const uid = b.unified?.primaryId
    if (uid) {
      if (!b.text?.primaryId) b.text = { primaryId: uid, poolIds: b.text?.poolIds || [] }
      if (!b.vision?.primaryId) b.vision = { primaryId: uid, poolIds: b.vision?.poolIds || [] }
    }
  } else {
    // 切到统一：若 unified 槽位为空，优先预填视觉主模型（统一模式须支持视觉）
    const vid = b.vision?.primaryId || b.text?.primaryId
    if (vid && !b.unified?.primaryId) {
      b.unified = { primaryId: vid, poolIds: b.unified?.poolIds || [] }
    }
  }
  modelMode.value = mode
}

// ─── 模型卡片折叠状态（默认空 = 全部收起） ───
const expandedModels = ref<Record<string, boolean>>({})

function toggleModelExpand(id: string) {
  expandedModels.value[id] = !expandedModels.value[id]
}

// 模型库搜索（仅当模型数 > 10 时显示输入框；v-model 双向）
const modelSearch = ref('')

// 过滤后的模型列表（避免 v-for 直接迭代 computed 数组在某些 Vue 版本下失效，改用普通 ref + watch 维护）
const displayedModels = ref<ModelEntry[]>([])
watch(
  () => [formData.value.models || [], modelSearch.value] as const,
  ([list, q]) => {
    const query = (q || '').trim().toLowerCase()
    displayedModels.value = query
      ? (list as ModelEntry[]).filter((m) => (m.name || m.model || '').toLowerCase().includes(query))
      : [...(list as ModelEntry[])]
  },
  { immediate: true, deep: true }
)

// 模型是否已被任意槽位引用（主模型或池成员）→ 折叠态显示蓝点
function isModelInUse(id: string): boolean {
  const b = formData.value.binding
  if (!b || !id) return false
  for (const slot of ['unified', 'text', 'vision'] as const) {
    const sb = b[slot]
    if (!sb) continue
    if (sb.primaryId === id) return true
    if (Array.isArray(sb.poolIds) && sb.poolIds.includes(id)) return true
  }
  return false
}

// 展开态「编辑」按钮：聚焦名称输入框
function focusModelName(id: string) {
  nextTick(() => {
    const el = document.getElementById('model-name-' + id) as HTMLInputElement | null
    if (el) {
      el.focus()
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  })
}

// 展开态「删除」：二次确认后删除（同步清理槽位引用）
function confirmRemoveModel(id: string) {
  Modal.confirm({
    title: '删除模型',
    content: '确定要删除该模型吗？若它正被槽位引用，引用会一并清除。',
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: () => {
      const idx = (formData.value.models || []).findIndex((m) => m.id === id)
      if (idx >= 0) removeModel(idx)
    }
  })
}

// 添加模型（生成唯一 id，默认折叠）
// 🔒 2026-09-10 口径：新模型默认「什么都不支持」（capability='' + verified=false），
// 必须填写完整并点「自动识别能力」实测通过后才能入槽位/保存。
function addModel() {
  const m: ModelEntry = {
    id: `m${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
    name: '',
    apiKey: '',
    baseURL: '',
    model: '',
    providerType: 'auto',
    capability: '',
    verified: false,
    rpm: 0,
    tpm: 0,
    weight: 10,
    temperature: undefined
  }
  if (!formData.value.models) formData.value.models = []
  formData.value.models.push(m)
  expandedModels.value[m.id] = true
}

// 删除模型（允许删到 0 个；同步清理槽位引用与折叠状态，避免悬空 primaryId）
function removeModel(idx: number) {
  const models = formData.value.models
  if (!models || !models[idx]) return
  const id = models[idx]?.id
  models.splice(idx, 1)
  if (!id) return
  const b = formData.value.binding
  if (b) {
    for (const slot of ['unified', 'text', 'vision'] as const) {
      const sb = b[slot]
      if (!sb) continue
      if (sb.primaryId === id) sb.primaryId = ''
      if (Array.isArray(sb.poolIds)) sb.poolIds = sb.poolIds.filter((pid: string) => pid !== id)
    }
  }
  delete expandedModels.value[id]
}

// 槽位候选模型（按能力过滤）：unified/vision 须支持视觉，text 须支持文本
function slotCandidates(slot: 'unified' | 'text' | 'vision'): ModelEntry[] {
  const models = formData.value.models || []
  const needVision = slot === 'unified' || slot === 'vision'
  return models.filter((m) => {
    // 未填写完成的模型不能作为槽位候选（避免刚添加的空卡片出现在主模型/模型池里）
    if (!m.apiKey?.trim() || !m.baseURL?.trim() || !m.model?.trim()) return false
    // 🔒 未通过连通性测试的模型不能入槽位（默认什么都不支持）
    if (!m.verified) return false
    const cap = m.capability || ''
    if (!cap) return false
    if (cap === 'both') return true
    return needVision ? cap === 'vision' : cap === 'text'
  })
}

// 槽位主模型下拉选项：在「合格候选」(slotCandidates) 基础上，若当前已绑定的 primaryId 模型
// 不在候选中（例如实测无能力 cap='' 但仍被历史保存/直接绑定引用），也保留其选项，
// 否则刷新后 <select> 找不到匹配项会回退「请选择主模型」，造成「已保存的主模型消失了」的错觉。
// 仅用于展示已绑定项，不新增候选：用户仍不能把未检测模型「重新选」进槽位（由 slotCandidates 把关）。
function slotOptions(slot: 'unified' | 'text' | 'vision'): ModelEntry[] {
  const cands = slotCandidates(slot)
  const pid = formData.value.binding?.[slot]?.primaryId
  if (pid) {
    const byId = new Map<string, any>((formData.value.models || []).map((m: any) => [m.id, m]))
    const bound = byId.get(pid)
    if (bound && !cands.some((c) => c.id === pid)) {
      return [bound, ...cands]
    }
  }
  return cands
}

// 🔒 关键凭据（Model / Base URL / API Key / 接口协议）变更 → 实测结论失效，须重新测试
function markUnverified(m: ModelEntry) {
  if (m.verified !== false || m.capability) {
    m.verified = false
    m.capability = ''
    delete detectResults.value[m.id]
  }
}

// 模型状态标签：区分「从未检测」与「已检测但无能力」
function modelStatusLabel(m: ModelEntry): string {
  if (!m.verified) return '未验证'
  if (m.capability === 'vision') return '视觉'
  if (m.capability === 'text') return '文本'
  if (m.capability === 'both') return '文本 + 视觉'
  return '无能力' // 已检测但未能识别出任何能力
}

// 能力标签（capability → 图标胶囊）
function capabilityLabel(cap?: string): string {
  if (cap === 'vision') return '视觉'
  if (cap === 'text') return '文本'
  if (cap === 'both') return '文本 + 视觉'
  return '未检测'
}

// 池候选：排除主模型自身（主模型由 primaryId 单独引用，池只放额外成员）。
// 已绑定但不在合格候选中的池成员（如实测无能力的模型）也保留显示，避免刷新后复选框消失、绑定静默丢失。
function poolCandidates(slot: 'unified' | 'text' | 'vision'): ModelEntry[] {
  const b = formData.value.binding?.[slot]
  const primaryId = b?.primaryId
  const cands = slotCandidates(slot).filter((c) => c.id !== primaryId)
  const byId = new Map<string, any>((formData.value.models || []).map((m: any) => [m.id, m]))
  const extra = (b?.poolIds || [])
    .filter((id: string) => id !== primaryId && byId.get(id) && !cands.some((c) => c.id === id))
    .map((id: string) => byId.get(id))
  return [...cands, ...extra]
}

// ─── 自动识别模型能力（三维：文本 / 视觉 / 推理） ───
const detecting = ref<Record<string, boolean>>({})
const detectResults = ref<Record<string, any>>({})

// 调用后端检测接口，识别模型能力并自动回填 capability
async function detectModelCapability(m: ModelEntry) {
  if (!m.apiKey?.trim() || !m.baseURL?.trim() || !m.model?.trim()) {
    message.warning('请先填写该模型的 API Key、Base URL 和 Model')
    return
  }
  detecting.value[m.id] = true
  detectResults.value[m.id] = undefined
  try {
    const res: any = await http.post('/api/config/test-model-capability', {
      apiKey: m.apiKey,
      baseURL: m.baseURL,
      model: m.model,
      providerType: m.providerType || 'auto',
    })
    const body = res?.data ?? res
    detectResults.value[m.id] = body
    const vision = body?.vision?.success === true
    const text = body?.text?.success === true
    if (vision && text) {
      m.capability = 'both'
      m.verified = true
      message.success('识别完成：该模型支持视觉 + 文本（通用）')
    } else if (vision) {
      m.capability = 'vision'
      m.verified = true
      message.success('识别完成：该模型仅支持视觉')
    } else if (text) {
      m.capability = 'text'
      m.verified = true
      message.success('识别完成：该模型仅支持文本')
    } else {
      // 检测已完成但未能识别出任何能力：仍可保存，只是 capability='' 不会进入槽位候选
      m.capability = ''
      m.verified = true
      message.warning('检测完成：该模型未能识别出文本或视觉能力，仍可保存，但不会出现在槽位候选中', 4)
    }
  } catch (e: any) {
    const msg = e?.data?.message || e?.message || String(e)
    message.error('检测异常：' + (typeof msg === 'string' ? msg : String(msg)))
  } finally {
    detecting.value[m.id] = false
  }
}

// 把槽位绑定的主模型同步到 legacy 字段（保存前调用，保证 saveData 的 legacy 字段与模型库一致）
function syncBindingToLegacy() {
  const models = formData.value.models || []
  const byId = new Map<string, ModelEntry>(models.filter((m) => m?.id).map((m) => [m.id, m]))
  const fd = formData.value as any
  const apply = (slot: 'unified' | 'text' | 'vision') => {
    const b = formData.value.binding?.[slot]
    const m = b?.primaryId ? byId.get(b.primaryId) : undefined
    fd[`${slot}ApiKey`] = m?.apiKey ?? ''
    fd[`${slot}BaseURL`] = m?.baseURL ?? ''
    fd[`${slot}Model`] = m?.model ?? ''
    fd[`${slot}ProviderType`] = m?.providerType || 'auto'
    fd[`${slot}Temperature`] = m?.temperature ?? undefined
  }
  if (modelMode.value === 'unified') apply('unified')
  else { apply('text'); apply('vision') }
}

// 🆕 拼装要保存的配置对象（从 DOM 读取最新输入值，绕过 v-model 绑定问题）
function buildSaveData(): any {
  // 🆕 先同步槽位主模型到 legacy 字段
  syncBindingToLegacy()
  const getVal = (id: string) => {
    const el = document.getElementById(id) as HTMLInputElement | null
    return el ? el.value : undefined
  }
  const trim = (v: any) => (typeof v === 'string' ? v.trim() : v)
  const fd = formData.value
  return {
    figmaToken: trim(getVal('figmaToken') ?? fd.figmaToken),
    apifoxToken: trim(getVal('apifoxToken') ?? fd.apifoxToken),
    gitlabToken: trim(getVal('gitlabToken') ?? fd.gitlabToken),
    visionApiKey: trim(getVal('visionApiKey') ?? fd.visionApiKey),
    visionBaseURL: trim(getVal('visionBaseURL') ?? fd.visionBaseURL),
    visionModel: trim(getVal('visionModel') ?? fd.visionModel),
    visionProviderType: getVal('visionProviderType') ?? fd.visionProviderType ?? 'auto',
    ...(fd.visionTemperature != null ? { visionTemperature: Number(fd.visionTemperature) } : {}),
    textApiKey: trim(getVal('textApiKey') ?? fd.textApiKey),
    textBaseURL: trim(getVal('textBaseURL') ?? fd.textBaseURL),
    textModel: trim(getVal('textModel') ?? fd.textModel),
    textProviderType: getVal('textProviderType') ?? fd.textProviderType ?? 'auto',
    ...(fd.textTemperature != null ? { textTemperature: Number(fd.textTemperature) } : {}),
    outputPath: trim(fd.outputPath),
    modelMode: modelMode.value,
    unifiedApiKey: trim(getVal('unifiedApiKey') ?? fd.unifiedApiKey),
    unifiedBaseURL: trim(getVal('unifiedBaseURL') ?? fd.unifiedBaseURL),
    unifiedModel: trim(getVal('unifiedModel') ?? fd.unifiedModel),
    unifiedProviderType: getVal('unifiedProviderType') ?? fd.unifiedProviderType ?? 'auto',
    ...(fd.unifiedTemperature != null ? { unifiedTemperature: Number(fd.unifiedTemperature) } : {}),
    // 供应商池：过滤掉未填 API Key 的条目，trim 字符串字段
    providers: (fd.providers || [])
      .filter((p: any) => p && p.apiKey && String(p.apiKey).trim())
      .map((p: any) => ({
        id: p.id,
        name: trim(p.name),
        apiKey: trim(p.apiKey),
        baseURL: trim(p.baseURL),
        model: trim(p.model),
        providerType: p.providerType || 'auto',
        role: p.role || 'both',
        rpm: Number(p.rpm) || 0,
        tpm: Number(p.tpm) || 0,
        weight: Number(p.weight) || 10,
        ...(p.temperature != null && p.temperature !== '' ? { temperature: Number(p.temperature) } : {}),
      })),
    // 🆕 模型库 + 槽位绑定
    models: (fd.models || []).map((m: any) => ({
      id: m.id,
      name: trim(m.name),
      apiKey: trim(m.apiKey),
      baseURL: trim(m.baseURL),
      model: trim(m.model),
      providerType: m.providerType || 'auto',
      capability: m.capability || 'both',
      rpm: Number(m.rpm) || 0,
      tpm: Number(m.tpm) || 0,
      weight: Number(m.weight) || 10,
      ...(m.temperature != null && m.temperature !== '' ? { temperature: Number(m.temperature) } : {}),
    })),
    binding: this.normalizeBindingForSave(modelMode.value, fd.binding),
  }
}

// 🧹 保存前按 modelMode 规范化 binding，防止旧模式槽位数据残留到后端
function normalizeBindingForSave(
  mode: 'separate' | 'unified' | string,
  binding: any,
): Record<string, { primaryId: string; poolIds: string[] }> {
  const empty = () => ({ primaryId: '', poolIds: [] as string[] })
  const b = binding || {}
  if (mode === 'unified') {
    return {
      unified: {
        primaryId: String(b.unified?.primaryId || ''),
        poolIds: Array.isArray(b.unified?.poolIds) ? [...b.unified.poolIds] : [],
      },
      text: empty(),
      vision: empty(),
    }
  }
  return {
    text: {
      primaryId: String(b.text?.primaryId || ''),
      poolIds: Array.isArray(b.text?.poolIds) ? [...b.text.poolIds] : [],
    },
    vision: {
      primaryId: String(b.vision?.primaryId || ''),
      poolIds: Array.isArray(b.vision?.poolIds) ? [...b.vision.poolIds] : [],
    },
    unified: empty(),
  }
}

// 保存配置
async function saveConfig() {
  // 🆕 模型库为唯一输入源：先把槽位主模型同步到 legacy 字段，保证 saveData 的 legacy 字段正确
  syncBindingToLegacy()

  // 🐛 直接从 DOM 读取输入框的值，彻底绕开 v-model 绑定问题
  // ⚠️ 用 ?? 不用 ||：空字符串是有意清空，不应 fallback 到旧值
  const getVal = (id: string) => {
    const el = document.getElementById(id) as HTMLInputElement | null
    return el ? el.value : undefined
  }

  // 保存前对所有字符串字段 trim，防止粘贴时带入首尾空格导致 URL/Key 拼接 404
  const trim = (v: any) => (typeof v === 'string' ? v.trim() : v)
  const saveData: any = {
    figmaToken:        trim(getVal('figmaToken')      ?? formData.value.figmaToken),
    apifoxToken:       trim(getVal('apifoxToken')     ?? formData.value.apifoxToken),
    gitlabToken:       trim(getVal('gitlabToken')     ?? formData.value.gitlabToken),
    visionApiKey:      trim(getVal('visionApiKey')    ?? formData.value.visionApiKey),
    visionBaseURL:     trim(getVal('visionBaseURL')   ?? formData.value.visionBaseURL),
    visionModel:       trim(getVal('visionModel')     ?? formData.value.visionModel),
    visionProviderType: getVal('visionProviderType') ?? formData.value.visionProviderType ?? 'auto',
    ...(formData.value.visionTemperature != null ? { visionTemperature: Number(formData.value.visionTemperature) } : {}),
    textApiKey:        trim(getVal('textApiKey')      ?? formData.value.textApiKey),
    textBaseURL:       trim(getVal('textBaseURL')     ?? formData.value.textBaseURL),
    textModel:         trim(getVal('textModel')       ?? formData.value.textModel),
    textProviderType:  getVal('textProviderType') ?? formData.value.textProviderType ?? 'auto',
    ...(formData.value.textTemperature != null ? { textTemperature: Number(formData.value.textTemperature) } : {}),
    outputPath:        trim(formData.value.outputPath),
    modelMode:         modelMode.value,
    unifiedApiKey:     trim(getVal('unifiedApiKey')   ?? formData.value.unifiedApiKey),
    unifiedBaseURL:    trim(getVal('unifiedBaseURL')  ?? formData.value.unifiedBaseURL),
    unifiedModel:      trim(getVal('unifiedModel')    ?? formData.value.unifiedModel),
    unifiedProviderType: getVal('unifiedProviderType') ?? formData.value.unifiedProviderType ?? 'auto',
    ...(formData.value.unifiedTemperature != null ? { unifiedTemperature: Number(formData.value.unifiedTemperature) } : {}),
    // 供应商池：过滤掉未填 API Key 的条目，trim 字符串字段
    providers: (formData.value.providers || [])
      .filter((p: any) => p && p.apiKey && String(p.apiKey).trim())
      .map((p: any) => ({
        id: p.id,
        name: trim(p.name),
        apiKey: trim(p.apiKey),
        baseURL: trim(p.baseURL),
        model: trim(p.model),
        providerType: p.providerType || 'auto',
        role: p.role || 'both',
        rpm: Number(p.rpm) || 0,
        tpm: Number(p.tpm) || 0,
        weight: Number(p.weight) || 10,
        ...(p.temperature != null && p.temperature !== '' ? { temperature: Number(p.temperature) } : {}),
      })),
    // 🆕 模型库 + 槽位绑定（新结构，后端 resolveBindingToLegacy 据此降维出 legacy 字段 + providers）
    models: (formData.value.models || []).map((m: any) => ({
      id: m.id,
      name: trim(m.name),
      apiKey: trim(m.apiKey),
      baseURL: trim(m.baseURL),
      model: trim(m.model),
      providerType: m.providerType || 'auto',
      capability: m.capability || '',
      verified: m.verified === true,
      rpm: Number(m.rpm) || 0,
      tpm: Number(m.tpm) || 0,
      weight: Number(m.weight) || 10,
      ...(m.temperature != null && m.temperature !== '' ? { temperature: Number(m.temperature) } : {}),
    })),
    binding: normalizeBindingForSave(modelMode.value, formData.value.binding),
  }

  console.log('[ConfigPanel] 💾 saveConfig, modelMode=', modelMode.value)

  // 🛑 校验：清除之前的错误
  fieldErrors.value = {}

  // 🛑 校验：模型库至少 1 个模型
  if (!formData.value.models || formData.value.models.length === 0) {
    message.error('请至少添加一个模型')
    return
  }

  // 🛑 校验：模型名称不能重复（仅校验非空名称）
  {
    const nameCount = new Map<string, number>()
    for (const m of formData.value.models) {
      const n = (m.name || '').trim()
      if (!n) continue
      nameCount.set(n, (nameCount.get(n) || 0) + 1)
    }
    const dup = [...nameCount.entries()].find(([, c]) => c > 1)
    if (dup) {
      message.error(`模型名称「${dup[0]}」重复，请改为唯一名称`)
      return
    }
  }

  // 🔒 保存闸门：每个填写完整的模型必须至少执行过一次「自动识别能力」服务端实测才能保存。
  // 即使识别结果是「什么都不支持」，也允许保存（不会进入槽位候选）；未检测的模型一律拦截。
  {
    const undetected = (formData.value.models || []).filter(
      (m: any) => m.apiKey?.trim() && m.baseURL?.trim() && m.model?.trim() && m.verified !== true,
    )
    if (undetected.length) {
      const first = undetected[0]
      expandedModels.value[first.id] = true
      message.error(
        undetected.length === 1
          ? `模型「${first.name || first.model}」尚未执行检测：请填写完整后点击卡片内「自动识别能力」，完成检测后即可保存`
          : `${undetected.length} 个模型尚未执行检测（${undetected.map((m: any) => m.name || m.model).join('、')}）：请逐一点击「自动识别能力」，完成检测后即可保存`,
        6,
      )
      return
    }
  }

  // 🛑 校验：槽位主模型必选，且主模型须填写 API Key 与 Model
  const modelById = new Map<string, any>((formData.value.models || []).map((m: any) => [m.id, m]))
  const checkSlot = (slot: 'unified' | 'text' | 'vision', label: string): boolean => {
    const sb = formData.value.binding?.[slot]
    if (!sb?.primaryId) {
      message.error(`请为「${label}」选择主模型`)
      return false
    }
    const m = modelById.get(sb.primaryId)
    if (!m) {
      message.error(`「${label}」主模型不存在，请重新选择`)
      return false
    }
    if (!m.apiKey || !String(m.apiKey).trim()) {
      message.error(`「${label}」主模型未填写 API Key`)
      return false
    }
    if (!m.model || !String(m.model).trim()) {
      message.error(`「${label}」主模型未填写 Model`)
      return false
    }
    return true
  }

  if (modelMode.value === 'unified') {
    if (!checkSlot('unified', '统一槽位')) return
  } else {
    if (!checkSlot('text', '文本槽位')) return
    if (!checkSlot('vision', '视觉槽位')) return
  }

  if (modelMode.value === 'unified') {
    // 统一模式：将统一字段复制到 vision 和 text 两组
    const key = saveData.unifiedApiKey
    const url = saveData.unifiedBaseURL
    const mdl = saveData.unifiedModel
    const provider = saveData.unifiedProviderType || 'auto'
    if (key) {
      saveData.visionApiKey = key
      saveData.visionBaseURL = url
      saveData.visionModel = mdl
      saveData.visionProviderType = provider
      if (saveData.unifiedTemperature != null) {
        saveData.visionTemperature = saveData.unifiedTemperature
      }
      saveData.textApiKey = key
      saveData.textBaseURL = url
      saveData.textModel = mdl
      saveData.textProviderType = provider
      if (saveData.unifiedTemperature != null) {
        saveData.textTemperature = saveData.unifiedTemperature
      }
    }
  }

  console.log('[ConfigPanel]   输入框存在? unifiedApiKey=', !!document.getElementById('unifiedApiKey'), ' visionApiKey=', !!document.getElementById('visionApiKey'))
  console.log('[ConfigPanel]   unifiedApiKey DOM值 =', (document.getElementById('unifiedApiKey') as HTMLInputElement)?.value || '(空或不存在)')

  console.log('[ConfigPanel]   saveData.unifiedApiKey =', saveData.unifiedApiKey ? '***已填写***' : '(空)')
  console.log('[ConfigPanel]   saveData.visionApiKey  =', saveData.visionApiKey ? '***已填写***' : '(空)')
  console.log('[ConfigPanel]   saveData.textApiKey    =', saveData.textApiKey ? '***已填写***' : '(空)')
  console.log('[ConfigPanel]   saveData.figmaToken    =', saveData.figmaToken ? '***已填写***' : '(空)')

  // 保存到 Pinia（内部已含 localStorage 持久化）
  configStore.saveConfig(saveData)

  // 接口保存：同步写入服务端（backend-node data/ai-config.json），
  // 绑定向导等后端场景改从服务端读取，不再依赖浏览器 localStorage。
  // 统一封装会带上门户/开发态 token 头：SessionGuard 据此完成自动登录并设置 session.userId，
  // 服务端才能把配置按用户落库（供管理后台只读查看），否则裸请求会 401。
  // 🔧 改为 await 并据服务端真实结果反馈：保存失败（如 schema 校验不通过）必须报错，
  // 杜绝「前端显示成功、后端实际未落库」的误导（曾因浮点 weight 导致所有保存被 400 静默失败）。
  let serverOk = false
  let hasRunningTasks = false
  try {
    const d = await http.post('/api/config/ai', saveData)
    if (d?.success) {
      serverOk = true
      // d 为 try 块内 const，块外不可见 —— 需先在此捕获，勿在 try 外直接引用 d
      hasRunningTasks = d?.hasRunningTasks === true
      console.log('[ConfigPanel] ✅ 服务端 AI 配置已保存（接口保存）')
    } else {
      // 信封结构：后端返回体在 data 内层（{ success, code, message, data: { error, details } }）
      const inner = d?.data || {}
      const errMsg = inner?.error || inner?.details?.[0] || d?.error || d?.message || '未知错误'
      console.warn('[ConfigPanel] 服务端配置保存失败:', errMsg)
      message.error(`配置保存失败：${typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg)}`, 6)
      return
    }
  } catch (e: any) {
    const errMsg = e?.data?.message || e?.data?.error || e?.message || e
    console.warn('[ConfigPanel] 服务端配置保存异常:', errMsg)
    message.error(`配置保存失败：${typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg)}`, 6)
    return
  }

  // 同步 GitLab Token 到用户凭证接口（后端加密存储）
  if (saveData.gitlabToken?.trim()) {
    http
      .post('/api/user/git-credential', {
        type: 'gitlab-pat',
        token: saveData.gitlabToken,
        description: 'GitLab Personal Access Token（推送组件用）',
      })
      .then((d) => {
        if (d?.success) console.log('[ConfigPanel] ✅ GitLab Token 已同步到凭证接口')
        else console.warn('[ConfigPanel] GitLab Token 同步失败:', d?.error)
      })
      .catch((e) => console.warn('[ConfigPanel] GitLab Token 同步异常:', e.message))
  }

  // 成功提示：明确列出本次保存的全部内容（模型 + Figma + Apifox + GitLab），
  // 仅当服务端真正落库成功才报成功，否则明确提示失败。
  const savedParts: string[] = ['模型']
  if (saveData.figmaToken?.trim()) savedParts.push('Figma Token')
  if (saveData.apifoxToken?.trim()) savedParts.push('Apifox Token')
  if (saveData.gitlabToken?.trim()) savedParts.push('GitLab Token')
  if (serverOk) {
    if (hasRunningTasks) {
      // 🆕 生效语义提示：配置修改不热切换正在运行的任务（执行启动时已冻结 vision/text 配置），
      // 从「下次生成 / 重试 / 续跑 / 精修」重新进入 executeGeneration 时生效。
      message.success(
        `所有配置已保存（${savedParts.join(' / ')}）。检测到有进行中的任务：本次改动不会影响正在运行的任务，将在下次生成或任务重试时生效。`,
        6,
      )
    } else {
      message.success(`所有配置已保存（${savedParts.join(' / ')}）`, 4)
    }
  } else {
    message.error(
      `配置保存失败：服务端未确认落库（${savedParts.join(' / ')}）。请检查控制台日志或后端服务状态后重试。`,
      6,
    )
  }

  // 不再自动关闭面板 — 让用户能核对完整配置后手动关闭
}

// 清除配置
function clearConfig() {
  Modal.confirm({
    title: '确认清除配置',
    content: '确定要清除所有配置吗？此操作不可撤销。',
    okText: '确认清除',
    okType: 'danger',
    cancelText: '取消',
    onOk: () => {
      configStore.clearConfig()
      localStorage.removeItem('mc_generator_config')  // 🐛 确保 localStorage 也清除
      formData.value = {
        figmaToken: '',
        apifoxToken: '',
        gitlabToken: '',
        visionApiKey: '',
        visionBaseURL: '',
        visionModel: '',
        visionProviderType: 'auto',
        textApiKey: '',
        textBaseURL: '',
        textModel: '',
        textProviderType: 'auto',
        outputPath: '',
        modelMode: 'separate',
        unifiedApiKey: '',
        unifiedBaseURL: '',
        unifiedModel: '',
        unifiedProviderType: 'auto',
        unifiedTemperature: undefined,
        visionTemperature: undefined,
        textTemperature: undefined,
        providers: [],
        models: [],
        binding: {
          unified: { primaryId: '', poolIds: [] as string[] },
          text: { primaryId: '', poolIds: [] as string[] },
          vision: { primaryId: '', poolIds: [] as string[] },
        }
      }
      modelMode.value = 'separate'
      fieldErrors.value = {}
      message.success('配置已清除')
    }
  })
}
</script>

<style scoped>
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.3);
  opacity: 0;
  visibility: hidden;
  transition: all 0.35s ease;
  z-index: 999;
}

.overlay.show {
  opacity: 1;
  visibility: visible;
}

.config-panel {
  position: fixed;
  top: 0;
  right: -460px;
  width: 460px;
  height: 100vh;
  background: var(--bg-card);
  box-shadow: var(--shadow-lg);
  transition: right 0.35s cubic-bezier(0.25, 0.8, 0.25, 1.2);
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.config-panel.open {
  right: 0;
}

.config-panel-header {
  padding: 20px 28px;
  border-bottom: 1px solid var(--border-light);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.config-panel-header h2 {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.3px;
}

.close-btn {
  background: var(--bg-alt);
  border: none;
  color: var(--text-secondary);
  font-size: 20px;
  cursor: pointer;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  transition: all 0.2s;
  font-family: inherit;
  line-height: 1;
}

.close-btn:hover {
  background: var(--border-default);
  color: var(--text-primary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.help-btn {
  background: var(--bg-alt);
  border: 1px solid var(--border-light);
  color: var(--brand, #2f6bff);
  cursor: pointer;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  transition: all 0.2s;
  line-height: 1;
}

.help-btn:hover {
  background: var(--brand-soft, rgba(47, 107, 255, 0.1));
  border-color: var(--brand, #2f6bff);
  color: var(--brand, #2f6bff);
}

/* Tab 导航 */
.config-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.config-tab {
  flex: 1;
  padding: 14px 0;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.config-tab:hover {
  background: var(--bg-hover);
}

.config-tab.active {
  border-bottom-color: var(--brand);
  background: var(--brand-bg);
}

.tab-icon {
  font-size: 16px;
}

.tab-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
}

.config-tab.active .tab-label {
  color: var(--brand);
}

.config-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 28px;
}

.config-section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 28px 0 18px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-light);
}

.config-section-title:first-child {
  margin-top: 0;
}

.section-badge {
  font-size: 12px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: var(--radius-sm);
  letter-spacing: 0.2px;
  white-space: nowrap;
}

.section-badge.figma {
  background: rgba(242, 78, 30, 0.1);
  color: #f24e1e;
}

.section-badge.apifox {
  background: var(--module-apifox-bg);
  color: var(--module-apifox-text);
  border: 1px solid var(--module-apifox-border);
}

.section-desc {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* 连接状态总览 */
.service-status-overview {
  background: var(--bg-alt);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 24px;
}

.service-status-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}

.service-status-item + .service-status-item {
  border-top: 1px solid var(--border-light);
}

.status-icon {
  font-size: 16px;
}

.status-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.status-desc {
  font-size: 12px;
  color: var(--text-tertiary);
  flex: 1;
}

.status-action-btn {
  padding: 4px 12px;
  background: var(--brand-bg);
  color: var(--brand);
  border: 1px solid var(--brand);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.status-action-btn:hover {
  background: var(--brand);
  color: var(--text-inverse);
}

.status-help-link {
  margin-left: 8px;
  padding: 4px 10px;
  background: transparent;
  color: var(--text-tertiary);
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
  white-space: nowrap;
}

.status-help-link:hover {
  color: var(--brand);
  border-color: var(--brand);
  background: var(--brand-bg);
}

/* 模式选择器 */
.mode-selector {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.mode-btn {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 12px;
  background: var(--bg-card, #fff);
  border: 1.5px solid var(--border-light);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
  text-align: center;
}

.mode-btn:hover {
  border-color: var(--accent-border, #b3d8ff);
  background: var(--accent-bg, #e8f3ff);
}

.mode-btn.active {
  background: var(--accent-bg, #e8f3ff);
  border-color: var(--accent, #1990ff);
  box-shadow: 0 0 0 3px rgba(25, 144, 255, 0.12);
}

.mode-radio {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid var(--border-default);
  background: var(--bg-card, #fff);
  transition: all 0.2s;
}

.mode-radio::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8px;
  height: 8px;
  margin-top: -4px;
  margin-left: -4px;
  border-radius: 50%;
  background: #fff;
  transform: scale(0);
  transition: transform 0.2s;
}

.mode-btn.active .mode-radio {
  border-color: var(--accent, #1990ff);
  background: var(--accent, #1990ff);
}

.mode-btn.active .mode-radio::after {
  transform: scale(1);
}

.mode-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg-hover);
  color: var(--text-secondary);
  transition: all 0.2s;
}

.mode-btn.active .mode-icon {
  background: rgba(25, 144, 255, 0.12);
  color: var(--accent, #1990ff);
}

.mode-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.mode-btn.active .mode-label {
  color: var(--accent, #1990ff);
}

.mode-hint {
  font-size: 11px;
  color: var(--text-tertiary);
  line-height: 1.4;
  max-width: 140px;
}

.mode-btn.active .mode-hint {
  color: var(--accent-light, #4aa3ff);
}

/* 统一模式提示 */
.unified-notice {
  margin-bottom: 20px;
  padding: 10px 14px;
  background: var(--warning-bg);
  border: 1px solid var(--warning-border);
  border-radius: var(--radius-md);
  font-size: 12px;
  color: var(--warning-text);
  line-height: 1.6;
}

.unified-notice strong {
  color: var(--warning-text);
}

/* 子标题（分别模式下的视觉/文本分组标题） */
.config-sub-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 24px 0 16px;
}

.sub-title-badge {
  font-size: 12px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: var(--radius-sm);
  letter-spacing: 0.2px;
}

.sub-title-badge.vision {
  background: var(--brand-bg);
  color: var(--brand);
}

.sub-title-badge.text {
  background: var(--feature-bg);
  color: var(--feature);
}

.sub-title-desc {
  font-size: 12px;
  color: var(--text-tertiary);
}

.config-group {
  margin-bottom: 24px;
}

.config-group label {
  display: block;
  color: var(--text-primary);
  font-weight: 600;
  margin-bottom: 8px;
  font-size: 14px;
  letter-spacing: -0.2px;
}

.required {
  color: var(--error);
  font-weight: 700;
}

.config-group input {
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-hover);
  transition: all 0.2s;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
}

.config-group input::placeholder {
  color: var(--text-quaternary);
}

.config-group input:focus {
  border-color: var(--brand);
  background: var(--bg-card);
  box-shadow: 0 0 0 3px var(--brand-bg);
}

.config-group input.has-error {
  border-color: var(--error);
  background: color-mix(in srgb, var(--error-bg) 40%, var(--bg-hover));
}

.config-group input.has-error:focus {
  border-color: var(--error);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--error) 16%, transparent);
}

/* Profile 方案栏 */
.profile-bar {
  margin-bottom: 20px;
  padding: 12px 16px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--border-default, #e8e8e8);
}

.profile-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.profile-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
  margin-bottom: 0;
}

.profile-select {
  flex: 1;
  min-width: 0;
  padding: 7px 32px 7px 12px;
  font-size: 13px;
  font-family: inherit;
  color: var(--text-primary);
  background: var(--bg-card, #fff);
  border: 1.5px solid var(--border-default, #e8e8e8);
  border-radius: var(--radius-md, 6px);
  cursor: pointer;
  transition: all 0.2s;
  outline: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 12px;
}

.profile-select:hover {
  border-color: var(--brand, #1890ff);
}

.profile-select:focus {
  border-color: var(--brand, #1890ff);
  box-shadow: 0 0 0 3px var(--brand-bg, rgba(24, 144, 255, 0.1));
}

.profile-action-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--border-default, #e8e8e8);
  border-radius: 6px;
  background: var(--bg-card, #fff);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.profile-action-btn:hover:not(:disabled) {
  border-color: var(--brand, #1890ff);
  color: var(--brand, #1890ff);
  background: var(--brand-bg, rgba(24, 144, 255, 0.05));
}

.profile-action-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.profile-action-btn.profile-delete:hover:not(:disabled) {
  border-color: var(--error, #f5222d);
  color: var(--error, #f5222d);
  background: var(--error-bg, rgba(245, 34, 45, 0.05));
}

.error-msg {
  margin-top: 6px;
  font-size: 12px;
  color: var(--error-text);
  line-height: 1.5;
}

.config-group .hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.5;
}

.config-group .hint.model-case-hint {
  color: var(--warning-text, #d97706);
  font-weight: 500;
}

.info-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-hover, rgba(128,128,128,0.1));
  border-radius: 50%;
  cursor: help;
  vertical-align: middle;
  transition: all 0.15s;
  position: relative;
}

.info-icon:hover {
  color: var(--color-primary);
  background: var(--bg-elevated);
}

/* 🆕 Teleport tooltip 样式（浮在 body 上，不受 overflow 裁剪） */
.mc-tooltip-popup {
  position: fixed;
  width: 320px;
  padding: 12px 14px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-primary);
  background: var(--bg-floating, #f8f9fb);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  z-index: 99999;
  pointer-events: none;
  text-align: left;
}

/* 🆕 Provider 协议类型选择器 */
.provider-select {
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 14px;
  color: var(--text-primary);
  background: var(--bg-hover);
  transition: all 0.2s;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
  cursor: pointer;
}

.provider-select:focus {
  border-color: var(--brand);
  background: var(--bg-card);
  box-shadow: 0 0 0 3px var(--brand-bg);
}

.provider-select option {
  background: var(--bg-card);
  color: var(--text-primary);
}

/* 底部固定操作区：颜色由全局 .btn-primary / .btn-danger 语义类接管 */
.config-panel-footer {
  padding: 16px 28px;
  border-top: 1px solid var(--border-light);
  display: flex;
  gap: 10px;
  flex-shrink: 0;
  background: var(--bg-card);
}

.config-panel-footer .save-config-btn {
  flex: 1;
}

/* 清除配置降级为次级文字按钮（避免与保存抢视觉权重，且仍走二次确认） */
.config-panel-footer .clear-config-btn {
  flex: 0 0 auto;
  padding: 10px 16px;
  background: transparent;
  color: var(--text-tertiary);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.config-panel-footer .clear-config-btn:hover {
  background: var(--bg-alt);
  color: var(--task-failed-text, #ff4d4f);
}

/* 密码可见性切换 */
.input-with-toggle {
  position: relative;
  display: flex;
  align-items: center;
}

.input-with-toggle input {
  padding-right: 44px !important;
}

.toggle-visibility-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  cursor: pointer;
  width: 28px;
  height: 28px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  transition: background 0.2s, opacity 0.2s;
  opacity: 0.5;
}

.toggle-visibility-btn:hover {
  background: var(--bg-alt);
  opacity: 1;
}

.eye-icon {
  width: 18px;
  height: 18px;
  color: var(--text-tertiary);
  transition: color 0.2s;
  flex-shrink: 0;
}

.toggle-visibility-btn:hover .eye-icon {
  color: var(--text-primary);
}

/* 测试按钮和结果 */
.test-section {
  margin-top: 12px;
}

.test-btn {
  padding: 6px 16px;
  background: var(--button-secondary-bg);
  border: 1px solid var(--button-secondary-border);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--button-secondary-text);
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.test-btn:hover:not(:disabled) {
  background: var(--button-secondary-bg-hover);
  border-color: var(--button-secondary-border-hover);
}

.test-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--border-default);
  border-top-color: var(--brand);
  border-radius: var(--radius-full);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.test-results {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.test-result-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  line-height: 1.5;
}

.test-result-item.success {
  background: var(--task-success-bg);
  border: 1px solid var(--task-success-border);
  color: var(--task-success-text);
}

.test-result-item.error {
  background: var(--task-failed-bg);
  border: 1px solid var(--task-failed-border);
  color: var(--task-failed-text);
}

.result-icon {
  font-weight: 600;
  flex-shrink: 0;
}

.result-text {
  flex: 1;
  word-break: break-word;
}

.latency {
  opacity: 0.7;
  font-size: 11px;
}

.test-result-detail {
  margin-top: 2px;
  font-size: 11px;
  opacity: 0.75;
  word-break: break-all;
  white-space: pre-wrap;
}

/* ==================== 供应商池（高级） ==================== */
.pool-section-title {
  cursor: pointer;
  user-select: none;
  transition: opacity 0.2s;
}

.pool-section-title:hover {
  opacity: 0.8;
}

.section-badge.pool {
  background: rgba(83, 74, 183, 0.1);
  color: #534ab7;
}

.collapse-arrow {
  margin-left: auto;
  font-size: 14px;
  color: var(--text-tertiary);
  transition: transform 0.2s;
}

.pool-notice {
  margin: 4px 0 20px;
  padding: 10px 14px;
  background: var(--info-bg, var(--bg-alt));
  border: 1px solid var(--info-border, var(--border-light));
  border-radius: var(--radius-md);
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.pool-notice strong {
  color: var(--text-primary);
}

.provider-card {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 16px;
  background: var(--bg-alt);
}

.provider-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-light);
}

.provider-index {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.provider-remove {
  padding: 4px 12px;
  background: var(--task-failed-bg);
  color: var(--task-failed-text);
  border: 1px solid var(--task-failed-border);
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.provider-remove:hover {
  opacity: 0.8;
}

.provider-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.provider-promote {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 10px;
  background: var(--accent-bg, #e8f3ff);
  color: var(--accent, #1990ff);
  border: 1px solid var(--accent-border, #b3d8ff);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
  white-space: nowrap;
}

.provider-promote:hover:not(:disabled) {
  background: var(--accent, #1990ff);
  color: #fff;
}

.provider-promote:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.provider-card .config-group {
  margin-bottom: 16px;
}

.provider-card .config-group:last-child {
  margin-bottom: 0;
}

.config-row {
  display: flex;
  gap: 12px;
}

.config-row .config-group {
  flex: 1;
}

.add-provider-btn {
  width: 100%;
  padding: 10px;
  background: transparent;
  border: 1.5px dashed var(--border-default);
  border-radius: var(--radius-md);
  color: var(--brand);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.add-provider-btn:hover {
  background: var(--brand-bg);
  border-color: var(--brand);
}

/* 供应商测试区域 */
.provider-test-section {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed var(--border-light, #e8e8e8);
}

.provider-test-btn {
  padding: 6px 16px;
  background: var(--button-secondary-bg);
  border: 1px solid var(--button-secondary-border);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--button-secondary-text);
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.provider-test-btn:hover:not(:disabled) {
  background: var(--button-secondary-bg-hover);
  border-color: var(--button-secondary-border-hover);
}

.provider-test-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.provider-test-results {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.provider-test-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  line-height: 1.5;
}

.provider-test-item.success {
  background: var(--task-success-bg);
  border: 1px solid var(--task-success-border);
  color: var(--task-success-text);
}

.provider-test-item.error {
  background: var(--task-failed-bg);
  border: 1px solid var(--task-failed-border);
  color: var(--task-failed-text);
}

.provider-test-item.pending {
  background: var(--bg-alt);
  border: 1px solid var(--border-default);
  color: var(--text-tertiary);
}

.provider-test-item .result-icon {
  font-weight: 600;
  flex-shrink: 0;
}

.provider-test-item .result-text {
  flex: 1;
  word-break: break-word;
}

.provider-test-item .latency {
  opacity: 0.7;
  font-size: 11px;
}

.provider-test-item .test-result-detail {
  margin-top: 2px;
  font-size: 11px;
  opacity: 0.75;
  word-break: break-all;
  white-space: pre-wrap;
}

/* ==================== 模型库 + 槽位绑定（P2） ==================== */
.section-badge.model {
  background: rgba(83, 74, 183, 0.1);
  color: #534ab7;
}

.model-card {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 16px;
  background: var(--bg-alt);
}

.model-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-light);
}

.model-card.is-collapsed .model-card-header {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.model-collapse {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 8px;
  padding: 0;
  background: transparent;
  border: 0;
  cursor: pointer;
  color: inherit;
  font-family: inherit;
  text-align: left;
  min-width: 0;
  flex: 1 1 auto;
  width: 100%;
}

.model-title-group {
  display: flex;
  justify-content: flex-start;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  min-width: 0;
  flex: 0 1 auto;
}

.model-index {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-collapse:hover .model-index {
  color: var(--accent, #1990ff);
}

.model-collapse-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 20px;
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--text-tertiary);
  transition: transform 0.15s;
  margin-top: 2px;
  margin-left: 0;
}

.model-card-body {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.model-remove {
  padding: 4px 12px;
  background: var(--task-failed-bg);
  color: var(--task-failed-text);
  border: 1px solid var(--task-failed-border);
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.model-remove:hover:not(:disabled) {
  opacity: 0.8;
}

.model-remove:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.model-card-actions {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex: 0 0 auto;
  padding-top: 2px;
}

.model-detect {
  padding: 4px 12px;
  background: var(--accent-bg, #e8f3ff);
  color: var(--accent, #1990ff);
  border: 1px solid var(--accent-border, #b3d8ff);
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
  white-space: nowrap;
}

.model-detect:hover:not(:disabled) {
  background: var(--accent, #1990ff);
  color: #fff;
}

.model-detect:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 标题右侧紧凑加号 */
.add-model-inline-btn {
  margin-left: auto;
  padding: 4px 12px;
  background: var(--bg-hover);
  color: var(--brand, #2f6bff);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
  white-space: nowrap;
}

.add-model-inline-btn:hover {
  background: var(--brand-bg);
  border-color: var(--brand, #2f6bff);
}

/* 模型库搜索框（仅 >10 个时显示） */
.model-search {
  margin-bottom: 16px;
}

.model-search input {
  width: 100%;
  padding: 8px 14px;
  border: 1.5px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-hover);
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
}

.model-search input:focus {
  border-color: var(--brand);
  background: var(--bg-card);
  box-shadow: 0 0 0 3px var(--brand-bg);
}

/* 已使用蓝点 */
.used-dot {
  color: var(--brand, #2f6bff);
  font-size: 10px;
  margin-left: 2px;
  flex: 0 0 auto;
}

/* 展开态工具条 */
.model-card-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px dashed var(--border-light);
}

/* 编辑按钮：次级样式 */
.model-edit {
  padding: 4px 12px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
  white-space: nowrap;
}

.model-edit:hover {
  background: var(--bg-alt);
  color: var(--text-primary);
}

/* 删除：灰色图标按钮，置于工具条右侧 */
.model-remove-icon {
  margin-left: auto;
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-hover);
  color: var(--text-tertiary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.model-remove-icon:hover:not(:disabled) {
  background: var(--task-failed-bg, rgba(255, 77, 79, 0.1));
  color: var(--task-failed-text, #ff4d4f);
  border-color: var(--task-failed-border, rgba(255, 77, 79, 0.3));
}

.model-remove-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.detect-results {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}

.capability-display {
  display: flex;
  align-items: center;
  gap: 8px;
}

.capability-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 1.5;
  background: var(--accent-bg, #e8f3ff);
  color: var(--accent, #1990ff);
  border: 1px solid var(--accent-border, #b3d8ff);
  white-space: nowrap;
  min-width: 48px;
}

.capability-badge-icon {
  flex: 0 0 auto;
  width: 12px;
  height: 12px;
}

.capability-badge.vision {
  background: rgba(83, 74, 183, 0.1);
  color: #534ab7;
  border-color: rgba(83, 74, 183, 0.25);
}

.capability-badge.text {
  background: #e6f1fb;
  color: #185fa5;
  border-color: #b5d4f4;
}

.capability-badge.both {
  background: #f0f9ff;
  color: #0c4a6e;
  border-color: #bae6fd;
}

/* 🔒 未检测态（capability='' ）：灰色中性，明确表示「默认什么都不支持」 */
.capability-badge.unknown {
  background: #f4f4f5;
  color: #71717a;
  border-color: #d4d4d8;
}
.capability-badge.unknown .capability-badge-icon {
  display: none;
}

.capability-badge--mini {
  padding: 1px 8px;
  font-size: 11px;
  border-radius: 999px;
  white-space: nowrap;
  min-width: 44px;
}

.capability-hint {
  margin: 6px 0 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-tertiary);
}

.detect-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  line-height: 1.5;
}

.detect-tag.ok {
  background: var(--task-success-bg, #e6f7ee);
  color: var(--task-success-text, #0f6e56);
  border: 1px solid var(--task-success-border, #9fe1cb);
}

.detect-tag.fail {
  background: var(--task-failed-bg);
  color: var(--task-failed-text);
  border: 1px solid var(--task-failed-border);
}

.detect-hint {
  font-size: 11px;
  color: var(--text-tertiary);
}

.model-card .config-group {
  margin-bottom: 14px;
}

.model-card .config-group:last-child {
  margin-bottom: 0;
}

.model-card .config-row {
  margin-bottom: 14px;
}

.model-empty {
  padding: 16px;
  margin-bottom: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
  border: 1px dashed var(--border-light);
  border-radius: var(--radius-md);
}

.add-model-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 10px;
  margin-bottom: 24px;
  background: transparent;
  color: var(--accent, #1990ff);
  border: 1px dashed var(--accent-border, #b3d8ff);
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.add-model-btn:hover {
  background: var(--accent-bg, #e8f3ff);
}

.slot-card {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 16px;
  background: var(--bg-alt);
}

.slot-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-light);
}

.slot-card-header .sub-title-badge {
  flex: 0 0 auto;
}

.slot-card-header .sub-title-desc {
  color: var(--text-tertiary);
  font-size: 12px;
}

.slot-card .config-group {
  margin-bottom: 14px;
}

.slot-card .config-group:last-child {
  margin-bottom: 0;
}

.pool-check-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.pool-check-item {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px 5px 9px;
  background: var(--bg-secondary, #f3f4f6);
  border: 1.5px solid var(--border-default, #e5e7eb);
  border-radius: 999px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  transition: all 0.2s;
  user-select: none;
  -webkit-user-select: none;
}

.pool-check-item > span {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-left: 10px;
}

.pool-check-item:hover {
  border-color: var(--accent, #1990ff);
  background: var(--accent-bg, #e8f3ff);
  color: var(--accent, #1990ff);
}

.pool-check-item:has(input[type="checkbox"]:checked) {
  background: var(--accent, #1990ff);
  border-color: var(--accent, #1990ff);
  color: #fff;
  font-weight: 500;
}

.pool-check-item input[type="checkbox"] {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}

.pool-check-item::before {
  content: '';
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  border-radius: 50%;
  border: 1.5px solid currentColor;
  opacity: 0.45;
  transition: all 0.15s;
  box-sizing: border-box;
  vertical-align: middle;
}

.pool-check-item:has(input[type="checkbox"]:checked)::before {
  opacity: 1;
  border-color: #fff;
  background: #fff;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='11' height='11' fill='none' stroke='%231990ff' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: center;
  background-size: 11px;
}
</style>
