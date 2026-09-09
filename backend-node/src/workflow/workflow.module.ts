import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { ProgressModule } from '../progress/progress.module';
import { TasksModule } from '../tasks/tasks.module';
import { Phase2Module } from '../phase2/phase2.module';
import { AgentBuilderModule } from '../agent-builder/agent-builder.module';

@Module({
  imports: [ProgressModule, TasksModule, Phase2Module, AgentBuilderModule],
  controllers: [WorkflowController],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
