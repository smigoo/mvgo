import {
  isDeclaredOrGeometricRepeated,
  resolveRepeatEvidence,
} from './repeated-section-contract.js';
// ⚠️ 不在此 import prompt-builder.js：其依赖 prompt-loader.js 使用 import.meta.url，
//   ts-jest 的 CJS 转换会报 `__filename` 重复声明（既有环境限制，与本次改动无关）。
//   resolveSectionScopeFacts 的集成验证放在 Node ESM 离线探针里跑。

describe('S3-B declaredRepeated 几何证据判定（单一来源）', () => {
  describe('isDeclaredOrGeometricRepeated', () => {
    it('① 旧口径 3 个契约字段仍全部生效（零漂移）', () => {
      expect(isDeclaredOrGeometricRepeated({ itemCount: 3 }).declared).toBe(true);
      expect(isDeclaredOrGeometricRepeated({ collapsed: true }).declared).toBe(true);
      expect(isDeclaredOrGeometricRepeated({ renderHint: 'v-for' }).declared).toBe(true);
      expect(isDeclaredOrGeometricRepeated({ itemCount: 1, collapsed: false }).repeated).toBe(false);
    });

    it('② siblings=2 但无任何契约字段 → repeated=true（修复「事实白拿」）', () => {
      const r = isDeclaredOrGeometricRepeated({ id: 'x' }, { siblings: 2 });
      expect(r.declared).toBe(false);
      expect(r.geometric).toBe(true);
      expect(r.repeated).toBe(true);
      expect(r.sources).toContain('sameShapeSiblings');
    });

    it('③ isoSectionTruth.entryCount=3 → geometric=true', () => {
      const r = isDeclaredOrGeometricRepeated({}, { isoEntryCount: 3 });
      expect(r.geometric).toBe(true);
      expect(r.sources).toContain('isoSectionTruth');
    });

    it('④ inlineCompositeRows.members=3 → geometric=true', () => {
      const r = isDeclaredOrGeometricRepeated({}, { inlineMembers: 3 });
      expect(r.geometric).toBe(true);
      expect(r.sources).toContain('inlineCompositeRows');
    });

    it('⑤ A 注入的 _repeatContract 本身即证据', () => {
      const r = isDeclaredOrGeometricRepeated(
        { _repeatContract: { source: 'inlineCompositeRows', itemCount: 3, members: ['a', 'b', 'c'] } },
        {},
      );
      expect(r.geometric).toBe(true);
      expect(r.sources).toContain('inlineCompositeRows');
    });

    it('⑥ 证据阈值：<=1 不算重复（防误伤单卡 / 两卡以下容器）', () => {
      expect(isDeclaredOrGeometricRepeated({}, { siblings: 1, isoEntryCount: 1, inlineMembers: 1 }).repeated).toBe(false);
      expect(isDeclaredOrGeometricRepeated({}, { siblings: 0 }).repeated).toBe(false);
      expect(isDeclaredOrGeometricRepeated({}, { siblings: NaN }).repeated).toBe(false);
    });

    it('⑦ 契约 + 几何同时命中：repeated 仍为 true，sources 记录几何来源', () => {
      const r = isDeclaredOrGeometricRepeated({ collapsed: true, itemCount: 3 }, { siblings: 2, isoEntryCount: 3 });
      expect(r.declared).toBe(true);
      expect(r.geometric).toBe(true);
      expect(r.repeated).toBe(true);
      expect(r.sources).toEqual(expect.arrayContaining(['sameShapeSiblings', 'isoSectionTruth']));
    });

    it('⑧ 缺参安全：undefined / null / 空对象不抛错', () => {
      expect(isDeclaredOrGeometricRepeated(undefined).repeated).toBe(false);
      expect(isDeclaredOrGeometricRepeated(null as any, undefined).repeated).toBe(false);
      expect(isDeclaredOrGeometricRepeated({}, {}).repeated).toBe(false);
    });
  });

  describe('resolveRepeatEvidence', () => {
    const sec = { id: '2:8023', figmaAnchorId: '2:8023' };

    it('⑨ layoutStructure 内的真实证据（dd4be3be 缓存形态）能解析出来', () => {
      const input = {
        layoutStructure: {
          isoSectionTruth: { sections: [{ id: '2:8023', entryCount: 3 }] },
          inlineCompositeRows: [{ id: '2:8023', members: ['136:129', '136:128', '136:127'] }],
        },
      };
      const ev = resolveRepeatEvidence(input, sec);
      expect(ev).toEqual({ isoEntryCount: 3, inlineMembers: 3 });
      expect(isDeclaredOrGeometricRepeated(sec, { siblings: 2, ...ev }).repeated).toBe(true);
    });

    it('⑩ 顶层 isoSectionTruth / inlineCompositeRows（实时形态）也能解析', () => {
      const input = {
        isoSectionTruth: { sections: [{ id: '2:8023', entryCount: 3 }] },
        inlineCompositeRows: [{ id: '2:8023', members: ['a', 'b', 'c'] }],
      };
      expect(resolveRepeatEvidence(input, sec)).toEqual({ isoEntryCount: 3, inlineMembers: 3 });
    });

    it('⑪ 只匹配段自身 id，不被 sourceNodeIds 子树闭包误命中（收窄防误伤）', () => {
      const input = {
        inlineCompositeRows: [{ id: '136:127', members: ['a', 'b', 'c'] }],
        isoSectionTruth: { sections: [{ id: '2:8066', entryCount: 5 }] },
      };
      const wide = {
        id: '2:8023',
        sourceNodeIds: ['136:127', '2:8066', '2:8023', '136:129'],
      };
      expect(resolveRepeatEvidence(input, wide)).toEqual({ isoEntryCount: 0, inlineMembers: 0 });
    });

    it('⑫ id 不匹配 / 无证据 / 缺参 → 返回 0（零漂移）', () => {
      expect(resolveRepeatEvidence({}, sec)).toEqual({ isoEntryCount: 0, inlineMembers: 0 });
      expect(resolveRepeatEvidence(null, sec)).toEqual({ isoEntryCount: 0, inlineMembers: 0 });
      expect(resolveRepeatEvidence({ inlineCompositeRows: [{ id: 'other', members: ['a', 'b'] }] }, sec)).toEqual({ isoEntryCount: 0, inlineMembers: 0 });
      expect(resolveRepeatEvidence({}, {})).toEqual({ isoEntryCount: 0, inlineMembers: 0 });
    });

    it('⑬ 多个候选证据取最大值，members 非数组不算', () => {
      const input = {
        isoSectionTruth: { sections: [{ id: '2:8023', entryCount: 2 }, { id: '2:8023', entryCount: 3 }] },
        inlineCompositeRows: [{ id: '2:8023', members: null }, { id: '2:8023', members: ['a', 'b', 'c', 'd'] }],
      };
      expect(resolveRepeatEvidence(input, sec)).toEqual({ isoEntryCount: 3, inlineMembers: 4 });
    });
  });

  // 集成（resolveSectionScopeFacts mode 翻转）见 Node ESM 离线探针：
  //   node --input-type=module ... 直接 import prompt-builder.js 跑三种场景。
});
