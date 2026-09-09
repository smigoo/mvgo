import { Module } from '@nestjs/common';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';
import { ChatAttachmentService } from './chat-attachment.service';
import { ComponentModule } from '../component/component.module';
import { Phase2Module } from '../phase2/phase2.module';

@Module({
  imports: [ComponentModule, Phase2Module],
  controllers: [DemoController],
  providers: [DemoService, ChatAttachmentService],
  exports: [DemoService],
})
export class DemoModule {}
