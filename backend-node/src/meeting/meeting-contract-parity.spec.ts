/**
 * 会议纪要管线：**前后端契约 parity**（单一判据、双向钉死）
 *
 * 治什么病：本模块的权威语义天然落在两处 ——
 *   后端 `src/meeting/meeting-state.ts`（Node 侧权威副本）
 *   前端 `frontend/src/views/meeting/contracts/{api-contract,draft-schema}.js`（契约层）
 * 两处**不可能共享一份代码**（tsconfig `allowJs` 未开；两子仓各自独立 Git），
 * 所以只能靠本 spec 把「重复」这件事钉住：任一侧改表而另一侧不动 ⇒ 立刻红。
 *
 * 🔴 为什么用 vm 求值前端 JS 而不是 import：本仓 tsconfig 不吃前端 ESM，
 *    `require('../../../frontend/...api-contract.js')` 在 CJS 下必炸。
 *    前端这两个契约文件是**无 import 的纯 ESM**（仅 export const/function），
 *    故剥掉 `export` 前缀后在 vm 沙箱里求值即可拿到**真实常量**（不是正则拼出来的近似值）。
 *    求值失败/名字缺失一律抛错 —— 不允许 undefined 参与比对（否则等于放行）。
 *
 * 🔴 断言口径：
 *    · 状态机逐**边**比对（不只 deepEqual 整个对象），失败信息要能直接读出是哪条边漂了；
 *    · controller 路由集合与契约 18 条**精确相等**（双向：多了红、少了也红）；
 *    · 归属字段（ownership / requiresAuth）每条必填且取值合法；
 *    · 用**真实 ValidationPipe** 复现「body 里的 ownerId 被 whitelist 静默剥离」，
 *      并配阳性对照（关掉 whitelist ⇒ ownerId 保住）证明剥离的成因就是 whitelist。
 */

// backend-root.js 是 ESM 风格（import.meta.url / const __filename），ts-jest CJS 下与模块
// 包装器参数撞名会让整套件 0 运行 ⇒ 工厂 mock 绕过（同 apifox-owner.spec 惯例）。
jest.mock('../config/backend-root.js', () => {
  const { mkdtempSync } = jest.requireActual('fs');
  const { join: pjoin } = jest.requireActual('path');
  const { tmpdir } = jest.requireActual('os');
  const root = mkdtempSync(pjoin(tmpdir(), 'mvgo-meeting-parity-'));
  return {
    backendRoot: root,
    projectRoot: root,
    workspaceRoot: pjoin(root, 'workspace'),
    customComponentsDir: pjoin(root, 'workspace', 'custom-components'),
    vue3ComponentsDir: pjoin(root, 'workspace', 'vue3-components'),
    tempComponentsDir: pjoin(root, 'temp-components'),
    dataDir: pjoin(root, 'data'),
    logsDir: pjoin(root, 'logs'),
  };
});

import 'reflect-metadata';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import * as vm from 'vm';
import { MeetingController } from './meeting.controller';
import { CreateRunDto } from './dto/meeting.dto';
import {
  CONFIRM_STATES,
  CONSENT_STATUS,
  CONSENT_TRANSITIONS,
  RUN_STATUS,
  RUN_TRANSITIONS,
  SOURCE_STATES,
  TEMPLATE_SCHEMAS,
} from './meeting-state';

// ────────────────────────────────────────────────────────────────────────────────
// 前端契约加载（vm 求值，非正则近似）
// ────────────────────────────────────────────────────────────────────────────────

const FRONTEND_MEETING_DIR = process.env.MVGO_FRONTEND_MEETING_DIR?.trim()
  ? process.env.MVGO_FRONTEND_MEETING_DIR.trim()
  : resolve(__dirname, '../../../frontend/src/views/meeting');

/** 剥 `export` 前缀后在 vm 沙箱求值，并显式取回需要的具名常量。 */
function loadFrontendModule(relPath: string, names: string[]): Record<string, any> {
  const file = join(FRONTEND_MEETING_DIR, relPath);
  if (!existsSync(file)) {
    throw new Error(
      `前端契约文件缺失：${file}\n` +
        `parity 判据必须读到前端契约真值（可用 MVGO_FRONTEND_MEETING_DIR 覆盖根目录）。`,
    );
  }
  const raw = readFileSync(file, 'utf-8');
  // 纯 ESM → 脚本：仅去 export 关键字，其余逐字保留
  const script = raw.replace(/^export\s+(const|function|let|var)\s/gm, '$1 ');
  const sandbox: Record<string, any> = {};
  vm.createContext(sandbox);
  vm.runInContext(`${script}\n;__picked = { ${names.join(', ')} };`, sandbox, { filename: file });
  const picked = sandbox.__picked;
  for (const name of names) {
    if (picked?.[name] === undefined) {
      throw new Error(`前端契约 ${relPath} 未导出「${name}」——比对基准缺失，判据不可信`);
    }
  }
  return picked;
}

const feApiContract = loadFrontendModule('contracts/api-contract.js', [
  'OUTPUT_TARGETS',
  'BACKEND_ENDPOINTS',
  'OWNERSHIP_SCOPES',
  'RUN_STATUS',
  'RUN_TRANSITIONS',
  'CONSENT_STATUS',
  'CONSENT_TRANSITIONS',
]);
const feDraftSchema = loadFrontendModule('contracts/draft-schema.js', [
  'TEMPLATE_SCHEMAS',
  'CONFIRM_STATES',
  'SOURCE_STATES',
]);
const feOwnerScope = loadFrontendModule('mock/owner-scope.js', ['scopedStorageKey']);

// ────────────────────────────────────────────────────────────────────────────────
// 判据工具
// ────────────────────────────────────────────────────────────────────────────────

/** 逐边比对两张转移表；返回人类可读的漂移清单（空数组＝一致）。 */
function diffTransitions(
  label: string,
  nodeTable: Record<string, readonly string[]>,
  feTable: Record<string, readonly string[]>,
): string[] {
  const diffs: string[] = [];
  const keys = [...new Set([...Object.keys(nodeTable), ...Object.keys(feTable)])];
  if (!keys.length) diffs.push(`${label}：两侧表都是空的，判据无意义`);
  for (const k of keys) {
    const a = nodeTable[k];
    const b = feTable[k];
    if (!a || !b) {
      diffs.push(`${label}「${k}」只存在于${a ? ' Node ' : '前端'}侧`);
      continue;
    }
    if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
      diffs.push(`${label}「${k}」Node=[${a.join(',')}] 前端=[${b.join(',')}]`);
    }
  }
  return diffs;
}

function expectNoDiff(diffs: string[], what: string): void {
  if (diffs.length) {
    throw new Error(`${what} 前后端漂移（改一侧必须同步改另一侧）：\n  - ${diffs.join('\n  - ')}`);
  }
}

function joinPath(...segs: Array<string | undefined>): string {
  const p = segs.filter((s) => s !== undefined && s !== null && String(s) !== '').join('/');
  return `/${p.replace(/\/+/g, '/').replace(/^\/|\/$/g, '')}`;
}

/** 反射读出 controller 实际注册的路由（运行时真相，不是源码正则）。 */
function controllerRoutes(): Array<{ method: string; path: string; handler: string }> {
  const proto: any = MeetingController.prototype;
  const ctrlPath: string = Reflect.getMetadata('path', MeetingController) ?? '';
  const out: Array<{ method: string; path: string; handler: string }> = [];
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === 'constructor') continue;
    const handler = proto[name];
    if (typeof handler !== 'function') continue;
    const mPath = Reflect.getMetadata('path', handler);
    if (mPath === undefined) continue;
    const mMethod = Reflect.getMetadata('method', handler);
    out.push({
      method: mMethod === undefined ? '?' : (RequestMethod[mMethod as number] ?? String(mMethod)),
      path: joinPath('/api', ctrlPath, mPath),
      handler: name,
    });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

const CONTRACT = feApiContract.BACKEND_ENDPOINTS as Array<{
  id: string;
  method: string;
  path: string;
  purpose: string;
  ownership: string;
  requiresAuth: boolean;
  implemented: boolean;
}>;

// ────────────────────────────────────────────────────────────────────────────────
// 1. 状态机 parity
// ────────────────────────────────────────────────────────────────────────────────

describe('契约 parity · 状态机（meeting-state.ts ⇄ api-contract.js）', () => {
  it('RUN_STATUS 逐项一致', () => {
    expect([...RUN_STATUS]).toEqual([...feApiContract.RUN_STATUS]);
  });

  it('RUN_TRANSITIONS 逐边一致', () => {
    expectNoDiff(
      diffTransitions('RUN_TRANSITIONS', RUN_TRANSITIONS, feApiContract.RUN_TRANSITIONS),
      '运行状态机',
    );
  });

  it('CONSENT_STATUS 逐项一致', () => {
    expect([...CONSENT_STATUS]).toEqual([...feApiContract.CONSENT_STATUS]);
  });

  it('CONSENT_TRANSITIONS 逐边一致', () => {
    expectNoDiff(
      diffTransitions('CONSENT_TRANSITIONS', CONSENT_TRANSITIONS, feApiContract.CONSENT_TRANSITIONS),
      '同意状态机',
    );
  });

  it('状态机的两条硬约束未被任何一侧放松', () => {
    // FR-12：定稿即冻结，无出边
    expect([...(RUN_TRANSITIONS['已定稿'] ?? [])]).toEqual([]);
    // FR-03：撤回后只能回「征集中」，不可直接回「已通过」
    expect([...(CONSENT_TRANSITIONS['已撤回'] ?? [])]).toEqual(['征集中']);
    expect([...(CONSENT_TRANSITIONS['已撤回'] ?? [])]).not.toContain('已通过');
  });

  it('阳性对照：diffTransitions 确实能识别人为漂移（判据不是恒真）', () => {
    expect(diffTransitions('T', { A: ['x'] }, { A: ['x'] }).length).toBe(0);
    const drifted = diffTransitions('T', { A: ['x'], B: ['y'] }, { A: ['z'] });
    expect(drifted.length).toBe(2); // A 内容漂 + B 单侧缺失
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// 2. 模板 / 字段态 parity
// ────────────────────────────────────────────────────────────────────────────────

describe('契约 parity · 模板与字段态（meeting-state.ts ⇄ draft-schema.js）', () => {
  it('TEMPLATE_SCHEMAS 的 id/version/label/required 逐条一致', () => {
    const nodeKeys = Object.keys(TEMPLATE_SCHEMAS).sort();
    const feKeys = Object.keys(feDraftSchema.TEMPLATE_SCHEMAS).sort();
    expect(nodeKeys).toEqual(feKeys);

    const diffs: string[] = [];
    for (const key of nodeKeys) {
      const node = (TEMPLATE_SCHEMAS as any)[key];
      const fe = feDraftSchema.TEMPLATE_SCHEMAS[key];
      for (const field of ['id', 'version', 'label'] as const) {
        if (node[field] !== fe[field]) {
          diffs.push(`${key}.${field}：Node=${JSON.stringify(node[field])} 前端=${JSON.stringify(fe[field])}`);
        }
      }
      // required 是 E-07 定稿门禁的输入，缺了门禁就退化成「有 draftAi 即可定稿」
      if (JSON.stringify(node.required) !== JSON.stringify(fe.required)) {
        diffs.push(`${key}.required：Node=${JSON.stringify(node.required)} 前端=${JSON.stringify(fe.required)}`);
      }
      if (!node.required?.length) diffs.push(`${key}.required 为空 —— 定稿门禁会失效`);
    }
    expectNoDiff(diffs, '模板 schema');
  });

  it('CONFIRM_STATES / SOURCE_STATES 逐项一致', () => {
    expect([...CONFIRM_STATES]).toEqual([...feDraftSchema.CONFIRM_STATES]);
    expect([...SOURCE_STATES]).toEqual([...feDraftSchema.SOURCE_STATES]);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// 3. 归属声明完整性（契约侧自证）
// ────────────────────────────────────────────────────────────────────────────────

describe('契约 parity · 归属声明（18 条零遗漏）', () => {
  it('BACKEND_ENDPOINTS 恰为 18 条且 id / path 不重复', () => {
    expect(CONTRACT.length).toBe(18);
    expect(new Set(CONTRACT.map((e) => e.id)).size).toBe(18);
    expect(new Set(CONTRACT.map((e) => `${e.method} ${e.path}`)).size).toBe(18);
    // id 连续 E-01..E-18：漏一条不会静默通过
    expect(CONTRACT.map((e) => e.id).sort()).toEqual(
      Array.from({ length: 18 }, (_, i) => `E-${String(i + 1).padStart(2, '0')}`),
    );
  });

  it('每条都声明了合法 ownership，且 requiresAuth 为真', () => {
    const scopes: string[] = [...feApiContract.OWNERSHIP_SCOPES];
    const bad: string[] = [];
    for (const e of CONTRACT) {
      if (!e.ownership || !scopes.includes(e.ownership)) {
        bad.push(`${e.id} ownership=${JSON.stringify(e.ownership)}（合法值：${scopes.join(' / ')}）`);
      }
      if (e.requiresAuth !== true) bad.push(`${e.id} requiresAuth 不是 true`);
    }
    expectNoDiff(bad, '归属声明');
  });

  it('两种归属粒度都被用到（run.ownerId / retention.actor），且 global 只给了留存策略', () => {
    const byScope: Record<string, string[]> = {};
    for (const e of CONTRACT) (byScope[e.ownership] ??= []).push(e.id);
    expect((byScope['run.ownerId'] ?? []).length).toBeGreaterThan(0);
    expect(byScope['retention.actor']).toEqual(['E-17', 'E-18']);
    expect(byScope['global']).toEqual(['E-15', 'E-16']);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// 4. controller 路由 ⇄ 契约 18 条（双向精确相等）
// ────────────────────────────────────────────────────────────────────────────────

describe('契约 parity · controller 路由（双向精确相等）', () => {
  it('每条契约端点都能在 controller 上找到同方法同路径的处理器', () => {
    const routes = controllerRoutes();
    const missing = CONTRACT.filter(
      (e) => !routes.some((r) => r.method === e.method && r.path === e.path),
    );
    expectNoDiff(
      missing.map((e) => `${e.id} ${e.method} ${e.path} 在 controller 上不存在`),
      '契约端点缺失',
    );
    if (!routes.length) throw new Error('反射读不到任何路由 —— 判据失效，先查 reflect-metadata');
  });

  it('controller 上没有契约之外的 HTTP 路由（多了也红）', () => {
    const declared = new Set(CONTRACT.map((e) => `${e.method} ${e.path}`));
    const extra = controllerRoutes()
      .filter((r) => !declared.has(`${r.method} ${r.path}`))
      .map((r) => `${r.method} ${r.path}（handler=${r.handler}）`);
    expectNoDiff(extra, '契约外路由');
  });

  it('每条路由都把会话身份透传给服务层（E-15 全局策略除外）', () => {
    const src = readFileSync(join(__dirname, 'meeting.controller.ts'), 'utf-8');
    const hits = src.match(/req\?\.session\?\.userId/g) ?? [];
    // E-15 读留存策略是全局单例，无需身份；其余 17 条必须透传（服务层再判 requireOwner）
    expect(hits.length).toBe(17);
    expect(CONTRACT.length - hits.length).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// 5. 归属**不走 body**：真实 ValidationPipe 剥离 + 阳性对照
// ────────────────────────────────────────────────────────────────────────────────

describe('契约 parity · 归属不走 body（whitelist 剥离的真相与对照）', () => {
  it('真实 ValidationPipe(whitelist) 把伪造的 ownerId / userId 从 body 剥离', async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const out: any = await pipe.transform(
      { meetingType: 'other', ownerId: 'attacker', userId: 'attacker' },
      { type: 'body', metatype: CreateRunDto },
    );
    // 用 in 判键存在：显式 undefined 也算「存在」，不能用 toBeUndefined
    expect('ownerId' in out).toBe(false);
    expect('userId' in out).toBe(false);
    expect(out.meetingType).toBe('other');
  });

  it('阳性对照：关掉 whitelist ⇒ ownerId 保住，证明剥离成因就是 whitelist', async () => {
    const pipe = new ValidationPipe({ transform: true });
    const out: any = await pipe.transform(
      { meetingType: 'other', ownerId: 'attacker' },
      { type: 'body', metatype: CreateRunDto },
    );
    expect('ownerId' in out).toBe(true);
    expect(out.ownerId).toBe('attacker');
  });

  it('DTO 未声明任何归属字段（声明了反而是「body 可伪造归属」的假通路）', () => {
    const src = readFileSync(join(__dirname, 'dto/meeting.dto.ts'), 'utf-8');
    for (const banned of ['ownerId', 'userId']) {
      const declared = new RegExp(`^\\s{2}@?\\w*\\s*${banned}\\??\\s*[:!]`, 'm').test(src);
      if (declared) throw new Error(`meeting.dto.ts 声明了归属字段 ${banned} —— 归属必须只来自会话`);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// 6. dev 态存储落点 ⇄ 契约 keyPattern（归属分区逐字对齐）
// ────────────────────────────────────────────────────────────────────────────────

describe('契约 parity · dev 存储落点与归属分区', () => {
  it('draftOverlay.keyPattern / indexKey 与实现层逐字对齐', () => {
    const dev = feApiContract.OUTPUT_TARGETS.dev.draftOverlay;
    const key = feOwnerScope.scopedStorageKey('mvgo.meeting.draft.', 'rv-1', 'u1');

    expect(dev.keyPattern).toBe('mvgo.meeting.draft.<ownerId>.<runVersion>');
    expect(dev.indexKey).toBe('mvgo.meeting.draft.<ownerId>.index');
    // 把占位符替换成实际值后必须与实现层产出**逐字相等**（假绿防线）
    expect(dev.keyPattern.replace('<ownerId>', 'u1').replace('<runVersion>', 'rv-1')).toBe(key);
    expect(dev.indexKey.replace('<ownerId>', 'u1')).toBe(
      feOwnerScope.scopedStorageKey('mvgo.meeting.draft.', 'index', 'u1'),
    );
  });

  it('两段式 key 结构：分区在倒数第二段，换个 owner 必然落到不同 key', () => {
    const u1 = feOwnerScope.scopedStorageKey('mvgo.meeting.draft.', 'rv-1', 'u1');
    const u2 = feOwnerScope.scopedStorageKey('mvgo.meeting.draft.', 'rv-1', 'u2');
    expect(u1.split('.')).toHaveLength(5);
    expect(u1).not.toBe(u2);
    expect(u1.startsWith('mvgo.meeting.draft.u1.')).toBe(true);
    expect(u2.startsWith('mvgo.meeting.draft.u2.')).toBe(true);
  });
});
