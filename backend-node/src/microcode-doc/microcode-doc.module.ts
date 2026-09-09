import { Module } from '@nestjs/common';
import { MicrocodeDocController } from './microcode-doc.controller';
import { MicrocodeDocService } from './microcode-doc.service';

@Module({
  controllers: [MicrocodeDocController],
  providers: [MicrocodeDocService],
  exports: [MicrocodeDocService],
})
export class MicrocodeDocModule {}
