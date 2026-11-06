/**
 * 守卫覆盖判据 spec（2026-11-06）
 *
 * 本 spec 是「零守卫匿名端点不再新增」的唯一判据。
 * 背景：全仓【没有】全局守卫（APP_GUARD 零命中）⇒ 守卫只能逐类/逐方法声明，
 * 漏挂即匿名可达。2026-11-06 审计把零守卫从 83(口径含类级守卫漏检假阳性) 收敛到 17，
 * 其中 6 枚补挂 SessionGuard（component by-session/files/declare/download、
 * tasks queue/stats/queue/status），此前一轮已补 apifox catalog/download、
 * component gitlab-*、config test-*；其余 17 枚全部定性为「有意匿名」并登记在下方白名单。
 *
 * 口径（与扫描脚本逐行对齐，改解析先改这里）：
 *  - 类级守卫 = @Controller【上方】紧邻装饰器块 + @Controller 到 class 声明之间
 *    （本仓两种写法并存：@UseGuards 在 @Controller 上方=workflow/admin，下方=announcement）。
 *  - 方法级守卫 = 路由装饰器【上下两侧】连续的装饰器块（apifox 是「路由在上、守卫在下」）。
 *  - 遇非装饰器非注释行立即停，不吃方法体。
 *  - 「守卫」指**真正阻断匿名请求**的守卫；OptionalSessionGuard 只解析身份永不阻断，
 *    不算（判据问的是「匿名能否打到业务代码」，不是「是否出现过 @UseGuards」——
 *    否则给匿名端点挂个空守卫就能骗过本 spec）。见 NON_BLOCKING_GUARDS。
 *
 * 断言三层：
 *  1) sanity：解析出的路由总数 ≥ BASELINE_TOTAL —— 解析器/口径被改坏时宁可红，
 *     绝不静默产出空集合假绿（阳性对照）。
 *  2) 集合相等：零守卫集合 === KNOWN_ANONYMOUS。新增匿名端点 ⇒ 红（须显式登记+定性理由）；
 *     给白名单端点补了守卫 ⇒ 红（须从白名单删除，防白名单腐化）。
 *  3) 红线：admin 命名空间除 admin/internal/*（x-admin-stats-key 鉴权）外永不允许零守卫。
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.join(__dirname, '..');

const ROUTE_RE = /@(Get|Post|Put|Patch|Delete|All|Search)\s*(?:\(([^)]*)\))?/;
const CTRL_RE = /@Controller\s*\(([^)]*)\)/;
const CLASS_RE = /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/;

/**
 * 「只解析身份、永不阻断」的守卫：匿名请求照样能进业务逻辑 ⇒ 审计口径上**仍算未阻断**。
 * 目前只有 OptionalSessionGuard（apifox/record 用它拿会话身份写 ownerId，但 Skill
 * 无 token 时必须照旧放行）。判据关心的是「匿名能不能打到业务代码」，不是「有没有
 * 出现 @UseGuards 这个词」—— 否则给匿名端点挂个空守卫就能骗过本 spec。
 */
const NON_BLOCKING_GUARDS = new Set(['OptionalSessionGuard']);

/** 取出文本里所有 `@UseGuards(...)` 的守卫名（支持跨行 + 嵌套括号，如 AuthGuard('jwt')） */
function extractGuardNames(text: string): string[] {
  const names: string[] = [];
  const open = /@UseGuards\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = open.exec(text))) {
    let depth = 1;
    let i = m.index + m[0].length;
    let buf = '';
    while (i < text.length) {
      const ch = text[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
      buf += ch;
      i += 1;
    }
    for (const part of buf.split(',')) {
      const name = part.replace(/\s+/g, '');
      if (name) names.push(name);
    }
  }
  return names;
}

/** 是否存在真正阻断匿名请求的守卫（NON_BLOCKING_GUARDS 之外任意一个即算） */
function hasBlockingGuard(text: string): boolean {
  return extractGuardNames(text).some((n) => !NON_BLOCKING_GUARDS.has(n));
}

const isNoise = (s: string) =>
  s === '' || s.startsWith('//') || s.startsWith('*') || s.startsWith('/*');

function collectControllerFiles(dir: string, out: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'dist') continue;
      collectControllerFiles(p, out);
    } else if (ent.name.endsWith('.controller.ts')) {
      out.push(p);
    }
  }
  return out;
}

interface RouteInfo {
  id: string;
  verb: string;
  full: string;
  guarded: boolean;
}

function scanRoutes(): RouteInfo[] {
  const routes: RouteInfo[] = [];
  for (const file of collectControllerFiles(SRC_ROOT).sort()) {
    const rel = path.relative(SRC_ROOT, file).split(path.sep).join('/');
    const lines = fs.readFileSync(file, 'utf-8').split('\n');

    const classes: Array<[number, string]> = [];
    lines.forEach((l, i) => {
      const m = CLASS_RE.exec(l);
      if (m) classes.push([i, m[1]]);
    });

    // 每个 @Controller：(起始行, class声明行, 前缀, 类名, 类级守卫?)
    const ctrls: Array<{ start: number; clsLine: number; prefix: string; cls: string; cguard: boolean }> = [];
    lines.forEach((l, i) => {
      const m = CTRL_RE.exec(l);
      if (!m) return;
      const nxt = classes.find((c) => c[0] > i);
      if (!nxt) return;
      const prefix = m[1].trim().replace(/^['"]|['"]$/g, '');
      // 类级守卫 = 上方紧邻装饰器块 + @Controller..class 之间
      let k = i - 1;
      while (k >= 0) {
        const s = lines[k].trim();
        if (isNoise(s) || s.startsWith('@')) {
          k -= 1;
          continue;
        }
        break;
      }
      const between = lines.slice(k + 1, nxt[0]).join('\n');
      ctrls.push({ start: i, clsLine: nxt[0], prefix, cls: nxt[1], cguard: hasBlockingGuard(between) });
    });

    lines.forEach((l, i) => {
      const rm = ROUTE_RE.exec(l);
      if (!rm || isNoise(l.trim()) || ctrls.length === 0) return;
      const owner = [...ctrls].reverse().find((c) => c.start < i);
      if (!owner) return;
      const verb = rm[1];
      let sub = '';
      if (rm[2]) {
        const am = /['"]([^'"]*)['"]/.exec(rm[2]);
        sub = am ? am[1] : rm[2].trim();
      }
      let full = (owner.prefix ? '/' + owner.prefix : '') + (sub ? '/' + sub : '');
      full = full || '/';
      let guarded = owner.cguard;
      if (!guarded) {
        // 上下两侧连续装饰器块（遇非装饰器即停）
        for (const step of [-1, 1]) {
          let j = i + step;
          while (step < 0 ? j > owner.start : j < lines.length) {
            const s = lines[j].trim();
            if (isNoise(s)) {
              j += step;
              continue;
            }
            if (s.startsWith('@')) {
              if (hasBlockingGuard(s)) guarded = true;
              j += step;
              continue;
            }
            break;
          }
        }
      }
      routes.push({ id: `${rel}::${verb} ${full}`, verb, full, guarded });
    });
  }
  return routes;
}

/**
 * 有意匿名白名单（17 条，2026-11-06 逐条定性；理由分类）：
 *  A 登录流程必需：auth login/register/logout（无 session 才能调）
 *  B 所有权自证：auth change-password（service 强制 bcrypt 校验 oldPassword，
 *    且前端入口 `if (isProduction) return` 仅开发态；无越权面）
 *  C 健康检查/信息：app `/`、/workspace-info（探活，无用户数据）
 *  D 内部静态 key：admin/internal/*（x-admin-stats-key 比对 ADMIN_STATS_KEY，
 *    未配置 fail-closed 503，key 错 403）
 *  E 机器对机器：apifox/record（Skill 唯一写入入口，无用户 session；
 *    已加可选 APIFOX_SKILL_KEY + service 层 taskId 防穿越 + zipPath 限 apifox-zips 内。
 *    2026-11-06 补 ownerId 写入时挂了 OptionalSessionGuard：它**永不阻断**，只用于
 *    「带 Token 的调用方顺手拿到权威身份」，所以本条仍属匿名可达、仍需登记）
 *  F 预览免登录设计（2026-09-14 注释实锤「预览页独立打开时无 token 此接口免认证」；
 *    有登录 session 时仍做归属校验，匿名分支为设计权衡；组件 id 带随机后缀不可猜）：
 *    preview 2 + tasks resolve-session/code-snapshots 4 + component :componentId/file
 *    （后者因质量面板 <img src="...&raw=1"> 无法带 Token 头，raw=1 逃生舱即为此设计）
 */
const KNOWN_ANONYMOUS = new Set([
  // A 登录流程
  'auth/auth.controller.ts::Post /auth/login',
  'auth/auth.controller.ts::Post /auth/register',
  'auth/auth.controller.ts::Post /auth/logout',
  // B 所有权自证
  'auth/auth.controller.ts::Post /auth/change-password',
  // C 健康检查
  'app.controller.ts::Get /',
  'app.controller.ts::Get /workspace-info',
  // D 内部 key
  'admin/admin-stats.controller.ts::Get /admin/internal/user-stats',
  'admin/admin-stats.controller.ts::Get /admin/internal/usage-export',
  // E Skill 专用
  'apifox/apifox.controller.ts::Post /apifox/record',
  // F 预览免登录
  'preview/preview.controller.ts::Get /preview/page/:groupId/:pageId/*path',
  'preview/preview.controller.ts::Get /preview/:groupId/:componentId/*path',
  'tasks/tasks.controller.ts::Get /tasks/resolve-session',
  'tasks/tasks.controller.ts::Get /tasks/:sessionId/code-snapshots/latest',
  'tasks/tasks.controller.ts::Get /tasks/:sessionId/code-snapshots/:revision/manifest',
  'tasks/tasks.controller.ts::Get /tasks/:sessionId/code-snapshots/:revision/file',
  'tasks/tasks.controller.ts::Get /tasks/:sessionId/code-snapshots/revisions',
  'component/component.controller.ts::Get /component/:componentId/file',
]);

describe('守卫覆盖判据（无全局守卫 ⇒ 逐方法声明，漏挂即匿名）', () => {
  const routes = scanRoutes();
  const unguarded = routes.filter((r) => !r.guarded).map((r) => r.id);

  it('sanity：解析器没有静默失效（阳性对照，路由总数不塌）', () => {
    // 2026-11-06 基线 294；口径被改坏/解析器抛错吞路由时应立刻红在这里，
    // 而不是让「零守卫集合恰好等于白名单」假绿。
    expect(routes.length).toBeGreaterThanOrEqual(280);
    expect(routes.length - unguarded.length).toBeGreaterThanOrEqual(250);
  });

  it('零守卫集合 === 已定性白名单（新增须显式登记理由，补守卫须删除条目）', () => {
    const extra = unguarded.filter((id) => !KNOWN_ANONYMOUS.has(id)).sort();
    const missing = [...KNOWN_ANONYMOUS].filter((id) => !unguarded.includes(id)).sort();
    // jest 30 的 expect 只接受一个参数 ⇒ 诊断信息用 throw 带出，再落一个断言保证判据形态
    if (extra.length || missing.length) {
      throw new Error(
        `未登记的匿名端点(危险)=${JSON.stringify(extra, null, 1)}` +
          `；白名单已过期条目(给白名单端点补了守卫需删除对应条目)=${JSON.stringify(missing, null, 1)}` +
          `。白名单定义见本文件 KNOWN_ANONYMOUS 注释`,
      );
    }
    expect({ extra, missing }).toEqual({ extra: [], missing: [] });
  });

  it('红线：admin 命名空间除 internal/* 外永不允许零守卫', () => {
    const adminAnon = unguarded.filter(
      (id) => id.includes('::/admin/') && !id.includes('::/admin/internal/'),
    );
    expect(adminAnon).toEqual([]);
  });
});
