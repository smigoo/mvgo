import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  OperationLog,
  OperationLogSchema,
} from './operation-log.schema';
import { OperationLogService } from './operation-log.service';

/**
 * 操作日志模块。
 * - 注册 OperationLog 集合（写入由全局拦截器 fire-and-forget 到 Java）；
 * - 导出 OperationLogService 供全局拦截器（app.module APP_INTERCEPTOR）写入。
 * - 读接口已迁移至 Java（/api/operation-log），不再在此依赖 User 集合。
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OperationLog.name, schema: OperationLogSchema },
    ]),
  ],
  providers: [OperationLogService],
  exports: [OperationLogService],
})
export class OperationLogModule {}
