/**
 * redactSecrets 回归测试
 *
 * 🛡️ 背景（2026-09-18 · 任务成功后后端进程崩溃实锤）：
 *   旧实现纯递归，遇循环引用无限展开 → RangeError 栈溢出；该异常在
 *   ProgressService.sendComplete（无 try/catch）抛出 → 未捕获异常杀掉进程。
 *   四轮复现（b58918b5 / 80648377 / 9967c679 / c2026822），任务本身均成功。
 */
import { redactSecrets } from './redact';

describe('redactSecrets', () => {
  it('密钥字段（字符串值）替换为占位，非字符串值不替换', () => {
    const out = redactSecrets({
      token: 'abc',
      apiKey: 'k123',
      password: 'p',
      authorization: 'Bearer x',
      accessToken: 'at',
      refresh_token: 'rt',
      normal: 'keep',
      notSecret: 42,
      tokenCount: 7, // 值为数字 → 不替换（保持旧语义）
    });
    expect(out).toEqual({
      token: '***REDACTED***',
      apiKey: '***REDACTED***',
      password: '***REDACTED***',
      authorization: '***REDACTED***',
      accessToken: '***REDACTED***',
      refresh_token: '***REDACTED***',
      normal: 'keep',
      notSecret: 42,
      tokenCount: 7,
    });
  });

  it('嵌套对象/数组深拷贝脱敏，原对象不被修改', () => {
    const src: any = { a: { token: 'x' }, list: [{ secret: 'y' }, 1, null] };
    const out = redactSecrets(src);
    expect(out).toEqual({ a: { token: '***REDACTED***' }, list: [{ secret: '***REDACTED***' }, 1, null] });
    expect(src.a.token).toBe('x'); // 深拷贝：原对象保持
    expect(out.a).not.toBe(src.a);
  });

  it('自定义 replacement 生效', () => {
    expect(redactSecrets({ token: 'x' }, '[HIDDEN]')).toEqual({ token: '[HIDDEN]' });
  });

  // ── 崩溃回归：循环引用 ──
  it('循环引用（自指）→ 占位且可 JSON.stringify（不再栈溢出）', () => {
    const task: any = { sessionId: 's1', progress: [] };
    task.self = task; // 祖先回指
    expect(() => redactSecrets(task)).not.toThrow();
    const out = redactSecrets(task);
    expect(out.self).toBe('[Circular]');
    expect(() => JSON.stringify(out)).not.toThrow(); // 关键：不再因循环丢整条快照
  });

  it('循环引用（数组内回指祖先）→ 占位且可序列化', () => {
    const item: any = { stage: '生成', details: {} };
    const task: any = { progress: [item] };
    item.details.task = task; // progress[i].details.task === task（真实崩溃形态）
    const out = redactSecrets(task);
    expect(out.progress[0].details.task).toBe('[Circular]');
    expect(() => JSON.stringify(out)).not.toThrow();
  });

  it('深层嵌套（2000 层）不爆栈（迭代遍历）', () => {
    let deep: any = { token: 'end' };
    for (let i = 0; i < 2000; i++) deep = { child: deep };
    let out: any;
    expect(() => { out = redactSecrets(deep); }).not.toThrow();
    let cur = out;
    for (let i = 0; i < 2000; i++) cur = cur.child;
    expect(cur.token).toBe('***REDACTED***');
  });

  it('兄弟节点共享同一引用（DAG 非循环）→ 正常展开，不误判为循环', () => {
    const shared = { token: 'v', name: 'n' };
    const out = redactSecrets({ a: shared, b: shared });
    expect(out.a).toEqual({ token: '***REDACTED***', name: 'n' });
    expect(out.b).toEqual({ token: '***REDACTED***', name: 'n' });
    expect(JSON.stringify(out)).not.toContain('[Circular]');
  });

  it('原始类型/ null / undefined 原样返回', () => {
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets(undefined)).toBeUndefined();
    expect(redactSecrets('s')).toBe('s');
    expect(redactSecrets(3)).toBe(3);
    expect(redactSecrets(false)).toBe(false);
  });

  it('真实 task 快照形态（含 progress + 循环 result）端到端可持久化', () => {
    const task: any = {
      sessionId: 'mc-1',
      status: 'completed',
      configSnapshot: { aiApiKey: 'sk-xxx', model: 'qwen' },
      progress: [
        { type: 'log', message: '开始生成', details: { aiApiKey: 'sk-yyy' } },
      ],
      result: null,
    };
    task.result = { code: 'ok', _task: task }; // 结果回指任务（崩溃形态）

    // A. 直接脱敏 task 本体：task 是祖先 → 回指被占位
    const direct = redactSecrets(task);
    expect(direct.result._task).toBe('[Circular]');
    expect(direct.configSnapshot.aiApiKey).toBe('***REDACTED***');
    expect(direct.progress[0].details.aiApiKey).toBe('***REDACTED***');
    expect(() => JSON.stringify(direct, null, 2)).not.toThrow();

    // B. 真实调用点形态 flushPersistQueue：`{...task, progress: slice(-200)}`
    //    展开后 task 不是祖先（是新根的一个分支），真正的环在更深一层被捕获：
    //    root.result._task(展开副本).result === task.result → 命中祖先 → 占位。
    const out = redactSecrets({ ...task, progress: task.progress.slice(-200) });
    expect(out.configSnapshot.aiApiKey).toBe('***REDACTED***');
    expect(out.progress[0].details.aiApiKey).toBe('***REDACTED***');
    expect(out.result._task.result).toBe('[Circular]');
    expect(() => JSON.stringify(out, null, 2)).not.toThrow(); // 不再整条快照丢失
  });
});
