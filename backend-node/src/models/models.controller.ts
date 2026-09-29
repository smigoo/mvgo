import {Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { AVAILABLE_MODELS } from './models.constants';

@UseGuards(SessionGuard)
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
