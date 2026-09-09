import { Module, Global } from '@nestjs/common';
import { TaskQueueService } from './task-queue.service';
import { QuotaModule } from '../quota/quota.module';

@Global()
@Module({
  imports: [QuotaModule],
  providers: [TaskQueueService],
  exports: [TaskQueueService],
})
export class QueueModule {}
