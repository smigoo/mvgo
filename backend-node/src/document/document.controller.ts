import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Session,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { DocumentService } from './document.service';
import { CreateDocumentDto, UpdateDocumentDto } from './dto/document.dto';

@Controller('documents')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post()
  async create(
    @Body() dto: CreateDocumentDto,
    @Session() session: Record<string, any>,
  ) {
    const userId = session.userId;
    const groupId = session.groupId;
    if (!userId || !groupId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
    return this.documentService.create(userId, groupId, dto);
  }

  @Get()
  async findAll(
    @Query('myOnly') myOnly: string,
    @Session() session: Record<string, any>,
  ) {
    const groupId = session.groupId;
    const userId = myOnly === 'true' ? session.userId : undefined;
    if (!groupId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
    return this.documentService.findAll(groupId, userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.documentService.findOne(id);
  }

  @Post(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
    @Session() session: Record<string, any>,
  ) {
    const userId = session.userId;
    if (!userId) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
    return this.documentService.update(id, userId, dto);
  }

  @Post(':id/delete')
  async remove(@Param('id') id: string) {
    return this.documentService.remove(id);
  }
}
