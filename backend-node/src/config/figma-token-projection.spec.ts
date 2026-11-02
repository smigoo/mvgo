import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Figma 多 Token 投影层判据（2026-11-02）。
 *
 * 覆盖两类事实：
 *  A. 纯函数投影 `applyFigmaTokenProjection` —— 生成链路读到的 `figmaToken` 必须恒为
 *     「当前生效的那个」；旧配置（只有单值）零漂移。
 *  B. `AI_CONFIG_SCHEMA` 正反证 —— 保存是整份 blob 覆盖且 schema 为 `.strict()`，
 *     故 `figmaTokens` 必须被声明且 `.max(2)` 真的拦住第 3 个（否则前端限制是摆设）。
 *
 * ⚠️ config.service.ts 顶层 `import { dataDir } from './backend-root'` 并在模块加载时
 *    `path.resolve(dataDir, ...)`，而 backend-root.js 含 `import.meta.url`（ts-jest CJS 下会炸）。
 *    故必须沿用 config.service.spec.ts 的做法：先 `jest.doMock('./backend-root')` 再 require。
 */
describe('Figma 多 Token 投影（figma-token-projection）', () => {
  let proj: any;
  let cfgMod: any;

  beforeAll(() => {
    jest.resetModules();
    const tempRoot = join(tmpdir(), `mvgo-figma-projection-${Date.now()}`);
    jest.doMock('./backend-root', () => ({ dataDir: join(tempRoot, 'data') }));
    jest.isolateModules(() => {
      proj = require('./figma-token-projection');
      cfgMod = require('./config.service');
    });
  });

  const slots = (...pairs: Array<[string, string]>) =>
    pairs.map(([id, token]) => ({ id, token }));

  describe('常量与基本口径', () => {
    it('每人上限为 2（前端只渲染 2 个槽位，后端 schema 同口径）', () => {
      expect(proj.MAX_FIGMA_TOKENS).toBe(2);
      expect(proj.LEGACY_FIGMA_TOKEN_SLOT_ID).toBe('figma-1');
    });

    it('isUsableFigmaTokenSlot：只有非空 token 才算可用，纯名字不算', () => {
      expect(proj.isUsableFigmaTokenSlot({ id: 'a', token: 't' })).toBe(true);
      expect(proj.isUsableFigmaTokenSlot({ id: 'a', token: '  ' })).toBe(false);
      expect(proj.isUsableFigmaTokenSlot({ id: 'a', name: '张三', token: '' })).toBe(false);
      expect(proj.isUsableFigmaTokenSlot({ id: 'a' })).toBe(false);
      expect(proj.isUsableFigmaTokenSlot(null)).toBe(false);
      expect(proj.isUsableFigmaTokenSlot('a')).toBe(false);
    });
  });

  describe('applyFigmaTokenProjection（读取侧唯一出口）', () => {
    it('① active 命中 → 投影该槽位的 token，并回写 activeFigmaTokenId', () => {
      const out = proj.applyFigmaTokenProjection({
        figmaToken: 'stale-legacy',
        figmaTokens: slots(['figma-1', 'tok-1'], ['figma-2', 'tok-2']),
        activeFigmaTokenId: 'figma-2',
      });
      expect(out.figmaToken).toBe('tok-2');
      expect(out.activeFigmaTokenId).toBe('figma-2');
    });

    it('② active 悬空（指向不存在的 id）→ 确定性回落第一个可用槽位', () => {
      const out = proj.applyFigmaTokenProjection({
        figmaTokens: slots(['figma-1', 'tok-1'], ['figma-2', 'tok-2']),
        activeFigmaTokenId: 'figma-404',
      });
      expect(out.figmaToken).toBe('tok-1');
      expect(out.activeFigmaTokenId).toBe('figma-1');
    });

    it('②b active 缺失 → 同样回落第一个可用槽位', () => {
      const out = proj.applyFigmaTokenProjection({
        figmaTokens: slots(['figma-1', 'tok-1'], ['figma-2', 'tok-2']),
      });
      expect(out.figmaToken).toBe('tok-1');
      expect(out.activeFigmaTokenId).toBe('figma-1');
    });

    it('②c 槽位 1 被清空（空 token）→ 空槽位被丢弃，仍落到真正可用的槽位 2', () => {
      const out = proj.applyFigmaTokenProjection({
        figmaTokens: [
          { id: 'figma-1', name: '已改名', token: '' },
          { id: 'figma-2', token: 'tok-2' },
        ],
        activeFigmaTokenId: 'figma-1',
      });
      // 关键：不能因为 active 指向空槽位就把 figmaToken 打成空字符串（会 401）
      expect(out.figmaToken).toBe('tok-2');
      expect(out.activeFigmaTokenId).toBe('figma-2');
      expect(out.figmaTokens).toEqual([{ id: 'figma-2', token: 'tok-2' }]);
    });

    it('③ figmaTokens 全空 → 原样返回，保留历史单值（旧配置零漂移）', () => {
      const out = proj.applyFigmaTokenProjection({
        figmaToken: 'legacy-tok',
        figmaTokens: [],
        activeFigmaTokenId: 'figma-1',
      });
      expect(out.figmaToken).toBe('legacy-tok');
      expect(out.activeFigmaTokenId).toBe('figma-1');
      expect(out.figmaTokens).toEqual([]);

      // 完全没有 figmaTokens 字段的老配置也一样
      const out2 = proj.applyFigmaTokenProjection({ figmaToken: 'only-legacy' });
      expect(out2.figmaToken).toBe('only-legacy');
      expect(out2.figmaTokens).toBeUndefined();
    });

    it('④ 幂等：同一输入连投两次，结果逐字相同', () => {
      const input = {
        figmaToken: 'x',
        figmaTokens: slots(['figma-1', 'tok-1'], ['figma-2', 'tok-2']),
        activeFigmaTokenId: 'figma-2',
      };
      const once = proj.applyFigmaTokenProjection(input);
      const twice = proj.applyFigmaTokenProjection(once);
      expect(twice).toEqual(once);
      expect(twice.figmaToken).toBe('tok-2');
    });

    it('⑤ 上限硬约束：3 个槽位只保留前 2 个', () => {
      const out = proj.applyFigmaTokenProjection({
        figmaTokens: slots(['a', 'ta'], ['b', 'tb'], ['c', 'tc']),
        activeFigmaTokenId: 'c',
      });
      expect(out.figmaTokens).toHaveLength(2);
      // active 'c' 被截掉 → 回落第一个
      expect(out.figmaToken).toBe('ta');
      expect(out.activeFigmaTokenId).toBe('a');
    });

    it('⑥ 去重：重复 id 只保留首次出现，且不影响后续 id', () => {
      const out = proj.applyFigmaTokenProjection({
        figmaTokens: [
          { id: 'dup', token: 'first' },
          { id: 'dup', token: 'second' },
          { id: 'other', token: 'tok-other' },
        ],
      });
      expect(out.figmaTokens).toEqual([
        { id: 'dup', token: 'first' },
        { id: 'other', token: 'tok-other' },
      ]);
      expect(out.figmaToken).toBe('first');
    });

    it('不修改入参（纯函数）', () => {
      const input: any = {
        figmaTokens: slots(['figma-1', 'tok-1'], ['figma-2', 'tok-2']),
        activeFigmaTokenId: 'figma-2',
        figmaToken: 'stale',
      };
      const snapshot = JSON.stringify(input);
      proj.applyFigmaTokenProjection(input);
      expect(JSON.stringify(input)).toBe(snapshot);
    });
  });

  describe('materializeFigmaTokenSlots（面板读取侧，宽松口径）', () => {
    it('仅有历史单值 → 物化成 1 号槽位，并把 active 指向它（面板读写对称）', () => {
      const out = proj.materializeFigmaTokenSlots({ figmaToken: 'legacy-tok' });
      expect(out.figmaTokens).toEqual([
        { id: proj.LEGACY_FIGMA_TOKEN_SLOT_ID, name: '主 Token', token: 'legacy-tok' },
      ]);
      expect(out.activeFigmaTokenId).toBe(proj.LEGACY_FIGMA_TOKEN_SLOT_ID);
    });

    it('连单值都没有 → 仍给 1 个空槽位（面板永远 ≥1 行可输入）', () => {
      const out = proj.materializeFigmaTokenSlots({});
      expect(out.figmaTokens).toEqual([{ id: proj.LEGACY_FIGMA_TOKEN_SLOT_ID, name: '', token: '' }]);
      expect(out.activeFigmaTokenId).toBe(proj.LEGACY_FIGMA_TOKEN_SLOT_ID);
    });

    it('保留「已命名但未填 token」的半成品槽位（宽松，与投影严格口径刻意不同）', () => {
      const out = proj.materializeFigmaTokenSlots({
        figmaTokens: [
          { id: 'figma-1', name: '主账号', token: 'tok-1' },
          { id: 'figma-2', name: '备用账号', token: '' },
        ],
        activeFigmaTokenId: 'figma-2',
      });
      expect(out.figmaTokens).toHaveLength(2);
      expect(out.figmaTokens[1]).toEqual({ id: 'figma-2', name: '备用账号', token: '' });
      // active 指向的槽位确实存在 → 保留用户选择，不擅自改选
      expect(out.activeFigmaTokenId).toBe('figma-2');
    });

    it('active 悬空 → 修正为第一个已存在槽位', () => {
      const out = proj.materializeFigmaTokenSlots({
        figmaTokens: slots(['figma-1', 'tok-1']),
        activeFigmaTokenId: 'figma-404',
      });
      expect(out.activeFigmaTokenId).toBe('figma-1');
    });

    it('已有槽位时不再从历史单值重新物化（不产生重复槽位）', () => {
      const out = proj.materializeFigmaTokenSlots({
        figmaToken: 'legacy-tok',
        figmaTokens: slots(['figma-1', 'tok-1']),
        activeFigmaTokenId: 'figma-1',
      });
      expect(out.figmaTokens).toHaveLength(1);
      expect(out.figmaTokens[0].token).toBe('tok-1');
    });

    it('materialize → apply 链路闭环：物化后投影得到的就是被选中的 token', () => {
      const materialized = proj.materializeFigmaTokenSlots({
        figmaTokens: [
          { id: 'figma-1', name: 'A', token: 'tok-1' },
          { id: 'figma-2', name: 'B', token: 'tok-2' },
        ],
        activeFigmaTokenId: 'figma-2',
      });
      const projected = proj.applyFigmaTokenProjection(materialized);
      expect(projected.figmaToken).toBe('tok-2');
    });
  });

  describe('AI_CONFIG_SCHEMA 正反证（保存是整份 blob 覆盖 + .strict()）', () => {
    const schema = () => cfgMod.AI_CONFIG_SCHEMA;

    it('旧配置（只有 figmaToken 单值）依旧通过 —— 未破坏向后兼容', () => {
      const r = schema().safeParse({ figmaToken: 'legacy-tok' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.figmaToken).toBe('legacy-tok');
    });

    it('2 个 token 通过（正证）', () => {
      const r = schema().safeParse({
        figmaToken: 'tok-2',
        figmaTokens: [
          { id: 'figma-1', name: 'A', token: 'tok-1' },
          { id: 'figma-2', name: 'B', token: 'tok-2' },
        ],
        activeFigmaTokenId: 'figma-2',
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.figmaTokens).toHaveLength(2);
        expect(r.data.activeFigmaTokenId).toBe('figma-2');
      }
    });

    it('3 个 token 被 .max(MAX_FIGMA_TOKENS) 拒绝（反证，前端限制不是摆设）', () => {
      const r = schema().safeParse({
        figmaTokens: [
          { id: 'a', name: '', token: 'ta' },
          { id: 'b', name: '', token: 'tb' },
          { id: 'c', name: '', token: 'tc' },
        ],
      });
      expect(r.success).toBe(false);
    });

    it('figmaTokens 非数组 → preprocess 归一为 undefined，不因脏值整份保存 400', () => {
      const r = schema().safeParse({ figmaTokens: 'oops', figmaToken: 'tok' });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.figmaTokens).toBeUndefined();
        expect(r.data.figmaToken).toBe('tok');
      }
    });

    it('槽位缺 id 被拒（id 是 active 指针的锚，不能省）', () => {
      const r = schema().safeParse({ figmaTokens: [{ name: 'A', token: 'tok-1' }] });
      expect(r.success).toBe(false);
    });

    it('.strict() 仍然拦截臆造 key（未被新字段破坏严格性）', () => {
      const r = schema().safeParse({ figmaTokens: [], unknownFigmaField: 'x' });
      expect(r.success).toBe(false);
    });
  });
});
