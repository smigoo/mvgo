import {Controller, Get, Logger, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../auth/session.guard';
import { AiSkillsService } from './skills.service';

@UseGuards(SessionGuard)
@Controller('skills')
export class AiSkillsController {
  private readonly logger = new Logger(AiSkillsController.name);

  constructor(private readonly skillsService: AiSkillsService) {}

  @Get()
  async findAll() {
    const skills = await this.skillsService.findAll();
    return { data: skills };
  }
}
