import { Controller, Post, Body, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { AiChatService } from './chat.service';
import { SaveMessageDto } from './dto/chat.dto';
import { SessionGuard } from '../../auth/session.guard';
import { CurrentUser } from '../../auth/current-user.decorator';

@Controller('chat')
@UseGuards(SessionGuard)
export class AiChatController {
  constructor(private readonly chatService: AiChatService) {}

  @Post('save')
  async save(@Body() dto: SaveMessageDto, @CurrentUser() userId: string) {
    try {
      const result = await this.chatService.save(userId, dto);
      return result;
    } catch (err: any) {
      throw new HttpException(err.message, HttpStatus.BAD_REQUEST);
    }
  }
}
