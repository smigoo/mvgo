/**
 * `stripRedactedPlaceholders()` 判据（诉求五 #16-① 的入口净化）。
 *
 * 被治理的真实故障形态：
 *   `TasksService` 落盘前 `redactSecrets(configSnapshot)` ⇒ 历史任务的快照里
 *   `figmaToken` / `figmaTokens[].token` 全是 `'***REDACTED***'`；`/lite/retry`、
 *   断点续跑、vue3/phase2 任务恢复把这快照直接当 `config` 回传 ⇒ 假 token 进入生成链路
 *   （`'***REDACTED***'` 是**非空字符串**，`if (config.figmaToken)` 完全挡不住）。
 *
 * 阴性对照（`B` 组）是关键：真值必须**逐字保留**，否则净化会把用户配置一并洗掉 ——
 * 那比原缺陷更糟（从「用错凭证」变成「没有凭证」）。
 */
import { REDACTED_PLACEHOLDER, redactSecrets, stripRedactedPlaceholders } from './redact';

const REDACTED = REDACTED_PLACEHOLDER;

describe('stripRedactedPlaceholders', () => {
  describe('A. 剥掉占位（阳性）', () => {
    it('顶层占位值整键丢弃（不是置空串）', () => {
      const out = stripRedactedPlaceholders({
        figmaToken: REDACTED,
        outputPath: '/tmp/a',
      });

      // 关键：键**不存在** —— 置成 '' 仍会让 `??` / 空串合并逻辑产生不同分支
      expect('figmaToken' in out).toBe(false);
      expect(out.outputPath).toBe('/tmp/a');
    });

    it('数组内的占位 token 整项丢弃（槽位变「无名无值」，随后被 normalize 自然淘汰）', () => {
      const out = stripRedactedPlaceholders({
        figmaTokens: [
          { id: 'slot-a', name: '主 Token', token: REDACTED },
          { id: 'slot-b', name: 'smigoo', token: 'figd_real_b' },
        ],
        activeFigmaTokenId: 'slot-a',
      });

      expect(out.figmaTokens).toEqual([
        { id: 'slot-a', name: '主 Token' },
        { id: 'slot-b', name: 'smigoo', token: 'figd_real_b' },
      ]);
    });

    it('深层嵌套与字符串数组里的占位同样被剥', () => {
      const out = stripRedactedPlaceholders({
        providers: [{ name: 'x', apiKey: REDACTED, models: ['m1', REDACTED, 'm2'] }],
      });

      expect(out.providers[0]).toEqual({ name: 'x', models: ['m1', 'm2'] });
    });

    it('入参本身就是占位串 → undefined（边界，不返回假值）', () => {
      expect(stripRedactedPlaceholders(REDACTED)).toBeUndefined();
    });
  });

  describe('B. 真值零改动（阴性对照）', () => {
    it('真实配置逐字保留（含非密钥字段、数字、布尔、null）', () => {
      const input = {
        figmaToken: 'figd_realtoken',
        figmaTokens: [{ id: 'a', name: '主 Token', token: 'figd_x' }],
        activeFigmaTokenId: 'a',
        maxRetries: 3,
        enabled: false,
        note: null,
      };

      expect(stripRedactedPlaceholders(input)).toEqual(input);
    });

    it('不被就地修改（入参对象与调用前一致）', () => {
      const input: any = { figmaToken: REDACTED, keep: 1 };
      stripRedactedPlaceholders(input);

      expect(input.figmaToken).toBe(REDACTED);
    });
  });

  describe('C. 与 redactSecrets 的互补口径', () => {
    it('先 redact 再 strip ⇒ 脱敏字段消失，其余字段存活（往返可证）', () => {
      const original = {
        figmaToken: 'figd_secret',
        outputPath: '/tmp/out',
        providers: [{ name: 'p', apiKey: 'sk-1' }],
      };

      const roundTrip = stripRedactedPlaceholders(redactSecrets(original));

      expect(roundTrip).toEqual({
        outputPath: '/tmp/out',
        providers: [{ name: 'p' }],
      });
    });

    it('循环回指的子树整枝丢弃，且不抛错（快照出现循环说明上游有问题，宁缺勿假）', () => {
      const a: any = { name: 'a', token: REDACTED };
      a.self = a;

      const out = stripRedactedPlaceholders(a);

      expect(out.name).toBe('a');
      expect('self' in out).toBe(false);
    });
  });
});
