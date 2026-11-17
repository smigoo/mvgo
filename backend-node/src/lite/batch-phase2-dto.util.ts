import { GeneratePhase2Dto } from '../phase2/dto/generate-phase2.dto';

export interface BatchPhase2Item {
  componentName?: string;
  componentType?: string;
  panelType?: string;
  previewToken?: string;
}

export function buildBatchPhase2Dto(
  item: BatchPhase2Item,
  sessionId: string,
  parsed: { fileKey: string; nodeId: string },
  groupId: string,
): GeneratePhase2Dto {
  const phase2Dto = new GeneratePhase2Dto();
  phase2Dto.componentName = item.componentName || sessionId;
  phase2Dto.componentId = sessionId;
  phase2Dto.fileKey = parsed.fileKey;
  phase2Dto.nodeId = parsed.nodeId;
  phase2Dto.groupId = groupId;
  phase2Dto.target = item.componentType || 'vue3';
  phase2Dto.previewToken = item.previewToken;
  if (item.panelType !== undefined) {
    phase2Dto.panelType = item.panelType;
  }
  return phase2Dto;
}
