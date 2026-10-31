/**
 * 🛡️ fetchNodeData 节点数据磁盘缓存判据（2026-10-31 真机实锤驱动）。
 *
 * 病灶：Figma `files/:key/nodes` 对大文件实测 121s（GTcJm0DKQvcJvcOZTh5n1l:48:5796
 * 直测 HTTP 200 / 121034ms），管线超时 120s 卡临界线 ⇒ 同节点重投三连超时失败
 * （mc-max-1793453592158-abe42624 实锤）。而同节点几分钟前刚被成功拉取过——
 * 预览图早有「本地缓存复用」先例（2026-09-16），节点数据却没有 ⇒ 重投必须重拉。
 *
 * 判据：
 *  1. TTL 内命中 ⇒ 零网络（限流器不被 acquire）、返回深拷贝；
 *  2. mtime 过期 ⇒ 回源；
 *  3. token 变更 ⇒ 旧缓存不跨 token 复用（与预览图缓存同纪律）；
 *  4. 成功拉取后写缓存；TTL=0 禁用。
 */
import { mkdtempSync, writeFileSync, readFileSync, existsSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { FigmaConnector } from '../figma-connector.js';

// backend-root.js 用 import.meta.url（ESM），jest CJS 下无法加载 → mock 掉路径解析
// （同 figma-connector-prune.spec.ts 模式）
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

const DOC = { id: '48:5796', name: 'root', children: [{ id: '48:5797', name: 'card' }] };
const TOKEN_A = 'tok-a';
const TOKEN_B = 'tok-b';
const tmpDirs = [];

/** 造 connector：注入临时缓存目录 + 计数限流器（被 acquire 即测试失败信号） */
function makeConnector(token, cacheDir, ttlMs) {
  const c = new FigmaConnector({ figmaToken: token, cacheDir, nodeCacheTtlMs: ttlMs });
  c._rateLimiter = {
    acquire() {
      throw new Error('NETWORK_LEAK: 缓存命中时不应发起网络请求');
    },
  };
  return c;
}

const cachePathOf = (dir, token, fileKey, nodeId) => {
  const apiNodeId = nodeId.replace(/-/g, ':');
  const th = createHash('sha256').update(token).digest('hex').slice(0, 8);
  return join(dir, `${fileKey}_${apiNodeId.replace(/:/g, '-')}_${th}.json`);
};

const newDir = () => {
  const d = mkdtempSync(join(tmpdir(), 'figma-node-cache-spec-'));
  tmpDirs.push(d);
  return d;
};

afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

describe('fetchNodeData 节点数据磁盘缓存', () => {
  it('TTL 内命中：零网络 + 深拷贝返回', async () => {
    const dir = newDir();
    const c = makeConnector(TOKEN_A, dir, 30 * 60 * 1000);
    // 预热缓存：写入 {document, savedAt}
    const p = cachePathOf(dir, TOKEN_A, 'ABC123', '48-5796');
    writeFileSync(p, JSON.stringify({ document: DOC, savedAt: Date.now() }));
    const out = await c.fetchNodeData('ABC123', '48-5796');
    expect(out).toEqual(DOC);
    // 深拷贝：改返回值不影响缓存
    out.children[0].name = 'MUTATED';
    expect(JSON.parse(readFileSync(p, 'utf8')).document.children[0].name).toBe('card');
  });

  it('savedAt 过期 ⇒ 回源（网络路径被调用）并回写缓存', async () => {
    const dir = newDir();
    const c = makeConnector(TOKEN_A, dir, 30 * 60 * 1000);
    const p = cachePathOf(dir, TOKEN_A, 'ABC123', '48-5796');
    // TTL 判据用内容时间戳 savedAt（拷贝文件不破坏语义）：写 1 小时前的 savedAt
    const old = Date.now() - 60 * 60 * 1000;
    writeFileSync(p, JSON.stringify({ document: DOC, savedAt: old }));
    let fetched = 0;
    c._figmaApiGet = async () => {
      fetched++;
      return { data: { nodes: { '48:5796': { document: DOC } } } };
    };
    const out = await c.fetchNodeData('ABC123', '48-5796');
    expect(fetched).toBe(1);
    expect(out).toEqual(DOC);
    // 回源后回写：缓存文件 mtime 已刷新（savedAt 更新）
    const saved = JSON.parse(readFileSync(p, 'utf8'));
    expect(saved.savedAt).toBeGreaterThan(Date.now() - 60 * 1000);
  });

  it('token 变更 ⇒ 旧缓存不跨 token 复用（回源）', async () => {
    const dir = newDir();
    const c = makeConnector(TOKEN_B, dir, 30 * 60 * 1000);
    // 写的是 TOKEN_A 的缓存
    const pA = cachePathOf(dir, TOKEN_A, 'ABC123', '48-5796');
    writeFileSync(pA, JSON.stringify({ document: DOC, savedAt: Date.now() }));
    let fetched = 0;
    c._figmaApiGet = async () => {
      fetched++;
      return { data: { nodes: { '48:5796': { document: DOC } } } };
    };
    await c.fetchNodeData('ABC123', '48-5796');
    expect(fetched).toBe(1);
  });

  it('TTL=0 禁用缓存：即使有新鲜缓存也回源', async () => {
    const dir = newDir();
    const c = makeConnector(TOKEN_A, dir, 0);
    const p = cachePathOf(dir, TOKEN_A, 'ABC123', '48-5796');
    writeFileSync(p, JSON.stringify({ document: DOC, savedAt: Date.now() }));
    let fetched = 0;
    c._figmaApiGet = async () => {
      fetched++;
      return { data: { nodes: { '48:5796': { document: DOC } } } };
    };
    await c.fetchNodeData('ABC123', '48-5796');
    expect(fetched).toBe(1);
  });

  it('成功回源后写缓存（下一位消费者可命中）', async () => {
    const dir = newDir();
    const c = makeConnector(TOKEN_A, dir, 30 * 60 * 1000);
    c._figmaApiGet = async () => ({ data: { nodes: { '48:5796': { document: DOC } } } });
    await c.fetchNodeData('ABC123', '48-5796');
    const p = cachePathOf(dir, TOKEN_A, 'ABC123', '48-5796');
    expect(existsSync(p)).toBe(true);
    expect(JSON.parse(readFileSync(p, 'utf8')).document).toEqual(DOC);
  });
});
