<template>
  <div class="api-docs-page">
    <!-- <div class="page-header">
      <h1>API 接口文档</h1>
      <p class="subtitle">LangGraph Server - 微码组件生成服务接口说明</p>
    </div> -->

    <div class="docs-container">
      <!-- 接口列表导航 -->
      <aside class="docs-sidebar">
        <h3>接口列表</h3>
        <nav class="api-nav">
          <a href="#api-1" class="nav-item">生成微码组件</a>
          <a href="#api-2" class="nav-item">生成文档配置</a>
          <a href="#health" class="nav-item">健康检查</a>
          <a href="#usage-guide" class="nav-item">调用方式说明</a>
        </nav>
      </aside>

      <!-- 接口详情 -->
      <main class="docs-content">
        <!-- API 1: 生成微码组件 -->
        <section id="api-1" class="api-section">
          <h2>生成微码组件</h2>
          <div class="api-badge">POST</div>
          <p class="api-description">根据Figma设计稿生成微码组件代码</p>

          <div class="api-block">
            <h3>请求地址</h3>
            <div class="code-block">
              <code>POST /api/component/generate-with-progress</code>
              <button
                class="btn-copy"
                @click="copyText('/api/component/generate-with-progress')"
              >
                复制
              </button>
            </div>
          </div>

          <div class="api-block">
            <h3>请求参数</h3>
            <table class="param-table">
              <thead>
                <tr>
                  <th>参数名</th>
                  <th>类型</th>
                  <th>必填</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>componentName</code></td>
                  <td>String</td>
                  <td>是</td>
                  <td>组件名称</td>
                </tr>
                <tr>
                  <td><code>fileKey</code></td>
                  <td>String</td>
                  <td>是</td>
                  <td>Figma文件Key</td>
                </tr>
                <tr>
                  <td><code>nodeId</code></td>
                  <td>String</td>
                  <td>是</td>
                  <td>Figma节点ID</td>
                </tr>
                <tr>
                  <td><code>figmaUrl</code></td>
                  <td>String</td>
                  <td>否</td>
                  <td>Figma URL（可选）</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="api-block">
            <h3>请求示例</h3>

            <!-- Tab切换按钮 -->
            <div class="code-tabs">
              <button
                class="tab-btn"
                :class="{ active: activeTab1 === 'curl' }"
                @click="activeTab1 = 'curl'"
              >
                curl
              </button>
              <button
                class="tab-btn"
                :class="{ active: activeTab1 === 'javascript' }"
                @click="activeTab1 = 'javascript'"
              >
                JavaScript
              </button>
              <button
                class="tab-btn"
                :class="{ active: activeTab1 === 'python' }"
                @click="activeTab1 = 'python'"
              >
                Python
              </button>
              <button
                class="tab-btn"
                :class="{ active: activeTab1 === 'postman' }"
                @click="activeTab1 = 'postman'"
              >
                Postman
              </button>
            </div>

            <!-- curl示例 -->
            <div v-show="activeTab1 === 'curl'" class="code-block">
              <pre><code>curl -X POST /api/component/generate-with-progress \
  -H "Content-Type: application/json" \
  -d '{
    "componentName": "c-my-component",
    "fileKey": "abc123def456",
    "nodeId": "123:456"
  }'</code></pre>
              <button class="btn-copy" @click="copyText(curlExample1)">
                复制
              </button>
            </div>

            <!-- JavaScript示例 -->
            <div v-show="activeTab1 === 'javascript'" class="code-block">
              <pre><code>const response = await fetch('/api/component/generate-with-progress', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    componentName: 'c-my-component',
    fileKey: 'abc123def456',
    nodeId: '123:456'
  })
})
const result = await response.json()</code></pre>
              <button class="btn-copy" @click="copyText(jsExample1)">
                复制
              </button>
            </div>

            <!-- Python示例 -->
            <div v-show="activeTab1 === 'python'" class="code-block">
              <pre><code>import requests

response = requests.post('/api/component/generate-with-progress',
  json={
    'componentName': 'c-my-component',
    'fileKey': 'abc123def456',
    'nodeId': '123:456'
  }
)
result = response.json()</code></pre>
              <button class="btn-copy" @click="copyText(pyExample1)">
                复制
              </button>
            </div>

            <!-- Postman示例 -->
            <div v-show="activeTab1 === 'postman'" class="postman-guide">
              <p><strong>Postman使用步骤：</strong></p>
              <ol>
                <li>创建新的POST请求</li>
                <li>输入URL: <code>/api/component/generate-with-progress</code></li>
                <li>在Headers中添加: <code>Content-Type: application/json</code></li>
                <li>在Body选项卡选择"raw"和"JSON"格式</li>
                <li>输入JSON数据并发送</li>
              </ol>
              <div class="code-block">
                <pre><code>{
  "componentName": "c-my-component",
  "fileKey": "abc123def456",
  "nodeId": "123:456"
}</code></pre>
                <button class="btn-copy" @click="copyText(postmanJson1)">
                  复制
                </button>
              </div>
            </div>
          </div>

          <div class="api-block">
            <h3>响应示例</h3>
            <div class="code-block">
              <pre><code>{
  "success": true,
  "sessionId": "session-1234567890",
  "message": "组件生成已启动"
}</code></pre>
            </div>
          </div>
        </section>

        <!-- API 2: 生成文档配置 -->
        <section id="api-2" class="api-section">
          <h2>生成文档配置</h2>
          <div class="api-badge">POST</div>
          <p class="api-description">分析需求文档并生成四个配置章节</p>

          <div class="api-block">
            <h3>请求地址</h3>
            <div class="code-block">
              <code>POST /api/generator/doc/generate-configs</code>
              <button
                class="btn-copy"
                @click="copyText('/api/generator/doc/generate-configs')"
              >
                复制
              </button>
            </div>
          </div>

          <div class="api-block">
            <h3>请求参数</h3>
            <table class="param-table">
              <thead>
                <tr>
                  <th>参数名</th>
                  <th>类型</th>
                  <th>必填</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>document</code></td>
                  <td>String</td>
                  <td>是</td>
                  <td>需求文档内容（Markdown格式）</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="api-block">
            <h3>请求示例</h3>

            <!-- Tab切换按钮 -->
            <div class="code-tabs">
              <button
                class="tab-btn"
                :class="{ active: activeTab2 === 'curl' }"
                @click="activeTab2 = 'curl'"
              >
                curl
              </button>
              <button
                class="tab-btn"
                :class="{ active: activeTab2 === 'javascript' }"
                @click="activeTab2 = 'javascript'"
              >
                JavaScript
              </button>
              <button
                class="tab-btn"
                :class="{ active: activeTab2 === 'python' }"
                @click="activeTab2 = 'python'"
              >
                Python
              </button>
              <button
                class="tab-btn"
                :class="{ active: activeTab2 === 'postman' }"
                @click="activeTab2 = 'postman'"
              >
                Postman
              </button>
            </div>

            <!-- curl示例 -->
            <div v-show="activeTab2 === 'curl'" class="code-block">
              <pre><code>curl -X POST /api/generator/doc/generate-configs \
  -H "Content-Type: application/json" \
  -d '{
    "document": "# 组件需求\\n\\n## 微码组件设计\\n\\n### 页面元素\\n1. 按钮"
  }'</code></pre>
              <button class="btn-copy" @click="copyText(curlExample2)">
                复制
              </button>
            </div>

            <!-- JavaScript示例 -->
            <div v-show="activeTab2 === 'javascript'" class="code-block">
              <pre><code>const response = await fetch('/api/generator/doc/generate-configs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    document: '# 组件需求\\n\\n## 微码组件设计'
  })
})
const result = await response.json()</code></pre>
              <button class="btn-copy" @click="copyText(jsExample2)">
                复制
              </button>
            </div>

            <!-- Python示例 -->
            <div v-show="activeTab2 === 'python'" class="code-block">
              <pre><code>import requests

response = requests.post('/api/generator/doc/generate-configs',
  json={
    'document': '# 组件需求\\n\\n## 微码组件设计'
  }
)
result = response.json()</code></pre>
              <button class="btn-copy" @click="copyText(pyExample2)">
                复制
              </button>
            </div>

            <!-- Postman示例 -->
            <div v-show="activeTab2 === 'postman'" class="postman-guide">
              <p><strong>Postman使用步骤：</strong></p>
              <ol>
                <li>创建新的POST请求</li>
                <li>输入URL: <code>/api/generator/doc/generate-configs</code></li>
                <li>在Headers中添加: <code>Content-Type: application/json</code></li>
                <li>在Body选项卡选择"raw"和"JSON"格式</li>
                <li>输入JSON数据并发送</li>
              </ol>
              <div class="code-block">
                <pre><code>{
  "document": "# 组件需求\\n\\n## 微码组件设计\\n\\n### 页面元素\\n1. 按钮"
}</code></pre>
                <button class="btn-copy" @click="copyText(postmanJson2)">
                  复制
                </button>
              </div>
            </div>
          </div>

          <div class="api-block">
            <h3>响应示例</h3>
            <div class="code-block">
              <pre><code>{
  "success": true,
  "merged": "完整的文档内容（包含配置）",
  "configs": {
    "businessEvents": "...",
    "businessStatuses": "...",
    "businessConfig": "...",
    "cssVariableConfig": "..."
  }
}</code></pre>
            </div>
          </div>
        </section>

        <!-- Health Check -->
        <section id="health" class="api-section">
          <h2>健康检查</h2>
          <div class="api-badge get">GET</div>
          <p class="api-description">检查服务器运行状态</p>

          <div class="api-block">
            <h3>请求地址</h3>
            <div class="code-block">
              <code>GET /health</code>
              <button class="btn-copy" @click="copyText('curl /health')">
                复制
              </button>
            </div>
          </div>

          <div class="api-block">
            <h3>响应示例</h3>
            <div class="code-block">
              <pre><code>{
  "status": "ok",
  "timestamp": "2026-07-02T04:12:03.472Z",
  "service": "langgraph-server"
}</code></pre>
            </div>
          </div>
        </section>

        <!-- 调用方式说明 -->
        <section id="usage-guide" class="api-section">
          <h2>调用方式说明</h2>
          <p class="api-description">除了curl命令，还有多种方式调用API接口</p>

          <div class="usage-method">
            <h3>JavaScript / TypeScript（前端）</h3>
            <p class="method-desc">
              <strong>使用场景：</strong
              >在Web应用中调用API、构建用户界面时实时获取数据、用户触发操作时调用后端服务
            </p>
            <p class="method-desc">
              <strong>典型用例：</strong
              >DocumentDesign.vue页面中的"生成配置"按钮、组件生成页（/generator/component）中的"开始生成组件"功能
            </p>
            <p class="method-desc">
              <strong>优势：</strong
              >用户操作实时响应、可以展示加载状态和进度条、结果可以直接在页面显示
            </p>
            <div class="code-block">
              <pre><code>const response = await fetch('/api/generator/doc/generate-configs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    document: '# 组件需求\\n\\n## 微码组件设计'
  })
})
const result = await response.json()</code></pre>
              <button
                class="btn-copy"
                @click="
                  copyText(`const response = await fetch('/api/generator/doc/generate-configs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    document: '# 组件需求\\\\n\\\\n## 微码组件设计'
  })
})
const result = await response.json()`)
                "
              >
                复制
              </button>
            </div>
          </div>

          <div class="usage-method">
            <h3>Python</h3>
            <p class="method-desc">
              <strong>使用场景：</strong
              >批量处理多个文档、自动化脚本和定时任务、数据分析和处理、集成到其他Python工具链
            </p>
            <p class="method-desc">
              <strong>典型用例：</strong
              >批量生成100个组件的配置、结合pandas进行数据处理、定时任务自动生成文档
            </p>
            <p class="method-desc">
              <strong>优势：</strong
              >适合批量操作、可以结合其他Python库、易于写自动化脚本
            </p>
            <div class="code-block">
              <pre><code>import requests

response = requests.post('/api/generator/doc/generate-configs',
  json={
    'document': '# 组件需求\\n\\n## 微码组件设计'
  }
)
result = response.json()</code></pre>
              <button
                class="btn-copy"
                @click="
                  copyText(
                    `import requests\n\nresponse = requests.post('/api/generator/doc/generate-configs', \n  json={\n    'document': '# 组件需求\\\\n\\\\n## 微码组件设计'\n  }\n)\nresult = response.json()`,
                  )
                "
              >
                复制
              </button>
            </div>
          </div>

          <div class="usage-method">
            <h3>Postman / Insomnia</h3>
            <p class="method-desc">
              <strong>使用场景：</strong
              >API调试和测试、开发阶段验证接口功能、学习和了解API用法、创建API文档和测试用例
            </p>
            <p class="method-desc">
              <strong>典型用例：</strong
              >测试新开发的API是否正常工作、验证参数格式是否正确、调试错误响应、团队共享API测试集合
            </p>
            <p class="method-desc">
              <strong>优势：</strong
              >图形界面操作直观、不需要写代码、可以保存请求历史、支持环境变量和测试脚本
            </p>
            <div class="guide-steps">
              <p><strong>使用步骤：</strong></p>
              <ol>
                <li>创建新的POST请求</li>
                <li>
                  输入URL: <code>/api/generator/doc/generate-configs</code>
                </li>
                <li>在Body选项卡选择"JSON"格式</li>
                <li>输入请求数据并发送</li>
              </ol>
            </div>
          </div>

          <div class="usage-summary">
            <h3>选择建议</h3>
            <ul>
              <li><strong>开发Web应用</strong> → JavaScript/TypeScript</li>
              <li><strong>批量处理/自动化</strong> → Python</li>
              <li><strong>测试和调试</strong> → Postman/Insomnia</li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { message } from "ant-design-vue";

// Tab切换状态
const activeTab1 = ref('curl')
const activeTab2 = ref('curl')

// curl示例
const curlExample1 = `curl -X POST /api/component/generate-with-progress \\
  -H "Content-Type: application/json" \\
  -d '{
    "componentName": "c-my-component",
    "fileKey": "abc123def456",
    "nodeId": "123:456"
  }'`;

const curlExample2 = `curl -X POST /api/generator/doc/generate-configs \\
  -H "Content-Type: application/json" \\
  -d '{
    "document": "# 组件需求\\n\\n## 微码组件设计\\n\\n### 页面元素\\n1. 按钮"
  }'`;

// JavaScript示例
const jsExample1 = `const response = await fetch('/api/component/generate-with-progress', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    componentName: 'c-my-component',
    fileKey: 'abc123def456',
    nodeId: '123:456'
  })
})
const result = await response.json()`;

const jsExample2 = `const response = await fetch('/api/generator/doc/generate-configs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    document: '# 组件需求\\n\\n## 微码组件设计'
  })
})
const result = await response.json()`;

// Python示例
const pyExample1 = `import requests

response = requests.post('/api/component/generate-with-progress',
  json={
    'componentName': 'c-my-component',
    'fileKey': 'abc123def456',
    'nodeId': '123:456'
  }
)
result = response.json()`;

const pyExample2 = `import requests

response = requests.post('/api/generator/doc/generate-configs',
  json={
    'document': '# 组件需求\\n\\n## 微码组件设计'
  }
)
result = response.json()`;

// Postman JSON示例
const postmanJson1 = `{
  "componentName": "c-my-component",
  "fileKey": "abc123def456",
  "nodeId": "123:456"
}`;

const postmanJson2 = `{
  "document": "# 组件需求\\n\\n## 微码组件设计\\n\\n### 页面元素\\n1. 按钮"
}`;

// 复制文本到剪贴板
const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    message.success("已复制到剪贴板");
  } catch (err) {
    message.error("复制失败");
  }
};
</script>

<style scoped>
.api-docs-page {
  max-width: 1500px;
  margin: 0 auto;
  padding: 24px 24px 60px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.page-header {
  text-align: center;
  margin-bottom: 48px;
  max-width: 1500px;
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
  background: white;
  border: 1px solid var(--border-strong);
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

.docs-container {
  display: flex;
  gap: 40px;
  align-items: flex-start;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 侧边栏导航 */
.docs-sidebar {
  width: 200px;
  flex-shrink: 0;
  position: fixed;
  top: 150px;
}

.docs-sidebar h3 {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 16px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.api-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.nav-item {
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  color: var(--text-secondary);
  text-decoration: none;
  transition: all 0.2s;
}

.nav-item:hover {
  background: var(--brand-bg-active);
  color: var(--brand);
}

/* 主内容区 */
.docs-content {
  flex: 1;
  min-width: 0;
  background: var(--bg-card);
  padding: 80px 50px;
  border-radius: var(--radius-md);
  padding-bottom: 40px;
  overflow-y: auto;
  align-self: stretch;
  margin-left: 300px;
}

.api-section {
  margin-bottom: 64px;
  padding-bottom: 48px;
  border-bottom: 1px solid var(--border-default);
}

.api-section:last-child {
  border-bottom: none;
}

.api-section h2 {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.api-badge {
  display: inline-block;
  padding: 4px 12px;
  background: var(--text-primary);
  color: white;
  font-size: 12px;
  font-weight: 700;
  border-radius: var(--radius-sm);
  margin-bottom: 16px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.api-badge.get {
  background: var(--brand);
}

.api-description {
  font-size: 15px;
  color: var(--text-secondary);
  margin-bottom: 32px;
  line-height: 1.6;
}

.api-block {
  margin-bottom: 32px;
}

.api-block h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;
}

/* 代码块 */
.code-block {
  position: relative;
  background: var(--bg-hover);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 16px;
  font-family: "SF Mono", "Monaco", "Menlo", "Consolas", monospace;
  font-size: 13px;
  line-height: 1.6;
  overflow-x: auto;
}

.code-block code {
  color: var(--text-primary);
}

.code-block pre {
  margin: 0;
}

.code-block pre code {
  display: block;
  white-space: pre;
}

.btn-copy {
  position: absolute;
  top: 12px;
  right: 12px;
  padding: 6px 12px;
  background: white;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-copy:hover {
  background: var(--brand);
  border-color: var(--brand);
  color: white;
}

/* 参数表格 */
.param-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.param-table th {
  background: var(--bg-hover);
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 2px solid var(--border-default);
}

.param-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-default);
  color: var(--text-secondary);
}

.param-table code {
  background: var(--border-light);
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  font-size: 13px;
  color: #d63384;
}

/* 调用方式说明样式 */
.usage-method {
  margin-bottom: 40px;
  padding: 20px;
  background: var(--bg-hover);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
}

.usage-method h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;
}

.method-desc {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 12px;
}

.method-desc strong {
  color: var(--text-primary);
}

.guide-steps {
  margin-top: 16px;
}

.guide-steps ol {
  margin: 12px 0;
  padding-left: 24px;
}

.guide-steps li {
  margin: 8px 0;
  line-height: 1.6;
  color: var(--text-secondary);
}

.usage-summary {
  padding: 20px;
  background: var(--brand-bg-hover);
  border-radius: var(--radius-md);
  border: 1px solid var(--brand-border);
}

.usage-summary h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;
}

.usage-summary ul {
  list-style: none;
  padding: 0;
}

.usage-summary li {
  padding: 8px 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.usage-summary li strong {
  color: var(--text-primary);
  font-weight: 600;
}

@media (max-width: 768px) {
  .docs-container {
    flex-direction: column;
  }

  .docs-sidebar {
    position: static;
    width: 100%;
  }
}

/* Tab切换样式 */
.code-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border-default);
  padding-bottom: 8px;
}

.tab-btn {
  padding: 8px 16px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.tab-btn:hover {
  color: var(--brand);
}

.tab-btn.active {
  color: var(--brand);
  border-bottom-color: var(--brand);
  font-weight: 600;
}

.postman-guide {
  background: var(--bg-hover);
}

.postman-guide ol {
  margin: 12px 0;
  padding-left: 24px;
}

.postman-guide li {
  margin: 8px 0;
  color: var(--text-secondary);
}
</style>
