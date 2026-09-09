import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
const archiver = require('archiver');
import { readdir, stat, readFile, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, relative, sep } from 'path';
import { ComponentService } from '../component/component.service';
import { Phase2Service } from '../phase2/phase2.service';
import { ChatAttachmentService } from './chat-attachment.service';
import { AIMessage } from '@langchain/core/messages';
import {
  takeInitialSnapshot,
  undoLastModification,
  restoreToInitial,
  listModifications,
  hasInitialSnapshot,
} from '../ai-engine/tools/snapshot-manager.js';
import { resolveComponentDir } from '../ai-engine/utils/component-resolver.js';
import { vue3ComponentsDir, frontendVue3ComponentsDir } from '../config/backend-root.js';

const SKIP_DIRS = new Set(['.snapshots', '.backups', '.mc-gen', 'node_modules', '.git']);
const AI_FIX_RENDER_ERROR_TIMEOUT_MS = 180_000;

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);
  // 同一组件正在进行的 AI 修复任务锁（防止并发 Agent 竞争写同一文件）
  private readonly aiFixLocks = new Set<string>();

  constructor(
    private readonly componentService: ComponentService,
    private readonly phase2Service: Phase2Service,
    private readonly chatAttachmentService: ChatAttachmentService,
  ) {}

  /**
   * AI 对话式修改组件代码
   */
  async aiChat(params: {
    message: string;
    componentId: string;
    selectedFiles?: any[];
    attachments?: any[];
    history?: any[];
    llmConfig?: { apiKey?: string; baseURL?: string; model?: string };
  }) {
    const { message, componentId, selectedFiles = [], attachments = [], history = [], llmConfig = {} } = params;

    this.logger.log(`AI 对话请求: componentId=${componentId}, message=${message.substring(0, 80)}`);

    // 确保有初始快照
    const hasSnap = await hasInitialSnapshot(componentId);
    if (!hasSnap) {
      try {
        await takeInitialSnapshot(componentId);
      } catch (err) {
        this.logger.warn(`初始快照创建失败: ${err.message}`);
      }
    }

    const messageWithVisualContext = await this.buildMessageWithVisualContext({
      message,
      componentId,
      attachments,
      llmConfig,
    });

    // 动态导入 Agent 图（与 phase2.service 同模式）
    const { runPlaygroundAgent } = await import(
      '../ai-engine/graphs/playground-agent-graph.js'
    );

    const result = await runPlaygroundAgent({
      message: messageWithVisualContext,
      componentId,
      selectedFiles,
      attachments,
      history,
      llmConfig,
      callbacks: {
        onToolCall: (tc: any) => {
          this.logger.log(`工具调用: ${tc.name}`);
        },
        onToolResult: ({ name, result }: any) => {
          this.logger.log(`工具结果: ${name} → success=${result?.success ?? true}`);
        },
      },
    });

    return result;
  }

  private async buildMessageWithVisualContext(params: {
    message: string;
    componentId: string;
    attachments?: any[];
    llmConfig?: { apiKey?: string; baseURL?: string; model?: string };
    onStatus?: (message: string) => void;
  }): Promise<string> {
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
    } catch (error) {
      this.logger.warn(`截图分析失败，降级按文字处理: ${error.message}`);
      return `${message}\n\n## 截图分析结果\n截图分析失败：${error.message}。请先根据用户文字和已选文件处理；如果信息不足，要求用户补充截图中的关键现象。`;
    }
  }

  /**
   * AI 修复组件预览渲染错误。
   *
   * 这是预览页错误卡片的专用入口：复用 Playground Agent 和 write_file 快照能力，
   * 但用更严格的提示词约束修复范围，避免把普通聊天式需求和错误恢复混在一起。
   */
  async aiFixRenderError(params: {
    componentId: string;
    groupId?: string;
    errorMessage: string;
    stack?: string;
    info?: string;
    llmConfig?: { apiKey?: string; baseURL?: string; model?: string };
  }) {
    const { componentId, groupId = '', errorMessage, stack = '', info = '', llmConfig = {} } = params;

    // ── 并发互斥：同一组件只允许一个 AI 修复任务进行，避免两个 Agent 竞争写同一文件 ──
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

    const result = await this.withTimeout(
      this.aiChat({
        message,
        componentId,
        selectedFiles,
        history: [],
        llmConfig,
      }),
      AI_FIX_RENDER_ERROR_TIMEOUT_MS,
      `AI 自动修复超过 ${Math.round(AI_FIX_RENDER_ERROR_TIMEOUT_MS / 1000)} 秒仍未完成，请查看后端模型配置、额度或稍后重试。`,
    );

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
      } catch (undoError) {
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
  } finally {
    // 无论成功/失败/异常，都释放该组件的修复锁
    this.aiFixLocks.delete(componentId);
  }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async validateAndSyncAiFix(componentId: string): Promise<{
    valid: boolean;
    message?: string;
    error?: string;
  }> {
    const componentDir = await resolveComponentDir(componentId);
    if (!componentDir) {
      return { valid: false, error: `组件目录不存在: ${componentId}` };
    }

    const entryPath = existsSync(join(componentDir, 'package', 'index.vue'))
      ? 'package/index.vue'
      : 'index.vue';
    const sourcePath = join(componentDir, entryPath);
    if (!existsSync(sourcePath)) {
      return { valid: false, error: `组件入口文件不存在: ${entryPath}` };
    }

    const content = await readFile(sourcePath, 'utf-8');
    const structureError = this.validateVueSfcStructure(content);
    if (structureError) {
      return { valid: false, error: structureError };
    }

    await this.syncEntryAcrossWorkspace(componentId, entryPath, sourcePath);
    return { valid: true, message: `SFC 结构校验通过，已同步 ${entryPath}` };
  }

  private validateVueSfcStructure(content: string): string | null {
    const templateOpen = content.match(/<template(?:\s[^>]*)?>/);
    const templateClose = content.match(/<\/template>/);
    const scriptOpen = content.match(/<script\s+setup(?:\s[^>]*)?>/);
    const scriptClose = content.match(/<\/script>/);
    const styleOpen = content.match(/<style(?:\s[^>]*)?>/);
    const styleClose = content.match(/<\/style>/);

    if (!templateOpen || !templateClose) return '缺少完整的 <template>...</template> 块';
    if (!scriptOpen || !scriptClose) return '缺少完整的 <script setup>...</script> 块';
    if (templateOpen.index! > templateClose.index!) return '<template> 闭合顺序错误';
    if (scriptOpen.index! > scriptClose.index!) return '<script setup> 闭合顺序错误';
    if (templateClose.index! > scriptOpen.index!) return '<script setup> 必须位于 template 之后';
    if (styleOpen && styleClose && scriptClose.index! > styleOpen.index!) {
      return '<style> 必须位于 script 之后';
    }

    const scriptContent = content.slice(scriptOpen.index! + scriptOpen[0].length, scriptClose.index!);
    if (/^\s*\/\/[^\n]*\n\s*[\w$]+\s*:\s*\{/m.test(scriptContent) && !scriptContent.includes('defineProps({')) {
      return '检测到疑似 props 字段残留，但缺少 defineProps({ 开头';
    }
    if ((scriptContent.match(/defineProps\s*\(\s*\{/g) || []).length > (scriptContent.match(/\}\s*\)/g) || []).length) {
      return 'defineProps({ 可能未正确闭合';
    }
    return null;
  }

  private async syncEntryAcrossWorkspace(
    componentId: string,
    entryPath: string,
    sourcePath: string,
  ): Promise<void> {
    const sourceContent = await readFile(sourcePath, 'utf-8');
    const candidates = [
      vue3ComponentsDir,
      frontendVue3ComponentsDir(),
    ];

    for (const base of candidates) {
      let groups: any[] = [];
      try {
        groups = await readdir(base, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const group of groups) {
        if (!group.isDirectory()) continue;
        const targetPath = join(base, group.name, componentId, entryPath);
        if (targetPath === sourcePath || !existsSync(targetPath)) continue;
        const targetContent = await readFile(targetPath, 'utf-8');
        if (targetContent !== sourceContent) {
          await copyFile(sourcePath, targetPath);
          this.logger.log(`AI 修复已同步到 workspace: ${targetPath}`);
        }
      }
    }
  }

  /**
   * AI 对话式修改（SSE 流式返回）
   */
  async aiChatStream(
    params: {
      message: string;
      componentId: string;
      selectedFiles?: any[];
      attachments?: any[];
      history?: any[];
      llmConfig?: { apiKey?: string; baseURL?: string; model?: string };
    },
    res: Response,
  ) {
    const { message, componentId, selectedFiles = [], attachments = [], history = [], llmConfig = {} } = params;

    this.logger.log(`AI 流式对话: componentId=${componentId}, message=${message.substring(0, 80)}`);

    // 设置 SSE 头。POST 默认 201 会让部分 HTTP/2 代理/浏览器流式响应异常，必须显式使用 200。
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // 确保有初始快照
      const { hasInitialSnapshot } = await import('../ai-engine/tools/snapshot-manager.js');
      const hasSnap = await hasInitialSnapshot(componentId);
      if (!hasSnap) {
        try {
          const { takeInitialSnapshot } = await import('../ai-engine/tools/snapshot-manager.js');
          await takeInitialSnapshot(componentId);
        } catch (err) {
          this.logger.warn(`初始快照创建失败: ${err.message}`);
        }
      }

      const { runPlaygroundAgent } = await import(
        '../ai-engine/graphs/playground-agent-graph.js'
      );

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
          onToolCall: (tc: any) => {
            send('tool_call', { name: tc.name, args: tc.args });
          },
          onToolResult: ({ name, result: toolResult }: any) => {
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
    } catch (error) {
      this.logger.error('AI 流式对话失败', { error: error.message });
      send('error', { message: error.message });
    } finally {
      res.end();
    }
  }

  /**
   * 拍摄初始快照
   */
  async initializeSnapshot(componentId: string) {
    const result = await takeInitialSnapshot(componentId);
    return result;
  }

  /**
   * 单步后退 — 撤销最近一次 AI 修改
   */
  async undoModification(componentId: string) {
    const result = await undoLastModification(componentId);
    return result;
  }

  /**
   * 全量恢复 — 回到初始状态
   */
  async restoreInitial(componentId: string) {
    const result = await restoreToInitial(componentId);
    return result;
  }

  /**
   * 获取修改历史
   */
  async getModifications(componentId: string) {
    const result = await listModifications(componentId);
    return { modifications: result, count: result.length };
  }

  /**
   * 下载组件为 ZIP
   */
  async downloadComponent(componentId: string, userId: string, res: Response) {
    const authorized = await this.componentService.authorizeWorkspaceComponent(
      componentId,
      userId,
      'read',
    );
    const zipBuffer = await this.phase2Service.packageComponent(
      authorized.componentId,
      authorized.target,
      authorized.groupId,
    );

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(authorized.componentId)}.zip"`,
    );
    res.send(zipBuffer);
  }

  private async legacyArchiveComponent(componentId: string, res: Response) {
    const componentDir = await resolveComponentDir(componentId);
    if (!componentDir) {
      throw new NotFoundException(`组件目录不存在: ${componentId}`);
    }

    const archive = new archiver.ZipArchive({ zlib: { level: 9 } });

    archive.on('warning', (err: any) => {
      if (err.code !== 'ENOENT') this.logger.warn(`ZIP warning: ${err.message}`);
    });
    archive.on('error', (err: any) => {
      this.logger.error(`ZIP error: ${err.message}`);
      res.destroy(err);
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(componentId)}.zip"`,
    );

    archive.pipe(res);

    // 递归添加文件（排除 .snapshots/.backups/node_modules/.git）
    await this.addComponentDirToArchive(archive, componentDir, componentId);

    archive.finalize();
  }

  /**
   * 递归将组件目录文件添加到 ZIP 归档
   */
  private async addComponentDirToArchive(
    archive: any,
    dirPath: string,
    baseName: string,
    relativeBase = '',
  ) {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const fullPath = join(dirPath, entry.name);
      const zipPath = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        await this.addComponentDirToArchive(archive, fullPath, baseName, zipPath);
      } else {
        const content = await readFile(fullPath);
        archive.append(content, { name: `${baseName}/${zipPath}` });
      }
    }
  }
}
