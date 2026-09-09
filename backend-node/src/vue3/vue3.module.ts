import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Vue3Controller } from './vue3.controller';
import { Vue3Service } from './vue3.service';
import { SlotAnalyzerService } from './slot-analyzer.service';
import { DocAnalyzerService } from './doc-analyzer.service';
import { ApiBindingService } from './api-binding.service';
import { ApiBindingPreflightService } from './api-binding-preflight.service';
import { WorkspaceTransactionService } from './workspace-transaction.service';
import { IncrementalFileCleanupService } from './incremental-file-cleanup.service';
import { TasksModule } from '../tasks/tasks.module';
import { ProgressModule } from '../progress/progress.module';
import { ComponentModule } from '../component/component.module';
import { ApifoxModule } from '../apifox/apifox.module';
import { GroupMember, GroupMemberSchema } from '../schemas/group-member.schema';
import { AiConfigModule } from '../config/config.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    TasksModule,
    ProgressModule,
    forwardRef(() => ComponentModule),
    ApifoxModule,
    AiConfigModule,
    QueueModule,
    MongooseModule.forFeature([
      { name: GroupMember.name, schema: GroupMemberSchema },
    ]),
  ],
  controllers: [Vue3Controller],
  providers: [
    Vue3Service,
    SlotAnalyzerService,
    DocAnalyzerService,
    ApiBindingService,
    ApiBindingPreflightService,
    IncrementalFileCleanupService,
    WorkspaceTransactionService,
  ],
  exports: [Vue3Service, SlotAnalyzerService, DocAnalyzerService, ApiBindingService],
})
export class Vue3Module {}
