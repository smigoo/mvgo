/**
 * 2026-09-29 治本回归（mc-1790667029984-86d05609 实锤）
 *
 * 症状：产物「静态资源全部消失」—— 所有图标退化成 CSS 蓝圆。
 * 根因链：
 *   ① Figma 图片 CDN 在 10 路并发下重置连接 → `read ECONNRESET`
 *      （真机集中在开始下载后 1.5~3.5s 内爆发 13 条，全部 error=read ECONNRESET）；
 *   ② `_downloadImageFromUrl` 原实现**没有任何重试**，且 `isNetworkError` 白名单
 *      **漏掉 ECONNRESET**（只有 ECONNREFUSED / ETIMEDOUT / ENOTFOUND / timeout）
 *      ⇒ 落入 else 分支只记一条 ERROR 即判死 → `downloadStatus:"missing"`
 *      → 下游按 fallbackHint 改用 CSS 纯色；
 *   ③ 其中 `2:8439`（bg）还是 **11 个 bg 的去重锚点**，而锚点判据只看「存在性」不看
 *      「是否下载成功」⇒ 1 个失败被放大成 12 个位置同时无资源。
 *
 * 本文件锁定 ②③：瞬时网络错误必须退避重试；永久错误（4xx）必须不重试。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { FigmaConnector } from '../figma-connector.js';
import axios from 'axios';

// backend-root.js 用 import.meta.url（ESM），jest CJS 下无法加载 → mock 掉路径解析
jest.mock('../../../config/backend-root.js', () => {
  const root = '/Users/smigoo/工作/mvgo/backend-node';
  return {
    backendRoot: root,
    projectRoot: '/Users/smigoo/工作/mvgo',
    workspaceRoot: `${root}/workspace`,
    customComponentsDir: `${root}/workspace/custom-components`,
    vue3ComponentsDir: `${root}/workspace/vue3-components`,
    resolveFrontendWorkspacePath: () => '/Users/smigoo/工作/mvgo/frontend/workspace',
    frontendCustomComponentsDir: () =>
      '/Users/smigoo/工作/mvgo/frontend/workspace/custom-components',
    frontendVue3ComponentsDir: () =>
      '/Users/smigoo/工作/mvgo/frontend/workspace/vue3-components',
    tempComponentsDir: '/Users/smigoo/工作/mvgo/temp-components',
    dataDir: `${root}/data`,
    logsDir: `${root}/logs`,
    configDir: `${root}/config`,
    chatAttachmentsDir: `${root}/temp-chat-attachments`,
    apifoxZipsDir: `${root}/data/apifox-zips`,
    apiCatalogsDir: `${root}/data/api-catalogs`,
  };
});

jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

const getMock = (axios as unknown as { get: jest.Mock }).get;

const mkErr = (code: string, msg = `read ${code}`) => {
  const e = new Error(msg) as Error & { code?: string; response?: unknown };
  e.code = code;
  return e;
};

describe('_downloadImageFromUrl · ECONNRESET 必须重试（CODE-RES-01 治本）', () => {
  let outDir: string;
  let conn: FigmaConnector;

  beforeEach(() => {
    jest.clearAllMocks();
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-dl-retry-'));
    conn = new FigmaConnector({ figmaToken: 'fake-token-for-test' } as never);
  });

  it('瞬时错误 ECONNRESET → 退避重试后成功（原实现直接判死 ⇒ 本次 13 个资源丢失）', async () => {
    getMock
      .mockRejectedValueOnce(mkErr('ECONNRESET'))
      .mockResolvedValueOnce({ data: Buffer.from('PNGDATA') });

    const r = await (conn as never as Record<string, Function>)._downloadImageFromUrl(
      'https://s3.example/x.png',
      '2:8439',
      'icon',
      outDir,
    );

    expect(getMock).toHaveBeenCalledTimes(2);
    expect(r.downloaded).toBe(true);
    expect(r.localPath).toBeTruthy();
    // 成功结果不得带 isNetworkError（去重锚点判据依赖 downloaded 字段）
    expect(r.isNetworkError).toBeUndefined();
  }, 20000);

  it('ECONNRESET 连续失败 → 用满 MAX_ATTEMPTS 后判为网络错误，不再调用', async () => {
    getMock.mockRejectedValue(mkErr('ECONNRESET'));

    const r = await (conn as never as Record<string, Function>)._downloadImageFromUrl(
      'https://s3.example/y.png',
      '2:8798',
      'icon',
      outDir,
    );

    expect(getMock).toHaveBeenCalledTimes(3); // MAX_ATTEMPTS
    expect(r.downloaded).toBe(false);
    expect(r.isNetworkError).toBe(true);
    expect(r.localPath).toBeNull();
  }, 20000);

  it('永久错误（HTTP 404）→ 不重试，仅调用 1 次（不把 3 倍等待叠加到整体预算）', async () => {
    const e = new Error('Request failed with status code 404') as Error & {
      response?: unknown;
    };
    e.response = { status: 404 };
    getMock.mockRejectedValue(e);

    const r = await (conn as never as Record<string, Function>)._downloadImageFromUrl(
      'https://s3.example/z.png',
      '2:8888',
      'icon',
      outDir,
    );

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(r.downloaded).toBe(false);
    expect(r.isNetworkError).toBe(false);
  }, 20000);
});
