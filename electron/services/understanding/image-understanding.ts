import type { AssetType, ImageUnderstandingReport, RightsStatus } from '../../../src/shared/types';

export type UnderstandingSuggestion = {
  category: 'person' | 'wardrobe' | 'pose' | 'scene' | 'lighting' | 'camera' | 'style' | 'text' | 'risk';
  value: string;
  confidence: number;
  evidence: 'model' | 'user' | 'file';
  editable: true;
};

export const createImageSuggestions = (input: { type: AssetType; rightsStatus: RightsStatus; width?: number; height?: number }): UnderstandingSuggestion[] => {
  const suggestions: UnderstandingSuggestion[] = [];
  if (input.type === 'reference_image' || input.type === 'character') {
    suggestions.push({ category: 'person', value: '可作为人物身份或体态参考', confidence: 0.7, evidence: 'file', editable: true });
  }
  if (input.type === 'wardrobe') {
    suggestions.push({ category: 'wardrobe', value: '可作为服装参考', confidence: 0.8, evidence: 'user', editable: true });
  }
  if (input.type === 'scene') {
    suggestions.push({ category: 'scene', value: '可作为场景参考', confidence: 0.8, evidence: 'user', editable: true });
  }
  if (input.width && input.height) {
    suggestions.push({
      category: 'camera',
      value: input.width >= input.height ? '横向画幅' : '纵向画幅',
      confidence: 1,
      evidence: 'file',
      editable: true
    });
  }
  suggestions.push({
    category: 'risk',
    value: input.rightsStatus === 'authorized' ? '已标记为用户授权素材' : input.rightsStatus === 'original' ? '已标记为原创素材' : '使用权限待确认',
    confidence: 1,
    evidence: 'user',
    editable: true
  });
  return suggestions;
};

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const list = (value: unknown) => Array.isArray(value) ? value.map(text).filter(Boolean).slice(0, 12) : [];

const emptyReport = (rawResponse: string): ImageUnderstandingReport => ({
  subject: '', identityAnchor: '', bodyAndWardrobe: '', expressionAndPose: '', scene: '', lighting: '', camera: '', style: '',
  continuityLocks: [], risks: [], editablePrompt: '', rawResponse
});

/** 将模型的严格 JSON 输出转成工作台可编辑的稳定字段；模型失格式时仍保留原文供人工使用。 */
export const parseImageUnderstanding = (rawResponse: string): ImageUnderstandingReport => {
  const raw = rawResponse.trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? raw.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return { ...emptyReport(raw), editablePrompt: raw };
  try {
    const payload = JSON.parse(candidate) as Record<string, unknown>;
    return {
      subject: text(payload.subject),
      identityAnchor: text(payload.identityAnchor),
      bodyAndWardrobe: text(payload.bodyAndWardrobe),
      expressionAndPose: text(payload.expressionAndPose),
      scene: text(payload.scene),
      lighting: text(payload.lighting),
      camera: text(payload.camera),
      style: text(payload.style),
      continuityLocks: list(payload.continuityLocks),
      risks: list(payload.risks),
      editablePrompt: text(payload.editablePrompt),
      rawResponse: raw
    };
  } catch {
    return { ...emptyReport(raw), editablePrompt: raw };
  }
};
