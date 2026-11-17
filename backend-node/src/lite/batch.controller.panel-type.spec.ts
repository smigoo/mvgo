import 'reflect-metadata';
import { buildBatchPhase2Dto } from './batch-phase2-dto.util';

describe('buildBatchPhase2Dto panelType propagation', () => {
  const parsed = { fileKey: 'file-key', nodeId: 'node-id' };

  it('preserves aio-panel for batch Max generation', () => {
    const dto = buildBatchPhase2Dto(
      {
        figmaUrl: 'https://www.figma.com/design/file-key/demo?node-id=1-2',
        componentName: 'traffic-panel',
        componentType: 'microcode',
        generationTier: 'max',
        panelType: 'aio-panel',
      },
      'mc-max-test',
      parsed,
      'private-group',
    );

    expect(dto.panelType).toBe('aio-panel');
    expect(dto.target).toBe('microcode');
  });

  it('keeps the DTO compatibility default when no panel is supplied', () => {
    const dto = buildBatchPhase2Dto(
      {
        figmaUrl: 'https://www.figma.com/design/file-key/demo?node-id=1-2',
        componentName: 'traffic-panel',
        componentType: 'vue3',
        generationTier: 'max',
      },
      'mv-max-test',
      parsed,
      'private-group',
    );

    expect(dto.panelType).toBe('default-panel');
  });
});
