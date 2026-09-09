import { Injectable } from '@nestjs/common';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';
import { resolveFrontendWorkspace } from './config/workspace.config';
import { backendRoot } from './config/backend-root';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  getWorkspaceInfo() {
    const frontendWs = resolveFrontendWorkspace();
    const defaultRoot = join(frontendWs, 'custom-components');
    return {
      defaultRoot: existsSync(defaultRoot) ? defaultRoot : join(homedir(), 'workspace'),
      projectRoot: backendRoot,
      homeDir: homedir(),
      frontendWorkspace: frontendWs,
    };
  }
}
