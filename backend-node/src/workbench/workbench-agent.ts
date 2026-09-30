/**
 * 工作台 Agent —— 基于 LangGraph 风格的意图识别 + Tool 调度
 *
 * 状态机流程：
 *   llm_call → [有 tool_call?] → tool_executor → response_generator → llm_call
 *              [无 tool_call?] → 直接回复
 */

import { Logger } from '@nestjs/common';
import { WORKBENCH_TOOLS, executeTool, ToolContext, ToolResult } from './workbench-tools';
import { runWorkbenchLLM } from './workbench-llm';

const logger = new Logger('WorkbenchAgent');

/**
 * Agent 状态
 */
export interface WorkbenchAgentState {
  conversationId: string;
  userId: string;
  messages: AgentMessage[];
  currentComponentId?: string;
  toolContext: ToolContext;
  iteration: number;
  maxIterations: number;
  finalResponse?: string;
  finalCards?: any[];
  /** 用户级文本模型配置（P0 ② 真 LLM 用；缺 apiKey 时回退正则 callLLM） */
  llmConfig?: Record<string, any>;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  cards?: any[];
  /** 消息元数据；attachments 里携带截图/拖拽图片的 dataURL */
  metadata?: Record<string, any>;
}

/**
 * 从消息中取出第一张图片的 dataURL（base64）。
 *
 * ⚠️ 回溯必须**有界**（2026-09-29 死循环回归修复）：
 * 早期版本一路扫到最早的消息，导致「用户一旦贴过图，此后每条消息都命中截图分支」——
 * 点在确认卡的「确定」后，confirm 分支（下方第 ~231 行）排在截图分支（~141 行）之后
 * 永远抢不到，于是每次确认又被截图分支截获、再弹一张确认卡 ⇒ 死循环反复问 max。
 *
 * 有界规则：从后往前扫描，**遇到带卡片的 assistant 消息立即停止**。
 * 该 assistant 消息即「这张图已被消费过」的证据（确认卡/进度卡），
 * 之后的图片不再触发新的截图请求。
 * 首轮（[user(带图)]）与「先贴图、马上补一句描述」仍可正常命中。
 */
function extractImageDataUrl(messages: AgentMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];

    // 屏障：这条助手消息已产出过卡片 ⇒ 更早的图已被消费，停止回溯
    if (m.role === 'assistant' && Array.isArray(m.cards) && m.cards.length > 0) {
      return null;
    }

    if (m.role !== 'user') continue;
    const atts = m.metadata?.attachments;
    if (!Array.isArray(atts)) continue;
    for (const a of atts) {
      if (typeof a?.dataUrl === 'string' && a.dataUrl.startsWith('data:image/')) {
        return a.dataUrl;
      }
      // 兼容后端直接给 imageBase64 的形态
      if (typeof a?.imageBase64 === 'string') {
        return a.imageBase64.startsWith('data:')
          ? a.imageBase64
          : `data:image/png;base64,${a.imageBase64}`;
      }
    }
  }
  return null;
}

/**
 * 提取当前「未被消费」用户消息里全部图片 dataURL（R6 批量生成用）。
 * 与 extractImageDataUrl 同源的有界回溯：遇到带卡片的 assistant 消息即停止，
 * 只收集最近一段（最近一条用户消息及其 attachments），避免老图被重复批量生成。
 */
function extractAllImageDataUrls(messages: AgentMessage[]): string[] {
  const urls: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'assistant' && Array.isArray(m.cards) && m.cards.length > 0) {
      break;
    }
    if (m.role !== 'user') continue;
    const atts = m.metadata?.attachments;
    if (!Array.isArray(atts)) continue;
    for (const a of atts) {
      if (typeof a?.dataUrl === 'string' && a.dataUrl.startsWith('data:image/')) {
        urls.push(a.dataUrl);
      } else if (typeof a?.imageBase64 === 'string') {
        urls.push(a.imageBase64.startsWith('data:')
          ? a.imageBase64
          : `data:image/png;base64,${a.imageBase64}`);
      }
    }
  }
  return urls;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

/**
 * 系统提示词
 */
const SYSTEM_PROMPT = `你是感智晓界（mvgo）的工作台助手。你帮助用户通过自然语言对话完成组件生成、修改、管理、发布等操作。

## 你的能力
- 从截图或 Figma 链接生成微码/Vue3 组件
- 修改已有组件（颜色、布局、数据绑定等）
- 查询任务状态和生成统计
- 为组件绑定 API 数据源
- 推送组件到 GitLab
- 发布组件到公共组件池
- 组件体检（运行时门禁 + 视觉相似度）
- 查看版本历史、一键回滚
- 批量生成组件
- 执行预定义工作流/配方

## 交互原则
1. 理解用户意图后，先确认关键参数再执行
2. 返回结果时附带可视化卡片（进度、预览、统计等）
3. 操作完成后提供后续建议
4. 遇到歧义时主动询问澄清
5. 保持简洁，不要啰嗦

## 当前上下文
- 当前组件：{currentComponentId || '无'}
- 对话 ID：{conversationId}

请用中文回复。`;

/**
 * 调用 LLM（支持 Function Calling）
 */
async function callLLM(
  messages: AgentMessage[],
  tools: any[],
  state: WorkbenchAgentState,
): Promise<AgentMessage> {
  // TODO: 接入实际的 LLM 服务（复用 ai-engine 的 AI 请求网关）
  // 目前使用模拟响应进行开发验证

  const userMsg = messages[messages.length - 1];
  const content = userMsg?.content || '';

  // 本轮是否带图（用于兜底文案区分「缺素材」与「完全没听懂」）
  const hasImage = !!extractImageDataUrl(messages);

  // 规格切换意图：用户单独说 "lite"/"max" 时，重新执行上一条工具调用
  const tierFromInput = extractTier(content);
  const isTierSwitch = /^(lite|max|轻量|完整|标准)$/i.test(content.trim());
  
  if (isTierSwitch && tierFromInput) {
    const lastToolCall = findLastToolCallMessage(messages);
    if (lastToolCall && lastToolCall.toolCalls && lastToolCall.toolCalls.length > 0) {
      const prevCall = lastToolCall.toolCalls[0];
      // 仅对支持 tier 参数的工具生效
      if (['create_component_from_screenshot', 'create_component_from_figma'].includes(prevCall.name)) {
        const newArgs = { ...prevCall.arguments, tier: tierFromInput };
        return {
          role: 'assistant',
          content: `好的，已切换为 ${tierLabel(tierFromInput)} 规格，重新生成。`,
          toolCalls: [{
            id: `call_${Date.now()}`,
            name: prevCall.name,
            arguments: newArgs,
          }],
        };
      }
    }
    // 没有上一条工具调用：用户想定规格但还没给素材。
    // 明确说「规格已收到、缺素材」，别只回一句干巴巴的"请先提供截图"。
    return {
      role: 'assistant',
      content: `已收到规格：**${tierLabel(tierFromInput)}**，但还缺少生成素材，也没有进行中的生成任务。\n\n请提供以下任一种，我立刻按 ${tierLabel(tierFromInput)} 生成：\n\n- 📷 **截图**：直接粘贴或拖拽图片到输入框\n- 🎨 **Figma 链接**：需包含 node-id，例如 https://figma.com/file/xxx?node-id=1-2\n\n（也可以直接说「用 lite 生成这张截图」，把规格和素材一起给我。）`,
    };
  }

  // ⚠️ 确认意图必须**先于**截图/Figma 分支判定（2026-09-29 死循环修复）。
  // 用户点确认卡的「确定」后，消息内容形如「确认生成组件「xxx」(sessionId: ...)」。
  // 若此前对话里贴过图，截图分支（含带图回溯）会抢先命中并再弹一张确认卡 ⇒ 死循环。
  // 故这里先处理确认，命中即返回，不再往下走。
  if (/确认|开始生成|就这样/.test(content) && !/^好的$/.test(content.trim())) {
    const handled = handleConfirmIntent(messages);
    if (handled) return handled;
  }

  // 批量生成意图（R6）：必须**先于**截图/Figma 单组件分支——
  // 否则「批量生成这几个 Figma/截图」会被单组件分支抢先，只生成第一个。
  if (/批量|一批|batch/i.test(content)) {
    const figmaUrls = content.match(/https?:\/\/[^\s]+figma[^\s]+/g) || [];
    const images = extractAllImageDataUrls(messages);
    const items = [
      ...figmaUrls.map((u) => ({ source: u, name: '' })),
      ...images.map((d) => ({ source: d, name: '' })),
    ];

    if (items.length === 0) {
      return {
        role: 'assistant',
        content: '好的，你想批量生成组件。请提供素材：\n\n- 多个 **Figma 链接**（一条消息里贴多个，需含 node-id）\n- 或一次粘贴/拖拽 **多张截图**\n\n收到后我会逐个排队生成。',
      };
    }

    return {
      role: 'assistant',
      content: `收到！我来批量生成 ${items.length} 个组件（${figmaUrls.length} 个 Figma + ${images.length} 张截图）。`,
      toolCalls: [{
        id: `call_${Date.now()}`,
        name: 'batch_generate',
        arguments: {
          items,
          target: extractTarget(content),
        },
      }],
    };
  }

  // 简易意图匹配（开发阶段用，后续替换为 LLM Function Calling）
  if (/截图|图片|截图生成/.test(content) || hasImage) {
    const tier = tierFromInput || 'max';
    const target = extractTarget(content);
    const componentName = extractComponentName(content);
    // 真实图片：优先用粘贴/拖拽上来的 dataURL，否则回退占位符
    const realImage = extractImageDataUrl(messages);
    const pendingToolCall = {
      name: 'create_component_from_screenshot',
      arguments: {
        imageUrl: realImage || 'uploaded://screenshot',
        componentName,
        target,
        tier,
      },
    };
    return {
      role: 'assistant',
      content: `收到！我来帮你从截图生成${targetLabel(target, tier)}。${tierFromInput ? '' : '（未指定规格，默认按「完整 Max」生成；如需轻量请说「lite」或「轻量」）'}`,
      cards: [{
        type: 'confirm',
        data: {
          title: '生成参数确认',
          params: [
            { key: '组件类型', value: targetLabel(target, tier) },
            { key: '组件名称', value: componentName },
            { key: '来源', value: '截图上传' },
            { key: '规格', value: tierLabel(tier) },
          ],
          pendingToolCall,
        },
      }],
    };
  }

  if (/figma|Figma/.test(content)) {
    const figmaUrl = content.match(/https?:\/\/[^\s]+figma[^\s]+/)?.[0] || '';
    const tier = tierFromInput || 'max';
    const target = extractTarget(content);
    const componentName = extractComponentName(content);
    const pendingToolCall = {
      name: 'create_component_from_figma',
      arguments: {
        figmaUrl: figmaUrl || 'https://figma.com/file/placeholder',
        componentName,
        target,
        tier,
      },
    };
    return {
      role: 'assistant',
      content: `检测到 Figma 链接，我来帮你生成${targetLabel(target, tier)}。${tierFromInput ? '' : '（未指定规格，默认按「完整 Max」生成；如需轻量请说「lite」或「轻量」）'}`,
      cards: [{
        type: 'confirm',
        data: {
          title: '生成参数确认',
          params: [
            { key: '组件类型', value: targetLabel(target, tier) },
            { key: '组件名称', value: componentName },
            { key: 'Figma 文件', value: figmaUrl ? figmaUrl.slice(0, 20) + '...' : '未识别' },
            { key: '规格', value: tierLabel(tier) },
          ],
          pendingToolCall,
        },
      }],
    };
  }

  if (/任务|进度|跑了|跑了多少/.test(content)) {
    return {
      role: 'assistant',
      content: '好的，我来查询你的任务列表。',
      toolCalls: [{
        id: `call_${Date.now()}`,
        name: 'query_tasks',
        arguments: { status: 'all', limit: 10 },
      }],
    };
  }

  if (/统计|多少[个]|成功率|生成了/.test(content)) {
    return {
      role: 'assistant',
      content: '我来帮你查看统计数据。',
      toolCalls: [{
        id: `call_${Date.now()}`,
        name: 'get_generation_stats',
        arguments: { timeRange: 'week' },
      }],
    };
  }

  // 确认生成意图（必须在组件列表之前，因为"确认生成组件"包含"组件"二字）
  if (/确认|好的|开始生成|就这样/.test(content)) {
    return handleConfirmIntent(messages) || {
      role: 'assistant',
      content: '好的，请告诉我你想做什么。',
    };
  }

  // 取消意图
  if (/取消|不了|算了/.test(content)) {
    return {
      role: 'assistant',
      content: '好的，已取消操作。',
    };
  }

  if (/组件|列表|我的组件/.test(content)) {
    return {
      role: 'assistant',
      content: '我来列出你的组件。',
      toolCalls: [{
        id: `call_${Date.now()}`,
        name: 'list_components',
        arguments: { filter: 'mine', limit: 20 },
      }],
    };
  }

  if (/改|修改|换|调整/.test(content) && state.currentComponentId) {
    return {
      role: 'assistant',
      content: '好的，我来修改当前组件。',
      toolCalls: [{
        id: `call_${Date.now()}`,
        name: 'modify_component',
        arguments: {
          componentId: state.currentComponentId,
          modification: content,
        },
      }],
    };
  }

  if (/绑定|接[口API]|对接/.test(content)) {
    return {
      role: 'assistant',
      content: '好的，我来帮你绑定 API。',
      toolCalls: [{
        id: `call_${Date.now()}`,
        name: 'bind_api_to_component',
        arguments: {
          componentId: state.currentComponentId || 'unknown',
          apiPath: extractApiPath(content) || 'GET /operation/device/monitor',
        },
      }],
    };
  }

  // 组件体检（R19）：运行时门禁 + 视觉相似度对比
  if (/体检|健康检查|检查.*质量|质量.*检查/.test(content)) {
    if (!state.currentComponentId) {
      return {
        role: 'assistant',
        content: '请先指定要体检的组件。你可以先完成一次生成，再对我说「体检」。',
      };
    }
    return {
      role: 'assistant',
      content: '好的，我来给当前组件做体检。',
      toolCalls: [{
        id: `call_${Date.now()}`,
        name: 'analyze_component',
        arguments: { componentId: state.currentComponentId },
      }],
    };
  }

  // 回滚（R20）：支持显式 revision（r-…）或自动「回滚到上一版」
  if (/回滚|回退|还原到|rollback|回到上一版|恢复上一版/i.test(content)) {
    if (!state.currentComponentId) {
      return {
        role: 'assistant',
        content: '请先指定要回滚的组件。你可以先完成一次生成，再说「回滚到上一版」。',
      };
    }
    const revision = content.match(/r-[a-f0-9-]{36}/i)?.[0];
    return {
      role: 'assistant',
      content: revision
        ? `好的，我来把当前组件回滚到版本 ${revision}。`
        : '好的，我来把当前组件回滚到上一个可用版本。',
      toolCalls: [{
        id: `call_${Date.now()}`,
        name: 'rollback_component',
        arguments: { componentId: state.currentComponentId, ...(revision ? { revision } : {}) },
      }],
    };
  }

  // 版本历史（R20）：列出当前组件的快照版本
  if (/版本历史|历史版本|有哪些版本|版本列表|查看版本|revisions/i.test(content)) {
    if (!state.currentComponentId) {
      return {
        role: 'assistant',
        content: '请先指定要查看版本的组件。你可以先完成一次生成，再说「查看版本历史」。',
      };
    }
    return {
      role: 'assistant',
      content: '好的，我来列出当前组件的版本历史。',
      toolCalls: [{
        id: `call_${Date.now()}`,
        name: 'list_revisions',
        arguments: { componentId: state.currentComponentId },
      }],
    };
  }

  // 发布到公共组件池（R21）：区别于下方「推送到 GitLab」（推送/gitlab）分支，
  // 用更明确的词触发，且必须在 push 分支之前，否则「发布」会被 GitLab 分支抢先。
  if (/发布到(?:公共)?组件池|共享组件|分享组件|交付组件/.test(content)) {
    if (!state.currentComponentId) {
      return {
        role: 'assistant',
        content: '请先指定要发布的组件。你可以先完成一次生成，再说「发布到公共组件池」。',
      };
    }
    return {
      role: 'assistant',
      content: '好的，我来把当前组件发布到公共组件池。',
      toolCalls: [{
        id: `call_${Date.now()}`,
        name: 'publish_component',
        arguments: { componentId: state.currentComponentId },
      }],
    };
  }

  if (/推送|发布|gitlab|GitLab/.test(content)) {
    return {
      role: 'assistant',
      content: '好的，我来帮你推送到 GitLab。',
      toolCalls: [{
        id: `call_${Date.now()}`,
        name: 'push_to_gitlab',
        arguments: {
          componentIds: [state.currentComponentId || 'unknown'],
          branch: 'main',
          commitMessage: content.slice(0, 50),
        },
      }],
    };
  }

  if (/工作流|配方|workflow|recipe/i.test(content)) {
    const figmaUrl = content.match(/https?:\/\/[^\s]+figma[^\s]+/)?.[0] || '';
    const componentName = extractComponentName(content);
    // 提取工作流名：original-phase2 / original-vue3，未识别时默认 phase2
    const wfMatch = content.match(/original-(phase2|vue3)/i);
    const workflowId = wfMatch ? wfMatch[0].toLowerCase() : 'original-phase2';
    return {
      role: 'assistant',
      content: `好的，我来执行工作流「${workflowId}」。`,
      toolCalls: [{
        id: `call_${Date.now()}`,
        name: 'execute_workflow',
        arguments: {
          workflowId,
          params: {
            componentName,
            ...(figmaUrl ? { figmaUrl } : {}),
          },
        },
      }],
    };
  }

  // R9 上下文感知：用户提到「刚才的组件/当前组件」时，告知当前锚定组件及可继续的操作
  if (/刚才的组件|上一个组件|当前组件|刚才那个|上次那个/.test(content) && state.currentComponentId) {
    return {
      role: 'assistant',
      content: `当前组件：**${state.currentComponentId}**\n\n你可以直接说：\n- ✏️ 「改样式」修改它\n- 🔗 「绑定 API」对接数据源\n- 📤 「推送到 GitLab」交付代码`,
    };
  }

  // 无意图匹配 → 直接回复
  // 用户明确了规格（lite/max 等）却没给素材：直接说缺什么，别笼统列能力清单。
  // 否则用户说「lite」会被回一长串「支持以下操作…请提供截图」，
  // 看起来像"说了 lite 却让我发图"，规格白说。
  if (tierFromInput && !hasImage) {
    const label = tierLabel(tierFromInput);
    return {
      role: 'assistant',
      content: `已收到规格：**${label}**，但还缺少生成素材。\n\n请提供以下任一种，我立刻按 ${label} 生成：\n\n- 📷 **截图**：直接粘贴或拖拽图片到输入框\n- 🎨 **Figma 链接**：需包含 node-id，例如 https://figma.com/file/xxx?node-id=1-2\n\n（也可以直接说「用 lite 生成这张截图」，把规格和素材一起给我。）`,
    };
  }

  // 兜底回复附带当前组件锚点（R9），让用户知道「刚才的组件」可直接续做
  const ctxLine = state.currentComponentId
    ? `\n\n当前组件：**${state.currentComponentId}**（可直接说「改样式 / 绑定 API / 推送到 GitLab」继续操作它）`
    : '';

  return {
    role: 'assistant',
    content: `我理解你的需求："${content}"。目前我支持以下操作：\n\n- 📷 从截图生成组件\n- 🎨 从 Figma 链接生成组件\n- ✏️ 修改已有组件\n- 📋 查询任务状态\n- 📊 查看生成统计\n- 📦 列出组件\n- 🔗 绑定 API 数据源\n- 📤 推送到 GitLab\n- 🌐 发布到公共组件池\n- 🩺 组件体检\n- 🔁 版本历史 / 回滚\n- 🧩 批量生成组件\n- ⚙️ 执行工作流\n\n请告诉我你想做什么？${ctxLine}`,
  };
}

/**
 * 从用户输入中提取组件名
 */
function extractComponentName(input: string): string {
  // 尝试提取 kebab-case 名称
  const match = input.match(/c-[\w-]+/);
  if (match) return match[0];

  // 尝试提取中文描述并转换
  const nameMap: Record<string, string> = {
    '车流量': 'c-tunnel-traffic-monitor',
    '监控': 'c-monitor-panel',
    '环境': 'c-env-sensor',
    '告警': 'c-alarm-panel',
    '视频': 'c-video-wall',
    '供电': 'c-power-status',
    '温度': 'c-temp-sensor',
    '湿度': 'c-humidity-sensor',
  };

  for (const [keyword, name] of Object.entries(nameMap)) {
    if (input.includes(keyword)) return name;
  }

  return `c-component-${Date.now().toString(36)}`;
}

/**
 * 从用户输入中提取 API 路径
 */
function extractApiPath(input: string): string | null {
  const match = input.match(/(GET|POST|PUT|DELETE)\s+\/[\w/-]+/i);
  return match ? match[0].toUpperCase() : null;
}

/**
 * 从用户输入中提取规格（lite/max）
 * 支持中英文关键词：lite/轻量/max/完整/标准
 */
/**
 * 档位中文描述（卡片展示用）。
 * 注意：不可只写 tier 裸值——早期版本卡片硬编码 "微码组件 (mc-max)"，
 * 导致用户选 lite 时界面仍显示 max，产生"写了 lite 却是 max"的错觉。
 */
function tierLabel(tier: 'lite' | 'max'): string {
  return tier === 'lite' ? '轻量 (Lite)' : '完整 (Max)';
}

/**
 * 组件类型展示文案：必须跟随 tier 变化（mc-lite / mc-max）。
 */
function targetLabel(target: string, tier: 'lite' | 'max'): string {
  const prefix = target === 'vue3' ? 'mv' : 'mc';
  const name = target === 'vue3' ? 'Vue3 组件' : '微码组件';
  return `${name} (${prefix}-${tier})`;
}

/**
 * 从用户输入提取目标组件类型。
 *
 * ⚠️ 此前 target 恒为硬编码 'microcode'，用户说"vue3"也照样回"微码组件"——
 * 属识别能力缺失而非显示问题。
 */
function extractTarget(input: string): 'microcode' | 'vue3' {
  const lower = (input || '').toLowerCase();
  if (/\bvue3?\b|vue\s*3|vue组件|vue 组件/.test(lower)) return 'vue3';
  if (/微码|mc-|microcode/.test(lower)) return 'microcode';
  // 默认微码（与既有行为一致）
  return 'microcode';
}

function extractTier(input: string): 'lite' | 'max' | null {
  const lower = input.toLowerCase();
  // 轻量/lite：优先判轻量，避免"轻量"+其它词时被 max 分支抢先
  if (/\blite\b|轻量|简易|简版|简单版|快速|lite版|轻量版/.test(lower)) return 'lite';
  // 完整/max
  if (/\bmax\b|完整|标准|精修|高保真|max版|完整版|标准版/.test(lower)) return 'max';
  return null;
}

/**
 * 从消息历史中找到上一条带 toolCalls 的 assistant 消息
 * 用于处理用户后续说 "lite"/"max" 时重新执行上一工具
 */
/**
 * 处理「确认生成」意图：从最近一条助手消息的卡片里取 pendingToolCall 并执行。
 *
 * 抽成独立函数的原因：确认分支需要**两处调用**——
 * ① 在截图/Figma 分支**之前**（防止带图历史抢先命中导致死循环）；
 * ② 原位置（组件列表分支之前，因为"确认生成组件"含"组件"二字）。
 *
 * @returns 命中并生成了 toolCalls 时返回 assistant 消息；否则返回 null（交由后续分支处理）
 */
function handleConfirmIntent(messages: AgentMessage[]): AgentMessage | null {
  const lastMsg = messages[messages.length - 2];
  if (!lastMsg || lastMsg.role !== 'assistant' || !lastMsg.cards?.length) {
    return null;
  }

  // 有未执行的确认卡 → 执行其 pendingToolCall
  const confirmCard = lastMsg.cards.find(c => c.type === 'confirm' && c.data?.pendingToolCall);
  if (confirmCard) {
    let pendingCall = confirmCard.data.pendingToolCall;

    // 优先用当前用户消息 metadata 里的 pendingToolCall（用户在卡片上改了 target/tier）
    // 否则后端从历史卡片取到的仍是原始参数，导致"选了 Vue3 却生成微码"
    const currentMsg = messages[messages.length - 1];
    if (currentMsg?.metadata?.pendingToolCall) {
      pendingCall = currentMsg.metadata.pendingToolCall;
    }

    return {
      role: 'assistant',
      content: '好的，开始生成组件。',
      toolCalls: [{
        id: `call_${Date.now()}`,
        name: pendingCall.name,
        arguments: pendingCall.arguments,
      }],
    };
  }

  // 已在跑的进度卡 → 只提示，不再重复触发
  const progressCard = lastMsg.cards.find(c => c.type === 'progress' && c.data?.sessionId);
  if (progressCard) {
    return {
      role: 'assistant',
      content: `任务已在后台运行中（Session: ${progressCard.data.sessionId}），你可以在任务中心查看实时进度。`,
    };
  }

  return null;
}

function findLastToolCallMessage(messages: AgentMessage[]): AgentMessage | null {
  // 从后往前找，跳过最后一条用户消息
  for (let i = messages.length - 2; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      return msg;
    }
  }
  return null;
}

/**
 * 从工具结果提取「当前组件 id」用于回写（R7）。
 * 生成类工具（截图/Figma/批量/工作流）成功后返回 sessionId，
 * 回写到会话上下文，后续「改/绑/推」无需显式传 id 即可命中。
 * 批量返回多个 sessionId 时取第一个（批量场景锚定最近一次批量首个组件）。
 */
function extractCurrentComponentId(r: ToolResult): string | undefined {
  const d = r.data as any;
  if (!d) return undefined;
  if (typeof d.sessionId === 'string' && d.sessionId) return d.sessionId;
  if (Array.isArray(d.sessionIds) && d.sessionIds.length > 0) return d.sessionIds[0];
  return undefined;
}

/**
 * 运行 Agent 状态机
 */
export async function runWorkbenchAgent(
  initialState: Partial<WorkbenchAgentState>,
): Promise<{ response: string; cards: any[]; currentComponentId?: string }> {
  const state: WorkbenchAgentState = {
    conversationId: initialState.conversationId || '',
    userId: initialState.userId || '',
    messages: initialState.messages || [],
    currentComponentId: initialState.currentComponentId,
    toolContext: initialState.toolContext!,
    iteration: 0,
    maxIterations: 5,
  };

  // ─── P0 ②：真 LLM Function Calling 主路径 ─────────────────────────────
  // 用户已配置文本模型（apiKey 存在）时，优先走真 LLM 意图识别 + 工具调度；
  // 未配置 / 调用失败 / 返回空 → 回退下方既有正则状态机，保证零回归。
  const llmConfig = initialState.llmConfig;
  const hasLLM = !!(
    llmConfig &&
    (llmConfig.apiKey || llmConfig.textApiKey || llmConfig.unifiedApiKey)
  );
  if (hasLLM) {
    try {
      const llmResult = await runWorkbenchLLM({
        messages: state.messages,
        currentComponentId: state.currentComponentId,
        toolContext: state.toolContext,
        llmConfig,
      });
      logger.log(`[Agent] 真 LLM 路径完成，conversation=${state.conversationId}`);
      return llmResult;
    } catch (err: any) {
      logger.warn(
        `[Agent] 真 LLM 意图识别失败，回退正则匹配: ${err?.message || err}`,
      );
      // 落到下方正则状态机（行为与未配置 LLM 完全一致）
    }
  }

  logger.log(`[Agent] Starting conversation=${state.conversationId}, iteration=0`);

  while (state.iteration < state.maxIterations) {
    state.iteration++;

    // Node 1: LLM 调用
    const llmResponse = await callLLM(state.messages, WORKBENCH_TOOLS, state);

    // 检查是否有 Tool 调用
    if (!llmResponse.toolCalls || llmResponse.toolCalls.length === 0) {
      // 无 Tool 调用 → 直接回复
      return {
        response: llmResponse.content,
        cards: llmResponse.cards || [],
        currentComponentId: state.currentComponentId,
      };
    }

    // Node 2: Tool 执行
    const toolResults: ToolResult[] = [];
    const toolMessages: AgentMessage[] = [];

    for (const toolCall of llmResponse.toolCalls) {
      logger.log(`[Agent] Executing tool: ${toolCall.name}`);

      const result = await executeTool(toolCall.name, toolCall.arguments, state.toolContext);
      toolResults.push(result);

      // R7：生成类工具成功后把 sessionId 回写到当前组件 id（供后续 modify/bind/push 锚定）
      const cid = extractCurrentComponentId(result);
      if (cid) {
        state.currentComponentId = cid;
        logger.log(`[Agent] currentComponentId updated to ${cid} (via ${toolCall.name})`);
      }

      // 将 Tool 结果加入消息历史
      toolMessages.push({
        role: 'tool',
        content: JSON.stringify(result),
        toolCallId: toolCall.id,
      });
    }

    // Node 3: 响应生成（汇总 Tool 结果）
    const cards = toolResults.filter(r => r.card).map(r => r.card!);
    const successCount = toolResults.filter(r => r.success).length;
    const failCount = toolResults.filter(r => !r.success).length;

    let summaryContent = llmResponse.content;

    // 工具若带文本总结（data.content，如 modify_component 的 AI 修改总结），回传给用户。
    // 前端 message-text 有 white-space: pre-wrap，\n 会正常换行展示。
    const toolSummaries = toolResults
      .filter(r => r.data && typeof r.data.content === 'string' && r.data.content.trim())
      .map(r => r.data.content.trim());
    if (toolSummaries.length > 0) {
      summaryContent += '\n\n' + toolSummaries.join('\n\n');
    }

    if (failCount > 0) {
      summaryContent += `\n\n⚠️ ${failCount} 个操作执行失败，请检查参数后重试。`;
    }

    // 收集所有卡片并返回
    return {
      response: summaryContent,
      cards,
      currentComponentId: state.currentComponentId,
    };
  }

  // 超过最大迭代次数
  return {
    response: '抱歉，操作过于复杂，请拆分成多个步骤重试。',
    cards: [],
  };
}
