import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { extractGoldenManifest } from '../utils/figma-golden-extractor.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureBase = path.resolve(here, '../../fixtures/0907')
const outDir = path.resolve('/Users/smigoo/工作/mvgo/docs/golden-manifests')
fs.mkdirSync(outDir, { recursive: true })

const samples = ['device', 'env', 'traffic']

const report = []
for (const s of samples) {
  const figmaNodeData = JSON.parse(fs.readFileSync(path.join(fixtureBase, s, 'figma-node-data.json'), 'utf8'))
  const resourceDomMapping = JSON.parse(fs.readFileSync(path.join(fixtureBase, s, 'resource-dom-mapping.json'), 'utf8'))
  const golden = extractGoldenManifest({
    figmaNodeData,
    resourceDomMapping,
    meta: { sample: s, fileKey: figmaNodeData.fileKey, nodeId: figmaNodeData.nodeId },
  })
  // 落盘（不含内部 _ownerProvenance 等易变字段，这里整份落，含 provenance 供审阅）
  const outFile = path.join(outDir, `${s}.json`)
  fs.writeFileSync(outFile, JSON.stringify(golden, null, 2), 'utf8')
  const p = golden.golden.provenance
  report.push({
    sample: s,
    file: `${s}.json`,
    hash: golden.golden.hash,
    sections: golden.sectionOrder.length,
    panel: golden.panel.length,
    unassigned: golden.unassigned.length,
    resources: golden.resources.length,
    treeHits: p.treeHits,
    fallbacks: p.fallbacks,
    nodeMissing: p.nodeMissing.length,
    structural: golden.golden.structural.length,
  })
}

console.log('Golden Manifest 已锁定：')
for (const r of report) {
  console.log(`  ${r.sample.padEnd(8)} hash=${r.hash} sections=${r.sections} panel=${r.panel} unassigned=${r.unassigned} resources=${r.resources} treeHits=${r.treeHits} fallbacks=${r.fallbacks} nodeMissing=${r.nodeMissing} structural=${r.structural}`)
}
console.log(`\n输出目录：${outDir}`)
