import { Module } from '@nestjs/common';
import { ApifoxController } from './apifox.controller';
import { ApifoxService } from './apifox.service';
import { ApifoxGeneratorService } from './apifox-generator.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ApifoxController],
  providers: [ApifoxService, ApifoxGeneratorService],
  exports: [ApifoxService, ApifoxGeneratorService],
})
export class ApifoxModule {}
