/**
 * 🛡️ Loop 2.1.A（2026-09-10）：把 inlineCompositeRows 真正合并进 layout.sections。
 *
 * 旧行为：`rebuildSectionsPreservingInlineRows` 只把同行兄弟挂在
 * `parsed.inlineCompositeRows` 旁路字段，layout.sections 仍是 Vision 误拆的竖排——
 * 下游 planner/engineer 不读旁路字段，结构纠正在写盘前就丢了。
 *
 * 新行为：把每个同行复合 group 作为一个 `layout:'horizontal'` 的 block 并入 sections，
 * 其 children 为 members（按 x 升序还原左右顺序）；标记 `layoutSource:'inline-row'`
 * 供下游优先采用 bbox 推导的 horizontal 行。原业务 sections 全部保留，不删不改。
 *
 * 纯函数、零依赖、无 import.meta，便于 jest（CJS require）直接单测。
 *
 * @param {object} layout - { type, direction, sections:[] }
 * @param {Array} inlineRows - rebuildSectionsPreservingInlineRows 产出
 *        [{ id, name, layout:'horizontal', members:[figmaNodeId,...] }]
 * @returns {object} 新的 layout（不修改入参）
 */
export function mergeInlineRowsIntoSections(layout, inlineRows) {
  if (!layout || typeof layout !== 'object') return layout
  const sections = Array.isArray(layout.sections) ? layout.sections : []
  if (!Array.isArray(inlineRows) || inlineRows.length === 0) {
    return { ...layout, sections: sections.slice() }
  }

  const merged = sections.slice()
  for (const row of inlineRows) {
    if (!row || !Array.isArray(row.members) || row.members.length < 2) continue
    // 同一行已存在于 sections（id 命中）则跳过，避免重复追加
    if (merged.some((s) => s && s.id === row.id)) continue
    const children = row.members.map((m, i) => ({
      id: `${row.id}-m${i + 1}`,
      name: String(m),
      role: 'item',
      figmaNode: m,
    }))
    merged.push({
      id: row.id,
      name: row.name || 'inline-row',
      role: 'inline-row',
      layout: 'horizontal',
      layoutSource: 'inline-row',
      figmaNodeId: row.id,
      // 顶层 children：供结构断言 / planner 直接消费
      children,
      header: { title: row.name || 'inline-row' },
      // body.children：向下游 extractElements(_extractElements) 兼容（读 body.children）
      body: { layout: 'horizontal', children },
    })
  }
  return { ...layout, sections: merged }
}
