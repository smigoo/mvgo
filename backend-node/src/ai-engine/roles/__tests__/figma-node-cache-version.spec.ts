/**
 * 🛡️ P0-7（2026-11-14 · mc-max-1794651114530-9ed088e3 实锤）：节点缓存「设计稿版本比对」判据。
 *
 * 病灶：节点树缓存只按 token 失效 + 24h TTL，**不看设计稿有没有被改**。实测命中
 *   18.6h 前的树（`ageMs=67028349`），而设计在此期间被整理过（容器名
 *   `slot-当日总流量` → `0sub-header/1统计/5cards`）⇒ 管线拿旧树跑新判据，
 *   现场表现成「生成器坏了」。
 *
 * 判据（全部 fail-open，缓存是优化不是依赖）：
 *   1. 版本一致 ⇒ 命中，零网络；
 *   2. 版本不一致 ⇒ 视为未命中、回源重拉，并把新版本写回；
 *   3. 历史缓存**没有** fileVersion ⇒ 仍按 TTL 复用（避免一次上线作废全部存量缓存）；
 *   4. 版本查询失败/为空 ⇒ 退回纯 TTL 行为，不得让生成失败；
 *   5. 版本结果有内存短 TTL：同一次生成里多次取节点只回源一次。
 */
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { FigmaConnector } from '../figma-connector.js';

jest.mock('../../../config/backend-root.js', () => {
  const root = '/Users/smigoo/工作/mvgo/backend-node';
  return {
    backendRoot: root,
    projectRoot: '/Users/smigoo/工作/mvgo',
    workspaceRoot: `${root}/workspace`,
    customComponentsDir: `${root}/workspace/custom-components`,
    vue3ComponentsDir: `${root}/workspace/vue3-components`,
    tempComponentsDir: '/Users/smigoo/工作/mvgo/temp-components',
    dataDir: `${root}/data`,
    logsDir: `${root}/logs`,
    configDir: `${root}/config`,
    chatAttachmentsDir: `${root}/temp-chat-attachments`,
    apifoxZipsDir: `${root}/data/apifox-zips`,
    apiCatalogsDir: `${root}/data/api-catalogs`,
    resolveFrontendWorkspacePath: () => '/Users/smigoo/工作/mvgo/frontend/workspace',
    frontendCustomComponentsDir: () => '/Users/smigoo/工作/mvgo/frontend/workspace/custom-components',
    frontendVue3ComponentsDir: () => '/Users/smigoo/工作/mvgo/frontend/workspace/vue3-components',
  };
});

const DOC = { id: '2:9778', name: 'cp-流量监测', children: [{ id: '2:3436', name: 'bg-[m]' }] };
const FRESH_DOC = { id: '2:9778', name: 'cp-流量监测', children: [{ id: '88:32', name: '0sub-header' }] };
const TOKEN = 'tok-a';
const FILE_KEY = '1t7Dmmpsl5i0PC8BJt2QLf';
const NODE_ID = '2-9778';
const tmpDirs = [];

const cachePathOf = (dir, fileKey, nodeId, token) => {
  const th = createHash('sha256').update(token).digest('hex').slice(0, 8);
  return join(dir, `${fileKey}_${nodeId.replace(/:/g, '-')}_${th}.json`);
};

const newDir = () => {
  const d = mkdtempSync(join(tmpdir(), 'figma-node-cache-version-'));
  tmpDirs.push(d);
  return d;
};

/** 造 connector：网络计数器 + 可控版本返回（`versionResult`=null 表示查询失败） */
function makeConnector(dir, { versionResult = { version: 'v1' }, ttlMs = 60000 } = {}) {
  const c = new FigmaConnector({
    figmaToken: TOKEN,
    cacheDir: dir,
    nodeCacheTtlMs: 30 * 60 * 1000,
    fileVersionTtlMs: ttlMs,
  });
  const calls = { version: 0, node: 0 };
  c._fetchFileVersion = async () => {
    calls.version += 1;
    return versionResult ? { ...versionResult, at: Date.now() } : null;
  };
  c._figmaApiGet = async () => {
    calls.node += 1;
    return { data: { nodes: { [NODE_ID.replace(/-/g, ':')]: { document: FRESH_DOC } } } };
  };
  c._rateLimiter = { acquire() {} };
  return { c, calls };
}

afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

describe('P0-7 节点缓存设计稿版本比对', () => {
  it('版本一致 ⇒ 命中，零回源', async () => {
    const dir = newDir();
    const p = cachePathOf(dir, FILE_KEY, NODE_ID, TOKEN);
    writeFileSync(p, JSON.stringify({ document: DOC, savedAt: Date.now(), fileVersion: 'v1' }));
    const { c, calls } = makeConnector(dir, { versionResult: { version: 'v1' } });

    const out = await c.fetchNodeData(FILE_KEY, NODE_ID);

    expect(out).toEqual(DOC);
    expect(calls.node).toBe(0); // 没回源拉节点
    expect(calls.version).toBe(1);
  });

  it('版本不一致 ⇒ 判未命中、回源重拉，并把新版本写回', async () => {
    const dir = newDir();
    const p = cachePathOf(dir, FILE_KEY, NODE_ID, TOKEN);
    writeFileSync(p, JSON.stringify({ document: DOC, savedAt: Date.now(), fileVersion: 'v1' }));
    const { c, calls } = makeConnector(dir, { versionResult: { version: 'v2' } });

    const out = await c.fetchNodeData(FILE_KEY, NODE_ID);

    expect(calls.node).toBe(1); // 回源了
    expect(out).toEqual(FRESH_DOC); // 拿到的是新树
    const written = JSON.parse(readFileSync(p, 'utf8'));
    expect(written.fileVersion).toBe('v2');
    expect(written.document).toEqual(FRESH_DOC);
  });

  it('历史缓存无 fileVersion ⇒ 仍按 TTL 复用（不作废存量缓存）', async () => {
    const dir = newDir();
    const p = cachePathOf(dir, FILE_KEY, NODE_ID, TOKEN);
    writeFileSync(p, JSON.stringify({ document: DOC, savedAt: Date.now() }));
    const { c, calls } = makeConnector(dir, { versionResult: { version: 'v9' } });

    const out = await c.fetchNodeData(FILE_KEY, NODE_ID);

    expect(out).toEqual(DOC);
    expect(calls.node).toBe(0);
  });

  it('版本查询失败 ⇒ fail-open，退回纯 TTL 行为', async () => {
    const dir = newDir();
    const p = cachePathOf(dir, FILE_KEY, NODE_ID, TOKEN);
    writeFileSync(p, JSON.stringify({ document: DOC, savedAt: Date.now(), fileVersion: 'v1' }));
    const { c, calls } = makeConnector(dir, { versionResult: null });

    const out = await c.fetchNodeData(FILE_KEY, NODE_ID);

    expect(out).toEqual(DOC);
    expect(calls.node).toBe(0);
  });

  it('版本查询有内存短 TTL：同 fileKey 多次只回源一次', async () => {
    const dir = newDir();
    const c = new FigmaConnector({
      figmaToken: TOKEN,
      cacheDir: dir,
      nodeCacheTtlMs: 30 * 60 * 1000,
      fileVersionTtlMs: 60000,
    });
    let apiCalls = 0;
    c._figmaApiGet = async () => {
      apiCalls += 1;
      return { data: { version: 'v1' } };
    };
    await c._fetchFileVersion(FILE_KEY);
    await c._fetchFileVersion(FILE_KEY);
    await c._fetchFileVersion(FILE_KEY);
    expect(apiCalls).toBe(1);  });

  it('缓存开关关闭时不查版本（零额外请求）', async () => {
    const dir = newDir();
    const c = new FigmaConnector({
      figmaToken: TOKEN,
      cacheDir: dir,
      cacheEnabled: false,
      nodeCacheTtlMs: 30 * 60 * 1000,
      fileVersionTtlMs: 60000,
    });
    let apiCalls = 0;
    c._figmaApiGet = async () => {
      apiCalls += 1;
      return { data: { version: 'v1' } };
    };
    expect(await c._fetchFileVersion(FILE_KEY)).toBeNull();
    expect(apiCalls).toBe(0);
  });
});
