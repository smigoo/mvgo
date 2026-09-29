/**
 * A-①b 微取证：healStyleContent 是否漏了「<style ...> 与声明共行」的形态？
 * 只读，用 dist 真实函数。
 *
 * 用法：env -i PATH=... HOME=... node .tmp-heal-style-probe.js
 */
const { healFileLevelSlotOverrides, collectFileLevelSlotOverrides } =
  require('./dist/ai-engine/utils/theme-color-guard.js');

const CASES = {
  '共行（注入器产出的真实形态）': `<template>\n  <div/>\n</template>\n\n<style lang="less" scoped>@color-text-base: #333333;\n@fontSize: var(--fontSize);\n.c-x { color: @color-text-base; }\n</style>\n`,
  '换行（人写形态）': `<template>\n  <div/>\n</template>\n\n<style lang="less" scoped>\n@color-text-base: #333333;\n@fontSize: var(--fontSize);\n.c-x { color: @color-text-base; }\n</style>\n`,
  '独立 .less': `@color-text-base: #333333;\n.c-x { color: @color-text-base; }\n`,
  '共行 + 块内（depth>0，不应删）': `<style lang="less" scoped>\n.c-x {\n  @color-text-base: #333333;\n}\n</style>\n`,
};

for (const [name, content] of Object.entries(CASES)) {
  const files = [{ path: name.endsWith('.less') ? 'resources/styles/common.less' : 'package/components/X.vue', content }];
  const detected = collectFileLevelSlotOverrides(files).length;
  const r = healFileLevelSlotOverrides(files);
  const after = collectFileLevelSlotOverrides(files).length;
  console.log(`${name}`);
  console.log(`   命中 ${detected} → 自愈 removed=${r.removed}, changed=${r.changed} → 自愈后仍命中 ${after}`);
}
