"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runWorkbenchAgent = runWorkbenchAgent;
const common_1 = require("@nestjs/common");
const workbench_tools_1 = require("./workbench-tools");
const workbench_llm_1 = require("./workbench-llm");
const logger = new common_1.Logger('WorkbenchAgent');
function extractImageDataUrl(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role === 'assistant' && Array.isArray(m.cards) && m.cards.length > 0) {
            return null;
        }
        if (m.role !== 'user')
            continue;
        const atts = m.metadata?.attachments;
        if (!Array.isArray(atts))
            continue;
        for (const a of atts) {
            if (typeof a?.dataUrl === 'string' && a.dataUrl.startsWith('data:image/')) {
                return a.dataUrl;
            }
            if (typeof a?.imageBase64 === 'string') {
                return a.imageBase64.startsWith('data:')
                    ? a.imageBase64
                    : `data:image/png;base64,${a.imageBase64}`;
            }
        }
    }
    return null;
}
function extractAllImageDataUrls(messages) {
    const urls = [];
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role === 'assistant' && Array.isArray(m.cards) && m.cards.length > 0) {
            break;
        }
        if (m.role !== 'user')
            continue;
        const atts = m.metadata?.attachments;
        if (!Array.isArray(atts))
            continue;
        for (const a of atts) {
            if (typeof a?.dataUrl === 'string' && a.dataUrl.startsWith('data:image/')) {
                urls.push(a.dataUrl);
            }
            else if (typeof a?.imageBase64 === 'string') {
                urls.push(a.imageBase64.startsWith('data:')
                    ? a.imageBase64
                    : `data:image/png;base64,${a.imageBase64}`);
            }
        }
    }
    return urls;
}
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
async function callLLM(messages, tools, state) {
    const userMsg = messages[messages.length - 1];
    const content = userMsg?.content || '';
    const hasImage = !!extractImageDataUrl(messages);
    const tierFromInput = extractTier(content);
    const isTierSwitch = /^(lite|max|轻量|完整|标准)$/i.test(content.trim());
    if (isTierSwitch && tierFromInput) {
        const lastToolCall = findLastToolCallMessage(messages);
        if (lastToolCall && lastToolCall.toolCalls && lastToolCall.toolCalls.length > 0) {
            const prevCall = lastToolCall.toolCalls[0];
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
        return {
            role: 'assistant',
            content: `已收到规格：**${tierLabel(tierFromInput)}**，但还缺少生成素材，也没有进行中的生成任务。\n\n请提供以下任一种，我立刻按 ${tierLabel(tierFromInput)} 生成：\n\n- 📷 **截图**：直接粘贴或拖拽图片到输入框\n- 🎨 **Figma 链接**：需包含 node-id，例如 https://figma.com/file/xxx?node-id=1-2\n\n（也可以直接说「用 lite 生成这张截图」，把规格和素材一起给我。）`,
        };
    }
    if (/确认|开始生成|就这样/.test(content) && !/^好的$/.test(content.trim())) {
        const handled = handleConfirmIntent(messages);
        if (handled)
            return handled;
    }
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
    if (/截图|图片|截图生成/.test(content) || hasImage) {
        const tier = tierFromInput || 'max';
        const target = extractTarget(content);
        const componentName = extractComponentName(content);
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
    if (/确认|好的|开始生成|就这样/.test(content)) {
        return handleConfirmIntent(messages) || {
            role: 'assistant',
            content: '好的，请告诉我你想做什么。',
        };
    }
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
    if (/刚才的组件|上一个组件|当前组件|刚才那个|上次那个/.test(content) && state.currentComponentId) {
        return {
            role: 'assistant',
            content: `当前组件：**${state.currentComponentId}**\n\n你可以直接说：\n- ✏️ 「改样式」修改它\n- 🔗 「绑定 API」对接数据源\n- 📤 「推送到 GitLab」交付代码`,
        };
    }
    if (tierFromInput && !hasImage) {
        const label = tierLabel(tierFromInput);
        return {
            role: 'assistant',
            content: `已收到规格：**${label}**，但还缺少生成素材。\n\n请提供以下任一种，我立刻按 ${label} 生成：\n\n- 📷 **截图**：直接粘贴或拖拽图片到输入框\n- 🎨 **Figma 链接**：需包含 node-id，例如 https://figma.com/file/xxx?node-id=1-2\n\n（也可以直接说「用 lite 生成这张截图」，把规格和素材一起给我。）`,
        };
    }
    const ctxLine = state.currentComponentId
        ? `\n\n当前组件：**${state.currentComponentId}**（可直接说「改样式 / 绑定 API / 推送到 GitLab」继续操作它）`
        : '';
    return {
        role: 'assistant',
        content: `我理解你的需求："${content}"。目前我支持以下操作：\n\n- 📷 从截图生成组件\n- 🎨 从 Figma 链接生成组件\n- ✏️ 修改已有组件\n- 📋 查询任务状态\n- 📊 查看生成统计\n- 📦 列出组件\n- 🔗 绑定 API 数据源\n- 📤 推送到 GitLab\n- 🌐 发布到公共组件池\n- 🩺 组件体检\n- 🔁 版本历史 / 回滚\n- 🧩 批量生成组件\n- ⚙️ 执行工作流\n\n请告诉我你想做什么？${ctxLine}`,
    };
}
function extractComponentName(input) {
    const match = input.match(/c-[\w-]+/);
    if (match)
        return match[0];
    const nameMap = {
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
        if (input.includes(keyword))
            return name;
    }
    return `c-component-${Date.now().toString(36)}`;
}
function extractApiPath(input) {
    const match = input.match(/(GET|POST|PUT|DELETE)\s+\/[\w/-]+/i);
    return match ? match[0].toUpperCase() : null;
}
function tierLabel(tier) {
    return tier === 'lite' ? '轻量 (Lite)' : '完整 (Max)';
}
function targetLabel(target, tier) {
    const prefix = target === 'vue3' ? 'mv' : 'mc';
    const name = target === 'vue3' ? 'Vue3 组件' : '微码组件';
    return `${name} (${prefix}-${tier})`;
}
function extractTarget(input) {
    const lower = (input || '').toLowerCase();
    if (/\bvue3?\b|vue\s*3|vue组件|vue 组件/.test(lower))
        return 'vue3';
    if (/微码|mc-|microcode/.test(lower))
        return 'microcode';
    return 'microcode';
}
function extractTier(input) {
    const lower = input.toLowerCase();
    if (/\blite\b|轻量|简易|简版|简单版|快速|lite版|轻量版/.test(lower))
        return 'lite';
    if (/\bmax\b|完整|标准|精修|高保真|max版|完整版|标准版/.test(lower))
        return 'max';
    return null;
}
function handleConfirmIntent(messages) {
    const lastMsg = messages[messages.length - 2];
    if (!lastMsg || lastMsg.role !== 'assistant' || !lastMsg.cards?.length) {
        return null;
    }
    const confirmCard = lastMsg.cards.find(c => c.type === 'confirm' && c.data?.pendingToolCall);
    if (confirmCard) {
        let pendingCall = confirmCard.data.pendingToolCall;
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
    const progressCard = lastMsg.cards.find(c => c.type === 'progress' && c.data?.sessionId);
    if (progressCard) {
        return {
            role: 'assistant',
            content: `任务已在后台运行中（Session: ${progressCard.data.sessionId}），你可以在任务中心查看实时进度。`,
        };
    }
    return null;
}
function findLastToolCallMessage(messages) {
    for (let i = messages.length - 2; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
            return msg;
        }
    }
    return null;
}
function extractCurrentComponentId(r) {
    const d = r.data;
    if (!d)
        return undefined;
    if (typeof d.sessionId === 'string' && d.sessionId)
        return d.sessionId;
    if (Array.isArray(d.sessionIds) && d.sessionIds.length > 0)
        return d.sessionIds[0];
    return undefined;
}
async function runWorkbenchAgent(initialState) {
    const state = {
        conversationId: initialState.conversationId || '',
        userId: initialState.userId || '',
        messages: initialState.messages || [],
        currentComponentId: initialState.currentComponentId,
        toolContext: initialState.toolContext,
        iteration: 0,
        maxIterations: 5,
    };
    const llmConfig = initialState.llmConfig;
    const hasLLM = !!(llmConfig &&
        (llmConfig.apiKey || llmConfig.textApiKey || llmConfig.unifiedApiKey));
    if (hasLLM) {
        try {
            const llmResult = await (0, workbench_llm_1.runWorkbenchLLM)({
                messages: state.messages,
                currentComponentId: state.currentComponentId,
                toolContext: state.toolContext,
                llmConfig,
            });
            logger.log(`[Agent] 真 LLM 路径完成，conversation=${state.conversationId}`);
            return llmResult;
        }
        catch (err) {
            logger.warn(`[Agent] 真 LLM 意图识别失败，回退正则匹配: ${err?.message || err}`);
        }
    }
    logger.log(`[Agent] Starting conversation=${state.conversationId}, iteration=0`);
    while (state.iteration < state.maxIterations) {
        state.iteration++;
        const llmResponse = await callLLM(state.messages, workbench_tools_1.WORKBENCH_TOOLS, state);
        if (!llmResponse.toolCalls || llmResponse.toolCalls.length === 0) {
            return {
                response: llmResponse.content,
                cards: llmResponse.cards || [],
                currentComponentId: state.currentComponentId,
            };
        }
        const toolResults = [];
        const toolMessages = [];
        for (const toolCall of llmResponse.toolCalls) {
            logger.log(`[Agent] Executing tool: ${toolCall.name}`);
            const result = await (0, workbench_tools_1.executeTool)(toolCall.name, toolCall.arguments, state.toolContext);
            toolResults.push(result);
            const cid = extractCurrentComponentId(result);
            if (cid) {
                state.currentComponentId = cid;
                logger.log(`[Agent] currentComponentId updated to ${cid} (via ${toolCall.name})`);
            }
            toolMessages.push({
                role: 'tool',
                content: JSON.stringify(result),
                toolCallId: toolCall.id,
            });
        }
        const cards = toolResults.filter(r => r.card).map(r => r.card);
        const successCount = toolResults.filter(r => r.success).length;
        const failCount = toolResults.filter(r => !r.success).length;
        let summaryContent = llmResponse.content;
        const toolSummaries = toolResults
            .filter(r => r.data && typeof r.data.content === 'string' && r.data.content.trim())
            .map(r => r.data.content.trim());
        if (toolSummaries.length > 0) {
            summaryContent += '\n\n' + toolSummaries.join('\n\n');
        }
        if (failCount > 0) {
            summaryContent += `\n\n⚠️ ${failCount} 个操作执行失败，请检查参数后重试。`;
        }
        return {
            response: summaryContent,
            cards,
            currentComponentId: state.currentComponentId,
        };
    }
    return {
        response: '抱歉，操作过于复杂，请拆分成多个步骤重试。',
        cards: [],
    };
}
//# sourceMappingURL=workbench-agent.js.map