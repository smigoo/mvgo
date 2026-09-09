/**
 * 规范注册表自检脚本（开发期验证用，可随时删除）
 * 运行：node src/ai-engine-v2/specs/__verify.mjs
 */
import fs from 'fs'
import path from 'path'
import os from 'os'

import * as r from './spec-registry.js'
import * as pr from './prompt-resolver.js'
import { loadSkillPackage } from './skill-loader.js'

console.log('=== 1. ESM 双源加载 ===')
const res = r.loadSpecRegistry()
console.log('全部:', res.specs)
console.log('内置:', res.builtin, '| 用户:', res.user)
console.log('告警:', res.warnings.length ? res.warnings : '(无)')

console.log('\n=== 2. baseSpec 继承链 ===')
const team = r.resolveSpec('example-team-vue3')
console.log('  inheritedFrom      =', team.__inheritedFrom)
console.log('  binding.mode       =', team.binding.mode, '(继承 vue3-js)')
console.log('  naming.componentDir=', team.naming.componentDir, '(子覆盖)')
console.log('  naming.idPrefix    =', team.naming.idPrefix, '(子新增)')
console.log('  style.useCssVariables =', team.style.useCssVariables, '(子覆盖)')
console.log('  style.scoped       =', team.style.scoped, '(继承保留)')

console.log('\n=== 3. 注入覆盖率自检 ===')
const audit = r.auditRegistry()
console.log('  全局 ok =', audit.ok)
for (const x of audit.reports) {
  console.log(
    '  [' + x.specId + '] docs=' + x.totalDocs +
    ' 覆盖节点=' + x.coveredNodes.length + '/5' +
    ' 缺失文件=' + x.missingFiles.length +
    ' 未知节点=' + x.unknownNodes.length
  )
  for (const m of x.missingFiles) console.log('     x', m.node, m.ref, m.reason)
}

console.log('\n=== 4. 节点级 prompt 装配 ===')
for (const id of r.listSpecIds()) {
  const s = r.resolveSpec(id)
  const p = pr.resolveNodePrompt(s, 'code-engineer')
  console.log('  ' + id.padEnd(18) + p.docs.length + ' 份 / ' + p.text.length + ' 字符 / warn=' + p.warnings.length)
}

console.log('\n=== 5. listSpecs（配置页下拉数据）===')
for (const s of r.listSpecs()) {
  console.log('  ' + JSON.stringify(s))
}

console.log('\n=== 6. 安全对抗测试 ===')
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'v2spec-'))
const mk = (name, files) => {
  const d = path.join(T, name)
  fs.mkdirSync(d, { recursive: true })
  for (const [f, c] of Object.entries(files)) {
    const fp = path.join(d, f)
    fs.mkdirSync(path.dirname(fp), { recursive: true })
    fs.writeFileSync(fp, c)
  }
  return d
}
const cases = [
  ['可执行 .sh', mk('c1', { 'skill.json': '{"id":"c1","label":"x","version":"1.0.0"}', 'evil.sh': 'rm -rf /' })],
  ['examples 外 .js', mk('c2', { 'skill.json': '{"id":"c2","label":"x","version":"1.0.0"}', 'hook.js': 'x' })],
  ['engineerClass 越权', mk('c3', { 'skill.json': '{"id":"c3","label":"x","version":"1.0.0","engineerClass":"Evil"}' })],
  ['promptInjection 穿越', mk('c4', { 'skill.json': '{"id":"c4","label":"x","version":"1.0.0","promptInjection":{"code-engineer":["../../etc/passwd"]}}' })],
  ['非法 id（大写）', mk('c5', { 'skill.json': '{"id":"BadID","label":"x","version":"1.0.0"}' })],
  ['缺 skill.json', mk('c6', { 'readme.md': 'x' })],
  ['合法包', mk('c7', { 'skill.json': '{"id":"c7","label":"ok","version":"1.0.0","baseSpec":"vue3-js"}', 'examples/good.vue': '<template/>' })]
]
for (const [desc, dir] of cases) {
  try {
    const s = loadSkillPackage(dir)
    console.log('  放行  ' + desc.padEnd(22) + ' -> id=' + s.id + ' files=' + s.__fileCount)
  } catch (e) {
    console.log('  拦截  ' + desc.padEnd(22) + ' -> ' + e.message.replace(/\n\s*/g, ' ').slice(0, 72))
  }
}
fs.rmSync(T, { recursive: true, force: true })

console.log('\n完成。')
