import { Module } from '@nestjs/common';
import { AgentBuilderController } from './agent-builder.controller';
import { AgentBuilderService } from './agent-builder.service';

@Module({
  controllers: [AgentBuilderController],
  providers: [AgentBuilderService],
  exports: [AgentBuilderService],
})
export class AgentBuilderModule {}
