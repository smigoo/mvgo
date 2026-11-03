"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var DemoService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DemoService = void 0;
const common_1 = require("@nestjs/common");
const archiver = require('archiver');
const promises_1 = require("fs/promises");
const fs_1 = require("fs");
const path_1 = require("path");
const component_service_1 = require("../component/component.service");
const phase2_service_1 = require("../phase2/phase2.service");
const chat_attachment_service_1 = require("./chat-attachment.service");
const snapshot_manager_js_1 = require("../ai-engine/tools/snapshot-manager.js");
const component_resolver_js_1 = require("../ai-engine/utils/component-resolver.js");
const backend_root_js_1 = require("../config/backend-root.js");
const package_filter_1 = require("../common/utils/package-filter");
const SKIP_DIRS = new Set(package_filter_1.EXCLUDED_PACKAGE_DIRS);
const AI_FIX_RENDER_ERROR_TIMEOUT_MS = 180_000;
let DemoService = DemoService_1 = class DemoService {
    componentService;
    phase2Service;
    chatAttachmentService;
    logger = new common_1.Logger(DemoService_1.name);
    aiFixLocks = new Set();
    constructor(componentService, phase2Service, chatAttachmentService) {
        this.componentService = componentService;
        this.phase2Service = phase2Service;
        this.chatAttachmentService = chatAttachmentService;
    }
    async aiChat(params) {
        const { message, componentId, selectedFiles = [], attachments = [], history = [], llmConfig = {} } = params;
        this.logger.log(`AI 对话请求: componentId=${componentId}, message=${message.substring(0, 80)}`);
        const hasSnap = await (0, snapshot_manager_js_1.hasInitialSnapshot)(componentId);
        if (!hasSnap) {
            try {
                await (0, snapshot_manager_js_1.takeInitialSnapshot)(componentId);
            }
            catch (err) {
                this.logger.warn(`初始快照创建失败: ${err.message}`);
            }
        }
        const messageWithVisualContext = await this.buildMessageWithVisualContext({
            message,
            componentId,
            attachments,
            llmConfig,
        });
        const { runPlaygroundAgent } = await import('../ai-engine/graphs/playground-agent-graph.js');
        const result = await runPlaygroundAgent({
            message: messageWithVisualContext,
            componentId,
            selectedFiles,
            attachments,
            history,
            llmConfig,
            callbacks: {
                onToolCall: (tc) => {
                    this.logger.log(`工具调用: ${tc.name}`);
                },
                onToolResult: ({ name, result }) => {
                    this.logger.log(`工具结果: ${name} → success=${result?.success ?? true}`);
                },
            },
        });
        return result;
    }
    async buildMessageWithVisualContext(params) {
        const { message, componentId, attachments = [], llmConfig = {}, onStatus } = params;
        if (!Array.isArray(attachments) || attachments.length === 0) {
            return message;
        }
        try {
            onStatus?.('正在分析截图内容...');
            const analysis = await this.chatAttachmentService.analyzeAttachments(attachments, {
                componentId,
                llmConfig,
            });
            const warningText = analysis.warnings.length > 0
                ? `\n\n## 截图分析警告\n${analysis.warnings.map((item) => `- ${item}`).join('\n')}`
                : '';
            if (!analysis.summary) {
                return `${message}\n\n## 截图分析结果\n截图分析未产生可用结果，请优先根据用户文字和已选文件处理。${warningText}`;
            }
            return `${message}\n\n## 截图视觉分析\n${analysis.summary}${warningText}\n\n## 执行要求\n请结合截图视觉分析、用户文字和组件代码判断问题。若需要修改代码，必须先读取相关文件，再调用 write_file 保存完整文件内容。`;
        }
        catch (error) {
            this.logger.warn(`截图分析失败，降级按文字处理: ${error.message}`);
            return `${message}\n\n## 截图分析结果\n截图分析失败：${error.message}。请先根据用户文字和已选文件处理；如果信息不足，要求用户补充截图中的关键现象。`;
        }
    }
    async aiFixRenderError(params) {
        const { componentId, groupId = '', errorMessage, stack = '', info = '', llmConfig = {} } = params;
        if (this.aiFixLocks.has(componentId)) {
            return {
                success: false,
                componentId,
                summary: '该组件已有 AI 修复任务正在进行中，请等待当前任务完成后再试。',
                alreadyRunning: true,
            };
        }
        this.aiFixLocks.add(componentId);
        try {
            this.logger.log(`AI 修复渲染错误: componentId=${componentId}, error=${errorMessage.substring(0, 120)}`);
            const selectedFiles = [
                { path: 'package/index.vue', name: 'package/index.vue' },
            ];
            const message = `请修复这个 Vue3 组件的预览渲染错误。你必须实际读取文件并在确认问题后调用 write_file 保存修复。

## 组件信息
- componentId: ${componentId}
- groupId: ${groupId || '未提供'}

## 预览错误
${errorMessage}

## Vue 捕获信息
${info || '无'}

## 错误堆栈
${stack || '无'}

## 修复边界
1. 只检查并修复 package/index.vue（Vue3 唯一入口）。
2. 只修复导致当前预览失败的最小必要代码，不要重构、不改视觉样式、不替换业务数据。
3. 重点排查：
   - Vue SFC 标签结构是否完整：<template>、<script setup>、<style> 是否正确闭合和排序。
   - Cannot read properties of undefined 类错误：是否需要 props/computed 的空值兜底，而不是删除功能。
   - resources 路径是否和根 resources/ 目录结构匹配（package/index.vue 应使用 ../resources/）。
   - import 路径、组件引用、变量定义是否缺失。
4. 绝对禁止：
   - 不要引入 less 模块或写 <style lang="less">。预览运行时没有 less 编译器，任何 import 'less'、import less from 'less'、<style lang="less">、.less 文件引用都会导致预览失败。
   - 样式请用标准 <style scoped> + 纯 CSS，需要的主题变量直接用已注入的 CSS 变量（如 --bg-card、--text-primary）。
5. 不确定时不要乱改，返回你无法安全修复的原因。

## 回复要求
修复完成后，用中文简要返回：
- 诊断结果
- 修改了哪些文件
- 修复点
- 是否建议用户重新加载预览`;
            const result = await this.withTimeout(this.aiChat({
                message,
                componentId,
                selectedFiles,
                history: [],
                llmConfig,
            }), AI_FIX_RENDER_ERROR_TIMEOUT_MS, `AI 自动修复超过 ${Math.round(AI_FIX_RENDER_ERROR_TIMEOUT_MS / 1000)} 秒仍未完成，请查看后端模型配置、额度或稍后重试。`);
            if (!result.success) {
                return {
                    success: false,
                    componentId,
                    summary: result.content,
                    iterations: result.iterations,
                };
            }
            const validation = await this.validateAndSyncAiFix(componentId);
            if (!validation.valid) {
                try {
                    await this.undoModification(componentId);
                }
                catch (undoError) {
                    this.logger.warn(`AI 修复校验失败后撤销失败: ${undoError.message}`);
                }
                return {
                    success: false,
                    componentId,
                    summary: `AI 修复生成了无效组件代码，已尝试撤销本次修改。原因：${validation.error}`,
                    iterations: result.iterations,
                };
            }
            return {
                success: true,
                componentId,
                summary: `${result.content}\n\n校验结果：${validation.message}`,
                iterations: result.iterations,
            };
        }
        finally {
            this.aiFixLocks.delete(componentId);
        }
    }
    async withTimeout(promise, timeoutMs, message) {
        let timer;
        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(message)), timeoutMs);
        });
        try {
            return await Promise.race([promise, timeoutPromise]);
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
    }
    async validateAndSyncAiFix(componentId) {
        const componentDir = await (0, component_resolver_js_1.resolveComponentDirStrict)(componentId);
        if (!componentDir) {
            return { valid: false, error: `组件目录不存在: ${componentId}` };
        }
        const entryPath = (0, fs_1.existsSync)((0, path_1.join)(componentDir, 'package', 'index.vue'))
            ? 'package/index.vue'
            : 'index.vue';
        const sourcePath = (0, path_1.join)(componentDir, entryPath);
        if (!(0, fs_1.existsSync)(sourcePath)) {
            return { valid: false, error: `组件入口文件不存在: ${entryPath}` };
        }
        const content = await (0, promises_1.readFile)(sourcePath, 'utf-8');
        const structureError = this.validateVueSfcStructure(content);
        if (structureError) {
            return { valid: false, error: structureError };
        }
        await this.syncEntryAcrossWorkspace(componentId, entryPath, sourcePath);
        return { valid: true, message: `SFC 结构校验通过，已同步 ${entryPath}` };
    }
    validateVueSfcStructure(content) {
        const templateOpen = content.match(/<template(?:\s[^>]*)?>/);
        const templateClose = content.match(/<\/template>/);
        const scriptOpen = content.match(/<script\s+setup(?:\s[^>]*)?>/);
        const scriptClose = content.match(/<\/script>/);
        const styleOpen = content.match(/<style(?:\s[^>]*)?>/);
        const styleClose = content.match(/<\/style>/);
        if (!templateOpen || !templateClose)
            return '缺少完整的 <template>...</template> 块';
        if (!scriptOpen || !scriptClose)
            return '缺少完整的 <script setup>...</script> 块';
        if (templateOpen.index > templateClose.index)
            return '<template> 闭合顺序错误';
        if (scriptOpen.index > scriptClose.index)
            return '<script setup> 闭合顺序错误';
        if (templateClose.index > scriptOpen.index)
            return '<script setup> 必须位于 template 之后';
        if (styleOpen && styleClose && scriptClose.index > styleOpen.index) {
            return '<style> 必须位于 script 之后';
        }
        const scriptContent = content.slice(scriptOpen.index + scriptOpen[0].length, scriptClose.index);
        if (/^\s*\/\/[^\n]*\n\s*[\w$]+\s*:\s*\{/m.test(scriptContent) && !scriptContent.includes('defineProps({')) {
            return '检测到疑似 props 字段残留，但缺少 defineProps({ 开头';
        }
        if ((scriptContent.match(/defineProps\s*\(\s*\{/g) || []).length > (scriptContent.match(/\}\s*\)/g) || []).length) {
            return 'defineProps({ 可能未正确闭合';
        }
        return null;
    }
    async syncEntryAcrossWorkspace(componentId, entryPath, sourcePath) {
        const sourceContent = await (0, promises_1.readFile)(sourcePath, 'utf-8');
        const candidates = [
            backend_root_js_1.vue3ComponentsDir,
            (0, backend_root_js_1.frontendVue3ComponentsDir)(),
        ];
        for (const base of candidates) {
            let groups = [];
            try {
                groups = await (0, promises_1.readdir)(base, { withFileTypes: true });
            }
            catch {
                continue;
            }
            for (const group of groups) {
                if (!group.isDirectory())
                    continue;
                const targetPath = (0, path_1.join)(base, group.name, componentId, entryPath);
                if (targetPath === sourcePath || !(0, fs_1.existsSync)(targetPath))
                    continue;
                const targetContent = await (0, promises_1.readFile)(targetPath, 'utf-8');
                if (targetContent !== sourceContent) {
                    await (0, promises_1.copyFile)(sourcePath, targetPath);
                    this.logger.log(`AI 修复已同步到 workspace: ${targetPath}`);
                }
            }
        }
    }
    async aiChatStream(params, res) {
        const { message, componentId, selectedFiles = [], attachments = [], history = [], llmConfig = {} } = params;
        this.logger.log(`AI 流式对话: componentId=${componentId}, message=${message.substring(0, 80)}`);
        res.status(200);
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();
        const send = (event, data) => {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };
        try {
            const { hasInitialSnapshot } = await import('../ai-engine/tools/snapshot-manager.js');
            const hasSnap = await hasInitialSnapshot(componentId);
            if (!hasSnap) {
                try {
                    const { takeInitialSnapshot } = await import('../ai-engine/tools/snapshot-manager.js');
                    await takeInitialSnapshot(componentId);
                }
                catch (err) {
                    this.logger.warn(`初始快照创建失败: ${err.message}`);
                }
            }
            const { runPlaygroundAgent } = await import('../ai-engine/graphs/playground-agent-graph.js');
            send('status', { type: 'thinking', message: '正在分析您的请求...' });
            const messageWithVisualContext = await this.buildMessageWithVisualContext({
                message,
                componentId,
                attachments,
                llmConfig,
                onStatus: (statusMessage) => send('status', { type: 'vision', message: statusMessage }),
            });
            send('status', { type: 'thinking', message: '正在结合代码判断...' });
            const result = await runPlaygroundAgent({
                message: messageWithVisualContext,
                componentId,
                selectedFiles,
                attachments,
                history,
                llmConfig,
                callbacks: {
                    onToolCall: (tc) => {
                        send('tool_call', { name: tc.name, args: tc.args });
                    },
                    onToolResult: ({ name, result: toolResult }) => {
                        send('tool_result', { name, success: toolResult?.success ?? true });
                    },
                },
            });
            send('done', {
                content: result.content,
                success: result.success,
                iterations: result.iterations,
                modifiedFiles: result.modifiedFiles || [],
                toolErrors: result.toolErrors || [],
            });
        }
        catch (error) {
            this.logger.error('AI 流式对话失败', { error: error.message });
            send('error', { message: error.message });
        }
        finally {
            res.end();
        }
    }
    async initializeSnapshot(componentId) {
        const result = await (0, snapshot_manager_js_1.takeInitialSnapshot)(componentId);
        return result;
    }
    async undoModification(componentId) {
        const result = await (0, snapshot_manager_js_1.undoLastModification)(componentId);
        return result;
    }
    async restoreInitial(componentId) {
        const result = await (0, snapshot_manager_js_1.restoreToInitial)(componentId);
        return result;
    }
    async getModifications(componentId) {
        const result = await (0, snapshot_manager_js_1.listModifications)(componentId);
        return { modifications: result, count: result.length };
    }
    async downloadComponent(componentId, userId, res) {
        const authorized = await this.componentService.authorizeWorkspaceComponent(componentId, userId, 'read');
        const zipBuffer = await this.phase2Service.packageComponent(authorized.componentId, authorized.target, authorized.groupId);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(authorized.componentId)}.zip"`);
        res.send(zipBuffer);
    }
    async legacyArchiveComponent(componentId, res) {
        const componentDir = await (0, component_resolver_js_1.resolveComponentDirStrict)(componentId);
        if (!componentDir) {
            throw new common_1.NotFoundException(`组件目录不存在: ${componentId}`);
        }
        const archive = new archiver.ZipArchive({ zlib: { level: 9 } });
        archive.on('warning', (err) => {
            if (err.code !== 'ENOENT')
                this.logger.warn(`ZIP warning: ${err.message}`);
        });
        archive.on('error', (err) => {
            this.logger.error(`ZIP error: ${err.message}`);
            res.destroy(err);
        });
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(componentId)}.zip"`);
        archive.pipe(res);
        await this.addComponentDirToArchive(archive, componentDir, componentId);
        archive.finalize();
    }
    async addComponentDirToArchive(archive, dirPath, baseName, relativeBase = '') {
        const entries = await (0, promises_1.readdir)(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            if (SKIP_DIRS.has(entry.name))
                continue;
            const fullPath = (0, path_1.join)(dirPath, entry.name);
            const zipPath = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                await this.addComponentDirToArchive(archive, fullPath, baseName, zipPath);
            }
            else {
                const content = await (0, promises_1.readFile)(fullPath);
                archive.append(content, { name: `${baseName}/${zipPath}` });
            }
        }
    }
};
exports.DemoService = DemoService;
exports.DemoService = DemoService = DemoService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [component_service_1.ComponentService,
        phase2_service_1.Phase2Service,
        chat_attachment_service_1.ChatAttachmentService])
], DemoService);
//# sourceMappingURL=demo.service.js.map