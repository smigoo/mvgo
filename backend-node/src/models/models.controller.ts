import { Controller, Get } from '@nestjs/common';
import { AVAILABLE_MODELS } from './models.constants';

@Controller('models')
export class ModelsController {
  /**
   * GET /api/models
   * 获取可用的AI模型列表
   */
  @Get()
  getModels() {
    return {
      success: true,
      data: AVAILABLE_MODELS,
    };
  }
}
