import { Controller, Get, Post, Body, Param, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { AiDocumentsService } from './documents.service';
import { UpdateDocumentDto, AppendDocumentDto } from './dto/document.dto';
import { SessionGuard } from '../../auth/session.guard';
import { CurrentUser } from '../../auth/current-user.decorator';

@Controller('documents')
@UseGuards(SessionGuard)
export class AiDocumentsController {
  constructor(private readonly documentsService: AiDocumentsService) {}

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() userId: string) {
    const doc = await this.documentsService.findById(id, userId);
    if (!doc) throw new HttpException('文档不存在', HttpStatus.NOT_FOUND);
    return { data: doc };
  }

  @Post(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateDocumentDto, @CurrentUser() userId: string) {
    const doc = await this.documentsService.update(id, dto, userId);
    if (!doc) throw new HttpException('文档不存在', HttpStatus.NOT_FOUND);
    return { data: doc };
  }

  @Post(':id/append')
  async append(@Param('id') id: string, @Body() dto: AppendDocumentDto, @CurrentUser() userId: string) {
    const doc = await this.documentsService.appendContent(id, dto, userId);
    if (!doc) throw new HttpException('文档不存在', HttpStatus.NOT_FOUND);
    return { data: doc, updated: true };
  }

  @Post(':id/delete')
  async delete(@Param('id') id: string, @CurrentUser() userId: string) {
    await this.documentsService.delete(id, userId);
    return { success: true };
  }
}
