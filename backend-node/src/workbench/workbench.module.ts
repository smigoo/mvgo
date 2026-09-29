import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkbenchController } from './workbench.controller';
import { WorkbenchService } from './workbench.service';
import { Conversation, ConversationSchema } from './conversation.schema';
import { WorkbenchGroup, WorkbenchGroupSchema } from './group.schema';
import { TasksModule } from '../tasks/tasks.module';
import { ComponentModule } from '../component/component.module';
import { TaskStatsModule } from '../task-stats/task-stats.module';
import { AiConfigModule } from '../config/config.module';
import { Phase2Module } from '../phase2/phase2.module';
import { LiteModule } from '../lite/lite.module';
import { QueueModule } from '../queue/queue.module';
import { ProgressModule } from '../progress/progress.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: WorkbenchGroup.name, schema: WorkbenchGroupSchema },
    ]),
    TasksModule,
    ComponentModule,
    TaskStatsModule,
    AiConfigModule,
    Phase2Module,
    LiteModule,
    QueueModule,
    ProgressModule,
  ],
  controllers: [WorkbenchController],
  providers: [WorkbenchService],
  exports: [WorkbenchService],
})
export class WorkbenchModule {}
