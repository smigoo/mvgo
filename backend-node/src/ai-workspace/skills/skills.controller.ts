import { Controller, Get, Logger } from '@nestjs/common';
import { AiSkillsService } from './skills.service';

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
