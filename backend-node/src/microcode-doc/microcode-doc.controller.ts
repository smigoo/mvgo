import { Controller, Post, Body, Logger } from '@nestjs/common';
import { MicrocodeDocService } from './microcode-doc.service';
import { GenerateDocConfigsDto } from './dto/generate-doc-configs.dto';

@Controller('microcode/doc')
export class MicrocodeDocController {
  private readonly logger = new Logger(MicrocodeDocController.name);

  constructor(private readonly docService: MicrocodeDocService) {}

  @Post('generate-configs')
  async generateConfigs(@Body() dto: GenerateDocConfigsDto) {
    this.logger.log(
      `收到文档配置生成请求，文档长度: ${dto.document?.length || 0}`,
    );

    const result = await this.docService.generateConfigs(dto.document);

    if (!result.success) {
      this.logger.warn(`配置生成失败: ${result.error}`);
    } else {
      this.logger.log(`配置生成成功，合并后文档长度: ${result.merged?.length || 0}`);
    }

    return result;
  }
}
