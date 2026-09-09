import { Module } from '@nestjs/common';
import { PageGeneratorController } from './page-generator.controller';
import { AdminPageGeneratorController } from './admin-page-generator.controller';
import { PageGeneratorService } from './page-generator.service';
import { AdminPageGeneratorService } from './admin-page-generator.service';
import { TasksModule } from '../tasks/tasks.module';
import { ProgressModule } from '../progress/progress.module';
import { ComponentModule } from '../component/component.module';

@Module({
  imports: [TasksModule, ProgressModule, ComponentModule],
  controllers: [PageGeneratorController, AdminPageGeneratorController],
  providers: [PageGeneratorService, AdminPageGeneratorService],
})
export class PageGeneratorModule {}
