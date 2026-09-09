import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ComponentController } from './component.controller';
import { ComponentService } from './component.service';
import { GitlabPushService } from './gitlab-push.service';
import { ComponentAnalysisService } from './component-analysis.service';
import { Component, ComponentSchema } from '../schemas/component.schema';
import { GroupMember, GroupMemberSchema } from '../schemas/group-member.schema';
import { AuthModule } from '../auth/auth.module';
import { Phase2Module } from '../phase2/phase2.module';
import { TasksModule } from '../tasks/tasks.module';
import { AiConfigModule } from '../config/config.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Component.name, schema: ComponentSchema },
      { name: GroupMember.name, schema: GroupMemberSchema },
    ]),
    AuthModule,
    TasksModule,
    AiConfigModule,
    forwardRef(() => Phase2Module),
  ],
  controllers: [ComponentController],
  providers: [ComponentService, ComponentAnalysisService, GitlabPushService],
  exports: [ComponentService],
})
export class ComponentModule {}
