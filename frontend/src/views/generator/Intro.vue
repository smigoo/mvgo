<template>
  <div class="intro-page">
    <div class="page-header">
      <h1>感智晓界系统架构介绍</h1>
      <p class="subtitle">智能体协助开发平台设计思路</p>
      <div class="header-links">
        <router-link to="/generator" class="header-link">← 返回开发界面</router-link>
      </div>
    </div>

    <div class="tabs-container">
      <div class="tabs-header">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="tab-btn"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="tabs-content">
        <!-- JY-MC 架构介绍 -->
        <div v-if="activeTab === 'Skills+Shell'" class="tab-panel">
          <section class="section">
            <h2>架构示意图</h2>
            <div class="architecture-diagram linear">
              <div class="arch-title">线性顺序执行</div>
              <div class="arch-flow">
                <div class="arch-node">Preview</div>
                <div class="arch-arrow">→</div>
                <div class="arch-node">Figma</div>
                <div class="arch-arrow">→</div>
                <div class="arch-node">Reqd</div>
                <div class="arch-arrow">→</div>
                <div class="arch-node">Req</div>
                <div class="arch-arrow">→</div>
                <div class="arch-node">Reqs</div>
              </div>
              <div class="arch-note">
                每个阶段必须等待前一阶段完成，无法并行处理
              </div>
            </div>
          </section>

          <section class="section">
            <h2>Skills驱动的工作流架构</h2>
            <p>第一代系统采用<strong>Skills + Shell脚本结合的顺序工作流</strong>，通过mc-gen.cjs脚本编排，调用Claude AI的skills执行5个阶段：</p>

            <div class="highlight-box" style="margin-bottom: 16px;">
              <p><strong>技术特点：</strong></p>
              <p>
                ✓ <strong>Shell脚本编排</strong>：mc-gen.cjs作为调度中枢，通过命令行参数控制流程<br>
                ✓ <strong>Skills智能执行</strong>：每个阶段调用预定义的AI技能，负责智能决策和代码生成<br>
                ✓ <strong>文件系统状态</strong>：使用文件作为状态存储和阶段间数据传递
              </p>
            </div>

            <div class="process-flow">
              <div class="flow-step">
                <span class="step-num">1</span>
                <div class="step-content">
                  <h3>Preview 阶段（预览图生成）</h3>
                  <p>下载Figma预览图，使用AI识别图片结构，生成可运行的基础代码框架</p>
                </div>
              </div>

              <div class="flow-arrow">↓</div>

              <div class="flow-step">
                <span class="step-num">2</span>
                <div class="step-content">
                  <h3>Figma 阶段（样式精修）</h3>
                  <p>获取Figma节点的详细数据，精确还原颜色、字体、边框、圆角、阴影等样式</p>
                </div>
              </div>

              <div class="flow-arrow">↓</div>

              <div class="flow-step">
                <span class="step-num">3</span>
                <div class="step-content">
                  <h3>Req-d 阶段（配置设计）</h3>
                  <p>分析需求并生成/更新"微码组件设计"配置段落到requirement.md，不修改代码</p>
                  <small>仅生成配置文档，供人工审核后再注入代码</small>
                </div>
              </div>

              <div class="flow-arrow">↓</div>

              <div class="flow-step">
                <span class="step-num">4</span>
                <div class="step-content">
                  <h3>Req 阶段（需求改造）</h3>
                  <p>根据requirement.md文档，实现业务接口、事件、状态等交互逻辑</p>
                  <small>单个AI负责，一次性生成</small>
                </div>
              </div>

              <div class="flow-arrow">↓</div>

              <div class="flow-step">
                <span class="step-num">5</span>
                <div class="step-content">
                  <h3>Req-s 阶段（配置增强）</h3>
                  <p>将配置注入到代码中，增强组件的业务能力（事件、状态、接口调用等）</p>
                  <small>根据Req-d生成的配置进行代码增强</small>
                </div>
              </div>
            </div>

            <div class="highlight-box warn" style="margin-top: 20px;">
              <p><strong>核心特点：</strong></p>
              <p>✓ 顺序执行，前一阶段完成才能开始下一阶段<br>
              ✓ 每个阶段独立运行，彼此不交互<br>
              ✗ 无并行处理，总耗时较长<br>
              ✗ 无智能体协作和对抗验证机制</p>
            </div>
          </section>

          <section class="section">
            <h2>为什么需要Skills + 脚本？</h2>

            <div class="why-need-box">
              <div class="why-item">
                <h3>为什么需要Skills（AI智能）？</h3>
                <p>脚本只能做确定性操作，无法处理需要"理解"和"判断"的任务：</p>
                <ul>
                  <li>✕ <strong>脚本无法理解自然语言</strong>："帮我生成节点2-9778的微码组件" → Skills能理解意图</li>
                  <li>✕ <strong>脚本无法生成代码</strong>：看Figma设计稿生成合理的Vue代码 → Skills能智能生成</li>
                  <li>✕ <strong>脚本无法做质量判断</strong>：代码是否符合规范 → Skills能语义级审查</li>
                </ul>
                <p class="summary">✓ <strong>Skills = 大脑</strong>，提供智能决策、理解、生成能力</p>
              </div>

              <div class="why-item">
                <h3>为什么需要脚本（流程控制）？</h3>
                <p>AI无法精确控制系统操作和外部集成：</p>
                <ul>
                  <li>✕ <strong>AI无法精确控制流程</strong>：按顺序创建目录、下载文件、保存状态 → 脚本能确定性执行</li>
                  <li>✕ <strong>AI无法调用外部API</strong>：调用Figma API获取节点数据 → 脚本能HTTP请求</li>
                  <li>✕ <strong>AI无法持久化状态</strong>：保存nodeId、阶段信息到文件 → 脚本能读写文件系统</li>
                  <li>✕ <strong>AI无法恢复中断</strong>：失败时保存checkpoint → 脚本能实现恢复机制</li>
                </ul>
                <p class="summary">✓ <strong>脚本 = 手脚</strong>，提供精确控制、系统集成、状态管理能力</p>
              </div>
            </div>
          </section>

          <section class="section">
            <h2>技术组成：Skills + 脚本</h2>
            <p>第一代架构的核心是<strong>Skills（AI智能）</strong>和<strong>Shell脚本（流程控制）</strong>的结合：</p>

            <div class="tech-components">
              <div class="component-box">
                <h3>Skills（AI智能单元）</h3>
                <ul>
                  <li><strong>frontend-mc-leader</strong>：总调度器，理解用户意图，协调整个工作流</li>
                  <li><strong>frontend-mc-developer</strong>：开发执行者，根据Figma数据生成Vue代码</li>
                  <li><strong>frontend-mc-code-reviewer</strong>：代码审查，检查代码质量和规范</li>
                  <li><strong>frontend-mc-guideline</strong>：规范指导，提供编码最佳实践</li>
                </ul>
                <div class="role-tag">作用：理解、生成、判断</div>
              </div>

              <div class="component-box">
                <h3>脚本（流程控制）</h3>
                <ul>
                  <li><strong>mc-gen.cjs</strong>：核心调度脚本（333KB），控制5阶段流程</li>
                  <li><strong>config.cjs</strong>：配置管理，环境变量和路径配置</li>
                  <li><strong>pattern-matcher.cjs</strong>：代码模式检查，验证规范</li>
                  <li><strong>setup-skills.sh</strong>：Skills安装脚本</li>
                </ul>
                <div class="role-tag">作用：调度、控制、持久化</div>
              </div>
            </div>
          </section>

          <section class="section">
            <h2>配合工作示例</h2>
            <p>以生成c-test组件的Preview阶段为例，展示Skills和脚本的协作过程：</p>

            <div class="workflow-example">
              <div class="workflow-step">
                <div class="step-number">1</div>
                <div class="step-detail">
                  <div class="step-actor skill">Skills</div>
                  <div class="step-action">用户："帮我生成节点2-9778的微码组件，命名为c-test"</div>
                  <div class="step-result">frontend-mc-leader 理解意图 → 解析参数 → 决策调用mc-gen脚本</div>
                </div>
              </div>

              <div class="workflow-step">
                <div class="step-number">2</div>
                <div class="step-detail">
                  <div class="step-actor script">脚本</div>
                  <div class="step-action">mc-gen.cjs 执行确定性操作</div>
                  <div class="step-result">创建目录 → 调用Figma API → 下载预览图 → 准备AI提示词</div>
                </div>
              </div>

              <div class="workflow-step">
                <div class="step-number">3</div>
                <div class="step-detail">
                  <div class="step-actor skill">Skills</div>
                  <div class="step-action">frontend-mc-developer 智能生成</div>
                  <div class="step-result">"看懂"预览图布局 → 结合Figma数据 → 生成完整Vue代码</div>
                </div>
              </div>

              <div class="workflow-step">
                <div class="step-number">4</div>
                <div class="step-detail">
                  <div class="step-actor script">脚本</div>
                  <div class="step-action">mc-gen.cjs 保存结果</div>
                  <div class="step-result">写入index.vue → 保存状态到env.json → 生成declare.json</div>
                </div>
              </div>

              <div class="workflow-step">
                <div class="step-number">5</div>
                <div class="step-detail">
                  <div class="step-actor skill">Skills</div>
                  <div class="step-action">frontend-mc-code-reviewer 质量审查</div>
                  <div class="step-result">检查代码规范 → 判断PASS/BLOCK → 决定是否继续</div>
                </div>
              </div>

              <div class="workflow-step">
                <div class="step-number">6</div>
                <div class="step-detail">
                  <div class="step-actor skill">Skills</div>
                  <div class="step-action">frontend-mc-leader 汇报结果</div>
                  <div class="step-result">向用户报告：Preview阶段完成 → 建议继续Figma阶段</div>
                </div>
              </div>
            </div>

            <div class="highlight-box" style="margin-top: 16px; background: var(--success-bg); border-left-color: var(--success);">
              <p><strong>协作要点：</strong></p>
              <p>
                <strong>Skills负责智能部分</strong>：理解需求、生成代码、审查质量、汇报结果<br>
                <strong>脚本负责确定性部分</strong>：流程控制、API调用、文件操作、状态管理<br>
                <strong>两者互补</strong>：Skills = 大脑（智能），脚本 = 手脚（执行）
              </p>
            </div>
          </section>

          <section class="section">
            <h2>优点与局限</h2>
            <div class="pros-cons">
              <div class="pros">
                <h3>优点</h3>
                <ul>
                  <li>线性流程清晰，易于理解和维护</li>
                  <li>整体开发时间较短（30-60秒）</li>
                  <li>对简单组件效果不错，适合快速原型</li>
                  <li>代码结构简洁，没有复杂的抽象</li>
                </ul>
              </div>
              <div class="cons">
                <h3>局限</h3>
                <ul>
                  <li><strong>单一AI负责生成</strong>：没有专门化分工，布局和样式混在一起</li>
                  <li><strong>缺乏验证机制</strong>：AI生成后直接输出，没有自动质量检查</li>
                  <li><strong>无法自动修复</strong>：发现问题后需要人工重新生成或手动修改</li>
                  <li><strong>依赖人工经验</strong>：质量完全取决于开发人员的检查能力</li>
                  <li><strong>复杂组件准确率低</strong>：多层嵌套、特殊效果容易出错</li>
                </ul>
              </div>
            </div>
          </section>

          <section class="section">
            <h2>实际效果</h2>
            <p>
              经过项目实践，第一代系统在<strong>简单组件</strong>（如数据卡片）上表现良好，
              但面对<strong>复杂布局</strong>（如多层级嵌套、特殊动画）时，准确率仅约50%，
              需要开发人员投入大量时间修正。
            </p>
          </section>
        </div>

        <!-- LangGraph 架构介绍 -->
        <div v-if="activeTab === 'langgraph'" class="tab-panel">
          <!-- 核心问题引入 -->
          <section class="section">
            <h2>为什么需要第二代？</h2>
            <p>
              第一代系统的核心问题是：<strong>顺序执行效率低，单一AI质量不稳定，缺乏验证和纠错机制</strong>。
            </p>
            <div class="highlight-box warn">
              <p><strong>第一代的痛点：</strong></p>
              <p>
                ✕ Preview和Figma阶段顺序执行，浪费时间<br>
                ✕ 单个AI一次性生成代码，容易出错<br>
                ✕ 没有验证机制，问题只能靠人工发现<br>
                ✕ 无法自动修复，需要人工介入或重新生成
              </p>
            </div>

            <p style="margin-top: 20px;">而最根本的原因在于：<strong>单角色自检存在"既当运动员又当裁判员"的问题</strong>，同一个 AI 无法客观评价自己的输出。</p>

            <div class="adversarial-flow">
              <div class="adversarial-step l1">
                <div class="step-badge">L1</div>
                <div class="step-info">
                  <h3>Vision 真实性检查</h3>
                  <p>AI 是否真的看到了图片？</p>
                  <span class="step-check">检测：占位符、空字段、sections 数量</span>
                </div>
              </div>
              <div class="adversarial-arrow">→</div>
              <div class="adversarial-step l2">
                <div class="step-badge">L2</div>
                <div class="step-info">
                  <h3>代码溯源检查</h3>
                  <p>代码是否来自 Vision？</p>
                  <span class="step-check">检测：臆造文本、数值、padding、margin</span>
                </div>
              </div>
              <div class="adversarial-arrow">→</div>
              <div class="adversarial-step l3">
                <div class="step-badge">L3</div>
                <div class="step-info">
                  <h3>交叉验证</h3>
                  <p>Vision 与 Code 是否一致？</p>
                  <span class="step-check">对比：布局、元素、主题、图表类型</span>
                </div>
              </div>
            </div>

            <div class="key-insight">
              <p><strong>核心洞察</strong>：不要让写代码的人检查自己是否看了图，让一个独立的人 (Agent) 拿着图来对照代码。</p>
            </div>

            <h3 style="margin-top: 24px; font-size: 15px; color: var(--error-text); font-weight: 700;">这是单智能体的根本弊端</h3>
            <p style="margin-top: 8px; color: var(--text-secondary); line-height: 1.8;">
              <strong>为什么单智能体 Loop 不行？</strong><br>
              理论上，让同一个模型循环"生成→自我检查→修订"也能跑起来。但这里有个致命缺陷：<strong>检查者和生成者共享同一套推理过程</strong>——模型天然倾向于认可自己的结论。就像让学生批改自己的试卷，他永远能找到理由给自己满分。<br><br>
              这就是单智能体无法逾越的边界：<strong>它永远是对的，因为它的判断依据和生成依据来自同一个推理空间</strong>。你让它检查自己的代码，它就检查自己推导的过程本身——这怎么可能发现错误？<br><br>
              真正有效的 Loop 需要一个<strong>独立的评判视角</strong>，一个从外部审视生成结果的角色。这正是第二代引入<strong>独立对抗性 Agent</strong>的根本原因：不是"一个模型多跑几遍"，而是"两个不同的模型互相制衡"。
            </p>

            <div class="highlight-box" style="margin-top: 16px; background: var(--feature-bg); border-left-color: var(--feature);">
              <p><strong>其实第一代就是一个"Loop"——只是人在环中：</strong></p>
              <p>
                第一代的实际工作流程是 <strong>AI生成 → 人工检查 → AI修改 → 人工再确认</strong>，本质上就是一个"生成→验证→修订"的循环。这正是现在流行的 <strong>Human-in-the-Loop (HITL)</strong> 模式。<br><br>
                第二代的突破在于：<strong>把人工审查角色替换为一个独立的对抗性 AI Agent</strong>，将 HITL 升级为全自动的 <strong>Agentic Loop</strong>。人的角色从"苦力审查员"转变为"最终验收者"，只在 AI 无法自行解决的边缘情况下介入。
              </p>
            </div>
          </section>

          <section class="section">
            <h2>什么是 LangGraph？</h2>
            <p>
              LangGraph 是一个<strong>工作流编排工具</strong>，可以把它想象成一个"智能项目经理"。
            </p>

            <div class="highlight-box">
              <p><strong>打个比方：</strong></p>
              <p>
                如果把AI比作员工，传统方式是让一个员工做完所有事情（容易累、容易出错）。<br>
                而LangGraph就像一个项目经理，它能：<br>
                ✓ 安排多个专业员工各司其职（布局专家、样式专家、验证专家）<br>
                ✓ 决定谁先做、谁后做，哪些可以同时做<br>
                ✓ 让审查员工检查其他员工的成果，发现问题就重做<br>
                ✓ 记录每个环节的工作日志，出问题能追溯
              </p>
            </div>

            <h3 style="margin-top: 20px;">适合什么场景？</h3>
            <p>LangGraph 特别适合<strong>复杂、多步骤、需要质量保证的AI任务</strong>：</p>
            <ul>
              <li>✓ <strong>代码生成</strong>：需要多轮优化和验证，不能一次成型</li>
              <li>✓ <strong>文档处理</strong>：提取→分析→总结→校验，环环相扣</li>
              <li>✓ <strong>数据分析</strong>：采集→清洗→建模→验证，步骤清晰</li>
              <li>✓ <strong>客服系统</strong>：理解问题→查询知识库→生成回复→质量检查</li>
            </ul>

            <p style="margin-top: 16px;">
              <strong>不适合的场景：</strong>简单的一问一答、单步骤任务（比如翻译一句话、总结一段文字），
              用传统方式更快更经济。
            </p>
          </section>

          <section class="section">
            <h2>架构示意图</h2>
            <div class="architecture-diagram collaborative">
              <div class="arch-title">多角色协作 + 精修 + 对抗验证</div>

              <div class="arch-layer">
                <div class="layer-title">阶段1：Figma 数据获取 + Vision 分析</div>
                <div class="arch-flow">
                  <div class="arch-node parallel">Figma Connector Visual Parser</div>
                </div>
              </div>

              <div class="arch-arrow-down">↓</div>

              <div class="arch-layer">
                <div class="layer-title">阶段2：审查 + 代码生成</div>
                <div class="arch-flow multi">
                  <div class="arch-node agent">Layout Reviewer</div>
                  <div class="arch-node agent">Style Mapper</div>
                  <div class="arch-node agent">Microcode Eng.</div>
                </div>
              </div>

              <div class="arch-arrow-down">↓</div>

              <div class="arch-layer">
                <div class="layer-title">阶段3：精修（新增）</div>
                <div class="arch-flow multi">
                  <div class="arch-node" style="background: linear-gradient(135deg, var(--warning-light) 0%, var(--c-yellow-400) 100%); color: var(--bg-card); border-color: var(--warning-light);">Layout Refiner</div>
                  <div class="arch-arrow">→</div>
                  <div class="arch-node" style="background: linear-gradient(135deg, var(--c-purple-500) 0%, var(--c-pink-400) 100%); color: var(--bg-card); border-color: var(--c-purple-500);">Style Refiner</div>
                </div>
              </div>

              <div class="arch-arrow-down">↓</div>

              <div class="arch-layer">
                <div class="layer-title">阶段4：对抗验证 + 迭代修订</div>
                <div class="arch-flow adversarial">
                  <div class="arch-node validator">Adversarial Checker</div>
                  <div class="arch-arrow-bidirectional">⇄ 不合格打回</div>
                  <div class="arch-node generator">Microcode Eng.</div>
                </div>
              </div>

              <div class="arch-arrow-down">↓</div>

              <div class="arch-layer">
                <div class="layer-title">阶段5：渲染截图 + 视觉比对</div>
                <div class="arch-flow multi">
                  <div class="arch-node" style="background: linear-gradient(135deg, var(--c-blue-100) 0%, var(--c-blue-200) 100%); color: var(--text-primary); border-color: var(--c-blue-300);">Screenshot Renderer</div>
                  <div class="arch-arrow">→</div>
                  <div class="arch-node" style="background: linear-gradient(135deg, var(--c-teal-100) 0%, var(--c-teal-200) 100%); color: var(--text-primary); border-color: var(--c-teal-300);">Visual Comparator</div>
                </div>
              </div>

              <div class="arch-note success">
                ✓ 审查先行 + 代码生成 + 两道精修 + 对抗验证 + 视觉比对，全链路质量保障
              </div>
            </div>
          </section>

          <section class="section">
            <h2>12个专业化角色详解</h2>
            <p>系统中实际运行着<strong>12个</strong>高度专业化的角色（含非AI的 Figma 连接器），按工作流划分为两组。每个角色的模型、温度等配置均来自<b>实际源代码</b>：</p>

            <!-- 组件生成工作流 -->
            <div style="margin-top: 20px;">
              <h3 style="font-size: 15px; color: var(--brand); margin-bottom: 12px;">组件生成工作流（Phase 1/2）— 10 个角色</h3>
              <div class="agent-details">
                <div class="agent-card" style="border-left-color: var(--c-purple-500);">
                  <div class="agent-header">
                    <span class="agent-icon"></span>
                    <div>
                      <h3>Figma 连接器</h3>
                      <span class="agent-tag">FigmaConnector</span>
                    </div>
                  </div>
                  <p class="agent-desc">非 AI 角色，纯数据获取。连接 Figma API 下载设计稿数据和图片资源，启用缓存避免重复请求</p>
                  <div class="agent-meta">
                    <span class="meta-item type-none">类型: 非AI · 数据获取</span>
                    <span class="meta-item">缓存: 开启</span>
                  </div>
                </div>

                <div class="agent-card" style="border-left-color: var(--c-purple-500);">
                  <div class="agent-header">
                    <span class="agent-icon"></span>
                    <div>
                      <h3>视觉解析师</h3>
                      <span class="agent-tag">VisualParser</span>
                    </div>
                  </div>
                  <p class="agent-desc">使用 Vision AI 分析预览图 / Figma 截图，提取布局结构、视觉元素和交互信息</p>
                  <div class="agent-meta">
                    <span class="meta-item model-qwen">模型: Qwen (Vision)</span>
                    <span class="meta-item">温度: 0</span>
                    <span class="meta-item">来源: src/roles/visual-parser.js</span>
                  </div>
                </div>

                <div class="agent-card" style="border-left-color: var(--warning-light);">
                  <div class="agent-header">
                    <span class="agent-icon"></span>
                    <div>
                      <h3>布局审查师</h3>
                      <span class="agent-tag">LayoutReviewer</span>
                    </div>
                  </div>
                  <p class="agent-desc">审查视觉解析师输出的布局结构，发现嵌套层级、定位方式、响应式适配等潜在问题</p>
                  <div class="agent-meta">
                    <span class="meta-item">模型: Claude Sonnet 4.6</span>
                    <span class="meta-item">温度: 0</span>
                    <span class="meta-item">来源: src/roles/layout-reviewer.js</span>
                  </div>
                </div>

                <div class="agent-card" style="border-left-color: var(--success-light);">
                  <div class="agent-header">
                    <span class="agent-icon"></span>
                    <div>
                      <h3>样式映射师</h3>
                      <span class="agent-tag">StyleMapper</span>
                    </div>
                  </div>
                  <p class="agent-desc">将视觉元素映射为 CSS/Less 代码，输出主题变量、CSS 类名和 Design Token 覆盖度报告</p>
                  <div class="agent-meta">
                    <span class="meta-item">模型: Claude Sonnet 4.6</span>
                    <span class="meta-item">温度: 0</span>
                    <span class="meta-item">来源: src/roles/style-mapper.js</span>
                  </div>
                </div>

                <div class="agent-card" style="border-left-color: var(--warning-light);">
                  <div class="agent-header">
                    <span class="agent-icon"></span>
                    <div>
                      <h3>布局精修师</h3>
                      <span class="agent-tag">LayoutRefiner</span>
                      <span class="badge-new">新增</span>
                    </div>
                  </div>
                  <p class="agent-desc">基于 Figma Auto Layout 数据精确还原 CSS 布局：flex 方向、主轴/交叉轴对齐、按 bbox 比例分配尺寸、padding/gap/margin 精确取值</p>
                  <div class="agent-meta">
                    <span class="meta-item">模型: Claude Sonnet 4.6</span>
                    <span class="meta-item">温度: 0</span>
                    <span class="meta-item">来源: src/roles/layout-refiner.js</span>
                  </div>
                </div>

                <div class="agent-card highlighted-role" style="border-left-color: var(--error);">
                  <div class="agent-header">
                    <span class="agent-icon">‍</span>
                    <div>
                      <h3>微码工程师</h3>
                      <span class="agent-tag">MicrocodeEngineer</span>
                      <span class="badge-core">核心</span>
                    </div>
                  </div>
                  <p class="agent-desc">真正<strong>生成 Vue 组件代码</strong>的角色。加载微码规范、代码模式和声明约束，Figma 阶段自动注入 figma.md 精修规则，输出完整组件文件集合</p>
                  <div class="agent-meta">
                    <span class="meta-item">模型: Claude Sonnet 4.6</span>
                    <span class="meta-item">温度: 0</span>
                    <span class="meta-item">来源: src/roles/microcode-engineer.js</span>
                  </div>
                </div>

                <div class="agent-card" style="border-left-color: var(--c-purple-500);">
                  <div class="agent-header">
                    <span class="agent-icon"></span>
                    <div>
                      <h3>样式精修师</h3>
                      <span class="agent-tag">StyleRefiner</span>
                      <span class="badge-new">新增</span>
                    </div>
                  </div>
                  <p class="agent-desc">基于 Figma fills/effects/strokes 精确还原 CSS 样式：颜色（r*255 精确转换）、阴影（offset+radius+spread）、边框、圆角、字体，零臆造原则</p>
                  <div class="agent-meta">
                    <span class="meta-item">模型: Claude Sonnet 4.6</span>
                    <span class="meta-item">温度: 0</span>
                    <span class="meta-item">来源: src/roles/style-refiner.js</span>
                  </div>
                </div>

                <div class="agent-card highlighted-role" style="border-left-color: var(--error-text);">
                  <div class="agent-header">
                    <span class="agent-icon">⚔️</span>
                    <div>
                      <h3>对抗性检查师</h3>
                      <span class="agent-tag">AdversarialChecker</span>
                      <span class="badge-core">核心</span>
                    </div>
                  </div>
                  <p class="agent-desc">从<strong>批判性视角</strong>对照原设计稿检查生成代码，输出质量评分和修订建议，不合格则触发 L2 修订循环打回重做</p>
                  <div class="agent-meta">
                    <span class="meta-item">模型: Claude Sonnet 4.6</span>
                    <span class="meta-item">温度: 0</span>
                    <span class="meta-item">来源: src/roles/adversarial-checker.js</span>
                  </div>
                </div>

                <div class="agent-card" style="border-left-color: var(--c-blue-300);">
                  <div class="agent-header">
                    <span class="agent-icon"></span>
                    <div>
                      <h3>渲染截图师</h3>
                      <span class="agent-tag">ScreenshotRenderer</span>
                      <span class="badge-new">新增</span>
                    </div>
                  </div>
                  <p class="agent-desc">非 AI 角色，使用 <strong>Puppeteer 无头浏览器</strong>将生成的组件代码渲染为 PNG 截图。优先走前端 Vue 运行时预览页（支持动态内容），失败时降级为静态抽取渲染</p>
                  <div class="agent-meta">
                    <span class="meta-item type-none">类型: 非AI · 渲染引擎</span>
                    <span class="meta-item">引擎: Puppeteer / Chromium</span>
                    <span class="meta-item">来源: src/roles/screenshot-renderer.js</span>
                  </div>
                </div>

                <div class="agent-card" style="border-left-color: var(--c-teal-500);">
                  <div class="agent-header">
                    <span class="agent-icon"></span>
                    <div>
                      <h3>视觉比对师</h3>
                      <span class="agent-tag">VisualComparator</span>
                      <span class="badge-new">新增</span>
                    </div>
                  </div>
                  <p class="agent-desc">将 <strong>Figma 原图</strong>和<strong>渲染截图</strong>同时交给 Vision AI，从颜色、间距、布局、元素完整性等 7 个维度输出结构化差异报告（含相似度评分、问题列表、是否通过）</p>
                  <div class="agent-meta">
                    <span class="meta-item model-qwen">模型: Qwen (Vision)</span>
                    <span class="meta-item">温度: 0</span>
                    <span class="meta-item">来源: src/roles/visual-comparator.js</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 文档配置工作流 -->
            <div style="margin-top: 28px;">
              <h3 style="font-size: 15px; color: var(--c-purple-500); margin-bottom: 12px;">文档配置工作流 — 2 个 Agent</h3>
              <div class="agent-details">
                <div class="agent-card" style="border-left-color: var(--c-purple-500);">
                  <div class="agent-header">
                    <span class="agent-icon"></span>
                    <div>
                      <h3>文档分析师</h3>
                      <span class="agent-tag">DocAnalyzerAgent</span>
                    </div>
                  </div>
                  <p class="agent-desc">分析微码组件需求文档，提取页面元素、交互设计和接口配置等关键信息</p>
                  <div class="agent-meta">
                    <span class="meta-item">模型: Claude 3.5 Sonnet</span>
                    <span class="meta-item">温度: 0.3</span>
                    <span class="meta-item">来源: src/agents/doc-analyzer-agent.js</span>
                  </div>
                </div>

                <div class="agent-card" style="border-left-color: var(--c-teal-500);">
                  <div class="agent-header">
                    <span class="agent-icon"></span>
                    <div>
                      <h3>配置生成师</h3>
                      <span class="agent-tag">ConfigGeneratorAgent</span>
                    </div>
                  </div>
                  <p class="agent-desc">基于文档分析结果，自动生成 declare.json 的 businessEvents、businessStatuses、businessConfig、cssVariableConfig 四个配置章节</p>
                  <div class="agent-meta">
                    <span class="meta-item">模型: Claude 3.5 Sonnet</span>
                    <span class="meta-item">温度: 0.3</span>
                    <span class="meta-item">来源: src/agents/config-generator-agent.js</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="highlight-box" style="margin-top: 20px; background: var(--brand-bg); border-left-color: var(--brand);">
              <p><strong>专业化分工的优势：</strong></p>
              <p>
                <strong>职责单一</strong>：每个 Agent 只做一件事，代码生成质量和一致性远高于单 Agent 模式<br>
                <strong>先审后写</strong>：布局审查师 + 样式映射师先行分析，微码工程师基于结构化分析结果生成代码<br>
                ⚔️ <strong>对抗闭环</strong>：对抗性检查师独立验证生成结果，不合格自动打回，形成质量闭环<br>
                <strong>双 Provider 路由</strong>：视觉任务走 Qwen，文本任务走 Claude，资源按需分配<br>
                <strong>数据可溯源</strong>：每个 Agent 标注了实际源代码位置，所见即所得
              </p>
            </div>
          </section>

          <section class="section">
            <h2>LangGraph 第二代架构（ing）</h2>
            <p>第二代系统引入<strong>多智能体协作 + 并行处理 + 对抗验证</strong>，工作流程如下：</p>

            <div class="process-flow">
              <div class="flow-step">
                <span class="step-num">1</span>
                <div class="step-content">
                  <h3>Figma 阶段（合并优化）</h3>
                  <p><strong>并行处理</strong>：同时下载预览图和获取节点数据，节省时间</p>
                  <p><strong>预处理分析</strong>：清理冗余节点，优化数据结构</p>
                  <p><strong>节点规则检查</strong>：验证根节点bg/header等是否符合规范</p>
                  <small>原先的Preview + Figma两阶段合并为一个，效率提升50%</small>
                </div>
              </div>

              <div class="flow-arrow">↓</div>

              <div class="flow-step">
                <span class="step-num">2</span>
                <div class="step-content">
                  <h3>代码生成 + 精修阶段（先审后写 + 两道精修）</h3>
                  <p><strong>LayoutReviewer</strong>：审查布局结构，发现嵌套、定位等潜在问题</p>
                  <p><strong>StyleMapper</strong>：将视觉元素映射为 CSS/Less 变量</p>
                  <p>‍<strong>MicrocodeEngineer</strong>：基于审查结果 + figma.md 规则生成完整组件代码</p>
                  <p><strong>LayoutRefiner</strong>：Auto Layout → CSS 布局精修（flex/position/gap/padding）</p>
                  <p><strong>StyleRefiner</strong>：fills/effects/strokes → CSS 样式精修（颜色/字体/阴影/圆角）</p>
                  <small>5个专业角色各司其职 + 两道精修工序，质量远超单一 AI</small>
                </div>
              </div>

              <div class="flow-arrow">↓</div>

              <div class="flow-step">
                <span class="step-num">3</span>
                <div class="step-content">
                  <h3>验证阶段（对抗式检查）</h3>
                  <p>⚔️ <strong>独立验证Agent</strong>：像"审查官"一样挑刺，找出生成代码的问题</p>
                  <p><strong>自动修复循环</strong>：发现问题后自动调用生成Agent修复，最多1次修订</p>
                  <p>✓ <strong>质量确认</strong>：通过所有检查才输出最终代码</p>
                  <small>对抗式验证机制，准确率从50%提升至85%</small>
                </div>
              </div>

              <div class="flow-arrow">↓</div>

              <div class="flow-step">
                <span class="step-num">4</span>
                <div class="step-content">
                  <h3>视觉比对阶段（渲染 + 像素级校验）</h3>
                  <p><strong>ScreenshotRenderer</strong>：用 Puppeteer 无头浏览器将生成代码渲染为 PNG 截图</p>
                  <p><strong>VisualComparator</strong>：将 Figma 原图和渲染截图交给 Vision AI，从颜色、间距、布局等 7 个维度输出差异报告</p>
                  <p><strong>结构化输出</strong>：包含相似度评分、分级问题列表、是否通过的结论</p>
                  <small>端到端视觉还原度校验，像素级保障</small>
                </div>
              </div>
            </div>
          </section>


          <section class="section">
            <h2>循环（Loop）概念 — 架构的核心闭环机制</h2>
            <p>
              Loop 不是单一概念，而是<strong>三层循环体系</strong>，每一层解决不同粒度的问题。这是 LangGraph 架构区别于线性工作流的核心特征。
            </p>

            <!-- 三层循环总览 -->
            <div class="loop-layers" style="margin-top: 20px;">
              <!-- 第一层：图引擎循环 -->
              <div class="loop-layer">
                <div class="layer-header">
                  <div class="layer-badge l1">L1</div>
                  <div class="layer-title-group">
                    <h3>图引擎循环 — 基础设施</h3>
                    <span class="layer-tag">graph.js</span>
                  </div>
                </div>
                <div class="layer-body">
                  <div class="layer-code-block">
                    <code>while (currentNode && iterations < maxIterations) {  // maxIterations = 100
                      await this.executeNode(currentNode)
                      currentNode = this.getNextNode(currentNode)
                    }</code>
                  </div>
                  <p>所有图（Phase1 / Phase2 / 动态工作流）的<strong>底层运行时</strong>。通过 <code>while</code> 循环不断推进节点，当条件边返回已执行过的节点名称时，<code>getNextNode()</code> 就让 while 循环回到该节点，<strong>天然支持回边/循环</strong>。</p>
                  <div class="layer-features">
                    <span class="feature-tag">所有图共用</span>
                    <span class="feature-tag">硬上限 100 次</span>
                    <span class="feature-tag">支持条件边回边</span>
                    <span class="feature-tag">防死循环安全网</span>
                  </div>
                </div>
              </div>

              <!-- 第二层：修订迭代循环 -->
              <div class="loop-layer highlighted">
                <div class="layer-header">
                  <div class="layer-badge l2">L2</div>
                  <div class="layer-title-group">
                    <h3>修订迭代循环 — 核心业务循环</h3>
                    <span class="layer-tag">Phase2 图 · Figma 精修阶段</span>
                  </div>
                </div>
                <div class="layer-body">
                  <div class="architecture-diagram collaborative" style="margin: 16px 0; padding: 16px;">
                    <div class="arch-flow adversarial" style="justify-content: center; gap: 8px; flex-wrap: wrap;">
                      <div class="arch-node agent" style="font-size: 12px; padding: 8px 12px;">microcode-engineer<br><small>代码生成</small></div>
                      <span style="font-size: 18px; color: var(--text-tertiary);">→</span>
                      <div class="arch-node validator" style="font-size: 12px; padding: 8px 12px;">adversarial-checker<br><small>对抗检查</small></div>
                      <span style="font-size: 18px; color: var(--text-tertiary);">→</span>
                      <div style="background: var(--c-orange-100); border: 2px solid var(--warning-light); border-radius: var(--radius-md); padding: 8px 12px; font-size: 12px; text-align: center;">
                        <strong>revision-decision</strong><br><small>判断是否修订</small>
                      </div>
                    </div>
                    <div style="display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 12px; font-size: 13px;">
                      <span style="color: var(--error); font-weight: 600;">← needs_revision 回边</span>
                      <span style="color: var(--text-tertiary);">|</span>
                      <span style="color: var(--success-light); font-weight: 600;">→ 通过则结束</span>
                    </div>
                  </div>
                  <p>这是你在<strong>实际生成组件时看到的效果</strong>："生成 → 检查 → 修订 → 重新检查" 的迭代过程。</p>
                  <table class="loop-detail-table">
                    <thead>
                      <tr><th>维度</th><th>说明</th></tr>
                    </thead>
                    <tbody>
                      <tr><td>循环触发</td><td><code>checkResult === 'needs_revision'</code> 且未达最大次数</td></tr>
                      <tr><td>每轮变化</td><td><code>iterationCount++</code>，将上次检查的 <code>critiques</code> 传给生成 Agent 作为修订指导</td></tr>
                      <tr><td>退出条件</td><td>检查通过，或达到 <code>maxIterations=1</code>（1 次生成 + 1 次修订 = 共 2 轮）</td></tr>
                      <tr><td>实际位置</td><td><code>mc-component-graph-phase2.js</code> 第 544-548 行的条件边</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- 第三层：节点级重试循环 -->
              <div class="loop-layer">
                <div class="layer-header">
                  <div class="layer-badge l3">L3</div>
                  <div class="layer-title-group">
                    <h3>节点级重试循环 — 容错机制</h3>
                    <span class="layer-tag">Orchestrator · 动态工作流</span>
                  </div>
                </div>
                <div class="layer-body">
                  <div class="layer-code-block">
                    <code>// orchestrator.js withRetry()
                    function withRetry(fn, { maxRetries = 2 }) {
                      for (let attempt = 0; attempt <= maxRetries; attempt++) {
                        try { return await fn(state) }
                        catch (err) {
                          console.warn(`[Retry ${attempt + 1}/${maxRetries}] ${err.message}`)
                          await sleep(attempt * 2000) // 等待后重试
                        }
                      }
                    }</code>
                  </div>
                  <p><strong>与 L2 图级循环是不同维度的</strong>：L3 不改变业务状态，仅在网络异常或 AI 调用失败时自动重试。</p>
                  <table class="loop-detail-table">
                    <thead>
                      <tr><th>对比</th><th>L2 修订迭代（图级）</th><th>L3 节点重试（Orchestrator）</th></tr>
                    </thead>
                    <tbody>
                      <tr><td>触发原因</td><td>代码质量不达标</td><td>网络 / AI 调用异常</td></tr>
                      <tr><td>状态变化</td><td>iterationCount++，传入新 critiques</td><td>不改变 state</td></tr>
                      <tr><td>当前使用者</td><td>Phase2 图</td><td>动态工作流图</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div class="highlight-box" style="margin-top: 20px; background: var(--feature-bg); border-left-color: var(--feature);">
              <p><strong>多层安全网：</strong></p>
              <p>
                <strong>L1 图引擎 maxIterations=100</strong>：防死循环的硬上限<br>
                <strong>L2 Phase2 maxIterations=2</strong>：业务层修订次数上限<br>
                <strong>axios timeout=300000</strong>：单次 API 调用 5 分钟超时<br>
                <strong>Promise.race 超时</strong>：视觉分析节点级超时保护<br>
                <strong>L3 withRetry maxRetries=2</strong>：节点异常自动重试
              </p>
            </div>
          </section>


          <section class="section">
            <h2>预期效果提升</h2>
            <div class="comparison-table">
              <table>
                <thead>
                  <tr>
                    <th>指标</th>
                    <th>第一代</th>
                    <th>第二代</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>简单组件准确率</td>
                    <td>~80%</td>
                    <td><strong>~95%</strong></td>
                  </tr>
                  <tr>
                    <td>复杂组件准确率</td>
                    <td>~50%</td>
                    <td><strong>~90%</strong></td>
                  </tr>
                  <tr>
                    <td>需要人工修正</td>
                    <td>60%的情况</td>
                    <td><strong>15%的情况</strong></td>
                  </tr>
                  <tr>
                    <td>生成时间</td>
                    <td>30-60秒</td>
                    <td>120-240秒</td>
                  </tr>
                  <tr>
                    <td>视觉还原度</td>
                    <td>无自动检测</td>
                    <td><strong>AI自动比对</strong></td>
                  </tr>
                  <tr>
                    <td>验证器数量</td>
                    <td>0</td>
                    <td><strong>26个专项验证</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="note">
              * 第二代虽然时间稍长，但质量大幅提升，综合效率更高
            </p>
          </section>

          <section class="section">
            <h2>架构亮点总结</h2>
            <p>第二代架构不只是"换了个框架"，而是一次从<strong>单打独斗到多智能体协作</strong>、从<strong>脚本编排到图引擎驱动</strong>、从<strong>本地工具到云端平台</strong>的全面跃迁。</p>

            <div class="highlights-grid" style="margin-top: 20px;">
              <div class="highlight-card core">
                <div class="hl-number">1</div>
                <div class="hl-content">
                  <h3>⚔️ 对抗性闭环 <span class="badge-core-highlight">核心</span></h3>
                  <p>独立验证 Agent 拿着 Figma 原图对照代码挑刺，发现问题<strong>自动打回重做</strong>，形成"生成→检查→修订→再检查"的闭环。不是"写完检查一下"，而是<strong>开发/测试互相制衡</strong>。</p>
                  <span class="hl-keyword">制衡</span>
                </div>
              </div>

              <div class="highlight-card core">
                <div class="hl-number">2</div>
                <div class="hl-content">
                  <h3>三层 Loop 容错体系 <span class="badge-core-highlight">核心</span></h3>
                  <p>图引擎层支持条件回边 + 业务层修订迭代循环 + 节点层异常重试，架构<strong>自带容错和自愈能力</strong>，不死循环、不静默挂起。</p>
                  <span class="hl-keyword">自愈</span>
                </div>
              </div>

              <div class="highlight-card core">
                <div class="hl-number">3</div>
                <div class="hl-content">
                  <h3>专业化分工 + 模型按需分配 <span class="badge-core-highlight">核心</span></h3>
                  <p>12 个角色各司其职（视觉解析/布局审查/样式映射/代码生成/布局精修/样式精修/对抗检查/渲染截图/视觉比对/文档分析/配置生成），视觉任务走 Qwen、文本任务走 Claude，双 Provider 独立路由。</p>
                  <span class="hl-keyword">分工</span>
                </div>
              </div>

              <div class="highlight-card">
                <div class="hl-number">4</div>
                <div class="hl-content">
                  <h3>☁️ 独立云端服务</h3>
                  <p>从绑死在项目目录的本地脚本，变为独立 Web 服务。HTTP API 调用、多用户并发、SSE 实时推送、负载均衡高可用，<strong>从个人工具到企业平台</strong>。</p>
                  <span class="hl-keyword">平台</span>
                </div>
              </div>

              <div class="highlight-card">
                <div class="hl-number">5</div>
                <div class="hl-content">
                  <h3>统一图引擎，编排即执行</h3>
                  <p>同一套 <code>Graph</code> 引擎驱动所有工作流（组件生成/文档配置/代码生成/批量调度）。前端画布编排的 JSON 可直接反序列化为可执行图，<strong>新工作流不需要写引擎代码</strong>。</p>
                  <span class="hl-keyword">复用</span>
                </div>
              </div>

              <div class="highlight-card">
                <div class="hl-number">6</div>
                <div class="hl-content">
                  <h3>三层可观测性</h3>
                  <p>结构化日志自动关联 sessionId → SSE 实时推送到前端 → 任务状态持久化 + 断线重连。关闭浏览器再打开，通过 sessionId <strong>照样看到完整进度</strong>。</p>
                  <span class="hl-keyword">可观测</span>
                </div>
              </div>

              <div class="highlight-card">
                <div class="hl-number">7</div>
                <div class="hl-content">
                  <h3>Agent 可插拔配置</h3>
                  <p>每个节点可独立配置 model / temperature / maxTokens，Claude 挂了<strong>自动降级到 Qwen</strong>，视觉走 Qwen、文本走 Claude 双路由。</p>
                  <span class="hl-keyword">灵活</span>
                </div>
              </div>

              <div class="highlight-card">
                <div class="hl-number">8</div>
                <div class="hl-content">
                  <h3>四层错误防护</h3>
                  <p>单节点失败不会拖垮全局：<strong>自动重试（指数退避）→ 降级备用模型 → 超时熔断（5min）→ 僵尸回收（2h）</strong>，四层渐进式防护。</p>
                  <span class="hl-keyword">鲁棒</span>
                </div>
              </div>

              <div class="highlight-card">
                <div class="hl-number">9</div>
                <div class="hl-content">
                  <h3>批量 DAG 调度</h3>
                  <p>多组件间声明 <code>dependsOn</code> 依赖关系，调度器按拓扑序分层、同层并行执行。自动检测循环依赖，<strong>中断可恢复</strong>。</p>
                  <span class="hl-keyword">并行</span>
                </div>
              </div>

              <div class="highlight-card">
                <div class="hl-number">10</div>
                <div class="hl-content">
                  <h3>可视化导出 + 热重载</h3>
                  <p>图可导出为 Mermaid / JSON 格式，工作流持久化管理。修改代码后 <code>POST /api/reload</code> 热重载，<strong>无需重启服务</strong>。</p>
                  <span class="hl-keyword">迭代</span>
                </div>
              </div>
            </div>
          </section>

          <section class="section">
            <h2>可扩展性与未来价值</h2>
            <p>
              当前的LangGraph架构不仅解决了微码组件生成的问题，更重要的是为未来的AI工具开发提供了<strong>统一的可扩展平台</strong>。
            </p>

            <div class="highlight-box" style="margin-top: 16px; background: var(--success-bg); border-left-color: var(--success);">
              <p><strong>✓ 已落地的模块：</strong></p>
              <p>
                <strong>普通Vue组件生成</strong>：基于Figma设计稿生成标准Vue3组件（独立于微码）<br>
                <strong>大屏布局生成</strong>：支持数据可视化大屏的响应式布局开发
              </p>
              <p style="margin-top: 12px;"><strong>正在开发的模块：</strong></p>
              <p>
                <strong>Java 业务后端迁移</strong>：Spring Boot 承接用户认证（SSO + JWT）、组织/群组管理、组件元数据、生成记录、Token 配额等，与 Node AI 引擎分工协作<br>
                <strong>企业级权限体系</strong>：对接 QS 门户 SSO，实现组织-部门-用户层级同步 + 权限码管理 + 接口级鉴权<br>
                <strong>统计看板与评分系统</strong>：8 维生成评分（布局/样式/语义/性能/可读性/规范/对比度/复杂度）+ 按时间/用户/组织维度的统计聚合<br>
                <strong>AI 视觉对比分析</strong>：一键对已生成组件做 Figma 原稿 vs 真实预览截图的视觉质检，输出结构化差异报告与下一步建议（接口层已接通）
              </p>
              <p style="margin-top: 12px;"><strong>当前迭代优化：</strong></p>
              <p>
                <strong>管线性能大幅缩减</strong>：按预估输出智能分块（消除 900s 截断浪费）、按问题类别只修目标文件（不再全量重做）、SFC 事实注入减少误判<br>
                <strong>运行时门禁分级</strong>：区分致命失败 / 告警完成 / 增量修订三档，纯缺图场景走自愈 + 降级而非盲目打回重做<br>
                <strong>Figma 预览图闭环</strong>：硬约束 <code>mc-preview.png</code> 标准产出，缺图自动补下载 + Token 来源统一为用户配置<br>
                <strong>质量门禁语义化</strong>：区分"质量通过"与"带警告完成"，避免简单组件被过度修订
              </p>
              <p style="margin-top: 12px;"><strong>近期规划：</strong></p>
              <p>
                <strong>视觉比对质检恢复</strong>：优化 Vision AI 比对策略（确定性 CSS diff + AI 降级兜底），恢复自动截图-比对-修订闭环<br>
                <strong>多模型供应商治理</strong>：去除硬编码依赖，接入 DashScope / MaaS 等兼容端点，主备自动降级 + 额度管控<br>
                <strong>组件发布流水线</strong>：生成 → 审核 → 发布到组件库 → NPM 打包，全流程自动化<br>
                <strong>高分模板推荐</strong>：基于历史生成数据沉淀成功模式，按组件类型/组织智能推荐最佳实践
              </p>
              <p style="margin-top: 12px;"><strong>远期愿景：</strong></p>
              <p>
                <strong>后台管理系统生成</strong>：自动生成包含 CRUD 操作的完整后台管理页面<br>
                <strong>模板市场</strong>：跨组织共享高分组件模板，一键复用<br>
                <strong>团队效能看板</strong>：AI 节省时间统计 + 采纳率分析 + 团队协作排行
              </p>
            </div>

            <h3 style="margin-top: 20px;">架构复用能力</h3>
            <div class="innovation-grid">
              <div class="innovation-card" style="background: var(--brand-bg);">
                <div class="icon">♻️</div>
                <h3>节点复用</h3>
                <p>当前的Figma连接器、代码生成器、验证器可以在所有新模块中复用，无需重复开发。</p>
              </div>

              <div class="innovation-card" style="background: var(--feature-bg);">
                <div class="icon"></div>
                <h3>模式复用</h3>
                <p>并行处理、对抗验证、循环修复等成熟工作流模式可以套用到任何新工具。</p>
              </div>

              <div class="innovation-card" style="background: var(--warning-bg);">
                <div class="icon"></div>
                <h3>基础设施统一</h3>
                <p>进度推送、日志系统、状态管理、错误处理等基础设施在所有模块间共享。</p>
              </div>

              <div class="innovation-card" style="background: var(--success-bg);">
                <div class="icon"></div>
                <h3>快速开发</h3>
                <p>每个新模块只需定义专用节点，然后连接成工作流，开发成本随共享组件增加而降低。</p>
              </div>
            </div>

            <div class="highlight-box" style="margin-top: 20px; background: var(--brand-bg); border-left-color: var(--brand);">
              <p><strong>长期价值：</strong></p>
              <p>
                LangGraph架构是一个<strong>AI工具开发平台</strong>，而不仅仅是单一功能。<br>
                随着模块增加，平台价值呈指数级增长，团队生产力持续提升。
              </p>
            </div>
          </section>
        </div>

        <!-- 技术选型对比 -->
        <div v-if="activeTab === 'tech-comparison'" class="tab-panel">
          <section class="section">
            <h2>为什么选择LangGraph？</h2>
            <p>在设计第二代架构时，我们评估了多个AI编排框架，最终选择了LangGraph。以下是详细的技术选型分析：</p>

            <div class="highlight-box warn" style="margin-top: 16px;">
              <p><strong>核心需求：</strong></p>
              <p>
                ✓ 支持复杂的<strong>循环和分支</strong>逻辑（生成→验证→修复→重新验证）<br>
                ✓ 灵活的<strong>状态管理</strong>机制（跨Agent共享数据）<br>
                ✓ 可实现<strong>对抗性验证</strong>循环<br>
                ✓ 支持<strong>并行执行</strong>和条件路由
              </p>
            </div>
          </section>

          <section class="section">
            <h2>框架对比分析</h2>
            <p>我们对比了市场上流行的三个AI编排框架：</p>

            <div class="comparison-cards">
              <div class="framework-card openclaw">
                <div class="framework-header">
                  <h3>OpenClaw</h3>
                  <span class="framework-badge">工具快速连接器</span>
                </div>
                <div class="framework-content">
                  <div class="pros-section">
                    <h4>特点</h4>
                    <ul>
                      <li>极致易用，快速连接外部工具（微信、Slack等）</li>
                      <li>社区活跃（2.8万+技能库）</li>
                      <li>灵活的工具集成能力</li>
                    </ul>
                  </div>
                  <div class="cons-section">
                    <h4>不适合我们的场景</h4>
                    <ul>
                      <li><strong>定位不匹配</strong>：工具连接器，而非流程编排框架</li>
                      <li><strong>缺乏固化流程</strong>：灵活但不适合需要严格规范的代码生成</li>
                      <li><strong>不够可控</strong>：适合通用任务，不适合企业级固定流程</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div class="framework-card langgraph selected">
                <div class="framework-header">
                  <h3>LangGraph</h3>
                  <span class="framework-badge selected">我们的选择</span>
                </div>
                <div class="framework-content">
                  <div class="pros-section">
                    <h4>优势</h4>
                    <ul>
                      <li><strong>有向图工作流</strong>：支持复杂分支、循环、并行</li>
                      <li><strong>状态机模型</strong>：每个节点可读写全局状态</li>
                      <li><strong>条件路由</strong>：根据验证结果决定下一步</li>
                      <li><strong>循环支持</strong>：完美实现对抗验证机制</li>
                    </ul>
                  </div>
                  <div class="cons-section">
                    <h4>注意</h4>
                    <ul>
                      <li>学习曲线稍陡（需要理解图和状态机）</li>
                      <li>生态相对年轻（但快速发展中）</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div class="framework-card hermes">
                <div class="framework-header">
                  <h3>Hermes</h3>
                  <span class="framework-badge">自优化引擎</span>
                </div>
                <div class="framework-content">
                  <div class="pros-section">
                    <h4>特点</h4>
                    <ul>
                      <li>AI应用超脑明，能从历史任务学习优化</li>
                      <li>动态生成与进化技能，实现"吃一堑长一智"</li>
                      <li>主动选择性记忆，会"更懂你"</li>
                    </ul>
                  </div>
                  <div class="cons-section">
                    <h4>不适合我们的场景</h4>
                    <ul>
                      <li><strong>过于智能和灵活</strong>：会自我学习、优化策略</li>
                      <li><strong>不适合固定规范</strong>：代码生成需要稳定可预测的输出</li>
                      <li><strong>缺乏流程控制</strong>：适合推理优化，不适合结构化工作流</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section class="section">
            <h2>使用方式与部署对比</h2>
            <p>两代架构在使用方式和部署方式上有本质区别：</p>

            <div class="deployment-comparison">
              <div class="deploy-card">
                <h3>第一代（Skills+Shell）</h3>
                <div class="deploy-method">
                  <div class="method-item">
                    <span class="method-icon"></span>
                    <div>
                      <h4>集成到项目中</h4>
                      <p>必须将skills和脚本集成到具体项目目录中</p>
                    </div>
                  </div>
                  <div class="method-item">
                    <span class="method-icon"></span>
                    <div>
                      <h4>依赖Claude AI环境</h4>
                      <p>需要Claude Desktop或Claude CLI环境来运行skills</p>
                    </div>
                  </div>
                  <div class="method-item">
                    <span class="method-icon"></span>
                    <div>
                      <h4>本地文件系统</h4>
                      <p>所有状态和中间产物存储在项目目录中</p>
                    </div>
                  </div>
                  <div class="method-item">
                    <span class="method-icon">✕</span>
                    <div>
                      <h4>无法云端部署</h4>
                      <p>Skills系统依赖本地环境，无法独立部署</p>
                    </div>
                  </div>
                </div>
              </div>

              <div class="deploy-card highlight">
                <h3>第二代（LangGraph）</h3>
                <div class="deploy-method">
                  <div class="method-item">
                    <span class="method-icon">☁️</span>
                    <div>
                      <h4>独立服务部署</h4>
                      <p>可作为独立的Web服务部署到云端</p>
                    </div>
                  </div>
                  <div class="method-item">
                    <span class="method-icon"></span>
                    <div>
                      <h4>HTTP API访问</h4>
                      <p>通过HTTP API调用，任何客户端都可以使用</p>
                    </div>
                  </div>
                  <div class="method-item">
                    <span class="method-icon"></span>
                    <div>
                      <h4>支持本地部署</h4>
                      <p>也可以在本地运行Node.js服务器</p>
                    </div>
                  </div>
                  <div class="method-item">
                    <span class="method-icon"></span>
                    <div>
                      <h4>多用户并发</h4>
                      <p>云端部署后，多个开发者可同时使用</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="highlight-box" style="margin-top: 20px; background: var(--success-bg); border-left-color: var(--success);">
              <p><strong>第二代架构的部署优势：</strong></p>
              <p>
                ☁️ <strong>云端部署</strong>：部署到阿里云/AWS/腾讯云，全团队共享<br>
                <strong>企业级</strong>：支持负载均衡、高可用、横向扩展<br>
                <strong>权限管理</strong>：可以添加用户认证和权限控制<br>
                <strong>监控日志</strong>：集中式日志管理和性能监控<br>
                <strong>版本控制</strong>：独立版本迭代，不影响项目代码
              </p>
            </div>
          </section>

          <section class="section">
            <h2>总结：为什么LangGraph是更好的选择</h2>

            <div class="summary-grid">
              <div class="summary-item">
                <span class="summary-icon"></span>
                <h4>固化流程 vs 灵活智能</h4>
                <p><strong>核心选型理由</strong>：OpenClaw/Hermes更灵活、更智能（自学习、自优化），但我们需要的是<strong>固化的流程、固定的规范、可预测的结果</strong>。LangGraph提供强控制的结构化工作流，适合企业级代码生成场景。</p>
              </div>

              <div class="summary-item">
                <span class="summary-icon"></span>
                <h4>复杂流程控制</h4>
                <p>LangGraph的状态机+有向图模型，完美支持"生成→验证→修复→重新验证"的循环逻辑，这是对抗验证的核心需求。</p>
              </div>

              <div class="summary-item">
                <span class="summary-icon"></span>
                <h4>多Agent协作</h4>
                <p>天然支持多个Agent并行工作和状态共享，实现细粒度的专业化分工。</p>
              </div>

              <div class="summary-item">
                <span class="summary-icon"></span>
                <h4>企业级可扩展</h4>
                <p>支持负载均衡、高可用、监控告警等企业级特性，适合生产环境使用。</p>
              </div>
            </div>
          </section>
        </div>

        <!-- 平台能力拓扑图 -->
        <div v-if="activeTab === 'topology'" class="tab-panel">
          <section class="section">
            <h2>平台能力关系拓扑</h2>
            <p>交互式拓扑图，展示全站 32 个模块的 6 层架构关系、55 条连线（5 种类型）和各模块交互点清单。点击节点查看详情，使用图例筛选连线类型。</p>
          </section>
          <div class="topology-iframe-wrap">
            <iframe src="/topology.html" class="topology-iframe" frameborder="0"></iframe>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const activeTab = ref('Skills+Shell')

const tabs = [
  { id: 'Skills+Shell', label: '第一代架构（Skills+Shell）' },
  { id: 'langgraph', label: '第二代架构（LangGraph）' },
  { id: 'tech-comparison', label: '技术选型对比' },
  { id: 'topology', label: '平台能力拓扑图' }
]
</script>

<style scoped>
.intro-page {
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 24px 32px;
  overflow-y: auto;
}

.page-header {
  position: relative;
  text-align: center;
  margin-bottom: 24px;
  padding: 28px 16px 0;
}

.page-header h1 {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.3px;
  line-height: 1.3;
  color: var(--text-primary);
}

.subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin-top: 6px;
  line-height: 1.6;
}

.header-links {
  position: absolute;
  left: 16px;
  top: 28px;
}

.header-link {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-secondary);
  text-decoration: none;
  transition: all 0.2s;
  white-space: nowrap;
  box-shadow: var(--shadow-sm);
}

.header-link:hover {
  background: var(--brand-bg-hover);
  border-color: var(--brand);
  color: var(--brand);
}

/* Tabs */
.tabs-container {
  background: var(--bg-card);
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-default);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.tabs-header {
  display: flex;
  justify-content: center;
  gap: 8px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-hover);
  padding: 12px 16px 0;
}

.tab-btn {
  padding: 10px 20px;
  background: none;
  border: none;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  position: relative;
}

.tab-btn:hover {
  color: var(--brand);
  background: var(--brand-bg-hover);
}

.tab-btn.active {
  color: var(--brand);
  background: var(--bg-card);
  border-bottom-color: var(--brand);
  font-weight: 600;
}

.tabs-content {
  padding: 28px;
}

.tab-panel {
  animation: fadeIn 0.25s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Section */
.section {
  margin-bottom: 40px;
}

.section:last-child {
  margin-bottom: 0;
}

.section h2 {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 2px solid var(--border-light);
}

.section h3 {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.section p {
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.section ul {
  padding-left: 24px;
}

.section li {
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

/* Highlight Box */
.highlight-box {
  background: var(--brand-bg);
  border-left: 4px solid var(--brand);
  padding: 16px 20px;
  border-radius: var(--radius-md);
  margin: 16px 0;
}

.highlight-box.warn {
  background: var(--warning-bg);
  border-left-color: var(--warning-light);
}

.highlight-box p {
  margin-bottom: 8px;
}

.highlight-box p:last-child {
  margin-bottom: 0;
}

/* Process Flow */
.process-flow {
  margin: 24px 0;
}

.flow-step {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  background: var(--bg-hover);
  padding: 20px;
  border-radius: var(--radius-md);
  border: 2px solid var(--border-default);
}

.step-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: var(--brand);
  color: var(--bg-card);
  border-radius: var(--radius-full);
  font-weight: 600;
  font-size: 18px;
  flex-shrink: 0;
}

.step-content {
  flex: 1;
}

.step-content h3 {
  margin-bottom: 8px;
}

.step-content p {
  margin-bottom: 6px;
}

.step-content small {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  font-style: italic;
}

.flow-arrow {
  text-align: center;
  font-size: 28px;
  color: var(--brand);
  margin: 12px 0;
  font-weight: bold;
}

/* Architecture Diagram */
.architecture-diagram {
  background: var(--bg-alt);
  border: 2px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: 24px;
  margin: 20px 0;
}

.arch-title {
  text-align: center;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 20px;
}

.arch-flow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
}

.arch-node {
  padding: 12px 20px;
  background: var(--bg-card);
  border: 2px solid var(--text-tertiary);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  box-shadow: 0 2px 4px var(--shadow-dropdown);
}

.arch-arrow {
  font-size: 24px;
  color: var(--text-tertiary);
  font-weight: bold;
}

.arch-note {
  text-align: center;
  font-size: 13px;
  color: var(--text-tertiary);
  margin-top: 16px;
  padding: 8px;
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
}

.arch-note.success {
  color: var(--success);
  background: rgba(var(--c-green-500-rgb), 0.1);
}

.architecture-diagram.collaborative {
  background: var(--brand-bg);
  border-color: var(--brand-border);
}

.arch-layer { margin: 16px 0; }
.layer-title { text-align: center; font-size: 13px; font-weight: 600; color: var(--success); margin-bottom: 12px; }
.arch-arrow-down { text-align: center; font-size: 28px; color: var(--success); margin: 8px 0; }
.arch-flow.multi { gap: 8px; }

.arch-node.parallel { background: linear-gradient(135deg, var(--success) 0%, var(--success-light) 100%); color: var(--bg-card); border-color: var(--success); }
.arch-node.agent { background: linear-gradient(135deg, var(--brand) 0%, var(--c-teal-400) 100%); color: var(--bg-card); border-color: var(--brand); font-size: 13px; padding: 10px 16px; }

.arch-flow.adversarial { gap: 16px; }
.arch-node.validator { background: linear-gradient(135deg, var(--warning-light) 0%, var(--warning-light) 100%); color: var(--bg-card); border-color: var(--warning-light); }
.arch-node.generator { background: linear-gradient(135deg, var(--feature) 0%, var(--c-purple-300) 100%); color: var(--bg-card); border-color: var(--feature); }
.arch-arrow-bidirectional { font-size: 18px; color: var(--error-text); font-weight: 600; padding: 8px 12px; background: rgba(var(--c-red-500-rgb), 0.12); border-radius: var(--radius-sm); }

/* Pros & Cons */
.pros-cons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-top: 16px;
}

.pros, .cons {
  padding: 20px;
  border-radius: var(--radius-md);
}

.pros {
  background: var(--success-bg);
  border: 2px solid var(--success-light);
}

.cons {
  background: var(--warning-bg);
  border: 2px solid var(--warning-light);
}

.pros h3, .cons h3 {
  margin-bottom: 12px;
}

/* Innovation Grid */
.innovation-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-top: 20px;
}

.innovation-card {
  background: var(--bg-elevated);
  padding: 20px;
  border-radius: var(--radius-md);
  border: 2px solid var(--border-default);
  transition: transform 0.2s;
}

.innovation-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 16px var(--shadow-dropdown);
}

.innovation-card .icon {
  font-size: 32px;
  margin-bottom: 12px;
}

.innovation-card h3 {
  margin-bottom: 8px;
  color: var(--text-primary);
}

.innovation-card p {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* Tech List */
.tech-list {
  list-style: none;
  padding: 0;
}

.tech-list li {
  background: var(--bg-hover);
  padding: 12px 16px;
  border-radius: var(--radius-md);
  margin-bottom: 10px;
  border-left: 3px solid var(--brand);
}

.tech-list li strong {
  color: var(--brand);
}

/* Comparison Table */
.comparison-table {
  margin-top: 16px;
  overflow-x: auto;
}

.comparison-table table {
  width: 100%;
  border-collapse: collapse;
}

.comparison-table th,
.comparison-table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid var(--border-default);
}

.comparison-table thead {
  background: var(--bg-alt);
}

.comparison-table th {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 14px;
}

.comparison-table td {
  font-size: 14px;
  color: var(--text-secondary);
}

.comparison-table tbody tr:hover {
  background: var(--bg-hover);
}

.note {
  font-size: 13px;
  color: var(--text-secondary);
  font-style: italic;
  margin-top: 8px;
}

/* Tech Components */
.tech-components {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-top: 16px;
}

.component-box {
  background: var(--bg-alt);
  padding: 20px;
  border-radius: var(--radius-md);
  border: 2px solid var(--border-strong);
}

.component-box h3 {
  font-size: 16px;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.component-box ul {
  list-style: none;
  padding: 0;
  margin-bottom: 12px;
}

.component-box li {
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-secondary);
  margin-bottom: 8px;
  padding-left: 0;
}

.component-box strong {
  color: var(--brand);
  font-weight: 600;
}

.role-tag {
  display: inline-block;
  padding: 6px 12px;
  background: var(--brand-bg);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--brand);
  font-weight: 500;
}

/* Why Need Box */
.why-need-box {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 16px;
}

.why-item {
  background: var(--bg-hover);
  padding: 20px;
  border-radius: var(--radius-md);
  border-left: 4px solid var(--brand);
}

.why-item h3 {
  font-size: 15px;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.why-item p {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.why-item ul {
  list-style: none;
  padding: 0;
  margin: 12px 0;
}

.why-item li {
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-secondary);
  margin-bottom: 8px;
  padding-left: 0;
}

.why-item .summary {
  margin-top: 12px;
  padding: 10px 14px;
  background: var(--brand-bg);
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  color: var(--success);
}

/* Workflow Example */
.workflow-example {
  margin-top: 16px;
  background: var(--bg-hover);
  padding: 20px;
  border-radius: var(--radius-md);
}

.workflow-step {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px dashed var(--border-default);
}

.workflow-step:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.step-number {
  width: 32px;
  height: 32px;
  background: var(--brand);
  color: var(--bg-card);
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
  flex-shrink: 0;
}

.step-detail {
  flex: 1;
}

.step-actor {
  display: inline-block;
  padding: 4px 10px;
  border-radius: var(--radius-xs);
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
}

.step-actor.skill {
  background: var(--brand-bg);
  color: var(--success);
}

.step-actor.script {
  background: var(--warning-bg);
  color: var(--warning);
}

.step-action {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.step-result {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* Agent Details */
.agent-details {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-top: 16px;
}

.agent-card {
  background: var(--bg-card);
  border: 2px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 16px;
  transition: all 0.3s;
}

.agent-card:hover {
  border-color: var(--brand);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.agent-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.agent-icon {
  font-size: 32px;
  flex-shrink: 0;
}

.agent-header h3 {
  font-size: 16px;
  margin-bottom: 4px;
  color: var(--text-primary);
}

.agent-tag {
  display: inline-block;
  padding: 2px 8px;
  background: var(--brand-bg);
  border-radius: var(--radius-xs);
  font-size: 11px;
  color: var(--brand);
  font-family: monospace;
}

.agent-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.agent-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.meta-item {
  display: inline-block;
  padding: 4px 8px;
  background: var(--bg-hover);
  border-radius: var(--radius-xs);
  font-size: 11px;
  color: var(--text-secondary);
}

.meta-item.type-none {
  background: var(--bg-alt);
  color: var(--text-tertiary);
  font-style: italic;
}

.meta-item.model-qwen {
  background: rgba(139, 92, 246, 0.08);
  color: var(--feature);
  font-weight: 500;
}

/* Core badge on agent cards */
.badge-core {
  display: inline-block;
  padding: 1px 6px;
  background: var(--error);
  color: var(--bg-card);
  border-radius: var(--radius-xs);
  font-size: 10px;
  font-weight: 700;
  margin-left: 4px;
  vertical-align: middle;
}

/* New badge for newly added agents */
.badge-new {
  display: inline-block;
  padding: 1px 6px;
  background: var(--warning-light);
  color: var(--bg-card);
  border-radius: var(--radius-xs);
  font-size: 10px;
  font-weight: 700;
  margin-left: 4px;
  vertical-align: middle;
}

/* Highlighted role cards for core agents */
.agent-card.highlighted-role {
  border-width: 2px;
}

/* Agent card left border */
.agent-card {
  border-left: 4px solid var(--border-default);
}

/* Comparison Cards */
.comparison-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-top: 20px;
}

.framework-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: all 0.3s;
}

.framework-card.openclaw {
  border: 2px solid var(--warning);
}

.framework-card.langgraph {
  border: 2px solid var(--brand);
}

.framework-card.langgraph.selected {
  border: 3px solid var(--brand);
  box-shadow: var(--shadow-lg);
}

.framework-card.hermes {
  border: 2px solid var(--feature);
}

.framework-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 16px var(--shadow-dropdown);
}

.framework-header {
  padding: 20px;
  background: var(--bg-alt);
  border-bottom: 2px solid var(--border-default);
}

.framework-card.openclaw .framework-header {
  background: var(--warning-bg);
}

.framework-card.langgraph .framework-header {
  background: var(--brand-bg);
}

.framework-card.hermes .framework-header {
  background: var(--feature-bg);
}

.framework-header h3 {
  font-size: 18px;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.framework-badge {
  display: inline-block;
  padding: 4px 10px;
  background: var(--shadow-dropdown);
  border-radius: var(--radius-xs);
  font-size: 12px;
  font-weight: 500;
}

.framework-badge.selected {
  background: var(--brand);
  color: var(--bg-card);
}

.framework-content {
  padding: 20px;
}

.pros-section, .cons-section {
  margin-bottom: 16px;
}

.pros-section:last-child, .cons-section:last-child {
  margin-bottom: 0;
}

.pros-section h4, .cons-section h4 {
  font-size: 14px;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.framework-content ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.framework-content li {
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-secondary);
  margin-bottom: 6px;
  padding-left: 0;
}

/* Deployment Comparison */
.deployment-comparison {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-top: 20px;
}

.deploy-card {
  background: var(--bg-card);
  border: 2px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: 24px;
}

.deploy-card.highlight {
  border-color: var(--brand);
  background: var(--brand-bg);
}

.deploy-card h3 {
  font-size: 18px;
  margin-bottom: 16px;
  color: var(--text-primary);
}

.deploy-method {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.method-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: var(--bg-hover);
  border-radius: var(--radius-md);
}

.deploy-card.highlight .method-item {
  background: var(--bg-card);
}

.method-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.method-item h4 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--text-primary);
}

.method-item p {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin: 0;
}

/* Summary Grid */
.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  margin-top: 20px;
}

/* 对抗性检查流程 */
.adversarial-flow {
  display: flex;
  align-items: stretch;
  justify-content: center;
  gap: 12px;
  margin: 24px 0;
  flex-wrap: wrap;
}

.adversarial-step {
  flex: 1;
  min-width: 180px;
  max-width: 220px;
  background: var(--bg-card);
  border: 2px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: 20px;
  text-align: center;
  position: relative;
}

.adversarial-step.l1 { border-color: var(--success-light); }
.adversarial-step.l2 { border-color: var(--warning-light); }
.adversarial-step.l3 { border-color: var(--error); }

.adversarial-step .step-badge {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 700;
  color: var(--bg-card);
  margin: 0 auto 14px;
}

.l1 .step-badge { background: var(--success-light); }
.l2 .step-badge { background: var(--warning-light); }
.l3 .step-badge { background: var(--error); }

.adversarial-step .step-info h3 {
  font-size: 14px;
  margin-bottom: 6px;
  color: var(--text-primary);
}

.adversarial-step .step-info p {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.adversarial-step .step-check {
  display: block;
  font-size: 11px;
  color: var(--text-tertiary);
  padding: 4px 8px;
  background: var(--bg-alt);
  border-radius: var(--radius-xs);
}

.adversarial-arrow {
  display: flex;
  align-items: center;
  font-size: 24px;
  color: var(--text-quaternary);
  flex-shrink: 0;
}

.key-insight {
  background: var(--feature-bg);
  border-left: 4px solid var(--feature);
  padding: 16px 20px;
  border-radius: var(--radius-md);
  margin-top: 20px;
}

.key-insight p {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.7;
}

.summary-item {
  background: var(--bg-alt);
  padding: 20px;
  border-radius: var(--radius-md);
  border-left: 4px solid var(--brand);
}

.summary-icon {
  font-size: 32px;
  display: block;
  margin-bottom: 12px;
}

.summary-item h4 {
  font-size: 16px;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.summary-item p {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin: 0;
}

/* Loop Layers */
.loop-layers {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.loop-layer {
  background: var(--bg-card);
  border: 2px solid var(--border-default);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: all 0.3s;
}

.loop-layer.highlighted {
  border-color: var(--brand);
  box-shadow: var(--shadow-md);
  background: var(--brand-bg);
}

.layer-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-light);
}

.loop-layer.highlighted .layer-header {
  background: var(--success-bg);
}

.layer-badge {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  color: var(--bg-card);
  flex-shrink: 0;
}

.layer-badge.l1 { background: linear-gradient(135deg, var(--c-purple-500) 0%, var(--c-blue-400) 100%); }
.layer-badge.l2 { background: linear-gradient(135deg, var(--success-light) 0%, var(--c-teal-400) 100%); }
.layer-badge.l3 { background: linear-gradient(135deg, var(--warning-light) 0%, var(--c-yellow-400) 100%); }

.layer-title-group h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.layer-tag {
  display: inline-block;
  padding: 2px 8px;
  background: var(--brand-bg);
  border-radius: var(--radius-xs);
  font-size: 11px;
  color: var(--brand);
  font-family: monospace;
}

.layer-body {
  padding: 20px 24px;
}

.layer-body p {
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.layer-body p:last-child {
  margin-bottom: 0;
}

.layer-body code {
  background: var(--bg-hover);
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  font-size: 12px;
  color: var(--error-text);
}

.layer-code-block {
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 16px;
  overflow-x: auto;
}

.layer-code-block code {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.8;
  color: var(--text-primary);
  background: none;
  padding: 0;
  white-space: pre;
}

.layer-features {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.feature-tag {
  display: inline-block;
  padding: 4px 10px;
  background: var(--border-light);
  border-radius: var(--radius-xs);
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

/* Loop Detail Table */
.loop-detail-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  font-size: 13px;
}

.loop-detail-table th,
.loop-detail-table td {
  padding: 10px 14px;
  text-align: left;
  border-bottom: 1px solid var(--border-light);
}

.loop-detail-table thead {
  background: var(--bg-hover);
}

.loop-detail-table th {
  font-weight: 600;
  color: var(--text-primary);
}

.loop-detail-table td {
  color: var(--text-secondary);
  line-height: 1.6;
}

.loop-detail-table td code {
  background: var(--bg-hover);
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  font-size: 11px;
  color: var(--error-text);
}

/* Highlights Grid (10大亮点) */
.highlights-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.highlight-card {
  display: flex;
  gap: 16px;
  background: var(--bg-card);
  border: 2px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: 20px;
  transition: all 0.25s;
  position: relative;
  overflow: hidden;
}

.highlight-card:hover {
  border-color: var(--brand);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

/* 核心卡片突出 */
.highlight-card.core {
  border: 2px solid var(--brand);
  background: var(--success-bg);
  box-shadow: 0 0 0 1px var(--brand-border), 0 2px 12px var(--brand-bg-active);
}

.highlight-card.core:hover {
  border-color: var(--success);
  box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.25), 0 6px 20px var(--brand-border);
  transform: translateY(-3px);
}

.highlight-card.core .hl-number {
  background: var(--brand);
}

.highlight-card.core .hl-keyword {
  background: var(--brand-border);
  color: var(--success);
  font-weight: 700;
}

/* 次级卡片降饱和 */
.highlight-card:not(.core) {
  opacity: 0.72;
  border-color: var(--border-light);
}

.highlight-card:not(.core):hover {
  opacity: 0.92;
}

.badge-core-highlight {
  display: inline-block;
  padding: 1px 6px;
  background: var(--error);
  color: var(--bg-card);
  border-radius: var(--radius-xs);
  font-size: 10px;
  font-weight: 700;
  margin-left: 4px;
  vertical-align: middle;
}

.hl-number {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--brand);
  color: var(--bg-card);
  border-radius: var(--radius-md);
  font-size: 16px;
  font-weight: 700;
}

.hl-content {
  flex: 1;
  min-width: 0;
}

.hl-content h3 {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.hl-content p {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.hl-content code {
  background: var(--bg-hover);
  padding: 1px 5px;
  border-radius: var(--radius-xs);
  font-size: 11px;
  color: var(--error-text);
}

.hl-keyword {
  display: inline-block;
  padding: 2px 10px;
  background: var(--brand-bg-active);
  border-radius: var(--radius-xs);
  font-size: 11px;
  color: var(--brand);
  font-weight: 600;
  letter-spacing: 1px;
}

/* ── 中屏（≤1280px）：亮点卡片从 3 列改为 2 列 ── */
@media (max-width: 1280px) {
  .highlights-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* ── 小屏（≤768px）：全部单列，间距收紧 ── */
@media (max-width: 768px) {
  .intro-page {
    padding: 16px 12px 40px;
  }

  .page-header h1 {
    font-size: 20px;
  }

  .header-links {
    position: static;
    margin-bottom: 12px;
  }

  .tabs-header {
    flex-wrap: wrap;
    gap: 4px;
  }

  .tab-btn {
    padding: 8px 12px;
    font-size: 13px;
  }

  .tabs-content {
    padding: 16px;
  }

  .section {
    margin-bottom: 28px;
  }

  .section h2 {
    font-size: 18px;
  }

  .pros-cons,
  .innovation-grid,
  .tech-components,
  .agent-details,
  .comparison-cards,
  .deployment-comparison,
  .summary-grid,
  .highlights-grid {
    grid-template-columns: 1fr;
  }

  .layer-header {
    padding: 14px 16px;
    flex-wrap: wrap;
    gap: 8px;
  }

  .layer-body {
    padding: 14px 16px;
  }

  .adversarial-flow {
    flex-direction: column;
    align-items: center;
  }

  .adversarial-step {
    max-width: 100%;
  }

  .adversarial-arrow {
    transform: rotate(90deg);
  }

  .flow-step {
    padding: 14px;
    gap: 12px;
  }

  .step-num {
    width: 32px;
    height: 32px;
    font-size: 14px;
  }
}

/* ─ 超小屏（≤480px）：架构流程节点横向滚动 ── */
@media (max-width: 480px) {
  .arch-flow {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 8px;
  }

  .arch-node {
    flex-shrink: 0;
    padding: 8px 14px;
    font-size: 12px;
  }

  .arch-arrow {
    flex-shrink: 0;
  }

  .topology-iframe {
    height: 480px;
  }
}

.topology-iframe-wrap {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: #fff;
}

.topology-iframe {
  width: 100%;
  height: 720px;
  border: none;
  display: block;
}
</style>
