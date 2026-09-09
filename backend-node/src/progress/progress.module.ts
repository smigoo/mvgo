import { Module, Global } from '@nestjs/common';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

@Global() // 全局模块，其他模块可以直接注入ProgressService
@Module({
  controllers: [ProgressController],
  // ⚠️ 不要在 providers 里重复声明 TaskQueueService：
  // QueueModule（@Global）已提供并导出单例，这里再注册会 new 出第二个实例，
  // 导致 ProgressService 的 markTaskCompleted/markTaskFailed 永远落在空 runningTasks 上，
  // phase2/vue3 任务完成后并发槽位永不释放 → 新任务排队（"未找到条目" + 幽灵占槽）。
  providers: [ProgressService],
  exports: [ProgressService], // 导出供其他模块使用
})
export class ProgressModule {}
