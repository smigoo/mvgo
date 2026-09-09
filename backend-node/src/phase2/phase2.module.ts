import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Phase2Controller } from './phase2.controller';
import { Phase2Service } from './phase2.service';
import { DocAnalyzerService } from './doc/doc-analyzer.service.js';
import { UiCacheService } from './ui-cache.service.js';
import { TasksModule } from '../tasks/tasks.module';
import { ProgressModule } from '../progress/progress.module';
import { ComponentModule } from '../component/component.module';
import { GroupMember, GroupMemberSchema } from '../schemas/group-member.schema';
import { AiConfigModule } from '../config/config.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    TasksModule,
    ProgressModule,
    forwardRef(() => ComponentModule),
    AiConfigModule,
    QueueModule,
    MongooseModule.forFeature([
      { name: GroupMember.name, schema: GroupMemberSchema },
    ]),
  ],
  controllers: [Phase2Controller],
  providers: [Phase2Service, DocAnalyzerService, UiCacheService],
  exports: [Phase2Service, DocAnalyzerService, UiCacheService],
})
export class Phase2Module {}
