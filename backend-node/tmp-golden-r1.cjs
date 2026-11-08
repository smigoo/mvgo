const fs = require('fs');
const path = require('path');
const base =
  '/Users/smigoo/工作/mvgo/temp-components/6a51f7caed28c5d5b13c61a5/mc-max-1794114472183-b79b1ed8';
const shadow = JSON.parse(fs.readFileSync(path.join(base, '.checkpoint/context-shadow.json'), 'utf8'));
const figma = JSON.parse(fs.readFileSync(path.join(base, '.checkpoint/figma.json'), 'utf8'));
const { buildDeterministicIndexTemplate } = require(
  '/Users/smigoo/工作/mvgo/backend-node/dist/ai-engine/roles/microcode/code-generator.js',
);

const input = {
  componentName: 'device-monitor',
  panelType: 'default-panel',
  generationInput: shadow.generationInput,
  figmaNodeData: figma,
};

const det = buildDeterministicIndexTemplate(input, {});
if (!det) {
  console.log('DET_NULL');
  process.exit(0);
}
console.log('rootContainerClass=', det.rootContainerClass);
console.log('sectionRoots=', JSON.stringify(det.sectionRoots));
console.log('componentFiles=', JSON.stringify(det.componentFiles));
console.log('--- template ---');
console.log(det.template);
