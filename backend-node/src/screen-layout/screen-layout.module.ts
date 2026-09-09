import { Module } from '@nestjs/common';
import { ScreenLayoutController } from './screen-layout.controller';
import { ScreenLayoutService } from './screen-layout.service';

@Module({
  controllers: [ScreenLayoutController],
  providers: [ScreenLayoutService],
  exports: [ScreenLayoutService],
})
export class ScreenLayoutModule {}
