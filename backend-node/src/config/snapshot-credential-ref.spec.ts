// backend-root.js ESM 风格（const __filename）在 ts-jest CJS 下与模块包装器参数撞名，
// logger 链一加载整套件 0 运行 ⇒ 工厂 mock 绕过（tasks-config-snapshot.spec 同款惯例）。
jest.mock('./backend-root.js', () => {
  const cwd = process.cwd();
  return {
    backendRoot: cwd,
    projectRoot: cwd,
    workspaceRoot: cwd,
    customComponentsDir: cwd,
    vue3ComponentsDir: cwd,
    resolveFrontendWorkspacePath: () => cwd,
    frontendCustomComponentsDir: () => cwd,
    frontendVue3ComponentsDir: () => cwd,
    tempComponentsDir: cwd,
    dataDir: cwd,
    logsDir: '/tmp/mvgo-test-logs',
    configDir: cwd,
    chatAttachmentsDir: cwd,
    apifoxZipsDir: cwd,
    apiCatalogsDir: cwd,
  };
}, { virtual: true });

import { AiConfigService } from './config.service';
import { UserAiConfigService } from './user-ai-config.service';
import {
  FIGMA_CREDENTIAL_REF_FIELDS,
  toFigmaCredentialRefFields,
  type FigmaCredentialRefFields,
} from './figma-credential-ref';
import { maskSecretFingerprint } from '../common/utils/secret-fingerprint';

/**
 * 诉求五 #18/#19：快照记账与请求引用的**一致性**。
 *
 * 场景（用户实报主路径）：用户切过 Figma token 后从历史记录还原 → 前端把原任务的
 * 引用三字段（fp/slotId/slotName）随 config 带回，同时 config 里的 `figmaToken` 仍是
 * 「当前 active」。若快照按 `merged.figmaToken` 重算指纹，会记到**当前**凭证上 ——
 * 与执行层（`resolveExecutionFigmaToken` 读 requestConfig 引用、引用优先）分叉，
 * 重试/续跑时按错的快照引用找 token，历史还原语义断裂。
 */
describe('buildTaskConfigSnapshot 凭证引用记账（诉求五 #18/#19）', () => {
  let service: AiConfigService;

  const TOKEN_THEN = 'figd_aaa1111111111111111111111111THEN';
  const TOKEN_NOW = 'figd_bbb2222222222222222222222222NOW';

  const refThen: FigmaCredentialRefFields = toFigmaCredentialRefFields({
    fp: maskSecretFingerprint(TOKEN_THEN)!,
    slotId: 'slot-a',
    slotName: '当时的 Token',
  })!;

  beforeEach(() => {
    const userSvc = new UserAiConfigService();
    (userSvc as any).model = { findOne: jest.fn().mockResolvedValue(null) };
    service = new AiConfigService(userSvc);
  });

  it('阳性：请求带引用三字段 + figmaToken 是当前 active ⇒ 快照沿用请求里的引用（不重算）', () => {
    const snap = service.buildTaskConfigSnapshot({
      figmaToken: TOKEN_NOW,
      ...refThen,
    });
    expect(snap[FIGMA_CREDENTIAL_REF_FIELDS.fp]).toBe(refThen[FIGMA_CREDENTIAL_REF_FIELDS.fp]);
    expect(snap[FIGMA_CREDENTIAL_REF_FIELDS.slotId]).toBe('slot-a');
    expect(snap[FIGMA_CREDENTIAL_REF_FIELDS.slotName]).toBe('当时的 Token');
  });

  it('阴性对照：请求不带引用（首轮生成）⇒ 仍按 figmaToken 重算记账（原行为，零回归）', () => {
    const snap = service.buildTaskConfigSnapshot({
      figmaToken: TOKEN_NOW,
    });
    expect(snap[FIGMA_CREDENTIAL_REF_FIELDS.fp]).toBe(maskSecretFingerprint(TOKEN_NOW));
  });

  it('边界：请求引用的 fp 是空串（前端没带出）⇒ 视为未携带，按 figmaToken 重算', () => {
    const snap = service.buildTaskConfigSnapshot({
      figmaToken: TOKEN_NOW,
      [FIGMA_CREDENTIAL_REF_FIELDS.fp]: '',
      [FIGMA_CREDENTIAL_REF_FIELDS.slotId]: 'slot-a',
    });
    expect(snap[FIGMA_CREDENTIAL_REF_FIELDS.fp]).toBe(maskSecretFingerprint(TOKEN_NOW));
  });

  it('脱敏穿透：记账后的快照过 redactSecrets，引用三字段逐字幸存（落盘不丢）', () => {
    const { redactSecrets } = require('../common/utils/redact');
    const snap = service.buildTaskConfigSnapshot({
      figmaToken: TOKEN_NOW,
      ...refThen,
    });
    const redacted = redactSecrets({ configSnapshot: snap });
    expect(redacted.configSnapshot[FIGMA_CREDENTIAL_REF_FIELDS.fp]).toBe(
      refThen[FIGMA_CREDENTIAL_REF_FIELDS.fp],
    );
    expect(redacted.configSnapshot.figmaToken).toBe('***REDACTED***');
  });
});
