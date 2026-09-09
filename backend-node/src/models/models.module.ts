import { Module } from '@nestjs/common';
import { ModelsController } from './models.controller';

@Module({
  controllers: [/* ModelsController -- 已迁 Java */],
  providers: [],
  exports: [],
})
export class ModelsModule {}
