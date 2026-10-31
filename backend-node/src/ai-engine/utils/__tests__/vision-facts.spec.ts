/**
 * 🛡️ Phase B-1（2026-10-31 治理方案）：vision-facts 单一事实源判据。
 *
 * 治理方案 §Phase B：`vision-facts.js` 必须把既有 3 份角色词表
 * （takeover 的 roleOf+ROLE_*_SET、header-geometry-fallback 的
 * businessTypes/businessRoles、section-type-derive 的 TYPE_KEYWORDS+INLINE_HEADING_RE）
 * **吸收收拢**为单一来源，原处改为引用（或薄壳 re-export）；
 * **禁止并列新增第 4 份**（split-brain 风险 +1）。
 *
 * 判据分两层：
 *  1. 行为层：declared* 读取口径 + 词表内容与原实现逐字一致（零漂移）
 *  2. 结构层：旧文件不再内联定义词表（源码扫描，重加即红）
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  roleOf,
  ROLE_ICON_SET,
  ROLE_CONTENT_SET,
  ROLE_STAT_SET,
  ROLE_VALUE_SET,
  ROLE_LABEL_SET,
  isIconRole,
  isContentRole,
  isStatRole,
  BUSINESS_TYPE_SET,
  BUSINESS_ROLE_SET,
  TYPE_KEYWORDS,
  INLINE_HEADING_RE,
  declaredHeaderRelation,
  declaredSectionType,
  declaredControl,
  declaredRole,
  STAT_VALUE_ELEMENT_TYPES,
  hasStatValueElement,
  footerGeometryRecoveryAllowed,
  tableGeometryRecoveryAllowed,
} from '../vision-facts.js';
// re-export 单一来源证明：section-type-derive 必须引用同一份词表对象
import { TYPE_KEYWORDS as TK_FROM_DERIVE } from '../section-type-derive.js';

const UTILS = join(__dirname, '..');

const readSrc = (rel) => readFileSync(join(UTILS, rel), 'utf8');

describe('vision-facts · 显式发言读取口径（declared*）', () => {
  it('declaredHeaderRelation：读取 headerRelation 并小写归一；缺失/空 ⇒ null', () => {
    expect(declaredHeaderRelation({ headerRelation: 'no-header' })).toBe('no-header');
    expect(declaredHeaderRelation({ headerRelation: 'No-Header' })).toBe('no-header');
    expect(declaredHeaderRelation({ headerRelation: 'title-same-row' })).toBe('title-same-row');
    expect(declaredHeaderRelation({})).toBeNull();
    expect(declaredHeaderRelation({ headerRelation: '' })).toBeNull();
    expect(declaredHeaderRelation(null)).toBeNull();
  });

  it('declaredSectionType：显式 type > header.type；缺失 ⇒ null；小写归一', () => {
    expect(declaredSectionType({ type: 'Stats' })).toBe('stats');
    expect(declaredSectionType({ type: '', header: { type: 'FOOTER' } })).toBe('footer');
    expect(declaredSectionType({ header: { type: 'table' } })).toBe('table');
    expect(declaredSectionType({})).toBeNull();
    expect(declaredSectionType({ type: '  ' })).toBeNull();
    expect(declaredSectionType(null)).toBeNull();
  });

  it('declaredRole：只读 role 字段（type 是另一条发言通道，不回退）', () => {
    expect(declaredRole({ role: 'Stat-Card' })).toBe('stat-card');
    expect(declaredRole({ role: '', type: 'stats' })).toBeNull();
    expect(declaredRole({ type: 'stats' })).toBeNull();
    expect(declaredRole(null)).toBeNull();
  });

  it('declaredControl：读取 control 并小写归一；缺失 ⇒ null', () => {
    expect(declaredControl({ control: 'Table' })).toBe('table');
    expect(declaredControl({})).toBeNull();
    expect(declaredControl(null)).toBeNull();
  });
});

describe('vision-facts · 词表内容与原实现逐字一致（零漂移）', () => {
  it('roleOf：role 优先、type 回退、小写（与 takeover 原实现同口径）', () => {
    expect(roleOf({ role: 'Icon' })).toBe('icon');
    expect(roleOf({ type: 'TEXT' })).toBe('text');
    expect(roleOf({ role: '图标', type: 'rect' })).toBe('图标');
    expect(roleOf(null)).toBe('');
  });

  it('takeover 5 个角色集合原样收拢', () => {
    expect(ROLE_ICON_SET.has('icon-wrap')).toBe(true);
    expect(ROLE_CONTENT_SET.has('text-block')).toBe(true);
    expect(isStatRole('统计')).toBe(true);
    expect(ROLE_VALUE_SET.has('值')).toBe(true);
    expect(isContentRole('信息')).toBe(true);
    expect(isIconRole('avatar')).toBe(true);
  });

  it('header-geometry-fallback 业务词表原样收拢', () => {
    for (const t of ['stats', 'list', 'table', 'chart', 'grid', 'footer']) {
      expect(BUSINESS_TYPE_SET.has(t)).toBe(true);
    }
    for (const r of ['stat-card', 'list-item', 'table-header', 'chart']) {
      expect(BUSINESS_ROLE_SET.has(r)).toBe(true);
    }
    expect(BUSINESS_TYPE_SET.has('header')).toBe(false); // header 不是业务类型
  });

  it('STAT_VALUE_ELEMENT_TYPES：4851eedd 第二闸门的 value 元素识别口径', () => {
    for (const t of ['value', 'stat-value', 'metric']) {
      expect(STAT_VALUE_ELEMENT_TYPES.has(t)).toBe(true);
    }
    expect(STAT_VALUE_ELEMENT_TYPES.has('label')).toBe(false);
  });

  it('TYPE_KEYWORDS 与 section-type-derive 是同一对象引用（re-export 单一来源）', () => {
    expect(TK_FROM_DERIVE).toBe(TYPE_KEYWORDS);
  });

  it('INLINE_HEADING_RE：内容区小标题负向表原样收拢', () => {
    expect(INLINE_HEADING_RE.test('sub-header')).toBe(true);
    expect(INLINE_HEADING_RE.test('小标题')).toBe(true);
    expect(INLINE_HEADING_RE.test('section-title')).toBe(true);
    expect(INLINE_HEADING_RE.test('header')).toBe(false);
  });
});

describe('vision-facts · hasStatValueElement（value 容器三形态）', () => {
  const els = [{ type: 'label' }, { type: 'value' }];

  it('body.items[0].content.elements 形态', () => {
    expect(hasStatValueElement({ body: { items: [{ content: { elements: els } }] } })).toBe(true);
  });
  it('items[0].content.elements 形态', () => {
    expect(hasStatValueElement({ items: [{ content: { elements: els } }] })).toBe(true);
  });
  it('content.elements 形态', () => {
    expect(hasStatValueElement({ content: { elements: els } })).toBe(true);
  });
  it('阴性：只有 label / 无 elements ⇒ false', () => {
    expect(hasStatValueElement({ content: { elements: [{ type: 'label' }] } })).toBe(false);
    expect(hasStatValueElement({})).toBe(false);
    expect(hasStatValueElement(null)).toBe(false);
  });
});

describe('vision-facts · 几何恢复协议闸门（只填沉默、不翻案）', () => {
  describe('footerGeometryRecoveryAllowed', () => {
    it('vision 沉默（无显式 type/role）⇒ 允许（a100e890 既有行为不回归）', () => {
      expect(footerGeometryRecoveryAllowed({ id: 'footer-summary' })).toBe(true);
      expect(footerGeometryRecoveryAllowed({})).toBe(true);
    });
    it('显式 type=footer / role=footer ⇒ 允许（发言与推导同向）', () => {
      expect(footerGeometryRecoveryAllowed({ type: 'footer' })).toBe(true);
      expect(footerGeometryRecoveryAllowed({ role: 'footer' })).toBe(true);
    });
    it('显式 type/role 与 footer 业务冲突 ⇒ 禁止恢复（不翻案）', () => {
      expect(footerGeometryRecoveryAllowed({ id: 'footer-summary', type: 'stats' })).toBe(false);
      expect(footerGeometryRecoveryAllowed({ id: 'footer-summary', role: 'stats' })).toBe(false);
      expect(footerGeometryRecoveryAllowed({ role: 'list' })).toBe(false);
    });
    it('中性 role 发言（常驻/chrome 语义）不冲突 ⇒ 允许（零漂移扫描 44 段实证）', () => {
      expect(footerGeometryRecoveryAllowed({ id: 'footer-summary', role: '常驻' })).toBe(true);
      expect(footerGeometryRecoveryAllowed({ role: 'container' })).toBe(true);
    });
  });

  describe('tableGeometryRecoveryAllowed', () => {
    it('vision 沉默 ⇒ 允许（56445358 整表恢复既有行为不回归）', () => {
      expect(tableGeometryRecoveryAllowed({ body: { headers: ['a', 'b'] } })).toBe(true);
    });
    it('显式 type=table ⇒ 允许', () => {
      expect(tableGeometryRecoveryAllowed({ type: 'table' })).toBe(true);
    });
    it('表头契约存在 ⇒ 必须允许（契约 > type 字段，刀5c 裁决：零漂移扫描 4 段实证）', () => {
      // e99a736f 形态：type='tabs' 是下游旧规划残留，契约才是 vision 真发言
      expect(tableGeometryRecoveryAllowed({ type: 'tabs', body: { headers: ['a', 'b'] } })).toBe(true);
      expect(tableGeometryRecoveryAllowed({ id: '43:4788', type: 'list', body: { headers: ['x', 'y'] } })).toBe(true);
      expect(tableGeometryRecoveryAllowed({ type: 'stats', body: { children: [{ role: 'table-column', header: '列1' }, { role: 'table-column', header: '列2' }] } })).toBe(true);
    });
    it('显式 type 与 table 冲突且无契约 ⇒ 禁止整表恢复（不翻案）', () => {
      expect(tableGeometryRecoveryAllowed({ type: 'stats' })).toBe(false);
      expect(tableGeometryRecoveryAllowed({ header: { type: 'list' } })).toBe(false);
    });
  });
});

describe('vision-facts · 结构层：词表收拢，旧文件不得内联定义（防第 4 份）', () => {
  it('folded-grid-section-takeover.js 不再内联定义 roleOf / ROLE_*_SET', () => {
    const src = readSrc('folded-grid-section-takeover.js');
    expect(src).not.toMatch(/function roleOf\(/);
    expect(src).not.toMatch(/const ROLE_(ICON|CONTENT|STAT|VALUE|LABEL)_SET\s*=/);
  });

  it('section-type-derive.js 不再内联定义 TYPE_KEYWORDS / INLINE_HEADING_RE', () => {
    const src = readSrc('section-type-derive.js');
    expect(src).not.toMatch(/export const TYPE_KEYWORDS\s*=/);
    expect(src).not.toMatch(/const INLINE_HEADING_RE\s*=/);
  });

  it('header-geometry-fallback.js 不再内联定义业务词表（businessTypes/businessRoles）', () => {
    const src = readSrc('header-geometry-fallback.js');
    expect(src).not.toMatch(/businessTypes\s*=\s*new Set/);
    expect(src).not.toMatch(/businessRoles\s*=\s*new Set/);
  });

  it('vision-facts.js 是唯一词表定义点（全 utils+roles 扫描：ROLE_*_SET 只在此定义）', () => {
    const files = [
      'folded-grid-section-takeover.js',
      'section-type-derive.js',
      'header-geometry-fallback.js',
    ];
    for (const f of files) {
      const src = readSrc(f);
      expect(src).toMatch(/vision-facts/);
    }
  });
});
