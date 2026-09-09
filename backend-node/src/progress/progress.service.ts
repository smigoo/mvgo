import { Injectable, Logger, Inject, Optional, forwardRef } from '@nestjs/common';
import { Response } from 'express';
import { TasksService } from '../tasks/tasks.service';
import { TaskQueueService } from '../queue/task-queue.service';
import { redactSecrets } from '../common/utils/redact';
import { getSessionModel } from '../ai-engine/utils/session-model.js';

@Injectable()
export class ProgressService {
  private readonly logger = new Logger(ProgressService.name);
  // 🔧 修复：同一 session 支持多个并发 SSE 连接（GeneratorForm + Logs 页可能同时订阅）
  // 用 Set 存储，避免单值 Map 被后建立的连接覆盖导致前一个连接被孤儿化
  private sessions: Map<string, Set<Response>> = new Map();
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();
  private eventSequences: Map<string, number> = new Map();
  private eventHistory: Map<string, Array<{ seq: number; data: any }>> = new Map();
  private readonly maxHistoryPerSession = 120;
  
  // 队列服务引用（直接注入，两个服务都是全局模块）
  private queueService: TaskQueueService;

  constructor(
    private readonly tasksService: TasksService,
    @Optional() @Inject(forwardRef(() => TaskQueueService)) queueService?: TaskQueueService
  ) {
    // v2: 同一 session 支持多并发连接（Set 广播），避免双页面订阅互相 clobber
    this.logger.log('[SSE] ProgressService 已加载多连接广播模式 (v2)')
    if (queueService) {
      this.queueService = queueService;
      this.logger.log('[SSE] 队列服务已注入，任务完成时将自动调度等待任务');
    }
  }
  
  /**
   * 设置队列服务引用（兼容旧代码）
   */
  setQueueService(queueService: TaskQueueService): void {
    this.queueService = queueService;
    this.logger.log('[SSE] 队列服务已注入，任务完成时将自动调度等待任务');
  }

  /**
   * 注册SSE连接（支持重连）
   */
  register(sessionId: string, res: Response, lastEventId?: string): Response {
    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 检查是否是重连
    const existingTask = this.tasksService.getTask(sessionId);
    const isReconnect = !!existingTask;

    const parsedLastEventId = Number.parseInt(String(lastEventId || ''), 10);
    const history = this.eventHistory.get(sessionId) || [];
    const oldestSeq = history[0]?.seq;
    const latestSeq = history.at(-1)?.seq;
    const hasEventGap = Number.isFinite(parsedLastEventId)
      && parsedLastEventId > 0
      && (
        oldestSeq === undefined
        || parsedLastEventId < oldestSeq - 1
        || (latestSeq !== undefined && parsedLastEventId > latestSeq)
      );

    // SSE 事件使用稳定 id，浏览器原生 EventSource 重连时会自动带回 Last-Event-ID。
    this.sendEvent(res, {
      type: 'connected',
      sessionId,
      isReconnect,
      timestamp: Date.now(),
    });

    if (hasEventGap) {
      this.sendEvent(res, {
        type: 'snapshot-resync',
        reason: 'event-gap',
        lastEventId: parsedLastEventId,
        oldestAvailableSeq: oldestSeq,
        timestamp: Date.now(),
      });
    } else if (Number.isFinite(parsedLastEventId)) {
      for (const event of history) {
        if (event.seq > parsedLastEventId) this.sendEvent(res, event.data, event.seq);
      }
    }

    // 如果是重连，发送任务当前状态
    if (isReconnect) {
      this.sendEvent(res, {
        type: 'task-status',
        status: existingTask.status,
        progressCount: existingTask.progressCount,
        timestamp: Date.now(),
      });

      // 任务已是终态：主动推送终态事件给重连客户端
      if (existingTask.status === 'completed' && existingTask.result) {
        this.sendEvent(res, {
          type: 'complete',
          ...existingTask.result,
          timestamp: Date.now(),
        });
        res.end();
        return res;
      } else if (existingTask.status === 'failed') {
        this.sendEvent(res, {
          type: 'error',
          message: existingTask.error || '任务失败',
          timestamp: Date.now(),
        });
        res.end();
        return res;
      } else if (existingTask.status === 'cancelled') {
        this.sendEvent(res, {
          type: 'progress',
          stage: 'cancelled',
          status: 'cancelled',
          message: '🛑 任务已被用户终止',
          timestamp: Date.now(),
        });
        res.end();
        return res;
      }

      // 仍在running：发送缓冲的进度更新
      const bufferedProgress = this.tasksService.clearBuffer(sessionId);
      for (const progress of bufferedProgress) {
        if (progress?.type === 'code-snapshot' && Number.isFinite(parsedLastEventId)) {
          // 带 Last-Event-ID 的重连已由 revision 事件历史或 snapshot-resync 处理，
          // 不再从通用 task buffer 重复发送同一批快照通知。
          continue;
        }
        this.sendEvent(res, {
          type: 'progress',
          ...progress,
        });
      }
    }

    // 保存连接（支持同一 session 多个并发连接）
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, new Set());
    }
    this.sessions.get(sessionId)!.add(res);

    // 🆕 启动心跳（每5秒发送keep-alive ping，防止长时间无进度导致连接断开）
    // 心跳按 session 只启动一个定时器，向该 session 的所有连接广播
    if (!this.heartbeatIntervals.has(sessionId)) {
      const heartbeatInterval = setInterval(() => {
        const conns = this.sessions.get(sessionId);
        if (conns && conns.size > 0) {
          for (const activeRes of conns) {
            this.sendEvent(activeRes, {
              type: 'keep-alive',
              timestamp: Date.now(),
            });
          }
        }
      }, 5000);
      this.heartbeatIntervals.set(sessionId, heartbeatInterval);
    }

    // 监听客户端断开连接（仅移除当前这个 res，不影响同 session 的其他连接）
    res.on('close', () => {
      const conns = this.sessions.get(sessionId);
      if (conns) {
        conns.delete(res);
        // 所有连接都关闭后才清理 session 与心跳
        if (conns.size === 0) {
          this.sessions.delete(sessionId);
          const interval = this.heartbeatIntervals.get(sessionId);
          if (interval) {
            clearInterval(interval);
            this.heartbeatIntervals.delete(sessionId);
          }
        }
      }
      this.logger.debug(`SSE connection closed for session: ${sessionId}`);
    });

    return res;
  }

  private recordEvent(sessionId: string, data: any): { seq: number; data: any } {
    const seq = (this.eventSequences.get(sessionId) || 0) + 1;
    this.eventSequences.set(sessionId, seq);
    const event = { seq, data: { ...data, seq } };
    const history = this.eventHistory.get(sessionId) || [];
    history.push(event);
    if (history.length > this.maxHistoryPerSession) history.splice(0, history.length - this.maxHistoryPerSession);
    this.eventHistory.set(sessionId, history);
    return event;
  }

  /**
   * 发送事件到客户端
   */
  private sendEvent(res: Response, data: any, seq?: number): void {
    try {
      const eventId = seq ?? data?.seq;
      const message = `${eventId !== undefined ? `id: ${eventId}\n` : ''}data: ${JSON.stringify(data)}\n\n`;
      // 防御性检查：确保 res 是有效的 Response 对象
      if (typeof res.write !== 'function') {
        this.logger.error(`[sendEvent] res.write 不是函数！res 类型: ${typeof res}, constructor: ${res?.constructor?.name}, data.type: ${data.type}`);
        return;
      }
      res.write(message);
      // 强制刷新缓冲区，确保 SSE 消息立即到达客户端
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    } catch (err: any) {
      // SSE 写入失败不抛异常（避免中断任务执行），仅记录
      this.logger.warn(`[sendEvent] SSE 写入失败: ${err.message}`, { dataType: data.type });
    }
  }

  /**
   * 发送进度更新（同时保存到任务状态）
   */
  sendProgress(sessionId: string, progressData: any): void {
    // 🔧 路由分流：网关 LLM 心跳等「子调用」事件携带 level:'log' 标记时，
    // 走日志通道（sendLog）而非生成独立 timeline 步骤。
    // 这样网关的瞬时心跳（vision-agent.analyzeImage 等）只进日志区，
    // 不再污染前端 timeline（避免步骤膨胀与僵尸 running 阶段）。
    // 有父 stage 的 graph 管线仍由 graph 节点推真实中文 stage，进度不丢失。
    if (progressData && progressData.level === 'log') {
      this.sendLog(
        sessionId,
        progressData.logLevel || 'info',
        progressData.message || '',
        {
          stage: progressData.stage,
          context: progressData.context ?? progressData.stage,
          elapsedSec: progressData.elapsedSec,
          source: 'gateway-heartbeat',
        },
      );
      return;
    }

    // 1. 保存到任务状态（无论是否有连接），标记 type 以便前端区分 progress vs log
    // 🛡️ 持久化与 SSE 广播使用同一 timestamp（此前持久化不带，前端 replayKey 两侧对不上）
    const _progressTimestamp = progressData?.timestamp ?? Date.now();
    this.tasksService.addProgress(sessionId, {
      type: 'progress',
      ...progressData,
      timestamp: _progressTimestamp,
    });

    // 2. 向该 session 的所有活动连接广播。进度由 TasksService.buffer 恢复，
    // 不进入 revision 专用事件历史，避免重连时重复回放。
    const conns = this.sessions.get(sessionId);
    if (conns) {
      for (const res of conns) {
        this.sendEvent(res, {
          type: 'progress',
          ...progressData,
          timestamp: _progressTimestamp,
        });
      }
    }
  }

  /**
   * 通知前端有新的代码快照可拉取。只发送 revision 元数据，不通过 SSE 传源码。
   */
  sendCodeSnapshot(sessionId: string, snapshotData: any): void {
    const safeData = {
      type: 'code-snapshot',
      revision: snapshotData.revision,
      status: snapshotData.status,
      stage: snapshotData.stage,
      fileCount: snapshotData.fileCount,
      changedFiles: Array.isArray(snapshotData.changedFiles)
        ? snapshotData.changedFiles.slice(0, 50)
        : [],
      lastGoodRevision: snapshotData.lastGoodRevision,
      timestamp: Date.now(),
    };
    const event = this.recordEvent(sessionId, safeData);
    this.tasksService.addProgress(sessionId, event.data);
    const conns = this.sessions.get(sessionId);
    if (conns) {
      for (const res of conns) this.sendEvent(res, event.data, event.seq);
    }
  }

  /**
   * 推送文件生命周期事件（模型此刻正在解析/写入/校验哪些文件）。
   * 这是瞬态状态：只广播给当前在线连接，不进入 revision 事件历史、不持久化到 task buffer，
   * 因此重连不会回放旧的文件状态；重连客户端通过 snapshot-resync 重新拉取最新 revision 后，
   * 所有文件默认回落到「未变化」，等待新的 file-lifecycle 事件刷新。
   * 安全边界：事件只携带路径与状态，源码仍只通过受保护的 revision API 获取，不执行半成品。
   */
  sendFileLifecycle(sessionId: string, lifecycleData: any): void {
    const conns = this.sessions.get(sessionId);
    if (!conns || conns.size === 0) return;
    const files = Array.isArray(lifecycleData?.files)
      ? lifecycleData.files
          .filter((f: any) => f && typeof f.path === 'string')
          .map((f: any) => ({ path: f.path, state: f.state || 'working' }))
          .slice(0, 200)
      : [];
    const safeData = {
      type: 'file-lifecycle',
      phase: typeof lifecycleData?.phase === 'string' ? lifecycleData.phase : 'working',
      summary: typeof lifecycleData?.summary === 'string' ? lifecycleData.summary : '',
      files,
      timestamp: Date.now(),
    };
    for (const res of conns) {
      this.sendEvent(res, safeData);
    }
  }

  /**
   * 发送日志消息
   */
  sendLog(
    sessionId: string,
    level: string,
    message: string,
    meta: any = {},
  ): void {
    // 🛡️ 统一走 recordEvent（带 seq + 事件历史）：
    //  1. SSE 断线重连时浏览器带 Last-Event-ID，seq 事件可回放——此前 sendLog 不进
    //     recordEvent，断线窗口内的日志永久丢失（前端表现为"日志冻结，刷新才出现"，
    //     数据采集阶段事件密集、连接易断，高发）。
    //  2. 持久化与 SSE 广播使用同一 timestamp——此前持久化不带 timestamp，前端
    //     replayKey（含 timestamp）两侧永远对不上（去重失效），且历史日志时间
    //     被 createTaskLogEntry 兜底成"打开页面时刻"。
    const data = {
      type: 'log',
      level,
      message,
      meta,
      timestamp: Date.now(),
    };

    // 📊 自动附加当前会话使用的模型（供前端渲染 [model] 标签）。
    // 模型由 ai-request-gateway 在每次 LLM 调用后登记到会话级注册表，
    // 业务模块无需逐条传 meta.model。仅在调用方未显式指定时补全。
    // 🔧 2026-08-27 #275-3 修复：补全必须限定「LLM 调用相关日志」——
    // 旧逻辑对**所有**日志补会话模型，导致 `[deepseek-v4-pro] 节点执行成功` 这种
    // 非 LLM 节点日志也被打标（节点执行与模型无关，且标签随会话最后模型漂移，误导）。
    // 判据：meta.logger 命中 LLM 角色名单（gateway/agent/validator 等），graph/Phase2Service 不补。
    if (!data.meta || typeof data.meta !== 'object') data.meta = {};
    if (!data.meta.model) {
      const LLM_LOGGER_RE =
        /(microcode-engineer|vue3-engineer|vision-agent|layout-reviewer|style-mapper|ai-request-gateway|llm-timeout|refine|validator|decomposer|planner)/i;
      const loggerName = String(data.meta.logger || '');
      if (LLM_LOGGER_RE.test(loggerName) || data.meta.stage || data.meta.context) {
        const m = getSessionModel(sessionId);
        if (m) data.meta = { ...data.meta, model: m };
      }
    }
    const event = this.recordEvent(sessionId, data);
    this.tasksService.addProgress(sessionId, event.data);

    const conns = this.sessions.get(sessionId);
    if (conns) {
      for (const res of conns) {
        this.sendEvent(res, event.data, event.seq);
      }
    }
  }


  /**
   * 发送完成消息
   */
  async sendComplete(sessionId: string, result: any): Promise<void> {
    // 1. 标记任务完成（持久化用原始结果）
    this.tasksService.completeTask(sessionId, result);

    // 🔒 广播前脱敏：剥离 figmaToken / aiApiKey 等密钥明文
    const safeResult = redactSecrets(result);

    // 2. 向所有连接广播完成消息并关闭
    const conns = this.sessions.get(sessionId);
    if (conns) {
      for (const res of conns) {
        this.sendEvent(res, {
          type: 'complete',
          ...safeResult,
          timestamp: Date.now(),
        });
        res.end();
      }
      this.sessions.delete(sessionId);
      const interval = this.heartbeatIntervals.get(sessionId);
      if (interval) {
        clearInterval(interval);
        this.heartbeatIntervals.delete(sessionId);
      }
    }
    
    // 3. 通知队列释放槽位，调度等待任务
    if (this.queueService) {
      try {
        await this.queueService.markTaskCompleted(sessionId);
      } catch (err: any) {
        this.logger.warn(`释放队列槽位失败: ${err.message}`);
      }
    }
  }

  /**
   * 发送错误消息
   */
  async sendError(sessionId: string, error: any): Promise<void> {
    // 1. 标记任务失败
    this.tasksService.failTask(sessionId, error);

    // 1.5 🔧 透传 stack 便于排查：SSE 负载附带 stack，且服务端日志落 stack（避免黑盒）
    const errStack = (error && typeof error === 'object' && error.stack) || undefined;
    this.logger.error(
      `[SSE] sendError for session ${sessionId}: ${error?.message || error}`,
      errStack,
    );

    // 2. 向所有连接广播错误消息并关闭
    const conns = this.sessions.get(sessionId);
    if (conns) {
      for (const res of conns) {
        this.sendEvent(res, {
          type: 'error',
          message: error?.friendlyMessage || error?.message || error,
          stack: errStack,
          timestamp: Date.now(),
        });
        res.end();
      }
      this.sessions.delete(sessionId);
      const interval = this.heartbeatIntervals.get(sessionId);
      if (interval) {
        clearInterval(interval);
        this.heartbeatIntervals.delete(sessionId);
      }
    }
    
    // 3. 通知队列释放槽位
    if (this.queueService) {
      try {
        await this.queueService.markTaskFailed(sessionId);
      } catch (err: any) {
        this.logger.warn(`[ProgressService] 通知队列任务失败失败: ${err.message}`);
      }
    }
  }

  /**
   * 关闭连接（关闭该 session 的所有连接）
   */
  close(sessionId: string): void {
    const conns = this.sessions.get(sessionId);
    if (conns) {
      for (const res of conns) {
        res.end();
      }
      this.sessions.delete(sessionId);
      const interval = this.heartbeatIntervals.get(sessionId);
      if (interval) {
        clearInterval(interval);
        this.heartbeatIntervals.delete(sessionId);
      }
    }
  }
}
