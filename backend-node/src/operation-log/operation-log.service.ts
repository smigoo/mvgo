import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import {
  OperationLog,
  OperationLogDocument,
} from './operation-log.schema';
import { getJavaBackendUrl } from '../config/runtime-env';

/** Java 后端地址（审计日志写入目标）；统一从 runtime-env 读取 */
const JAVA_BACKEND_URL = getJavaBackendUrl();

/**
 * 操作日志服务。
 * - record(): 由全局拦截器 fire-and-forget 调用，写入失败仅告警不抛错（不阻塞业务响应）。
 * - 读接口已迁移至 Java（/api/operation-log，统一 Result<T> 规范）。
 */
@Injectable()
export class OperationLogService {
  private readonly logger = new Logger(OperationLogService.name);

  constructor(
    @InjectModel(OperationLog.name)
    private readonly model: Model<OperationLogDocument>,
  ) {}

  /** 写入一条操作日志（拦截器侧无需 await，失败仅告警）。
   *  改为异步 POST 到 Java 后端（审计日志归属 Java），脱敏与 userId 解析已在拦截器完成。 */
  record(entry: {
    userId?: string | null;
    method: string;
    path: string;
    query?: Record<string, any>;
    body?: Record<string, any>;
    statusCode: number;
    ip?: string;
    durationMs: number;
    userAgent?: string;
    errorMessage?: string;
  }): Promise<void> {
    const payload = {
      userId: entry.userId ?? null,
      method: entry.method,
      path: entry.path,
      query: entry.query ?? undefined,
      body: entry.body ?? undefined,
      statusCode: entry.statusCode,
      ip: entry.ip,
      durationMs: entry.durationMs,
      userAgent: entry.userAgent,
      errorMessage: entry.errorMessage,
    };
    // fire-and-forget：不阻塞响应链路，失败仅告警
    return axios
      .post(`${JAVA_BACKEND_URL}/operation-log`, payload, { timeout: 5000 })
      .catch((err) => {
        this.logger.warn(
          `[OperationLogService] 写入操作日志到 Java 失败: ${
            (err as Error)?.message || err
          }`,
        );
      })
      .then(() => undefined);
  }
}
