"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOL_EXECUTORS = exports.WORKBENCH_TOOLS = void 0;
exports.executeTool = executeTool;
const common_1 = require("@nestjs/common");
const figma_url_parser_1 = require("../ai-engine/utils/figma-url-parser");
const component_naming_js_1 = require("../ai-engine/utils/component-naming.js");
const generate_phase2_dto_1 = require("../phase2/dto/generate-phase2.dto");
const backend_root_1 = require("../config/backend-root");
const path_1 = require("path");
const usage_export_1 = require("../admin/usage-export");
const logger = new common_1.Logger('WorkbenchTools');
function formatAvgDuration(ms) {
    if (!ms || ms <= 0)
        return '—';
    if (ms < 1000)
        return `${ms}ms`;
    const sec = ms / 1000;
    if (sec < 60)
        return `${sec.toFixed(1)}s`;
    const min = sec / 60;
    if (min < 60)
        return `${min.toFixed(1)}min`;
    return `${(min / 60).toFixed(1)}h`;
}
function formatTokens(n) {
    if (!n || n <= 0)
        return '0';
    if (n < 1000)
        return `${n}`;
    if (n < 1_000_000)
        return `${(n / 1000).toFixed(1)}k`;
    return `${(n / 1_000_000).toFixed(1)}M`;
}
const SKIP_AUTO_BIND_ROLES = ['filter.tabs', 'component.config', 'table.columns', 'chart.legend', 'chart.threshold'];
function shouldSkipAutoBinding(slot) {
    if (slot.bindable === false)
        return true;
    return SKIP_AUTO_BIND_ROLES.includes(slot.role);
}
function hasAnyKeyword(text, keywords) {
    return keywords.some((k) => text.includes(k));
}
function functionText(fn) {
    return [fn.name, fn.summary, fn.path, fn.responsePreview].filter(Boolean).join(' ').toLowerCase();
}
function findBestMatch(slot, catalog) {
    if (!catalog?.modules || shouldSkipAutoBinding(slot))
        return null;
    const chartKeywords = ['统计', '趋势', '分析', '曲线', '图表', 'chart', 'trend', 'statistics', 'analysis'];
    const tableKeywords = ['列表', '分页', '明细', '记录', 'list', 'page', 'table', 'records'];
    const selectKeywords = ['选项', '下拉', '字典', '枚举', 'options', 'select', 'dict', 'enum'];
    const statKeywords = ['统计', '概览', '总量', '指标', 'summary', 'overview', 'total', 'metric'];
    for (const mod of catalog.modules) {
        for (const fn of mod.functions) {
            if (fn.method !== 'GET')
                continue;
            const text = functionText(fn);
            const preview = fn.responsePreview || '';
            if ((slot.slotType === 'table' || slot.slotType === 'list') &&
                (preview.includes('[{') || preview.includes('array') || hasAnyKeyword(text, tableKeywords))) {
                return { moduleName: mod.moduleName, functionName: fn.name };
            }
            if (slot.slotType === 'chart' && hasAnyKeyword(text, chartKeywords)) {
                return { moduleName: mod.moduleName, functionName: fn.name };
            }
            if (slot.slotType === 'select' && hasAnyKeyword(text, selectKeywords)) {
                return { moduleName: mod.moduleName, functionName: fn.name };
            }
            if (slot.slotType === 'stat' && hasAnyKeyword(text, statKeywords)) {
                return { moduleName: mod.moduleName, functionName: fn.name };
            }
        }
    }
    const refName = String(slot.refName || '').toLowerCase();
    if (!refName || slot.role === 'chart.composite')
        return null;
    for (const mod of catalog.modules) {
        for (const fn of mod.functions) {
            const fnName = fn.name.toLowerCase();
            if (fnName.includes(refName) || refName.includes(fnName)) {
                return { moduleName: mod.moduleName, functionName: fn.name };
            }
        }
    }
    return null;
}
function parseApiPath(apiPath) {
    const m = String(apiPath || '').trim().match(/^(GET|POST|PUT|DELETE)\s+(\/[^\s]*)/i);
    if (!m)
        return null;
    return { method: m[1].toUpperCase(), path: m[2] };
}
exports.WORKBENCH_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'create_component_from_screenshot',
            description: '从截图生成组件。用户上传截图并描述需求时调用。',
            parameters: {
                type: 'object',
                properties: {
                    imageUrl: { type: 'string', description: '截图 URL 或 base64' },
                    componentName: { type: 'string', description: '组件名称（英文 kebab-case）' },
                    target: { type: 'string', enum: ['microcode', 'vue3'], description: '目标类型：微码或 Vue3' },
                    tier: { type: 'string', enum: ['lite', 'max'], description: '规格：轻量或完整' },
                },
                required: ['imageUrl', 'componentName'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'create_component_from_figma',
            description: '从 Figma 链接生成组件。用户提供 Figma URL 时调用。',
            parameters: {
                type: 'object',
                properties: {
                    figmaUrl: { type: 'string', description: 'Figma 文件链接' },
                    componentName: { type: 'string', description: '组件名称' },
                    target: { type: 'string', enum: ['microcode', 'vue3'], description: '目标类型' },
                    tier: { type: 'string', enum: ['lite', 'max'], description: '规格' },
                },
                required: ['figmaUrl', 'componentName'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'modify_component',
            description: '修改已有组件。用户描述修改需求时调用。',
            parameters: {
                type: 'object',
                properties: {
                    componentId: { type: 'string', description: '组件 ID' },
                    modification: { type: 'string', description: '修改描述（自然语言）' },
                },
                required: ['componentId', 'modification'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'query_tasks',
            description: '查询任务列表。用户询问任务状态时调用。',
            parameters: {
                type: 'object',
                properties: {
                    status: { type: 'string', enum: ['running', 'completed', 'failed', 'all'], description: '任务状态筛选' },
                    limit: { type: 'number', description: '返回数量上限', default: 10 },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'bind_api_to_component',
            description: '为组件绑定 API 数据源。用户要求对接接口时调用。',
            parameters: {
                type: 'object',
                properties: {
                    componentId: { type: 'string', description: '组件 ID' },
                    apiPath: { type: 'string', description: 'API 路径，如 GET /operation/device/monitor' },
                    slotName: { type: 'string', description: '数据槽位名称' },
                },
                required: ['componentId', 'apiPath'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'push_to_gitlab',
            description: '将组件推送到 GitLab 仓库。用户要求发布/推送时调用。',
            parameters: {
                type: 'object',
                properties: {
                    componentIds: { type: 'array', items: { type: 'string' }, description: '组件 ID 列表' },
                    branch: { type: 'string', description: '目标分支', default: 'main' },
                    commitMessage: { type: 'string', description: '提交信息' },
                },
                required: ['componentIds'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_components',
            description: '列出用户的组件。用户询问"我有哪些组件"时调用。',
            parameters: {
                type: 'object',
                properties: {
                    filter: { type: 'string', enum: ['mine', 'public', 'recent'], description: '筛选条件' },
                    limit: { type: 'number', description: '返回数量上限', default: 20 },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_generation_stats',
            description: '获取生成统计数据。用户询问统计信息时调用。',
            parameters: {
                type: 'object',
                properties: {
                    timeRange: { type: 'string', enum: ['today', 'week', 'month', 'all'], description: '时间范围' },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'batch_generate',
            description: '批量生成组件。用户提供多个截图或 Figma 链接时调用。',
            parameters: {
                type: 'object',
                properties: {
                    items: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                source: { type: 'string', description: '截图 URL 或 Figma 链接' },
                                name: { type: 'string', description: '组件名称' },
                            },
                        },
                        description: '批量生成项列表',
                    },
                    target: { type: 'string', enum: ['microcode', 'vue3'], description: '目标类型' },
                },
                required: ['items'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'execute_workflow',
            description: '执行预定义工作流/配方。用户要求使用某个配方时调用。',
            parameters: {
                type: 'object',
                properties: {
                    workflowId: { type: 'string', description: '工作流 ID' },
                    params: { type: 'object', description: '工作流参数' },
                },
                required: ['workflowId'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'analyze_component',
            description: '对组件做体检：真实预览运行时门禁 + 视觉相似度对比。用户要求"体检/检查/分析组件质量"时调用。',
            parameters: {
                type: 'object',
                properties: {
                    componentId: { type: 'string', description: '组件 ID（sessionId 或 componentId）' },
                },
                required: ['componentId'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_revisions',
            description: '列出组件的代码快照版本历史。用户要求"查看版本/历史版本/有哪些版本"时调用。',
            parameters: {
                type: 'object',
                properties: {
                    componentId: { type: 'string', description: '组件 ID（sessionId）' },
                },
                required: ['componentId'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'rollback_component',
            description: '把组件回滚到指定历史版本。用户要求"回滚/回退/恢复到上一版/回到某版本"时调用。',
            parameters: {
                type: 'object',
                properties: {
                    componentId: { type: 'string', description: '组件 ID（sessionId）' },
                    revision: { type: 'string', description: '目标版本 revision（r-开头的 UUID）' },
                },
                required: ['componentId', 'revision'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'publish_component',
            description: '把组件发布到公共组件池（visibility=public）。用户要求"发布/交付/共享组件"时调用。',
            parameters: {
                type: 'object',
                properties: {
                    componentId: { type: 'string', description: '组件 ID（sessionId 或 componentId）' },
                },
                required: ['componentId'],
            },
        },
    },
];
exports.TOOL_EXECUTORS = {
    create_component_from_screenshot: async (args, ctx) => {
        try {
            const { imageUrl, componentName: rawComponentName, target = 'microcode', backgroundBrightness = 'light' } = args;
            const componentName = (0, component_naming_js_1.isTaskIdLikeName)(rawComponentName)
                ? ''
                : String(rawComponentName || '').trim();
            const tier = 'lite';
            const typePrefix = target === 'microcode' ? 'mc' : 'mv';
            const sessionId = `${typePrefix}-${tier}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            const groupId = await ctx.liteService.resolvePrivateGroupId(undefined, ctx.userId);
            ctx.tasksService.createTask(sessionId, {
                componentId: sessionId,
                componentName: componentName || sessionId,
                target,
                groupId,
                panelKey: 'default-panel',
                taskType: 'component',
                userId: ctx.userId,
                generationTier: 'lite',
                sourceType: 'screenshot',
                outputPath: (0, path_1.join)(backend_root_1.tempComponentsDir, groupId, sessionId),
            }, 'queued');
            const liteDto = {
                imageBase64: imageUrl,
                componentName: componentName || sessionId,
                componentType: target,
                generationTier: 'lite',
                backgroundBrightness,
            };
            const executeLiteGeneration = async () => {
                try {
                    ctx.tasksService.updateTask(sessionId, { status: 'running' });
                    await ctx.liteService.startGeneration(sessionId, liteDto, groupId, ctx.userId, {
                        sourceType: 'screenshot',
                        componentType: target,
                        generationTier: 'lite',
                    });
                    if (ctx.queueService) {
                        await ctx.queueService.markTaskCompleted(sessionId);
                    }
                }
                catch (err) {
                    logger.error(`Lite 截图任务失败 ${sessionId}: ${err?.message}`);
                    const task = ctx.tasksService.getTask(sessionId);
                    if (task?.status !== 'failed' && task?.status !== 'cancelled') {
                        await ctx.progressService.sendError(sessionId, {
                            code: 'INTERNAL_ERROR',
                            message: err?.message || '截图生成失败',
                        });
                    }
                    else if (ctx.queueService) {
                        await ctx.queueService.markTaskFailed(sessionId);
                    }
                }
            };
            if (ctx.queueService && ctx.queueService.getAvailableSlots(ctx.userId) <= 0) {
                await ctx.queueService.enqueue({
                    sessionId,
                    componentId: sessionId,
                    componentName: componentName || sessionId,
                    target,
                    groupId,
                    userId: ctx.userId,
                }, 'concurrency_full', executeLiteGeneration);
            }
            else {
                if (ctx.queueService) {
                    ctx.queueService.registerRunning(sessionId, ctx.userId);
                }
                executeLiteGeneration();
            }
            return {
                success: true,
                data: { sessionId, componentName, status: 'queued' },
                card: {
                    type: 'progress',
                    data: {
                        sessionId,
                        componentName: componentName || sessionId,
                        status: 'running',
                        progress: 0,
                        imageUrl: typeof imageUrl === 'string' && imageUrl.startsWith('data:image/') ? imageUrl : undefined,
                        steps: ['视觉分析', '布局解析', '代码生成', '质量校验', '快照保存'],
                    },
                },
            };
        }
        catch (err) {
            logger.error('create_component_from_screenshot failed', err);
            return { success: false, error: err.message };
        }
    },
    create_component_from_figma: async (args, ctx) => {
        try {
            const { figmaUrl, componentName: rawComponentName, target = 'microcode', tier = 'max' } = args;
            const componentName = (0, component_naming_js_1.isTaskIdLikeName)(rawComponentName)
                ? ''
                : String(rawComponentName || '').trim();
            const parsed = (0, figma_url_parser_1.parseFigmaUrl)(figmaUrl);
            if (!parsed.fileKey || !parsed.nodeId) {
                return {
                    success: false,
                    error: 'Max 完整生成需要包含 node-id 的有效 Figma 链接'
                };
            }
            const typePrefix = target === 'microcode' ? 'mc' : 'mv';
            const tierSuffix = tier === 'lite' ? 'lite' : 'max';
            const sessionId = `${typePrefix}-${tierSuffix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            const groupId = await ctx.liteService.resolvePrivateGroupId(undefined, ctx.userId);
            ctx.tasksService.createTask(sessionId, {
                componentId: sessionId,
                componentName: componentName || sessionId,
                target,
                groupId,
                panelKey: 'default-panel',
                taskType: 'component',
                userId: ctx.userId,
                generationTier: tier,
                sourceType: 'figma',
                outputPath: (0, path_1.join)(backend_root_1.tempComponentsDir, groupId, sessionId),
            }, 'queued');
            let execute;
            if (tier === 'max') {
                const phase2Dto = new generate_phase2_dto_1.GeneratePhase2Dto();
                phase2Dto.componentName = componentName || sessionId;
                phase2Dto.componentId = sessionId;
                phase2Dto.fileKey = parsed.fileKey;
                phase2Dto.nodeId = parsed.nodeId;
                phase2Dto.groupId = groupId;
                phase2Dto.target = target;
                execute = async () => {
                    try {
                        ctx.tasksService.updateTask(sessionId, { status: 'running' });
                        await ctx.phase2Service.startGeneration(sessionId, phase2Dto, groupId, ctx.userId);
                        ctx.tasksService.updateTask(sessionId, {
                            generationTier: 'max',
                            sourceType: 'figma',
                        });
                    }
                    catch (err) {
                        logger.error(`Max 任务启动失败 ${sessionId}: ${err?.message}`);
                        const task = ctx.tasksService.getTask(sessionId);
                        if (task?.status !== 'failed' && task?.status !== 'cancelled') {
                            await ctx.progressService.sendError(sessionId, {
                                code: 'INTERNAL_ERROR',
                                message: err?.message || 'Max 生成失败',
                            });
                        }
                        else if (ctx.queueService) {
                            await ctx.queueService.markTaskFailed(sessionId);
                        }
                    }
                };
            }
            else {
                const liteDto = {
                    figmaUrl,
                    componentName: componentName || sessionId,
                    componentType: target,
                    generationTier: 'lite',
                };
                execute = async () => {
                    try {
                        ctx.tasksService.updateTask(sessionId, { status: 'running' });
                        await ctx.liteService.startGeneration(sessionId, liteDto, groupId, ctx.userId, {
                            sourceType: 'figma',
                            componentType: target,
                            generationTier: 'lite',
                        });
                        ctx.tasksService.updateTask(sessionId, {
                            generationTier: 'lite',
                            sourceType: 'figma',
                        });
                    }
                    catch (err) {
                        logger.error(`Figma Lite 任务启动失败 ${sessionId}: ${err?.message}`);
                        const task = ctx.tasksService.getTask(sessionId);
                        if (task?.status !== 'failed' && task?.status !== 'cancelled') {
                            await ctx.progressService.sendError(sessionId, {
                                code: 'INTERNAL_ERROR',
                                message: err?.message || 'Figma Lite 生成失败',
                            });
                        }
                        else if (ctx.queueService) {
                            await ctx.queueService.markTaskFailed(sessionId);
                        }
                    }
                };
            }
            if (ctx.queueService && ctx.queueService.getAvailableSlots(ctx.userId) <= 0) {
                await ctx.queueService.enqueue({
                    sessionId,
                    componentId: sessionId,
                    componentName: componentName || sessionId,
                    target,
                    groupId,
                    userId: ctx.userId,
                }, 'concurrency_full', execute);
            }
            else {
                if (ctx.queueService) {
                    ctx.queueService.registerRunning(sessionId, ctx.userId);
                }
                execute();
            }
            return {
                success: true,
                data: { sessionId, componentName, fileKey: parsed.fileKey, status: 'queued' },
                card: {
                    type: 'progress',
                    data: {
                        sessionId,
                        componentName: componentName || sessionId,
                        status: 'running',
                        progress: 0,
                        currentStep: 0,
                        steps: ['解析 Figma 节点树', '视觉分析', '代码生成', '质量门禁'],
                    },
                },
            };
        }
        catch (err) {
            logger.error('create_component_from_figma failed', err);
            return { success: false, error: err.message };
        }
    },
    modify_component: async (args, ctx) => {
        try {
            const { componentId, modification } = args;
            if (!componentId || !modification) {
                return { success: false, error: '缺少 componentId 或 modification 参数' };
            }
            const result = await ctx.demoService.aiChat({
                message: modification,
                componentId,
            });
            const files = result.modifiedFiles || [];
            const toolErrors = result.toolErrors || [];
            return {
                success: result.success,
                data: {
                    componentId,
                    content: result.content,
                    modifiedFiles: files,
                    iterations: result.iterations,
                    toolErrors,
                },
                card: {
                    type: 'diff',
                    data: {
                        componentId,
                        summary: {
                            additions: files.length,
                            deletions: 0,
                        },
                        changes: files.map((f) => ({ file: f, diff: '' })),
                    },
                },
            };
        }
        catch (err) {
            logger.error('modify_component failed', err);
            return { success: false, error: err.message };
        }
    },
    query_tasks: async (args, ctx) => {
        try {
            const { status = 'all', limit = 10 } = args;
            const tasks = ctx.tasksService.getAllTasks(ctx.userId, { limit });
            let filtered = tasks;
            if (status !== 'all') {
                filtered = tasks.filter(t => t.status === status);
            }
            return {
                success: true,
                data: filtered,
                card: {
                    type: 'list',
                    data: {
                        title: status === 'all' ? '最近任务' : `${status} 状态的任务`,
                        items: filtered.slice(0, limit).map(t => ({
                            id: t.sessionId,
                            name: t.displayName || t.componentName,
                            status: t.status,
                            time: new Date(t.startTime).toLocaleString('zh-CN'),
                        })),
                    },
                },
            };
        }
        catch (err) {
            logger.error('query_tasks failed', err);
            return { success: false, error: err.message };
        }
    },
    bind_api_to_component: async (args, ctx) => {
        try {
            const { componentId, apiPath, slotName } = args;
            if (!componentId) {
                return { success: false, error: '缺少 componentId 参数' };
            }
            const task = ctx.tasksService.getTask(componentId);
            const groupId = task?.groupId;
            if (!groupId) {
                return {
                    success: false,
                    error: '无法定位组件的群组信息，请到任务详情页的「接口对接」向导完成绑定',
                };
            }
            const catalogs = ctx.apifoxService.listCatalogs(ctx.userId);
            if (!catalogs || catalogs.length === 0) {
                return {
                    success: false,
                    error: '暂无可用 API 目录，请先在「接口生成」页从 Apifox 生成一份接口目录',
                };
            }
            const catalogId = catalogs[0].catalogId;
            const catalog = ctx.apifoxService.getCatalog(catalogId);
            const { slots } = await ctx.slotAnalyzer.analyzeSlots(componentId, groupId);
            if (!slots || slots.length === 0) {
                return {
                    success: false,
                    error: '组件没有可绑定的数据槽，请确认组件含表格/图表/下拉等数据区域',
                };
            }
            let exactFn = null;
            const parsed = parseApiPath(apiPath);
            if (parsed) {
                outer: for (const mod of catalog.modules) {
                    for (const fn of mod.functions) {
                        if (String(fn.method || '').toUpperCase() === parsed.method && fn.path === parsed.path) {
                            exactFn = { moduleName: mod.moduleName, functionName: fn.name };
                            break outer;
                        }
                    }
                }
            }
            const bindings = [];
            let boundCount = 0;
            let usedExact = false;
            for (const slot of slots) {
                const base = {
                    slotId: slot.slotId,
                    slotType: slot.slotType,
                    refName: slot.refName,
                    label: slot.label,
                    role: slot.role,
                    bindable: slot.bindable,
                    children: slot.children,
                };
                if (shouldSkipAutoBinding(slot)) {
                    bindings.push({ ...base, status: 'skipped', skipReason: '筛选/配置子项不作为主接口绑定' });
                    continue;
                }
                if (exactFn && !usedExact) {
                    bindings.push({ ...base, ...exactFn, status: 'bound' });
                    boundCount++;
                    usedExact = true;
                    continue;
                }
                const rec = findBestMatch(slot, catalog);
                if (rec) {
                    bindings.push({ ...base, ...rec, status: 'bound' });
                    boundCount++;
                }
                else {
                    bindings.push({ ...base, status: 'stub', stubReason: '未找到匹配接口' });
                }
            }
            if (boundCount === 0) {
                return {
                    success: false,
                    error: `未在 API 目录中找到可匹配的接口（${apiPath || '未指定'}）。请在「接口对接」向导中手动选择数据槽对应的接口。`,
                };
            }
            const result = await ctx.apiBindingService.bindApi({
                catalogId,
                componentId,
                groupId,
                componentName: task?.componentName || componentId,
                bindings,
            });
            return {
                success: true,
                data: {
                    ...result,
                    groupId,
                    catalogId,
                    boundSlots: bindings.filter((b) => b.status === 'bound').length,
                    stubSlots: bindings.filter((b) => b.status === 'stub').length,
                    skippedSlots: bindings.filter((b) => b.status === 'skipped').length,
                },
                card: {
                    type: 'list',
                    data: {
                        title: `API 绑定完成（${bindings.filter((b) => b.status === 'bound').length} 绑定 / ${bindings.filter((b) => b.status === 'stub').length} 占位）`,
                        items: bindings.map((b) => ({
                            id: b.slotId,
                            name: `${b.slotType} · ${b.label || b.refName || b.slotId}`,
                            meta: b.status === 'bound'
                                ? `已绑定 ${b.moduleName}.${b.functionName}`
                                : b.status === 'stub'
                                    ? '占位（无匹配接口）'
                                    : '跳过（配置项）',
                        })),
                    },
                },
            };
        }
        catch (err) {
            logger.error('bind_api_to_component failed', err);
            return { success: false, error: err.message };
        }
    },
    push_to_gitlab: async (args, ctx) => {
        try {
            const { componentIds, branch = 'main', commitMessage } = args;
            if (!componentIds || componentIds.length === 0) {
                return { success: false, error: '缺少 componentIds 参数' };
            }
            if (!ctx.gitlabToken || !ctx.gitlabProjectUrl) {
                return {
                    success: false,
                    error: '未配置 GitLab 凭据，请点击对话右上角「工具凭据」配置 GitLab Token 和仓库地址',
                };
            }
            const results = [];
            for (const id of componentIds) {
                const r = await ctx.gitlabPushService.pushComponent({
                    identifier: id,
                    userId: ctx.userId,
                    repoUrl: ctx.gitlabProjectUrl,
                    branch,
                    accessToken: ctx.gitlabToken,
                    commitMessage,
                });
                results.push(r);
            }
            return {
                success: true,
                data: { results },
                card: {
                    type: 'list',
                    data: {
                        title: `GitLab 推送完成（${results.length} 个组件）`,
                        items: results.map((r) => ({
                            id: r.data?.componentId || '',
                            name: r.data?.componentId || '',
                            meta: `${r.data?.branch || branch} · ${r.data?.files || 0} 个文件 · ${r.data?.commitId || ''}`,
                        })),
                    },
                },
            };
        }
        catch (err) {
            logger.error('push_to_gitlab failed', err);
            return { success: false, error: err.message };
        }
    },
    list_components: async (args, ctx) => {
        try {
            const { filter = 'mine', limit = 20 } = args;
            const result = await ctx.componentService.listComponents({ limit }, ctx.userId);
            const components = Array.isArray(result) ? result : (result?.components ?? []);
            return {
                success: true,
                data: components,
                card: {
                    type: 'list',
                    data: {
                        title: filter === 'mine' ? '我的组件' : filter === 'public' ? '公共组件' : '最近组件',
                        items: components.slice(0, limit).map((c) => ({
                            id: c.componentId,
                            name: c.name,
                            type: c.target,
                            time: new Date(c.createdAt).toLocaleDateString('zh-CN'),
                        })),
                    },
                },
            };
        }
        catch (err) {
            logger.error('list_components failed', err);
            return { success: false, error: err.message };
        }
    },
    get_generation_stats: async (args, ctx) => {
        try {
            const { timeRange = 'week' } = args;
            const today = (0, usage_export_1.ymdShanghai)(Date.now());
            const filter = {
                today: { preset: 'custom', from: today, to: today },
                week: { preset: 'week' },
                month: { preset: 'd30' },
                all: { preset: 'custom', from: '1970-01-01', to: today },
            }[timeRange] || { preset: 'week' };
            const { overview, windowLabel } = await ctx.taskStatsService.myDashboard(ctx.userId, filter);
            const successRatePct = overview.successRate == null
                ? null
                : Math.round(overview.successRate * 100);
            const rangeTitle = {
                today: '今日统计',
                week: '本周统计',
                month: '近30天统计',
                all: '全部统计',
            }[timeRange] || '本周统计';
            return {
                success: true,
                data: {
                    timeRange,
                    windowLabel,
                    total: overview.totalTasks,
                    completed: overview.completedTasks,
                    failed: overview.failedTasks,
                    successRate: successRatePct,
                    avgDurationMs: overview.avgDurationMs,
                    totalTokens: overview.totalTokens,
                    totalCost: overview.totalCost,
                },
                card: {
                    type: 'stats',
                    data: {
                        title: `${rangeTitle} · ${windowLabel}`,
                        metrics: [
                            { label: '总生成数', value: overview.totalTasks },
                            { label: '成功数', value: overview.completedTasks },
                            { label: '失败数', value: overview.failedTasks },
                            { label: '成功率', value: successRatePct == null ? '—' : `${successRatePct}%` },
                            { label: '平均耗时', value: formatAvgDuration(overview.avgDurationMs) },
                            { label: 'Token 消耗', value: formatTokens(overview.totalTokens) },
                            { label: '总成本', value: `¥${overview.totalCost.toFixed(2)}` },
                        ],
                    },
                },
            };
        }
        catch (err) {
            logger.error('get_generation_stats failed', err);
            return { success: false, error: err.message };
        }
    },
    batch_generate: async (args, ctx) => {
        try {
            const { items, target = 'microcode' } = args;
            if (!Array.isArray(items) || items.length === 0) {
                return { success: false, error: '缺少 items 参数（至少一个生成项）' };
            }
            const batchId = `batch-${Date.now()}`;
            const created = [];
            for (const item of items) {
                const source = String(item?.source || '').trim();
                const name = String(item?.name || '').trim();
                if (!source) {
                    created.push({ source: '', name, type: 'unknown', success: false, sessionId: null, error: '缺少 source' });
                    continue;
                }
                const isFigma = /figma/i.test(source);
                const execName = isFigma ? 'create_component_from_figma' : 'create_component_from_screenshot';
                const exec = exports.TOOL_EXECUTORS[execName];
                let r;
                try {
                    if (isFigma) {
                        r = await exec({ figmaUrl: source, componentName: name, target, tier: 'max' }, ctx);
                    }
                    else {
                        r = await exec({ imageUrl: source, componentName: name, target }, ctx);
                    }
                }
                catch (err) {
                    r = { success: false, error: err?.message || '生成执行异常' };
                }
                created.push({
                    source,
                    name,
                    type: isFigma ? 'figma' : 'screenshot',
                    success: r.success,
                    sessionId: r.data?.sessionId || null,
                    error: r.error || null,
                });
            }
            const okCount = created.filter((c) => c.success).length;
            const sessionIds = created.filter((c) => c.success && c.sessionId).map((c) => c.sessionId);
            return {
                success: true,
                data: { batchId, items: created, sessionIds },
                card: {
                    type: 'list',
                    data: {
                        title: `批量生成已提交（${okCount}/${created.length} 成功入队）`,
                        items: created.map((c) => ({
                            id: c.sessionId || c.source || '',
                            name: c.name || c.sessionId || (c.source ? c.source.slice(0, 30) : '未知'),
                            meta: c.success ? `${c.type === 'figma' ? 'Figma' : '截图'} · 排队中` : `失败：${c.error || '未知'}`,
                        })),
                    },
                },
            };
        }
        catch (err) {
            logger.error('batch_generate failed', err);
            return { success: false, error: err.message };
        }
    },
    execute_workflow: async (args, ctx) => {
        try {
            const { workflowId, params = {} } = args;
            if (!workflowId) {
                return { success: false, error: '缺少 workflowId 参数' };
            }
            const result = await ctx.workflowService.run(workflowId, params || {}, ctx.userId);
            if (!result.success) {
                return { success: false, error: result.error || '工作流执行失败' };
            }
            return {
                success: true,
                data: result,
                card: {
                    type: 'progress',
                    data: {
                        sessionId: result.sessionId,
                        workflowId,
                        status: 'running',
                        progress: 0,
                        currentMessage: result.message || '工作流已启动',
                    },
                },
            };
        }
        catch (err) {
            logger.error('execute_workflow failed', err);
            return { success: false, error: err.message };
        }
    },
    analyze_component: async (args, ctx) => {
        try {
            const { componentId } = args;
            if (!componentId) {
                return { success: false, error: '缺少 componentId 参数' };
            }
            const report = await ctx.componentAnalysisService.analyzeComponent(componentId, ctx.userId);
            const runtime = report?.runtime || {};
            const visual = report?.visual || {};
            const lines = [];
            lines.push(`运行时门禁：${runtime.status === 'PASS' ? '通过' : '未通过'}${runtime.summary ? ' —— ' + runtime.summary : ''}`);
            if (visual?.available) {
                const sim = typeof visual.overallSimilarity === 'number'
                    ? `${Math.round(visual.overallSimilarity * 100)}%`
                    : 'N/A';
                lines.push(`视觉相似度：${sim}${visual.summary ? ' —— ' + visual.summary : ''}`);
            }
            else if (visual?.summary) {
                lines.push(visual.summary);
            }
            const runtimePassText = runtime.status === 'PASS' ? '通过' : (runtime.status || '未执行');
            const simText = typeof visual?.overallSimilarity === 'number'
                ? `${Math.round(visual.overallSimilarity * 100)}%`
                : (visual?.available ? 'N/A' : '未执行');
            return {
                success: report?.success !== false,
                data: {
                    componentId,
                    content: lines.join('\n'),
                    runtime: { status: runtime.status, pass: !!runtime.pass, summary: runtime.summary || '' },
                    visual: {
                        available: !!visual?.available,
                        overallSimilarity: visual?.overallSimilarity ?? null,
                        summary: visual?.summary || '',
                    },
                },
                card: {
                    type: 'stats',
                    data: {
                        title: '组件体检报告',
                        metrics: [
                            { label: '运行时门禁', value: runtimePassText },
                            { label: '视觉相似度', value: simText },
                        ],
                    },
                },
            };
        }
        catch (err) {
            logger.error('analyze_component failed', err);
            return { success: false, error: err?.message || '体检失败' };
        }
    },
    list_revisions: async (args, ctx) => {
        try {
            const { componentId } = args;
            if (!componentId) {
                return { success: false, error: '缺少 componentId 参数' };
            }
            const revisions = ctx.taskCodeSnapshotService.listRevisions(componentId);
            if (!revisions || revisions.length === 0) {
                return { success: false, error: '该组件没有可用的版本快照（可能未经完整生成链路）' };
            }
            const lastGood = ctx.taskCodeSnapshotService.getLastGoodManifest(componentId)?.revision || null;
            return {
                success: true,
                data: { componentId, revisions, current: lastGood },
                card: {
                    type: 'list',
                    data: {
                        title: `版本历史（${revisions.length} 个版本）`,
                        items: revisions.map((r) => ({
                            id: r.revision,
                            name: `${r.revision}${r.revision === lastGood ? ' · 当前' : ''}`,
                            meta: `${r.status} · ${new Date(r.createdAt).toLocaleString('zh-CN')}`,
                        })),
                    },
                },
            };
        }
        catch (err) {
            logger.error('list_revisions failed', err);
            return { success: false, error: err?.message || '列版本失败' };
        }
    },
    rollback_component: async (args, ctx) => {
        try {
            const { componentId, revision: requestedRevision } = args;
            if (!componentId) {
                return { success: false, error: '缺少 componentId 参数' };
            }
            let target = String(requestedRevision || '').trim();
            if (!target) {
                const all = ctx.taskCodeSnapshotService.listRevisions(componentId);
                const lastGood = ctx.taskCodeSnapshotService.getLastGoodManifest(componentId)?.revision;
                const rollable = all.find((r) => r.revision !== lastGood &&
                    ['candidate', 'validating', 'last-good', 'partial'].includes(r.status));
                if (!rollable) {
                    return { success: false, error: '没有可回滚的历史版本（可能只有一个版本，或历史版本均已拒绝）' };
                }
                target = rollable.revision;
            }
            const manifest = ctx.taskCodeSnapshotService.rollbackToRevision(componentId, target);
            return {
                success: true,
                data: {
                    componentId,
                    revision: manifest.revision,
                    content: `已回滚到版本 ${manifest.revision}（${manifest.status}，${manifest.files?.length || 0} 个文件）`,
                },
                card: {
                    type: 'list',
                    data: {
                        title: '回滚完成',
                        items: [{
                                id: manifest.revision,
                                name: manifest.revision,
                                meta: `${new Date(manifest.createdAt).toLocaleString('zh-CN')} · ${manifest.files?.length || 0} 个文件`,
                            }],
                    },
                },
            };
        }
        catch (err) {
            logger.error('rollback_component failed', err);
            return { success: false, error: err?.message || '回滚失败' };
        }
    },
    publish_component: async (args, ctx) => {
        try {
            const { componentId } = args;
            if (!componentId) {
                return { success: false, error: '缺少 componentId 参数' };
            }
            const authorized = await ctx.componentService.authorizeWorkspaceComponent(componentId, ctx.userId, 'read');
            const comp = authorized?.component;
            const mongoId = comp?._id?.toString?.() || comp?._id;
            if (!mongoId) {
                return { success: false, error: '组件尚未入库，无法发布到公共组件池（请先完成一次生成并保存）' };
            }
            const component = await ctx.componentService.publishComponent(String(mongoId), ctx.userId);
            const outId = component?.componentId || componentId;
            const visibility = component?.visibility;
            return {
                success: true,
                data: {
                    componentId: outId,
                    visibility,
                    sharedAt: component?.sharedAt,
                    content: `已发布到公共组件池（visibility=${visibility}）`,
                },
                card: {
                    type: 'stats',
                    data: {
                        title: '发布完成',
                        metrics: [
                            { label: '组件', value: outId },
                            { label: '可见性', value: visibility === 'public' ? '公共' : String(visibility) },
                        ],
                    },
                },
            };
        }
        catch (err) {
            logger.error('publish_component failed', err);
            return { success: false, error: err?.message || '发布失败' };
        }
    },
};
async function executeTool(toolName, args, ctx) {
    const executor = exports.TOOL_EXECUTORS[toolName];
    if (!executor) {
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
    return executor(args, ctx);
}
//# sourceMappingURL=workbench-tools.js.map