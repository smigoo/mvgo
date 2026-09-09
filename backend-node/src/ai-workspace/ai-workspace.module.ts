import { Module } from '@nestjs/common';
import { AiSkillsModule } from './skills/skills.module';
import { AiProjectsModule } from './projects/projects.module';
import { AiSessionsModule } from './sessions/sessions.module';
import { AiDocumentsModule } from './documents/documents.module';
import { AiChatModule } from './chat/chat.module';
import { AiUserGitModule } from './user-git/user-git.module';

@Module({
  imports: [
    AiSkillsModule,
    AiProjectsModule,
    AiSessionsModule,
    AiDocumentsModule,
    AiChatModule,
    AiUserGitModule,
  ],
})
export class AiWorkspaceModule {}
