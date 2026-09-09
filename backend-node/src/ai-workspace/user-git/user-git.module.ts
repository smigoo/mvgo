import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiGitCredential, AiGitCredentialSchema } from '../schemas/ai-git-credential.schema';
import { AiUserGitController } from './user-git.controller';
import { AiUserGitService } from './user-git.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: AiGitCredential.name, schema: AiGitCredentialSchema }]),
  ],
  controllers: [AiUserGitController],
  providers: [AiUserGitService],
  exports: [AiUserGitService],
})
export class AiUserGitModule {}
