import { Module } from '@nestjs/common';
import { AiConfigModule } from '../config/config.module';
import { PageSkeletonController } from './page-skeleton.controller';
import { PageSkeletonService } from './page-skeleton.service';

@Module({
  imports: [AiConfigModule],
  controllers: [PageSkeletonController],
  providers: [PageSkeletonService],
})
export class PageSkeletonModule {}
