import { Controller, Get, Post, Body, Param, UseGuards, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { AiProjectsService } from './projects.service';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { SessionGuard } from '../../auth/session.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { PERMISSIONS } from '../../auth/permission.constants';
import { CurrentUser } from '../../auth/current-user.decorator';

@Controller('projects')
@UseGuards(SessionGuard, PermissionsGuard)
export class AiProjectsController {
  private readonly logger = new Logger(AiProjectsController.name);

  constructor(private readonly projectsService: AiProjectsService) {}

  @Get()
  async findAll(@CurrentUser() userId: string) {
    const projects = await this.projectsService.findAll(userId);
    return { data: projects };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() userId: string) {
    const project = await this.projectsService.findById(id, userId);
    if (!project) throw new HttpException('项目不存在', HttpStatus.NOT_FOUND);
    return { data: project };
  }

  @Post()
  @Permissions(PERMISSIONS.PROJECT_CREATE)
  async create(@Body() dto: CreateProjectDto, @CurrentUser() userId: string) {
    const project = await this.projectsService.create(dto, userId);
    return { data: project };
  }

  @Post(':id')
  @Permissions(PERMISSIONS.PROJECT_UPDATE)
  async update(@Param('id') id: string, @Body() dto: UpdateProjectDto, @CurrentUser() userId: string) {
    const project = await this.projectsService.update(id, dto, userId);
    if (!project) throw new HttpException('项目不存在或无权操作', HttpStatus.NOT_FOUND);
    return { data: project };
  }

  @Post(':id/delete')
  @Permissions(PERMISSIONS.PROJECT_DELETE)
  async archive(@Param('id') id: string, @CurrentUser() userId: string) {
    const result = await this.projectsService.archive(id, userId);
    if (!result) throw new HttpException('项目不存在或无权操作', HttpStatus.NOT_FOUND);
    return { success: true };
  }
}
